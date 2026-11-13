// Test-control API (NFR-MNT-005, DEC-B54). Registered only when TEST_CONTROL_SECRET is set, which config
// refuses in production. Every route requires the secret in the x-test-control-secret header.
// It serves the E2E fixtures in e2e/api/support/fixtures.ts.
import { timingSafeEqual } from 'node:crypto';
import { Writable } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { v7 as uuidv7 } from 'uuid';
import { z } from 'zod';
import { loginIdKey } from '@hifz/contracts';
import type { Clock } from '../platform/clock.ts';
import type { Db } from '../platform/db.ts';
import { AppError, parse } from '../platform/errors.ts';
import type { MemoryMailer } from '../platform/mailer.ts';
import { auditFaults } from '../modules/audit/audit.ts';
import { decryptSecret, encryptSecret } from '../modules/identity/secrets.ts';
import type { OrganizationService } from '../modules/organization/organization-service.ts';
import type { SyncControl } from '../modules/sync/control-state.ts';
import type { SyncRegistry } from '../modules/sync/handler.ts';
import { newTotpSecret, totpForStep, totpStep } from '../modules/identity/totp.ts';
import { TEST_PASSWORD, classes as fixtureClasses, madaris, students as fixtureStudents } from '../../../../e2e/fixtures/personas.ts';
import { seedPersonas } from './seed.ts';
import { parseSeed, SeedRejectedError, type QuranSeedLoader } from '../modules/quran-ref/seed.ts';
import { QuranSourceRegistry } from '../modules/quran-ref/sources.ts';
import { convertSources, type ValidationReport } from '../modules/quran-ref/converter/convert.ts';
import { signDataset, SignRefusedError } from '../modules/quran-ref/converter/sign.ts';
import { syntheticFiles, syntheticManifest, syntheticSources } from '../modules/quran-ref/converter/synthetic-sources.ts';
import type { QuranSeedV2 } from '@hifz/domain/quran-ref';
// Synthetic, test-only Quran fixture (never real metadata); this module is registered only when NODE_ENV=test.
import { syntheticSeed } from '@hifz/domain/quran-ref/synthetic-fixture';

/** Keeps every log line in memory so tests can prove secrets never reach the logs (F01-AC15). */
export class LogSink extends Writable {
  readonly lines: string[] = [];

  override _write(chunk: Buffer, _encoding: string, done: () => void): void {
    this.lines.push(chunk.toString('utf8'));
    done();
  }

  clear(): void {
    this.lines.length = 0;
  }
}

interface ControlDeps {
  secret: string;
  db: Db;
  clock: Clock;
  mailer: MemoryMailer;
  logSink: LogSink | undefined;
  totpKey: Buffer;
  organization: OrganizationService;
  /** F06: applies synthetic Quran seeds to a test madrasa (never real Quran data). */
  quranSeeds: QuranSeedLoader;
  sync: { control: SyncControl; registry: SyncRegistry };
}

/** Test-only control routes that carry a whole synthetic seed and report (F06). */
const QURAN_BODY_LIMIT = 32 * 1024 * 1024;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The platform operator's onboarding input (FR-ORG-001). Timezone, week start, and report mode are not accepted:
// a new workspace always starts from the defaults (F02-AC1).
const NewWorkspaceInput = z.strictObject({
  kind: z.enum(['INDIVIDUAL', 'MADRASA']).default('MADRASA'),
  name: z.string().max(100),
  code: z.string().regex(/^[A-Za-z0-9]{2,12}$/),
  owner: z.strictObject({
    loginId: z.string().max(32),
    displayName: z.string().min(1).max(100).default('Test Owner'),
    email: z.email().nullable().default(null),
    password: z.string().max(64).default(TEST_PASSWORD),
  }),
  /** Enroll an authenticator now, so E2E fixtures can sign in; a real Owner sets it up at first sign-in. */
  twoFactor: z.boolean().default(true),
});

const TABLES = [
  // F06 Quran reference tables (mushaf_editions is a global catalogue and is not reset).
  'quran_reference_snapshots',
  'mushaf_layout_lines',
  'mushaf_layouts',
  'quran_paras',
  'quran_surahs',
  'quran_import_sources',
  'quran_imports',
  // The source catalogue is global; tests register synthetic sources only, so a reset clears it.
  'quran_source_licences',
  'quran_sources',
  // F04 calendar tables (attendance_records is reset through its sync handler's tables).
  'calendar_exceptions',
  'class_schedules',
  // F03 roster tables (row-level security as for the sync tables below).
  'student_enrollments',
  'students',
  'class_teachers',
  'classes',
  // F12 sync tables (RLS applies to them; the embedded test database connects as a superuser, which bypasses it).
  'sync_conflicts',
  'change_log',
  'scope_changes',
  'sync_ops',
  'audit_logs',
  'recovery_codes',
  'user_totp',
  'login_locks',
  'login_failures',
  'password_reset_otps',
  'sessions',
  'memberships',
  'users',
  'organizations',
] as const;

export function registerTestControl(app: FastifyInstance, deps: ControlDeps): void {
  const expected = Buffer.from(deps.secret);
  // Tables of test-registered sync handlers (e.g. sync_probe) are reset and searched with the rest.
  const tables = (): string[] => [...deps.sync.registry.tables(), ...TABLES];

  const userIdOf = async (loginId: string): Promise<string> => {
    const row = await deps.db
      .selectFrom('users')
      .select('id')
      .where((eb) => eb(eb.fn('lower', ['login_id']), '=', loginIdKey(loginId)))
      .executeTakeFirst();
    if (!row) throw new AppError('NOT_FOUND');
    return row.id;
  };

  const sentTo = (loginId: string) => deps.mailer.sent.filter((m) => loginIdKey(m.meta.userId) === loginIdKey(loginId));

  app.register(
    async (scope) => {
      scope.addHook('onRequest', async (request) => {
        const given = Buffer.from(String(request.headers['x-test-control-secret'] ?? ''));
        if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new AppError('NOT_FOUND');
      });

      scope.post('/reset', async () => {
        await sql.raw(`TRUNCATE ${tables().join(', ')} RESTART IDENTITY`).execute(deps.db);
        deps.sync.control.reset();
        deps.clock.reset();
        deps.mailer.clear();
        deps.logSink?.clear();
        auditFaults.failNext = false;
        await seedPersonas(deps.db, deps.clock, deps.totpKey);
        return { status: 'reset' };
      });

      scope.post('/clock', async (request) => {
        const { advanceMs } = parse(z.object({ advanceMs: z.number().int().min(0) }), request.body);
        deps.clock.advance(advanceMs);
        return { now: deps.clock.now().toISOString() };
      });

      scope.get('/users/:loginId', async (request) => ({ id: await userIdOf((request.params as { loginId: string }).loginId) }));

      scope.get('/otp/:loginId', async (request) => {
        const sent = sentTo((request.params as { loginId: string }).loginId);
        return { otp: sent.at(-1)?.otp ?? null };
      });

      scope.get('/emails/:loginId', async (request) => {
        const sent = sentTo((request.params as { loginId: string }).loginId);
        return { count: sent.length, to: [...new Set(sent.map((m) => m.to))] };
      });

      // The platform operator creates a workspace and its first Owner (FR-ORG-001). Never a public route (F02-AC16).
      scope.post('/organizations', async (request, reply) => {
        const input = parse(NewWorkspaceInput, request.body);
        const created = await deps.organization.createWorkspace(input);
        if (input.twoFactor) {
          const now = deps.clock.now();
          await deps.db
            .insertInto('user_totp')
            .values({ user_id: created.ownerUserId, secret_encrypted: encryptSecret(deps.totpKey, newTotpSecret()), created_at: now, enabled_at: now, last_used_step: null })
            .execute();
        }
        return reply.status(201).send(created);
      });

      // The next audit write fails, so tests can prove the change rolls back with it (F02-AC13).
      scope.post('/audit/fail-next', async () => {
        auditFaults.failNext = true;
        return { status: 'armed' };
      });

      // Audit records about one target (an organization or a user), oldest first.
      scope.get('/audit-target/:id', async (request) => {
        const { id } = request.params as { id: string };
        if (!UUID.test(id)) throw new AppError('NOT_FOUND');
        const rows = await deps.db.selectFrom('audit_logs').selectAll().where('target_id', '=', id).orderBy('created_at').orderBy('id').execute();
        return { items: rows };
      });

      scope.get('/audit/:loginId', async (request) => {
        const id = await userIdOf((request.params as { loginId: string }).loginId);
        const rows = await deps.db.selectFrom('audit_logs').selectAll().where('target_id', '=', id).orderBy('created_at').execute();
        return { items: rows };
      });

      // A code the server will accept now. Codes cannot be reused, so after two sign-ins in one 30-second step
      // this moves the test clock to the next step instead of returning a code that would be refused.
      scope.get('/totp/:loginId', async (request) => {
        const id = await userIdOf((request.params as { loginId: string }).loginId);
        const row = await deps.db.selectFrom('user_totp').select(['secret_encrypted', 'last_used_step']).where('user_id', '=', id).executeTakeFirst();
        if (!row) throw new AppError('NOT_FOUND');
        const last = row.last_used_step === null ? -Infinity : Number(row.last_used_step);
        for (;;) {
          const current = totpStep(deps.clock.now().getTime());
          const step = [current, current + 1].find((s) => s > last);
          if (step !== undefined) return { code: totpForStep(decryptSecret(deps.totpKey, row.secret_encrypted), step) };
          deps.clock.advance(30_000);
        }
      });

      // ---------- F03 · Roster ----------

      // The ids of the seeded fixture classes and students, keyed as in e2e/fixtures/personas.ts (A1, S1, …).
      // F06: applies a SYNTHETIC Quran seed (default: the synthetic fixture; or a seed in the body) to the madrasa
      // with this code. The loader refuses anything not marked synthetic-or-approved, and synthetic only in tests.
      // A whole synthetic seed is larger than the default 1 MB body limit (test-only route; real seeds load from a file).
      scope.post('/quran/seed', { bodyLimit: QURAN_BODY_LIMIT }, async (request, reply) => {
        // `report`: the signed validation report that goes with a signed seed (DEC-B78); required for production seeds.
        const input = z.strictObject({ organizationCode: z.string(), seed: z.unknown().optional(), report: z.unknown().optional() }).parse(request.body ?? {});
        const org = await deps.db.selectFrom('organizations').select('id').where('code', '=', input.organizationCode).executeTakeFirst();
        if (!org) throw new AppError('NOT_FOUND');
        try {
          const seed = input.seed === undefined ? syntheticSeed() : parseSeed(input.seed);
          return await deps.quranSeeds.apply(org.id, seed, null, { report: input.report });
        } catch (error) {
          if (error instanceof SeedRejectedError) return reply.status(400).send({ issues: error.issues });
          throw error;
        }
      });

      // ---------- F06 · converter, sign step, and source catalogue (ADR-017; F06-AC20…AC27) ----------
      // SYNTHETIC SOURCES ONLY. The converter runs on the invented fixture (synthetic-sources.ts), never on real data.
      // `production: true` flags the converted dataset as production so tests can prove the gates: the values are
      // still synthetic, and they exist only in the throwaway E2E database, which every test resets.
      const quranSources = new QuranSourceRegistry(deps.db, deps.clock, { allowSynthetic: true });

      scope.post('/quran/convert', async (request) => {
        const input = z
          .strictObject({
            production: z.boolean().default(false),
            datasetVersion: z.string().max(40).default('1'),
            /** A named defect in the synthetic sources, to prove the converter refuses it. */
            defect: z.enum(['UNMAPPED_WORD_ID', 'LINE_SPANS_SURAHS', 'COVERAGE_GAP', 'HEADING_WITH_WORDS']).optional(),
          })
          .parse(request.body ?? {});
        const src = syntheticSources();
        const ayahRows = src.layout.filter((l) => l.line_type === 'ayah');
        if (input.defect === 'UNMAPPED_WORD_ID') ayahRows[5]!.last_word_id = 999_999;
        if (input.defect === 'LINE_SPANS_SURAHS') {
          const last = ayahRows.filter((l) => l.surah_number === 1).at(-1)!;
          last.last_word_id = (last.last_word_id as number) + 3;
        }
        if (input.defect === 'COVERAGE_GAP') src.layout.splice(src.layout.indexOf(ayahRows[3]!), 1);
        if (input.defect === 'HEADING_WITH_WORDS') src.layout.find((l) => l.line_type === 'surah_name')!.first_word_id = 1;
        const manifest = syntheticManifest({
          datasetVersion: input.datasetVersion,
          provenance: { sourceName: 'Synthetic test sources', sourceUrl: null, licence: 'Test data, not Quran metadata', synthetic: !input.production },
        });
        // Production-flagged runs cite their own provider, so the catalogue never mixes them up with test-data sources
        // registered for the same synthetic files (the loader refuses a production seed citing a test source).
        if (input.production) for (const f of Object.values(manifest.files)) f.provider = 'SYNTH_PROD';
        return convertSources(manifest, syntheticFiles(src), { now: deps.clock.now() });
      });

      scope.post('/quran/sign', { bodyLimit: QURAN_BODY_LIMIT }, async (request, reply) => {
        const input = z.strictObject({ seed: z.unknown(), report: z.unknown(), review: z.unknown() }).parse(request.body ?? {});
        try {
          return signDataset(input.seed as QuranSeedV2, input.report as ValidationReport, input.review);
        } catch (error) {
          if (error instanceof SignRefusedError) return reply.status(400).send({ reasons: error.reasons });
          throw error;
        }
      });

      scope.post('/quran/sources', async (request) => {
        const input = z
          .strictObject({
            provider: z.string(),
            resourceId: z.string().nullable(),
            category: z.string(),
            fileName: z.string(),
            fileSha256: z.string(),
            /** False only for the production-path tests; the file is still synthetic. */
            synthetic: z.boolean(),
          })
          .parse(request.body ?? {});
        return quranSources.register(
          {
            provider: input.provider,
            resourceName: `Synthetic test source (${input.resourceId ?? '-'})`,
            resourceId: input.resourceId,
            category: input.category,
            sourceUrl: 'https://example.invalid/synthetic',
            downloadUrl: null,
            downloadedOn: '2026-11-09',
            fileName: input.fileName,
            fileSha256: input.fileSha256,
            sourceVersion: null,
            notes: 'E2E test fixture, not a Quran dataset',
            registeredBy: 'E2E test',
          },
          { synthetic: input.synthetic },
        );
      });

      scope.post('/quran/sources/:id/licence', async (request) => {
        const { id } = z.object({ id: z.string().regex(UUID) }).parse(request.params);
        const { revokedVersions } = await quranSources.recordLicence(id, { recordedBy: 'E2E test', ...(request.body as object) });
        return { ok: true, revokedVersions };
      });

      // F08-AC4: a legacy attempt whose completed unit differs from the portion's assigned unit. Validation refuses this
      // on every write path today (FR-QTY-004); data from before the rule, or a future import, could still hold it, so
      // tests plant it directly (synthetic only) to prove nothing is converted and the portion is flagged for review.
      scope.post('/hifz/legacy-attempt', async (request) => {
        const input = parse(
          z.strictObject({
            lessonPortionId: z.uuid(),
            status: z.enum(['COMPLETED', 'PARTIAL', 'NOT_REMEMBERED', 'ABSENT', 'NOT_ASSIGNED', 'PENDING']),
            completed: z.strictObject({ unit: z.enum(['PARA', 'LINES', 'AYAT', 'PAGES']), numerator: z.number().int().min(0), denominator: z.number().int().min(1) }).nullable(),
          }),
          request.body,
        );
        const portion = await deps.db.selectFrom('lesson_portions').select(['organization_id', 'created_by']).where('id', '=', input.lessonPortionId).executeTakeFirst();
        if (!portion) throw new AppError('NOT_FOUND');
        const last = await deps.db.selectFrom('portion_attempts').select((eb) => eb.fn.max('attempt_no').as('n')).where('lesson_portion_id', '=', input.lessonPortionId).executeTakeFirst();
        const now = deps.clock.now();
        const id = uuidv7();
        await deps.db
          .insertInto('portion_attempts')
          .values({
            id,
            organization_id: portion.organization_id,
            lesson_portion_id: input.lessonPortionId,
            attempt_no: Number(last?.n ?? 0) + 1,
            attempted_at: now,
            recorded_by: portion.created_by,
            status: input.status,
            completed_unit: input.completed?.unit ?? null,
            completed_num: input.completed?.numerator ?? null,
            completed_den: input.completed?.denominator ?? null,
            quality: null,
            no_mistakes: false,
            remarks: null,
            created_at: now,
            updated_at: now,
            updated_by: portion.created_by,
            row_version: 1,
          })
          .execute();
        return { id };
      });

      scope.get('/roster/ids', async () => {
        const orgs = await deps.db.selectFrom('organizations').select(['id', 'code']).execute();
        const orgOf = (madrasa: keyof typeof madaris) => orgs.find((o) => o.code === madaris[madrasa].code)?.id ?? '';
        const classRows = await deps.db.selectFrom('classes').select(['id', 'organization_id', 'name']).where('status', '=', 'ACTIVE').execute();
        const studentRows = await deps.db.selectFrom('students').select(['id', 'organization_id', 'external_student_id']).execute();
        const classIds: Record<string, string> = {};
        for (const [key, c] of Object.entries(fixtureClasses)) {
          const row = classRows.find((r) => r.organization_id === orgOf(c.madrasa) && r.name === c.name);
          if (row) classIds[key] = row.id;
        }
        const studentIds: Record<string, string> = {};
        for (const [key, st] of Object.entries(fixtureStudents)) {
          const row = studentRows.find((r) => r.organization_id === orgOf(st.madrasa) && r.external_student_id === st.externalId);
          if (row) studentIds[key] = row.id;
        }
        return { classes: classIds, students: studentIds };
      });

      // ---------- F12 · Sync (plan §5 "Test control") ----------

      // Raises (or lowers) the oldest accepted sync protocol version (F12-AC15). Cleared by /reset.
      scope.post('/sync/min-protocol', async (request) => {
        const { version } = parse(z.strictObject({ version: z.number().int().min(1).max(1000) }), request.body);
        deps.sync.control.setMinProtocolVersion(version);
        return { minProtocolVersion: deps.sync.control.minProtocolVersion() };
      });

      // The next `count` push/pull requests fail with a temporary 5xx (F12-AC6). Cleared by /reset.
      scope.post('/sync/fail-next', async (request) => {
        const { count, status } = parse(
          z.strictObject({ count: z.number().int().min(0).max(100), status: z.number().int().min(500).max(599).default(503) }),
          request.body,
        );
        deps.sync.control.failNext(count, status);
        return { status: 'armed', count };
      });

      // The stored result of one operation, for E2E assertions (no fields: sync_ops never stores them).
      scope.get('/sync/ops/:opId', async (request) => {
        const { opId } = request.params as { opId: string };
        if (!UUID.test(opId)) throw new AppError('NOT_FOUND');
        const row = await deps.db
          .selectFrom('sync_ops')
          .select(['op_id', 'organization_id', 'user_id', 'device_id', 'entity', 'entity_id', 'status', 'result', 'received_at'])
          .where('op_id', '=', opId)
          .executeTakeFirst();
        if (!row) throw new AppError('NOT_FOUND');
        return {
          opId: row.op_id,
          organizationId: row.organization_id,
          userId: row.user_id,
          deviceId: row.device_id,
          entity: row.entity,
          entityId: row.entity_id,
          status: row.status,
          result: row.result,
          receivedAt: row.received_at.toISOString(),
        };
      });

      // Every conflict, oldest first, without the device/server field values.
      scope.get('/sync/conflicts', async () => {
        const rows = await deps.db
          .selectFrom('sync_conflicts')
          .select(['id', 'organization_id', 'entity', 'entity_id', 'status', 'conflict_fields', 'caused_by_user_id', 'op_id', 'resolved_by', 'base_version', 'server_version'])
          .orderBy('created_at')
          .orderBy('id')
          .execute();
        return {
          items: rows.map((r) => ({
            id: r.id,
            organizationId: r.organization_id,
            entity: r.entity,
            entityId: r.entity_id,
            status: r.status,
            conflictFields: r.conflict_fields,
            causedByUserId: r.caused_by_user_id,
            opId: r.op_id,
            resolvedBy: r.resolved_by,
            baseVersion: r.base_version === null ? null : Number(r.base_version),
            serverVersion: Number(r.server_version),
          })),
        };
      });

      // Counts occurrences of a string in every table and in the captured logs (F01-AC15).
      scope.post('/search', async (request) => {
        const { text } = parse(z.object({ text: z.string().min(4) }), request.body);
        let database = 0;
        for (const table of tables()) {
          const { rows } = await sql<{ n: string }>`SELECT count(*) AS n FROM ${sql.table(table)} t WHERE strpos(t::text, ${text}) > 0`.execute(deps.db);
          database += Number(rows[0]?.n ?? 0);
        }
        const logs = deps.logSink ? deps.logSink.lines.filter((line) => line.includes(text)).length : null;
        return { database, logs };
      });
    },
    { prefix: '/__test' },
  );
}

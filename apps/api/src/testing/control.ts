// Test-control API (NFR-MNT-005, DEC-B54). Registered only when TEST_CONTROL_SECRET is set, which config
// refuses in production. Every route requires the secret in the x-test-control-secret header.
// It serves the E2E fixtures in e2e/api/support/fixtures.ts.
import { timingSafeEqual } from 'node:crypto';
import { Writable } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import { loginIdKey } from '@hifz/contracts';
import type { Clock } from '../platform/clock.ts';
import type { Db } from '../platform/db.ts';
import { AppError, parse } from '../platform/errors.ts';
import type { MemoryMailer } from '../platform/mailer.ts';
import { auditFaults } from '../modules/audit/audit.ts';
import { decryptSecret, encryptSecret } from '../modules/identity/secrets.ts';
import type { OrganizationService } from '../modules/organization/organization-service.ts';
import { newTotpSecret, totpForStep, totpStep } from '../modules/identity/totp.ts';
import { TEST_PASSWORD } from '../../../../e2e/fixtures/personas.ts';
import { seedPersonas } from './seed.ts';

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
}

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
        await sql.raw(`TRUNCATE ${TABLES.join(', ')} RESTART IDENTITY`).execute(deps.db);
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

      // Counts occurrences of a string in every table and in the captured logs (F01-AC15).
      scope.post('/search', async (request) => {
        const { text } = parse(z.object({ text: z.string().min(4) }), request.body);
        let database = 0;
        for (const table of TABLES) {
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

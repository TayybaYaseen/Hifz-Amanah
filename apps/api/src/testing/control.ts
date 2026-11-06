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
import { decryptSecret } from '../modules/identity/secrets.ts';
import { totpForStep, totpStep } from '../modules/identity/totp.ts';
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
}

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

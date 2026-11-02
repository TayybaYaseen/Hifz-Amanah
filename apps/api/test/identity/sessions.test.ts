// F01 · Identity — integration against real Postgres (embedded, DEC-B68). docs/specs/01-f01-identity-authentication.md
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { TEST_PASSWORD } from '../../../../e2e/fixtures/personas.ts';
import { buildApp } from '../../src/app.ts';
import { Clock, MINUTE } from '../../src/platform/clock.ts';
import { loadConfig } from '../../src/platform/config.ts';
import { createDb, type Db } from '../../src/platform/db.ts';
import { startEmbeddedPostgres, type EmbeddedPostgres } from '../../src/platform/embedded-postgres.ts';
import { MemoryMailer } from '../../src/platform/mailer.ts';
import { migrate } from '../../src/platform/migrate.ts';

const SECRET = 'integration-control-secret';
let pg: EmbeddedPostgres;
let db: Db;
let app: FastifyInstance;

beforeAll(async () => {
  pg = await startEmbeddedPostgres();
  db = createDb({ connectionString: pg.connectionString, maxConnections: 1 }).db;
  await migrate(db);
  const config = loadConfig({ NODE_ENV: 'test', TEST_CONTROL_SECRET: SECRET });
  app = await buildApp({ config, db, clock: new Clock(), mailer: new MemoryMailer(), sleep: async () => {} });
}, 60_000);

afterAll(async () => {
  await app?.close();
  await db?.destroy();
  await pg?.stop();
});

beforeEach(async () => {
  await app.inject({ method: 'POST', url: '/__test/reset', headers: { 'x-test-control-secret': SECRET } });
});

const post = (url: string, payload: object, token?: string) =>
  app.inject({ method: 'POST', url, payload, headers: token ? { authorization: `Bearer ${token}` } : {} });

async function signIn(loginId = 'teacher-a1') {
  const res = await post('/auth/sign-in', { loginId, password: TEST_PASSWORD });
  expect(res.statusCode).toBe(200);
  return res.json() as { step: string; accessToken: string; refreshToken: string };
}

describe('F01 · migrations', () => {
  it('F01 unit: re-running migrations applies nothing and keeps data', async () => {
    expect(await migrate(db)).toEqual([]);
    const { rows } = await sql<{ n: string }>`SELECT count(*) AS n FROM users`.execute(db);
    expect(Number(rows[0]!.n)).toBeGreaterThan(0);
  });
});

describe('F01 · sessions', () => {
  it('F01 unit: trims surrounding whitespace from the User ID before lookup', async () => {
    expect((await signIn('  TEACHER-A1  ')).step).toBe('SIGNED_IN');
  });

  it('F01-AC5 (US-001) refresh rotates the token; replaying a rotated token revokes the session', async () => {
    const first = await signIn();
    const rotated = await post('/auth/refresh', { refreshToken: first.refreshToken });
    expect(rotated.statusCode).toBe(200);
    const next = rotated.json() as { accessToken: string; refreshToken: string };
    expect(next.refreshToken).not.toBe(first.refreshToken);

    // Replaying the old token is treated as theft: the whole session ends.
    expect((await post('/auth/refresh', { refreshToken: first.refreshToken })).statusCode).toBe(401);
    expect((await post('/auth/refresh', { refreshToken: next.refreshToken })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${next.accessToken}` } })).statusCode).toBe(401);
  });

  it('F01-AC6 (US-001) an expired access token is reported as SESSION_EXPIRED so the app can prompt sign-in', async () => {
    const clock = new Clock();
    const config = loadConfig({ NODE_ENV: 'test' });
    const local = await buildApp({ config, db, clock, mailer: new MemoryMailer(), sleep: async () => {} });
    const res = await local.inject({ method: 'POST', url: '/auth/sign-in', payload: { loginId: 'teacher-a1', password: TEST_PASSWORD } });
    const { accessToken } = res.json() as { accessToken: string };
    clock.advance(16 * MINUTE);
    const me = await local.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${accessToken}` } });
    expect(me.statusCode).toBe(401);
    expect(me.json().error.code).toBe('SESSION_EXPIRED');
    await local.close();
  });

  it('F01 unit: a session ends 30 days after sign-in even if refreshed (DEC-B65)', async () => {
    const first = await signIn();
    await sql`UPDATE sessions SET expires_at = now() - interval '1 second'`.execute(db);
    expect((await post('/auth/refresh', { refreshToken: first.refreshToken })).statusCode).toBe(401);
  });

  it('F01 unit: requests without a token, or with a forged one, are unauthenticated', async () => {
    expect((await app.inject({ method: 'GET', url: '/me' })).statusCode).toBe(401);
    const forged = await app.inject({ method: 'GET', url: '/me', headers: { authorization: 'Bearer abc.def.ghi' } });
    expect(forged.json().error.code).toBe('UNAUTHENTICATED');
  });
});

describe('F01 · two-factor hardening (code review 2026-11-02)', () => {
  const control = (url: string) => app.inject({ method: 'GET', url, headers: { 'x-test-control-secret': SECRET } });
  const totp = async (loginId: string) => (await control(`/__test/totp/${loginId}`)).json().code as string;
  const challenge = async (loginId = 'admin-a') => (await signIn(loginId)) as unknown as { challengeToken: string };

  it('F01-AC31 (US-072) regression H1: a correct password does not reset the two-factor failure count', async () => {
    for (let round = 0; round < 2; round++) {
      const { challengeToken } = await challenge();
      for (let i = 0; i < 5; i++) {
        const res = await post('/auth/two-factor/verify', { challengeToken, code: '000000' });
        expect(res.statusCode).toBe(400);
      }
    }
    // 10 wrong codes across two password sign-ins: second factor is now locked, even with the right code.
    const { challengeToken } = await challenge();
    const locked = await post('/auth/two-factor/verify', { challengeToken, code: await totp('admin-a') });
    expect(locked.statusCode).toBe(400);
    const { rows } = await sql<{ action: string }>`SELECT action FROM audit_logs WHERE action = 'ACCOUNT_LOCKED'`.execute(db);
    expect(rows).toHaveLength(1);
  });

  it('F01-AC31 (US-072) regression L1: the same authenticator code cannot be used twice', async () => {
    const code = await totp('owner-a');
    const first = await post('/auth/two-factor/verify', { challengeToken: (await challenge('owner-a')).challengeToken, code });
    expect(first.statusCode).toBe(200);
    const again = await post('/auth/two-factor/verify', { challengeToken: (await challenge('owner-a')).challengeToken, code });
    expect(again.statusCode).toBe(400);
  });

  it('F01-AC5 (US-001) regression L4: sign-out with only the refresh token ends the session', async () => {
    const session = await signIn();
    expect((await post('/auth/sign-out', { refreshToken: session.refreshToken })).statusCode).toBe(204);
    expect((await post('/auth/refresh', { refreshToken: session.refreshToken })).statusCode).toBe(401);
  });

  it('F01-AC25 (US-001) regression M2: attempts are counted before the password check, so the 11th is never checked', async () => {
    for (let i = 0; i < 10; i++) await post('/auth/sign-in', { loginId: 'teacher-a1', password: 'Not-The-Password-1' });
    const { rows } = await sql<{ n: string }>`SELECT count(*) AS n FROM login_locks WHERE login_key = 'teacher-a1'`.execute(db);
    expect(Number(rows[0]!.n)).toBe(1);
    expect((await post('/auth/sign-in', { loginId: 'teacher-a1', password: TEST_PASSWORD })).statusCode).toBe(401);
  });
});

describe('F01 · audit', () => {
  it('F01 unit: audit rows cannot be updated or deleted', async () => {
    const admin = await post('/auth/sign-in', { loginId: 'admin-a', password: TEST_PASSWORD });
    expect(admin.json().step).toBe('TWO_FACTOR_REQUIRED');
    await post('/auth/password-reset/request', { loginId: 'teacher-a1' });
    for (let i = 0; i < 3; i++) await post('/auth/password-reset/request', { loginId: 'teacher-a1' });
    const { rows } = await sql<{ n: string }>`SELECT count(*) AS n FROM audit_logs`.execute(db);
    expect(Number(rows[0]!.n)).toBeGreaterThan(0);
    await expect(sql`UPDATE audit_logs SET action = 'X'`.execute(db)).rejects.toThrow(/append-only/);
    await expect(sql`DELETE FROM audit_logs`.execute(db)).rejects.toThrow(/append-only/);
  });
});

describe('F01 · test control', () => {
  it('F01 unit: the test-control API refuses requests without the secret', async () => {
    const res = await app.inject({ method: 'POST', url: '/__test/reset' });
    expect(res.statusCode).toBe(404);
  });

  it('F01 unit: config refuses the test-control API in production', () => {
    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        TEST_CONTROL_SECRET: SECRET,
        JWT_SECRET: 'j'.repeat(32),
        HASH_PEPPER: 'p'.repeat(32),
        TOTP_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
        MAIL_TRANSPORT: 'ses',
      }),
    ).toThrow(/never be set in production/);
  });
});

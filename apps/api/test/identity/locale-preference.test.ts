// F11 · Localization — integration against real Postgres (embedded, DEC-B68).
// docs/specs/02-f11-localization-accessibility.md: the language preference is kept on the user record, and text the
// server renders comes out in that language.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { TEST_PASSWORD } from '../../../../e2e/fixtures/personas.ts';
import { buildApp } from '../../src/app.ts';
import { Clock } from '../../src/platform/clock.ts';
import { loadConfig } from '../../src/platform/config.ts';
import { createDb, type Db } from '../../src/platform/db.ts';
import { startEmbeddedPostgres, type EmbeddedPostgres } from '../../src/platform/embedded-postgres.ts';
import { MemoryMailer } from '../../src/platform/mailer.ts';
import { migrate } from '../../src/platform/migrate.ts';

const SECRET = 'integration-control-secret';
let pg: EmbeddedPostgres;
let db: Db;
let app: FastifyInstance;
const mailer = new MemoryMailer();

beforeAll(async () => {
  pg = await startEmbeddedPostgres();
  db = createDb({ connectionString: pg.connectionString, maxConnections: 1 }).db;
  await migrate(db);
  const config = loadConfig({ NODE_ENV: 'test', TEST_CONTROL_SECRET: SECRET });
  app = await buildApp({ config, db, clock: new Clock(), mailer, sleep: async () => {} });
}, 60_000);

afterAll(async () => {
  await app?.close();
  await db?.destroy();
  await pg?.stop();
});

beforeEach(async () => {
  await app.inject({ method: 'POST', url: '/__test/reset', headers: { 'x-test-control-secret': SECRET } });
  mailer.clear();
});

async function signIn(loginId = 'teacher-a1'): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await app.inject({ method: 'POST', url: '/auth/sign-in', payload: { loginId, password: TEST_PASSWORD } });
  expect(res.statusCode).toBe(200);
  return res.json();
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

describe('F11 · language preference on the account', () => {
  it('F11-AC4 (US-047) the language chosen on one session is the language of every later session', async () => {
    const first = await signIn();
    const patched = await app.inject({ method: 'PATCH', url: '/me', headers: auth(first.accessToken), payload: { preferredLocale: 'ur' } });
    expect(patched.statusCode).toBe(200);
    expect(patched.json()).toMatchObject({ preferredLocale: 'ur' });
    await app.inject({ method: 'POST', url: '/auth/sign-out', headers: auth(first.accessToken), payload: {} });

    // A new sign-in, as from another device, reads the language from the account.
    const second = await signIn();
    const me = await app.inject({ method: 'GET', url: '/me', headers: auth(second.accessToken) });
    expect(me.json()).toMatchObject({ preferredLocale: 'ur' });
  });

  it('F11 unit: only the three supported languages are accepted, and a refusal changes nothing', async () => {
    const { accessToken } = await signIn();
    for (const preferredLocale of ['ar', 'ur-PK', 'UR', '']) {
      const res = await app.inject({ method: 'PATCH', url: '/me', headers: auth(accessToken), payload: { preferredLocale } });
      expect(res.statusCode, preferredLocale).toBe(400);
    }
    const me = await app.inject({ method: 'GET', url: '/me', headers: auth(accessToken) });
    expect(me.json()).toMatchObject({ preferredLocale: 'en' });
  });
});

describe('F11 · server-rendered text in the account language', () => {
  it.each([
    ['en', /reset code is \d{6}\. It expires in 10 minutes/],
    ['ur', /کوڈ ⁦\d{6}⁩ ہے۔ یہ 10 منٹ/],
    ['ur-Latn', /reset code \d{6} hai\. Yeh 10 minute mein/],
  ] as const)('F11 unit: the password-reset email comes out in %s, with Western digits', async (locale, pattern) => {
    const { accessToken } = await signIn();
    await app.inject({ method: 'PATCH', url: '/me', headers: auth(accessToken), payload: { preferredLocale: locale } });
    mailer.clear();
    const res = await app.inject({ method: 'POST', url: '/auth/password-reset/request', payload: { loginId: 'teacher-a1' } });
    expect(res.statusCode).toBe(202);
    await expect.poll(() => mailer.sent.length).toBe(1);
    const email = mailer.sent[0]!;
    expect(email.text).toMatch(pattern);
    expect(`${email.subject} ${email.text}`).not.toMatch(/[٠-٩۰-۹]/);
  });
});

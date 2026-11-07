// Shared setup for API integration tests: embedded Postgres (DEC-B68), migrations, the app with test control,
// and sign-in helpers for the seeded personas (e2e/fixtures/personas.ts). Synthetic data only.
import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify';
import { TEST_PASSWORD, loginIdOf, type PersonaKey } from '../../../../e2e/fixtures/personas.ts';
import { buildApp } from '../../src/app.ts';
import { Clock } from '../../src/platform/clock.ts';
import { loadConfig } from '../../src/platform/config.ts';
import { createDb, type Db } from '../../src/platform/db.ts';
import { startEmbeddedPostgres, type EmbeddedPostgres } from '../../src/platform/embedded-postgres.ts';
import { MemoryMailer } from '../../src/platform/mailer.ts';
import { migrate } from '../../src/platform/migrate.ts';

export const CONTROL_SECRET = 'integration-control-secret';

export interface Harness {
  db: Db;
  app: FastifyInstance;
  clock: Clock;
  stop(): Promise<void>;
  reset(): Promise<void>;
  control(method: 'GET' | 'POST', url: string, payload?: object): Promise<LightMyRequestResponse>;
  /** Signs in as a persona or User ID, completing two-factor sign-in for Owner/Admin; returns the access token. */
  signIn(who: PersonaKey | string, password?: string): Promise<string>;
  call(method: InjectOptions['method'], url: string, token: string | null, payload?: object): Promise<LightMyRequestResponse>;
  userId(who: PersonaKey | string): Promise<string>;
}

const loginOf = (who: string) => (who.includes('.') ? loginIdOf(who as PersonaKey) : who);

export async function startHarness(): Promise<Harness> {
  const pg: EmbeddedPostgres = await startEmbeddedPostgres();
  const db = createDb({ connectionString: pg.connectionString, maxConnections: 1 }).db;
  await migrate(db);
  const clock = new Clock();
  const config = loadConfig({ NODE_ENV: 'test', TEST_CONTROL_SECRET: CONTROL_SECRET });
  const app = await buildApp({ config, db, clock, mailer: new MemoryMailer(), sleep: async () => {} });

  const control: Harness['control'] = (method, url, payload) =>
    app.inject({ method, url: `/__test${url}`, headers: { 'x-test-control-secret': CONTROL_SECRET }, ...(payload ? { payload } : {}) });

  const call: Harness['call'] = (method, url, token, payload) =>
    app.inject({ method, url, headers: token ? { authorization: `Bearer ${token}` } : {}, ...(payload ? { payload } : {}) });

  const signIn: Harness['signIn'] = async (who, password = TEST_PASSWORD) => {
    const loginId = loginOf(who);
    let body = (await call('POST', '/auth/sign-in', null, { loginId, password })).json();
    if (body.step === 'TWO_FACTOR_REQUIRED') {
      const { code } = (await control('GET', `/totp/${loginId}`)).json();
      body = (await call('POST', '/auth/two-factor/verify', null, { challengeToken: body.challengeToken, code })).json();
    }
    if (body.step !== 'SIGNED_IN') throw new Error(`sign-in as ${who} stopped at ${JSON.stringify(body)}`);
    return body.accessToken as string;
  };

  return {
    db,
    app,
    clock,
    control,
    call,
    signIn,
    userId: async (who) => (await control('GET', `/users/${loginOf(who)}`)).json().id,
    reset: async () => {
      const res = await control('POST', '/reset');
      if (res.statusCode !== 200) throw new Error(`reset failed: ${res.body}`);
    },
    stop: async () => {
      await app.close();
      await db.destroy();
      await pg.stop();
    },
  };
}

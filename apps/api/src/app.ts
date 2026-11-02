// Builds the API. Dependencies are passed in so tests and the E2E server can supply the clock,
// mailer, and database.
import Fastify, { type FastifyInstance } from 'fastify';
import type { Clock } from './platform/clock.ts';
import type { Config } from './platform/config.ts';
import type { Db } from './platform/db.ts';
import { registerErrorHandler } from './platform/errors.ts';
import type { Mailer, MemoryMailer } from './platform/mailer.ts';
import { AccountsService } from './modules/identity/accounts-service.ts';
import { AuthService } from './modules/identity/auth-service.ts';
import { ProfileService } from './modules/identity/profile-service.ts';
import { registerIdentityRoutes } from './modules/identity/routes.ts';
import { TokenService } from './modules/identity/tokens.ts';
import { registerTestControl, type LogSink } from './testing/control.ts';

export interface AppDeps {
  config: Config;
  db: Db;
  clock: Clock;
  mailer: Mailer;
  /** Captured log lines, for the test-control text search. */
  logSink?: LogSink;
  sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    // Trust X-Forwarded-For only from the configured number of proxy hops (code review L7).
    trustProxy: (_address: string, hop: number) => hop < deps.config.trustProxyHops,
    bodyLimit: 64 * 1024,
    logger: {
      level: deps.config.env === 'production' ? 'info' : 'debug',
      // Never log credentials (FR-AUD-003). Request bodies are not logged at all.
      redact: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["x-test-control-secret"]'],
      ...(deps.logSink ? { stream: deps.logSink } : {}),
    },
  });
  registerErrorHandler(app);

  const tokens = new TokenService(deps.config.jwtSecret, deps.clock);
  const auth = new AuthService({
    db: deps.db,
    clock: deps.clock,
    tokens,
    mailer: deps.mailer,
    hashPepper: deps.config.hashPepper,
    totpKey: deps.config.totpKey,
    sleep: deps.sleep ?? realSleep,
    log: app.log,
  });
  const accounts = new AccountsService(deps.db, deps.clock);
  const profile = new ProfileService(deps.db, deps.clock, auth);

  app.get('/', async () => ({ status: 'ok' }));
  registerIdentityRoutes(app, { auth, accounts, profile });

  if (deps.config.testControlSecret) {
    if (deps.config.env !== 'test') throw new Error('The test-control API is enabled only when NODE_ENV=test');
    registerTestControl(app, {
      secret: deps.config.testControlSecret,
      db: deps.db,
      clock: deps.clock,
      mailer: deps.mailer as MemoryMailer,
      logSink: deps.logSink,
      totpKey: deps.config.totpKey,
    });
  }
  return app;
}

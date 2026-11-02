// API for the E2E suite (npm run api:e2e-server): a fresh in-memory embedded Postgres, the in-memory mail
// sink, the test-control API, and the seeded personas. Never used outside local and CI test runs.
import { buildApp } from './app.ts';
import { Clock } from './platform/clock.ts';
import { loadConfig } from './platform/config.ts';
import { createDb } from './platform/db.ts';
import { startEmbeddedPostgres } from './platform/embedded-postgres.ts';
import { MemoryMailer } from './platform/mailer.ts';
import { migrate } from './platform/migrate.ts';
import { LogSink } from './testing/control.ts';
import { seedPersonas } from './testing/seed.ts';

const config = loadConfig({
  ...process.env,
  NODE_ENV: 'test',
  TEST_CONTROL_SECRET: process.env.TEST_CONTROL_SECRET ?? 'local-e2e-control-secret',
});
const embedded = await startEmbeddedPostgres();
const { db } = createDb({ connectionString: embedded.connectionString, maxConnections: 1 });
await migrate(db);
const clock = new Clock();
await seedPersonas(db, clock, config.totpKey);

const app = await buildApp({ config, db, clock, mailer: new MemoryMailer(), logSink: new LogSink() });
await app.listen({ port: config.port, host: config.host });
console.log(`E2E API listening on http://${config.host}:${config.port}`);

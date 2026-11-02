// API entry point. With no DATABASE_URL in development, it uses embedded Postgres persisted in
// apps/api/.data/pglite (DEC-B68). Production requires DATABASE_URL and every secret.
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.ts';
import { Clock } from './platform/clock.ts';
import { loadConfig } from './platform/config.ts';
import { createDb } from './platform/db.ts';
import { startEmbeddedPostgres } from './platform/embedded-postgres.ts';
import { MemoryMailer, SesMailer } from './platform/mailer.ts';
import { migrate } from './platform/migrate.ts';

const config = loadConfig();
let connectionString = config.databaseUrl;
let embedded: Awaited<ReturnType<typeof startEmbeddedPostgres>> | undefined;
if (!connectionString) {
  if (config.env === 'production') throw new Error('DATABASE_URL must be set in production');
  embedded = await startEmbeddedPostgres(fileURLToPath(new URL('../.data/pglite', import.meta.url)));
  connectionString = embedded.connectionString;
}

const { db } = createDb({ connectionString, maxConnections: embedded ? 1 : 10 });
await migrate(db);
const mailer = config.mail.transport === 'ses' ? new SesMailer(config.mail.awsRegion, config.mail.from) : new MemoryMailer();
const app = await buildApp({ config, db, clock: new Clock(), mailer });

const shutdown = async () => {
  await app.close();
  await db.destroy();
  await embedded?.stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ port: config.port, host: config.host });

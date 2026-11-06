// Embedded Postgres for local development and tests when Docker is not available (DEC-B68).
// PGlite is real Postgres compiled to WASM; the API reaches it over the normal wire protocol, so the
// same driver and SQL run as against the Docker Compose or managed database. Not for production.
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

export interface EmbeddedPostgres {
  connectionString: string;
  stop(): Promise<void>;
}

/** Starts PGlite (in memory, or persisted in `dataDir`) behind a local socket on a free port. */
export async function startEmbeddedPostgres(dataDir?: string): Promise<EmbeddedPostgres> {
  const pg = await PGlite.create(dataDir);
  const server = new PGLiteSocketServer({ db: pg, port: 0, host: '127.0.0.1' });
  await server.start();
  const conn = server.getServerConn();
  return {
    connectionString: `postgres://postgres@${conn}/postgres`,
    async stop() {
      await server.stop();
      await pg.close();
    },
  };
}

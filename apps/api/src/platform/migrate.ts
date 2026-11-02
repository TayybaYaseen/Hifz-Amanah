// Versioned SQL migrations (ARCHITECTURE.md §4 apps/api/migrations). Each file runs once, in name order,
// inside its own transaction. Applied migrations are never edited; add a new file instead.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'kysely';
import type { Db } from './db.ts';

export const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations/', import.meta.url));

export async function migrate(db: Db, dir: string = MIGRATIONS_DIR): Promise<string[]> {
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`.execute(db);
  const applied = new Set(
    (await sql<{ name: string }>`SELECT name FROM schema_migrations`.execute(db)).rows.map((r) => r.name),
  );
  const files = (await readdir(dir)).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const body = await readFile(join(dir, file), 'utf8');
    await db.transaction().execute(async (tx) => {
      await sql.raw(body).execute(tx);
      await sql`INSERT INTO schema_migrations (name) VALUES (${file})`.execute(tx);
    });
    ran.push(file);
  }
  return ran;
}

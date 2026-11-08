// expo-sqlite adapter for the SQL driver (F12; ARCHITECTURE.md §8.1). Plain expo-sqlite, no ORM: the outbox and
// sync tables are few and fixed, and the same SQL runs under node:sqlite in unit tests.
import * as SQLite from 'expo-sqlite';
import { CONNECTION_PRAGMAS, createDriver, prepareForDelete, type DatabaseFiles, type SqlDriver } from './driver.ts';

export async function openExpoDriver(name: string): Promise<SqlDriver> {
  const db = await SQLite.openDatabaseAsync(name);
  // WAL keeps reads fast while the engine writes; secure_delete zeroes purged rows (security review L5).
  await db.execAsync(`PRAGMA journal_mode = WAL; ${CONNECTION_PRAGMAS}`);
  return createDriver({
    exec: (sql) => db.execAsync(sql),
    run: async (sql, params) => {
      const result = await db.runAsync(sql, params as SQLite.SQLiteBindValue[]);
      return { changes: result.changes };
    },
    all: <T>(sql: string, params: readonly SQLite.SQLiteBindValue[]) => db.getAllAsync<T>(sql, params as SQLite.SQLiteBindValue[]),
    close: () => db.closeAsync(),
  });
}

/**
 * Deletes a database and its -wal/-shm files (security review L5). expo-sqlite's deleteDatabaseAsync removes only
 * the main file, so the file is first opened, its WAL emptied and WAL mode left; closing then removes -wal and
 * -shm. The caller closes its own connection first (an open database cannot be deleted).
 */
async function deleteExpoDatabase(name: string): Promise<void> {
  try {
    const db = await SQLite.openDatabaseAsync(name);
    try {
      await prepareForDelete({
        exec: (sql) => db.execAsync(sql),
        run: async () => ({ changes: 0 }),
        all: async () => [],
        get: async () => null,
      });
    } finally {
      await db.closeAsync();
    }
  } catch {
    // Best effort: the main file is deleted below either way.
  }
  await SQLite.deleteDatabaseAsync(name);
}

export const expoDatabaseFiles: DatabaseFiles = {
  open: openExpoDriver,
  delete: deleteExpoDatabase,
};

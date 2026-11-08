// expo-sqlite adapter for the SQL driver (F12; ARCHITECTURE.md §8.1). Plain expo-sqlite, no ORM: the outbox and
// sync tables are few and fixed, and the same SQL runs under node:sqlite in unit tests.
import * as SQLite from 'expo-sqlite';
import { createDriver, type DatabaseFiles, type SqlDriver } from './driver.ts';

export async function openExpoDriver(name: string): Promise<SqlDriver> {
  const db = await SQLite.openDatabaseAsync(name);
  // WAL keeps reads fast while the engine writes; foreign keys are not used across sync tables but stay on.
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
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

export const expoDatabaseFiles: DatabaseFiles = {
  open: openExpoDriver,
  delete: (name) => SQLite.deleteDatabaseAsync(name),
};

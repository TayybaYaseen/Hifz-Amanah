/// <reference types="node" />
// TEST ONLY. node:sqlite adapter for the SQL driver, so the outbox, engine, migrations, and retention are tested
// in Vitest without a device (F12 plan §8). Never imported by app code, so Metro never bundles it.
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { CONNECTION_PRAGMAS, createDriver, type DatabaseFiles, type SqlDriver, type SqlValue } from '../driver.ts';

export function openNodeDriver(path = ':memory:'): SqlDriver {
  const db = new DatabaseSync(path);
  db.exec(CONNECTION_PRAGMAS);
  const bind = (params: readonly SqlValue[]) => params as SQLInputValue[];
  return createDriver({
    exec: async (sql) => {
      db.exec(sql);
    },
    run: async (sql, params) => {
      const result = db.prepare(sql).run(...bind(params));
      return { changes: Number(result.changes) };
    },
    all: async <T>(sql: string, params: readonly SqlValue[]) => db.prepare(sql).all(...bind(params)) as T[],
    close: async () => {
      db.close();
    },
  });
}

/** Database files in a fresh temporary folder; `dispose` removes the folder. */
export function nodeDatabaseFiles(): DatabaseFiles & { dir: string; exists(name: string): boolean; dispose(): void } {
  const dir = mkdtempSync(join(tmpdir(), 'hifz-localdb-'));
  return {
    dir,
    open: async (name) => openNodeDriver(join(dir, name)),
    delete: async (name) => {
      for (const suffix of ['', '-wal', '-shm', '-journal']) rmSync(join(dir, name + suffix), { force: true });
    },
    exists: (name) => existsSync(join(dir, name)),
    dispose: () => rmSync(dir, { recursive: true, force: true }),
  };
}

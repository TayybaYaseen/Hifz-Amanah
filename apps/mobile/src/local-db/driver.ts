// A small SQL driver interface over the device database (F12; ARCHITECTURE.md §8.1). The app uses expo-sqlite
// (expoDriver.ts); unit tests use Node's built-in node:sqlite (testing/nodeDriver.ts) behind the same interface,
// so outbox, engine, migration, and retention logic is tested without a device.
//
// Every call goes through one queue. A transaction holds the queue for its whole callback, so no other query can
// slip into it (expo-sqlite's withTransactionAsync does not guarantee that). Inside the callback, use the `tx`
// argument: calling the driver itself from inside a transaction would wait for the transaction and never finish.

export type SqlValue = string | number | null | Uint8Array;

/** What a platform adapter must provide. Calls are never concurrent: the driver serializes them. */
export interface RawSql {
  exec(sql: string): Promise<void>;
  run(sql: string, params: readonly SqlValue[]): Promise<{ changes: number }>;
  all<T>(sql: string, params: readonly SqlValue[]): Promise<T[]>;
  close(): Promise<void>;
}

export interface SqlExecutor {
  /** Runs one or more statements without parameters (schema changes). */
  exec(sql: string): Promise<void>;
  run(sql: string, params?: readonly SqlValue[]): Promise<{ changes: number }>;
  all<T>(sql: string, params?: readonly SqlValue[]): Promise<T[]>;
  get<T>(sql: string, params?: readonly SqlValue[]): Promise<T | null>;
}

export interface SqlDriver extends SqlExecutor {
  /** Runs `fn` in one SQLite transaction: everything it wrote commits together or rolls back together. */
  transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** Opens and deletes database files by name (one file per account and organization, plus the device index). */
export interface DatabaseFiles {
  open(name: string): Promise<SqlDriver>;
  delete(name: string): Promise<void>;
}

/**
 * Set on every connection (security review L5): deleted rows are overwritten with zeros instead of lingering in
 * free pages, so purged student data cannot be read back from the file.
 */
export const CONNECTION_PRAGMAS = 'PRAGMA secure_delete = ON; PRAGMA foreign_keys = ON;';

/**
 * After a purge (revocation, sign-out, retention, scope reset): copies the WAL back into the main file and
 * truncates it, so removed rows do not remain in the -wal file. Best effort; never fails the purge. Must run
 * outside a transaction.
 */
export async function checkpoint(db: SqlExecutor): Promise<void> {
  try {
    await db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  } catch {
    // A busy checkpoint is retried by SQLite later; the data is already deleted from the main file.
  }
}

/**
 * Before a database file is deleted: empties the WAL and leaves WAL mode, so closing the connection removes the
 * -wal and -shm files and only the main file is left to delete (expo-sqlite deletes only that file).
 */
export async function prepareForDelete(db: SqlExecutor): Promise<void> {
  await db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  await db.exec('PRAGMA journal_mode = DELETE;');
}

export class TransactionClosedError extends Error {
  constructor() {
    super('This transaction has already finished');
    this.name = 'TransactionClosedError';
  }
}

export function createDriver(raw: RawSql): SqlDriver {
  let queue: Promise<unknown> = Promise.resolve();
  const serialize = <T>(task: () => Promise<T>): Promise<T> => {
    const next = queue.then(task, task);
    // The queue continues whatever the outcome; the caller still sees the error.
    queue = next.catch(() => undefined);
    return next;
  };

  const executor = (guard: () => void): SqlExecutor => ({
    exec: async (sql) => {
      guard();
      await raw.exec(sql);
    },
    run: async (sql, params = []) => {
      guard();
      return raw.run(sql, params);
    },
    all: async <T>(sql: string, params: readonly SqlValue[] = []) => {
      guard();
      return raw.all<T>(sql, params);
    },
    get: async <T>(sql: string, params: readonly SqlValue[] = []) => {
      guard();
      const rows = await raw.all<T>(sql, params);
      return rows[0] ?? null;
    },
  });

  const direct = executor(() => undefined);
  let closed = false;
  const ensureOpen = () => {
    if (closed) throw new Error('The database is closed');
  };

  return {
    exec: (sql) => serialize(() => (ensureOpen(), direct.exec(sql))),
    run: (sql, params) => serialize(() => (ensureOpen(), direct.run(sql, params))),
    all: <T>(sql: string, params?: readonly SqlValue[]) => serialize(() => (ensureOpen(), direct.all<T>(sql, params))),
    get: <T>(sql: string, params?: readonly SqlValue[]) => serialize(() => (ensureOpen(), direct.get<T>(sql, params))),
    transaction: <T>(fn: (tx: SqlExecutor) => Promise<T>) =>
      serialize(async () => {
        ensureOpen();
        let open = true;
        const tx = executor(() => {
          if (!open) throw new TransactionClosedError();
        });
        await raw.exec('BEGIN IMMEDIATE');
        try {
          const result = await fn(tx);
          open = false;
          await raw.exec('COMMIT');
          return result;
        } catch (err) {
          open = false;
          try {
            await raw.exec('ROLLBACK');
          } catch {
            // SQLite may already have rolled back (e.g. after a constraint error in some modes).
          }
          throw err;
        }
      }),
    close: () =>
      serialize(async () => {
        if (closed) return;
        closed = true;
        await raw.close();
      }),
  };
}

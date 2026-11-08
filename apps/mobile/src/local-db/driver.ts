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

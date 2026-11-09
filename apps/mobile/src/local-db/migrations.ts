// Versioned local schema migrations (F12-AC16, NFR-OFF-009; ARCHITECTURE.md §8.1).
// - Each migration runs in its own transaction together with the version bump: it applies completely or not at all.
// - Migrations are append-only: never edit or reorder a shipped one; add a new version.
// - A migration never rewrites or deletes `outbox` rows. The only change allowed on `outbox` after version 1 is an
//   additive column (`ALTER TABLE outbox ADD COLUMN …` with a default), so queued work survives every app update.
//   migrations.test.ts runs every migration over a populated outbox and checks this rule.
// - Entity tables (attendance, daily records, homework…) are added by their features (F04, F05, F08) as new
//   versions here; F12 ships none. Every entity table has `id TEXT PRIMARY KEY` (the client UUIDv7) and
//   `row_version INTEGER` (null until the server acknowledged it); see sync/registry.ts.
import { PROTOCOL_VERSION } from '@hifz/contracts';
import { attendanceMigration } from '../features/attendance/local.ts';
import type { SqlDriver, SqlExecutor } from './driver.ts';

export interface Migration {
  version: number;
  name: string;
  up(tx: SqlExecutor): Promise<void>;
}

/** The workspace database (one per account + organization). */
export const WORKSPACE_MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'sync core: outbox, sync_meta, conflicts, discards',
    up: async (tx) => {
      await tx.exec(`
        CREATE TABLE outbox (
          op_id            TEXT PRIMARY KEY,
          seq              INTEGER NOT NULL UNIQUE,
          entity           TEXT NOT NULL,
          entity_id        TEXT NOT NULL,
          op_type          TEXT NOT NULL CHECK (op_type IN ('CREATE', 'UPDATE', 'COMMAND')),
          command          TEXT,
          payload          TEXT NOT NULL,
          base_version     INTEGER,
          depends_on       TEXT NOT NULL DEFAULT '[]',
          state            TEXT NOT NULL CHECK (state IN ('PENDING', 'SYNCING', 'SYNCED', 'FAILED', 'ACTION_REQUIRED')),
          attempts         INTEGER NOT NULL DEFAULT 0,
          last_error       TEXT,
          next_attempt_at  INTEGER,
          failure_code     TEXT,
          failure_fields   TEXT,
          row_version      INTEGER,
          conflict_id      TEXT,
          label            TEXT,
          created_at       TEXT NOT NULL,
          synced_at        TEXT
        );
        CREATE INDEX outbox_state ON outbox (state, seq);
        CREATE INDEX outbox_entity ON outbox (entity, entity_id);

        CREATE TABLE sync_meta (
          id                 INTEGER PRIMARY KEY CHECK (id = 1),
          last_pull_cursor   TEXT,
          last_success_at    TEXT,
          protocol_version   INTEGER NOT NULL,
          schema_version     INTEGER NOT NULL,
          workspace_state    TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (workspace_state IN ('ACTIVE', 'LOCKED_REVOKED')),
          revoked_at         TEXT,
          next_seq           INTEGER NOT NULL DEFAULT 1,
          signed_out_at      TEXT,
          upgrade_required_at TEXT,
          last_cleanup_at    TEXT,
          org_time_zone      TEXT NOT NULL DEFAULT 'Asia/Karachi'
        );
        INSERT INTO sync_meta (id, protocol_version, schema_version) VALUES (1, ${PROTOCOL_VERSION}, 0);

        CREATE TABLE conflicts (
          conflict_id  TEXT PRIMARY KEY,
          op_id        TEXT NOT NULL,
          entity       TEXT NOT NULL,
          entity_id    TEXT NOT NULL,
          status       TEXT NOT NULL CHECK (status IN ('OPEN', 'RESOLVED')),
          label        TEXT,
          created_at   TEXT NOT NULL,
          resolved_at  TEXT
        );

        CREATE TABLE discards (
          op_id         TEXT PRIMARY KEY,
          entity        TEXT NOT NULL,
          entity_id     TEXT NOT NULL,
          op_type       TEXT NOT NULL,
          label         TEXT,
          failure_code  TEXT,
          created_at    TEXT NOT NULL,
          discarded_at  TEXT NOT NULL
        );
      `);
    },
  },
  {
    version: 2,
    name: 'sync review fixes: sent count, last server time, deferred server changes, discard reason',
    up: async (tx) => {
      // Additive only (F12-AC16): existing outbox rows are not rewritten. `sent_count` is NULL for rows queued
      // before this version ("unknown", treated as possibly sent); new rows start at 0 (review M5).
      await tx.exec(`
        ALTER TABLE outbox ADD COLUMN sent_count INTEGER;
        ALTER TABLE sync_meta ADD COLUMN last_server_time TEXT;
        ALTER TABLE discards ADD COLUMN reason TEXT NOT NULL DEFAULT 'DISCARDED';

        CREATE TABLE deferred_changes (
          entity       TEXT NOT NULL,
          entity_id    TEXT NOT NULL,
          row_version  INTEGER NOT NULL,
          op           TEXT NOT NULL CHECK (op IN ('UPSERT', 'REMOVE_FROM_DEVICE')),
          fields       TEXT,
          PRIMARY KEY (entity, entity_id)
        );
        CREATE INDEX conflicts_row ON conflicts (entity, entity_id, status);
      `);
    },
  },
  {
    version: 3,
    name: 'sync re-review fixes: row sync marks, refetch request, conflict check time',
    up: async (tx) => {
      // Additive only (F12-AC16): no outbox row or column is touched.
      // - row_sync_marks (N2): the highest outbox seq of this device's operations the server acknowledged per row,
      //   so Retry can refuse to replay an older change after a newer one synced, even once the synced queue item
      //   was pruned (24 h, Q16).
      // - refetch_requested / refetch_done (N4): a discarded UPDATE left values the server never had in the local
      //   row; the next pull starts again from a snapshot (cursor NULL) so the server's values are written back.
      //   Counters, not a cursor reset, so a pull already running cannot overwrite the request.
      // - conflicts.last_checked_at (N5): reconciliation checks each conflict at most once every 5 minutes, oldest
      //   check first.
      await tx.exec(`
        CREATE TABLE row_sync_marks (
          entity           TEXT NOT NULL,
          entity_id        TEXT NOT NULL,
          last_synced_seq  INTEGER NOT NULL,
          PRIMARY KEY (entity, entity_id)
        );
        ALTER TABLE sync_meta ADD COLUMN refetch_requested INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE sync_meta ADD COLUMN refetch_done INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE conflicts ADD COLUMN last_checked_at TEXT;
      `);
    },
  },
  // F04: attendance_records (the attendance_record entity) and class_roster_cache.
  attendanceMigration(4),
];

/** The device index: which workspace databases exist on this phone, and the device ID. */
export const DEVICE_MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'device index',
    up: async (tx) => {
      await tx.exec(`
        CREATE TABLE device (
          id         INTEGER PRIMARY KEY CHECK (id = 1),
          device_id  TEXT NOT NULL
        );
        CREATE TABLE workspaces (
          db_name         TEXT PRIMARY KEY,
          user_id         TEXT NOT NULL,
          org_id          TEXT NOT NULL,
          login_id        TEXT NOT NULL,
          org_name        TEXT NOT NULL,
          role            TEXT NOT NULL,
          state           TEXT NOT NULL CHECK (state IN ('ACTIVE', 'HELD', 'LOCKED_REVOKED')),
          since           TEXT,
          last_opened_at  TEXT NOT NULL
        );
      `);
    },
  },
  {
    version: 2,
    name: 'device index: last server time (security review L6)',
    up: async (tx) => {
      await tx.exec('ALTER TABLE device ADD COLUMN last_server_time TEXT');
    },
  },
];

export class LocalSchemaTooNewError extends Error {
  constructor(found: number, known: number) {
    super(`Local database is at version ${found}; this app knows up to ${known}`);
    this.name = 'LocalSchemaTooNewError';
  }
}

export function assertMigrationList(migrations: readonly Migration[]): void {
  migrations.forEach((m, i) => {
    if (m.version !== i + 1) throw new Error(`Migration versions must be 1, 2, 3…; found ${m.version} at position ${i + 1}`);
  });
}

export async function schemaVersion(db: SqlExecutor): Promise<number> {
  const row = await db.get<{ user_version: number }>('PRAGMA user_version');
  return Number(row?.user_version ?? 0);
}

/**
 * Brings the database up to the latest version. Each pending migration and its version bump run in one
 * transaction; a failure rolls that migration back, leaves the database at the previous version (with the outbox
 * untouched), and throws. Returns the versions applied.
 */
export async function runMigrations(db: SqlDriver, migrations: readonly Migration[]): Promise<number[]> {
  assertMigrationList(migrations);
  const current = await schemaVersion(db);
  if (current > migrations.length) throw new LocalSchemaTooNewError(current, migrations.length);
  const applied: number[] = [];
  for (const migration of migrations.slice(current)) {
    await db.transaction(async (tx) => {
      await migration.up(tx);
      // PRAGMA user_version is part of the transaction: it commits or rolls back with the migration.
      await tx.exec(`PRAGMA user_version = ${migration.version}`);
      const meta = await tx.get<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sync_meta'");
      if (meta) await tx.run('UPDATE sync_meta SET schema_version = ? WHERE id = 1', [migration.version]);
    });
    applied.push(migration.version);
  }
  return applied;
}

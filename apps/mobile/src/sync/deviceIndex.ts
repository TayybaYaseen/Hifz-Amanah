// The device index (F12; plan §8, Q14, F12-AC20): which workspace databases exist on this phone, whose they are,
// and whether they are active, held after "Sign out anyway", or locked after revocation. Also the per-install
// device ID sent with every push. Holds no student data.
import type { Role } from '@hifz/contracts';
import type { DatabaseFiles, SqlDriver } from '../local-db/driver.ts';
import { DEVICE_MIGRATIONS, WORKSPACE_MIGRATIONS, runMigrations, type Migration } from '../local-db/migrations.ts';
import { effectiveNow, heldExpired } from './retention.ts';

export const DEVICE_DB_NAME = 'hifz-device.db';

export type WorkspaceEntryState = 'ACTIVE' | 'HELD' | 'LOCKED_REVOKED';

export interface WorkspaceIdentity {
  userId: string;
  orgId: string;
  loginId: string;
  orgName: string;
  role: Role;
}

export interface WorkspaceEntry extends WorkspaceIdentity {
  dbName: string;
  state: WorkspaceEntryState;
  /** When it became HELD or LOCKED_REVOKED (the 30-day clock starts here). */
  since: string | null;
  lastOpenedAt: string;
}

interface EntryRow {
  db_name: string;
  user_id: string;
  org_id: string;
  login_id: string;
  org_name: string;
  role: Role;
  state: WorkspaceEntryState;
  since: string | null;
  last_opened_at: string;
}

const toEntry = (r: EntryRow): WorkspaceEntry => ({
  dbName: r.db_name,
  userId: r.user_id,
  orgId: r.org_id,
  loginId: r.login_id,
  orgName: r.org_name,
  role: r.role,
  state: r.state,
  since: r.since,
  lastOpenedAt: r.last_opened_at,
});

/** Only Teacher, Admin, and Owner keep data on the device; Student and Parent are online-only (AGENTS.md §7). */
export const OFFLINE_ROLES: readonly Role[] = ['OWNER', 'ADMIN', 'TEACHER'];

export function workspaceDbName(userId: string, orgId: string): string {
  const safe = (s: string) => s.toLowerCase().replace(/[^a-z0-9-]/g, '');
  return `hifz-ws-${safe(userId)}-${safe(orgId)}.db`;
}

export class DeviceIndex {
  readonly db: SqlDriver;
  readonly files: DatabaseFiles;

  private constructor(db: SqlDriver, files: DatabaseFiles) {
    this.db = db;
    this.files = files;
  }

  static async open(files: DatabaseFiles, newDeviceId: () => string): Promise<DeviceIndex> {
    const db = await files.open(DEVICE_DB_NAME);
    await runMigrations(db, DEVICE_MIGRATIONS);
    await db.run('INSERT OR IGNORE INTO device (id, device_id) VALUES (1, ?)', [newDeviceId()]);
    return new DeviceIndex(db, files);
  }

  async deviceId(): Promise<string> {
    const row = await this.db.get<{ device_id: string }>('SELECT device_id FROM device WHERE id = 1');
    if (!row) throw new Error('device row missing');
    return row.device_id;
  }

  /** Keeps the latest server time any workspace's pull returned; it only moves forward (security review L6). */
  async noteServerTime(serverTime: string): Promise<void> {
    const ms = Date.parse(serverTime);
    if (Number.isNaN(ms)) return;
    const iso = new Date(ms).toISOString();
    await this.db.run('UPDATE device SET last_server_time = ? WHERE id = 1 AND (last_server_time IS NULL OR last_server_time < ?)', [iso, iso]);
  }

  /** The clock for the 30-day purge and held/locked stamps: the device clock, never behind the last server time. */
  async purgeNow(deviceNowMs: number): Promise<number> {
    const row = await this.db.get<{ last_server_time: string | null }>('SELECT last_server_time FROM device WHERE id = 1');
    return effectiveNow(deviceNowMs, row?.last_server_time ?? null);
  }

  async entries(): Promise<WorkspaceEntry[]> {
    return (await this.db.all<EntryRow>('SELECT * FROM workspaces ORDER BY last_opened_at DESC')).map(toEntry);
  }

  async find(dbName: string): Promise<WorkspaceEntry | null> {
    const row = await this.db.get<EntryRow>('SELECT * FROM workspaces WHERE db_name = ?', [dbName]);
    return row ? toEntry(row) : null;
  }

  /** The most recently opened workspace for a User ID (case-insensitive), e.g. while the session is offline. */
  async latestFor(loginId: string): Promise<WorkspaceEntry | null> {
    const row = await this.db.get<EntryRow>('SELECT * FROM workspaces WHERE lower(login_id) = lower(?) ORDER BY last_opened_at DESC LIMIT 1', [loginId]);
    return row ? toEntry(row) : null;
  }

  /** Signing in: the workspace becomes ACTIVE again unless it is locked after revocation. */
  async activate(identity: WorkspaceIdentity, nowMs: number): Promise<WorkspaceEntry> {
    const dbName = workspaceDbName(identity.userId, identity.orgId);
    const now = new Date(nowMs).toISOString();
    await this.db.run(
      `INSERT INTO workspaces (db_name, user_id, org_id, login_id, org_name, role, state, since, last_opened_at)
       VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', NULL, ?)
       ON CONFLICT (db_name) DO UPDATE SET login_id = excluded.login_id, org_name = excluded.org_name, role = excluded.role,
         state = CASE WHEN workspaces.state = 'LOCKED_REVOKED' THEN workspaces.state ELSE 'ACTIVE' END,
         since = CASE WHEN workspaces.state = 'LOCKED_REVOKED' THEN workspaces.since ELSE NULL END,
         last_opened_at = excluded.last_opened_at`,
      [dbName, identity.userId, identity.orgId, identity.loginId, identity.orgName, identity.role, now],
    );
    return (await this.find(dbName))!;
  }

  async setState(dbName: string, state: WorkspaceEntryState, sinceMs: number | null): Promise<void> {
    await this.db.run(
      'UPDATE workspaces SET state = ?, since = COALESCE(since, ?) WHERE db_name = ?',
      [state, sinceMs === null ? null : new Date(sinceMs).toISOString(), dbName],
    );
  }

  /** Deletes a workspace database file and forgets it. */
  async remove(dbName: string): Promise<void> {
    await this.files.delete(dbName);
    await this.db.run('DELETE FROM workspaces WHERE db_name = ?', [dbName]);
  }

  /**
   * F12-AC20, Q14: held or locked workspaces whose 30 days have passed are deleted with everything in them.
   * `skip` is the workspace open right now (never deleted under the app's feet). Returns the names removed.
   */
  async purgeExpired(nowMs: number, skip: string | null = null): Promise<string[]> {
    const removed: string[] = [];
    for (const entry of await this.entries()) {
      if (entry.dbName === skip || entry.state === 'ACTIVE') continue;
      if (heldExpired(entry.since, nowMs)) {
        await this.remove(entry.dbName);
        removed.push(entry.dbName);
      }
    }
    return removed;
  }

  async close(): Promise<void> {
    await this.db.close();
  }
}

/** Opens (creating and migrating if needed) a workspace database. */
export async function openWorkspaceDb(files: DatabaseFiles, dbName: string, migrations: readonly Migration[] = WORKSPACE_MIGRATIONS): Promise<SqlDriver> {
  const db = await files.open(dbName);
  try {
    await runMigrations(db, migrations);
  } catch (err) {
    await db.close();
    throw err;
  }
  return db;
}

// Workspace-level sync state on the device (F12-AC14, AC15, AC20; plan Q14). One SQLite file per account and
// organization; `sync_meta` holds the pull cursor, last success, and whether the workspace is locked.
import type { SqlDriver, SqlExecutor } from '../local-db/driver.ts';
import { purgeSynced } from './retention.ts';
import type { EntityRegistry } from './registry.ts';

export type WorkspaceState = 'ACTIVE' | 'LOCKED_REVOKED';

export interface WorkspaceMeta {
  lastPullCursor: string | null;
  lastSuccessAt: string | null;
  protocolVersion: number;
  schemaVersion: number;
  workspaceState: WorkspaceState;
  revokedAt: string | null;
  signedOutAt: string | null;
  upgradeRequiredAt: string | null;
  lastCleanupAt: string | null;
  orgTimeZone: string;
}

interface MetaRow {
  last_pull_cursor: string | null;
  last_success_at: string | null;
  protocol_version: number;
  schema_version: number;
  workspace_state: WorkspaceState;
  revoked_at: string | null;
  signed_out_at: string | null;
  upgrade_required_at: string | null;
  last_cleanup_at: string | null;
  org_time_zone: string;
}

export async function readMeta(db: SqlExecutor): Promise<WorkspaceMeta> {
  const row = await db.get<MetaRow>('SELECT * FROM sync_meta WHERE id = 1');
  if (!row) throw new Error('sync_meta is missing; run the migrations first');
  return {
    lastPullCursor: row.last_pull_cursor,
    lastSuccessAt: row.last_success_at,
    protocolVersion: Number(row.protocol_version),
    schemaVersion: Number(row.schema_version),
    workspaceState: row.workspace_state,
    revokedAt: row.revoked_at,
    signedOutAt: row.signed_out_at,
    upgradeRequiredAt: row.upgrade_required_at,
    lastCleanupAt: row.last_cleanup_at,
    orgTimeZone: row.org_time_zone,
  };
}

/**
 * F12-AC14, AC20: access was revoked. Syncing stops for good, synced data is purged at once, and unsynced
 * operations stay on the device, locked and visible, until sign-out or 30 days after `revoked_at`.
 */
export async function lockWorkspace(db: SqlDriver, registry: EntityRegistry, nowMs: number): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.run(
      "UPDATE sync_meta SET workspace_state = 'LOCKED_REVOKED', revoked_at = COALESCE(revoked_at, ?) WHERE id = 1",
      [new Date(nowMs).toISOString()],
    );
    await purgeSynced(tx, registry);
  });
}

/**
 * Q14 "Sign out anyway": the synced cache is purged now; unsynced operations stay on the device, locked to this
 * account, for up to 30 days. They resume when the same account signs in again on this device.
 */
export async function holdForSignOut(db: SqlDriver, registry: EntityRegistry, nowMs: number): Promise<void> {
  await db.transaction(async (tx) => {
    await purgeSynced(tx, registry);
    await tx.run('UPDATE sync_meta SET signed_out_at = ? WHERE id = 1', [new Date(nowMs).toISOString()]);
  });
}

/**
 * The same account signed in again. Returns how many held unsynced changes resume (for the one-time
 * "Changes kept from your last sign-in" notice), or null if nothing was held.
 */
export async function resumeHeld(db: SqlDriver): Promise<number | null> {
  return db.transaction(async (tx) => {
    const meta = await readMeta(tx);
    if (!meta.signedOutAt) return null;
    await tx.run('UPDATE sync_meta SET signed_out_at = NULL WHERE id = 1');
    const row = await tx.get<{ n: number }>("SELECT COUNT(*) AS n FROM outbox WHERE state != 'SYNCED'");
    return Number(row?.n ?? 0);
  });
}

export async function setOrgTimeZone(db: SqlDriver, timeZone: string): Promise<void> {
  await db.run('UPDATE sync_meta SET org_time_zone = ? WHERE id = 1', [timeZone]);
}

// Device cache retention and purges (F12-AC19, F12-AC20, NFR-OFF-010/011; plan Q14, Q15).
// - Synced rows older than the retention window (120 days for daily records, measured by `report_date` against
//   today's date in the organization's timezone) are removed from the device; they still load from the server.
// - Unsynced rows are never removed by cleanup: a row with any operation that is not SYNCED is always kept.
// - The "purge synced" step is shared by revocation (immediately), "Sign out anyway" (Q14), and scope resets.
import type { SqlExecutor } from '../local-db/driver.ts';
import type { EntityRegistry } from './registry.ts';

export const DAILY_RECORD_RETENTION_DAYS = 120;
/** Unsynced changes of a revoked or signed-out account are kept, locked, for this long (F12-AC20, Q14). */
export const HELD_UNSYNCED_DAYS = 30;
export const DAY_MS = 86_400_000;
/** Cleanup runs on start and then at most once a day. */
export const CLEANUP_INTERVAL_MS = DAY_MS;
export const DEFAULT_TIME_ZONE = 'Asia/Karachi';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Today's calendar date (YYYY-MM-DD) in `timeZone`, from the device clock. */
export function todayIn(nowMs: number, timeZone: string): string {
  const format = (zone: string) => {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(nowMs));
    const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    return `${part('year')}-${part('month')}-${part('day')}`;
  };
  try {
    return format(timeZone);
  } catch {
    // An unknown zone name never stops cleanup; the madrasa default applies.
    return format(DEFAULT_TIME_ZONE);
  }
}

/** The calendar date `days` before `date` (both YYYY-MM-DD). */
export function minusDays(date: string, days: number): string {
  if (!ISO_DATE.test(date)) throw new RangeError(`Not a calendar date: ${date}`);
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d) - days * DAY_MS).toISOString().slice(0, 10);
}

/** Records dated before this are past retention (a record exactly `days` old is kept). */
export function retentionCutoff(today: string, days: number): string {
  return minusDays(today, days);
}

/** F12-AC19 predicate: a synced record dated `reportDate` is past retention on `today`. */
export function isPastRetention(reportDate: string, today: string, days = DAILY_RECORD_RETENTION_DAYS): boolean {
  if (!ISO_DATE.test(reportDate)) return false; // unknown date: keep it
  return reportDate < retentionCutoff(today, days);
}

/** Cleanup is due on start (never run) and then once every 24 hours. */
export function cleanupDue(lastCleanupAt: string | null, nowMs: number): boolean {
  if (!lastCleanupAt) return true;
  const last = Date.parse(lastCleanupAt);
  return Number.isNaN(last) || nowMs - last >= CLEANUP_INTERVAL_MS || nowMs < last;
}

/** A held or locked workspace's unsynced changes are purged once this many days have passed (F12-AC20, Q14). */
export function heldExpired(since: string | null, nowMs: number, days = HELD_UNSYNCED_DAYS): boolean {
  if (!since) return false;
  const start = Date.parse(since);
  return !Number.isNaN(start) && nowMs - start >= days * DAY_MS;
}

/**
 * The clock purges and retention use (security review L6): the device clock, but never earlier than the last
 * server time a pull returned, so turning the phone's clock back cannot postpone a purge.
 */
export function effectiveNow(deviceNowMs: number, lastServerTime: string | null): number {
  const server = lastServerTime ? Date.parse(lastServerTime) : Number.NaN;
  return Number.isNaN(server) ? deviceNowMs : Math.max(deviceNowMs, server);
}

const UNSYNCED_IDS = "SELECT entity_id FROM outbox WHERE entity = ? AND state != 'SYNCED'";

/**
 * Removes every synced row of every registered entity, the synced outbox items, and cached conflicts, and resets
 * the pull cursor so the next sync starts from a fresh snapshot. Rows with unsynced operations, and those
 * operations, are kept. Runs inside the caller's transaction.
 */
export async function purgeSynced(tx: SqlExecutor, registry: EntityRegistry, options: { keepQueueHistory?: boolean } = {}): Promise<void> {
  for (const handler of registry.all()) {
    await tx.run(`DELETE FROM ${handler.table} WHERE id NOT IN (${UNSYNCED_IDS})`, [handler.entity]);
  }
  if (!options.keepQueueHistory) {
    await tx.run("DELETE FROM outbox WHERE state = 'SYNCED'");
    await tx.run('DELETE FROM conflicts');
  }
  // Server rows held back while local changes were unsynced are cached data too.
  await tx.run('DELETE FROM deferred_changes');
  await tx.run('UPDATE sync_meta SET last_pull_cursor = NULL WHERE id = 1');
}

/** Synced queue items stay listed for 24 hours (plan Q16); older ones are removed from the outbox. */
export const SYNCED_LISTED_MS = DAY_MS;

export async function pruneSyncedQueue(tx: SqlExecutor, nowMs: number): Promise<number> {
  const result = await tx.run("DELETE FROM outbox WHERE state = 'SYNCED' AND synced_at IS NOT NULL AND synced_at < ?", [
    new Date(nowMs - SYNCED_LISTED_MS).toISOString(),
  ]);
  return result.changes;
}

/** F12-AC19: removes synced rows past each entity's retention window. Returns how many rows were removed. */
export async function runRetention(tx: SqlExecutor, registry: EntityRegistry, nowMs: number): Promise<number> {
  const meta = await tx.get<{ org_time_zone: string }>('SELECT org_time_zone FROM sync_meta WHERE id = 1');
  const today = todayIn(nowMs, meta?.org_time_zone ?? DEFAULT_TIME_ZONE);
  let removed = 0;
  for (const handler of registry.all()) {
    if (!handler.retention) continue;
    const cutoff = retentionCutoff(today, handler.retention.days);
    const result = await tx.run(
      `DELETE FROM ${handler.table} WHERE ${handler.retention.dateColumn} < ? AND row_version IS NOT NULL AND id NOT IN (${UNSYNCED_IDS})`,
      [cutoff, handler.entity],
    );
    removed += result.changes;
  }
  await tx.run('UPDATE sync_meta SET last_cleanup_at = ? WHERE id = 1', [new Date(nowMs).toISOString()]);
  return removed;
}

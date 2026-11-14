// F06 · Keeping the device's Quran reference cache current (ADR-018 §4.2–§4.5; FR-SAB-014; DEC-B75, DEC-B79; P3).
// Plain TypeScript with injected I/O, so every path is unit-tested without a device.
//
// One check: ask `GET /quran/reference/version?have=<cached>`, then
// - CURRENT: nothing to download;
// - SUPERSEDED or UNKNOWN, or no cache yet: download the snapshot, verify it, and replace the cache whole. The old
//   cache stays usable until the new one passed every check;
// - REVOKED (a licence was withdrawn, DEC-B79): delete the cached rows now, then download the current snapshot, which
//   no longer holds the withdrawn data.
// Failures never touch a valid cache: no network, a timeout, a server error, a malformed or unverifiable snapshot, or
// an interrupted download all keep the last valid snapshot and retry with backoff. A lost membership
// (403 ACCESS_REVOKED) deletes the cache. Nothing here runs while the device is offline: an offline device keeps its
// copy until its next successful check, and nothing can reach it before that.
import { ReferenceVersionResponse } from '@hifz/contracts';
import { SNAPSHOT_FORMAT_VERSION } from '@hifz/domain/quran-ref';
import { ApiFailure } from '../../api/client.ts';
import type { SessionManager } from '../../auth/session.ts';
import type { SqlDriver } from '../../local-db/driver.ts';
import { applySnapshot, clearCache, noteChecked, noteFailure, noteSuccess, readCacheMeta, SnapshotRejectedError, verifySnapshot, type Sha256 } from './referenceCache.ts';

export interface ReferenceApi {
  version(have: string | null): Promise<ReferenceVersionResponse>;
  snapshot(): Promise<unknown>;
}

/** The HTTP API through the session (a 401 refreshes once; Student/Parent never get here). */
export function httpReferenceApi(session: Pick<SessionManager, 'authorized'>): ReferenceApi {
  return {
    version: async (have) => {
      const query = new URLSearchParams({ format: String(SNAPSHOT_FORMAT_VERSION) });
      if (have) query.set('have', have);
      const result = ReferenceVersionResponse.safeParse(await session.authorized<unknown>(`/quran/reference/version?${query.toString()}`));
      // An answer this build cannot read is a temporary failure, never a success.
      if (!result.success) throw new ApiFailure('INTERNAL', 502);
      return result.data;
    },
    snapshot: () => session.authorized<unknown>(`/quran/reference/snapshot?format=${SNAPSHOT_FORMAT_VERSION}`, { timeoutMs: 60_000 }),
  };
}

export type CheckTrigger = 'START' | 'FOREGROUND' | 'ONLINE' | 'AFTER_SYNC' | 'DAILY' | 'MANUAL';

export type CheckOutcome =
  | 'CURRENT'
  | 'UPDATED'
  /** The cached version was revoked and deleted; the current snapshot replaced it. */
  | 'REVOKED_REPLACED'
  /** The cached version was revoked and deleted; the current snapshot could not be fetched yet. */
  | 'REVOKED_CLEARED'
  | 'FAILED'
  | 'BACKOFF'
  | 'ACCESS_REVOKED'
  | 'SESSION_EXPIRED'
  | 'UPGRADE_REQUIRED';

export const BACKOFF_START_MS = 60_000;
export const BACKOFF_MAX_MS = 3_600_000;
/** Every 24 hours at least while the app runs (ADR-018 §4.2). Not an expiry: an old snapshot stays usable (P3). */
export const DAILY_CHECK_MS = 24 * 3_600_000;

/** 1 min, 2 min, 4 min … up to 1 h, by the number of failures so far. */
export const backoffMs = (failures: number): number => Math.min(BACKOFF_MAX_MS, BACKOFF_START_MS * 2 ** Math.max(0, failures));

export interface ReferenceSyncDeps {
  db: SqlDriver;
  api: ReferenceApi;
  sha256: Sha256;
  clock: () => number;
  /** Called after a 403 ACCESS_REVOKED, once the cache is deleted (the app locks the workspace as F12 does). */
  onAccessRevoked?: () => void;
}

const iso = (ms: number) => new Date(ms).toISOString();

export class ReferenceSync {
  private readonly deps: ReferenceSyncDeps;
  private inFlight: Promise<CheckOutcome> | null = null;
  private readonly listeners = new Set<(running: boolean) => void>();

  constructor(deps: ReferenceSyncDeps) {
    this.deps = deps;
  }

  get running(): boolean {
    return this.inFlight !== null;
  }

  subscribe(listener: (running: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Runs one check; a check already running is joined, never doubled (single flight). */
  check(trigger: CheckTrigger): Promise<CheckOutcome> {
    if (this.inFlight) return this.inFlight;
    const run = this.run(trigger).finally(() => {
      this.inFlight = null;
      for (const l of this.listeners) l(false);
    });
    this.inFlight = run;
    for (const l of this.listeners) l(true);
    return run;
  }

  /** Whether the 24-hour check is due (the last successful check is older than a day, or there was none). */
  async dailyDue(): Promise<boolean> {
    const meta = await readCacheMeta(this.deps.db);
    if (!meta?.checkedAt) return true;
    return this.deps.clock() - Date.parse(meta.checkedAt) >= DAILY_CHECK_MS;
  }

  private async run(trigger: CheckTrigger): Promise<CheckOutcome> {
    const { db, api, sha256, clock } = this.deps;
    let meta = await readCacheMeta(db);
    if (!meta) {
      // The cache's bookkeeping row is missing: treat as no cache, rebuild it, and fetch again (ADR-018 §4.4).
      await db.run('INSERT OR IGNORE INTO ref_meta (id) VALUES (1)');
      await clearCache(db, iso(clock()));
      meta = await readCacheMeta(db);
    }
    if (trigger !== 'MANUAL' && meta?.nextAttemptAt && Date.parse(meta.nextAttemptAt) > clock()) return 'BACKOFF';
    const have = meta?.referenceVersion ?? null;
    let revoked = false;
    try {
      let current = await api.version(have);
      if (have && current.cached?.status === 'REVOKED') {
        // DEC-B79: the copy held withdrawn data. Remove it before anything else.
        await clearCache(db, iso(clock()), have);
        revoked = true;
      } else if (have && current.cached?.status === 'CURRENT') {
        await noteChecked(db, iso(clock()), false);
        await noteSuccess(db);
        return 'CURRENT';
      }
      if (current.snapshotFormatVersion !== SNAPSHOT_FORMAT_VERSION) throw new SnapshotRejectedError('UNSUPPORTED_FORMAT');
      // An update is available until the new snapshot is verified and active.
      await noteChecked(db, iso(clock()), have !== null && !revoked);
      let snapshot;
      try {
        snapshot = await verifySnapshot(await api.snapshot(), current.referenceVersion, sha256);
      } catch (err) {
        // The data may have changed between the two calls: ask once more, and verify against the new version.
        if (!(err instanceof SnapshotRejectedError) || err.reason !== 'CHECKSUM_MISMATCH') throw err;
        const again = await api.version(null);
        if (again.referenceVersion === current.referenceVersion) throw err;
        current = again;
        snapshot = await verifySnapshot(await api.snapshot(), current.referenceVersion, sha256);
      }
      await applySnapshot(db, snapshot, current.referenceVersion, iso(clock()));
      return revoked ? 'REVOKED_REPLACED' : 'UPDATED';
    } catch (err) {
      return this.failed(err, revoked);
    }
  }

  private async failed(err: unknown, revoked: boolean): Promise<CheckOutcome> {
    const { db, clock } = this.deps;
    const now = clock();
    if (err instanceof ApiFailure && err.code === 'ACCESS_REVOKED') {
      await clearCache(db, iso(now));
      this.deps.onAccessRevoked?.();
      return 'ACCESS_REVOKED';
    }
    if (err instanceof ApiFailure && (err.code === 'SESSION_EXPIRED' || err.code === 'UNAUTHENTICATED')) return 'SESSION_EXPIRED';
    if (err instanceof ApiFailure && err.code === 'UPGRADE_REQUIRED') {
      await noteFailure(db, 'UPGRADE_REQUIRED', iso(now), null);
      return 'UPGRADE_REQUIRED';
    }
    const code =
      err instanceof SnapshotRejectedError ? err.reason : err instanceof ApiFailure ? (err.code === 'NETWORK' ? 'NETWORK' : err.status === 429 ? 'RATE_LIMITED' : 'SERVER') : 'SERVER';
    const meta = await readCacheMeta(db);
    await noteFailure(db, code, iso(now), iso(now + backoffMs(meta?.failures ?? 0)));
    return revoked ? 'REVOKED_CLEARED' : 'FAILED';
  }
}

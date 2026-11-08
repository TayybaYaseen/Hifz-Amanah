// The workspace sync banner's state (design.md §4.13, §5.9; UI spec §1). Pure, tested with Vitest. Exactly one
// primary state, by precedence. "All changes synced" only when nothing is unsynced and the server acknowledged a
// sync at least once (F12-AC9).
import type { QueueState } from '@hifz/domain/sync';

export type BannerState =
  | 'ACCESS_REVOKED'
  | 'UPGRADE_REQUIRED'
  | 'SESSION_EXPIRED'
  | 'ACTION_REQUIRED'
  | 'FAILED'
  | 'OFFLINE'
  | 'SYNCING'
  | 'PENDING'
  | 'SYNCED'
  | 'NOTHING';

export interface BannerInput {
  counts: Record<QueueState, number>;
  locked: boolean;
  upgradeRequired: boolean;
  sessionExpired: boolean;
  online: boolean;
  running: boolean;
  lastSuccessAt: string | null;
}

export interface Banner {
  state: BannerState;
  /** Items not SYNCED, or the ACTION_REQUIRED / FAILED count for those states. */
  count: number;
  /** Shown as "Last synced: {time}" only when known. */
  lastSuccessAt: string | null;
}

export function unsyncedOf(counts: Record<QueueState, number>): number {
  return counts.PENDING + counts.SYNCING + counts.FAILED + counts.ACTION_REQUIRED;
}

export function bannerFor(input: BannerInput): Banner {
  const unsynced = unsyncedOf(input.counts);
  const last = input.lastSuccessAt;
  if (input.locked) return { state: 'ACCESS_REVOKED', count: unsynced, lastSuccessAt: null };
  if (input.upgradeRequired) return { state: 'UPGRADE_REQUIRED', count: unsynced, lastSuccessAt: null };
  if (input.sessionExpired) return { state: 'SESSION_EXPIRED', count: unsynced, lastSuccessAt: null };
  if (input.counts.ACTION_REQUIRED > 0) return { state: 'ACTION_REQUIRED', count: input.counts.ACTION_REQUIRED, lastSuccessAt: last };
  if (input.counts.FAILED > 0) return { state: 'FAILED', count: input.counts.FAILED, lastSuccessAt: last };
  if (!input.online) return { state: 'OFFLINE', count: unsynced, lastSuccessAt: null };
  if (input.running && unsynced > 0) return { state: 'SYNCING', count: unsynced, lastSuccessAt: null };
  if (unsynced > 0) return { state: 'PENDING', count: unsynced, lastSuccessAt: last };
  if (last) return { state: 'SYNCED', count: 0, lastSuccessAt: last };
  return { state: 'NOTHING', count: 0, lastSuccessAt: null };
}

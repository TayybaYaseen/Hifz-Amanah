// F06 · What the Quran reference status card shows (ADR-018 §4.3; design.md §8 states; plan P3). Pure, so every state
// is unit-tested. It never reports success that did not happen: "Synced" only after a verified snapshot is active and
// the last check succeeded; every failure keeps saying which snapshot (if any) is still in use.
import type { CacheMeta } from './referenceCache.ts';

export type ReferenceViewKind =
  /** No snapshot yet; the first download has not run (or is waiting for the network). */
  | 'INITIAL_PENDING'
  /** A download is running. */
  | 'DOWNLOADING'
  /** A verified snapshot is active and the last check succeeded. */
  | 'SYNCED'
  /** Offline: the cached snapshot is in use. */
  | 'OFFLINE_CACHED'
  /** A newer version exists and has not been activated yet; the cached one is in use. */
  | 'UPDATE_AVAILABLE'
  /** The last check or download failed (network or server); the cached snapshot, if any, is in use. */
  | 'FAILED'
  /** The last download did not match its checksum and was discarded. */
  | 'CHECKSUM_MISMATCH'
  /** The server offered a format this app cannot read (update the app). */
  | 'UNSUPPORTED_FORMAT'
  /** The cached version was withdrawn and removed; no current snapshot yet. */
  | 'REVOKED'
  /** A snapshot is active but the madrasa has no Quran reference data. */
  | 'NO_DATA';

export type LayoutAvailability = 'AVAILABLE' | 'NONE' | 'WITHDRAWN';

export interface ReferenceView {
  kind: ReferenceViewKind;
  /** A verified snapshot is on the device and used for offline lookups. */
  usingCache: boolean;
  layout: LayoutAvailability;
  layoutVerified: boolean;
  /** Total Lines must be entered by hand (no usable layout, or no snapshot). Always allowed anyway (FR-SAB-008). */
  manualTotalLines: boolean;
  /** A previous version was revoked and removed (DEC-B79); shown as a neutral notice. */
  revokedNotice: boolean;
  revokedAt: string | null;
  /** A check is running in the background (the state above stays what it was). */
  checking: boolean;
  version: string | null;
  lastSyncedAt: string | null;
  errorCode: string | null;
}

const REJECTIONS = new Set(['CHECKSUM_MISMATCH', 'UNSUPPORTED_FORMAT', 'SCHEMA_INVALID', 'UPGRADE_REQUIRED']);

const rejectionKind = (code: string): ReferenceViewKind => (code === 'CHECKSUM_MISMATCH' || code === 'SCHEMA_INVALID' ? 'CHECKSUM_MISMATCH' : 'UNSUPPORTED_FORMAT');

export function referenceView(input: { meta: CacheMeta | null; running: boolean; online: boolean; surahCount: number }): ReferenceView {
  const { meta, running, online, surahCount } = input;
  const cached = Boolean(meta?.referenceVersion);
  const layout: LayoutAvailability = !cached ? 'NONE' : meta!.layoutWithdrawn ? 'WITHDRAWN' : meta!.layoutImportId ? 'AVAILABLE' : 'NONE';
  const error = meta?.lastErrorCode ?? null;
  let kind: ReferenceViewKind;
  if (!cached) {
    if (running) kind = 'DOWNLOADING';
    else if (error && REJECTIONS.has(error)) kind = rejectionKind(error);
    else if (meta?.revokedAt) kind = 'REVOKED';
    else if (error) kind = 'FAILED';
    else kind = 'INITIAL_PENDING';
  } else if (running && meta!.updateAvailable) kind = 'DOWNLOADING';
  else if (surahCount === 0) kind = 'NO_DATA';
  else if (error && REJECTIONS.has(error)) kind = rejectionKind(error);
  else if (!online) kind = 'OFFLINE_CACHED';
  else if (meta!.updateAvailable) kind = 'UPDATE_AVAILABLE';
  else if (error) kind = 'FAILED';
  else kind = 'SYNCED';
  return {
    kind,
    usingCache: cached,
    layout,
    layoutVerified: cached && layout === 'AVAILABLE' && meta!.layoutVerified,
    manualTotalLines: layout !== 'AVAILABLE',
    revokedNotice: Boolean(meta?.revokedAt),
    revokedAt: meta?.revokedAt ?? null,
    checking: running,
    version: meta?.referenceVersion ?? null,
    lastSyncedAt: meta?.fetchedAt ?? null,
    errorCode: error,
  };
}

/** A short, readable form of the version for the screen (the full hash is in the accessibility label). */
export const shortVersion = (version: string | null): string | null => (version ? version.slice(0, 12) : null);

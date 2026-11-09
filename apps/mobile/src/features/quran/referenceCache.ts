// F06 · The Quran reference cache on a Teacher/Admin device (ADR-018 §4; FR-SAB-014; DEC-B75, DEC-B79; plan P3).
//
// The cache lives in the workspace database (one per account and madrasa) in its own `ref_*` tables. It is
// disposable: nothing references it (no student, daily, or attendance record; no outbox row), so it can be deleted and
// fetched again at any time. It is replaced only whole, in one SQLite transaction, and only after the downloaded
// snapshot passed its checks; a failed or interrupted replacement leaves the last valid snapshot in place.
//
// No maximum age (plan P3): a valid snapshot stays usable offline until the device reconnects and learns that it was
// revoked or superseded. Only a revocation, a lost membership, or an unreadable cache deletes it.
import { ReferenceSnapshotV1Schema } from '@hifz/contracts';
import { canonicalJson, referenceIndex, SNAPSHOT_FORMAT_VERSION, type ReferenceIndex, type ReferenceSnapshotV1 } from '@hifz/domain/quran-ref';
import type { SqlDriver, SqlExecutor } from '../../local-db/driver.ts';
import type { Migration } from '../../local-db/migrations.ts';

/** Local schema for F06 (workspace migration 5; 4 is F04 attendance). Additive only: the outbox is untouched. */
export const quranReferenceMigration = (version: number): Migration => ({
  version,
  name: 'F06 Quran reference cache (ref_*)',
  up: async (tx) => {
    await tx.exec(`
      CREATE TABLE ref_meta (
        id                       INTEGER PRIMARY KEY CHECK (id = 1),
        reference_version        TEXT,
        snapshot_format_version  INTEGER,
        edition_code             TEXT,
        lines_per_page           INTEGER,
        layout_import_id         TEXT,
        layout_verified          INTEGER NOT NULL DEFAULT 0,
        layout_withdrawn         INTEGER NOT NULL DEFAULT 0,
        metadata_withdrawn       INTEGER NOT NULL DEFAULT 0,
        fetched_at               TEXT,
        checked_at               TEXT,
        update_available         INTEGER NOT NULL DEFAULT 0,
        last_error_code          TEXT,
        last_error_at            TEXT,
        failures                 INTEGER NOT NULL DEFAULT 0,
        next_attempt_at          TEXT,
        revoked_version          TEXT,
        revoked_at               TEXT
      );
      INSERT INTO ref_meta (id) VALUES (1);
      CREATE TABLE ref_surahs (
        number         INTEGER PRIMARY KEY,
        name_ar        TEXT NOT NULL,
        name_translit  TEXT NOT NULL,
        ayah_count     INTEGER NOT NULL
      );
      CREATE TABLE ref_paras (
        number       INTEGER PRIMARY KEY,
        start_surah  INTEGER NOT NULL,
        start_ayah   INTEGER NOT NULL,
        end_surah    INTEGER NOT NULL,
        end_ayah     INTEGER NOT NULL
      );
      CREATE TABLE ref_layout_lines (
        page        INTEGER NOT NULL,
        line        INTEGER NOT NULL,
        surah       INTEGER NOT NULL,
        ayah_start  INTEGER NOT NULL,
        ayah_end    INTEGER NOT NULL,
        PRIMARY KEY (page, line)
      );
      CREATE INDEX ref_layout_lines_surah ON ref_layout_lines (surah, ayah_start);
      CREATE TABLE ref_attribution (
        position  INTEGER PRIMARY KEY,
        text      TEXT NOT NULL
      );
    `);
  },
});

/** Why a downloaded snapshot was refused. None of these ever replaces the cache. */
export type SnapshotRejection = 'CHECKSUM_MISMATCH' | 'UNSUPPORTED_FORMAT' | 'SCHEMA_INVALID';

export class SnapshotRejectedError extends Error {
  readonly reason: SnapshotRejection;
  constructor(reason: SnapshotRejection) {
    super(`Quran reference snapshot refused: ${reason}`);
    this.name = 'SnapshotRejectedError';
    this.reason = reason;
  }
}

export type Sha256 = (text: string) => Promise<string>;

/**
 * Checks a downloaded snapshot before anything is written (ADR-018 §4.2 step 3): a supported format, the strict Zod
 * schema, row sanity (unique keys, end not before start), and the SHA-256 of its canonical bytes equal to the version
 * the server announced. The canonical serialization is exactly what the server sent (sorted keys, no whitespace).
 */
export async function verifySnapshot(payload: unknown, expectedVersion: string, sha256: Sha256): Promise<ReferenceSnapshotV1> {
  if (typeof payload !== 'object' || payload === null) throw new SnapshotRejectedError('SCHEMA_INVALID');
  const format = (payload as { snapshotFormatVersion?: unknown }).snapshotFormatVersion;
  if (format !== SNAPSHOT_FORMAT_VERSION) throw new SnapshotRejectedError('UNSUPPORTED_FORMAT');
  const parsed = ReferenceSnapshotV1Schema.safeParse(payload);
  if (!parsed.success) throw new SnapshotRejectedError('SCHEMA_INVALID');
  const snapshot = parsed.data as ReferenceSnapshotV1;
  const unique = (keys: string[]) => new Set(keys).size === keys.length;
  const sane =
    unique(snapshot.surahs.map((s) => String(s[0]))) &&
    unique(snapshot.paras.map((p) => String(p[0]))) &&
    unique(snapshot.lines.map((l) => `${l[0]}:${l[1]}`)) &&
    snapshot.lines.every((l) => l[4] >= l[3]) &&
    snapshot.paras.every((p) => p[3] > p[1] || (p[3] === p[1] && p[4] >= p[2]));
  if (!sane) throw new SnapshotRejectedError('SCHEMA_INVALID');
  if ((await sha256(canonicalJson(payload))) !== expectedVersion) throw new SnapshotRejectedError('CHECKSUM_MISMATCH');
  return snapshot;
}

/** Inserts many rows in a few statements (SQLite allows up to 999 variables per statement). */
async function insertRows(tx: SqlExecutor, table: string, columns: string[], rows: (string | number)[][]): Promise<void> {
  const per = Math.max(1, Math.floor(900 / columns.length));
  for (let i = 0; i < rows.length; i += per) {
    const chunk = rows.slice(i, i + per);
    const placeholders = chunk.map(() => `(${columns.map(() => '?').join(', ')})`).join(', ');
    await tx.run(`INSERT INTO ${table} (${columns.join(', ')}) VALUES ${placeholders}`, chunk.flat());
  }
}

/**
 * Replaces the whole cache with a verified snapshot, in one transaction (ADR-018 §4.2 step 4). If the app is killed or
 * anything fails before COMMIT, SQLite rolls back and the previous snapshot is still there.
 */
export async function applySnapshot(db: SqlDriver, snapshot: ReferenceSnapshotV1, referenceVersion: string, nowIso: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.exec('DELETE FROM ref_surahs; DELETE FROM ref_paras; DELETE FROM ref_layout_lines; DELETE FROM ref_attribution;');
    await insertRows(tx, 'ref_surahs', ['number', 'name_ar', 'name_translit', 'ayah_count'], snapshot.surahs);
    await insertRows(tx, 'ref_paras', ['number', 'start_surah', 'start_ayah', 'end_surah', 'end_ayah'], snapshot.paras);
    await insertRows(tx, 'ref_layout_lines', ['page', 'line', 'surah', 'ayah_start', 'ayah_end'], snapshot.lines);
    await insertRows(tx, 'ref_attribution', ['position', 'text'], snapshot.attribution.map((text, i) => [i + 1, text]));
    await tx.run(
      `UPDATE ref_meta SET reference_version = ?, snapshot_format_version = ?, edition_code = ?, lines_per_page = ?,
         layout_import_id = ?, layout_verified = ?, layout_withdrawn = ?, metadata_withdrawn = ?, fetched_at = ?, checked_at = ?,
         update_available = 0, last_error_code = NULL, last_error_at = NULL, failures = 0, next_attempt_at = NULL
       WHERE id = 1`,
      [
        referenceVersion,
        snapshot.snapshotFormatVersion,
        snapshot.edition.code,
        snapshot.edition.linesPerPage,
        snapshot.layout.importId,
        snapshot.layout.verified ? 1 : 0,
        snapshot.layout.withdrawn ? 1 : 0,
        snapshot.metadataWithdrawn ? 1 : 0,
        nowIso,
        nowIso,
      ],
    );
  });
}

/**
 * Deletes every cached row (revocation, lost membership, unreadable cache). With `revokedVersion`, records which
 * version was revoked and when, so Settings can say so (DEC-B79).
 */
export async function clearCache(db: SqlDriver, nowIso: string, revokedVersion: string | null = null): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.exec('DELETE FROM ref_surahs; DELETE FROM ref_paras; DELETE FROM ref_layout_lines; DELETE FROM ref_attribution;');
    await tx.run(
      `UPDATE ref_meta SET reference_version = NULL, snapshot_format_version = NULL, edition_code = NULL, lines_per_page = NULL,
         layout_import_id = NULL, layout_verified = 0, layout_withdrawn = 0, metadata_withdrawn = 0, fetched_at = NULL,
         update_available = 0, revoked_version = COALESCE(?, revoked_version), revoked_at = CASE WHEN ? IS NULL THEN revoked_at ELSE ? END
       WHERE id = 1`,
      [revokedVersion, revokedVersion, nowIso],
    );
  });
}

export interface CacheMeta {
  referenceVersion: string | null;
  formatVersion: number | null;
  layoutImportId: string | null;
  layoutVerified: boolean;
  layoutWithdrawn: boolean;
  metadataWithdrawn: boolean;
  fetchedAt: string | null;
  checkedAt: string | null;
  updateAvailable: boolean;
  lastErrorCode: string | null;
  lastErrorAt: string | null;
  failures: number;
  nextAttemptAt: string | null;
  revokedVersion: string | null;
  revokedAt: string | null;
}

interface MetaRow {
  reference_version: string | null;
  snapshot_format_version: number | null;
  layout_import_id: string | null;
  layout_verified: number;
  layout_withdrawn: number;
  metadata_withdrawn: number;
  fetched_at: string | null;
  checked_at: string | null;
  update_available: number;
  last_error_code: string | null;
  last_error_at: string | null;
  failures: number;
  next_attempt_at: string | null;
  revoked_version: string | null;
  revoked_at: string | null;
}

/** The cache's state, or null when `ref_meta` is missing (an unreadable cache: treat as none and refetch). */
export async function readCacheMeta(db: SqlExecutor): Promise<CacheMeta | null> {
  const r = await db.get<MetaRow>('SELECT * FROM ref_meta WHERE id = 1');
  if (!r) return null;
  return {
    referenceVersion: r.reference_version,
    formatVersion: r.snapshot_format_version,
    layoutImportId: r.layout_import_id,
    layoutVerified: r.layout_verified === 1,
    layoutWithdrawn: r.layout_withdrawn === 1,
    metadataWithdrawn: r.metadata_withdrawn === 1,
    fetchedAt: r.fetched_at,
    checkedAt: r.checked_at,
    updateAvailable: r.update_available === 1,
    lastErrorCode: r.last_error_code,
    lastErrorAt: r.last_error_at,
    failures: Number(r.failures),
    nextAttemptAt: r.next_attempt_at,
    revokedVersion: r.revoked_version,
    revokedAt: r.revoked_at,
  };
}

/** Bookkeeping updates (never touch the cached rows). */
export async function noteChecked(db: SqlExecutor, nowIso: string, updateAvailable: boolean): Promise<void> {
  await db.run('UPDATE ref_meta SET checked_at = ?, update_available = ? WHERE id = 1', [nowIso, updateAvailable ? 1 : 0]);
}

export async function noteFailure(db: SqlExecutor, code: string, nowIso: string, nextAttemptAt: string | null): Promise<void> {
  await db.run('UPDATE ref_meta SET last_error_code = ?, last_error_at = ?, failures = failures + 1, next_attempt_at = ? WHERE id = 1', [code, nowIso, nextAttemptAt]);
}

export async function noteSuccess(db: SqlExecutor): Promise<void> {
  await db.run('UPDATE ref_meta SET last_error_code = NULL, last_error_at = NULL, failures = 0, next_attempt_at = NULL WHERE id = 1');
}

/** Rebuilds a schema-valid snapshot from the cached rows (for lookups; the cache never stores the raw body). */
export async function loadIndex(db: SqlExecutor): Promise<(ReferenceIndex & { surahNames: Map<number, { nameAr: string; nameTranslit: string }>; attribution: string[] }) | null> {
  const meta = await readCacheMeta(db);
  if (!meta?.referenceVersion) return null;
  const surahs = await db.all<{ number: number; name_ar: string; name_translit: string; ayah_count: number }>('SELECT * FROM ref_surahs ORDER BY number');
  const paras = await db.all<{ number: number; start_surah: number; start_ayah: number; end_surah: number; end_ayah: number }>('SELECT * FROM ref_paras ORDER BY number');
  const lines = await db.all<{ page: number; line: number; surah: number; ayah_start: number; ayah_end: number }>('SELECT * FROM ref_layout_lines ORDER BY page, line');
  const attribution = (await db.all<{ text: string }>('SELECT text FROM ref_attribution ORDER BY position')).map((a) => a.text);
  const snapshot: ReferenceSnapshotV1 = {
    snapshotFormatVersion: 1,
    edition: { code: '', linesPerPage: 0, publisher: null, printingId: null, pageCount: null },
    layout: { importId: meta.layoutImportId, verified: meta.layoutVerified, withdrawn: meta.layoutWithdrawn },
    metadataWithdrawn: meta.metadataWithdrawn,
    surahs: surahs.map((s) => [Number(s.number), s.name_ar, s.name_translit, Number(s.ayah_count)]),
    paras: paras.map((p) => [Number(p.number), Number(p.start_surah), Number(p.start_ayah), Number(p.end_surah), Number(p.end_ayah)]),
    lines: lines.map((l) => [Number(l.page), Number(l.line), Number(l.surah), Number(l.ayah_start), Number(l.ayah_end)]),
    attribution,
  };
  return {
    ...referenceIndex(snapshot),
    surahNames: new Map(surahs.map((s) => [Number(s.number), { nameAr: s.name_ar, nameTranslit: s.name_translit }])),
    attribution,
  };
}

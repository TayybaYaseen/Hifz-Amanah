// F06 · The Quran reference snapshot (ADR-018; FR-SAB-014; DEC-B75, DEC-B77, DEC-B79). Pure rules, no I/O.
//
// The server builds one snapshot per madrasa from its active reference data; Teacher and Admin devices cache it and
// answer range questions offline. Both sides call `evaluateRange` below on the same rows, so for the same snapshot
// version the device's answer (derived Para, range issues, Total Lines pre-fill) equals the server's (F06-AC24).
//
// The snapshot holds no Quran text and no word-level data: Surah numbers, names as stored, Ayat counts, Para
// boundaries, and the Ayat lines of the active layout (page, line, Surah, first and last Ayat). Surah-heading and
// Bismillah lines are never included and never counted (DEC-B77). Hashing is left to the caller (node:crypto on the
// server, expo-crypto on the device): `referenceVersion = sha256(snapshotBody(snapshot))`.
import { canonicalJson } from './metadata.ts';
import {
  ayahLines,
  countLines,
  paraFor,
  validateAyahRange,
  type AyahRange,
  type LayoutRow,
  type ParaBoundary,
  type RangeIssue,
  type SurahMeta,
  type SurahRecord,
} from './range.ts';

/** The snapshot format this code builds and reads. A new format is a new number; the server serves N and N−1. */
export const SNAPSHOT_FORMAT_VERSION = 1;
/** The oldest format the server still serves; an app asking for less gets 426 UPGRADE_REQUIRED. */
export const SNAPSHOT_MIN_FORMAT_VERSION = 1;

/** `[number, nameAr, nameTranslit, ayahCount]`; `nameAr` is byte-exact as stored (BR-15). */
export type SnapshotSurahRow = [number, string, string, number];
/** `[number, startSurah, startAyah, endSurah, endAyah]`. */
export type SnapshotParaRow = [number, number, number, number, number];
/** `[page, line, surah, ayahStart, ayahEnd]`, Ayat lines only. */
export type SnapshotLineRow = [number, number, number, number, number];

export interface ReferenceSnapshotV1 {
  snapshotFormatVersion: 1;
  edition: { code: string; linesPerPage: number; publisher: string | null; printingId: string | null; pageCount: number | null };
  /**
   * The madrasa's active layout. `verified` reports the human reviewer's signed comparison with the physical Mushaf
   * on a production import (DEC-B78); it is not an automated proof. `withdrawn`: a layout exists but a source's
   * licence no longer allows distributing it, so `lines` is empty and Total Lines is entered by hand (DEC-B79).
   */
  layout: { importId: string | null; verified: boolean; withdrawn: boolean };
  /** Some Surah or Para rows were left out because a source's licence was withdrawn (DEC-B79, plan P1). */
  metadataWithdrawn: boolean;
  surahs: SnapshotSurahRow[];
  paras: SnapshotParaRow[];
  lines: SnapshotLineRow[];
  /** Credit text the licences require. DEFERRED: OD-QR-9 decides its wording and where it is shown. */
  attribution: string[];
}

export interface SnapshotInput {
  edition: ReferenceSnapshotV1['edition'];
  layout: ReferenceSnapshotV1['layout'];
  metadataWithdrawn: boolean;
  surahs: readonly SurahRecord[];
  paras: readonly ParaBoundary[];
  /** The active layout's rows; heading and Bismillah rows are dropped here. */
  lines: readonly LayoutRow[];
  attribution: readonly string[];
}

const byNumbers = (a: readonly number[], b: readonly number[]): number => {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
  return a.length - b.length;
};

/**
 * Builds the snapshot in its one canonical order, so the same reference data always gives the same body and the
 * same version on every server (determinism; ADR-018 §3.2).
 */
export function buildSnapshot(input: SnapshotInput): ReferenceSnapshotV1 {
  const surahs: SnapshotSurahRow[] = [...input.surahs]
    .sort((a, b) => a.number - b.number)
    .map((s) => [s.number, s.nameAr, s.nameTranslit, s.ayahCount]);
  const paras: SnapshotParaRow[] = [...input.paras]
    .map((p): SnapshotParaRow => [p.number, p.start.surah, p.start.ayah, p.end.surah, p.end.ayah])
    .sort(byNumbers);
  const lines: SnapshotLineRow[] = ayahLines(input.lines)
    .map((l): SnapshotLineRow => [l.page, l.line, l.surah, l.ayahStart, l.ayahEnd])
    .sort(byNumbers);
  return {
    snapshotFormatVersion: SNAPSHOT_FORMAT_VERSION,
    edition: { ...input.edition },
    layout: { ...input.layout },
    metadataWithdrawn: input.metadataWithdrawn,
    surahs,
    paras,
    lines,
    attribution: [...new Set(input.attribution)].sort(),
  };
}

/** The exact bytes the server sends and the device hashes: canonical JSON (sorted keys, no whitespace). */
export const snapshotBody = (snapshot: ReferenceSnapshotV1): string => canonicalJson(snapshot);

/** The rows the range rules need, decoded from a snapshot. */
export interface ReferenceIndex {
  surahs: SurahMeta[];
  paras: ParaBoundary[];
  lines: LayoutRow[];
  layoutImportId: string | null;
  metadataWithdrawn: boolean;
}

export function referenceIndex(snapshot: ReferenceSnapshotV1): ReferenceIndex {
  return {
    surahs: snapshot.surahs.map(([number, , , ayahCount]) => ({ number, ayahCount })),
    paras: snapshot.paras.map(([number, startSurah, startAyah, endSurah, endAyah]) => ({
      number,
      start: { surah: startSurah, ayah: startAyah },
      end: { surah: endSurah, ayah: endAyah },
    })),
    lines: snapshot.lines.map(([page, line, surah, ayahStart, ayahEnd]) => ({ page, line, surah, lineType: 'AYAH', ayahStart, ayahEnd })),
    layoutImportId: snapshot.layout.importId,
    metadataWithdrawn: snapshot.metadataWithdrawn,
  };
}

/** What the Total Lines field shows: a pre-fill from the layout, or nothing (the Teacher enters it; FR-SAB-008). */
export type LineCountOrigin = 'LAYOUT' | 'UNAVAILABLE';

export interface RangeEvaluation {
  /** The Para the range starts in (FR-SAB-001), or null when no boundary covers it. */
  para: number | null;
  issues: RangeIssue[];
  totalLines: number | null;
  source: LineCountOrigin;
  layoutImportId: string | null;
}

/**
 * One Sabaq range against the madrasa's reference rows: field issues first; with none, the derived Para and the
 * Total Lines pre-fill (Ayat lines only, DEC-B77). The server's `GET /quran/line-count` and the device's offline
 * lookup both return exactly this (F06-AC24).
 */
export function evaluateRange(
  range: { surah: number | null | undefined; ayahStart: number | null | undefined; ayahEnd: number | null | undefined },
  ref: Pick<ReferenceIndex, 'surahs' | 'paras' | 'lines' | 'layoutImportId'>,
): RangeEvaluation {
  const issues = validateAyahRange(range, ref.surahs);
  if (issues.length) return { para: null, issues, totalLines: null, source: 'UNAVAILABLE', layoutImportId: ref.layoutImportId };
  const r = range as AyahRange;
  const totalLines = ref.layoutImportId === null ? null : countLines(r, ref.lines);
  return {
    para: paraFor({ surah: r.surah, ayah: r.ayahStart }, ref.paras),
    issues: [],
    totalLines,
    source: totalLines === null ? 'UNAVAILABLE' : 'LAYOUT',
    layoutImportId: ref.layoutImportId,
  };
}

/**
 * Whether the device can check this range offline. When licence withdrawal removed Surah rows (`metadataWithdrawn`),
 * a Surah missing from the cache is not proof that the Surah is unknown, so the device must not show a false error:
 * it leaves the check to the server on sync (FR-SAB-009) instead.
 */
export function canCheckOffline(surah: number | null | undefined, ref: Pick<ReferenceIndex, 'surahs' | 'metadataWithdrawn'>): boolean {
  if (surah === null || surah === undefined) return true;
  return !ref.metadataWithdrawn || ref.surahs.some((s) => s.number === surah);
}

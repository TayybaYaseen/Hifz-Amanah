// F06 · Quran reference validation (FR-SAB-002, FR-SAB-005…008, FR-I18N-006, BR-15; ARCHITECTURE.md §5 `quran-ref`;
// US-024…026). Pure rules over the madrasa's active metadata, no I/O.
//
// Surah names are stored exactly as entered: nothing here trims, normalizes, translates, or transliterates Arabic
// text (BR-15, F06-AC3).

export const PARA_MIN = 1;
export const PARA_MAX = 30;
export const SURAH_MIN = 1;
export const SURAH_MAX = 114;

/**
 * The default edition: the 16-line Indo-Pak (South Asian) Mushaf (DEC-B70, 2026-11-09). Editions are rows in the
 * `mushaf_editions` catalogue, not constants, so a future edition needs no code change; nothing in the rules assumes
 * a line count per page except where the edition's own `linesPerPage` is passed in.
 * DEFERRED: DEC-B70 — the exact publisher/edition and its verified line layout are not yet approved.
 */
export const DEFAULT_MUSHAF_EDITION = 'INDOPAK_16_LINE';

export interface MushafEditionInfo {
  code: string;
  linesPerPage: number;
}

export interface SurahMeta {
  number: number;
  ayahCount: number;
}

export interface SurahRecord extends SurahMeta {
  nameAr: string;
  nameTranslit: string;
}

/** A position in the Quran. */
export interface AyahRef {
  surah: number;
  ayah: number;
}

export interface ParaBoundary {
  number: number;
  start: AyahRef;
  end: AyahRef;
}

/** One Ayat line of a page/line layout (one Mushaf edition): which Ayat of one Surah appear on it. */
export interface LayoutLine {
  page: number;
  line: number;
  surah: number;
  ayahStart: number;
  ayahEnd: number;
}

/** The kinds of printed line a layout stores (FR-SAB-012, ADR-017 §3.8). */
export const LINE_TYPES = ['AYAH', 'SURAH_NAME', 'BASMALLAH'] as const;
export type LineType = (typeof LINE_TYPES)[number];

/**
 * Any stored layout row: an Ayat line, or a Surah-heading or Bismillah line with no Ayat. A row without `lineType`
 * is an Ayat line (format-1 imports).
 */
export interface LayoutRow {
  page: number;
  line: number;
  surah: number;
  lineType?: LineType;
  ayahStart: number | null;
  ayahEnd: number | null;
}

export interface AyahRange {
  surah: number;
  ayahStart: number;
  ayahEnd: number;
}

/** A range that may continue into a later Surah (Sabqi/Manzil; edge case "A range spans two Surahs"). */
export interface SpanRange {
  start: AyahRef;
  end: AyahRef;
}

/** Field refusals. `max` names the limit the user crossed (F06-AC6: "names the maximum Ayat"). */
export type RangeIssue =
  | { field: 'para'; code: 'OUT_OF_RANGE'; min: number; max: number }
  | { field: 'surah'; code: 'REQUIRED' | 'UNKNOWN' }
  | { field: 'ayahStart' | 'ayahEnd'; code: 'REQUIRED' | 'NOT_WHOLE' | 'OUT_OF_RANGE'; max?: number }
  | { field: 'range'; code: 'END_BEFORE_START' | 'CROSSES_SURAH' };

const isWhole = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n);

/** Para 1–30 (F06-AC5). */
export function validatePara(para: number): RangeIssue[] {
  return isWhole(para) && para >= PARA_MIN && para <= PARA_MAX ? [] : [{ field: 'para', code: 'OUT_OF_RANGE', min: PARA_MIN, max: PARA_MAX }];
}

/** Orders two positions: negative when a is before b. */
export const compareRef = (a: AyahRef, b: AyahRef): number => (a.surah !== b.surah ? a.surah - b.surah : a.ayah - b.ayah);

const surahIn = (surahs: readonly SurahMeta[], n: number): SurahMeta | undefined => surahs.find((s) => s.number === n);

function checkAyah(field: 'ayahStart' | 'ayahEnd', ayah: number | null | undefined, surah: SurahMeta | undefined): RangeIssue[] {
  if (ayah === null || ayah === undefined) return [{ field, code: 'REQUIRED' }];
  if (!isWhole(ayah)) return [{ field, code: 'NOT_WHOLE' }];
  if (!surah) return [];
  return ayah < 1 || ayah > surah.ayahCount ? [{ field, code: 'OUT_OF_RANGE', max: surah.ayahCount }] : [];
}

/**
 * A range within one Surah: the Surah exists, both Ayat lie in 1..ayahCount, and start ≤ end (F06-AC6, AC7;
 * FR-SAB-002, FR-SAB-009). Sabaq ranges always use this form.
 */
export function validateAyahRange(
  range: { surah: number | null | undefined; ayahStart: number | null | undefined; ayahEnd: number | null | undefined },
  surahs: readonly SurahMeta[],
): RangeIssue[] {
  const issues: RangeIssue[] = [];
  let meta: SurahMeta | undefined;
  if (range.surah === null || range.surah === undefined) issues.push({ field: 'surah', code: 'REQUIRED' });
  else {
    meta = surahIn(surahs, range.surah);
    if (!meta) issues.push({ field: 'surah', code: 'UNKNOWN' });
  }
  issues.push(...checkAyah('ayahStart', range.ayahStart, meta), ...checkAyah('ayahEnd', range.ayahEnd, meta));
  if (issues.length === 0 && (range.ayahStart as number) > (range.ayahEnd as number)) {
    issues.push({ field: 'range', code: 'END_BEFORE_START' });
  }
  return issues;
}

/** A range that may cross into later Surahs: both ends valid, start not after end. */
export function validateSpan(span: SpanRange, surahs: readonly SurahMeta[]): RangeIssue[] {
  const issues: RangeIssue[] = [];
  const startMeta = surahIn(surahs, span.start.surah);
  const endMeta = surahIn(surahs, span.end.surah);
  if (!startMeta || !endMeta) issues.push({ field: 'surah', code: 'UNKNOWN' });
  issues.push(...checkAyah('ayahStart', span.start.ayah, startMeta), ...checkAyah('ayahEnd', span.end.ayah, endMeta));
  if (issues.length === 0 && compareRef(span.start, span.end) > 0) issues.push({ field: 'range', code: 'END_BEFORE_START' });
  return issues;
}

/** Metadata edits by the Admin (F06-AC1, AC4). */
export type MetadataIssue =
  | { field: 'number'; code: 'OUT_OF_RANGE'; min: number; max: number }
  | { field: 'nameAr' | 'nameTranslit'; code: 'REQUIRED' | 'TOO_LONG' }
  | { field: 'ayahCount'; code: 'OUT_OF_RANGE'; min: number; max: number }
  | { field: 'start' | 'end'; code: 'UNKNOWN_SURAH' | 'OUT_OF_RANGE'; max?: number }
  | { field: 'end'; code: 'END_BEFORE_START' };

export const SURAH_NAME_MAX = 100;
/** The longest Surah (Al-Baqarah) has 286 Ayat; the limit leaves room for Admin corrections without accepting junk. */
export const AYAH_COUNT_MAX = 999;

/** A Surah row as the Admin saves it. The Arabic name is checked, never altered. */
export function validateSurah(s: SurahRecord): MetadataIssue[] {
  const issues: MetadataIssue[] = [];
  if (!isWhole(s.number) || s.number < SURAH_MIN || s.number > SURAH_MAX) issues.push({ field: 'number', code: 'OUT_OF_RANGE', min: SURAH_MIN, max: SURAH_MAX });
  for (const field of ['nameAr', 'nameTranslit'] as const) {
    if (s[field].trim() === '') issues.push({ field, code: 'REQUIRED' });
    else if (s[field].length > SURAH_NAME_MAX) issues.push({ field, code: 'TOO_LONG' });
  }
  if (!isWhole(s.ayahCount) || s.ayahCount < 1 || s.ayahCount > AYAH_COUNT_MAX) issues.push({ field: 'ayahCount', code: 'OUT_OF_RANGE', min: 1, max: AYAH_COUNT_MAX });
  return issues;
}

/** A Para boundary: number 1–30, both ends inside known Surahs, end not before start (F06-AC4). */
export function validateParaBoundary(p: ParaBoundary, surahs: readonly SurahMeta[]): MetadataIssue[] {
  const issues: MetadataIssue[] = [];
  if (!isWhole(p.number) || p.number < PARA_MIN || p.number > PARA_MAX) issues.push({ field: 'number', code: 'OUT_OF_RANGE', min: PARA_MIN, max: PARA_MAX });
  for (const field of ['start', 'end'] as const) {
    const ref = p[field];
    const meta = surahIn(surahs, ref.surah);
    if (!meta) issues.push({ field, code: 'UNKNOWN_SURAH' });
    else if (!isWhole(ref.ayah) || ref.ayah < 1 || ref.ayah > meta.ayahCount) issues.push({ field, code: 'OUT_OF_RANGE', max: meta.ayahCount });
  }
  if (issues.length === 0 && compareRef(p.end, p.start) < 0) issues.push({ field: 'end', code: 'END_BEFORE_START' });
  return issues;
}

/**
 * The Para a position falls in (FR-SAB-001: Sabaq's Para is derived from its Surah and start Ayat). Null when the
 * metadata has no boundary covering it; the caller then asks the Teacher instead of guessing.
 */
export function paraFor(ref: AyahRef, paras: readonly ParaBoundary[]): number | null {
  const hit = paras.find((p) => compareRef(p.start, ref) <= 0 && compareRef(ref, p.end) <= 0);
  return hit ? hit.number : null;
}

/**
 * Lines a single-Surah range covers on the given edition's verified layout (FR-SAB-008): every layout line of that Surah holding at
 * least one Ayat of the range. Null when the layout does not cover every Ayat of the range, so Total Lines is left
 * for the Teacher to enter and nothing is guessed (F05 edge case "no line data").
 *
 * Only Ayat lines count; Surah-heading and Bismillah lines never do (FR-SAB-012). This keeps the behaviour built
 * before line types existed, and is the decided rule (DEC-B77, 2026-11-09).
 */
export function countLines(range: AyahRange, layout: readonly LayoutRow[]): number | null {
  const lines = ayahLines(layout).filter((l) => l.surah === range.surah && l.ayahEnd >= range.ayahStart && l.ayahStart <= range.ayahEnd);
  if (lines.length === 0) return null;
  // Every Ayat in the range must appear on some line.
  const covered = new Set<number>();
  for (const l of lines) {
    for (let a = Math.max(l.ayahStart, range.ayahStart); a <= Math.min(l.ayahEnd, range.ayahEnd); a++) covered.add(a);
  }
  if (covered.size !== range.ayahEnd - range.ayahStart + 1) return null;
  return new Set(lines.map((l) => `${l.page}:${l.line}`)).size;
}

/** The Ayat lines of a layout (rows typed `AYAH`, or untyped format-1 rows), with their Ayat present. */
export function ayahLines(layout: readonly LayoutRow[]): LayoutLine[] {
  const out: LayoutLine[] = [];
  for (const l of layout) {
    if ((l.lineType ?? 'AYAH') !== 'AYAH' || l.ayahStart === null || l.ayahEnd === null) continue;
    out.push({ page: l.page, line: l.line, surah: l.surah, ayahStart: l.ayahStart, ayahEnd: l.ayahEnd });
  }
  return out;
}

/**
 * Records whose stored range is no longer valid after a metadata edit (F06-AC19, FR-SAB-007). The records are never
 * changed; the caller lists these for Admin review.
 */
export function rangesNeedingReview<T extends { id: string; range: AyahRange }>(records: readonly T[], surahs: readonly SurahMeta[]): T[] {
  return records.filter((r) => validateAyahRange(r.range, surahs).length > 0);
}

// F06 · Metadata completeness, seed-file validation, and line-count provenance (FR-SAB-007, FR-SAB-008; DEC-B31,
// DEC-B32, DEC-B70). Pure rules, no I/O.
//
// Nothing here creates Quran data. These functions only check data that an approved dataset supplies, and report what
// is missing or inconsistent so an Admin can review it. Records are never rewritten from these results.
import {
  PARA_MAX,
  SURAH_MAX,
  compareRef,
  validateParaBoundary,
  validateSurah,
  type AyahRef,
  type LayoutLine,
  type MetadataIssue,
  type ParaBoundary,
  type SurahMeta,
  type SurahRecord,
} from './range.ts';

// ---------- Completeness and consistency of a madrasa's metadata (the review list) ----------

export type MetadataFinding =
  | { code: 'MISSING_SURAHS'; numbers: number[] }
  | { code: 'MISSING_PARAS'; numbers: number[] }
  /** A Para boundary no longer fits the Surah metadata, e.g. after an Ayat-count correction (F06-AC19). */
  | { code: 'PARA_INVALID'; para: number; issues: MetadataIssue[] }
  /** Two consecutive Paras overlap, or leave Ayat that belong to no Para. */
  | { code: 'PARA_OVERLAP' | 'PARA_GAP'; para: number; next: number }
  /** No verified page/line layout for the madrasa's edition: Total Lines is entered by hand (FR-SAB-008). */
  | { code: 'LAYOUT_MISSING'; edition: string };

const missing = (have: Iterable<number>, max: number): number[] => {
  const set = new Set(have);
  const out: number[] = [];
  for (let n = 1; n <= max; n++) if (!set.has(n)) out.push(n);
  return out;
};

/** The position right after `ref`, or null at the end of the last known Surah. */
function nextRef(ref: AyahRef, surahs: readonly SurahMeta[]): AyahRef | null {
  const meta = surahs.find((s) => s.number === ref.surah);
  if (!meta) return null;
  if (ref.ayah < meta.ayahCount) return { surah: ref.surah, ayah: ref.ayah + 1 };
  return surahs.some((s) => s.number === ref.surah + 1) ? { surah: ref.surah + 1, ayah: 1 } : null;
}

/**
 * What an Admin should review in the metadata: missing Surahs or Paras, Para boundaries that no longer fit, and
 * overlaps or gaps between consecutive Paras. Empty means the metadata is complete and consistent.
 */
export function metadataFindings(surahs: readonly SurahMeta[], paras: readonly ParaBoundary[]): MetadataFinding[] {
  const findings: MetadataFinding[] = [];
  const missingSurahs = missing(surahs.map((s) => s.number), SURAH_MAX);
  if (missingSurahs.length) findings.push({ code: 'MISSING_SURAHS', numbers: missingSurahs });
  const missingParas = missing(paras.map((p) => p.number), PARA_MAX);
  if (missingParas.length) findings.push({ code: 'MISSING_PARAS', numbers: missingParas });

  const sorted = [...paras].sort((a, b) => a.number - b.number);
  const valid = new Set<number>();
  for (const p of sorted) {
    const issues = validateParaBoundary(p, surahs);
    if (issues.length) findings.push({ code: 'PARA_INVALID', para: p.number, issues });
    else valid.add(p.number);
  }
  for (let i = 0; i + 1 < sorted.length; i++) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    if (b.number !== a.number + 1 || !valid.has(a.number) || !valid.has(b.number)) continue;
    if (compareRef(b.start, a.end) <= 0) findings.push({ code: 'PARA_OVERLAP', para: a.number, next: b.number });
    else {
      const expected = nextRef(a.end, surahs);
      if (!expected || compareRef(expected, b.start) !== 0) findings.push({ code: 'PARA_GAP', para: a.number, next: b.number });
    }
  }
  return findings;
}

// ---------- Line-count provenance (FR-SAB-008; DEC-B64, DEC-B70) ----------

/** LAYOUT: the Teacher kept the count pre-filled from a verified layout. MANUAL: entered or corrected by hand. */
export type LineCountSource = 'LAYOUT' | 'MANUAL';

/** How a confirmed Total Lines came about. With no layout count to pre-fill, it is always MANUAL. */
export const lineCountSource = (prefilled: number | null, confirmed: number): LineCountSource =>
  prefilled !== null && prefilled === confirmed ? 'LAYOUT' : 'MANUAL';

// ---------- Seed files (the versioned, repeatable loader input) ----------

export const SEED_FORMAT = 'hifz-quran-seed';
export const SEED_FORMAT_VERSION = 1;

export interface SeedProvenance {
  sourceName: string;
  sourceUrl: string | null;
  licence: string;
  /** Required for production data: the reviewer nominated by the product owner (DEC-B31). */
  reviewedBy: string | null;
  approvedOn: string | null;
  /** Test fixtures only. A synthetic seed is refused outside tests and never counts as the production seed. */
  synthetic: boolean;
}

export interface SeedLayout {
  edition: string;
  linesPerPage: number;
  lines: LayoutLine[];
}

export interface QuranSeed {
  format: typeof SEED_FORMAT;
  formatVersion: typeof SEED_FORMAT_VERSION;
  datasetKey: string;
  datasetVersion: string;
  provenance: SeedProvenance;
  metadata: { surahs: SurahRecord[]; paras: ParaBoundary[] } | null;
  layouts: SeedLayout[];
}

export interface SeedIssue {
  path: string;
  code: string;
}

export interface SeedContext {
  /** Editions the catalogue knows, with their lines per page. */
  editions: readonly { code: string; linesPerPage: number }[];
  /** True only when NODE_ENV=test. */
  allowSynthetic: boolean;
  /** Surah metadata to check layout lines against when the seed carries none (the madrasa's current rows). */
  existingSurahs: readonly SurahMeta[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATASET_KEY = /^[a-z0-9][a-z0-9._-]{1,79}$/;
const blank = (s: unknown): boolean => typeof s !== 'string' || s.trim() === '';

/**
 * Validates a whole seed file before anything is written. A seed with any issue is refused in full (no partial
 * import). Production seeds must be complete: 114 Surahs and 30 consistent Paras (F06-AC18).
 */
export function validateSeed(seed: QuranSeed, ctx: SeedContext): SeedIssue[] {
  const issues: SeedIssue[] = [];
  const push = (path: string, code: string) => issues.push({ path, code });

  if (seed.format !== SEED_FORMAT || seed.formatVersion !== SEED_FORMAT_VERSION) push('format', 'UNSUPPORTED');
  if (typeof seed.datasetKey !== 'string' || !DATASET_KEY.test(seed.datasetKey)) push('datasetKey', 'INVALID');
  if (blank(seed.datasetVersion) || seed.datasetVersion.length > 40) push('datasetVersion', 'INVALID');

  const p = seed.provenance;
  if (blank(p.sourceName)) push('provenance.sourceName', 'REQUIRED');
  if (blank(p.licence)) push('provenance.licence', 'REQUIRED');
  if (p.synthetic) {
    if (!ctx.allowSynthetic) push('provenance.synthetic', 'NOT_ALLOWED');
  } else {
    if (blank(p.reviewedBy)) push('provenance.reviewedBy', 'REQUIRED');
    if (typeof p.approvedOn !== 'string' || !ISO_DATE.test(p.approvedOn)) push('provenance.approvedOn', 'REQUIRED');
  }

  if (!seed.metadata && seed.layouts.length === 0) push('metadata', 'EMPTY');

  let surahs: readonly SurahMeta[] = ctx.existingSurahs;
  if (seed.metadata) {
    const seen = new Set<number>();
    seed.metadata.surahs.forEach((s, i) => {
      for (const issue of validateSurah(s)) push(`metadata.surahs[${i}].${issue.field}`, issue.code);
      if (seen.has(s.number)) push(`metadata.surahs[${i}].number`, 'DUPLICATE');
      seen.add(s.number);
    });
    surahs = seed.metadata.surahs;
    const paraSeen = new Set<number>();
    seed.metadata.paras.forEach((para, i) => {
      for (const issue of validateParaBoundary(para, surahs)) push(`metadata.paras[${i}].${issue.field}`, issue.code);
      if (paraSeen.has(para.number)) push(`metadata.paras[${i}].number`, 'DUPLICATE');
      paraSeen.add(para.number);
    });
    if (!p.synthetic) {
      for (const f of metadataFindings(surahs, seed.metadata.paras)) {
        if (f.code !== 'PARA_INVALID') push('metadata', f.code);
      }
    }
  }

  const editionSeen = new Set<string>();
  seed.layouts.forEach((layout, li) => {
    const base = `layouts[${li}]`;
    const edition = ctx.editions.find((e) => e.code === layout.edition);
    if (!edition) push(`${base}.edition`, 'UNKNOWN');
    else if (layout.linesPerPage !== edition.linesPerPage) push(`${base}.linesPerPage`, 'MISMATCH');
    if (editionSeen.has(layout.edition)) push(`${base}.edition`, 'DUPLICATE');
    editionSeen.add(layout.edition);
    if (layout.lines.length === 0) push(`${base}.lines`, 'EMPTY');
    if (surahs.length === 0) push(`${base}.lines`, 'NO_SURAH_METADATA');
    const slots = new Set<string>();
    layout.lines.forEach((l, i) => {
      const at = `${base}.lines[${i}]`;
      const whole = [l.page, l.line, l.surah, l.ayahStart, l.ayahEnd].every((n) => Number.isSafeInteger(n));
      if (!whole) return push(at, 'NOT_WHOLE');
      if (l.page < 1) push(`${at}.page`, 'OUT_OF_RANGE');
      if (l.line < 1 || l.line > layout.linesPerPage) push(`${at}.line`, 'OUT_OF_RANGE');
      const key = `${l.page}:${l.line}`;
      if (slots.has(key)) push(`${at}.line`, 'DUPLICATE');
      slots.add(key);
      if (l.ayahEnd < l.ayahStart) push(`${at}.ayahEnd`, 'END_BEFORE_START');
      const meta = surahs.find((s) => s.number === l.surah);
      if (surahs.length && !meta) push(`${at}.surah`, 'UNKNOWN');
      else if (meta && (l.ayahStart < 1 || l.ayahEnd > meta.ayahCount)) push(`${at}.ayahEnd`, 'OUT_OF_RANGE');
    });
  });
  return issues;
}

/**
 * Canonical JSON (sorted keys) of a seed, so the same dataset gives the same checksum on every machine and a
 * re-applied version can be compared with what was applied before.
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

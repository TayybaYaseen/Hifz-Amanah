// F06 · Metadata completeness, seed-file validation, and line-count provenance (FR-SAB-007, FR-SAB-008; DEC-B31,
// DEC-B32, DEC-B70). Pure rules, no I/O.
//
// Nothing here creates Quran data. These functions only check data that an approved dataset supplies, and report what
// is missing or inconsistent so an Admin can review it. Records are never rewritten from these results.
import {
  PARA_MAX,
  SURAH_MAX,
  LINE_TYPES,
  compareRef,
  validateParaBoundary,
  validateSurah,
  type AyahRef,
  type LayoutLine,
  type LineType,
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
//
// Format 1 (built first): Ayat lines only, provenance on the file. Readable for synthetic test data; refused for
// production since DEC-B72 (FR-SAB-011, FR-SAB-013), because it carries no source files and no signed report.
// Format 2 (ADR-017 §6.1): typed lines (Ayat, Surah heading, Bismillah) with word positions, the registered source
// files it was built from, and the signed validation report.

export const SEED_FORMAT = 'hifz-quran-seed';
/** The format the synthetic v1 fixture uses; kept so format-1 files keep their checksum. */
export const SEED_FORMAT_VERSION = 1;
export const SEED_FORMAT_VERSION_LATEST = 2;
export const SEED_FORMAT_VERSIONS = [1, 2] as const;

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

/** A Surah row in a seed. The optional display fields (format 2) are copied from the source, never derived. */
export interface SeedSurah extends SurahRecord {
  revelationPlace?: 'MAKKI' | 'MADANI' | null;
  revelationOrder?: number | null;
  bismillahPre?: boolean | null;
}

/** One printed line in a format-2 seed (FR-SAB-012). Word positions are inside `ayahStart` and `ayahEnd`. */
export interface SeedLineV2 {
  page: number;
  line: number;
  lineType: LineType;
  isCentered?: boolean | null;
  surah: number;
  ayahStart?: number | null;
  wordStart?: number | null;
  ayahEnd?: number | null;
  wordEnd?: number | null;
  /** The source's word IDs, kept for audit and re-conversion only. */
  srcFirstWordId?: number | null;
  srcLastWordId?: number | null;
}

/** A line as the loader stores it, whatever the file's format. */
export interface NormalizedLine {
  page: number;
  line: number;
  lineType: LineType;
  isCentered: boolean | null;
  surah: number;
  ayahStart: number | null;
  wordStart: number | null;
  ayahEnd: number | null;
  wordEnd: number | null;
  srcFirstWordId: number | null;
  srcLastWordId: number | null;
}

export const SOURCE_ROLES = ['METADATA', 'LAYOUT', 'WORDS'] as const;
export type SourceRole = (typeof SOURCE_ROLES)[number];

/** A source file the seed was built from; it must be registered in `quran_sources` (FR-SAB-011). */
export interface SeedSourceRef {
  provider: string;
  resourceId: string | null;
  fileSha256: string;
  role: SourceRole;
}

export const REVIEW_DECISIONS = ['APPROVED', 'APPROVED_WITH_FINDINGS', 'REJECTED', 'PENDING'] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];
/** Only these decisions let a dataset be imported (FR-SAB-013). */
export const APPROVING_DECISIONS: readonly ReviewDecision[] = ['APPROVED', 'APPROVED_WITH_FINDINGS'];

/** The signed validation report (ADR-017 §7): the reviewer's decision after comparing with the physical Mushaf. */
export interface SeedValidationReport {
  sha256: string;
  decision: ReviewDecision;
  signedBy: string | null;
  signedOn: string | null;
}

interface SeedBase {
  format: typeof SEED_FORMAT;
  datasetKey: string;
  datasetVersion: string;
  provenance: SeedProvenance;
  metadata: { surahs: SeedSurah[]; paras: ParaBoundary[] } | null;
}

export interface QuranSeedV1 extends SeedBase {
  formatVersion: 1;
  layouts: { edition: string; linesPerPage: number; lines: LayoutLine[] }[];
}

export interface QuranSeedV2 extends SeedBase {
  formatVersion: 2;
  sources: SeedSourceRef[];
  validationReport: SeedValidationReport | null;
  layouts: { edition: string; linesPerPage: number; lines: SeedLineV2[] }[];
}

export type QuranSeed = QuranSeedV1 | QuranSeedV2;
export type SeedLayout = QuranSeed['layouts'][number];

export interface SeedIssue {
  path: string;
  code: string;
}

export interface SeedContext {
  /** Editions the catalogue knows, with their lines per page and, once verified, their page count. */
  editions: readonly { code: string; linesPerPage: number; pageCount?: number | null }[];
  /** True only when NODE_ENV=test. */
  allowSynthetic: boolean;
  /** Surah metadata to check layout lines against when the seed carries none (the madrasa's current rows). */
  existingSurahs: readonly SurahMeta[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATASET_KEY = /^[a-z0-9][a-z0-9._-]{1,79}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const PROVIDER = /^[A-Z0-9_]{2,40}$/;
const blank = (s: unknown): boolean => typeof s !== 'string' || s.trim() === '';
const whole = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n);
const present = (v: unknown): boolean => v !== null && v !== undefined;

/** The lines of a seed layout in the stored shape. Format-1 lines are Ayat lines with no word positions (unknown). */
export function normalizedLines(seed: QuranSeed, layoutIndex: number): NormalizedLine[] {
  if (seed.formatVersion === 1) {
    return seed.layouts[layoutIndex]!.lines.map((l) => ({
      page: l.page, line: l.line, lineType: 'AYAH', isCentered: null, surah: l.surah,
      ayahStart: l.ayahStart, wordStart: null, ayahEnd: l.ayahEnd, wordEnd: null, srcFirstWordId: null, srcLastWordId: null,
    }));
  }
  return seed.layouts[layoutIndex]!.lines.map((l) => ({
    page: l.page, line: l.line, lineType: l.lineType, isCentered: l.isCentered ?? null, surah: l.surah,
    ayahStart: l.ayahStart ?? null, wordStart: l.wordStart ?? null, ayahEnd: l.ayahEnd ?? null, wordEnd: l.wordEnd ?? null,
    srcFirstWordId: l.srcFirstWordId ?? null, srcLastWordId: l.srcLastWordId ?? null,
  }));
}

/**
 * Validates a whole seed file before anything is written. A seed with any issue is refused in full (no partial
 * import). Production seeds must be format 2, complete (114 Surahs, 30 consistent Paras; F06-AC18), cite their
 * source files, and carry an approved, signed validation report (FR-SAB-011, FR-SAB-013; DEC-B72). Source licence
 * status needs the database and is checked by the loader with `sourceLicenceIssue`.
 */
export function validateSeed(seed: QuranSeed, ctx: SeedContext): SeedIssue[] {
  const issues: SeedIssue[] = [];
  const push = (path: string, code: string) => issues.push({ path, code });

  if (seed.format !== SEED_FORMAT || !(SEED_FORMAT_VERSIONS as readonly number[]).includes(seed.formatVersion)) push('format', 'UNSUPPORTED');
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
    // Production data must name its source files and carry the signed report, which only format 2 can (DEC-B72).
    if (seed.formatVersion === 1) push('formatVersion', 'V2_REQUIRED');
  }

  if (!seed.metadata && seed.layouts.length === 0) push('metadata', 'EMPTY');
  if (seed.formatVersion === 2) validateV2Envelope(seed, push);

  let surahs: readonly SurahMeta[] = ctx.existingSurahs;
  if (seed.metadata) {
    const seen = new Set<number>();
    seed.metadata.surahs.forEach((s, i) => {
      for (const issue of validateSurah(s)) push(`metadata.surahs[${i}].${issue.field}`, issue.code);
      if (seen.has(s.number)) push(`metadata.surahs[${i}].number`, 'DUPLICATE');
      seen.add(s.number);
      if (present(s.revelationOrder) && (!whole(s.revelationOrder) || s.revelationOrder! < 1 || s.revelationOrder! > SURAH_MAX)) {
        push(`metadata.surahs[${i}].revelationOrder`, 'OUT_OF_RANGE');
      }
      if (seed.formatVersion === 1 && (present(s.revelationPlace) || present(s.revelationOrder) || present(s.bismillahPre))) {
        push(`metadata.surahs[${i}]`, 'V2_FIELD');
      }
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
    const lines = normalizedLines(seed, li);
    const slots = new Set<string>();
    let rowsOk = true;
    lines.forEach((l, i) => {
      const at = `${base}.lines[${i}]`;
      const before = issues.length;
      checkLine(l, at, layout.linesPerPage, surahs, seed.formatVersion, push);
      const key = `${l.page}:${l.line}`;
      if (slots.has(key)) push(`${at}.line`, 'DUPLICATE');
      slots.add(key);
      if (issues.length > before) rowsOk = false;
    });
    // Order and coverage only make sense once every row is well formed (format 2 only).
    if (seed.formatVersion === 2 && rowsOk && lines.length) {
      checkSequence(lines, base, surahs, !p.synthetic, edition?.pageCount ?? null, push);
    }
  });
  return issues;
}

function validateV2Envelope(seed: QuranSeedV2, push: (path: string, code: string) => void): void {
  const keys = new Set<string>();
  seed.sources.forEach((s, i) => {
    const at = `sources[${i}]`;
    if (!PROVIDER.test(s.provider)) push(`${at}.provider`, 'INVALID');
    if (!SHA256.test(s.fileSha256)) push(`${at}.fileSha256`, 'INVALID');
    if (!(SOURCE_ROLES as readonly string[]).includes(s.role)) push(`${at}.role`, 'INVALID');
    const key = `${s.provider}|${s.resourceId ?? ''}|${s.fileSha256}`;
    if (keys.has(key)) push(at, 'DUPLICATE');
    keys.add(key);
  });
  const report = seed.validationReport;
  if (report) {
    if (!SHA256.test(report.sha256)) push('validationReport.sha256', 'INVALID');
    if (!APPROVING_DECISIONS.includes(report.decision)) push('validationReport.decision', 'NOT_APPROVED');
  }
  if (seed.provenance.synthetic) return;
  // Production: every part of the seed names the source files it came from (FR-SAB-011) …
  if (seed.sources.length === 0) push('sources', 'REQUIRED');
  else {
    const roles = new Set(seed.sources.map((s) => s.role));
    if (seed.metadata && !roles.has('METADATA')) push('sources', 'METADATA_SOURCE_REQUIRED');
    if (seed.layouts.length && !roles.has('LAYOUT')) push('sources', 'LAYOUT_SOURCE_REQUIRED');
  }
  // … and the reviewer's signed, approving report, matching the provenance (FR-SAB-013).
  if (!report) return push('validationReport', 'REQUIRED');
  if (blank(report.signedBy)) push('validationReport.signedBy', 'REQUIRED');
  else if (report.signedBy !== seed.provenance.reviewedBy) push('validationReport.signedBy', 'REVIEWER_MISMATCH');
  if (typeof report.signedOn !== 'string' || !ISO_DATE.test(report.signedOn)) push('validationReport.signedOn', 'REQUIRED');
  else if (report.signedOn !== seed.provenance.approvedOn) push('validationReport.signedOn', 'DATE_MISMATCH');
}

function checkLine(
  l: NormalizedLine,
  at: string,
  linesPerPage: number,
  surahs: readonly SurahMeta[],
  formatVersion: number,
  push: (path: string, code: string) => void,
): void {
  if (![l.page, l.line, l.surah].every(whole)) return push(at, 'NOT_WHOLE');
  if (!(LINE_TYPES as readonly string[]).includes(l.lineType)) return push(`${at}.lineType`, 'INVALID');
  if (l.page < 1) push(`${at}.page`, 'OUT_OF_RANGE');
  if (l.line < 1 || l.line > linesPerPage) push(`${at}.line`, 'OUT_OF_RANGE');
  const meta = surahs.find((s) => s.number === l.surah);
  if (surahs.length && !meta) push(`${at}.surah`, 'UNKNOWN');

  if (l.lineType !== 'AYAH') {
    // A heading or Bismillah line holds no Ayat and no words (FR-SAB-012).
    if ([l.ayahStart, l.ayahEnd, l.wordStart, l.wordEnd, l.srcFirstWordId, l.srcLastWordId].some(present)) push(at, 'NOT_AYAH_LINE');
    return;
  }
  if (!whole(l.ayahStart) || !whole(l.ayahEnd)) return push(at, l.ayahStart === null || l.ayahEnd === null ? 'AYAH_REQUIRED' : 'NOT_WHOLE');
  if (l.ayahEnd < l.ayahStart) push(`${at}.ayahEnd`, 'END_BEFORE_START');
  if (meta && (l.ayahStart < 1 || l.ayahEnd > meta.ayahCount)) push(`${at}.ayahEnd`, 'OUT_OF_RANGE');
  if (formatVersion === 2) {
    if (!whole(l.wordStart) || !whole(l.wordEnd) || l.wordStart < 1 || l.wordEnd < 1) push(at, 'WORD_POSITION_REQUIRED');
    else if (l.ayahStart === l.ayahEnd && l.wordEnd < l.wordStart) push(`${at}.wordEnd`, 'END_BEFORE_START');
    if (present(l.srcFirstWordId) !== present(l.srcLastWordId)) push(at, 'WORD_ID_PAIR');
    else if (present(l.srcFirstWordId) && (!whole(l.srcFirstWordId) || !whole(l.srcLastWordId) || l.srcLastWordId! < l.srcFirstWordId!)) {
      push(`${at}.srcLastWordId`, 'END_BEFORE_START');
    }
  }
}

/**
 * Order and coverage of a format-2 layout (ADR-017 §4, §6.2 V5, V7, V8, V9). Walking the lines in page/line order:
 * each Surah's heading comes before its first Ayat line; Ayat lines follow each other with no gap or overlap (word
 * positions and, when present, source word IDs are contiguous); a Surah ends on its last Ayat before the next begins.
 * Production layouts must also cover the whole Quran (from the first to the last Surah of the metadata), have no
 * missing page, and match the edition's verified page count. Nothing is corrected: each problem is an issue.
 */
function checkSequence(
  lines: NormalizedLine[],
  base: string,
  surahs: readonly SurahMeta[],
  production: boolean,
  pageCount: number | null,
  push: (path: string, code: string) => void,
): void {
  const order = lines.map((l, i) => ({ l, i })).sort((a, b) => a.l.page - b.l.page || a.l.line - b.l.line);
  const headed = new Set<number>();
  let prev: { l: NormalizedLine; i: number } | null = null;
  let firstAyah: NormalizedLine | null = null;
  for (const cur of order) {
    const { l, i } = cur;
    const at = `${base}.lines[${i}]`;
    if (l.lineType === 'SURAH_NAME') {
      headed.add(l.surah);
      continue;
    }
    if (l.lineType !== 'AYAH') continue;
    firstAyah ??= l;
    if (!headed.has(l.surah)) {
      push(at, 'SURAH_NAME_MISSING');
      headed.add(l.surah); // report once per Surah
    }
    if (!prev) {
      if (l.ayahStart !== 1 || l.wordStart !== 1) push(at, 'GAP');
    } else {
      const p = prev.l;
      if (l.surah === p.surah) {
        if (l.ayahStart! < p.ayahEnd! || (l.ayahStart === p.ayahEnd && l.wordStart! <= p.wordEnd!)) push(at, 'OVERLAP');
        else if (l.ayahStart === p.ayahEnd && l.wordStart !== p.wordEnd! + 1) push(at, 'GAP');
        else if (l.ayahStart! > p.ayahEnd! + 1 || (l.ayahStart === p.ayahEnd! + 1 && l.wordStart !== 1)) push(at, 'GAP');
      } else {
        const prevMeta = surahs.find((s) => s.number === p.surah);
        if (l.surah !== p.surah + 1) push(`${at}.surah`, 'SURAH_ORDER');
        else if ((prevMeta && p.ayahEnd !== prevMeta.ayahCount) || l.ayahStart !== 1 || l.wordStart !== 1) push(at, 'GAP');
      }
      if (present(l.srcFirstWordId) && present(p.srcLastWordId) && l.srcFirstWordId !== p.srcLastWordId! + 1) push(at, 'WORD_ID_GAP');
    }
    prev = cur;
  }
  if (!production) return;
  const sorted = [...surahs].sort((a, b) => a.number - b.number);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!firstAyah || !prev || !first || !last) return push(`${base}.lines`, 'INCOMPLETE');
  if (firstAyah.surah !== first.number || prev.l.surah !== last.number || prev.l.ayahEnd !== last.ayahCount) push(`${base}.lines`, 'INCOMPLETE');
  const pages = new Set(lines.map((l) => l.page));
  const maxPage = Math.max(...pages);
  for (let page = 1; page <= maxPage; page++) {
    if (!pages.has(page)) {
      push(`${base}.lines`, 'PAGE_MISSING');
      break;
    }
  }
  if (pageCount !== null && maxPage !== pageCount) push(`${base}.lines`, 'PAGE_COUNT_MISMATCH');
}

// ---------- Licence gate (FR-SAB-011; DEC-B71, DEC-B72) ----------

export const LICENCE_STATUSES = ['LICENSE_REVIEW_REQUIRED', 'OPEN_LICENCE_VERIFIED', 'PERMISSION_GRANTED', 'REFUSED'] as const;
export type LicenceStatus = (typeof LICENCE_STATUSES)[number];
/** Only these statuses clear a source for import. */
export const CLEARED_LICENCE_STATUSES: readonly LicenceStatus[] = ['OPEN_LICENCE_VERIFIED', 'PERMISSION_GRANTED'];

/** A registered source as the gate sees it: its current (latest) licence record. */
export interface RegisteredSource {
  synthetic: boolean;
  status: LicenceStatus;
  publisherClearanceRef: string | null;
}

export type SourceLicenceIssue = 'UNREGISTERED' | 'LICENCE_NOT_CLEARED' | 'PUBLISHER_CLEARANCE_REQUIRED' | 'SYNTHETIC_SOURCE';

/**
 * Why a source may not be used, or null when it may (FR-SAB-011):
 * - it must be registered, with a cleared licence status;
 * - a layout of a printed edition also needs the publisher's clearance (for the Taj layout, Taj Company's
 *   permission or legal advice; owning a printed Mushaf grants no digital right; DEC-B71);
 * - a production seed may not cite a synthetic (test) source.
 */
export function sourceLicenceIssue(source: RegisteredSource | null, role: SourceRole, productionSeed: boolean): SourceLicenceIssue | null {
  if (!source) return 'UNREGISTERED';
  if (productionSeed && source.synthetic) return 'SYNTHETIC_SOURCE';
  if (!CLEARED_LICENCE_STATUSES.includes(source.status)) return 'LICENCE_NOT_CLEARED';
  if (role === 'LAYOUT' && blank(source.publisherClearanceRef)) return 'PUBLISHER_CLEARANCE_REQUIRED';
  return null;
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

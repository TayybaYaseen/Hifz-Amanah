// F06 · Quran source converter: approved-format source files → a format-2 seed and a validation report (ADR-017 §4,
// §6, §7; FR-SAB-011…013; DEC-B71, DEC-B72).
//
// OFFLINE MAINTAINER TOOLING, pure apart from hashing: it reads nothing and writes nothing (the CLI does the I/O). It
// never downloads data and never invents a value. Every Quran value in the seed is copied from the source files; word
// text is read only to be discarded and never reaches the seed or the report. Anything it cannot map, or any
// inconsistency, is reported as a failed check and NO seed is produced: the import stops (ADR-017 §4).
//
// The seed is validated with the existing domain rules (`validateSeed`), unchanged. The converter adds the checks only
// the raw sources allow: word IDs, word order, cross-source Ayat counts, and word coverage. It does not decide licences
// or approve anything: the report's gate lists what still blocks an import, and the seed loader stays the authority.
import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  canonicalJson,
  sourceLicenceIssue,
  validateSeed,
  type LicenceStatus,
  type QuranSeedV2,
  type SeedIssue,
  type SeedLineV2,
  type SeedSurah,
  type SourceRole,
} from '@hifz/domain/quran-ref';

export const CONVERTER_VERSION = '1.0.0';
export const MANIFEST_FORMAT = 'hifz-quran-source-manifest';
export const REPORT_FORMAT = 'hifz-quran-validation';

// ---------- Inputs ----------

const FileRef = z.strictObject({
  path: z.string().min(1).max(500),
  provider: z.string().regex(/^[A-Z0-9_]{2,40}$/),
  resourceId: z.string().min(1).max(100).nullable(),
});

/** What the maintainer writes to describe one dataset version (paths are relative to the manifest file). */
export const SourceManifest = z.strictObject({
  format: z.literal(MANIFEST_FORMAT),
  formatVersion: z.literal(1),
  datasetKey: z.string(),
  datasetVersion: z.string(),
  provenance: z.strictObject({
    sourceName: z.string().min(1).max(200),
    sourceUrl: z.string().max(500).nullable(),
    licence: z.string().min(1).max(200),
    synthetic: z.boolean(),
  }),
  edition: z.strictObject({
    code: z.string().regex(/^[A-Z0-9_]{3,40}$/),
    linesPerPage: z.number().int().min(1).max(30),
    /** The verified page count, once known; null leaves the page-count check to the reviewer. */
    pageCount: z.number().int().min(1).nullable(),
  }),
  files: z.strictObject({ surahs: FileRef, juz: FileRef, layout: FileRef, words: FileRef }),
});
export type SourceManifest = z.infer<typeof SourceManifest>;
export type SourceFileKey = keyof SourceManifest['files'];

/** The role each file plays in the seed's `sources` (FR-SAB-011). */
const FILE_ROLES: Record<SourceFileKey, SourceRole> = { surahs: 'METADATA', juz: 'METADATA', layout: 'LAYOUT', words: 'WORDS' };
const FILE_KEYS: SourceFileKey[] = ['surahs', 'juz', 'layout', 'words'];

// The source file shapes. Column names follow the provider's published formats (QUL docs, read 2026-11-09); extra
// columns are ignored. SQLite tables are exported to JSON rows with the same column names before conversion.
const int = z.number().int();
const SurahRow = z.looseObject({
  id: int.min(1),
  name_simple: z.string(),
  name_arabic: z.string(),
  revelation_order: int.nullable().optional(),
  revelation_place: z.string().nullable().optional(),
  verses_count: int.min(1),
  bismillah_pre: z.union([z.boolean(), z.literal(0), z.literal(1)]).nullable().optional(),
});
const JuzRow = z.looseObject({ juz_number: int.min(1), first_verse_key: z.string(), last_verse_key: z.string() });
const LayoutRow = z.looseObject({
  page_number: int,
  line_number: int,
  line_type: z.string(),
  is_centered: z.union([z.boolean(), z.literal(0), z.literal(1)]).nullable().optional(),
  first_word_id: int.nullable().optional(),
  last_word_id: int.nullable().optional(),
  surah_number: int.nullable().optional(),
});
const WordRow = z.looseObject({ word_index: int, word_key: z.string(), surah: int, ayah: int });
const keyedOrArray = <T extends z.ZodType>(row: T) => z.union([z.array(row), z.record(z.string(), row).transform((r) => Object.values(r))]);
const FILE_SCHEMAS = { surahs: keyedOrArray(SurahRow), juz: keyedOrArray(JuzRow), layout: z.array(LayoutRow), words: z.array(WordRow) };

export interface SourceFileInput {
  fileName: string;
  /** The raw bytes as downloaded: the SHA-256 is taken over these, before any parsing. */
  bytes: Uint8Array;
}

/** A registered source's current licence record, if the CLI looked it up (`--check-sources`). */
export interface SourceStatus {
  synthetic: boolean;
  status: LicenceStatus;
  publisherClearanceRef: string | null;
}
export type SourceStatusLookup = (ref: { provider: string; resourceId: string | null; fileSha256: string }) => SourceStatus | null;

// ---------- Report ----------

export type CheckResult = 'PASS' | 'FAIL' | 'WARN';
export interface ReportCheck {
  id: string;
  title: string;
  result: CheckResult;
  details: string[];
}

export interface ReportSource {
  file: SourceFileKey;
  provider: string;
  resourceId: string | null;
  role: SourceRole;
  fileName: string;
  fileSha256: string;
  /** NOT_CHECKED when the converter ran without the source catalogue; the seed loader checks it at import anyway. */
  licenceStatus: LicenceStatus | 'UNREGISTERED' | 'NOT_CHECKED';
  publisherClearance: boolean | null;
}

export interface ReviewFinding {
  part: string;
  description: string;
  /** A blocking finding forbids an approving decision. */
  blocking: boolean;
}

export interface ReportReview {
  reviewer: string | null;
  qualification: string | null;
  mushafPrinting: string | null;
  decision: 'PENDING' | 'APPROVED' | 'APPROVED_WITH_FINDINGS' | 'REJECTED';
  signedOn: string | null;
  findings: ReviewFinding[];
}

export interface ValidationReport {
  reportFormat: typeof REPORT_FORMAT;
  reportVersion: 1;
  converterVersion: string;
  datasetKey: string;
  datasetVersion: string;
  generatedAt: string;
  synthetic: boolean;
  edition: { code: string; linesPerPage: number; pageCount: number | null };
  sources: ReportSource[];
  /** SHA-256 of the unsigned seed (canonical JSON); null when the checks failed and no seed was produced. */
  seedSha256: string | null;
  counts: { surahs: number; ayahTotal: number; words: number; paras: number; pages: number; lines: Record<'AYAH' | 'SURAH_NAME' | 'BASMALLAH', number> };
  checks: ReportCheck[];
  crossSource: { item: string; sourceA: string; sourceB: string; status: 'MATCH' | 'MISMATCH' }[];
  pagesWithFewerLines: { page: number; lines: number }[];
  /** Pages the reviewer compares line by line with the physical Mushaf (verification kit Part C). */
  reviewerSample: number[];
  review: ReportReview;
  /** What still blocks a production import. Advisory: the seed loader enforces the gates itself. */
  gate: { importReady: boolean; blockers: string[] };
}

export interface ConversionResult {
  /** Null whenever any check failed: nothing may be imported from a failing conversion. */
  seed: QuranSeedV2 | null;
  report: ValidationReport;
}

export const sha256 = (data: Uint8Array | string): string => createHash('sha256').update(data).digest('hex');
export const seedSha256 = (seed: QuranSeedV2): string => sha256(canonicalJson(seed));
export const reportSha256 = (report: ValidationReport): string => sha256(canonicalJson(report));

const DETAIL_CAP = 200;
const KEY_RE = /^(\d+):(\d+)$/;
const WORD_KEY_RE = /^(\d+):(\d+):(\d+)$/;
const LINE_TYPE_MAP: Record<string, SeedLineV2['lineType']> = { ayah: 'AYAH', surah_name: 'SURAH_NAME', basmallah: 'BASMALLAH' };
const PLACE_MAP: Record<string, 'MAKKI' | 'MADANI'> = { makkah: 'MAKKI', madinah: 'MADANI' };
/** Seed issues that belong to the sign step, not to conversion (the seed is unsigned until the reviewer signs). */
const SIGN_STEP_PATHS = ['validationReport', 'provenance.reviewedBy', 'provenance.approvedOn'];

class Checks {
  readonly list: ReportCheck[] = [];
  private current: ReportCheck | null = null;
  begin(id: string, title: string): void {
    this.current = { id, title, result: 'PASS', details: [] };
    this.list.push(this.current);
  }
  private note(result: CheckResult, detail: string): void {
    const c = this.current!;
    if (result === 'FAIL' || (result === 'WARN' && c.result === 'PASS')) c.result = result;
    if (c.details.length < DETAIL_CAP) c.details.push(detail);
    else if (c.details.length === DETAIL_CAP) c.details.push('… more not listed');
  }
  fail(detail: string): void {
    this.note('FAIL', detail);
  }
  warn(detail: string): void {
    this.note('WARN', detail);
  }
  get failed(): boolean {
    return this.list.some((c) => c.result === 'FAIL');
  }
}

type Word = { index: number; ordinal: number; surah: number; ayah: number; position: number };

/**
 * Converts one dataset version. `files` holds each manifest file's raw bytes. `sourceStatus`, when given, reports each
 * source's licence status in the gate (the loader enforces it regardless). `now` is injected so a re-run is
 * reproducible: the same inputs and clock give the same report, and the same inputs always give the same seed.
 */
export function convertSources(
  manifestInput: unknown,
  files: Record<SourceFileKey, SourceFileInput>,
  options: { now: Date; sourceStatus?: SourceStatusLookup },
): ConversionResult {
  const manifest = SourceManifest.parse(manifestInput);
  const checks = new Checks();
  const sources: ReportSource[] = FILE_KEYS.map((key) => {
    const ref = manifest.files[key];
    const fileSha256 = sha256(files[key].bytes);
    const found = options.sourceStatus?.({ provider: ref.provider, resourceId: ref.resourceId, fileSha256 });
    return {
      file: key,
      provider: ref.provider,
      resourceId: ref.resourceId,
      role: FILE_ROLES[key],
      fileName: files[key].fileName,
      fileSha256,
      licenceStatus: !options.sourceStatus ? 'NOT_CHECKED' : found ? found.status : 'UNREGISTERED',
      publisherClearance: found ? found.publisherClearanceRef !== null && found.publisherClearanceRef.trim() !== '' : null,
    };
  });

  // S1 · Every file parses in its published shape.
  checks.begin('S1', 'Source files parse in their published format');
  const parsed: Partial<{ surahs: z.infer<typeof SurahRow>[]; juz: z.infer<typeof JuzRow>[]; layout: z.infer<typeof LayoutRow>[]; words: z.infer<typeof WordRow>[] }> = {};
  for (const key of FILE_KEYS) {
    let json: unknown;
    try {
      json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(files[key].bytes));
    } catch {
      checks.fail(`${key}: not valid UTF-8 JSON`);
      continue;
    }
    const result = FILE_SCHEMAS[key].safeParse(json);
    if (!result.success) {
      for (const issue of result.error.issues.slice(0, 20)) checks.fail(`${key}: ${issue.path.join('.') || '(root)'} ${issue.code}`);
      continue;
    }
    (parsed as Record<string, unknown>)[key] = result.data;
  }
  const empty = { surahs: 0, ayahTotal: 0, words: 0, paras: 0, pages: 0, lines: { AYAH: 0, SURAH_NAME: 0, BASMALLAH: 0 } };
  if (!parsed.surahs || !parsed.juz || !parsed.layout || !parsed.words) {
    return finish(manifest, options, sources, checks, null, empty, [], [], [], null);
  }

  // S2 · Surahs: numbered 1…N once each, with a known revelation place. Values copied as given.
  checks.begin('S2', 'Surah list: unique, contiguous numbers; known fields');
  const surahRows = [...parsed.surahs].sort((a, b) => a.id - b.id);
  const surahs: SeedSurah[] = [];
  surahRows.forEach((r, i) => {
    if (r.id !== i + 1) checks.fail(`Surah numbering breaks at position ${i + 1} (found ${r.id})`);
    const place = r.revelation_place == null ? null : PLACE_MAP[r.revelation_place.toLowerCase()];
    if (r.revelation_place != null && !place) checks.fail(`Surah ${r.id}: unknown revelation_place "${r.revelation_place}"`);
    surahs.push({
      number: r.id,
      nameAr: r.name_arabic,
      nameTranslit: r.name_simple,
      ayahCount: r.verses_count,
      revelationPlace: place ?? null,
      revelationOrder: r.revelation_order ?? null,
      bismillahPre: r.bismillah_pre == null ? null : Boolean(r.bismillah_pre),
    });
  });
  const surahMeta = new Map(surahs.map((s) => [s.number, s]));

  // S3 · Juz boundaries: parseable Surah:Ayat keys.
  checks.begin('S3', 'Juz list: parseable boundaries');
  const paras = [...parsed.juz]
    .sort((a, b) => a.juz_number - b.juz_number)
    .flatMap((j) => {
      const s = KEY_RE.exec(j.first_verse_key);
      const e = KEY_RE.exec(j.last_verse_key);
      if (!s || !e) {
        checks.fail(`Juz ${j.juz_number}: unreadable verse key "${!s ? j.first_verse_key : j.last_verse_key}"`);
        return [];
      }
      return [{ number: j.juz_number, start: { surah: Number(s[1]), ayah: Number(s[2]) }, end: { surah: Number(e[1]), ayah: Number(e[2]) } }];
    });

  // S4 · Words: unique IDs, keys that agree with their columns, positions 1…n inside each Ayat, in Quran order.
  checks.begin('S4', 'Word list: unique IDs, consistent keys, positions in order');
  const wordRows = [...parsed.words].sort((a, b) => a.word_index - b.word_index);
  const words = new Map<number, Word>();
  let prev: Word | null = null;
  wordRows.forEach((r, ordinal) => {
    if (words.has(r.word_index)) return checks.fail(`word_index ${r.word_index} appears more than once`);
    const k = WORD_KEY_RE.exec(r.word_key);
    if (!k) return checks.fail(`word_index ${r.word_index}: unreadable word_key "${r.word_key}"`);
    const w: Word = { index: r.word_index, ordinal, surah: Number(k[1]), ayah: Number(k[2]), position: Number(k[3]) };
    if (w.surah !== r.surah || w.ayah !== r.ayah) checks.fail(`word_index ${r.word_index}: word_key ${r.word_key} disagrees with surah ${r.surah}, ayah ${r.ayah}`);
    const continues = prev && prev.surah === w.surah && prev.ayah === w.ayah;
    if (continues ? w.position !== prev!.position + 1 : w.position !== 1) checks.fail(`word_index ${r.word_index} (${r.word_key}): word position out of sequence`);
    if (prev && !continues && (w.surah < prev.surah || (w.surah === prev.surah && w.ayah <= prev.ayah))) {
      checks.fail(`word_index ${r.word_index} (${r.word_key}): words are not in Quran order`);
    }
    words.set(r.word_index, w);
    prev = w;
  });

  // S5 · Cross-source: the Ayat each Surah has in the word list equal its Ayat count in the Surah list (V10).
  checks.begin('S5', 'Cross-source: Ayat counts (Surah list vs word list)');
  const crossSource: ValidationReport['crossSource'] = [];
  const ayahsInWords = new Map<number, Set<number>>();
  for (const w of words.values()) {
    if (!ayahsInWords.has(w.surah)) ayahsInWords.set(w.surah, new Set());
    ayahsInWords.get(w.surah)!.add(w.ayah);
  }
  for (const s of surahs) {
    const have = ayahsInWords.get(s.number) ?? new Set<number>();
    const complete = have.size === s.ayahCount && [...have].every((a) => a >= 1 && a <= s.ayahCount);
    crossSource.push({ item: `Surah ${s.number} Ayat count`, sourceA: `${s.ayahCount} (Surah list)`, sourceB: `${have.size} (word list)`, status: complete ? 'MATCH' : 'MISMATCH' });
    if (!complete) checks.fail(`Surah ${s.number}: ${s.ayahCount} Ayat in the Surah list, ${have.size} in the word list`);
  }
  for (const n of ayahsInWords.keys()) if (!surahMeta.has(n)) checks.fail(`The word list has Surah ${n}, which the Surah list does not`);

  // S6 · Layout rows: unique slots, known types, word IDs only on Ayat lines, every ID mapped, one Surah per line.
  checks.begin('S6', 'Layout lines: types, slots, and word IDs mapped');
  const lines: SeedLineV2[] = [];
  const slots = new Set<string>();
  for (const r of parsed.layout) {
    const at = `page ${r.page_number} line ${r.line_number}`;
    const slot = `${r.page_number}:${r.line_number}`;
    if (slots.has(slot)) checks.fail(`${at}: appears more than once`);
    slots.add(slot);
    if (r.page_number < 1 || r.line_number < 1 || r.line_number > manifest.edition.linesPerPage) checks.fail(`${at}: outside ${manifest.edition.linesPerPage} lines per page`);
    const lineType = LINE_TYPE_MAP[r.line_type];
    if (!lineType) {
      checks.fail(`${at}: unknown line_type "${r.line_type}"`);
      continue;
    }
    const isCentered = r.is_centered == null ? null : Boolean(r.is_centered);
    const first = r.first_word_id ?? null;
    const last = r.last_word_id ?? null;
    if (lineType !== 'AYAH') {
      if (first !== null || last !== null) checks.fail(`${at}: a ${r.line_type} line carries word IDs`);
      if (r.surah_number == null) checks.fail(`${at}: a ${r.line_type} line has no surah_number`);
      else lines.push({ page: r.page_number, line: r.line_number, lineType, isCentered, surah: r.surah_number });
      continue;
    }
    if (first === null || last === null) {
      checks.fail(`${at}: an ayah line without first_word_id/last_word_id`);
      continue;
    }
    const a = words.get(first);
    const b = words.get(last);
    if (!a || !b) {
      // Never guessed: an ID the word list does not have stops the conversion (ADR-017 §4 step 2).
      checks.fail(`${at}: word ID ${!a ? first : last} is not in the word list`);
      continue;
    }
    if (b.ordinal < a.ordinal) {
      checks.fail(`${at}: last_word_id ${last} comes before first_word_id ${first}`);
      continue;
    }
    if (a.surah !== b.surah) {
      checks.fail(`${at}: the line spans Surah ${a.surah} and Surah ${b.surah}`);
      continue;
    }
    if (r.surah_number != null && r.surah_number !== a.surah) checks.fail(`${at}: surah_number ${r.surah_number}, but its words are in Surah ${a.surah}`);
    lines.push({
      page: r.page_number, line: r.line_number, lineType, isCentered, surah: a.surah,
      ayahStart: a.ayah, wordStart: a.position, ayahEnd: b.ayah, wordEnd: b.position, srcFirstWordId: first, srcLastWordId: last,
    });
  }

  // S7 · Word coverage: walking the Ayat lines in page order, every word is on exactly one line, in order (V7).
  checks.begin('S7', 'Word coverage: every word on exactly one line, no gap or overlap');
  const ayahLines = lines.filter((l) => l.lineType === 'AYAH').sort((x, y) => x.page - y.page || x.line - y.line);
  let expected = 0;
  for (const l of ayahLines) {
    const from = words.get(l.srcFirstWordId!)!.ordinal;
    const to = words.get(l.srcLastWordId!)!.ordinal;
    const at = `page ${l.page} line ${l.line}`;
    if (from > expected) checks.fail(`${at}: ${from - expected} word(s) before it are on no line`);
    else if (from < expected) checks.fail(`${at}: overlaps the previous line by ${expected - from} word(s)`);
    expected = Math.max(expected, to + 1);
  }
  if (expected < words.size) checks.fail(`${words.size - expected} word(s) after the last line are on no line`);

  // S8 · Pages: no missing page, the verified page count (if recorded), and pages with fewer lines listed (V5, V9).
  checks.begin('S8', 'Pages: none missing; page count; short pages listed');
  const perPage = new Map<number, number>();
  for (const l of lines) perPage.set(l.page, (perPage.get(l.page) ?? 0) + 1);
  const maxPage = perPage.size ? Math.max(...perPage.keys()) : 0;
  for (let p = 1; p <= maxPage; p++) if (!perPage.has(p)) checks.fail(`page ${p} has no lines`);
  if (manifest.edition.pageCount !== null && maxPage !== manifest.edition.pageCount) {
    checks.fail(`${maxPage} pages, but the edition's verified page count is ${manifest.edition.pageCount}`);
  }
  const pagesWithFewerLines = [...perPage.entries()]
    .filter(([, n]) => n < manifest.edition.linesPerPage)
    .sort(([a], [b]) => a - b)
    .map(([page, n]) => ({ page, lines: n }));
  for (const p of pagesWithFewerLines) checks.warn(`page ${p.page} has ${p.lines} of ${manifest.edition.linesPerPage} lines (for the reviewer)`);

  // S9 · Headings and Bismillah: one heading per Surah; Bismillah lines compared with the Surah list (V8).
  checks.begin('S9', 'Surah headings and Bismillah lines');
  for (const s of surahs) {
    const headings = lines.filter((l) => l.lineType === 'SURAH_NAME' && l.surah === s.number).length;
    const hasAyah = ayahLines.some((l) => l.surah === s.number);
    if (hasAyah && headings !== 1) checks.fail(`Surah ${s.number}: ${headings} heading lines (expected 1)`);
    const bismillah = lines.some((l) => l.lineType === 'BASMALLAH' && l.surah === s.number);
    if (hasAyah && s.bismillahPre != null && bismillah !== s.bismillahPre) {
      crossSource.push({ item: `Surah ${s.number} Bismillah line`, sourceA: `bismillah_pre ${s.bismillahPre}`, sourceB: bismillah ? 'line present' : 'no line', status: 'MISMATCH' });
      checks.warn(`Surah ${s.number}: bismillah_pre is ${s.bismillahPre}, but the layout ${bismillah ? 'has' : 'has no'} Bismillah line (for the reviewer)`);
    }
  }

  const counts = {
    surahs: surahs.length,
    ayahTotal: surahs.reduce((n, s) => n + s.ayahCount, 0),
    words: words.size,
    paras: paras.length,
    pages: perPage.size,
    lines: { AYAH: ayahLines.length, SURAH_NAME: lines.filter((l) => l.lineType === 'SURAH_NAME').length, BASMALLAH: lines.filter((l) => l.lineType === 'BASMALLAH').length },
  };
  const sample = reviewerSample(lines, paras, maxPage);
  if (checks.failed) return finish(manifest, options, sources, checks, null, counts, crossSource, pagesWithFewerLines, sample, null);

  // S10 · The seed against the existing domain rules: order, gaps, overlaps, headings before Ayat, Ayat ranges,
  // Para contiguity, completeness for production, and source references (validateSeed, unchanged).
  checks.begin('S10', 'Seed rules (existing domain validation)');
  const seed: QuranSeedV2 = {
    format: 'hifz-quran-seed',
    formatVersion: 2,
    datasetKey: manifest.datasetKey,
    datasetVersion: manifest.datasetVersion,
    provenance: { ...manifest.provenance, reviewedBy: null, approvedOn: null },
    sources: sources.map((s) => ({ provider: s.provider, resourceId: s.resourceId, fileSha256: s.fileSha256, role: s.role })),
    validationReport: null,
    metadata: { surahs, paras },
    layouts: [{ edition: manifest.edition.code, linesPerPage: manifest.edition.linesPerPage, lines }],
  };
  const issues = validateSeed(seed, {
    editions: [{ code: manifest.edition.code, linesPerPage: manifest.edition.linesPerPage, pageCount: manifest.edition.pageCount }],
    allowSynthetic: true, // whether synthetic data may be imported is the loader's decision, not the converter's
    existingSurahs: [],
  }).filter((i) => !SIGN_STEP_PATHS.some((p) => i.path === p || i.path.startsWith(`${p}.`)));
  for (const i of issues) checks.fail(describeSeedIssue(i, lines));
  if (checks.failed) return finish(manifest, options, sources, checks, null, counts, crossSource, pagesWithFewerLines, sample, null);
  return finish(manifest, options, sources, checks, seed, counts, crossSource, pagesWithFewerLines, sample, null);
}

/** A seed issue in reviewer terms: line paths become page and line numbers. */
function describeSeedIssue(issue: SeedIssue, lines: SeedLineV2[]): string {
  const m = /^layouts\[0\]\.lines\[(\d+)\](.*)$/.exec(issue.path);
  if (m) {
    const l = lines[Number(m[1])];
    if (l) return `page ${l.page} line ${l.line}${m[2]}: ${issue.code}`;
  }
  return `${issue.path}: ${issue.code}`;
}

/**
 * The pages the reviewer compares line by line (verification kit Part C): the first and last 3 pages, the start
 * pages of Paras 1, 5, 10, 15, 20, 25, and 30, up to 5 pages with a mid-page heading, the page where Surah 9 starts,
 * up to 5 pages with centred Ayat lines, then evenly spaced pages up to 40. Deterministic, so a re-run gives the same.
 */
export function reviewerSample(lines: SeedLineV2[], paras: { number: number; start: { surah: number; ayah: number } }[], maxPage: number, size = 40): number[] {
  const pages = new Set<number>();
  const add = (p: number | undefined) => p !== undefined && p >= 1 && p <= maxPage && pages.add(p);
  for (let i = 1; i <= 3; i++) {
    add(i);
    add(maxPage - i + 1);
  }
  const pageOfAyah = (surah: number, ayah: number) =>
    lines.find((l) => l.lineType === 'AYAH' && l.surah === surah && l.ayahStart! <= ayah && ayah <= l.ayahEnd!)?.page;
  for (const p of paras.filter((x) => [1, 5, 10, 15, 20, 25, 30].includes(x.number))) add(pageOfAyah(p.start.surah, p.start.ayah));
  lines.filter((l) => l.lineType === 'SURAH_NAME' && l.line > 1).slice(0, 5).forEach((l) => add(l.page));
  add(lines.find((l) => l.lineType === 'SURAH_NAME' && l.surah === 9)?.page);
  lines.filter((l) => l.lineType === 'AYAH' && l.isCentered).slice(0, 5).forEach((l) => add(l.page));
  const target = Math.min(size, maxPage);
  for (let step = 1; pages.size < target && step <= maxPage; step++) add(Math.round((step * maxPage) / (target + 1)) || 1);
  for (let p = 1; pages.size < target && p <= maxPage; p++) add(p);
  return [...pages].sort((a, b) => a - b);
}

function finish(
  manifest: SourceManifest,
  options: { now: Date },
  sources: ReportSource[],
  checks: Checks,
  seed: QuranSeedV2 | null,
  counts: ValidationReport['counts'],
  crossSource: ValidationReport['crossSource'],
  pagesWithFewerLines: ValidationReport['pagesWithFewerLines'],
  reviewerSamplePages: number[],
  review: ReportReview | null,
): ConversionResult {
  const report: ValidationReport = {
    reportFormat: REPORT_FORMAT,
    reportVersion: 1,
    converterVersion: CONVERTER_VERSION,
    datasetKey: manifest.datasetKey,
    datasetVersion: manifest.datasetVersion,
    generatedAt: options.now.toISOString(),
    synthetic: manifest.provenance.synthetic,
    edition: manifest.edition,
    sources,
    seedSha256: seed ? seedSha256(seed) : null,
    counts,
    checks: checks.list,
    crossSource,
    pagesWithFewerLines,
    reviewerSample: reviewerSamplePages,
    review: review ?? { reviewer: null, qualification: null, mushafPrinting: null, decision: 'PENDING', signedOn: null, findings: [] },
    gate: { importReady: false, blockers: [] },
  };
  report.gate = gateOf(report);
  return { seed, report };
}

/**
 * What still blocks a production import, in the order a maintainer resolves them. Mirrors the loader's gates
 * (FR-SAB-011, FR-SAB-013); the loader enforces them again at import.
 */
export function gateOf(report: ValidationReport): ValidationReport['gate'] {
  const blockers: string[] = [];
  if (report.checks.some((c) => c.result === 'FAIL') || report.seedSha256 === null) blockers.push('CHECKS_FAILED');
  if (report.synthetic) blockers.push('SYNTHETIC_DATA');
  for (const s of report.sources) {
    const name = `${s.provider}/${s.resourceId ?? '-'} (${s.file})`;
    if (s.licenceStatus === 'NOT_CHECKED') blockers.push(`LICENCE_NOT_CHECKED: ${name}`);
    else {
      const issue = sourceLicenceIssue(
        s.licenceStatus === 'UNREGISTERED' ? null : { synthetic: report.synthetic, status: s.licenceStatus, publisherClearanceRef: s.publisherClearance ? 'on file' : null },
        s.role,
        !report.synthetic,
      );
      if (issue) blockers.push(`${issue}: ${name}`);
    }
  }
  const r = report.review;
  if (r.decision === 'PENDING') blockers.push('REVIEW_PENDING');
  else if (r.decision === 'REJECTED') blockers.push('REVIEW_REJECTED');
  return { importReady: blockers.length === 0, blockers };
}

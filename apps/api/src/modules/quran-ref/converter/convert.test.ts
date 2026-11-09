// F06 · Quran source converter and sign step — unit (ADR-017 §4–§7; FR-SAB-011…013; DEC-B71, DEC-B72).
// SYNTHETIC SOURCES ONLY (synthetic-sources.ts): invented Surahs, words, and lines that match no real Mushaf. No real
// Quran data is read, downloaded, or produced.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { canonicalJson, validateSeed } from '@hifz/domain/quran-ref';
import { convertSources, reportSha256, seedSha256, type ConversionResult, type SourceStatusLookup } from './convert.ts';
import { renderReportMarkdown, signDataset, SignRefusedError } from './sign.ts';
import { syntheticFiles, syntheticManifest, syntheticSources, type SyntheticSources } from './synthetic-sources.ts';

const NOW = new Date('2026-11-09T10:00:00Z');
const run = (src: SyntheticSources = syntheticSources(), over: Parameters<typeof syntheticManifest>[0] = {}, lookup?: SourceStatusLookup): ConversionResult =>
  convertSources(syntheticManifest(over), syntheticFiles(src), { now: NOW, ...(lookup ? { sourceStatus: lookup } : {}) });
const check = (r: ConversionResult, id: string) => r.report.checks.find((c) => c.id === id)!;
const failed = (r: ConversionResult) => r.report.checks.filter((c) => c.result === 'FAIL').map((c) => c.id);
const ayahRow = (src: SyntheticSources, n: number) => src.layout.filter((l) => l.line_type === 'ayah')[n]!;
const review = (over: Record<string, unknown> = {}) => ({
  reviewer: 'Reviewer (synthetic)',
  qualification: 'Test only',
  mushafPrinting: 'Synthetic printing (test)',
  decision: 'APPROVED',
  signedOn: '2026-11-09',
  findings: [],
  ...over,
});

describe('F06 · converting valid synthetic sources', () => {
  const result = run();

  it('produces a format-2 seed that passes the existing domain rules, with every line typed', () => {
    expect(failed(result)).toEqual([]);
    const seed = result.seed!;
    expect(seed.formatVersion).toBe(2);
    expect(seed.metadata!.surahs).toHaveLength(114);
    expect(seed.metadata!.paras).toHaveLength(30);
    const types = new Set(seed.layouts[0]!.lines.map((l) => l.lineType));
    expect(types).toEqual(new Set(['AYAH', 'SURAH_NAME', 'BASMALLAH']));
    expect(validateSeed(seed, { editions: [{ code: 'INDOPAK_16_LINE', linesPerPage: 16 }], allowSynthetic: true, existingSurahs: [] })).toEqual([]);
  });

  it('maps word IDs to Ayat and word positions, keeping the source IDs; an Ayat may break across lines', () => {
    const first = result.seed!.layouts[0]!.lines.find((l) => l.lineType === 'AYAH')!;
    expect(first).toMatchObject({ surah: 1, ayahStart: 1, wordStart: 1, ayahEnd: 2, wordEnd: 2, srcFirstWordId: 1, srcLastWordId: 8 });
  });

  it('copies Surah fields as given and cites every source file with its SHA-256 and role', () => {
    expect(result.seed!.metadata!.surahs[0]).toEqual({
      number: 1, nameAr: 'اختبار 1', nameTranslit: 'Synthetic 1', ayahCount: 20, revelationPlace: 'MAKKI', revelationOrder: 1, bismillahPre: true,
    });
    expect(result.seed!.sources.map((s) => s.role)).toEqual(['METADATA', 'METADATA', 'LAYOUT', 'WORDS']);
    expect(result.seed!.sources.every((s) => /^[0-9a-f]{64}$/.test(s.fileSha256))).toBe(true);
  });

  it('never carries word text into the seed or the report', () => {
    const out = canonicalJson(result.seed) + canonicalJson(result.report);
    expect(out).not.toContain('synthetic-word-');
    expect(out).not.toContain('"text"');
  });

  it('is reproducible: the same inputs and clock give the same seed and report; the seed ignores the clock', () => {
    const again = run();
    expect(canonicalJson(again)).toBe(canonicalJson(result));
    const later = convertSources(syntheticManifest(), syntheticFiles(syntheticSources()), { now: new Date('2027-01-01T00:00:00Z') });
    expect(seedSha256(later.seed!)).toBe(result.report.seedSha256);
    expect(reportSha256(later.report)).not.toBe(reportSha256(result.report));
  });

  it('lists short pages for the reviewer as a warning, not a failure, and picks a reviewer sample', () => {
    expect(check(result, 'S8').result).toBe('WARN');
    expect(result.report.pagesWithFewerLines.length).toBeGreaterThan(0);
    expect(result.report.reviewerSample.length).toBe(40);
    expect(result.report.reviewerSample.slice(0, 3)).toEqual([1, 2, 3]);
  });

  it('reports counts', () => {
    expect(result.report.counts).toMatchObject({ surahs: 114, ayahTotal: 114 * 20, words: 114 * 120, paras: 30, lines: { SURAH_NAME: 114, BASMALLAH: 114 } });
  });
});

describe('F06 · invalid sources stop the conversion: no seed, every problem reported', () => {
  it('a word ID the word list does not have (never guessed)', () => {
    const src = syntheticSources();
    ayahRow(src, 5).last_word_id = 999_999;
    const r = run(src);
    expect(r.seed).toBeNull();
    expect(check(r, 'S6').details).toEqual([expect.stringContaining('word ID 999999 is not in the word list')]);
  });

  it('a line whose words span two Surahs', () => {
    const src = syntheticSources();
    const rows = src.layout.filter((l) => l.line_type === 'ayah');
    const lastOf1 = rows.filter((l) => l.surah_number === 1).at(-1)!;
    lastOf1.last_word_id = (lastOf1.last_word_id as number) + 3; // into Surah 2
    const r = run(src);
    expect(r.seed).toBeNull();
    expect(check(r, 'S6').details).toEqual([expect.stringContaining('spans Surah 1 and Surah 2')]);
  });

  it('a gap and an overlap in word coverage', () => {
    const gap = syntheticSources();
    gap.layout.splice(gap.layout.indexOf(ayahRow(gap, 3)), 1);
    expect(check(run(gap), 'S7').details).toEqual([expect.stringContaining('word(s) before it are on no line')]);
    const overlap = syntheticSources();
    ayahRow(overlap, 4).first_word_id = (ayahRow(overlap, 3).last_word_id as number) - 1;
    expect(check(run(overlap), 'S7').details).toEqual([expect.stringContaining('overlaps the previous line by 2 word(s)')]);
  });

  it('words after the last line, when the layout stops early', () => {
    const src = syntheticSources();
    const last = src.layout.filter((l) => l.line_type === 'ayah').at(-1)!;
    src.layout.splice(src.layout.indexOf(last), 1);
    expect(check(run(src), 'S7').details).toEqual([expect.stringContaining('after the last line are on no line')]);
  });

  it('a heading or Bismillah line with word IDs, an Ayat line without them, an unknown line type, and a repeated slot', () => {
    const src = syntheticSources();
    const heading = src.layout.find((l) => l.line_type === 'surah_name')!;
    heading.first_word_id = 1;
    ayahRow(src, 2).first_word_id = null;
    src.layout.find((l) => l.line_type === 'basmallah')!.line_type = 'margin_note';
    src.layout.push({ ...ayahRow(src, 10) });
    const details = check(run(src), 'S6').details.join('\n');
    expect(details).toContain('a surah_name line carries word IDs');
    expect(details).toContain('an ayah line without first_word_id/last_word_id');
    expect(details).toContain('unknown line_type "margin_note"');
    expect(details).toContain('appears more than once');
  });

  it("a line's surah_number that disagrees with its words, and a line beyond the edition's lines per page", () => {
    const src = syntheticSources();
    ayahRow(src, 1).surah_number = 7;
    ayahRow(src, 2).line_number = 17;
    const details = check(run(src), 'S6').details.join('\n');
    expect(details).toContain('surah_number 7, but its words are in Surah 1');
    expect(details).toContain('outside 16 lines per page');
  });

  it('Ayat counts that differ between the Surah list and the word list (cross-source)', () => {
    const src = syntheticSources();
    src.surahs['2']!.verses_count = 21;
    const r = run(src);
    expect(check(r, 'S5').details).toEqual(['Surah 2: 21 Ayat in the Surah list, 20 in the word list']);
    expect(r.report.crossSource.find((x) => x.item === 'Surah 2 Ayat count')!.status).toBe('MISMATCH');
  });

  it('word keys that disagree with their columns, out-of-sequence positions, and repeated IDs', () => {
    const src = syntheticSources();
    src.words[3]!.word_key = '1:9:4';
    src.words[8]!.word_key = '1:2:5'; // index 9 should be 1:2:3
    src.words.push({ ...src.words[0]! });
    const details = check(run(src), 'S4').details.join('\n');
    expect(details).toContain('word_key 1:9:4 disagrees with surah 1, ayah 1');
    expect(details).toContain('word position out of sequence');
    expect(details).toContain('word_index 1 appears more than once');
  });

  it('a missing page, and a page count that differs from the verified one', () => {
    const src = syntheticSources();
    const pages = Math.max(...src.layout.map((l) => l.page_number as number));
    expect(check(run(src, { edition: { code: 'INDOPAK_16_LINE', linesPerPage: 16, pageCount: pages + 1 } }), 'S8').details).toContain(
      `${pages} pages, but the edition's verified page count is ${pages + 1}`,
    );
    const missing = syntheticSources();
    for (const l of missing.layout) if ((l.page_number as number) >= 5) l.page_number = (l.page_number as number) + 1;
    expect(check(run(missing), 'S8').details).toContain('page 5 has no lines');
  });

  it('a Surah without its heading line, or with two', () => {
    const src = syntheticSources();
    src.layout.splice(src.layout.findIndex((l) => l.line_type === 'surah_name' && l.surah_number === 2), 1);
    expect(check(run(src), 'S9').details).toContain('Surah 2: 0 heading lines (expected 1)');
  });

  it('unreadable files and verse keys', () => {
    const files = syntheticFiles(syntheticSources());
    files.words = { fileName: 'words.json', bytes: new TextEncoder().encode('{not json') };
    const r = convertSources(syntheticManifest(), files, { now: NOW });
    expect(r.seed).toBeNull();
    expect(check(r, 'S1').details).toEqual(['words: not valid UTF-8 JSON']);
    const src = syntheticSources();
    src.juz['3']!.first_verse_key = 'seven';
    expect(check(run(src), 'S3').details).toEqual(['Juz 3: unreadable verse key "seven"']);
  });

  it("the existing domain rules still apply to the built seed (e.g. a Para boundary out of order)", () => {
    const src = syntheticSources();
    src.juz['2']!.last_verse_key = '4:1';
    src.juz['2']!.first_verse_key = '5:1';
    const r = run(src);
    expect(r.seed).toBeNull();
    expect(check(r, 'S10').result).toBe('FAIL');
  });
});

describe('F06 · warnings for the reviewer (V8)', () => {
  it('a Bismillah line that disagrees with bismillah_pre is listed, not failed and not corrected', () => {
    const src = syntheticSources();
    src.surahs['9']!.bismillah_pre = false;
    const r = run(src);
    expect(r.seed).not.toBeNull();
    expect(check(r, 'S9')).toMatchObject({ result: 'WARN', details: [expect.stringContaining('Surah 9: bismillah_pre is false')] });
    expect(r.seed!.metadata!.surahs[8]!.bismillahPre).toBe(false); // copied as given
  });
});

describe('F06 · the import gate in the report (FR-SAB-011, FR-SAB-013)', () => {
  it('a synthetic, unsigned conversion is blocked, and licences are not assumed', () => {
    const { gate } = run().report;
    expect(gate.importReady).toBe(false);
    expect(gate.blockers).toEqual(expect.arrayContaining(['SYNTHETIC_DATA', 'REVIEW_PENDING', 'LICENCE_NOT_CHECKED: SYNTH/layout (layout)']));
  });

  it('with the catalogue: unregistered, uncleared, and layout-without-publisher-clearance sources are listed', () => {
    const lookup: SourceStatusLookup = (ref) =>
      ref.resourceId === 'surahs' ? null
        : ref.resourceId === 'juz' ? { synthetic: true, status: 'LICENSE_REVIEW_REQUIRED', publisherClearanceRef: null }
          : { synthetic: true, status: 'PERMISSION_GRANTED', publisherClearanceRef: null };
    const { report } = run(syntheticSources(), {}, lookup);
    expect(report.sources.map((s) => s.licenceStatus)).toEqual(['UNREGISTERED', 'LICENSE_REVIEW_REQUIRED', 'PERMISSION_GRANTED', 'PERMISSION_GRANTED']);
    expect(report.gate.blockers).toEqual(
      expect.arrayContaining(['UNREGISTERED: SYNTH/surahs (surahs)', 'LICENCE_NOT_CLEARED: SYNTH/juz (juz)', 'PUBLISHER_CLEARANCE_REQUIRED: SYNTH/layout (layout)']),
    );
  });

  it('a production-shaped conversion (synthetic values, never imported) is still blocked until licences and review clear', () => {
    const r = run(syntheticSources(), { provenance: { sourceName: 'X', sourceUrl: null, licence: 'X', synthetic: false } });
    expect(failed(r)).toEqual([]);
    expect(r.seed).not.toBeNull();
    expect(r.report.gate.blockers).toEqual(expect.arrayContaining(['REVIEW_PENDING', 'LICENCE_NOT_CHECKED: SYNTH/surahs (surahs)']));
    expect(r.report.gate.blockers).not.toContain('SYNTHETIC_DATA');
  });
});

describe('F06 · signing (verification kit Part F; FR-SAB-013)', () => {
  const converted = run();

  it("an approval is attached to the seed: reviewer, date, decision, and the signed report's hash", () => {
    const signed = signDataset(converted.seed!, converted.report, review());
    expect(signed.seed.provenance).toMatchObject({ reviewedBy: 'Reviewer (synthetic)', approvedOn: '2026-11-09' });
    expect(signed.seed.validationReport).toEqual({ sha256: signed.reportSha256, decision: 'APPROVED', signedBy: 'Reviewer (synthetic)', signedOn: '2026-11-09' });
    expect(reportSha256(signed.report)).toBe(signed.reportSha256);
    expect(signed.report.gate.blockers).not.toContain('REVIEW_PENDING');
    expect(signed.report.gate.blockers).toContain('SYNTHETIC_DATA');
  });

  it('a REJECTED decision is recorded; the seed then fails the domain rules, so it can never be imported', () => {
    const signed = signDataset(converted.seed!, converted.report, review({ decision: 'REJECTED', findings: [{ part: 'C4', description: 'Line break differs', blocking: true }] }));
    expect(signed.report.gate.blockers).toContain('REVIEW_REJECTED');
    expect(validateSeed(signed.seed, { editions: [{ code: 'INDOPAK_16_LINE', linesPerPage: 16 }], allowSynthetic: true, existingSurahs: [] })).toEqual([
      { path: 'validationReport.decision', code: 'NOT_APPROVED' },
    ]);
  });

  it('refuses a seed changed after conversion, an approval with a blocking finding, and APPROVED with findings', () => {
    const changed = { ...converted.seed!, datasetVersion: '2' };
    expect(() => signDataset(changed, converted.report, review())).toThrow(/SEED_CHANGED/);
    expect(() => signDataset(converted.seed!, converted.report, review({ findings: [{ part: 'C1', description: 'x', blocking: true }] }))).toThrow(/BLOCKING_FINDING/);
    expect(() => signDataset(converted.seed!, converted.report, review({ findings: [{ part: 'C1', description: 'x', blocking: false }] }))).toThrow(/FINDINGS_LISTED/);
    expect(() => signDataset(converted.seed!, converted.report, review({ decision: 'APPROVED_WITH_FINDINGS', findings: [{ part: 'C1', description: 'x', blocking: false }] }))).not.toThrow();
  });

  it('refuses to approve a conversion with a failed check, to sign twice, or without the printing and date', () => {
    const bad = syntheticSources();
    ayahRow(bad, 5).last_word_id = 999_999;
    const failedRun = run(bad);
    expect(() => signDataset(converted.seed!, failedRun.report, review())).toThrow(SignRefusedError);
    const signed = signDataset(converted.seed!, converted.report, review());
    expect(() => signDataset(signed.seed, signed.report, review())).toThrow(/REPORT_ALREADY_SIGNED/);
    expect(() => signDataset(converted.seed!, converted.report, review({ mushafPrinting: '' }))).toThrow();
    expect(() => signDataset(converted.seed!, converted.report, review({ signedOn: 'today' }))).toThrow();
    expect(() => signDataset(converted.seed!, converted.report, review({ decision: 'PENDING' }))).toThrow();
  });

  it('renders a readable report with the gate, sources, checks, and review', () => {
    const md = renderReportMarkdown(converted.report, null);
    expect(md).toContain('SYNTHETIC TEST DATA');
    expect(md).toContain('## Import gate: BLOCKED');
    expect(md).toContain('| S7 | Word coverage');
    expect(md).not.toContain('synthetic-word-');
  });
});

describe('F06 · the CLI (convert, then sign) on synthetic files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hifz-quran-convert-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const cli = resolve(__dirname, 'cli.ts');
  const node = (args: string[], env: Record<string, string> = { NODE_ENV: 'test' }) =>
    spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env: { ...process.env, ...env, DATABASE_URL: '' } });

  const writeSources = (src: SyntheticSources) => {
    for (const [key, value] of Object.entries(src)) writeFileSync(join(dir, `${key}.json`), JSON.stringify(value));
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify(syntheticManifest()));
  };

  it('writes the seed and reports, then signs them; the signed seed matches the in-process result', () => {
    writeSources(syntheticSources());
    const out = join(dir, 'out');
    const converted = node(['convert', join(dir, 'manifest.json'), '--out', out]);
    expect(converted.status).toBe(0);
    expect(converted.stdout).toContain('Import gate: BLOCKED');
    expect(existsSync(join(out, 'seed.json')) && existsSync(join(out, 'report.md'))).toBe(true);
    writeFileSync(join(dir, 'review.json'), JSON.stringify(review()));
    const signed = node(['sign', out, join(dir, 'review.json')]);
    expect(signed.status).toBe(0);
    const seed = JSON.parse(readFileSync(join(out, 'seed.signed.json'), 'utf8'));
    expect(seed.validationReport.decision).toBe('APPROVED');
    expect(seedSha256(JSON.parse(readFileSync(join(out, 'seed.json'), 'utf8')))).toBe(run().report.seedSha256);
  });

  it('writes no seed and exits 1 when a check fails', () => {
    const src = syntheticSources();
    ayahRow(src, 5).last_word_id = 999_999;
    writeSources(src);
    const out = join(dir, 'out-failed');
    const r = node(['convert', join(dir, 'manifest.json'), '--out', out]);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('Checks failed (S6, S7)'); // the unmapped line is dropped, so its words are also uncovered
    expect(existsSync(join(out, 'seed.json'))).toBe(false);
    expect(existsSync(join(out, 'report.json'))).toBe(true);
  });

  it('refuses synthetic manifests outside tests', () => {
    writeSources(syntheticSources());
    const r = node(['convert', join(dir, 'manifest.json'), '--out', join(dir, 'out-prod')], { NODE_ENV: 'production' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('Synthetic manifests are accepted only when NODE_ENV=test');
  });
});

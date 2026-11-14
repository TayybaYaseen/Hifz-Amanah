// F06 · Quran metadata completeness, seed validation, editions, and line-count provenance — unit
// (docs/specs/07-f06-quran-portions-metadata.md). Synthetic data only (synthetic-fixture.ts).
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MUSHAF_EDITION,
  canonicalJson,
  countLines,
  lineCountSource,
  metadataFindings,
  validateSeed,
  type QuranSeed,
  type SeedContext,
} from './index.ts';
import { syntheticLayout, syntheticParas, syntheticSeed, syntheticSurahs } from './synthetic-fixture.ts';

const EDITIONS = [
  { code: 'INDOPAK_16_LINE', linesPerPage: 16 },
  { code: 'FUTURE_13_LINE', linesPerPage: 13 },
];
const ctx = (over: Partial<SeedContext> = {}): SeedContext => ({ editions: EDITIONS, allowSynthetic: true, existingSurahs: [], ...over });
const codes = (issues: { path: string; code: string }[]) => issues.map((i) => `${i.path}:${i.code}`);
const production = (seed: QuranSeed): QuranSeed => ({
  ...seed,
  provenance: { ...seed.provenance, synthetic: false, reviewedBy: 'Reviewer (synthetic)', approvedOn: '2026-11-09' },
});

describe('F06 · editions (DEC-B70)', () => {
  it('the default edition is the 16-line Indo-Pak Mushaf', () => {
    expect(DEFAULT_MUSHAF_EDITION).toBe('INDOPAK_16_LINE');
  });

  it('a layout is checked against its own edition: 16 lines on Indo-Pak, 13 on another edition', () => {
    const lines16 = syntheticLayout(3, 16);
    expect(lines16.some((l) => l.line === 16)).toBe(true);
    expect(validateSeed(syntheticSeed({ layouts: [{ edition: 'INDOPAK_16_LINE', linesPerPage: 16, lines: lines16 }] }), ctx())).toEqual([]);
    // Multiple editions in one seed, each with its own lines per page.
    const two = syntheticSeed({
      layouts: [
        { edition: 'INDOPAK_16_LINE', linesPerPage: 16, lines: lines16 },
        { edition: 'FUTURE_13_LINE', linesPerPage: 13, lines: syntheticLayout(3, 13) },
      ],
    });
    expect(validateSeed(two, ctx())).toEqual([]);
    // Line 16 does not exist on a 13-line page; a lines-per-page mismatch with the catalogue is refused.
    const wrong = syntheticSeed({ layouts: [{ edition: 'FUTURE_13_LINE', linesPerPage: 13, lines: lines16 }] });
    expect(codes(validateSeed(wrong, ctx())).some((c) => /^layouts\[0\]\.lines\[\d+\]\.line:OUT_OF_RANGE$/.test(c))).toBe(true);
    const mismatch = syntheticSeed({ layouts: [{ edition: 'INDOPAK_16_LINE', linesPerPage: 15, lines: syntheticLayout(1, 15) }] });
    expect(codes(validateSeed(mismatch, ctx()))).toEqual(['layouts[0].linesPerPage:MISMATCH']);
    expect(codes(validateSeed(syntheticSeed({ layouts: [{ edition: 'UNKNOWN_ED', linesPerPage: 16, lines: lines16 }] }), ctx()))).toEqual(['layouts[0].edition:UNKNOWN']);
  });
});

describe('F06 · missing line layout and manual Total Lines (FR-SAB-008)', () => {
  it('with no layout data the count is unknown, and the Teacher’s number is MANUAL', () => {
    expect(countLines({ surah: 2, ayahStart: 1, ayahEnd: 5 }, [])).toBeNull();
    expect(lineCountSource(null, 7)).toBe('MANUAL');
  });

  it('a kept pre-filled count is LAYOUT; a corrected one is MANUAL', () => {
    const prefilled = countLines({ surah: 1, ayahStart: 1, ayahEnd: 6 }, syntheticLayout());
    expect(prefilled).toBe(3);
    expect(lineCountSource(prefilled, 3)).toBe('LAYOUT');
    expect(lineCountSource(prefilled, 4)).toBe('MANUAL');
  });
});

describe('F06 · seed validation (FR-SAB-007, DEC-B31)', () => {
  it('a synthetic seed is refused outside tests, so it can never become the production seed', () => {
    expect(codes(validateSeed(syntheticSeed(), ctx({ allowSynthetic: false })))).toEqual(['provenance.synthetic:NOT_ALLOWED']);
  });

  it('a production seed must name its licence, reviewer, and approval date', () => {
    const seed = syntheticSeed({ provenance: { sourceName: 'X', sourceUrl: null, licence: ' ', reviewedBy: null, approvedOn: 'soon', synthetic: false } });
    expect(codes(validateSeed(seed, ctx()))).toEqual([
      'provenance.licence:REQUIRED',
      'provenance.reviewedBy:REQUIRED',
      'provenance.approvedOn:REQUIRED',
      'formatVersion:V2_REQUIRED',
    ]);
  });

  it('FR-SAB-011/013 (DEC-B72): a production seed in format 1 is refused, because it names no source files and no signed report', () => {
    expect(codes(validateSeed(production(syntheticSeed()), ctx({ allowSynthetic: false })))).toEqual(['formatVersion:V2_REQUIRED']);
  });

  it('a production seed must be complete: 114 Surahs and 30 contiguous Paras (F06-AC18 shape)', () => {
    const seed = production(syntheticSeed({ metadata: { surahs: syntheticSurahs().slice(0, 113), paras: syntheticParas().slice(0, 29) } }));
    expect(codes(validateSeed(seed, ctx()))).toEqual(expect.arrayContaining(['metadata:MISSING_SURAHS', 'metadata:MISSING_PARAS']));
  });

  it('refuses duplicates, bad rows, unknown formats, and layout lines outside the Surah metadata', () => {
    const surahs = syntheticSurahs();
    surahs[1] = { ...surahs[1]!, number: 1 };
    const seed = syntheticSeed({
      format: 'other' as QuranSeed['format'],
      datasetKey: 'Bad Key',
      metadata: { surahs, paras: syntheticParas() },
      layouts: [{ edition: 'INDOPAK_16_LINE', linesPerPage: 16, lines: [{ page: 1, line: 2, surah: 1, ayahStart: 19, ayahEnd: 21 }, { page: 1, line: 2, surah: 1, ayahStart: 2, ayahEnd: 1 }] }],
    });
    expect(codes(validateSeed(seed, ctx()))).toEqual(
      expect.arrayContaining([
        'format:UNSUPPORTED',
        'datasetKey:INVALID',
        'metadata.surahs[1].number:DUPLICATE',
        'layouts[0].lines[0].ayahEnd:OUT_OF_RANGE',
        'layouts[0].lines[1].line:DUPLICATE',
        'layouts[0].lines[1].ayahEnd:END_BEFORE_START',
      ]),
    );
    expect(codes(validateSeed(syntheticSeed({ metadata: null, layouts: [] }), ctx()))).toEqual(['metadata:EMPTY']);
    expect(codes(validateSeed(syntheticSeed({ metadata: null }), ctx()))).toContain('layouts[0].lines:NO_SURAH_METADATA');
    expect(codes(validateSeed(syntheticSeed({ layouts: [{ edition: 'INDOPAK_16_LINE', linesPerPage: 16, lines: [{ page: 1, line: 1.5, surah: 1, ayahStart: 1, ayahEnd: 1 }] }] }), ctx()))).toEqual(['layouts[0].lines[0]:NOT_WHOLE']);
  });

  it('the checksum input is canonical: key order does not change it', () => {
    expect(canonicalJson({ b: 1, a: [2, { d: null, c: 'x' }] })).toBe(canonicalJson({ a: [2, { c: 'x', d: null }], b: 1 }));
    expect(canonicalJson({ a: undefined, b: 1 })).toBe('{"b":1}');
  });
});

describe('F06 · review findings (F06-AC19)', () => {
  it('complete, consistent metadata has no findings', () => {
    expect(metadataFindings(syntheticSurahs(), syntheticParas())).toEqual([]);
  });

  it('lists missing Surahs and Paras, overlaps, gaps, and boundaries that no longer fit', () => {
    expect(metadataFindings([], [])).toEqual([
      { code: 'MISSING_SURAHS', numbers: Array.from({ length: 114 }, (_, i) => i + 1) },
      { code: 'MISSING_PARAS', numbers: Array.from({ length: 30 }, (_, i) => i + 1) },
    ]);
    const paras = syntheticParas();
    paras[1] = { ...paras[1]!, start: { surah: paras[1]!.start.surah, ayah: 2 } }; // gap after Para 1
    paras[3] = { ...paras[3]!, start: paras[2]!.end }; // Para 4 starts on Para 3's last Ayat
    const surahs = syntheticSurahs();
    surahs[113] = { ...surahs[113]!, ayahCount: 10 }; // Para 30 now ends past Surah 114's Ayat
    const findings = metadataFindings(surahs, paras);
    expect(findings).toEqual(
      expect.arrayContaining([
        { code: 'PARA_GAP', para: 1, next: 2 },
        { code: 'PARA_OVERLAP', para: 3, next: 4 },
        { code: 'PARA_INVALID', para: 30, issues: [{ field: 'end', code: 'OUT_OF_RANGE', max: 10 }] },
      ]),
    );
  });
});

// F06 · Seed format 2: typed lines, word positions, sources, the signed report, and the licence gate — unit
// (ADR-017 §4, §6; FR-SAB-011…013; DEC-B71, DEC-B72). SYNTHETIC DATA ONLY (synthetic-fixture.ts): invented Surahs of
// 20 Ayat with 6 "words" each, matching no real Mushaf. No real Quran metadata is used.
import { describe, expect, it } from 'vitest';
import {
  ayahLines,
  canonicalJson,
  countLines,
  normalizedLines,
  sourceLicenceIssue,
  validateSeed,
  type QuranSeedV2,
  type SeedContext,
  type SeedLineV2,
} from './index.ts';
import { syntheticLayout, syntheticLayoutV2, syntheticSeed, syntheticSeedV2, syntheticSha, syntheticSurahs } from './synthetic-fixture.ts';

const ctx = (over: Partial<SeedContext> = {}): SeedContext => ({
  editions: [{ code: 'INDOPAK_16_LINE', linesPerPage: 16, pageCount: null }],
  allowSynthetic: true,
  existingSurahs: [],
  ...over,
});
const codes = (issues: { path: string; code: string }[]) => issues.map((i) => `${i.path}:${i.code}`);
const withLines = (lines: SeedLineV2[], over: Partial<QuranSeedV2> = {}) =>
  syntheticSeedV2({ layouts: [{ edition: 'INDOPAK_16_LINE', linesPerPage: 16, lines }], ...over });

/** A seed shaped like production (complete, sourced, signed) but still made of synthetic values; never applied. */
const productionShaped = (over: Partial<QuranSeedV2> = {}): QuranSeedV2 =>
  syntheticSeedV2({
    provenance: { sourceName: 'Synthetic', sourceUrl: null, licence: 'Synthetic', reviewedBy: 'Reviewer (synthetic)', approvedOn: '2026-11-09', synthetic: false },
    sources: [
      { provider: 'SYNTH', resourceId: 'meta', fileSha256: syntheticSha(1), role: 'METADATA' },
      { provider: 'SYNTH', resourceId: 'layout', fileSha256: syntheticSha(2), role: 'LAYOUT' },
    ],
    validationReport: { sha256: syntheticSha(3), decision: 'APPROVED', signedBy: 'Reviewer (synthetic)', signedOn: '2026-11-09' },
    layouts: [{ edition: 'INDOPAK_16_LINE', linesPerPage: 16, lines: syntheticLayoutV2(114) }],
    ...over,
  });

describe('F06 · format-2 line structure (FR-SAB-012)', () => {
  it('a synthetic format-2 layout with headings, Bismillah lines, and Ayat breaking across lines is valid', () => {
    const lines = syntheticLayoutV2(3);
    expect(lines.filter((l) => l.lineType === 'SURAH_NAME')).toHaveLength(3);
    expect(lines.some((l) => l.lineType === 'AYAH' && l.ayahStart !== l.ayahEnd)).toBe(true); // an Ayat breaks mid-line
    expect(validateSeed(syntheticSeedV2(), ctx())).toEqual([]);
  });

  it('heading and Bismillah lines carry no Ayat or words; Ayat lines must carry both', () => {
    const lines = syntheticLayoutV2(1);
    lines[0] = { ...lines[0]!, ayahStart: 1, ayahEnd: 1 }; // a heading with Ayat
    const ayah = lines.findIndex((l) => l.lineType === 'AYAH');
    lines[ayah] = { ...lines[ayah]!, wordStart: null }; // an Ayat line without its word position
    expect(codes(validateSeed(withLines(lines), ctx()))).toEqual(['layouts[0].lines[0]:NOT_AYAH_LINE', `layouts[0].lines[${ayah}]:WORD_POSITION_REQUIRED`]);
  });

  it('a line ending before it starts, or with half a word-ID pair, is refused', () => {
    const lines = syntheticLayoutV2(1);
    const i = lines.findIndex((l) => l.lineType === 'AYAH');
    lines[i] = { ...lines[i]!, ayahEnd: lines[i]!.ayahStart, wordStart: 3, wordEnd: 1 };
    const j = lines.findIndex((l, k) => k > i && l.lineType === 'AYAH');
    lines[j] = { ...lines[j]!, srcLastWordId: null };
    expect(codes(validateSeed(withLines(lines), ctx()))).toEqual(
      expect.arrayContaining([`layouts[0].lines[${i}].wordEnd:END_BEFORE_START`, `layouts[0].lines[${j}]:WORD_ID_PAIR`]),
    );
  });

  it('an unknown line type is refused', () => {
    const lines = syntheticLayoutV2(1);
    lines[1] = { ...lines[1]!, lineType: 'MARGIN' as SeedLineV2['lineType'] };
    expect(codes(validateSeed(withLines(lines), ctx()))).toContain('layouts[0].lines[1].lineType:INVALID');
  });
});

describe('F06 · format-2 order and coverage (ADR-017 §4, V7, V8)', () => {
  const ayahIndexes = (lines: SeedLineV2[]) => lines.map((l, i) => (l.lineType === 'AYAH' ? i : -1)).filter((i) => i >= 0);

  it('a missing line leaves a gap and is refused; nothing is filled in', () => {
    const lines = syntheticLayoutV2(1);
    const [, second, third] = ayahIndexes(lines);
    const gapped = lines.filter((_, i) => i !== second);
    expect(codes(validateSeed(withLines(gapped), ctx()))).toEqual(expect.arrayContaining([`layouts[0].lines[${third! - 1}]:GAP`]));
  });

  it('overlapping word positions are refused', () => {
    const lines = syntheticLayoutV2(1);
    const [first, second] = ayahIndexes(lines);
    lines[second!] = { ...lines[second!]!, ayahStart: lines[first!]!.ayahEnd, wordStart: lines[first!]!.wordEnd };
    expect(codes(validateSeed(withLines(lines), ctx()))).toContain(`layouts[0].lines[${second}]:OVERLAP`);
  });

  it('source word IDs must run on without a gap (every word is on exactly one line)', () => {
    const lines = syntheticLayoutV2(1);
    const [, second] = ayahIndexes(lines);
    lines[second!] = { ...lines[second!]!, srcFirstWordId: lines[second!]!.srcFirstWordId! + 1 };
    expect(codes(validateSeed(withLines(lines), ctx()))).toContain(`layouts[0].lines[${second}]:WORD_ID_GAP`);
  });

  it("a Surah's Ayat lines must follow its heading line", () => {
    const lines = syntheticLayoutV2(2).filter((l) => !(l.lineType === 'SURAH_NAME' && l.surah === 2));
    const firstOf2 = lines.findIndex((l) => l.lineType === 'AYAH' && l.surah === 2);
    expect(codes(validateSeed(withLines(lines), ctx()))).toContain(`layouts[0].lines[${firstOf2}]:SURAH_NAME_MISSING`);
  });

  it('Surahs must follow in order, each ending on its last Ayat', () => {
    const lines = syntheticLayoutV2(3).filter((l) => l.surah !== 2);
    const firstOf3 = lines.findIndex((l) => l.lineType === 'AYAH' && l.surah === 3);
    expect(codes(validateSeed(withLines(lines), ctx()))).toContain(`layouts[0].lines[${firstOf3}].surah:SURAH_ORDER`);
  });

  it('lines are checked in page/line order, whatever order the file lists them in', () => {
    const lines = syntheticLayoutV2(2).reverse();
    expect(validateSeed(withLines(lines), ctx())).toEqual([]);
  });
});

describe('F06 · production seeds: sources and the signed report (FR-SAB-011, FR-SAB-013; DEC-B72)', () => {
  it('a complete, sourced, signed seed passes validation (synthetic values; it is never applied)', () => {
    expect(validateSeed(productionShaped(), ctx({ allowSynthetic: false }))).toEqual([]);
  });

  it('without sources or a report it is refused', () => {
    expect(codes(validateSeed(productionShaped({ sources: [], validationReport: null }), ctx()))).toEqual(['sources:REQUIRED', 'validationReport:REQUIRED']);
  });

  it('each part of the seed needs a source of its role', () => {
    const onlyMeta = productionShaped({ sources: [{ provider: 'SYNTH', resourceId: 'meta', fileSha256: syntheticSha(1), role: 'METADATA' }] });
    expect(codes(validateSeed(onlyMeta, ctx()))).toEqual(['sources:LAYOUT_SOURCE_REQUIRED']);
  });

  it('a rejected or pending review blocks the import, synthetic or not', () => {
    for (const decision of ['REJECTED', 'PENDING'] as const) {
      const report = { sha256: syntheticSha(3), decision, signedBy: 'Reviewer (synthetic)', signedOn: '2026-11-09' };
      expect(codes(validateSeed(productionShaped({ validationReport: report }), ctx()))).toEqual(['validationReport.decision:NOT_APPROVED']);
      expect(codes(validateSeed(syntheticSeedV2({ validationReport: report }), ctx()))).toEqual(['validationReport.decision:NOT_APPROVED']);
    }
  });

  it('the report must be signed by the reviewer named in the provenance, on the approval date', () => {
    const report = { sha256: syntheticSha(3), decision: 'APPROVED' as const, signedBy: 'Someone else', signedOn: '2026-11-10' };
    expect(codes(validateSeed(productionShaped({ validationReport: report }), ctx()))).toEqual([
      'validationReport.signedBy:REVIEWER_MISMATCH',
      'validationReport.signedOn:DATE_MISMATCH',
    ]);
    const unsigned = { ...report, signedBy: null, signedOn: null };
    expect(codes(validateSeed(productionShaped({ validationReport: unsigned }), ctx()))).toEqual(['validationReport.signedBy:REQUIRED', 'validationReport.signedOn:REQUIRED']);
  });

  it('bad source references are refused', () => {
    const sources = [
      { provider: 'qul', resourceId: '11', fileSha256: 'abc', role: 'LAYOUT' as const },
      { provider: 'SYNTH', resourceId: 'meta', fileSha256: syntheticSha(1), role: 'METADATA' as const },
      { provider: 'SYNTH', resourceId: 'meta', fileSha256: syntheticSha(1), role: 'METADATA' as const },
    ];
    expect(codes(validateSeed(productionShaped({ sources }), ctx()))).toEqual(['sources[0].provider:INVALID', 'sources[0].fileSha256:INVALID', 'sources[2]:DUPLICATE']);
  });

  it('a production layout must cover every Surah of the metadata, with no missing page', () => {
    expect(codes(validateSeed(productionShaped({ layouts: [{ edition: 'INDOPAK_16_LINE', linesPerPage: 16, lines: syntheticLayoutV2(113) }] }), ctx()))).toEqual([
      'layouts[0].lines:INCOMPLETE',
    ]);
    const lines = syntheticLayoutV2(114).filter((l) => l.page !== 5);
    expect(codes(validateSeed(productionShaped({ layouts: [{ edition: 'INDOPAK_16_LINE', linesPerPage: 16, lines }] }), ctx()))).toEqual(
      expect.arrayContaining(['layouts[0].lines:PAGE_MISSING']),
    );
  });

  it("a layout must match the edition's verified page count, when one is recorded (V9)", () => {
    const pages = Math.max(...syntheticLayoutV2(114).map((l) => l.page));
    const editions = [{ code: 'INDOPAK_16_LINE', linesPerPage: 16, pageCount: pages + 1 }];
    expect(codes(validateSeed(productionShaped(), ctx({ editions })))).toEqual(['layouts[0].lines:PAGE_COUNT_MISMATCH']);
    expect(validateSeed(productionShaped(), ctx({ editions: [{ ...editions[0]!, pageCount: pages }] }))).toEqual([]);
  });

  it('Surah display fields are format 2 only and range-checked', () => {
    const surahs = syntheticSurahs().map((s, i) => (i === 0 ? { ...s, revelationOrder: 115 } : s));
    expect(codes(validateSeed(syntheticSeedV2({ metadata: { surahs, paras: syntheticSeedV2().metadata!.paras } }), ctx()))).toEqual([
      'metadata.surahs[0].revelationOrder:OUT_OF_RANGE',
    ]);
    const v1 = syntheticSeed({ metadata: { surahs: syntheticSurahs().map((s) => ({ ...s, bismillahPre: true })), paras: syntheticSeed().metadata!.paras } });
    expect(codes(validateSeed(v1, ctx()))).toContain('metadata.surahs[0]:V2_FIELD');
  });
});

describe('F06 · licence gate (FR-SAB-011; DEC-B71)', () => {
  const cleared = { synthetic: false, status: 'PERMISSION_GRANTED' as const, publisherClearanceRef: 'Letter ref (synthetic)' };

  it('an unregistered or uncleared source is refused', () => {
    expect(sourceLicenceIssue(null, 'METADATA', true)).toBe('UNREGISTERED');
    for (const status of ['LICENSE_REVIEW_REQUIRED', 'REFUSED'] as const) {
      expect(sourceLicenceIssue({ ...cleared, status }, 'METADATA', true)).toBe('LICENCE_NOT_CLEARED');
    }
    expect(sourceLicenceIssue(cleared, 'METADATA', true)).toBeNull();
    expect(sourceLicenceIssue({ ...cleared, status: 'OPEN_LICENCE_VERIFIED', publisherClearanceRef: null }, 'METADATA', true)).toBeNull();
  });

  it("a layout source also needs the printed edition's publisher clearance (Taj Company for the Taj layout)", () => {
    expect(sourceLicenceIssue({ ...cleared, publisherClearanceRef: null }, 'LAYOUT', true)).toBe('PUBLISHER_CLEARANCE_REQUIRED');
    expect(sourceLicenceIssue({ ...cleared, publisherClearanceRef: ' ' }, 'LAYOUT', true)).toBe('PUBLISHER_CLEARANCE_REQUIRED');
    expect(sourceLicenceIssue(cleared, 'LAYOUT', true)).toBeNull();
  });

  it('a production seed may not cite a synthetic source; a synthetic seed may', () => {
    expect(sourceLicenceIssue({ ...cleared, synthetic: true }, 'METADATA', true)).toBe('SYNTHETIC_SOURCE');
    expect(sourceLicenceIssue({ ...cleared, synthetic: true }, 'METADATA', false)).toBeNull();
  });
});

describe('F06 · line counting with typed lines (FR-SAB-008, FR-SAB-012)', () => {
  it('only Ayat lines count; heading and Bismillah lines never do (DEC-B77)', () => {
    const seed = syntheticSeedV2();
    const rows = normalizedLines(seed, 0);
    expect(rows.some((r) => r.lineType !== 'AYAH')).toBe(true);
    // Surah 1, Ayat 1–4 = 24 synthetic words = 3 lines of 8; the heading and Bismillah lines above them are not counted.
    expect(countLines({ surah: 1, ayahStart: 1, ayahEnd: 4 }, rows)).toBe(3);
    expect(ayahLines(rows).every((l) => l.ayahStart >= 1)).toBe(true);
  });

  it('format-1 rows (no line type) still count as Ayat lines', () => {
    expect(countLines({ surah: 1, ayahStart: 1, ayahEnd: 4 }, syntheticLayout(1))).toBe(2);
  });
});

describe('F06 · format-1 files keep their checksum', () => {
  it('normalizing a format-1 seed for storage does not change the file that is hashed', () => {
    const seed = syntheticSeed();
    const before = canonicalJson(seed);
    normalizedLines(seed, 0);
    expect(canonicalJson(seed)).toBe(before);
    expect(normalizedLines(seed, 0)[0]).toMatchObject({ lineType: 'AYAH', wordStart: null, isCentered: null });
  });
});

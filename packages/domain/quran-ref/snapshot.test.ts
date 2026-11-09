// F06 · Quran reference snapshot rules (ADR-018; FR-SAB-014; DEC-B77; F06-AC24). SYNTHETIC DATA ONLY: the values come
// from synthetic-fixture.ts and match no real Mushaf.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { canonicalJson } from './metadata.ts';
import { countLines, paraFor, validateAyahRange, type LayoutRow } from './range.ts';
import { buildSnapshot, canCheckOffline, evaluateRange, referenceIndex, snapshotBody, SNAPSHOT_FORMAT_VERSION, type SnapshotInput } from './snapshot.ts';
import { syntheticLayoutV2, syntheticParas, syntheticSurahs } from './synthetic-fixture.ts';

const IMPORT_ID = '01900000-0000-7000-8000-000000000099';

/** The server's raw rows: every printed line of the synthetic layout, typed (headings and Bismillah included). */
const rawLines = (): LayoutRow[] =>
  syntheticLayoutV2(3).map((l) => ({ page: l.page, line: l.line, surah: l.surah, lineType: l.lineType, ayahStart: l.ayahStart ?? null, ayahEnd: l.ayahEnd ?? null }));

const input = (over: Partial<SnapshotInput> = {}): SnapshotInput => ({
  edition: { code: 'INDOPAK_16_LINE', linesPerPage: 16, publisher: null, printingId: null, pageCount: null },
  layout: { importId: IMPORT_ID, verified: false, withdrawn: false },
  metadataWithdrawn: false,
  surahs: syntheticSurahs(),
  paras: syntheticParas(),
  lines: rawLines(),
  attribution: [],
  ...over,
});

const shuffle = <T>(xs: readonly T[], seed: number): T[] => {
  const out = [...xs];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
};

describe('F06 · building the snapshot (ADR-018 §3.2, §3.3)', () => {
  it('is deterministic: the same data in any row order gives the same canonical body', () => {
    const a = snapshotBody(buildSnapshot(input()));
    const b = snapshotBody(buildSnapshot(input({ surahs: shuffle(syntheticSurahs(), 7), paras: shuffle(syntheticParas(), 3), lines: shuffle(rawLines(), 11), attribution: [] })));
    expect(b).toBe(a);
    // Canonical: sorted keys, no whitespace, so re-serializing the parsed body gives the same bytes.
    expect(canonicalJson(JSON.parse(a))).toBe(a);
    expect(a).not.toMatch(/\s"|":\s/);
  });

  it('any change to the data changes the body (and so the version)', () => {
    const base = snapshotBody(buildSnapshot(input()));
    const surahs = syntheticSurahs();
    surahs[4] = { ...surahs[4]!, ayahCount: 19 };
    expect(snapshotBody(buildSnapshot(input({ surahs })))).not.toBe(base);
    expect(snapshotBody(buildSnapshot(input({ layout: { importId: IMPORT_ID, verified: true, withdrawn: false } })))).not.toBe(base);
    expect(snapshotBody(buildSnapshot(input({ attribution: ['Credit (test)'] })))).not.toBe(base);
  });

  it('carries Ayat lines only, as compact rows without word positions (DEC-B77)', () => {
    const snap = buildSnapshot(input());
    const ayah = rawLines().filter((l) => l.lineType === 'AYAH');
    expect(snap.lines).toHaveLength(ayah.length);
    expect(rawLines().length).toBeGreaterThan(ayah.length); // headings and Bismillah lines existed and were dropped
    expect(snap.lines.every((r) => r.length === 5)).toBe(true);
    expect(snap.snapshotFormatVersion).toBe(SNAPSHOT_FORMAT_VERSION);
  });

  it('keeps Arabic names byte-exact (BR-15) and de-duplicates and sorts attribution', () => {
    const odd = 'اختبار‏ ١';
    const surahs = syntheticSurahs();
    surahs[0] = { ...surahs[0]!, nameAr: odd };
    const snap = buildSnapshot(input({ surahs, attribution: ['b', 'a', 'b'] }));
    expect(snap.surahs[0]![1]).toBe(odd);
    expect(JSON.parse(snapshotBody(snap)).surahs[0][1]).toBe(odd);
    expect(snap.attribution).toEqual(['a', 'b']);
  });

  it('decodes back to the rows the rules need (round trip)', () => {
    const index = referenceIndex(buildSnapshot(input()));
    expect(index.surahs).toEqual(syntheticSurahs().map((s) => ({ number: s.number, ayahCount: s.ayahCount })));
    expect(index.paras).toEqual(syntheticParas());
    expect(index.lines.every((l) => l.lineType === 'AYAH')).toBe(true);
    expect(index.layoutImportId).toBe(IMPORT_ID);
  });
});

describe('F06 · evaluateRange: one answer on the server and the device (F06-AC24)', () => {
  it('matches the individual rules for valid and invalid ranges', () => {
    const index = referenceIndex(buildSnapshot(input()));
    expect(evaluateRange({ surah: 1, ayahStart: 1, ayahEnd: 4 }, index)).toEqual({
      para: paraFor({ surah: 1, ayah: 1 }, syntheticParas()),
      issues: [],
      totalLines: countLines({ surah: 1, ayahStart: 1, ayahEnd: 4 }, rawLines()),
      source: 'LAYOUT',
      layoutImportId: IMPORT_ID,
    });
    expect(evaluateRange({ surah: 1, ayahStart: 3, ayahEnd: 25 }, index)).toMatchObject({ issues: [{ field: 'ayahEnd', code: 'OUT_OF_RANGE', max: 20 }], totalLines: null, para: null });
    expect(evaluateRange({ surah: 1, ayahStart: 9, ayahEnd: 3 }, index).issues).toEqual([{ field: 'range', code: 'END_BEFORE_START' }]);
    expect(evaluateRange({ surah: 115, ayahStart: 1, ayahEnd: 2 }, index).issues).toEqual([{ field: 'surah', code: 'UNKNOWN' }]);
    expect(evaluateRange({ surah: null, ayahStart: 1, ayahEnd: 2 }, index).issues).toEqual([{ field: 'surah', code: 'REQUIRED' }]);
  });

  it('with no layout (none imported, or withdrawn) Total Lines is left for the Teacher, never guessed (FR-SAB-008)', () => {
    const index = referenceIndex(buildSnapshot(input({ layout: { importId: null, verified: false, withdrawn: true }, lines: [] })));
    expect(evaluateRange({ surah: 1, ayahStart: 1, ayahEnd: 4 }, index)).toMatchObject({ issues: [], totalLines: null, source: 'UNAVAILABLE', layoutImportId: null });
    // A range the layout does not cover (Surah 4 has no synthetic lines): no pre-fill either.
    const full = referenceIndex(buildSnapshot(input()));
    expect(evaluateRange({ surah: 4, ayahStart: 1, ayahEnd: 2 }, full)).toMatchObject({ totalLines: null, source: 'UNAVAILABLE', layoutImportId: IMPORT_ID });
  });

  it('property: for any range, the snapshot-decoded rows give exactly the answer the raw server rows give', () => {
    const snapIndex = referenceIndex(buildSnapshot(input()));
    const server = { surahs: syntheticSurahs(), paras: syntheticParas(), lines: rawLines(), layoutImportId: IMPORT_ID };
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 116 }), fc.integer({ min: -1, max: 23 }), fc.integer({ min: -1, max: 23 }), (surah, a, b) => {
        expect(evaluateRange({ surah, ayahStart: a, ayahEnd: b }, snapIndex)).toEqual(evaluateRange({ surah, ayahStart: a, ayahEnd: b }, server));
        // and the issues are exactly validateAyahRange's
        expect(evaluateRange({ surah, ayahStart: a, ayahEnd: b }, snapIndex).issues).toEqual(validateAyahRange({ surah, ayahStart: a, ayahEnd: b }, server.surahs));
      }),
      { numRuns: 500 },
    );
  });
});

describe('F06 · offline checks after a metadata withdrawal (DEC-B79, plan P1)', () => {
  it('a Surah missing because its data was withdrawn is not reported as unknown on the device', () => {
    const surahs = syntheticSurahs().filter((s) => s.number !== 9);
    const withdrawn = referenceIndex(buildSnapshot(input({ surahs, metadataWithdrawn: true })));
    expect(canCheckOffline(9, withdrawn)).toBe(false);
    expect(canCheckOffline(8, withdrawn)).toBe(true);
    const complete = referenceIndex(buildSnapshot(input({ surahs })));
    expect(canCheckOffline(9, complete)).toBe(true); // not withdrawn: a missing Surah is genuinely unknown
    expect(canCheckOffline(null, withdrawn)).toBe(true);
  });
});

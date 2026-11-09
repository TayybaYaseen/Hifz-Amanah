// F06 · Range fields logic on the device (US-025; F06-AC6, AC7, AC22, AC24 device side; FR-SAB-008 manual fallback).
// SYNTHETIC DATA ONLY.
import { describe, expect, it } from 'vitest';
import { buildSnapshot, referenceIndex, type LayoutRow } from '@hifz/domain/quran-ref';
import { syntheticLayoutV2, syntheticParas, syntheticSurahs } from '@hifz/domain/quran-ref/synthetic-fixture';
import { checkRange, parseWhole, totalLinesSource } from './rangeCheck.ts';

const lines: LayoutRow[] = syntheticLayoutV2(3).map((l) => ({ page: l.page, line: l.line, surah: l.surah, lineType: l.lineType, ayahStart: l.ayahStart ?? null, ayahEnd: l.ayahEnd ?? null }));
const index = (over: { importId?: string | null; metadataWithdrawn?: boolean; drop?: number } = {}) =>
  referenceIndex(
    buildSnapshot({
      edition: { code: 'INDOPAK_16_LINE', linesPerPage: 16, publisher: null, printingId: null, pageCount: null },
      layout: { importId: over.importId === undefined ? '01900000-0000-7000-8000-0000000000a1' : over.importId, verified: false, withdrawn: false },
      metadataWithdrawn: over.metadataWithdrawn ?? false,
      surahs: syntheticSurahs().filter((s) => s.number !== over.drop),
      paras: syntheticParas(),
      lines: over.importId === null ? [] : lines,
      attribution: [],
    }),
  );

describe('F06 · range fields offline (US-025)', () => {
  it('parses whole numbers only', () => {
    expect(parseWhole('')).toBeNull();
    expect(parseWhole(' 12 ')).toBe(12);
    for (const bad of ['1.5', '-1', 'x', '١٢']) expect(parseWhole(bad)).toBe('NOT_WHOLE');
  });

  it('a valid range derives its Para and pre-fills Total Lines from the cached layout', () => {
    const r = checkRange({ surah: '1', ayahStart: '1', ayahEnd: '4' }, index());
    expect(r).toMatchObject({ state: 'CHECKED', fieldErrors: {}, evaluation: { para: 1, source: 'LAYOUT' } });
    if (r.state !== 'CHECKED') throw new Error();
    expect(r.evaluation.totalLines).toBeGreaterThan(0);
  });

  it('F06-AC6: an Ayat beyond the Surah names the maximum; F06-AC7: an end before its start is refused', () => {
    expect(checkRange({ surah: '1', ayahStart: '3', ayahEnd: '25' }, index()).fieldErrors).toEqual({ ayahEnd: { code: 'OUT_OF_RANGE', max: 20 } });
    expect(checkRange({ surah: '1', ayahStart: '9', ayahEnd: '3' }, index()).fieldErrors).toEqual({ range: { code: 'END_BEFORE_START' } });
    expect(checkRange({ surah: '200', ayahStart: '1', ayahEnd: '2' }, index()).fieldErrors).toEqual({ surah: { code: 'UNKNOWN' } });
  });

  it('without a snapshot, or for a Surah withdrawn from it, the range is left for the server, never refused falsely', () => {
    expect(checkRange({ surah: '1', ayahStart: '1', ayahEnd: '4' }, null).state).toBe('UNCHECKED');
    expect(checkRange({ surah: '9', ayahStart: '1', ayahEnd: '4' }, index({ drop: 9, metadataWithdrawn: true })).state).toBe('UNCHECKED');
    expect(checkRange({ surah: '9', ayahStart: '1', ayahEnd: '4' }, index({ drop: 9 })).fieldErrors).toEqual({ surah: { code: 'UNKNOWN' } });
  });

  it('with no layout, Total Lines is not pre-filled and is entered by hand (FR-SAB-008)', () => {
    const r = checkRange({ surah: '1', ayahStart: '1', ayahEnd: '4' }, index({ importId: null }));
    expect(r).toMatchObject({ state: 'CHECKED', evaluation: { totalLines: null, source: 'UNAVAILABLE' } });
    expect(totalLinesSource(null, '5')).toBe('MANUAL');
    expect(totalLinesSource(3, '3')).toBe('LAYOUT');
    expect(totalLinesSource(3, '4')).toBe('MANUAL');
    expect(totalLinesSource(3, '')).toBeNull();
  });

  it('an incomplete or malformed draft is not evaluated', () => {
    expect(checkRange({ surah: '1', ayahStart: '', ayahEnd: '4' }, index()).state).toBe('INCOMPLETE');
    expect(checkRange({ surah: '1', ayahStart: '2.5', ayahEnd: '4' }, index()).fieldErrors).toEqual({ ayahStart: { code: 'NOT_WHOLE' } });
  });
});

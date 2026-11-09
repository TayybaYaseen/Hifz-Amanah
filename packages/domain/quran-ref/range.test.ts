// F06 · Quran portions — unit: Quran reference validation (docs/specs/07-f06-quran-portions-metadata.md)
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  countLines,
  paraFor,
  rangesNeedingReview,
  validateAyahRange,
  validatePara,
  validateParaBoundary,
  validateSpan,
  validateSurah,
  type LayoutLine,
  type ParaBoundary,
  type SurahMeta,
} from './index.ts';

// Synthetic metadata for the rules (not the shipped seed).
const SURAHS: SurahMeta[] = [
  { number: 1, ayahCount: 7 },
  { number: 2, ayahCount: 286 },
  { number: 3, ayahCount: 200 },
];
const PARAS: ParaBoundary[] = [
  { number: 1, start: { surah: 1, ayah: 1 }, end: { surah: 2, ayah: 141 } },
  { number: 2, start: { surah: 2, ayah: 142 }, end: { surah: 2, ayah: 252 } },
  { number: 3, start: { surah: 2, ayah: 253 }, end: { surah: 3, ayah: 92 } },
];
const codes = (issues: { field: string; code: string }[]) => issues.map((i) => `${i.field}:${i.code}`);

describe('F06 · Para', () => {
  it('F06-AC5 (US-025) Para 1–30 is accepted; Para 0 and Para 31 are rejected', () => {
    expect(validatePara(1)).toEqual([]);
    expect(validatePara(30)).toEqual([]);
    expect(validatePara(0)).toEqual([{ field: 'para', code: 'OUT_OF_RANGE', min: 1, max: 30 }]);
    expect(codes(validatePara(31))).toEqual(['para:OUT_OF_RANGE']);
    expect(codes(validatePara(2.5))).toEqual(['para:OUT_OF_RANGE']);
  });
});

describe('F06 · Ayat range', () => {
  it('F06-AC6 (US-025) Ayat 3–9 in a 7-Ayat Surah is rejected with an error naming the maximum Ayat', () => {
    expect(validateAyahRange({ surah: 1, ayahStart: 3, ayahEnd: 9 }, SURAHS)).toEqual([{ field: 'ayahEnd', code: 'OUT_OF_RANGE', max: 7 }]);
  });

  it('F06-AC7 (US-025) an end Ayat before the start Ayat is rejected', () => {
    expect(codes(validateAyahRange({ surah: 2, ayahStart: 10, ayahEnd: 5 }, SURAHS))).toEqual(['range:END_BEFORE_START']);
    expect(codes(validateSpan({ start: { surah: 3, ayah: 1 }, end: { surah: 2, ayah: 5 } }, SURAHS))).toEqual(['range:END_BEFORE_START']);
  });

  it('F06 property: every range within 1..ayatCount with start ≤ end is accepted', () => {
    const arb = fc.constantFrom(...SURAHS).chain((s) =>
      fc.tuple(fc.constant(s.number), fc.integer({ min: 1, max: s.ayahCount }), fc.integer({ min: 1, max: s.ayahCount })),
    );
    fc.assert(
      fc.property(arb, ([surah, a, b]) => {
        const issues = validateAyahRange({ surah, ayahStart: Math.min(a, b), ayahEnd: Math.max(a, b) }, SURAHS);
        expect(issues).toEqual([]);
      }),
    );
  });

  it('missing, unknown, and fractional parts are field errors (FR-SAB-009)', () => {
    expect(codes(validateAyahRange({ surah: null, ayahStart: null, ayahEnd: 3 }, SURAHS))).toEqual(['surah:REQUIRED', 'ayahStart:REQUIRED']);
    expect(codes(validateAyahRange({ surah: 99, ayahStart: 1, ayahEnd: 3 }, SURAHS))).toEqual(['surah:UNKNOWN']);
    expect(codes(validateAyahRange({ surah: 2, ayahStart: 1.5, ayahEnd: 3 }, SURAHS))).toEqual(['ayahStart:NOT_WHOLE']);
    expect(codes(validateAyahRange({ surah: 2, ayahStart: 0, ayahEnd: 3 }, SURAHS))).toEqual(['ayahStart:OUT_OF_RANGE']);
  });

  it('a range may span two Surahs when both ends are valid and in order (Sabqi/Manzil edge case)', () => {
    expect(validateSpan({ start: { surah: 1, ayah: 5 }, end: { surah: 2, ayah: 10 } }, SURAHS)).toEqual([]);
    expect(codes(validateSpan({ start: { surah: 1, ayah: 5 }, end: { surah: 2, ayah: 300 } }, SURAHS))).toEqual(['ayahEnd:OUT_OF_RANGE']);
    expect(codes(validateSpan({ start: { surah: 1, ayah: 5 }, end: { surah: 120, ayah: 1 } }, SURAHS))).toContain('surah:UNKNOWN');
  });
});

describe('F06 · metadata', () => {
  it('F06-AC4 (US-024) a Para boundary whose end is before its start is rejected', () => {
    expect(validateParaBoundary(PARAS[1]!, SURAHS)).toEqual([]);
    const reversed: ParaBoundary = { number: 2, start: { surah: 2, ayah: 252 }, end: { surah: 2, ayah: 142 } };
    expect(codes(validateParaBoundary(reversed, SURAHS))).toEqual(['end:END_BEFORE_START']);
    expect(codes(validateParaBoundary({ number: 31, start: { surah: 1, ayah: 1 }, end: { surah: 9, ayah: 1 } }, SURAHS))).toEqual(['number:OUT_OF_RANGE', 'end:UNKNOWN_SURAH']);
    expect(codes(validateParaBoundary({ number: 1, start: { surah: 1, ayah: 8 }, end: { surah: 2, ayah: 1 } }, SURAHS))).toEqual(['start:OUT_OF_RANGE']);
  });

  it('F06-AC3 (US-024) an Arabic Surah name is kept byte-identical (no normalization or transliteration)', () => {
    // Decomposed and precomposed forms, tatweel, and diacritics must all pass through untouched.
    const names = ['الفاتحة', 'البَقَرَة', 'آل عمران', 'آل عمران', 'الـبقرة'];
    for (const nameAr of names) {
      const row = { number: 2, nameAr, nameTranslit: 'Al-Baqarah', ayahCount: 286 };
      expect(validateSurah(row)).toEqual([]);
      expect(row.nameAr).toBe(nameAr);
      expect(Buffer.from(row.nameAr, 'utf8').equals(Buffer.from(nameAr, 'utf8'))).toBe(true);
    }
  });

  it('a Surah row needs a number 1–114, both names, and an Ayat count', () => {
    expect(codes(validateSurah({ number: 0, nameAr: ' ', nameTranslit: '', ayahCount: 0 }))).toEqual([
      'number:OUT_OF_RANGE',
      'nameAr:REQUIRED',
      'nameTranslit:REQUIRED',
      'ayahCount:OUT_OF_RANGE',
    ]);
    expect(codes(validateSurah({ number: 1, nameAr: 'x'.repeat(101), nameTranslit: 'ok', ayahCount: 7 }))).toEqual(['nameAr:TOO_LONG']);
  });

  it('F06-AC19 (US-024) records whose range became invalid after an edit are listed, never changed', () => {
    const records = [
      { id: 'a', range: { surah: 1, ayahStart: 1, ayahEnd: 7 } },
      { id: 'b', range: { surah: 1, ayahStart: 2, ayahEnd: 3 } },
    ];
    const edited = [{ number: 1, ayahCount: 6 }, ...SURAHS.slice(1)];
    const before = structuredClone(records);
    expect(rangesNeedingReview(records, edited).map((r) => r.id)).toEqual(['a']);
    expect(records).toEqual(before);
  });
});

describe('F06 · derived Para and line count (used by Sabaq, F05)', () => {
  it('paraFor finds the boundary that holds a position, or null', () => {
    expect(paraFor({ surah: 1, ayah: 1 }, PARAS)).toBe(1);
    expect(paraFor({ surah: 2, ayah: 141 }, PARAS)).toBe(1);
    expect(paraFor({ surah: 2, ayah: 142 }, PARAS)).toBe(2);
    expect(paraFor({ surah: 3, ayah: 92 }, PARAS)).toBe(3);
    expect(paraFor({ surah: 3, ayah: 93 }, PARAS)).toBeNull();
  });

  it('countLines counts the layout lines a range touches, and is null when the layout does not cover it', () => {
    const layout: LayoutLine[] = [
      { page: 2, line: 2, surah: 2, ayahStart: 1, ayahEnd: 2 },
      { page: 2, line: 3, surah: 2, ayahStart: 2, ayahEnd: 3 },
      { page: 2, line: 4, surah: 2, ayahStart: 4, ayahEnd: 4 },
      { page: 2, line: 5, surah: 2, ayahStart: 5, ayahEnd: 5 },
    ];
    expect(countLines({ surah: 2, ayahStart: 1, ayahEnd: 5 }, layout)).toBe(4);
    expect(countLines({ surah: 2, ayahStart: 2, ayahEnd: 2 }, layout)).toBe(2);
    expect(countLines({ surah: 2, ayahStart: 4, ayahEnd: 6 }, layout)).toBeNull();
    expect(countLines({ surah: 3, ayahStart: 1, ayahEnd: 2 }, layout)).toBeNull();
    expect(countLines({ surah: 2, ayahStart: 1, ayahEnd: 5 }, [])).toBeNull();
  });
});

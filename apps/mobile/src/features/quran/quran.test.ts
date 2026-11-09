// F06 · Quran metadata in the app — unit (docs/specs/07-f06-quran-portions-metadata.md). Synthetic values only.
import { describe, expect, it } from 'vitest';
import type { ParaView, SurahView } from '@hifz/contracts';
import { checkPara, checkSurah, compactList, findingMessage, issueMessage, paraFieldOf, refText } from './quran.ts';

const SURAHS = [
  { number: 1, ayahCount: 7 },
  { number: 2, ayahCount: 20 },
];
const keys = (errors: Record<string, { key: string }>) => Object.fromEntries(Object.entries(errors).map(([f, m]) => [f, m.key]));

describe('F06 · Surah form', () => {
  it('F06-AC3 (US-024) the Arabic name is sent exactly as typed, with no trimming or normalization', () => {
    const nameAr = ' آختِبار ';
    const { request, errors } = checkSurah({ number: '2', nameAr, nameTranslit: 'Synthetic 2', ayahCount: '20' }, null);
    expect(errors).toEqual({});
    expect(request).toEqual({ number: 2, body: { nameAr, nameTranslit: 'Synthetic 2', ayahCount: 20, rowVersion: null } });
  });

  it('an edit sends the version it read, so a stale edit is refused instead of overwriting', () => {
    const existing = { rowVersion: 3 } as SurahView;
    expect(checkSurah({ number: '2', nameAr: 'x', nameTranslit: 'y', ayahCount: '20' }, existing).request?.body.rowVersion).toBe(3);
  });

  it('F06-AC1 (US-024) missing, fractional, and out-of-range values are field errors before anything is sent', () => {
    expect(keys(checkSurah({ number: '', nameAr: ' ', nameTranslit: '', ayahCount: '2.5' }, null).errors)).toEqual({
      number: 'fields.REQUIRED',
      ayahCount: 'quran.form.wholeNumber',
      nameAr: 'fields.REQUIRED',
      nameTranslit: 'fields.REQUIRED',
    });
    const range = checkSurah({ number: '115', nameAr: 'x', nameTranslit: 'y', ayahCount: '0' }, null);
    expect(range.request).toBeNull();
    expect(range.errors.number).toEqual({ key: 'fields.OUT_OF_RANGE_MAX', values: { max: 114 } });
    expect(range.errors.ayahCount).toEqual({ key: 'fields.OUT_OF_RANGE_MAX', values: { max: 999 } });
  });
});

describe('F06 · Para form', () => {
  const draft = { number: '1', startSurah: '1', startAyah: '1', endSurah: '2', endAyah: '10' };

  it('a valid boundary becomes the request', () => {
    expect(checkPara(draft, { rowVersion: 2 } as ParaView, SURAHS)).toEqual({
      request: { number: 1, body: { start: { surah: 1, ayah: 1 }, end: { surah: 2, ayah: 10 }, rowVersion: 2 } },
      errors: {},
    });
  });

  it('F06-AC4 (US-024) an end before the start is refused on the end field', () => {
    expect(keys(checkPara({ ...draft, startSurah: '2', startAyah: '5', endSurah: '2', endAyah: '2' }, null, SURAHS).errors)).toEqual({ endAyah: 'fields.END_BEFORE_START' });
  });

  it('F06-AC6 (US-025) an Ayat past the Surah end names the maximum', () => {
    expect(checkPara({ ...draft, endAyah: '25' }, null, SURAHS).errors).toEqual({ endAyah: { key: 'fields.OUT_OF_RANGE_MAX', values: { max: 20 } } });
    expect(keys(checkPara({ ...draft, endSurah: '9' }, null, SURAHS).errors)).toEqual({ endSurah: 'fields.UNKNOWN_SURAH' });
    expect(keys(checkPara({ ...draft, number: '31', startAyah: '' }, null, SURAHS).errors)).toEqual({ startAyah: 'fields.REQUIRED' });
    expect(keys(checkPara({ ...draft, number: '31' }, null, SURAHS).errors)).toEqual({ number: 'fields.OUT_OF_RANGE_MAX' });
  });

  it('API field names map to the form boxes', () => {
    expect(paraFieldOf('end', 'END_BEFORE_START')).toBe('endAyah');
    expect(paraFieldOf('start', 'UNKNOWN_SURAH')).toBe('startSurah');
    expect(paraFieldOf('end.ayah', 'INVALID')).toBe('endAyah');
    expect(paraFieldOf('rowVersion', 'INVALID')).toBe('rowVersion');
  });
});

describe('F06 · review list and display', () => {
  it('F06-AC19 (US-024) each finding has a message; long lists of numbers are compacted', () => {
    expect(findingMessage({ code: 'MISSING_SURAHS', numbers: [1, 2, 3, 5, 7, 8, 9] })).toEqual({ key: 'quran.review.missingSurahs', values: { count: 7, list: '1–3, 5, 7–9' } });
    expect(findingMessage({ code: 'MISSING_PARAS', numbers: [30] }).values).toEqual({ count: 1, list: '30' });
    expect(findingMessage({ code: 'PARA_INVALID', para: 30, issues: [] })).toEqual({ key: 'quran.review.paraInvalid', values: { para: 30 } });
    expect(findingMessage({ code: 'PARA_GAP', para: 1, next: 2 }).key).toBe('quran.review.paraGap');
    expect(findingMessage({ code: 'PARA_OVERLAP', para: 3, next: 4 }).key).toBe('quran.review.paraOverlap');
    expect(findingMessage({ code: 'LAYOUT_MISSING', edition: 'INDOPAK_16_LINE' }).key).toBe('quran.review.layoutMissing');
    expect(compactList([])).toBe('');
  });

  it('issue codes the form does not know become a generic message', () => {
    expect(issueMessage({ code: 'SOMETHING_NEW' })).toEqual({ key: 'fields.INVALID' });
    expect(issueMessage({ code: 'OUT_OF_RANGE' })).toEqual({ key: 'fields.OUT_OF_RANGE' });
    expect(refText({ surah: 2, ayah: 142 })).toBe('2:142');
  });
});

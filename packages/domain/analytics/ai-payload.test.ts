// F15 · Analytics and AI recommendations — unit: payload minimizer and PII scanner (docs/specs/15-f15-analytics-ai.md)
// Synthetic data only.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { AI_DATA_CATEGORIES, flattenPayloadNumbers, minimizeForAi, payloadDates, payloadTextScan, toLatinDigits, type AiDataCategory } from './ai-payload.ts';
import { buildAnalytics } from './metrics.ts';
import { SYNTHETIC_NAME, SYNTHETIC_NOTE, SYNTHETIC_REMARK, syntheticInput } from './synthetic-fixture.ts';

const ALL_ON: Record<AiDataCategory, boolean> = { ATTENDANCE: true, PROGRESS: true, MISTAKES: true, QUALITY: true, HOMEWORK: true };
const analytics = () => buildAnalytics(syntheticInput());
const minimize = (categories = ALL_ON) => minimizeForAi(analytics(), { categories, pseudonym: 'S-A1', locale: 'en' });

describe('F15 · payload minimizer', () => {
  it('F15-AC13 (US-065) the default payload holds no name, id, contact, note, or remark; the student is a pseudonym', () => {
    const src = syntheticInput();
    const p = minimizeForAi(buildAnalytics(src), { categories: ALL_ON, pseudonym: 'S-A1', locale: 'en' });
    const text = JSON.stringify(p);
    expect(p.subject).toBe('S-A1');
    expect(text).not.toContain(SYNTHETIC_NAME);
    expect(text).not.toContain(src.student.id);
    expect(text).not.toContain('SYNTHETIC-PRIVATE-NOTE');
    expect(text).not.toContain('SYNTHETIC-REMARK');
    for (const r of src.records) {
      expect(text).not.toContain(r.id);
      for (const portion of r.portions) expect(text).not.toContain(portion.id);
    }
    expect(text).not.toContain('c1');
    expect(payloadTextScan(p, [SYNTHETIC_NAME, 'Zaid', SYNTHETIC_NOTE, SYNTHETIC_REMARK, src.student.id])).toEqual([]);
  });

  it('F15-AC13 (US-065) the payload carries only numbers, enums, dates, booleans, and the pseudonym', () => {
    const p = minimize();
    const strings: string[] = [];
    const walk = (v: unknown): void => {
      if (typeof v === 'string') strings.push(v);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v !== null && typeof v === 'object') Object.values(v).forEach(walk);
    };
    walk(p);
    for (const s of strings) expect(s).toMatch(/^(\d{4}-\d{2}-\d{2}|[A-Z_]+|S-A1|en|ur|ur-Latn)$/);
  });

  it('F15-AC14 (US-065) a category switched off is absent from the payload', () => {
    for (const off of AI_DATA_CATEGORIES) {
      const p = minimize({ ...ALL_ON, [off]: false });
      const key = { ATTENDANCE: 'attendance', PROGRESS: 'progress', MISTAKES: 'mistakes', QUALITY: 'quality', HOMEWORK: 'homework' }[off];
      expect(key in p).toBe(false);
      expect(p.categories).not.toContain(off);
      expect([...flattenPayloadNumbers(p).keys()].some((k) => k.startsWith(`${key}.`))).toBe(false);
      for (const other of AI_DATA_CATEGORIES.filter((c) => c !== off)) expect(p.categories).toContain(other);
    }
    const none = minimize({ ATTENDANCE: false, PROGRESS: false, MISTAKES: false, QUALITY: false, HOMEWORK: false });
    expect(Object.keys(none).sort()).toEqual(['categories', 'dataInsufficient', 'locale', 'period', 'recordedDays', 'subject', 'version']);
  });

  it('F15-AC16 (US-065) every subset of categories includes exactly the categories switched on (property)', () => {
    const a = analytics();
    fc.assert(
      fc.property(fc.record({ ATTENDANCE: fc.boolean(), PROGRESS: fc.boolean(), MISTAKES: fc.boolean(), QUALITY: fc.boolean(), HOMEWORK: fc.boolean() }), (cats) => {
        const p = minimizeForAi(a, { categories: cats, pseudonym: 'S-B2', locale: 'ur' });
        expect(p.categories).toEqual(AI_DATA_CATEGORIES.filter((c) => cats[c]));
        expect(p.attendance !== undefined).toBe(cats.ATTENDANCE);
        expect(p.progress !== undefined).toBe(cats.PROGRESS);
        expect(p.mistakes !== undefined).toBe(cats.MISTAKES);
        expect(p.quality !== undefined).toBe(cats.QUALITY);
        expect(p.homework !== undefined).toBe(cats.HOMEWORK);
      }),
    );
  });

  it('F15-AC13 (US-065) a pseudonym that is not a short opaque token is refused', () => {
    expect(() => minimizeForAi(analytics(), { categories: ALL_ON, pseudonym: SYNTHETIC_NAME, locale: 'en' })).toThrow(RangeError);
    expect(() => minimizeForAi(analytics(), { categories: ALL_ON, pseudonym: 'a@b.co', locale: 'en' })).toThrow(RangeError);
    expect(() => minimizeForAi(analytics(), { categories: ALL_ON, pseudonym: '', locale: 'en' })).toThrow(RangeError);
  });

  it('F15-AC7 (US-063) numbers sit under stable dotted keys; quantities stay fractions; missing quality is absent, never 0', () => {
    const p = minimize();
    const flat = flattenPayloadNumbers(p);
    expect(flat.get('mistakes.totals.byCategory.TAJWEED')).toBe(6);
    expect(flat.get('mistakes.totals.bySeverity.MAJOR')).toBe(6);
    expect(flat.get('mistakes.totals.repeated')).toBe(6);
    expect(flat.get('progress.MANZIL.assigned.PARA.numerator')).toBe(3);
    expect(flat.get('progress.MANZIL.assigned.PARA.denominator')).toBe(1);
    expect(flat.get('progress.MANZIL.completed.PARA.numerator')).toBe(3);
    expect(flat.get('progress.MANZIL.completed.PARA.denominator')).toBe(2);
    expect(flat.get('progress.SABAQ.assigned.LINES.numerator')).toBe(60);
    expect(p.progress?.MANZIL?.paras).toEqual([10, 11, 12]);
    expect(flat.get('attendance.absent')).toBe(1);
    expect(flat.get('attendance.attended')).toBe(2);
    expect(flat.get('quality.scaleBest')).toBe(1);
    expect(flat.get('quality.scaleWorst')).toBe(5);
    expect(flat.get('quality.firstHalfAverage')).toBeDefined();
    expect(flat.get('quality.secondHalfAverage')).toBeDefined();
    expect(p.quality?.direction).toBe('IMPROVING');
    expect(p.quality?.firstHalfAverage).toBeGreaterThan(p.quality?.secondHalfAverage ?? 99);
    // The Nov 12 day had no Manzil rating but a Sabaq rating; days with no rating at all are left out of points.
    for (const pt of p.quality?.points ?? []) expect(pt.average).toBeGreaterThanOrEqual(1);
    expect(payloadDates(p)).toContain('2026-11-01');
    expect(payloadDates(p)).toContain('2026-11-30');
    // No number in the payload is a float quantity.
    for (const [k, v] of flat) if (/\.(assigned|completed|remaining|extraCompleted)\./.test(k)) expect(Number.isInteger(v)).toBe(true);
  });

  it('F15-AC13 (US-065) with no ratings at all the quality averages are absent, not 0', () => {
    const src = syntheticInput();
    const unrated = { ...src, records: src.records.map((r) => ({ ...r, portions: r.portions.map((po) => ({ ...po, attempts: po.attempts.map((at) => ({ ...at, quality: null })) })) })) };
    const p = minimizeForAi(buildAnalytics(unrated), { categories: ALL_ON, pseudonym: 'S-A1', locale: 'en' });
    expect(p.quality).toBeDefined();
    expect('average' in p.quality!).toBe(false);
    expect('firstHalfAverage' in p.quality!).toBe(false);
    expect(p.quality!.ratedCount).toBe(0);
    expect(p.quality!.limited).toBe(true);
    expect(p.quality!.points).toEqual([]);
  });

  it('F15-AC13 (US-065) too little data is flagged in the payload', () => {
    const src = syntheticInput();
    const p = minimizeForAi(buildAnalytics({ ...src, records: src.records.slice(0, 2) }), { categories: ALL_ON, pseudonym: 'S-A1', locale: 'en' });
    expect(p.recordedDays).toBe(2);
    expect(p.dataInsufficient).toBe(true);
  });
});

describe('F15 · PII scanner', () => {
  const p = () => minimize();

  it('F15-AC13 (US-065) finds a forbidden name, id, or note body anywhere in the payload, as a whole word', () => {
    const leaked = { ...p(), subject: 'Zaid' };
    expect(payloadTextScan(leaked, ['Zaid'])).toEqual(['Zaid']);
    expect(payloadTextScan(leaked, ['zaid'])).toEqual(['zaid']);
    const withNote = { ...p(), period: { ...p().period, kind: SYNTHETIC_NOTE as 'MONTH' } };
    expect(payloadTextScan(withNote, [SYNTHETIC_NOTE])).toEqual([SYNTHETIC_NOTE]);
    // Not a match inside another word: "Ali" is not found in "QUALITY" or "PARTIAL".
    expect(payloadTextScan(p(), ['Ali', 'tial'])).toEqual([]);
    // Urdu-script names are found too.
    expect(payloadTextScan({ ...p(), subject: 'زید' }, ['زید'])).toEqual(['زید']);
    expect(payloadTextScan(p(), ['', '   '])).toEqual([]);
  });

  it('F15-AC13 (US-065) flags any email-shaped or phone-shaped text whatever the list says, without returning it', () => {
    expect(payloadTextScan({ ...p(), subject: 'parent.synthetic@example.test' }, [])).toEqual(['[EMAIL]']);
    expect(payloadTextScan({ ...p(), subject: '+92 300 1234567' }, [])).toEqual(['[PHONE]']);
    expect(payloadTextScan({ ...p(), subject: '0300-1234567' }, [])).toEqual(['[PHONE]']);
    // Urdu digits.
    expect(payloadTextScan({ ...p(), subject: '۰۳۰۰۱۲۳۴۵۶۷' }, [])).toEqual(['[PHONE]']);
    // Dates and counts are not phones.
    expect(payloadTextScan(p(), [])).toEqual([]);
  });

  it('F15-AC13 (US-065) converts Urdu and Arabic-Indic digits', () => {
    expect(toLatinDigits('۱۲٣')).toBe('123');
  });
});

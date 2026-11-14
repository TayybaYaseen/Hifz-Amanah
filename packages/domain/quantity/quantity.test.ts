// F06 · Quran portions — unit: quantity type (docs/specs/07-f06-quran-portions-metadata.md)
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  InvalidQuantityError,
  PARA_PRESET_KEYS,
  UnitMismatchError,
  add,
  compare,
  defaultAssignedLines,
  fractionText,
  isQuantity,
  parseWhole,
  preset,
  presetOf,
  quantity,
  remaining,
  rulesFor,
  subtractFloor,
  totalsByUnit,
  validateQuantities,
  whole,
  type Quantity,
  type QuantityUnit,
} from './index.ts';

const lines = (n: number) => whole('LINES', n);
const para = (n: number, d: number) => quantity('PARA', n, d);
const codes = (issues: { field: string; code: string }[]) => issues.map((i) => `${i.field}:${i.code}`);

/** A same-unit pair of exact quantities: whole numbers, or Para quarters 0..4/4. */
const unitArb = fc.constantFrom<QuantityUnit>('PARA', 'LINES', 'AYAT', 'PAGES');
const qtyOf = (unit: QuantityUnit): fc.Arbitrary<Quantity> =>
  unit === 'PARA' ? fc.integer({ min: 0, max: 4 }).map((n) => para(n, 4)) : fc.integer({ min: 0, max: 100_000 }).map((n) => quantity(unit, n));
const pairArb = unitArb.chain((u) => fc.tuple(qtyOf(u), qtyOf(u)));

describe('F06 · presets', () => {
  it('F06-AC10 (US-027) Salasah is stored as 3/4 Para and displayed as "Salasah (3/4 Para)" (AC-QTY-01)', () => {
    const q = preset('SALASAH');
    expect(q).toEqual({ unit: 'PARA', numerator: 3, denominator: 4 });
    // The display is the localized preset label plus the canonical fraction; the label key is the preset.
    expect(presetOf(q)).toBe('SALASAH');
    expect(fractionText(q)).toBe('3/4');
  });

  it('F06-AC11 (US-027) Rubu, Half, and Complete are stored exactly as 1/4, 1/2, and 1 Para', () => {
    expect(preset('RUBU')).toEqual({ unit: 'PARA', numerator: 1, denominator: 4 });
    expect(preset('HALF')).toEqual({ unit: 'PARA', numerator: 1, denominator: 2 });
    expect(preset('COMPLETE')).toEqual({ unit: 'PARA', numerator: 1, denominator: 1 });
    expect(presetOf(para(2, 4))).toBe('HALF');
    expect(presetOf(para(4, 4))).toBe('COMPLETE');
    expect(presetOf(lines(1))).toBeNull();
    expect(PARA_PRESET_KEYS).toEqual(['RUBU', 'HALF', 'SALASAH', 'COMPLETE']);
  });

  it('F06-AC8 (US-026) LINES quantities are whole numbers', () => {
    expect(lines(12)).toEqual({ unit: 'LINES', numerator: 12, denominator: 1 });
    expect(quantity('LINES', 10, 2)).toEqual(lines(5));
    expect(() => quantity('LINES', 5, 2)).toThrow(InvalidQuantityError);
    expect(() => quantity('LINES', 2.5)).toThrow(InvalidQuantityError);
  });
});

describe('F06 · remaining', () => {
  it('F06-AC9 (US-026) 10 lines assigned, 6 completed → 4 lines remaining (AC-QTY-02)', () => {
    expect(remaining(lines(10), lines(6))).toEqual(lines(4));
  });

  it('F06-AC12 (US-027) 3/4 Para assigned, 1/2 completed → 1/4 Para remaining (AC-QTY-03)', () => {
    expect(remaining(preset('SALASAH'), preset('HALF'))).toEqual(preset('RUBU'));
  });

  it('F06-AC14 (US-027) completed greater than assigned is rejected (AC-QTY-05)', () => {
    const issues = validateQuantities('SABQI', { assigned: preset('HALF'), completed: preset('SALASAH') });
    expect(codes(issues)).toEqual(['completed:ABOVE_ASSIGNED']);
    expect(validateQuantities('SABQI', { assigned: preset('HALF'), completed: preset('HALF') })).toEqual([]);
  });

  it('F06 property: remaining = max(0, assigned − completed) for any same-unit pair', () => {
    fc.assert(
      fc.property(pairArb, ([a, c]) => {
        const r = remaining(a, c) as Quantity;
        // Cross-multiplied integer check: r = a − c when a ≥ c, else 0.
        const diff = a.numerator * c.denominator - c.numerator * a.denominator;
        if (diff <= 0) expect(r.numerator).toBe(0);
        else expect(r.numerator * a.denominator * c.denominator).toBe(diff * r.denominator);
        expect(r.unit).toBe(a.unit);
      }),
    );
  });

  it('F06 property: quantities are exact rationals; no float is ever produced', () => {
    fc.assert(
      fc.property(pairArb, ([a, b]) => {
        for (const q of [add(a, b), subtractFloor(a, b), remaining(a, b) as Quantity]) {
          expect(Number.isSafeInteger(q.numerator)).toBe(true);
          expect(Number.isSafeInteger(q.denominator)).toBe(true);
          expect(isQuantity(q)).toBe(true);
        }
        expect(compare(add(a, b), a)).toBeGreaterThanOrEqual(0);
        expect(compare(a, b) + compare(b, a)).toBe(0);
      }),
    );
  });

  it('a missing completed amount is unknown, so remaining is unknown, never "all remaining" (FR-QTY-008)', () => {
    expect(remaining(lines(10), null)).toBeNull();
  });
});

describe('F06 · totals', () => {
  it('F06-AC13 (US-027) LINES and PARA totals are returned separately and never added (AC-QTY-04)', () => {
    const totals = totalsByUnit([lines(10), preset('HALF'), lines(5), preset('SALASAH')]);
    expect(totals).toEqual([para(5, 4), lines(15)]);
    expect(totalsByUnit([])).toEqual([]);
  });

  it('F06 unit: comparing or subtracting different units throws', () => {
    expect(() => compare(lines(1), preset('COMPLETE'))).toThrow(UnitMismatchError);
    expect(() => add(lines(1), whole('AYAT', 1))).toThrow(UnitMismatchError);
    expect(() => subtractFloor(whole('PAGES', 2), lines(1))).toThrow(UnitMismatchError);
    expect(() => remaining(preset('HALF'), lines(3))).toThrow(UnitMismatchError);
  });

  it('rejects malformed quantities', () => {
    expect(() => quantity('PARA', 1, 0)).toThrow(InvalidQuantityError);
    expect(() => quantity('PARA', -1, 4)).toThrow(InvalidQuantityError);
    expect(() => quantity('BOGUS' as QuantityUnit, 1)).toThrow(InvalidQuantityError);
    expect(isQuantity({ unit: 'LINES', numerator: 0.5, denominator: 1 })).toBe(false);
    expect(isQuantity(null)).toBe(false);
    expect(isQuantity({ unit: 'PARA', numerator: '1', denominator: 4 })).toBe(false);
    expect(fractionText(lines(7))).toBe('7');
  });
});

describe('Decision review 2026-10-30 (SRS §17)', () => {
  it('F06-AC16 (US-027) extra work is a separate Extra portion; completed never exceeds assigned', () => {
    // 1/2 assigned, 3/4 recited: the original takes completed 1/2, an Extra portion takes 1/4.
    expect(validateQuantities('MANZIL', { assigned: preset('HALF'), completed: preset('HALF') })).toEqual([]);
    expect(validateQuantities('MANZIL', { assigned: preset('RUBU'), completed: preset('RUBU') })).toEqual([]);
    expect(codes(validateQuantities('MANZIL', { assigned: preset('HALF'), completed: preset('SALASAH') }))).toEqual(['completed:ABOVE_ASSIGNED']);
  });

  it('F06-AC17 (US-026) Lines, Ayat, and Pages are whole numbers only', () => {
    expect(parseWhole('2.5')).toBeNull();
    expect(parseWhole('2,5')).toBeNull();
    expect(parseWhole('-3')).toBeNull();
    expect(parseWhole('')).toBeNull();
    expect(parseWhole('1e1')).toBeNull();
    expect(parseWhole(' 12 ')).toBe(12);
    expect(parseWhole('0')).toBe(0);
    for (const unit of ['AYAT', 'PAGES'] as const) {
      expect(codes(validateQuantities('SABQI', { assigned: { unit, numerator: 5, denominator: 2 }, completed: null }))).toEqual(['assigned:NOT_WHOLE']);
    }
    expect(codes(validateQuantities('SABQI', { assigned: para(1, 3), completed: null }))).toEqual(['assigned:NOT_A_PRESET']);
    expect(codes(validateQuantities('SABQI', { assigned: para(5, 4), completed: null }))).toEqual(['assigned:NOT_A_PRESET']);
    expect(codes(validateQuantities('SABQI', { assigned: para(0, 1), completed: null }))).toEqual(['assigned:NOT_POSITIVE']);
  });
});

describe('Sabaq in lines, 2026-11-01 (SRS §17 DEC-B60…B64)', () => {
  it('F05-AC20 (US-020) Sabaq accepts only LINES; Sabqi and Manzil accept the four Para presets', () => {
    expect(rulesFor('SABAQ')).toMatchObject({ allowedUnits: ['LINES'], offersParaPresets: false, paraEntered: false });
    expect(rulesFor('SABQI').offersParaPresets).toBe(true);
    expect(rulesFor('MANZIL').offersParaPresets).toBe(true);
    for (const key of PARA_PRESET_KEYS) {
      expect(validateQuantities('SABQI', { assigned: preset(key), completed: null })).toEqual([]);
      const sabaq = validateQuantities('SABAQ', { totalLines: 10, assigned: preset(key), completed: null });
      expect(codes(sabaq)).toEqual(['assigned:UNIT_NOT_ALLOWED']); // FR-SAB-010: refused, never converted
    }
    expect(codes(validateQuantities('SABAQ', { totalLines: 10, assigned: whole('AYAT', 3), completed: null }))).toEqual(['assigned:UNIT_NOT_ALLOWED']);
  });

  it('F05-AC21 (US-020) a Sabaq range must stay in one Surah with start Ayat ≤ end Ayat, and Assigned Lines defaults to Total Lines', () => {
    expect(rulesFor('SABAQ')).toMatchObject({ requiresRange: true, singleSurah: true, hasTotalLines: true });
    expect(defaultAssignedLines(12)).toBe(12);
    expect(defaultAssignedLines(null)).toBeNull();
    // The range checks themselves are quran-ref validateAyahRange (range.test.ts).
    expect(codes(validateQuantities('SABAQ', { totalLines: null, assigned: lines(5), completed: null }))).toEqual(['totalLines:REQUIRED']);
    expect(codes(validateQuantities('SABAQ', { totalLines: 0, assigned: lines(5), completed: null }))).toEqual(['totalLines:NOT_POSITIVE']);
  });

  it('F05-AC22 (US-020) Sabaq remaining lines is assigned − completed, never negative; completed ≤ assigned ≤ total', () => {
    expect(validateQuantities('SABAQ', { totalLines: 12, assigned: lines(10), completed: lines(7) })).toEqual([]);
    expect(remaining(lines(10), lines(7))).toEqual(lines(3));
    expect(codes(validateQuantities('SABAQ', { totalLines: 12, assigned: lines(10), completed: lines(11) }))).toEqual(['completed:ABOVE_ASSIGNED']);
    expect(validateQuantities('SABAQ', { totalLines: 8, assigned: lines(10), completed: null })).toEqual([{ field: 'assigned', code: 'ABOVE_TOTAL', max: 8 }]);
    expect(codes(validateQuantities('SABAQ', { totalLines: 10.5, assigned: lines(10), completed: null }))).toEqual(['totalLines:NOT_WHOLE']);
    expect(codes(validateQuantities('SABAQ', { totalLines: 10, assigned: { unit: 'LINES', numerator: 15, denominator: 2 }, completed: null }))).toEqual(['assigned:NOT_WHOLE']);
    expect(codes(validateQuantities('SABAQ', { totalLines: 10, assigned: lines(0), completed: null }))).toEqual(['assigned:NOT_POSITIVE']);
    expect(remaining(lines(10), lines(0))).toEqual(lines(10));
  });

  it('completed in another unit than assigned on the same portion is refused (FR-QTY-004)', () => {
    expect(codes(validateQuantities('SABQI', { assigned: preset('HALF'), completed: lines(3) }))).toEqual(['completed:UNIT_MISMATCH']);
  });
});

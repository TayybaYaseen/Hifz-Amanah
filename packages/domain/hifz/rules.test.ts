// F05 · Daily Hifz entry — unit: portion validation, attendance gate, report date, progress properties
// (docs/specs/09-f05-daily-hifz-entry.md; SRS AC-QTY-06…08, AC-ATT-01…03, AC-ATT-05).
// Quran data here is the synthetic fixture only: every Surah has 20 Ayat; Surahs 1–3 are in Para 1 and Surah 16
// starts Para 5. None of it is Quran metadata.
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { compare, preset, quantity, whole, type Quantity, type QuantityUnit } from '../quantity/index.ts';
import { syntheticParas, syntheticSurahs } from '../quran-ref/synthetic-fixture.ts';
import { classOf } from '../sync/fields.ts';
import {
  DAILY_RECORD_FIELDS,
  LESSON_PORTION_FIELDS,
  MISTAKES_MAX,
  NO_QUALITY_STATUSES,
  PORTION_ISSUE_CODES,
  PORTION_STATUSES,
  PORTION_ATTEMPT_FIELDS,
  REMARKS_MAX,
  assignedOf,
  attemptHistory,
  deriveSabaqPara,
  isFailure,
  isFutureDate,
  isFutureReportDate,
  isPortionStatus,
  isQualityScore,
  isRecitation,
  latestAttempt,
  mistakeCount,
  nextAttemptNo,
  normalizeAttempt,
  normalizeSessionLabel,
  portionProgress,
  portionsAllowed,
  sectionSummary,
  sessionLabelKey,
  totalLinesSource,
  validateAttemptFields,
  validateEntry,
  validatePortion,
  validatePortionFields,
  type AttemptDraft,
  type AttemptLike,
  type PortionDraft,
  type RangeReference,
} from './index.ts';

const lines = (n: number) => whole('LINES', n);
const ref: RangeReference = { surahs: syntheticSurahs(), paras: syntheticParas() };
const sabaq = (over: Partial<PortionDraft> = {}): PortionDraft => ({
  section: 'SABAQ',
  position: 1,
  paraNumber: null,
  range: { surahStart: 2, ayahStart: 1, surahEnd: 2, ayahEnd: 10 },
  totalLines: 12,
  assigned: lines(10),
  ...over,
});
const done = (over: Partial<AttemptDraft> = {}): AttemptDraft => ({ status: 'PARTIAL', completed: lines(7), quality: 2, noMistakes: true, mistakes: [], remarks: null, ...over });
const codes = (errors: { field: string; code: string }[]) => errors.map((e) => `${e.field}:${e.code}`);

describe('F05 · Sabaq portions', () => {
  it('F05-AC10 (US-020) a valid Sabaq portion has a single-Surah range, lines only, and a derived Para', () => {
    expect(validatePortion(sabaq(), done(), ref)).toEqual([]);
    expect(deriveSabaqPara({ surahStart: 2, ayahStart: 1 }, ref)).toBe(1);
    expect(deriveSabaqPara({ surahStart: 16, ayahStart: 3 }, ref)).toBe(5);
    // A client-sent Sabaq Para is ignored by validation: the server derives it (FR-SAB-001).
    expect(validatePortionFields(sabaq({ paraNumber: 99 }), ref)).toEqual([]);
  });

  it('F05-AC20 (US-020) a Sabaq portion in a Para unit is refused on the unit, never converted (AC-QTY-07)', () => {
    for (const key of ['RUBU', 'HALF', 'SALASAH', 'COMPLETE'] as const) {
      expect(codes(validatePortionFields(sabaq({ assigned: preset(key) }), ref))).toEqual(['unit:UNIT_NOT_ALLOWED']);
      const sabqiOk: PortionDraft = { section: 'SABQI', position: 1, paraNumber: 3, range: null, totalLines: null, assigned: preset(key) };
      expect(validatePortionFields(sabqiOk, ref)).toEqual([]);
    }
    expect(codes(validatePortionFields(sabaq({ assigned: whole('AYAT', 3) }), ref))).toEqual(['unit:UNIT_NOT_ALLOWED']);
    // Sabaq has no unit control: an amount without a unit is lines.
    expect(assignedOf('SABAQ', { unit: null, numerator: 4 }).quantity).toEqual(lines(4));
  });

  it('F05-AC21 (US-020) a Sabaq range crossing two Surahs or ending before it starts is refused (AC-QTY-08)', () => {
    expect(codes(validatePortionFields(sabaq({ range: { surahStart: 2, ayahStart: 18, surahEnd: 3, ayahEnd: 2 } }), ref))).toEqual(['range:CROSSES_SURAH']);
    expect(codes(validatePortionFields(sabaq({ range: { surahStart: 2, ayahStart: 10, surahEnd: 2, ayahEnd: 1 } }), ref))).toEqual(['range:END_BEFORE_START']);
    // Ayat beyond the Surah's count names the maximum.
    expect(validatePortionFields(sabaq({ range: { surahStart: 2, ayahStart: 1, surahEnd: 2, ayahEnd: 21 } }), ref)).toEqual([
      { section: 'SABAQ', portionNumber: 1, field: 'ayahEnd', code: 'OUT_OF_RANGE', max: 20 },
    ]);
    expect(codes(validatePortionFields(sabaq({ range: null }), ref))).toEqual(['surah:REQUIRED', 'ayahStart:REQUIRED', 'ayahEnd:REQUIRED']);
    expect(codes(validatePortionFields(sabaq({ range: { surahStart: 999, ayahStart: 1, surahEnd: 999, ayahEnd: 2 } }), ref))).toEqual(['surah:UNKNOWN']);
    // Without reference data only the structure is checked; the server re-checks on sync.
    expect(codes(validatePortionFields(sabaq({ range: { surahStart: 2, ayahStart: 10, surahEnd: 2, ayahEnd: 1 } })))).toEqual(['range:END_BEFORE_START']);
    expect(validatePortionFields(sabaq({ range: { surahStart: 2, ayahStart: 1, surahEnd: 2, ayahEnd: 21 } }))).toEqual([]);
    expect(codes(validatePortionFields(sabaq({ range: { surahStart: 0, ayahStart: 1.5, surahEnd: 0, ayahEnd: null } })))).toEqual([
      'surah:OUT_OF_RANGE',
      'ayahStart:NOT_WHOLE',
      'ayahEnd:REQUIRED',
    ]);
    // A Surah removed by licence withdrawal is left to the server, not shown as unknown.
    const withdrawn: RangeReference = { surahs: syntheticSurahs().filter((s) => s.number !== 2), paras: syntheticParas(), metadataWithdrawn: true };
    expect(validatePortionFields(sabaq(), withdrawn)).toEqual([]);
    // No Para boundary covers the range: nothing is guessed.
    expect(codes(validatePortionFields(sabaq(), { surahs: ref.surahs, paras: [] }))).toEqual(['range:PARA_UNKNOWN']);
  });

  it('F05-AC22 (US-020) Sabaq completed above assigned, assigned above total, and fractional lines are refused', () => {
    expect(codes(validatePortion(sabaq(), done({ completed: lines(11) }), ref))).toEqual(['completed:ABOVE_ASSIGNED']);
    expect(validatePortionFields(sabaq({ totalLines: 8 }), ref)).toEqual([{ section: 'SABAQ', portionNumber: 1, field: 'assigned', code: 'ABOVE_TOTAL', max: 8 }]);
    expect(codes(validatePortionFields(sabaq({ assigned: { unit: 'LINES', numerator: 15, denominator: 2 } }), ref))).toEqual(['assigned:NOT_WHOLE']);
    expect(codes(validatePortion(sabaq(), done({ completed: { unit: 'LINES', numerator: 13, denominator: 2 } }), ref))).toEqual(['completed:NOT_WHOLE']);
    expect(codes(validatePortionFields(sabaq({ totalLines: null }), ref))).toEqual(['totalLines:REQUIRED']);
    expect(codes(validatePortionFields(sabaq({ totalLines: 0 }), ref))).toEqual(['totalLines:NOT_POSITIVE']);
    expect(portionProgress({ assigned: lines(10) }, [{ attemptNo: 1, status: 'PARTIAL', completed: lines(7), quality: null }]).remaining).toEqual(lines(3));
  });

  it('Total Lines records whether it came from the layout or was entered by hand (FR-SAB-008)', () => {
    expect(totalLinesSource(12, 12)).toBe('LAYOUT');
    expect(totalLinesSource(13, 12)).toBe('MANUAL');
    expect(totalLinesSource(12, null)).toBe('MANUAL');
  });
});

describe('F05 · Sabqi and Manzil portions', () => {
  const sabqi = (over: Partial<PortionDraft> = {}): PortionDraft => ({ section: 'SABQI', position: 2, paraNumber: 4, range: null, totalLines: null, assigned: preset('HALF'), ...over });

  it('requires a Para 1–30 and an assigned quantity with a unit', () => {
    expect(validatePortionFields(sabqi(), ref)).toEqual([]);
    expect(codes(validatePortionFields(sabqi({ paraNumber: null }), ref))).toEqual(['paraNumber:REQUIRED']);
    expect(validatePortionFields(sabqi({ paraNumber: 31 }), ref)).toEqual([{ section: 'SABQI', portionNumber: 2, field: 'paraNumber', code: 'OUT_OF_RANGE', min: 1, max: 30 }]);
    expect(codes(validatePortionFields(sabqi({ assigned: null }), ref))).toEqual(['unit:REQUIRED', 'assigned:REQUIRED']);
    expect(codes(validatePortionFields(sabqi({ assigned: { unit: 'PAGES', numerator: null } }), ref))).toEqual(['assigned:REQUIRED']);
    expect(codes(validatePortionFields(sabqi({ assigned: quantity('PARA', 1, 3) }), ref))).toEqual(['assigned:NOT_A_PRESET']);
    expect(codes(validatePortionFields(sabqi({ totalLines: 10 }), ref))).toEqual(['totalLines:NOT_ALLOWED']);
    expect(codes(validatePortionFields(sabqi({ position: 0 }), ref))).toEqual(['position:OUT_OF_RANGE']);
    for (const unit of ['LINES', 'AYAT', 'PAGES'] as const) expect(validatePortionFields(sabqi({ assigned: whole(unit, 3) }), ref)).toEqual([]);
  });

  it('accepts an optional range that may span Surahs, complete and in order', () => {
    expect(validatePortionFields(sabqi({ range: { surahStart: 2, ayahStart: 15, surahEnd: 3, ayahEnd: 5 } }), ref)).toEqual([]);
    expect(validatePortionFields(sabqi({ range: { surahStart: null, ayahStart: null, surahEnd: null, ayahEnd: null } }), ref)).toEqual([]);
    expect(codes(validatePortionFields(sabqi({ range: { surahStart: 3, ayahStart: 1, surahEnd: 2, ayahEnd: 5 } }), ref))).toEqual(['range:END_BEFORE_START']);
    expect(codes(validatePortionFields(sabqi({ range: { surahStart: 3, ayahStart: 1, surahEnd: 2, ayahEnd: 5 } })))).toEqual(['range:END_BEFORE_START']);
    expect(codes(validatePortionFields(sabqi({ range: { surahStart: 2, ayahStart: null, surahEnd: 2, ayahEnd: 5 } }), ref))).toEqual(['ayahStart:REQUIRED']);
    expect(codes(validatePortionFields(sabqi({ range: { surahStart: 2, ayahStart: 1, surahEnd: 2, ayahEnd: 25 } }), ref))).toEqual(['ayahEnd:OUT_OF_RANGE']);
  });

  it('refuses completed in another unit, above assigned, or not a quarter (FR-QTY-004, FR-QTY-006)', () => {
    expect(codes(validateAttemptFields(sabqi(), done({ completed: lines(3) })))).toEqual(['completed:UNIT_MISMATCH']);
    expect(codes(validateAttemptFields(sabqi(), done({ completed: preset('SALASAH') })))).toEqual(['completed:ABOVE_ASSIGNED']);
    expect(codes(validateAttemptFields(sabqi(), done({ completed: quantity('PARA', 1, 3) })))).toEqual(['completed:NOT_A_PRESET']);
    expect(validateAttemptFields(sabqi(), done({ completed: preset('RUBU') }))).toEqual([]);
  });

  it('validates every portion of a record with its own section and number', () => {
    const errors = validateEntry(
      [
        { portion: sabaq(), attempt: done() },
        { portion: sabqi({ position: 1 }), attempt: done({ completed: preset('RUBU') }) },
        { portion: sabqi({ position: 2, assigned: { unit: null, numerator: 1, denominator: 4 } }), attempt: done({ completed: null }) },
        { portion: { section: 'MANZIL', position: 3, paraNumber: null, range: null, totalLines: null, assigned: preset('COMPLETE') }, attempt: null },
      ],
      ref,
    );
    expect(errors.map((e) => `${e.section}·${e.portionNumber}:${e.field}:${e.code}`)).toEqual([
      'SABQI·2:unit:REQUIRED',
      'MANZIL·3:paraNumber:REQUIRED',
      'MANZIL·3:status:REQUIRED',
    ]);
  });
});

describe('F05 · attempt fields', () => {
  const p = sabaq();

  it('quality is an integer 1–5, and only on a recitation (FR-ATT-008)', () => {
    for (const q of [1, 2, 3, 4, 5]) expect(isQualityScore(q)).toBe(true);
    for (const q of [0, 6, 2.5, -1, Number.NaN, '3', null]) expect(isQualityScore(q)).toBe(false);
    expect(validateAttemptFields(p, done({ quality: 0 }))).toEqual([{ section: 'SABAQ', portionNumber: 1, field: 'quality', code: 'OUT_OF_RANGE', min: 1, max: 5 }]);
    expect(codes(validateAttemptFields(p, done({ quality: 2.5 })))).toEqual(['quality:OUT_OF_RANGE']);
    expect(codes(validateAttemptFields(p, done({ status: 'PENDING', completed: null, quality: 1 })))).toEqual(['quality:QUALITY_NOT_ALLOWED']);
    expect(validateAttemptFields(p, done({ quality: null }))).toEqual([]);
  });

  it('"No mistakes" and a mistake list exclude each other; a missing list is not zero (FR-ATT-011)', () => {
    const m = { category: 'TAJWEED', severity: 'MINOR', repeated: true } as const;
    expect(codes(validateAttemptFields(p, done({ noMistakes: true, mistakes: [m] })))).toEqual(['mistakes:NO_MISTAKES_CONFLICT']);
    expect(mistakeCount({ noMistakes: true, mistakes: [] })).toBe(0);
    expect(mistakeCount({ noMistakes: false, mistakes: [] })).toBeNull();
    expect(mistakeCount({ noMistakes: false, mistakes: [m, m] })).toBe(2);
    expect(codes(validateAttemptFields(p, done({ noMistakes: false, mistakes: Array.from({ length: MISTAKES_MAX + 1 }, () => m) })))).toEqual(['mistakes:TOO_MANY']);
  });

  it('remarks are bounded', () => {
    expect(validateAttemptFields(p, done({ remarks: 'x'.repeat(REMARKS_MAX) }))).toEqual([]);
    expect(codes(validateAttemptFields(p, done({ remarks: 'x'.repeat(REMARKS_MAX + 1) })))).toEqual(['remarks:TOO_LONG']);
  });

  it('COMPLETED without a completed amount stores the assigned amount (plan §7.2)', () => {
    expect(normalizeAttempt({ status: 'COMPLETED', assigned: preset('HALF'), completed: null, quality: 1 })).toEqual({
      status: 'COMPLETED',
      completed: preset('HALF'),
      quality: 1,
      issues: [],
      completedDefaulted: true,
    });
    // PARTIAL with nothing entered stays unknown (FR-QTY-008).
    expect(normalizeAttempt({ status: 'PARTIAL', assigned: preset('HALF'), completed: null, quality: null }).completed).toBeNull();
    // A malformed assigned amount gets no default; validation reports it instead.
    expect(normalizeAttempt({ status: 'COMPLETED', assigned: { unit: 'LINES', numerator: 3, denominator: 2 }, completed: null, quality: null }).completed).toBeNull();
  });
});

describe('F05 · status lists (AC-ATT-01…03)', () => {
  it('only NOT_REMEMBERED is a failed recitation; ABSENT, NOT_ASSIGNED, PENDING carry no quality', () => {
    expect(PORTION_STATUSES).toEqual(['COMPLETED', 'PARTIAL', 'NOT_REMEMBERED', 'ABSENT', 'NOT_ASSIGNED', 'PENDING']);
    expect(NO_QUALITY_STATUSES).toEqual(['ABSENT', 'NOT_ASSIGNED', 'PENDING']);
    expect(PORTION_STATUSES.filter(isFailure)).toEqual(['NOT_REMEMBERED']);
    expect(PORTION_STATUSES.filter(isRecitation)).toEqual(['COMPLETED', 'PARTIAL', 'NOT_REMEMBERED']);
    expect(isPortionStatus('ABSENT')).toBe(true);
    expect(isPortionStatus('FAILED')).toBe(false);
  });

  it('every issue code the portion rules emit is a declared code', () => {
    const emitted = [
      ...validatePortionFields(sabaq({ range: null, totalLines: 0 }), ref),
      ...validatePortionFields({ section: 'MANZIL', position: 0, paraNumber: 40, range: null, totalLines: 3, assigned: null }, ref),
      ...validateAttemptFields(sabaq(), done({ quality: 9, remarks: 'x'.repeat(600) })),
    ];
    for (const e of emitted) expect(PORTION_ISSUE_CODES).toContain(e.code);
  });
});

describe('F05 · attendance gate', () => {
  it('F05-AC18 (US-018) portions are refused for Absent or Leave, with "Change to Late" offered', () => {
    expect(portionsAllowed('ABSENT')).toBe('CHANGE_TO_LATE');
    expect(portionsAllowed('LEAVE')).toBe('CHANGE_TO_LATE');
    for (const s of ['PRESENT', 'LATE', 'HALF_DAY'] as const) expect(portionsAllowed(s)).toBe('ALLOWED');
    expect(portionsAllowed(null)).toBe('ATTENDANCE_REQUIRED');
  });
});

describe('F05 · report date', () => {
  it('F05-AC17 (US-018) a record for tomorrow in the madrasa timezone is refused; earlier dates are accepted', () => {
    expect(isFutureDate('2026-11-11', '2026-11-10')).toBe(true);
    expect(isFutureDate('2026-11-10', '2026-11-10')).toBe(false);
    expect(isFutureDate('2025-01-01', '2026-11-10')).toBe(false);
    expect(() => isFutureDate('2026-02-30', '2026-11-10')).toThrow(RangeError);
    // 20:30 UTC on 10 Nov is already 11 Nov in Asia/Karachi (UTC+5).
    const now = new Date('2026-11-10T20:30:00Z');
    expect(isFutureReportDate('2026-11-11', now, 'Asia/Karachi')).toBe(false);
    expect(isFutureReportDate('2026-11-12', now, 'Asia/Karachi')).toBe(true);
    expect(isFutureReportDate('2026-11-11', now, 'UTC')).toBe(true);
  });

  it('session labels are trimmed and compared case-insensitively', () => {
    expect(normalizeSessionLabel('  Fajr ')).toBe('Fajr');
    expect(normalizeSessionLabel('')).toBeNull();
    expect(normalizeSessionLabel(undefined)).toBeNull();
    expect(sessionLabelKey(' FAJR')).toBe(sessionLabelKey('fajr '));
  });
});

describe('F05 · attempts and progress', () => {
  const a = (attemptNo: number, status: AttemptLike['status'], completed: Quantity | null): AttemptLike => ({ attemptNo, status, completed, quality: null });

  it('latest attempt, next number, and history order', () => {
    const list = [a(2, 'PARTIAL', lines(5)), a(3, 'COMPLETED', lines(10)), a(1, 'NOT_REMEMBERED', lines(0))];
    expect(latestAttempt(list)?.attemptNo).toBe(3);
    expect(latestAttempt([])).toBeNull();
    expect(nextAttemptNo(list)).toBe(4);
    expect(nextAttemptNo([])).toBe(1);
    expect(attemptHistory(list).map((x) => x.attemptNo)).toEqual([1, 2, 3]);
    expect(list.map((x) => x.attemptNo)).toEqual([2, 3, 1]); // input unchanged
  });

  it('a portion with no attempt has unknown status and progress, never zero', () => {
    expect(portionProgress({ assigned: lines(10) }, [])).toEqual({ currentStatus: null, assigned: lines(10), completed: null, remaining: null, quality: null, attemptCount: 0, currentAttemptNo: null });
    // A completed amount in another unit is never compared: remaining is unknown.
    expect(portionProgress({ assigned: preset('HALF') }, [a(1, 'PARTIAL', lines(3))]).remaining).toBeNull();
  });

  it('the summary excludes removed portions, keeps Extra portions apart, and never sums across units', () => {
    const base = { section: 'SABQI' as const, paraNumber: 4, removed: false, isExtra: false };
    const summary = sectionSummary([
      { portion: { ...base, id: 'x2', position: 2, assigned: lines(5) }, attempts: [a(1, 'PARTIAL', lines(2))] },
      { portion: { ...base, id: 'x1', position: 1, assigned: preset('HALF') }, attempts: [a(1, 'COMPLETED', preset('HALF'))] },
      { portion: { ...base, id: 'x3', position: 3, assigned: preset('RUBU'), isExtra: true }, attempts: [a(1, 'COMPLETED', preset('RUBU'))] },
      { portion: { ...base, id: 'x4', position: 4, assigned: preset('COMPLETE'), removed: true }, attempts: [a(1, 'PARTIAL', preset('HALF'))] },
      { portion: { ...base, id: 'x5', position: 5, assigned: whole('PAGES', 2) }, attempts: [] },
    ]);
    expect(summary.map((s) => s.section)).toEqual(['SABAQ', 'SABQI', 'MANZIL']);
    const s = summary[1]!;
    expect(s.portions.map((r) => [r.id, r.isExtra])).toEqual([
      ['x1', false],
      ['x2', false],
      ['x3', true],
      ['x5', false],
    ]);
    expect(s.totals.assigned).toEqual([preset('HALF'), lines(5), whole('PAGES', 2)]);
    expect(s.totals.completed).toEqual([preset('HALF'), lines(2)]);
    expect(s.totals.remaining).toEqual([quantity('PARA', 0), lines(3)]);
    expect(s.totals.notRecorded).toBe(1);
    expect(s.extraTotals.assigned).toEqual([preset('RUBU')]);
    expect(summary[0]!.portions).toEqual([]);
  });

  const unitArb = fc.constantFrom<QuantityUnit>('PARA', 'LINES', 'AYAT', 'PAGES');
  const amount = (unit: QuantityUnit, max: number) => (unit === 'PARA' ? fc.integer({ min: 0, max: 4 }).map((n) => quantity('PARA', n, 4)) : fc.integer({ min: 0, max }).map((n) => quantity(unit, n)));
  const statusArb = fc.constantFrom(...PORTION_STATUSES);

  it('property: remaining is never negative, in the assigned unit, and assigned is counted once', () => {
    fc.assert(
      fc.property(
        unitArb.chain((u) => fc.tuple(fc.constant(u), amount(u, 500), fc.array(fc.tuple(statusArb, fc.option(amount(u, 500), { nil: null })), { maxLength: 6 }))),
        ([unit, assigned, raw]) => {
          const attempts = raw.map(([status, completed], i) => a(i + 1, status, completed));
          const p = portionProgress({ assigned }, attempts);
          expect(p.assigned).toBe(assigned);
          expect(p.attemptCount).toBe(attempts.length);
          if (p.remaining) {
            expect(p.remaining.unit).toBe(unit);
            expect(p.remaining.numerator).toBeGreaterThanOrEqual(0);
            expect(compare(p.remaining, assigned)).toBeLessThanOrEqual(0);
          }
          const [, sabqiSection] = sectionSummary([{ portion: { id: 'p', section: 'SABQI', position: 1, isExtra: false, paraNumber: 1, assigned, removed: false }, attempts }]);
          expect(sabqiSection!.totals.assigned).toEqual([assigned]);
        },
      ),
    );
  });

  it('property: normalizeAttempt never invents quality and never zeroes a missing amount except NOT_REMEMBERED (AC-ATT-01…03)', () => {
    fc.assert(
      fc.property(statusArb, fc.option(fc.integer({ min: 1, max: 5 }), { nil: null }), (status, quality) => {
        const n = normalizeAttempt({ status, assigned: lines(8), completed: null, quality });
        expect(n.quality).toBe(quality);
        if (status === 'NOT_REMEMBERED') expect(n.completed).toEqual(lines(0));
        else if (status === 'COMPLETED') expect(n.completed).toEqual(lines(8));
        else expect(n.completed).toBeNull();
        if (quality !== null) expect(n.issues.length > 0).toBe((NO_QUALITY_STATUSES as readonly string[]).includes(status));
      }),
    );
  });
});

describe('F05 · sync field classes', () => {
  it('attempt outcome fields conflict as one group; remarks stay separate; nothing is safe-merged', () => {
    expect(PORTION_ATTEMPT_FIELDS.groups).toEqual([['status', 'completed', 'quality', 'noMistakes', 'mistakes']]);
    expect(LESSON_PORTION_FIELDS.groups).toEqual([['paraNumber', 'range', 'totalLines', 'totalLinesSource', 'assigned']]);
    for (const spec of [DAILY_RECORD_FIELDS, LESSON_PORTION_FIELDS, PORTION_ATTEMPT_FIELDS]) {
      expect(spec.safe).toEqual({});
      expect(classOf(spec, 'remarks')).toEqual({ kind: 'MEANINGFUL' });
    }
  });
});

// The Quantity type is shared with F06; this guards that no float can reach a stored LINES amount.
it('F05 unit: LINES amounts are whole numbers (FR-QTY-009)', () => {
  const half: Quantity = { unit: 'LINES', numerator: 1, denominator: 2 };
  expect(codes(validatePortionFields(sabaq({ assigned: half }), ref))).toEqual(['assigned:NOT_WHOLE']);
});

// F03 · Classes and students — unit: enrollment date ranges (docs/specs/06-f03-classes-students.md)
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  addDays,
  applyPlan,
  calendarDateIn,
  classOn,
  eligibleForEntry,
  enrollmentHistory,
  inReportPeriod,
  isCalendarDate,
  pickerClasses,
  planEnrollment,
  type Enrollment,
} from './index.ts';

const A = 'class-a';
const B = 'class-b';
const C = 'class-c';
const inA: Enrollment = { id: 'e1', classId: A, startDate: '2026-09-01', endDate: null };

function move(history: Enrollment[], classId: string, startDate: string, newId: string): Enrollment[] {
  const result = planEnrollment(history, { classId, startDate });
  if (!result.ok) throw new Error(result.reason);
  return applyPlan(history, result.plan, newId);
}

describe('F03 · enrollment moves', () => {
  it('F03-AC11 (US-012) moving from Class A to Class B on a date ends Class A the day before and starts Class B on that date', () => {
    const result = planEnrollment([inA], { classId: B, startDate: '2026-11-10' });
    expect(result).toEqual({ ok: true, plan: { end: { id: 'e1', endDate: '2026-11-09' }, start: { classId: B, startDate: '2026-11-10' } } });

    expect(move([inA], B, '2026-11-10', 'e2')).toEqual([
      { id: 'e1', classId: A, startDate: '2026-09-01', endDate: '2026-11-09' },
      { id: 'e2', classId: B, startDate: '2026-11-10', endDate: null },
    ]);
    // Month and year boundaries.
    expect(planEnrollment([inA], { classId: B, startDate: '2027-01-01' })).toMatchObject({ plan: { end: { endDate: '2026-12-31' } } });
    expect(planEnrollment([{ ...inA, startDate: '2028-01-01' }], { classId: B, startDate: '2028-03-01' })).toMatchObject({
      plan: { end: { endDate: '2028-02-29' } },
    });
  });

  it('F03-AC12 (US-012) for a date before the move, the applicable class is Class A', () => {
    const history = move([inA], B, '2026-11-10', 'e2');
    expect(classOn(history, '2026-11-09')).toBe(A);
    expect(classOn(history, '2026-09-01')).toBe(A);
    expect(classOn(history, '2026-11-10')).toBe(B);
    expect(classOn(history, '2030-01-01')).toBe(B);
    expect(classOn(history, '2026-08-31')).toBeNull();
  });

  it('F03-AC13 (US-012) enrollment history lists every enrollment with start and end dates in order', () => {
    const history = move(move([inA], B, '2026-11-10', 'e2'), C, '2027-02-01', 'e3');
    expect(enrollmentHistory([...history].reverse()).map((e) => [e.classId, e.startDate, e.endDate])).toEqual([
      [A, '2026-09-01', '2026-11-09'],
      [B, '2026-11-10', '2027-01-31'],
      [C, '2027-02-01', null],
    ]);
  });

  it('F03-AC18 (US-012) enrolling a student who has an active class is a move; only one enrollment stays open', () => {
    const history = move([inA], B, '2026-12-01', 'e2');
    expect(history.filter((e) => e.endDate === null).map((e) => e.classId)).toEqual([B]);
  });

  it('F03 edge case: a future start date is allowed and the student appears in the new class from that date', () => {
    const history = move([inA], B, '2030-06-01', 'e2');
    expect(classOn(history, '2030-05-31')).toBe(A);
    expect(classOn(history, '2030-06-01')).toBe(B);
  });

  it('F03 unit: refuses a move to the same class, a move not after the current start, and an overlap with history', () => {
    expect(planEnrollment([inA], { classId: A, startDate: '2026-12-01' })).toEqual({ ok: false, reason: 'SAME_CLASS' });
    expect(planEnrollment([inA], { classId: B, startDate: '2026-09-01' })).toEqual({ ok: false, reason: 'BEFORE_CURRENT_START' });
    expect(planEnrollment([inA], { classId: B, startDate: '2026-08-01' })).toEqual({ ok: false, reason: 'BEFORE_CURRENT_START' });
    const ended: Enrollment = { ...inA, endDate: '2026-10-31' };
    expect(planEnrollment([ended], { classId: B, startDate: '2026-10-31' })).toEqual({ ok: false, reason: 'OVERLAPS_HISTORY' });
    expect(planEnrollment([ended], { classId: A, startDate: '2026-11-01' })).toEqual({
      ok: true,
      plan: { end: null, start: { classId: A, startDate: '2026-11-01' } },
    });
    expect(planEnrollment([], { classId: A, startDate: '2026-11-01' })).toMatchObject({ ok: true, plan: { end: null } });
  });

  it('F03 property: any sequence of accepted moves keeps one open enrollment and never two classes on one date', () => {
    const day = fc.integer({ min: 0, max: 2000 }).map((n) => addDays('2025-01-01', n));
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.constantFrom(A, B, C), day), { maxLength: 15 }), (requests) => {
        let history: Enrollment[] = [];
        requests.forEach(([classId, startDate], i) => {
          const r = planEnrollment(history, { classId, startDate });
          if (r.ok) history = applyPlan(history, r.plan, `e${i}`);
        });
        if (history.length) expect(history.filter((e) => e.endDate === null)).toHaveLength(1);
        const sorted = enrollmentHistory(history);
        for (let i = 1; i < sorted.length; i++) {
          expect(sorted[i - 1]!.endDate).not.toBeNull();
          expect(sorted[i - 1]!.endDate! < sorted[i]!.startDate).toBe(true);
          expect(sorted[i - 1]!.endDate! >= sorted[i - 1]!.startDate).toBe(true);
        }
      }),
    );
  });
});

describe('F03 · active status', () => {
  const classes = [
    { id: A, status: 'ACTIVE' as const },
    { id: B, status: 'INACTIVE' as const },
  ];

  it('F03-AC4 (US-010) a deactivated class is excluded from entry pickers but kept for past reports', () => {
    expect(pickerClasses(classes).map((c) => c.id)).toEqual([A]);
    const history: Enrollment[] = [{ id: 'e1', classId: B, startDate: '2026-09-01', endDate: null }];
    expect(eligibleForEntry({ status: 'ACTIVE', enrollments: history }, classes[1]!, '2026-11-02')).toBe(false);
    expect(inReportPeriod(history, { from: '2026-10-01', to: '2026-10-31' }, B)).toBe(true);
  });

  it('F03-AC9 (US-011) a deactivated student is excluded from entry pickers but kept in reports for earlier periods', () => {
    const history: Enrollment[] = [inA];
    expect(eligibleForEntry({ status: 'INACTIVE', enrollments: history }, classes[0]!, '2026-11-02')).toBe(false);
    expect(inReportPeriod(history, { from: '2026-10-01', to: '2026-10-31' })).toBe(true);
    expect(inReportPeriod(history, { from: '2026-10-01', to: '2026-10-31' }, A)).toBe(true);
    // Not in a report for a period before the student joined.
    expect(inReportPeriod(history, { from: '2026-08-01', to: '2026-08-31' })).toBe(false);
  });

  it('F03-AC10 (US-011) a reactivated student is eligible for entry pickers again', () => {
    const student = { status: 'INACTIVE' as const, enrollments: [inA] };
    expect(eligibleForEntry(student, classes[0]!, '2026-11-02')).toBe(false);
    expect(eligibleForEntry({ ...student, status: 'ACTIVE' }, classes[0]!, '2026-11-02')).toBe(true);
    // Only for the class the student is enrolled in on that date.
    expect(eligibleForEntry({ ...student, status: 'ACTIVE' }, { id: C, status: 'ACTIVE' }, '2026-11-02')).toBe(false);
    expect(eligibleForEntry({ ...student, status: 'ACTIVE' }, classes[0]!, '2026-08-31')).toBe(false);
  });
});

describe('F03 · calendar dates', () => {
  it('F03 unit: validates and moves calendar dates without timezone drift', () => {
    expect(isCalendarDate('2026-02-28')).toBe(true);
    expect(isCalendarDate('2026-02-29')).toBe(false);
    expect(isCalendarDate('2026-2-1')).toBe(false);
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(() => addDays('nope', 1)).toThrow(RangeError);
  });

  it('F03 unit: "today" is the calendar date in the madrasa timezone', () => {
    // 20:30 UTC on 1 Nov is already 2 Nov in Karachi (UTC+5).
    const instant = new Date('2026-11-01T20:30:00Z');
    expect(calendarDateIn(instant, 'Asia/Karachi')).toBe('2026-11-02');
    expect(calendarDateIn(instant, 'UTC')).toBe('2026-11-01');
  });
});

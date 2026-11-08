// F04 · Calendar and attendance — unit (docs/specs/08-f04-calendar-attendance.md)
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { calendarDateIn } from '../roster/dates.ts';
import {
  ATTENDANCE_FIELDS,
  allowsHifz,
  attendanceLabel,
  bulkSummary,
  changed,
  classDays,
  countDays,
  dayCategory,
  dayInfo,
  decideLeave,
  leaveStatusAfter,
  markAllPresent,
  markUnmarkedAbsent,
  normalizeMark,
  normalizeWeekdays,
  suggestsLate,
  unmarkedStudents,
  validTimeRange,
  validateMark,
  weekOf,
  weekdayOf,
  type AttendanceState,
  type BulkRow,
  type CalendarException,
  type Mark,
  type MarkContext,
  type ScheduleVersion,
} from './index.ts';

const A1 = 'class-a1';
const A2 = 'class-a2';
const MON_SAT: ScheduleVersion = { classId: A1, effectiveFrom: '2026-01-01', weekdays: [1, 2, 3, 4, 5, 6] };
// The week of Monday 2026-11-02 … Sunday 2026-11-08.
const WEEK = { from: '2026-11-02', to: '2026-11-08' };

const mark = (status: Mark['status'], extra: Partial<Mark> = {}): Mark => ({ status, leaveReason: null, absentNote: null, ...extra });
const ctx = (over: Partial<MarkContext> = {}): MarkContext => ({
  reportDate: '2026-11-04',
  today: '2026-11-08',
  dayKind: 'SCHEDULED',
  enrolled: true,
  recited: false,
  ...over,
});
const holiday = (date: string, classId: string | null = null, kind: CalendarException['kind'] = 'HOLIDAY'): CalendarException => ({
  id: `${kind}-${date}-${classId ?? 'all'}`,
  classId,
  date,
  kind,
  label: 'Test day',
});

describe('F04 · scheduled days', () => {
  it('F04-AC1 (US-013) a Monday–Saturday schedule makes Sunday a no-class day', () => {
    const days = classDays(A1, weekOf('2026-11-05', 'MONDAY'), [MON_SAT], []);
    expect(days.map((d) => d.date)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']);
    expect(days.slice(0, 6).every((d) => d.kind === 'SCHEDULED')).toBe(true);
    expect(days[6]).toMatchObject({ date: '2026-11-08', kind: 'UNSCHEDULED' });
    // The Sunday is never an absence, even with no record.
    expect(dayCategory({ dayKind: days[6]!.kind, enrolled: true, date: '2026-11-08', today: '2026-11-08', record: null })).toBe('UNSCHEDULED');
    expect(countDays(['UNSCHEDULED']).absent).toBe(0);
  });

  it('F04-AC2 (US-013) days before a schedule change use the old schedule; days from its effective date use the new one', () => {
    // Mon–Sat, changed to Mon–Thu from Wednesday 2026-11-04.
    const monThu: ScheduleVersion = { classId: A1, effectiveFrom: '2026-11-04', weekdays: [1, 2, 3, 4] };
    const kinds = classDays(A1, WEEK, [MON_SAT, monThu], []).map((d) => [d.date, d.kind]);
    expect(kinds).toEqual([
      ['2026-11-02', 'SCHEDULED'],
      ['2026-11-03', 'SCHEDULED'],
      ['2026-11-04', 'SCHEDULED'],
      ['2026-11-05', 'SCHEDULED'],
      ['2026-11-06', 'UNSCHEDULED'],
      ['2026-11-07', 'UNSCHEDULED'],
      ['2026-11-08', 'UNSCHEDULED'],
    ]);
    // The following Friday too; the earlier Friday is unchanged by the new version.
    expect(dayInfo(A1, '2026-11-13', [MON_SAT, monThu], []).kind).toBe('UNSCHEDULED');
    expect(dayInfo(A1, '2026-10-30', [MON_SAT, monThu], []).kind).toBe('SCHEDULED');
  });

  it('F04-AC3 (US-014) a madrasa-wide holiday is a holiday, never an absence', () => {
    const info = dayInfo(A1, '2026-11-04', [MON_SAT], [holiday('2026-11-04')]);
    expect(info.kind).toBe('HOLIDAY');
    expect(info.exception?.label).toBe('Test day');
    // Every class of the madrasa.
    expect(dayInfo(A2, '2026-11-04', [{ ...MON_SAT, classId: A2 }], [holiday('2026-11-04')]).kind).toBe('HOLIDAY');
    const category = dayCategory({ dayKind: info.kind, enrolled: true, date: info.date, today: '2026-11-08', record: null });
    expect(category).toBe('HOLIDAY');
    expect(countDays([category])).toMatchObject({ holidays: 1, absent: 0, scheduled: 0 });
  });

  it('F04-AC4 (US-014) a no-class exception applies only to that class', () => {
    const versions = [MON_SAT, { ...MON_SAT, classId: A2 }];
    const exceptions = [holiday('2026-11-04', A1, 'NO_CLASS')];
    expect(dayInfo(A1, '2026-11-04', versions, exceptions).kind).toBe('NO_CLASS');
    expect(dayInfo(A2, '2026-11-04', versions, exceptions).kind).toBe('SCHEDULED');
    // A madrasa-wide holiday wins over a class's own exception on the same date.
    expect(dayInfo(A1, '2026-11-04', versions, [...exceptions, holiday('2026-11-04')]).kind).toBe('HOLIDAY');
  });

  it('F04 unit: dates outside a student enrollment are not scheduled for that student', () => {
    // Enrolled from Wednesday: Monday and Tuesday do not count, and are not absences.
    const categories = classDays(A1, WEEK, [MON_SAT], []).map((d) =>
      dayCategory({ dayKind: d.kind, enrolled: d.date >= '2026-11-04', date: d.date, today: '2026-11-08', record: null }),
    );
    expect(categories.slice(0, 2)).toEqual(['NOT_ENROLLED', 'NOT_ENROLLED']);
    expect(countDays(categories)).toMatchObject({ scheduled: 4, notMarked: 4, absent: 0 });
  });

  it('F04 unit: scheduled days are computed in the organization timezone (default Asia/Karachi)', () => {
    // 2026-11-01T20:30Z is already Monday 01:30 in Karachi (UTC+5) while it is still Sunday in UTC.
    const instant = new Date('2026-11-01T20:30:00Z');
    const karachi = calendarDateIn(instant, 'Asia/Karachi');
    expect(karachi).toBe('2026-11-02');
    expect(dayInfo(A1, karachi, [MON_SAT], []).kind).toBe('SCHEDULED');
    expect(dayInfo(A1, calendarDateIn(instant, 'UTC'), [MON_SAT], []).kind).toBe('UNSCHEDULED');
    // Week boundary (AC-ATT-04 / AC-RPT-08): the Karachi Sunday 2026-11-08 ends the week; Monday starts the next.
    expect(weekOf('2026-11-08')).toEqual({ from: '2026-11-02', to: '2026-11-08' });
    expect(weekOf('2026-11-09')).toEqual({ from: '2026-11-09', to: '2026-11-15' });
    // An org-configured week start.
    expect(weekOf('2026-11-08', 'SATURDAY')).toEqual({ from: '2026-11-07', to: '2026-11-13' });
  });

  it('F04 unit: weekdays, normalization, and time ranges', () => {
    expect(weekdayOf('2026-11-02')).toBe(1);
    expect(weekdayOf('2026-11-08')).toBe(7);
    expect(normalizeWeekdays([6, 1, 1, 3])).toEqual([1, 3, 6]);
    expect(() => normalizeWeekdays([0])).toThrow(RangeError);
    expect(validTimeRange(null, null)).toBe(true);
    expect(validTimeRange('08:00', '12:30')).toBe(true);
    expect(validTimeRange('12:30', '08:00')).toBe(false);
    expect(validTimeRange('08:00', null)).toBe(false);
    expect(validTimeRange('24:00', '25:00')).toBe(false);
  });

  it('F04 unit: holidays, unscheduled, and no-class days are never absences (property)', () => {
    const kind = fc.constantFrom('HOLIDAY', 'CLOSURE', 'NO_CLASS', 'UNSCHEDULED' as const);
    const status = fc.constantFrom('PRESENT', 'LATE', 'HALF_DAY', 'LEAVE', 'ABSENT' as const);
    fc.assert(
      fc.property(kind, fc.option(status), fc.boolean(), (dayKind, s, enrolled) => {
        const record = s ? { status: s, leaveStatus: s === 'LEAVE' ? ('REJECTED' as const) : ('NONE' as const) } : null;
        const counts = countDays([dayCategory({ dayKind, enrolled, date: '2026-11-04', today: '2026-11-08', record })]);
        return counts.absent === 0 && counts.scheduled === 0;
      }),
    );
  });
});

describe('F04 · attendance categories', () => {
  it('F04-AC8 (US-015) unmarked students produce no record until the Teacher confirms Mark them Absent', () => {
    const rows: BulkRow[] = [
      { studentId: 'S1', saved: null, draft: mark('PRESENT') },
      { studentId: 'S2', saved: null, draft: null },
    ];
    expect(unmarkedStudents(rows)).toEqual(['S2']);
    // "Go back": nothing changes, S2 has no mark.
    expect(rows[1]!.draft).toBeNull();
    // A scheduled day with no record is "not marked", never absent.
    const counts = countDays([dayCategory({ dayKind: 'SCHEDULED', enrolled: true, date: '2026-11-04', today: '2026-11-08', record: null })]);
    expect(counts).toMatchObject({ notMarked: 1, absent: 0 });
    // "Mark them Absent": explicit Absent for exactly the listed students.
    const after = markUnmarkedAbsent(rows, ['S2']);
    expect(after[1]!.draft).toEqual(mark('ABSENT'));
    expect(after[0]!.draft).toEqual(mark('PRESENT'));
    expect(unmarkedStudents(after)).toEqual([]);
  });

  it('F04-AC11 (US-015) an Absent mark never yields a portion attempt, failure, or quality value', () => {
    const normalized = normalizeMark(mark('ABSENT'));
    // A mark carries attendance fields only.
    expect(Object.keys(normalized).sort()).toEqual(['absentNote', 'leaveReason', 'status']);
    expect(allowsHifz('ABSENT')).toBe(false);
    expect(allowsHifz('LEAVE')).toBe(false);
    for (const s of ['PRESENT', 'LATE', 'HALF_DAY'] as const) expect(allowsHifz(s)).toBe(true);
    // The sync field set of an attendance record has no performance field.
    expect(ATTENDANCE_FIELDS.groups.flat().sort()).toEqual(['absentNote', 'leaveReason', 'status']);
  });

  it('F04 unit: counting follows FR-CAL-005', () => {
    const counts = countDays(['PRESENT', 'LATE', 'HALF_DAY', 'LEAVE', 'LEAVE_AWAITING', 'ABSENT', 'LEAVE_REJECTED', 'NOT_MARKED', 'HOLIDAY', 'NO_CLASS', 'CLOSURE', 'FUTURE']);
    expect(counts).toEqual({
      scheduled: 8,
      attended: 3,
      present: 1,
      late: 1,
      halfDay: 1,
      leave: 1,
      leaveAwaiting: 1,
      absent: 2,
      notMarked: 1,
      holidays: 1,
      closures: 1,
      noClass: 1,
      unscheduled: 0,
    });
  });

  it('F04 unit: Mark all Present never overwrites (F04-AC7)', () => {
    const rows: BulkRow[] = [
      { studentId: 'S1', saved: null, draft: null },
      { studentId: 'S2', saved: mark('ABSENT'), draft: null },
      { studentId: 'S3', saved: null, draft: mark('LEAVE', { leaveReason: 'Family wedding' }) },
    ];
    const after = markAllPresent(rows);
    expect(after[0]!.draft).toEqual(mark('PRESENT'));
    expect(after[1]).toEqual(rows[1]);
    expect(after[2]).toEqual(rows[2]);
    expect(changed(after[1]!)).toBe(false);
    expect(changed(after[0]!)).toBe(true);
  });

  it('F04 unit: the result summary counts saved and needs-correction rows (F04-AC9)', () => {
    expect(bulkSummary(['SAVED', 'SAVED', 'NEEDS_CORRECTION'], 1)).toEqual({ saved: 2, needsCorrection: 1, notMarked: 1 });
  });

  it('F04 unit: validation refuses future dates, non-working days, and students outside the class', () => {
    expect(validateMark(mark('PRESENT'), ctx())).toEqual([]);
    expect(validateMark(mark('PRESENT'), ctx({ reportDate: '2026-11-09' }))).toEqual([{ field: 'reportDate', code: 'FUTURE' }]);
    expect(validateMark(mark('PRESENT'), ctx({ dayKind: 'HOLIDAY' }))).toEqual([{ field: 'reportDate', code: 'HOLIDAY' }]);
    expect(validateMark(mark('PRESENT'), ctx({ dayKind: 'UNSCHEDULED' }))).toEqual([{ field: 'reportDate', code: 'UNSCHEDULED' }]);
    expect(validateMark(mark('PRESENT'), ctx({ enrolled: false }))).toEqual([{ field: 'studentId', code: 'NOT_ENROLLED' }]);
  });

  it('F04 unit: text belongs to its status only', () => {
    expect(normalizeMark(mark('PRESENT', { leaveReason: 'x', absentNote: 'y' }))).toEqual(mark('PRESENT'));
    expect(normalizeMark(mark('LEAVE', { leaveReason: '  Sick  ', absentNote: 'y' }))).toEqual(mark('LEAVE', { leaveReason: 'Sick' }));
    expect(normalizeMark(mark('ABSENT', { absentNote: '   ' }))).toEqual(mark('ABSENT'));
  });
});

describe('F04 · Leave approval state machine', () => {
  it('F04-AC13 (US-016) a Teacher-marked LEAVE with a reason is awaiting approval', () => {
    const m = normalizeMark(mark('LEAVE', { leaveReason: 'Family travel' }));
    expect(validateMark(m, ctx())).toEqual([]);
    const leaveStatus = leaveStatusAfter(m, 'TEACHER', null);
    expect(leaveStatus).toBe('REQUESTED');
    expect(attendanceLabel({ status: 'LEAVE', leaveStatus })).toBe('LEAVE_AWAITING');
    // Turning an earlier Absent into Leave asks for approval too.
    expect(leaveStatusAfter(m, 'TEACHER', { ...mark('ABSENT'), leaveStatus: 'NONE' })).toBe('REQUESTED');
  });

  it('F04-AC14 (US-016) Leave without a reason is rejected', () => {
    for (const reason of [null, '', '   ']) {
      expect(validateMark(normalizeMark(mark('LEAVE', { leaveReason: reason })), ctx())).toEqual([{ field: 'leaveReason', code: 'REQUIRED' }]);
    }
    expect(validateMark(mark('LEAVE', { leaveReason: 'x'.repeat(501) }), ctx())).toEqual([{ field: 'leaveReason', code: 'TOO_LONG' }]);
  });

  it('F04-AC15 (US-017) Admin approval makes it an approved LEAVE', () => {
    const awaiting: AttendanceState = { ...mark('LEAVE', { leaveReason: 'Sick' }), leaveStatus: 'REQUESTED' };
    for (const role of ['ADMIN', 'OWNER'] as const) expect(decideLeave(awaiting, role, 'APPROVE')).toEqual({ ok: true, leaveStatus: 'APPROVED' });
    expect(countDays([attendanceLabel({ status: 'LEAVE', leaveStatus: 'APPROVED' })])).toMatchObject({ leave: 1, absent: 0, attended: 0 });
  });

  it('F04-AC16 (US-017) Admin rejection makes it a normal absence with status rejected', () => {
    const awaiting: AttendanceState = { ...mark('LEAVE', { leaveReason: 'Sick' }), leaveStatus: 'REQUESTED' };
    expect(decideLeave(awaiting, 'ADMIN', 'REJECT')).toEqual({ ok: true, leaveStatus: 'REJECTED' });
    const label = attendanceLabel({ status: 'LEAVE', leaveStatus: 'REJECTED' });
    expect(label).toBe('LEAVE_REJECTED');
    expect(countDays([label])).toMatchObject({ absent: 1, leave: 0 });
    // A decided Leave cannot be decided again.
    expect(decideLeave({ ...awaiting, leaveStatus: 'REJECTED' }, 'ADMIN', 'APPROVE')).toEqual({ ok: false, code: 'NOT_AWAITING' });
    expect(decideLeave({ ...mark('ABSENT'), leaveStatus: 'NONE' }, 'ADMIN', 'APPROVE')).toEqual({ ok: false, code: 'NOT_AWAITING' });
  });

  it('F04-AC17 (US-017) a Teacher cannot approve or reject a Leave', () => {
    const awaiting: AttendanceState = { ...mark('LEAVE', { leaveReason: 'Sick' }), leaveStatus: 'REQUESTED' };
    for (const role of ['TEACHER', 'STUDENT', 'PARENT'] as const) {
      for (const d of ['APPROVE', 'REJECT'] as const) expect(decideLeave(awaiting, role, d)).toEqual({ ok: false, code: 'FORBIDDEN' });
    }
  });

  it('F04 unit: Leave by an Owner or Admin is approved at once (F04-AC22)', () => {
    const m = mark('LEAVE', { leaveReason: 'Sick' });
    expect(leaveStatusAfter(m, 'ADMIN', null)).toBe('APPROVED');
    expect(leaveStatusAfter(m, 'OWNER', null)).toBe('APPROVED');
    // A decided Leave keeps its decision when its reason is unchanged; a new reason asks again.
    const decided: AttendanceState = { ...m, leaveStatus: 'APPROVED' };
    expect(leaveStatusAfter(m, 'TEACHER', decided)).toBe('APPROVED');
    expect(leaveStatusAfter({ ...m, leaveReason: 'Travel' }, 'TEACHER', decided)).toBe('REQUESTED');
    expect(leaveStatusAfter(mark('PRESENT'), 'TEACHER', decided)).toBe('NONE');
  });
});

describe('Decision review 2026-10-30 (SRS §17)', () => {
  it('F04-AC18 (US-015) Absent can become Late and Present can become Half day, audited', () => {
    // The record change is allowed; the audit is written by the API in the same transaction (integration tests).
    const toLate = normalizeMark(mark('LATE'));
    expect(validateMark(toLate, ctx())).toEqual([]);
    expect(leaveStatusAfter(toLate, 'TEACHER', { ...mark('ABSENT'), leaveStatus: 'NONE' })).toBe('NONE');
    expect(allowsHifz('LATE')).toBe(true);
    expect(validateMark(normalizeMark(mark('HALF_DAY')), ctx())).toEqual([]);
    expect(allowsHifz('HALF_DAY')).toBe(true);
    expect(changed({ studentId: 'S1', saved: mark('ABSENT'), draft: toLate })).toBe(true);
  });

  it('F04-AC19 (US-015) Absent for a student who recited suggests Late and needs a note', () => {
    expect(suggestsLate('ABSENT', true)).toBe(true);
    expect(suggestsLate('ABSENT', false)).toBe(false);
    expect(suggestsLate('PRESENT', true)).toBe(false);
    expect(validateMark(mark('ABSENT'), ctx({ recited: true }))).toEqual([{ field: 'absentNote', code: 'REQUIRED' }]);
    expect(validateMark(mark('ABSENT', { absentNote: 'Left before Sabaq check' }), ctx({ recited: true }))).toEqual([]);
    expect(validateMark(mark('ABSENT'), ctx({ recited: false }))).toEqual([]);
  });

  it('F04-AC20 (US-014) a holiday declared on a recorded date excludes its records and refuses new ones', () => {
    const exceptions = [holiday('2026-11-04')];
    const info = dayInfo(A1, '2026-11-04', [MON_SAT], exceptions);
    // The saved record is kept (the caller never deletes it) but the day counts as a holiday.
    const category = dayCategory({ dayKind: info.kind, enrolled: true, date: info.date, today: '2026-11-08', record: { status: 'ABSENT', leaveStatus: 'NONE' } });
    expect(category).toBe('HOLIDAY');
    expect(countDays([category])).toMatchObject({ absent: 0, scheduled: 0, holidays: 1 });
    // New entries for the date are refused.
    expect(validateMark(mark('PRESENT'), ctx({ dayKind: info.kind }))).toEqual([{ field: 'reportDate', code: 'HOLIDAY' }]);
  });
});

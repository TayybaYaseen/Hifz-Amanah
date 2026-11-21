// F09 · Weekly and monthly reports — unit: buildReport() (docs/specs/12-f09-weekly-monthly-reports.md)
// Synthetic data only. 2026-11-02 is a Monday; the class meets Monday–Saturday; Sunday is not scheduled.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { CalendarException, ScheduleVersion } from '../calendar/schedule.ts';
import { mistakeCounts } from '../mistakes/index.ts';
import type { Quantity } from '../quantity/quantity.ts';
import { buildReport, provisionalOf, type ReportAttempt, type ReportHomework, type ReportInput, type ReportPortion, type ReportRecord } from './build-report.ts';
import { classSummary, classSummaryExportRows } from './class-summary.ts';
import { reportPeriod, shiftPeriod } from './period.ts';

// ---------- Builders ----------

const lines = (n: number): Quantity => ({ unit: 'LINES', numerator: n, denominator: 1 });
const para = (numerator: number, denominator = 1): Quantity => ({ unit: 'PARA', numerator, denominator });

const SCHEDULE: ScheduleVersion = { classId: 'c1', effectiveFrom: '2026-01-01', weekdays: [1, 2, 3, 4, 5, 6] };
const WEEK = reportPeriod('WEEK', '2026-11-04');
const MONTH = reportPeriod('MONTH', '2026-11-04');

let n = 0;
const id = (prefix: string) => `${prefix}${++n}`;

const attempt = (o: Partial<ReportAttempt> = {}): ReportAttempt => ({
  id: id('a'),
  attemptNo: 1,
  attemptedAt: '2026-11-02T06:00:00.000Z',
  status: 'COMPLETED',
  completed: null,
  quality: null,
  noMistakes: false,
  mistakes: [],
  remarks: null,
  ...o,
});

const portion = (o: Partial<ReportPortion> = {}): ReportPortion => ({
  id: id('p'),
  section: 'SABQI',
  position: 1,
  isExtra: false,
  paraNumber: 1,
  range: null,
  assigned: para(1),
  totalLines: null,
  removed: false,
  attempts: [],
  ...o,
});

const record = (date: string, portions: ReportPortion[], o: Partial<ReportRecord> = {}): ReportRecord => ({
  id: id('r'),
  date,
  classId: 'c1',
  sessionLabel: null,
  overallLabel: null,
  portions,
  ...o,
});

const present = (date: string, status: ReportInput['attendance'][number]['status'] = 'PRESENT', leaveStatus: ReportInput['attendance'][number]['leaveStatus'] = 'NONE') => ({ date, classId: 'c1', status, leaveStatus });

const input = (o: Partial<ReportInput> = {}): ReportInput => ({
  period: WEEK,
  today: '2026-11-20',
  student: { id: 's1', name: 'Student One' },
  enrollments: [{ id: 'e1', classId: 'c1', startDate: '2026-01-01', endDate: null }],
  scope: null,
  schedules: [SCHEDULE],
  exceptions: [],
  attendance: [],
  records: [],
  homework: [],
  ...o,
});

const homework = (o: Partial<ReportHomework> = {}): ReportHomework => ({
  id: id('h'),
  classId: 'c1',
  status: 'CONFIRMED',
  state: 'UPCOMING',
  assignedDate: '2026-11-03',
  dueDate: '2026-11-04',
  carriedOverReason: null,
  portions: [],
  ...o,
});

const hwPortion = (o: Partial<ReportHomework['portions'][number]> = {}): ReportHomework['portions'][number] => ({
  id: id('hp'),
  section: 'SABQI',
  paraNumber: 1,
  assigned: para(1, 2),
  carriedForward: true,
  sourceLessonPortionId: null,
  removed: false,
  progress: { attempted: false, status: null },
  ...o,
});

const section = (r: ReturnType<typeof buildReport>, s: 'SABAQ' | 'SABQI' | 'MANZIL') => r.sections.find((x) => x.section === s)!;

// ---------- Tests ----------

describe('F09 · period boundaries', () => {
  it('F09-AC1 (US-039) a weekly report covers Monday 00:00 to Sunday 23:59 Asia/Karachi and states the range (AC-RPT-07)', () => {
    // Opened for the Sunday: the week is the Monday before to that Sunday.
    const p = reportPeriod('WEEK', '2026-11-08');
    expect(p).toMatchObject({ kind: 'WEEK', from: '2026-11-02', to: '2026-11-08', timeZone: 'Asia/Karachi', weekStart: 'MONDAY' });
    // Asia/Karachi is UTC+5: Monday 00:00 is Sunday 19:00 UTC; Sunday 23:59 is 18:59 UTC.
    expect(p.startsAt).toBe('2026-11-01T19:00:00.000Z');
    expect(p.endsAt).toBe('2026-11-08T18:59:00.000Z');
    // A Sunday record is in this week; the next Monday's is not.
    const sunday = record('2026-11-08', [portion({ attempts: [attempt()] })]);
    const nextMonday = record('2026-11-09', [portion({ attempts: [attempt()] })]);
    const r = buildReport(input({ period: p, schedules: [{ classId: 'c1', effectiveFrom: '2026-01-01', weekdays: [1, 2, 3, 4, 5, 6, 7] }], records: [sunday, nextMonday] }));
    expect(r.days.map((d) => d.recordId)).toEqual([sunday.id]);
    expect(r.period.from).toBe('2026-11-02');
    expect(r.period.to).toBe('2026-11-08');
  });

  it('F09 unit: the week start follows the organization setting', () => {
    expect(reportPeriod('WEEK', '2026-11-04', { weekStart: 'SATURDAY' })).toMatchObject({ from: '2026-10-31', to: '2026-11-06', weekStart: 'SATURDAY' });
    expect(reportPeriod('WEEK', '2026-11-04', { weekStart: 'SUNDAY' })).toMatchObject({ from: '2026-11-01', to: '2026-11-07' });
    expect(shiftPeriod(WEEK, 1)).toMatchObject({ from: '2026-11-09', to: '2026-11-15' });
    expect(shiftPeriod(WEEK, -1)).toMatchObject({ from: '2026-10-26', to: '2026-11-01' });
  });

  it('F09 unit: monthly boundaries are calendar months in the organization timezone', () => {
    expect(reportPeriod('MONTH', '2026-02-14')).toMatchObject({ from: '2026-02-01', to: '2026-02-28' });
    expect(reportPeriod('MONTH', '2028-02-29')).toMatchObject({ from: '2028-02-01', to: '2028-02-29' });
    expect(reportPeriod('MONTH', '2026-12-31')).toMatchObject({ from: '2026-12-01', to: '2026-12-31' });
    const nov = reportPeriod('MONTH', '2026-11-30');
    expect(nov.startsAt).toBe('2026-10-31T19:00:00.000Z');
    expect(nov.endsAt).toBe('2026-11-30T18:59:00.000Z');
    expect(shiftPeriod(nov, 1)).toMatchObject({ from: '2026-12-01', to: '2026-12-31' });
    // Another timezone keeps the same calendar dates and states its own instants.
    expect(reportPeriod('MONTH', '2026-11-30', { timeZone: 'UTC' }).startsAt).toBe('2026-11-01T00:00:00.000Z');
  });
});

describe('F09 · totals', () => {
  it('F09-AC2 (US-039) every total equals a direct calculation from source records (AC-RPT-01)', () => {
    const day = fc.constantFrom('2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07');
    const linePortion = fc
      .record({ assigned: fc.integer({ min: 1, max: 30 }), done: fc.integer({ min: 0, max: 30 }), status: fc.constantFrom('COMPLETED', 'PARTIAL', 'NOT_REMEMBERED'), quality: fc.option(fc.integer({ min: 1, max: 5 })) })
      .map((x) => ({ ...x, done: Math.min(x.done, x.assigned) }));
    fc.assert(
      fc.property(fc.array(fc.record({ date: day, portions: fc.array(linePortion, { minLength: 1, maxLength: 3 }) }), { minLength: 1, maxLength: 6 }), (days) => {
        const records = days.map((d) =>
          record(
            d.date,
            d.portions.map((p, i) => portion({ section: 'SABQI', position: i + 1, assigned: lines(p.assigned), attempts: [attempt({ status: p.status as ReportAttempt['status'], completed: lines(p.done), quality: p.quality })] })),
          ),
        );
        const r = buildReport(input({ records }));
        const all = days.flatMap((d) => d.portions);
        const s = section(r, 'SABQI');
        // Direct calculation from the same source rows.
        expect(s.totals.assigned).toEqual([lines(all.reduce((a, p) => a + p.assigned, 0))]);
        const done = all.reduce((a, p) => a + p.done, 0);
        expect(s.totals.completed).toEqual([{ unit: 'LINES', numerator: done, denominator: 1 }]);
        expect(s.totals.remaining).toEqual([{ unit: 'LINES', numerator: all.reduce((a, p) => a + (p.assigned - p.done), 0), denominator: 1 }]);
        expect(s.portionCount).toBe(all.length);
        for (const status of ['COMPLETED', 'PARTIAL', 'NOT_REMEMBERED'] as const) expect(s.statusCounts[status]).toBe(all.filter((p) => p.status === status).length);
        const rated = all.flatMap((p) => (p.quality === null ? [] : [p.quality]));
        expect(r.quality.count).toBe(rated.length);
        expect(r.quality.sum).toBe(rated.reduce((a, q) => a + q, 0));
        expect(r.days).toHaveLength(records.length);
      }),
      { numRuns: 60 },
    );
  });

  it('F09-AC4 (US-039) quantities are grouped by unit and never combined (AC-RPT-04)', () => {
    const r = buildReport(
      input({
        records: [
          record('2026-11-02', [
            portion({ section: 'SABQI', assigned: lines(10), attempts: [attempt({ completed: lines(10) })] }),
            portion({ section: 'SABQI', position: 2, assigned: para(1, 2), attempts: [attempt({ status: 'PARTIAL', completed: para(1, 4) })] }),
          ]),
          record('2026-11-03', [portion({ section: 'SABQI', assigned: lines(5), attempts: [attempt({ status: 'PARTIAL', completed: lines(3) })] })]),
        ],
      }),
    );
    const s = section(r, 'SABQI');
    expect(s.totals.assigned).toEqual([para(1, 2), lines(15)]);
    expect(s.totals.completed).toEqual([para(1, 4), lines(13)]);
    expect(s.totals.remaining).toEqual([para(1, 4), lines(2)]);
  });

  it('F09-AC5 (US-039) assigned quantity is counted once; status comes from the latest attempt (AC-RPT-05)', () => {
    const p = portion({
      section: 'MANZIL',
      paraNumber: 3,
      assigned: para(1),
      attempts: [attempt({ attemptNo: 2, status: 'COMPLETED', completed: para(1) }), attempt({ attemptNo: 1, status: 'PARTIAL', completed: para(1, 2) })],
    });
    const r = buildReport(input({ records: [record('2026-11-04', [p])] }));
    const s = section(r, 'MANZIL');
    expect(s.totals.assigned).toEqual([para(1)]);
    expect(s.totals.completed).toEqual([para(1)]);
    expect(s.statusCounts.COMPLETED).toBe(1);
    expect(s.statusCounts.PARTIAL).toBe(0);
    const line = r.days[0]!.portions[0]!;
    expect(line.status).toBe('COMPLETED');
    expect(line.attempts.map((a) => a.status)).toEqual(['PARTIAL', 'COMPLETED']);
  });

  it('F09-AC7 (US-039) scores 1, 3 and two missing → 2.0 · Good (2 ratings) (AC-RPT-03)', () => {
    const r = buildReport(
      input({
        records: [
          record('2026-11-02', [portion({ attempts: [attempt({ quality: 1 })] }), portion({ position: 2, attempts: [attempt({ quality: null })] })]),
          record('2026-11-03', [portion({ attempts: [attempt({ quality: 3 })] }), portion({ position: 2, attempts: [attempt({ quality: null })] })]),
        ],
      }),
    );
    expect(r.quality).toMatchObject({ count: 2, value: 2, display: '2.0', nearestScore: 2 });
    // The missing ratings are not counted as zero: a zero would give 1.0 over 4.
    expect(r.quality.sum).toBe(4);
    expect(r.qualityTrend.map((p) => p.value)).toEqual([1, 3]);
  });

  it('F09-AC8 (US-040) Sabaq, Sabqi, and Manzil are aggregated separately with Para-wise progress and pending portions', () => {
    const sabaq = portion({ section: 'SABAQ', paraNumber: 1, range: { surahStart: 2, ayahStart: 1, surahEnd: 2, ayahEnd: 10 }, totalLines: 10, assigned: lines(10), attempts: [attempt({ status: 'PARTIAL', completed: lines(6) })] });
    const sabqi = portion({ section: 'SABQI', paraNumber: 5, assigned: para(1, 2), attempts: [attempt({ status: 'PARTIAL', completed: para(1, 4) })] });
    const sabqi2 = portion({ section: 'SABQI', position: 2, paraNumber: 5, assigned: para(1, 4), attempts: [attempt({ completed: para(1, 4) })] });
    const manzil = portion({ section: 'MANZIL', paraNumber: 10, assigned: para(1), attempts: [attempt({ completed: para(1) })] });
    const r = buildReport(input({ period: MONTH, records: [record('2026-11-02', [sabaq, sabqi, manzil]), record('2026-11-16', [sabqi2])] }));
    expect(r.sections.map((s) => s.section)).toEqual(['SABAQ', 'SABQI', 'MANZIL']);
    expect(section(r, 'SABAQ').totals.assigned).toEqual([lines(10)]);
    expect(section(r, 'SABQI').totals.assigned).toEqual([para(3, 4)]);
    expect(section(r, 'MANZIL').totals.completed).toEqual([para(1)]);
    // Para-wise: Sabqi Para 5 over both days; Sabaq under its derived Para.
    expect(section(r, 'SABQI').paras).toEqual([expect.objectContaining({ paraNumber: 5, portionCount: 2, totals: expect.objectContaining({ assigned: [para(3, 4)], completed: [para(1, 2)] }) })]);
    expect(section(r, 'SABAQ').paras[0]).toMatchObject({ paraNumber: 1 });
    // Pending: the two partial portions, each with its remaining in its own unit.
    expect(section(r, 'SABAQ').pending).toEqual([expect.objectContaining({ portionId: sabaq.id, remaining: lines(4), status: 'PARTIAL' })]);
    expect(section(r, 'SABQI').pending).toEqual([expect.objectContaining({ portionId: sabqi.id, remaining: para(1, 4) })]);
    expect(section(r, 'MANZIL').pending).toEqual([]);
  });

  it('F09-AC14 (US-043) three Manzil portions on one day appear as three lines with their own status and quantity', () => {
    const r = buildReport(
      input({
        records: [
          record('2026-11-05', [
            portion({ section: 'MANZIL', position: 1, paraNumber: 1, assigned: para(1), attempts: [attempt({ status: 'COMPLETED', completed: para(1) })] }),
            portion({ section: 'MANZIL', position: 2, paraNumber: 5, assigned: para(1), attempts: [attempt({ status: 'PARTIAL', completed: para(1, 2) })] }),
            portion({ section: 'MANZIL', position: 3, paraNumber: 10, assigned: para(1), attempts: [attempt({ status: 'NOT_REMEMBERED', completed: para(0) })] }),
          ]),
        ],
      }),
    );
    expect(r.days).toHaveLength(1);
    expect(r.days[0]!.portions.map((l) => [l.paraNumber, l.status, l.completed])).toEqual([
      [1, 'COMPLETED', para(1)],
      [5, 'PARTIAL', para(1, 2)],
      [10, 'NOT_REMEMBERED', para(0)],
    ]);
  });

  it('F09 unit: removed portions leave every total; Extra work is kept apart', () => {
    const r = buildReport(
      input({
        records: [
          record('2026-11-02', [
            portion({ assigned: para(1), attempts: [attempt({ completed: para(1) })] }),
            portion({ position: 2, removed: true, assigned: para(1), attempts: [attempt({ completed: para(1) })] }),
            portion({ position: 3, isExtra: true, assigned: para(1, 4), attempts: [attempt({ completed: para(1, 4) })] }),
          ]),
        ],
      }),
    );
    const s = section(r, 'SABQI');
    expect(s.totals.assigned).toEqual([para(1)]);
    expect(s.extraTotals.completed).toEqual([para(1, 4)]);
    expect(r.days[0]!.portions).toHaveLength(2);
  });
});

describe('F09 · homework measures', () => {
  it('F09-AC6 (US-039) confirmed homework and draft suggestions are separate counts (AC-RPT-06)', () => {
    const r = buildReport(
      input({
        homework: [
          homework({ status: 'CONFIRMED' }),
          homework({ status: 'DRAFT', state: 'DRAFT' }),
          homework({ status: 'DRAFT', state: 'DRAFT', assignedDate: '2026-11-05' }),
          // Rejected and superseded homework counts nowhere (F08-AC9); a draft outside the week is not this week's.
          homework({ status: 'REJECTED', state: 'REJECTED' }),
          homework({ status: 'SUPERSEDED', state: 'SUPERSEDED' }),
          homework({ status: 'DRAFT', state: 'DRAFT', assignedDate: '2026-10-20' }),
        ],
      }),
    );
    expect(r.homework.confirmed).toBe(1);
    expect(r.homework.drafts).toBe(2);
  });

  it('F09-AC9 (US-040) assigned, attempted, completed, and carried-forward homework are four separate measures', () => {
    const r = buildReport(
      input({
        period: MONTH,
        homework: [
          homework({
            state: 'ATTEMPTED',
            portions: [
              hwPortion({ progress: { attempted: true, status: 'COMPLETED' } }),
              hwPortion({ progress: { attempted: true, status: 'PARTIAL' } }),
              hwPortion({ carriedForward: false, progress: { attempted: false, status: null } }),
              hwPortion({ removed: true, progress: { attempted: true, status: 'COMPLETED' } }),
            ],
          }),
          homework({ assignedDate: '2026-11-10', state: 'CARRIED_OVER', carriedOverReason: 'ABSENT', portions: [hwPortion()] }),
          // A draft's portions are never homework given.
          homework({ status: 'DRAFT', state: 'DRAFT', portions: [hwPortion({ progress: { attempted: true, status: 'COMPLETED' } })] }),
        ],
      }),
    );
    expect(r.homework).toMatchObject({ assigned: 4, attempted: 2, completed: 1, carriedForward: 3, carriedOver: 1, confirmed: 2, drafts: 1 });
    // Outstanding: confirmed and not fully attempted (the carried-over one), never "failed".
    expect(r.homework.outstanding).toBe(1);
    expect(r.homework.outstandingItems[0]).toMatchObject({ state: 'CARRIED_OVER', carriedOverReason: 'ABSENT' });
  });
});

describe('F09 · recurring difficulty', () => {
  const marked = (date: string, paraNumber: number, mistakes: ReportAttempt['mistakes']) =>
    record(date, [portion({ section: 'SABQI', paraNumber, attempts: [attempt({ status: 'PARTIAL', completed: para(1, 2), mistakes })] })]);
  const major = { category: 'TAJWEED' as const, severity: 'MAJOR' as const, repeated: false, note: null, noteVisibility: 'INTERNAL' as const };
  const repeatedMinor = { category: 'LAFZI' as const, severity: 'MINOR' as const, repeated: true, note: null, noteVisibility: 'INTERNAL' as const };
  const minor = { category: 'HARKAAT' as const, severity: 'MINOR' as const, repeated: false, note: null, noteVisibility: 'INTERNAL' as const };

  it('F09-AC10 (US-040) a Para with Major or repeated mistakes in 3+ attempts is listed; 2 attempts is not', () => {
    const r = buildReport(
      input({
        period: MONTH,
        records: [
          marked('2026-11-02', 7, [major]),
          marked('2026-11-05', 7, [repeatedMinor, minor]),
          marked('2026-11-09', 7, [major, major]),
          marked('2026-11-10', 7, [minor]),
          marked('2026-11-03', 9, [major]),
          marked('2026-11-04', 9, [major]),
        ],
      }),
    );
    expect(r.recurringDifficulties).toHaveLength(1);
    const d = r.recurringDifficulties[0]!;
    expect(d).toMatchObject({ paraNumber: 7, majorOrRepeatedAttempts: 3, notRememberedAttempts: 0, attempts: 4, dates: ['2026-11-02', '2026-11-05', '2026-11-09'] });
    expect(d.byCategory).toMatchObject({ TAJWEED: 3, LAFZI: 1, HARKAAT: 2 });
  });

  it('F09 unit: Not Remembered 3 times makes a recurring difficulty (DEC-B34)', () => {
    const nr = (date: string) => record(date, [portion({ section: 'MANZIL', paraNumber: 12, attempts: [attempt({ status: 'NOT_REMEMBERED', completed: para(0) })] })]);
    expect(buildReport(input({ period: MONTH, records: [nr('2026-11-02'), nr('2026-11-03')] })).recurringDifficulties).toEqual([]);
    const r = buildReport(input({ period: MONTH, records: [nr('2026-11-02'), nr('2026-11-03'), nr('2026-11-04')] }));
    expect(r.recurringDifficulties).toEqual([expect.objectContaining({ paraNumber: 12, notRememberedAttempts: 3, sections: ['MANZIL'] })]);
  });
});

describe('F09 · attendance', () => {
  it('F09-AC11 (US-041) 2 absences and 4 recited days → absent days never appear as failed or zero performance', () => {
    const recited = ['2026-11-02', '2026-11-03', '2026-11-05', '2026-11-07'];
    const r = buildReport(
      input({
        attendance: [...recited.map((d) => present(d)), present('2026-11-04', 'ABSENT'), present('2026-11-06', 'ABSENT')],
        records: recited.map((d) => record(d, [portion({ attempts: [attempt({ completed: para(1), quality: 2 })] })])),
      }),
    );
    expect(r.attendance.counts.absent).toBe(2);
    expect(r.days.map((d) => d.date)).toEqual(recited);
    expect(r.days.flatMap((d) => d.portions).every((p) => p.status === 'COMPLETED')).toBe(true);
    // The absent days add no rating: the average is over the four recitations only.
    expect(r.quality).toMatchObject({ count: 4, value: 2 });
    expect(section(r, 'SABQI').statusCounts.ABSENT).toBe(0);
  });

  it('F09-AC12 (US-041) holidays and unscheduled days are listed as such, not as absences (AC-RPT-08)', () => {
    const holiday: CalendarException = { id: 'x1', classId: null, date: '2026-11-04', kind: 'HOLIDAY', label: 'Synthetic holiday' };
    const r = buildReport(input({ exceptions: [holiday], attendance: [present('2026-11-02'), present('2026-11-03')] }));
    const day = (d: string) => r.attendance.days.find((x) => x.date === d)!;
    expect(day('2026-11-04')).toMatchObject({ kind: 'HOLIDAY', category: 'HOLIDAY', exceptionLabel: 'Synthetic holiday' });
    expect(day('2026-11-08')).toMatchObject({ kind: 'UNSCHEDULED', category: 'UNSCHEDULED' });
    expect(r.attendance.counts).toMatchObject({ holidays: 1, unscheduled: 1, absent: 0, scheduled: 5, attended: 2, notMarked: 3 });
  });

  it('F09-AC13 (US-042) one approved Leave, one rejected, one plain absence → 1 Leave and 2 normal absences', () => {
    const r = buildReport(input({ attendance: [present('2026-11-02', 'LEAVE', 'APPROVED'), present('2026-11-03', 'LEAVE', 'REJECTED'), present('2026-11-04', 'ABSENT')] }));
    expect(r.attendance.counts).toMatchObject({ leave: 1, absent: 2, leaveAwaiting: 0 });
  });

  it('F09 unit: a student who joined mid-month counts scheduled days only from the enrollment date', () => {
    const r = buildReport(input({ period: MONTH, today: '2026-12-15', enrollments: [{ id: 'e1', classId: 'c1', startDate: '2026-11-16', endDate: null }], attendance: [present('2026-11-16')] }));
    // 16–30 November: 13 class days (Monday–Saturday); the days before are not counted at all.
    expect(r.attendance.counts.scheduled).toBe(13);
    // Days after today are not counted yet: on 20 November only 16–20 November (5 days) are.
    const midway = buildReport(input({ period: MONTH, today: '2026-11-20', enrollments: [{ id: 'e1', classId: 'c1', startDate: '2026-11-16', endDate: null }] }));
    expect(midway.attendance.counts.scheduled).toBe(5);
    expect(r.attendance.days.find((d) => d.date === '2026-11-10')).toMatchObject({ category: 'NOT_ENROLLED' });
    expect(r.classes).toEqual([{ classId: 'c1', from: '2026-11-16', to: '2026-11-30' }]);
  });

  it('F09 unit: a record on a date that later became a holiday is excluded from the report, not deleted (FR-CAL-009)', () => {
    const rec = record('2026-11-04', [portion({ attempts: [attempt({ completed: para(1), quality: 1 })] })]);
    const holiday: CalendarException = { id: 'x2', classId: 'c1', date: '2026-11-04', kind: 'HOLIDAY', label: 'Declared later' };
    const r = buildReport(input({ records: [rec], exceptions: [holiday] }));
    expect(r.days).toEqual([]);
    expect(r.quality.count).toBe(0);
    expect(r.excludedRecords).toEqual([{ recordId: rec.id, date: '2026-11-04', kind: 'HOLIDAY' }]);
  });

  it('F09 unit: a viewer scoped to one class sees only the days in that class (moved student)', () => {
    const enrollments = [
      { id: 'e1', classId: 'c1', startDate: '2026-01-01', endDate: '2026-11-04' },
      { id: 'e2', classId: 'c2', startDate: '2026-11-05', endDate: null },
    ];
    const schedules = [SCHEDULE, { ...SCHEDULE, classId: 'c2' }];
    const records = [record('2026-11-03', [portion({ attempts: [attempt()] })]), record('2026-11-06', [portion({ attempts: [attempt()] })], { classId: 'c2' })];
    const old = buildReport(input({ enrollments, schedules, records, scope: ['c1'] }));
    expect(old.classes).toEqual([{ classId: 'c1', from: '2026-11-02', to: '2026-11-04' }]);
    expect(old.days.map((d) => d.date)).toEqual(['2026-11-03']);
    const all = buildReport(input({ enrollments, schedules, records }));
    expect(all.classes.map((c) => c.classId)).toEqual(['c1', 'c2']);
    expect(all.days).toHaveLength(2);
  });

  it('F09 unit: no records in the period → hasData false ("No records for this period"), never a page of zeros', () => {
    const r = buildReport(input());
    expect(r.hasData).toBe(false);
    expect(r.quality).toMatchObject({ count: 0, value: null });
    expect(buildReport(input({ attendance: [present('2026-11-02')] })).hasData).toBe(true);
  });
});

describe('F09 · provisional', () => {
  it('F09-AC16 (US-039) a report with unsynced local changes is marked provisional with last sync time and pending count', () => {
    const at = '2026-11-20T09:30:00.000Z';
    expect(buildReport(input({ sync: { offline: true, pendingChanges: 2, lastSyncedAt: at } })).provisional).toEqual({ pendingChanges: 2, lastSyncedAt: at, offline: true });
    expect(provisionalOf({ offline: false, pendingChanges: 3, lastSyncedAt: at })).toEqual({ pendingChanges: 3, lastSyncedAt: at, offline: false });
    // Online with nothing pending, and every server-built report, is authoritative.
    expect(provisionalOf({ offline: false, pendingChanges: 0, lastSyncedAt: at })).toBeNull();
    expect(buildReport(input()).provisional).toBeNull();
  });
});

describe('F09 · class summary (US-073)', () => {
  it('F09-AC18 (US-073) one row per student enrolled during the period, derived from each report', () => {
    const s2Enrollment = [{ id: 'e2', classId: 'c1', startDate: '2026-11-05', endDate: null }];
    const reports = [
      buildReport(
        input({
          student: { id: 's2', name: 'Beta' },
          enrollments: s2Enrollment,
          scope: ['c1'],
          attendance: [present('2026-11-05', 'LATE'), present('2026-11-06', 'HALF_DAY')],
          records: [record('2026-11-05', [portion({ section: 'SABAQ', paraNumber: 1, range: { surahStart: 1, ayahStart: 1, surahEnd: 1, ayahEnd: 7 }, totalLines: 7, assigned: lines(7), attempts: [attempt({ completed: lines(7), quality: 2 })] })])],
        }),
      ),
      buildReport(
        input({
          student: { id: 's1', name: 'Alpha' },
          scope: ['c1'],
          attendance: [present('2026-11-02'), present('2026-11-03', 'ABSENT'), present('2026-11-04', 'LEAVE', 'APPROVED')],
          records: [record('2026-11-02', [portion({ section: 'SABQI', assigned: para(1, 2), attempts: [attempt({ completed: para(1, 2), quality: 1, remarks: 'staff remark' })] })])],
          homework: [homework({ state: 'OUTSTANDING' })],
        }),
      ),
      // Not in this class during the period: no row.
      buildReport(input({ student: { id: 's3', name: 'Gamma' }, scope: ['c1'], enrollments: [{ id: 'e3', classId: 'c9', startDate: '2026-01-01', endDate: null }] })),
    ];
    const summary = classSummary('c1', WEEK, '2026-11-20', reports);
    expect(summary.rows.map((r) => r.studentName)).toEqual(['Alpha', 'Beta']);
    expect(summary.rows[0]).toMatchObject({
      attendance: { present: 1, late: 0, halfDay: 0, leave: 1, absent: 1, attended: 1 },
      completed: { SABAQ: [], SABQI: [para(1, 2)], MANZIL: [] },
      quality: { count: 1, display: '1.0' },
      outstandingHomework: 1,
    });
    expect(summary.rows[1]).toMatchObject({ enrolledFrom: '2026-11-05', attendance: { late: 1, halfDay: 1, attended: 2 }, completed: { SABAQ: [lines(7)] } });

    // F09-AC20 (deferred to F13/F14): the export rows hold the same values and no notes or remarks.
    const rows = classSummaryExportRows(summary);
    expect(rows[0]).toMatchObject({ studentName: 'Alpha', present: 1, leave: 1, absent: 1, sabqiCompleted: '1/2 PARA', qualityAverage: '1.0', qualityRatings: 1, outstandingHomework: 1 });
    expect(rows[1]).toMatchObject({ sabaqCompleted: '7 LINES', qualityAverage: '2.0' });
    expect(JSON.stringify(rows)).not.toContain('staff remark');
    expect(JSON.stringify(summary)).not.toContain('staff remark');
  });
});

describe('Decision review 2026-10-30 (SRS §17)', () => {
  it('F07-AC14 (US-028) "No mistakes" stores 0; an empty list stays Not recorded', () => {
    // The report's mistake counts come from @hifz/domain/mistakes (F07): No mistakes is a recorded 0, an empty list is apart.
    const counts = mistakeCounts([{ noMistakes: true, mistakes: [] }, { noMistakes: false, mistakes: [] }]);
    expect(counts).toMatchObject({ total: 0, recordedAttempts: 1, noMistakesAttempts: 1, notRecordedAttempts: 1 });
    // In a report: the explicit 0 is a count, the empty list is "Not recorded" (null), never 0.
    const r = buildReport(input({ records: [record('2026-11-02', [portion({ attempts: [attempt({ noMistakes: true })] }), portion({ position: 2, attempts: [attempt()] })])] }));
    expect(r.days[0]!.portions.map((p) => p.mistakeCount)).toEqual([0, null]);
    expect(r.mistakes).toMatchObject({ recordedAttempts: 1, notRecordedAttempts: 1, total: 0 });
  });

  it('F09-AC17 (US-041) attended counts Present, Late, and Half day; Leave and Absent are separate', () => {
    const r = buildReport(
      input({ attendance: [present('2026-11-02'), present('2026-11-03', 'LATE'), present('2026-11-04', 'HALF_DAY'), present('2026-11-05', 'LEAVE', 'APPROVED'), present('2026-11-06', 'ABSENT')] }),
    );
    expect(r.attendance.counts).toMatchObject({ attended: 3, present: 1, late: 1, halfDay: 1, leave: 1, absent: 1 });
  });
});

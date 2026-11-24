// F15 · Analytics and AI recommendations — unit: metrics (docs/specs/15-f15-analytics-ai.md)
// Synthetic data only. 2026-11-02 is a Monday; the class meets Monday–Saturday; Sunday is not scheduled.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { CalendarException, ScheduleVersion } from '../calendar/schedule.ts';
import { qualityLabel } from '../quality/quality.ts';
import type { Quantity } from '../quantity/quantity.ts';
import { buildReport, type ReportAttempt, type ReportInput, type ReportPortion, type ReportRecord } from '../reports/build-report.ts';
import { reportPeriod } from '../reports/period.ts';
import { ANALYTICS_MIN_RECORDED_DAYS, buildAnalytics } from './metrics.ts';

// ---------- Builders ----------

const lines = (n: number): Quantity => ({ unit: 'LINES', numerator: n, denominator: 1 });
const para = (numerator: number, denominator = 1): Quantity => ({ unit: 'PARA', numerator, denominator });

const SCHEDULE: ScheduleVersion = { classId: 'c1', effectiveFrom: '2026-01-01', weekdays: [1, 2, 3, 4, 5, 6] };
const MONTH = reportPeriod('MONTH', '2026-11-04');
const WEEK = reportPeriod('WEEK', '2026-11-04');

let n = 0;
const id = (prefix: string) => `${prefix}${String(++n)}`;

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

const att = (date: string, status: ReportInput['attendance'][number]['status'] = 'PRESENT', leaveStatus: ReportInput['attendance'][number]['leaveStatus'] = 'NONE') => ({ date, classId: 'c1', status, leaveStatus });

const input = (o: Partial<ReportInput> = {}): ReportInput => ({
  period: MONTH,
  today: '2026-11-30',
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

const tajweed = (severity: 'MINOR' | 'MAJOR', repeated = false) => ({ category: 'TAJWEED' as const, severity, repeated, note: null, noteVisibility: 'INTERNAL' as const });

/** One rated completed Sabqi portion on a date. */
const ratedDay = (date: string, quality: number | null) =>
  record(date, [portion({ paraNumber: 5, assigned: para(1, 2), attempts: [attempt({ status: 'COMPLETED', completed: para(1, 2), quality, noMistakes: true })] })]);

/** November 2026 class days (Sundays are not scheduled). */
const CLASS_DAYS = Array.from({ length: 30 }, (_, i) => `2026-11-${String(i + 1).padStart(2, '0')}`).filter((d) => new Date(`${d}T00:00:00Z`).getUTCDay() !== 0);

// ---------- Fixture for AC1 ----------

const HOLIDAY: CalendarException = { id: 'x1', classId: null, date: '2026-11-06', kind: 'HOLIDAY', label: 'Holiday' };

function fixture(): ReportInput {
  const r1 = record('2026-11-02', [
    portion({ section: 'SABAQ', paraNumber: 1, range: { surahStart: 2, ayahStart: 1, surahEnd: 2, ayahEnd: 5 }, assigned: lines(10), totalLines: 10, attempts: [attempt({ completed: lines(10), quality: 2, mistakes: [tajweed('MAJOR')] })] }),
    portion({ section: 'SABQI', paraNumber: 10, assigned: para(1, 2), attempts: [attempt({ status: 'PARTIAL', completed: para(1, 4), quality: 3, mistakes: [tajweed('MINOR', true)] })] }),
    portion({ section: 'MANZIL', paraNumber: 12, isExtra: true, position: 2, assigned: para(1, 4), attempts: [attempt({ completed: para(1, 4), quality: 1, noMistakes: true })] }),
  ]);
  const r2 = record('2026-11-03', [
    portion({
      section: 'SABQI',
      paraNumber: 10,
      assigned: para(1, 2),
      attempts: [
        attempt({ attemptNo: 1, status: 'NOT_REMEMBERED', completed: para(0, 1), quality: 5, noMistakes: true }),
        attempt({ attemptNo: 2, attemptedAt: '2026-11-03T07:00:00.000Z', status: 'PARTIAL', completed: para(1, 4), quality: 4, noMistakes: true }),
      ],
    }),
  ]);
  // Week 2: a Manzil portion with no rating and no mistakes recorded.
  const r3 = record('2026-11-09', [portion({ section: 'MANZIL', paraNumber: 11, assigned: para(1), attempts: [attempt({ status: 'COMPLETED', completed: para(1), quality: null })] })]);
  // A record on a date that later became a holiday: excluded, never counted.
  const r4 = record('2026-11-06', [portion({ section: 'SABQI', paraNumber: 10, attempts: [attempt({ mistakes: [tajweed('MAJOR')], quality: 5 })] })]);
  return input({
    records: [r1, r2, r3, r4],
    exceptions: [HOLIDAY],
    attendance: [att('2026-11-02'), att('2026-11-03', 'LATE'), att('2026-11-04', 'ABSENT'), att('2026-11-05', 'LEAVE', 'APPROVED'), att('2026-11-09')],
  });
}

// ---------- Tests ----------

describe('F15 · metrics', () => {
  it('F15-AC1 (US-062) progress, assigned vs completed per unit, mistake trends, quality trend, difficult portions, and attendance come from source records', () => {
    const src = fixture();
    const a = buildAnalytics(src);
    const report = buildReport(src);

    // Progress per section; units never mixed, Extra kept apart.
    const sabaq = a.progress.find((p) => p.section === 'SABAQ')!;
    const sabqi = a.progress.find((p) => p.section === 'SABQI')!;
    const manzil = a.progress.find((p) => p.section === 'MANZIL')!;
    expect(a.progress.map((p) => p.section)).toEqual(['SABAQ', 'SABQI', 'MANZIL']);
    expect(sabaq.totals.assigned).toEqual([lines(10)]);
    expect(sabaq.totals.completed).toEqual([lines(10)]);
    expect(sabqi.totals.assigned).toEqual([para(1)]);
    // Latest attempt per portion: 1/4 + 1/4, never the Not Remembered attempt as well.
    expect(sabqi.totals.completed).toEqual([para(1, 2)]);
    expect(sabqi.totals.remaining).toEqual([para(1, 2)]);
    expect(sabqi.statusCounts.PARTIAL).toBe(2);
    expect(sabqi.statusCounts.NOT_REMEMBERED).toBe(0);
    expect(sabqi.paras.map((p) => p.paraNumber)).toEqual([10]);
    expect(sabqi.pendingCount).toBe(2);
    expect(manzil.totals.assigned).toEqual([para(1)]);
    expect(manzil.extraTotals.completed).toEqual([para(1, 4)]);
    expect(manzil.portionCount).toBe(2);
    for (const p of a.progress) for (const q of [...p.totals.assigned, ...p.totals.completed]) expect(Number.isInteger(q.numerator) && Number.isInteger(q.denominator)).toBe(true);

    // Mistake trend: Monday weeks clipped to November; the excluded holiday record adds nothing.
    expect(a.mistakeTrend.weekStart).toBe('MONDAY');
    expect(a.mistakeTrend.weeks.map((w) => [w.from, w.to])).toEqual([
      ['2026-11-01', '2026-11-01'],
      ['2026-11-02', '2026-11-08'],
      ['2026-11-09', '2026-11-15'],
      ['2026-11-16', '2026-11-22'],
      ['2026-11-23', '2026-11-29'],
      ['2026-11-30', '2026-11-30'],
    ]);
    const w1 = a.mistakeTrend.weeks[1]!;
    expect(w1.byCategory.TAJWEED).toBe(2);
    expect(w1.bySeverity).toEqual({ MINOR: 1, MAJOR: 1 });
    expect(w1.repeated).toBe(1);
    expect(w1.attempts).toBe(5); // 3 on Nov 2, plus both attempts on Nov 3 (history kept, mistakes per attempt)
    expect(w1.hasData).toBe(true);
    const w2 = a.mistakeTrend.weeks[2]!;
    // Unrecorded mistakes are "not recorded", never 0 mistakes.
    expect(w2).toMatchObject({ attempts: 1, notRecorded: 1, recordedAttempts: 0, hasData: false });
    expect(a.mistakeTrend.weeks[3]).toMatchObject({ attempts: 0, hasData: false });
    expect(a.mistakeTrend.totals).toMatchObject({ attempts: 6, total: report.mistakes.total, notRecorded: 1, repeated: 1 });
    // The weekly buckets add up to the period totals.
    expect(a.mistakeTrend.weeks.reduce((s, w) => s + w.total, 0)).toBe(a.mistakeTrend.totals.total);

    // Quality: the report's exact average over recorded ratings; null ratings excluded.
    expect(a.qualityTrend.average).toEqual(report.quality);
    expect(a.qualityTrend.average.count).toBe(5); // 2, 3, 1, 5, 4 — the unrated Manzil attempt is not a rating.
    expect(a.qualityTrend.points.map((p) => p.date)).toEqual(['2026-11-02', '2026-11-03', '2026-11-09']);
    expect(a.qualityTrend.points[2]!.value).toBeNull();
    expect(a.qualityCoverage).toEqual({ rated: 4, unrated: 1, notApplicable: 0, limited: false });

    // Difficult portions are the report's recurring difficulties.
    expect(a.difficultPortions).toEqual(report.recurringDifficulties);

    // Attendance context: attended = Present + Late; Leave apart; the holiday is never an absence.
    expect(a.attendance).toMatchObject({ attended: 3, present: 2, late: 1, leave: 1, absent: 1, holidays: 1 });
    expect(a.recordedDays).toBe(3);
    expect(a.insufficientData).toBe(false);
    expect(a.hasData).toBe(true);
    expect(a.provisional).toBeNull();
  });

  it('F15-AC2 (US-062) metrics from unsynced local data are marked provisional with last sync time and pending count (AC-AI-02)', () => {
    const src = fixture();
    const offline = buildAnalytics({ ...src, sync: { offline: true, pendingChanges: 4, lastSyncedAt: '2026-11-10T09:00:00.000Z' } });
    expect(offline.provisional).toEqual({ pendingChanges: 4, lastSyncedAt: '2026-11-10T09:00:00.000Z', offline: true });
    const pendingOnline = buildAnalytics({ ...src, sync: { offline: false, pendingChanges: 2, lastSyncedAt: null } });
    expect(pendingOnline.provisional).toEqual({ pendingChanges: 2, lastSyncedAt: null, offline: false });
    // Fully synced and online: authoritative.
    expect(buildAnalytics({ ...src, sync: { offline: false, pendingChanges: 0, lastSyncedAt: '2026-11-10T09:00:00.000Z' } }).provisional).toBeNull();
    // The metrics themselves are the same as the authoritative ones.
    const { provisional: _p, ...rest } = offline;
    const { provisional: _q, ...server } = buildAnalytics(src);
    expect(rest).toEqual(server);
  });

  it('F15-AC1 (US-062) too little data is "Not enough data", never a trend; no data is not a page of zeros', () => {
    const two = buildAnalytics(input({ records: [ratedDay('2026-11-02', 2), ratedDay('2026-11-03', 3)] }));
    expect(ANALYTICS_MIN_RECORDED_DAYS).toBe(3);
    expect(two.recordedDays).toBe(2);
    expect(two.insufficientData).toBe(true);
    expect(two.qualityTrend.direction).toBe('NOT_ENOUGH_DATA');
    const none = buildAnalytics(input());
    expect(none.hasData).toBe(false);
    expect(none.insufficientData).toBe(true);
    expect(none.qualityTrend.average.value).toBeNull();
    expect(none.mistakeTrend.weeks.every((w) => !w.hasData)).toBe(true);
    expect(none.qualityCoverage.limited).toBe(true);
  });

  it('F15-AC1 (US-062) a record with no attempt yet is not a recorded day', () => {
    const a = buildAnalytics(input({ records: [record('2026-11-02', [portion()]), ratedDay('2026-11-03', 2)] }));
    expect(a.recordedDays).toBe(1);
    expect(a.qualityCoverage.notApplicable).toBe(1);
  });

  it('F15-AC1 (US-062) absent, pending and not-assigned portions are never failure or zero quality', () => {
    const r = record('2026-11-02', [
      portion({ attempts: [attempt({ status: 'ABSENT', quality: null })] }),
      portion({ position: 2, attempts: [attempt({ status: 'PENDING', quality: null })] }),
      portion({ position: 3, attempts: [attempt({ status: 'NOT_ASSIGNED', quality: null })] }),
    ]);
    const a = buildAnalytics(input({ records: [r] }));
    expect(a.qualityTrend.average.count).toBe(0);
    expect(a.qualityTrend.average.value).toBeNull();
    expect(a.qualityCoverage).toMatchObject({ rated: 0, unrated: 0, notApplicable: 3 });
    expect(a.difficultPortions).toEqual([]);
  });

  it('F15-AC1 (US-062) the mistake trend follows the configured week start', () => {
    const src = fixture();
    const a = buildAnalytics({ ...src, period: reportPeriod('MONTH', '2026-11-04', { weekStart: 'SATURDAY' }) });
    expect(a.mistakeTrend.weekStart).toBe('SATURDAY');
    expect(a.mistakeTrend.weeks[0]).toMatchObject({ from: '2026-11-01', to: '2026-11-06' });
    const b = buildAnalytics(src, { weekStart: 'SUNDAY' });
    expect(b.mistakeTrend.weeks[0]).toMatchObject({ from: '2026-11-01', to: '2026-11-07' });
    const week = buildAnalytics({ ...src, period: WEEK });
    expect(week.mistakeTrend.weeks).toHaveLength(1);
  });

  it('F15-AC1 (US-062) missing quality never becomes 0 (property)', () => {
    fc.assert(
      fc.property(fc.array(fc.option(fc.integer({ min: 1, max: 5 }), { nil: null }), { minLength: 1, maxLength: CLASS_DAYS.length }), (scores) => {
        const a = buildAnalytics(input({ records: scores.map((q, i) => ratedDay(CLASS_DAYS[i]!, q)) }));
        const rated = scores.filter((s): s is number => s !== null);
        expect(a.qualityTrend.average.count).toBe(rated.length);
        if (rated.length === 0) expect(a.qualityTrend.average.value).toBeNull();
        else expect(a.qualityTrend.average.value).toBe(rated.reduce((s, x) => s + x, 0) / rated.length);
        for (const p of a.qualityTrend.points) expect(p.value === null || (p.value >= 1 && p.value <= 5)).toBe(true);
      }),
    );
  });
});

describe('F15 · quality trend', () => {
  it('F15-AC3 (US-062) the axis runs 1 · Excellent (top) to 5 · Weak (bottom), missing ratings are gaps, and a falling average is improvement', () => {
    // Ratings 4, 4, (none), 2, 1: the average falls, which is improvement.
    const days = [ratedDay('2026-11-02', 4), ratedDay('2026-11-03', 4), ratedDay('2026-11-04', null), ratedDay('2026-11-05', 2), ratedDay('2026-11-07', 1)];
    const a = buildAnalytics(input({ records: days }));
    const t = a.qualityTrend;
    expect(t.axis).toEqual({ top: 1, bottom: 5 });
    expect(qualityLabel(t.axis.top, 'en')).toBe('Excellent');
    expect(qualityLabel(t.axis.bottom, 'en')).toBe('Weak');
    expect(t.points.map((p) => p.value)).toEqual([4, 4, null, 2, 1]);
    expect(t.firstHalf?.value).toBe(4);
    expect(t.secondHalf?.value).toBe(1.5);
    expect(t.direction).toBe('IMPROVING');
    // Exact average 11/4 = 2.75, nearest score 3 · Average.
    expect(t.average.value).toBe(2.75);
    expect(t.average.nearestScore).toBe(3);

    // Rising scores are a decline.
    const worse = buildAnalytics(input({ records: [ratedDay('2026-11-02', 1), ratedDay('2026-11-03', 2), ratedDay('2026-11-04', 4), ratedDay('2026-11-05', 5)] }));
    expect(worse.qualityTrend.direction).toBe('DECLINING');
    const flat = buildAnalytics(input({ records: [ratedDay('2026-11-02', 2), ratedDay('2026-11-03', 3), ratedDay('2026-11-04', 3), ratedDay('2026-11-05', 2)] }));
    expect(flat.qualityTrend.direction).toBe('STEADY');
    // Three rated points: fewer than 2 per half.
    const few = buildAnalytics(input({ records: [ratedDay('2026-11-02', 5), ratedDay('2026-11-03', 3), ratedDay('2026-11-04', 1), ratedDay('2026-11-05', null)] }));
    expect(few.qualityTrend.direction).toBe('NOT_ENOUGH_DATA');
    expect(few.qualityTrend.firstHalf).toBeNull();
  });

  it('F15-AC3 (US-062) an odd middle point belongs to neither half; .5 rounds the label up', () => {
    const a = buildAnalytics(input({ records: [ratedDay('2026-11-02', 2), ratedDay('2026-11-03', 1), ratedDay('2026-11-04', 5), ratedDay('2026-11-05', 2), ratedDay('2026-11-06', 2)] }));
    // Nov 6 is a scheduled Friday here (no holiday in this input).
    expect(a.qualityTrend.firstHalf).toMatchObject({ value: 1.5, nearestScore: 2 });
    expect(a.qualityTrend.secondHalf).toMatchObject({ value: 2, nearestScore: 2 });
    expect(a.qualityTrend.direction).toBe('DECLINING');
  });
});

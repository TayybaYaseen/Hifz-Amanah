// F15 · Synthetic analytics input for tests (no real student data). Not exported from the package index.
// November 2026; the class meets Monday–Saturday; 2026-11-02 is a Monday.
import type { ReportAttempt, ReportInput, ReportPortion, ReportRecord } from '../reports/build-report.ts';
import { reportPeriod } from '../reports/period.ts';
import type { Quantity } from '../quantity/quantity.ts';

export const SYNTHETIC_NAME = 'Zaid Testname';
export const SYNTHETIC_NOTE = 'SYNTHETIC-PRIVATE-NOTE stumbles at verse end';
export const SYNTHETIC_REMARK = 'SYNTHETIC-REMARK revise slowly';

const para = (numerator: number, denominator = 1): Quantity => ({ unit: 'PARA', numerator, denominator });
const lines = (n: number): Quantity => ({ unit: 'LINES', numerator: n, denominator: 1 });

let n = 0;
const id = (p: string) => `${p}-${String(++n)}`;

const attempt = (o: Partial<ReportAttempt>): ReportAttempt => ({
  id: id('a'),
  attemptNo: 1,
  attemptedAt: '2026-11-02T06:00:00.000Z',
  status: 'COMPLETED',
  completed: null,
  quality: null,
  noMistakes: false,
  mistakes: [],
  remarks: SYNTHETIC_REMARK,
  ...o,
});

const portion = (o: Partial<ReportPortion>): ReportPortion => ({
  id: id('p'),
  section: 'MANZIL',
  position: 1,
  isExtra: false,
  paraNumber: 10,
  range: null,
  assigned: para(1, 2),
  totalLines: null,
  removed: false,
  attempts: [],
  ...o,
});

const record = (date: string, portions: ReportPortion[]): ReportRecord => ({ id: id('r'), date, classId: 'c1', sessionLabel: null, overallLabel: null, portions });

const tajweedMajor = { category: 'TAJWEED' as const, severity: 'MAJOR' as const, repeated: true, note: SYNTHETIC_NOTE, noteVisibility: 'INTERNAL' as const };

/** Four weeks of Manzil in Paras 10–12 with Tajweed mistakes, a Sabaq in lines, and quality falling from 4 to 2. */
export function syntheticInput(o: Partial<ReportInput> = {}): ReportInput {
  const days: [string, number, number | null][] = [
    ['2026-11-02', 10, 4],
    ['2026-11-04', 11, 4],
    ['2026-11-10', 12, 3],
    ['2026-11-12', 10, null],
    ['2026-11-17', 11, 2],
    ['2026-11-24', 12, 2],
  ];
  const records = days.map(([date, paraNo, quality]) =>
    record(date, [
      portion({ paraNumber: paraNo, attempts: [attempt({ status: 'PARTIAL', completed: para(1, 4), quality, mistakes: [tajweedMajor] })] }),
      portion({ section: 'SABAQ', paraNumber: 1, position: 1, range: { surahStart: 2, ayahStart: 1, surahEnd: 2, ayahEnd: 5 }, assigned: lines(10), totalLines: 10, attempts: [attempt({ completed: lines(10), quality: 2, noMistakes: true })] }),
    ]),
  );
  return {
    period: reportPeriod('MONTH', '2026-11-04'),
    today: '2026-11-30',
    student: { id: '01960000-0000-7000-8000-000000000001', name: SYNTHETIC_NAME },
    enrollments: [{ id: 'e1', classId: 'c1', startDate: '2026-01-01', endDate: null }],
    scope: null,
    schedules: [{ classId: 'c1', effectiveFrom: '2026-01-01', weekdays: [1, 2, 3, 4, 5, 6] }],
    exceptions: [],
    attendance: [
      { date: '2026-11-02', classId: 'c1', status: 'PRESENT', leaveStatus: 'NONE' },
      { date: '2026-11-03', classId: 'c1', status: 'ABSENT', leaveStatus: 'NONE' },
      { date: '2026-11-04', classId: 'c1', status: 'LATE', leaveStatus: 'NONE' },
    ],
    records,
    homework: [],
    ...o,
  };
}

// F15 · Eval-set inputs (docs/specs/15-f15-analytics-ai.md "Judged against examples"). One SYNTHETIC source scenario per
// eval-table row, built as F09 report input and turned into the minimized AI payload exactly as the gateway does
// (buildAnalytics → minimizeForAi with every category on). No real student data. November 2026; the class meets
// Monday–Saturday; 2026-11-02 is a Monday.
import { buildAnalytics, minimizeForAi, type AiLocale, type AiPayload } from '@hifz/domain/analytics';
import { reportPeriod, type ReportAttempt, type ReportInput, type ReportPortion, type ReportRecord } from '@hifz/domain/reports';

export type ScenarioId = 'tajweed-rising' | 'quality-improving' | 'two-records' | 'absences' | 'missing-quality';

type Quantity = { unit: 'PARA' | 'LINES'; numerator: number; denominator: number };
const para = (numerator: number, denominator = 1): Quantity => ({ unit: 'PARA', numerator, denominator });

let n = 0;
const id = (p: string) => `${p}-eval-${String(++n)}`;

const attempt = (o: Partial<ReportAttempt>): ReportAttempt => ({
  id: id('a'),
  attemptNo: 1,
  attemptedAt: '2026-11-02T06:00:00.000Z',
  status: 'COMPLETED',
  completed: para(1),
  quality: null,
  noMistakes: false,
  mistakes: [],
  remarks: null,
  ...o,
});

const portion = (o: Partial<ReportPortion>): ReportPortion => ({
  id: id('p'),
  section: 'SABQI',
  position: 1,
  isExtra: false,
  paraNumber: 5,
  range: null,
  assigned: para(1),
  totalLines: null,
  removed: false,
  attempts: [],
  ...o,
});

const record = (date: string, portions: ReportPortion[]): ReportRecord => ({ id: id('r'), date, classId: 'c1', sessionLabel: null, overallLabel: null, portions });

const tajweed = (k: number) => Array.from({ length: k }, () => ({ category: 'TAJWEED' as const, severity: 'MINOR' as const, repeated: false, note: null, noteVisibility: 'INTERNAL' as const }));

const present = (date: string) => ({ date, classId: 'c1', status: 'PRESENT' as const, leaveStatus: 'NONE' as const });
const absent = (date: string) => ({ date, classId: 'c1', status: 'ABSENT' as const, leaveStatus: 'NONE' as const });

function input(records: ReportRecord[], attendance: ReportInput['attendance'] = records.map((r) => present(r.date))): ReportInput {
  return {
    period: reportPeriod('MONTH', '2026-11-15'),
    today: '2026-11-30',
    student: { id: '01960000-0000-7000-8000-00000000e7a1', name: 'Eval Student (synthetic)' },
    enrollments: [{ id: 'e1', classId: 'c1', startDate: '2026-01-01', endDate: null }],
    scope: null,
    schedules: [{ classId: 'c1', effectiveFrom: '2026-01-01', weekdays: [1, 2, 3, 4, 5, 6] }],
    exceptions: [],
    attendance,
    records,
    homework: [],
  };
}

const sources: Record<ScenarioId, () => ReportInput> = {
  // Row 1: Manzil Paras 10–12 over four weeks, Tajweed mistakes rising 1 → 2 → 3 → 4 a week.
  'tajweed-rising': () =>
    input(
      [
        ['2026-11-03', 10, 1],
        ['2026-11-10', 11, 2],
        ['2026-11-17', 12, 3],
        ['2026-11-24', 10, 4],
      ].map(([date, paraNo, k]) =>
        record(date as string, [portion({ section: 'MANZIL', paraNumber: paraNo as number, attempts: [attempt({ status: 'PARTIAL', completed: para(1, 2), quality: 3, mistakes: tajweed(k as number) })] })]),
      ),
    ),
  // Row 2: quality average 3.2 in the first half of the rated days and 2.1 in the second half (lower is better).
  'quality-improving': () =>
    input([
      ...[3, 3, 3, 4, 3].map((q, i) => record(`2026-11-0${String(2 + i)}`, [portion({ attempts: [attempt({ quality: q, noMistakes: true })] })])),
      ...[
        [2, 2],
        [2, 2],
        [2, 2],
        [2, 2],
        [2, 3],
      ].map(([q1, q2], i) =>
        record(`2026-11-${String(23 + i)}`, [
          portion({ position: 1, attempts: [attempt({ quality: q1!, noMistakes: true })] }),
          portion({ position: 2, paraNumber: 6, attempts: [attempt({ quality: q2!, noMistakes: true })] }),
        ]),
      ),
    ]),
  // Row 3: only two records in the month.
  'two-records': () => input([record('2026-11-03', [portion({ attempts: [attempt({ quality: 2 })] })]), record('2026-11-05', [portion({ attempts: [attempt({ quality: 3 })] })])]),
  // Row 4: absent on five days; on the eight attended days recitation was good (ratings 1 and 2, no mistakes).
  absences: () => {
    const attended = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12'];
    const away = ['2026-11-06', '2026-11-07', '2026-11-13', '2026-11-14', '2026-11-16'];
    const records = attended.map((date, i) => record(date, [portion({ attempts: [attempt({ quality: i % 2 === 0 ? 1 : 2, noMistakes: true })] })]));
    return input(records, [...attended.map(present), ...away.map(absent)]);
  },
  // Row 5: eight ratable portions over four days, only two rated.
  'missing-quality': () =>
    input(
      ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'].map((date, i) =>
        record(date, [
          portion({ position: 1, attempts: [attempt({ quality: i === 0 ? 2 : null })] }),
          portion({ position: 2, section: 'MANZIL', paraNumber: 8, attempts: [attempt({ quality: i === 1 ? 3 : null })] }),
        ]),
      ),
    ),
};

const ALL_ON = { ATTENDANCE: true, PROGRESS: true, MISTAKES: true, QUALITY: true, HOMEWORK: true } as const;

/** The payload the gateway would send for a scenario (synthetic pseudonym). */
export function payloadOf(scenario: ScenarioId, locale: AiLocale = 'en'): AiPayload {
  return minimizeForAi(buildAnalytics(sources[scenario]()), { categories: ALL_ON, pseudonym: 'S-EVALTEST', locale });
}

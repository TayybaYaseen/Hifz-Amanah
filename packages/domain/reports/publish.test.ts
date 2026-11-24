// F10 · Report publishing rules — unit (docs/specs/13-f10-student-parent-access.md; FR-RPT-010, DEC-B33)
import { describe, expect, it } from 'vitest';
import { buildReport, type ReportInput } from './build-report.ts';
import { reportPeriod } from './period.ts';
import { fingerprintDay, publishRefusal, publishedFingerprint, sortedKeys } from './publish.ts';

const period = reportPeriod('WEEK', '2026-11-04'); // Mon 2 – Sun 8 November 2026

function input(over: Partial<ReportInput> = {}): ReportInput {
  return {
    period,
    today: '2026-11-20',
    student: { id: 's1', name: 'Synthetic Student' },
    enrollments: [{ id: 'e1', classId: 'c1', startDate: '2026-01-01', endDate: null }],
    scope: null,
    schedules: [{ classId: 'c1', effectiveFrom: '2026-01-01', weekdays: [1, 2, 3, 4, 5, 6] }],
    exceptions: [],
    attendance: [{ date: '2026-11-02', classId: 'c1', status: 'PRESENT', leaveStatus: 'NONE' }],
    records: [
      {
        id: 'r1',
        date: '2026-11-02',
        classId: 'c1',
        sessionLabel: null,
        overallLabel: null,
        portions: [
          {
            id: 'p1',
            section: 'SABQI',
            position: 1,
            isExtra: false,
            paraNumber: 4,
            range: null,
            assigned: { unit: 'PARA', numerator: 1, denominator: 1 },
            totalLines: null,
            removed: false,
            attempts: [{ id: 'a1', attemptNo: 1, attemptedAt: '2026-11-02T06:00:00.000Z', status: 'PARTIAL', completed: { unit: 'PARA', numerator: 1, denominator: 2 }, quality: 3, noMistakes: false, mistakes: [], remarks: null }],
          },
        ],
      },
    ],
    homework: [],
    ...over,
  };
}

describe('F10 · publishRefusal()', () => {
  it('F10-AC14 (US-044) unsynced device changes or an open conflict refuse publishing with the reason', () => {
    expect(publishRefusal({ period, today: '2026-11-20', pendingChanges: 0, openConflicts: 0 })).toBeNull();
    expect(publishRefusal({ period, today: '2026-11-20', pendingChanges: 1, openConflicts: 0 })).toBe('UNSYNCED_CHANGES');
    expect(publishRefusal({ period, today: '2026-11-20', pendingChanges: 0, openConflicts: 2 })).toBe('UNSYNCED_CHANGES');
  });

  it('F10 unit: a period that has not started cannot be published; one in progress can', () => {
    expect(publishRefusal({ period, today: '2026-11-01', pendingChanges: 0, openConflicts: 0 })).toBe('PERIOD_NOT_STARTED');
    expect(publishRefusal({ period, today: '2026-11-02', pendingChanges: 0, openConflicts: 0 })).toBeNull();
    // The first reason that applies wins.
    expect(publishRefusal({ period, today: '2026-11-01', pendingChanges: 3, openConflicts: 0 })).toBe('PERIOD_NOT_STARTED');
  });
});

describe('F10 · publishedFingerprint()', () => {
  it('F10-AC15 (US-044) a corrected source record changes the fingerprint', () => {
    const before = publishedFingerprint(buildReport(input()));
    const base = input();
    const record = base.records[0]!;
    const portion = record.portions[0]!;
    const corrected = input({ records: [{ ...record, portions: [{ ...portion, attempts: [{ ...portion.attempts[0]!, quality: 5 }] }] }] });
    expect(publishedFingerprint(buildReport(corrected))).not.toBe(before);
  });

  it('F10-AC15 (US-044) the passing of days alone never changes the fingerprint', () => {
    // Built as of fingerprintDay, a finished period reads the same whatever today is.
    const a = buildReport(input({ today: fingerprintDay(period, '2026-11-20') }));
    const b = buildReport(input({ today: fingerprintDay(period, '2026-12-15') }));
    expect(publishedFingerprint(a)).toBe(publishedFingerprint(b));
    // A period still running is fingerprinted as of its last day, so later days never read "future" in one and
    // "not marked" in the next.
    expect(fingerprintDay(period, '2026-11-05')).toBe('2026-11-08');
    expect(fingerprintDay(period, '2026-11-09')).toBe('2026-11-09');
    const midweek = buildReport(input({ today: fingerprintDay(period, '2026-11-05') }));
    const sunday = buildReport(input({ today: fingerprintDay(period, '2026-11-08') }));
    expect(publishedFingerprint(midweek)).toBe(publishedFingerprint(sunday));
  });

  it('F10 unit: homework state computed against today, provisional state, and key order are left out', () => {
    const base = buildReport(input()) as unknown as Record<string, unknown>;
    const homework = base.homework as Record<string, unknown>;
    const changed = { ...base, today: '2027-01-01', provisional: { pendingChanges: 1, lastSyncedAt: null, offline: true }, homework: { ...homework, outstanding: 9, carriedOver: 9, outstandingItems: [{ id: 'h' }] } };
    expect(publishedFingerprint(changed)).toBe(publishedFingerprint(base));
    // What was given, attempted, and completed does count.
    expect(publishedFingerprint({ ...base, homework: { ...homework, completed: 7 } })).not.toBe(publishedFingerprint(base));
    // jsonb reorders keys; the fingerprint does not depend on order.
    const reordered = Object.fromEntries(Object.entries(base).reverse());
    expect(publishedFingerprint(reordered)).toBe(publishedFingerprint(base));
    expect(sortedKeys({ b: 1, a: [{ d: 1, c: 2 }] })).toEqual({ a: [{ c: 2, d: 1 }], b: 1 });
  });
});

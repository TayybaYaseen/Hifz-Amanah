// F10 · Student and Parent access — unit: projectFor(audience) (docs/specs/13-f10-student-parent-access.md)
import { describe, expect, it } from 'vitest';
import { projectFor } from './projection.ts';

describe('F10 · projectFor()', () => {
  it.todo('F10-AC10 (US-046) removes private-to-staff note text for STUDENT');
  it.todo('F10-AC10 (US-046) removes private-to-staff note text for PARENT');
  it.todo('F10-AC11 (US-046) keeps notes visible to student/guardian for STUDENT and PARENT');
  it.todo('F10-AC3 (US-044) removes unpublished report periods for STUDENT and PARENT');
  it.todo('F10 unit: keeps internal notes for staff audiences');
  it.todo('F10 unit: an unknown audience fails closed');
});

describe('F10 · note defaults', () => {
  it.todo('F10-AC9 (US-046) a new note is private to staff by default');
});

describe('F07 · mistake notes through projectFor()', () => {
  const internal = { category: 'TAJWEED', severity: 'MAJOR', repeated: true, note: 'Synthetic staff-only note', noteVisibility: 'INTERNAL' };
  const shared = { ...internal, note: 'Synthetic family note', noteVisibility: 'SHARED' };

  it('F07-AC15 (US-028) an INTERNAL mistake note is absent for STUDENT and PARENT, present for STAFF', () => {
    for (const audience of ['STUDENT', 'PARENT'] as const) {
      const out = projectFor(audience, 'attempt_mistake', internal);
      expect(out).toEqual({ category: 'TAJWEED', severity: 'MAJOR', repeated: true });
      expect(JSON.stringify(out)).not.toContain('Synthetic staff-only note');
    }
    expect(projectFor('STAFF', 'attempt_mistake', internal)).toEqual(internal);
  });

  it('F07-AC15 (US-028) a SHARED mistake note is shown to STUDENT and PARENT', () => {
    for (const audience of ['STUDENT', 'PARENT'] as const) {
      expect(projectFor(audience, 'attempt_mistake', shared)).toEqual({ category: 'TAJWEED', severity: 'MAJOR', repeated: true, note: 'Synthetic family note' });
    }
  });

  it('F07 unit: a missing or unknown visibility is treated as INTERNAL; other entities still fail closed', () => {
    expect(projectFor('PARENT', 'attempt_mistake', { ...internal, noteVisibility: undefined })).not.toHaveProperty('note');
    expect(projectFor('PARENT', 'attempt_mistake', { ...internal, noteVisibility: 'shared' })).not.toHaveProperty('note');
    expect(projectFor('STUDENT', 'portion_attempt', { remarks: 'x', quality: 2 })).toEqual({});
    expect(projectFor('STUDENT', '__proto__', {})).toEqual({});
  });
});

describe('F09 · reports through projectFor()', async () => {
  const { buildReport, classSummary, reportPeriod } = await import('@hifz/domain/reports');
  const period = reportPeriod('WEEK', '2026-11-04');
  const mistake = (note: string, noteVisibility: 'INTERNAL' | 'SHARED') => ({ category: 'TAJWEED' as const, severity: 'MAJOR' as const, repeated: false, note, noteVisibility });
  const report = buildReport({
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
        overallLabel: 'GOOD',
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
            attempts: [
              {
                id: 'a1',
                attemptNo: 1,
                attemptedAt: '2026-11-02T06:00:00.000Z',
                status: 'PARTIAL',
                completed: { unit: 'PARA', numerator: 1, denominator: 2 },
                quality: 3,
                noMistakes: false,
                mistakes: [mistake('Synthetic private mistake note', 'INTERNAL'), mistake('Synthetic shared mistake note', 'SHARED')],
                remarks: 'Synthetic private remark',
              },
            ],
          },
        ],
      },
    ],
    homework: [],
  });
  const fields = report as unknown as Record<string, unknown>;

  it('F09-AC15 (US-039) internal notes and remarks are absent from a Student or Parent report payload, not just hidden', () => {
    for (const audience of ['STUDENT', 'PARENT'] as const) {
      const body = JSON.stringify(projectFor(audience, 'report', fields));
      expect(body).not.toContain('Synthetic private remark');
      expect(body).not.toContain('Synthetic private mistake note');
      // A note the Teacher shared stays; the figures are unchanged.
      expect(body).toContain('Synthetic shared mistake note');
      const out = projectFor(audience, 'report', fields) as { quality: unknown; days: { portions: Record<string, unknown>[] }[] };
      expect(out.quality).toEqual(report.quality);
      expect(out.days[0]!.portions[0]).not.toHaveProperty('remarks');
      expect(out.days[0]!.portions[0]!.mistakes).toEqual([
        { category: 'TAJWEED', severity: 'MAJOR', repeated: false },
        { category: 'TAJWEED', severity: 'MAJOR', repeated: false, note: 'Synthetic shared mistake note' },
      ]);
    }
  });

  it('F09 unit: staff receive the report as built, internal text included', () => {
    const body = JSON.stringify(projectFor('STAFF', 'report', fields));
    expect(body).toContain('Synthetic private remark');
    expect(body).toContain('Synthetic private mistake note');
  });

  it('F09-AC19 (US-073) the class summary is never projected for a Student or Parent (staff only)', () => {
    const summary = classSummary('c1', period, '2026-11-20', [report]) as unknown as Record<string, unknown>;
    expect(projectFor('STUDENT', 'class_summary', summary)).toEqual({});
    expect(projectFor('PARENT', 'class_summary', summary)).toEqual({});
    expect(projectFor('STAFF', 'class_summary', summary)).toEqual(summary);
  });
});

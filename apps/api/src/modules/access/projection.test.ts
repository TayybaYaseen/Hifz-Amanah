// F10 · Student and Parent access — unit: projectFor(audience) (docs/specs/13-f10-student-parent-access.md)
import { describe, expect, it } from 'vitest';
import { MistakeSchema, PortionAttemptCreateFields } from '@hifz/contracts';
import { DEFAULT_NOTE_VISIBILITY, textForFamily, visibilityOrDefault } from '@hifz/domain/mistakes';
import { buildReport, reportPeriod, type ReportInput } from '@hifz/domain/reports';
import { audienceOf, projectFor, type Audience } from './projection.ts';

// Synthetic markers only (AGENTS.md §6). Every test looks for these strings in the serialized payload.
const PRIVATE_REMARK = 'Synthetic F10 private remark marker';
const SHARED_REMARK = 'Synthetic F10 shared remark marker';
const PRIVATE_NOTE = 'Synthetic F10 private mistake-note marker';
const SHARED_NOTE = 'Synthetic F10 shared mistake-note marker';
const FAMILY: readonly Audience[] = ['STUDENT', 'PARENT'];

type Vis = 'INTERNAL' | 'SHARED';

const attemptOf = (id: string, remarks: string, remarksVisibility: Vis, note: string, noteVisibility: Vis) => ({
  id,
  attemptNo: 1,
  attemptedAt: '2026-11-02T06:00:00.000Z',
  status: 'PARTIAL' as const,
  completed: { unit: 'PARA' as const, numerator: 1, denominator: 2 },
  quality: 2,
  noMistakes: false,
  mistakes: [{ category: 'TAJWEED' as const, severity: 'MAJOR' as const, repeated: false, note, noteVisibility }],
  remarks,
  remarksVisibility,
});

const portionOf = (id: string, position: number, paraNumber: number, a: ReturnType<typeof attemptOf>) => ({
  id,
  section: 'SABQI' as const,
  position,
  isExtra: false,
  paraNumber,
  range: null,
  assigned: { unit: 'PARA' as const, numerator: 1, denominator: 1 },
  totalLines: null,
  removed: false,
  attempts: [a],
});

/** One student's week: Sabqi Para 4 with a private remark and note, Para 5 with a shared remark and note. */
function week(over: Partial<ReportInput> = {}) {
  return buildReport({
    period: reportPeriod('WEEK', '2026-11-04'),
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
          portionOf('p1', 1, 4, attemptOf('a1', PRIVATE_REMARK, 'INTERNAL', PRIVATE_NOTE, 'INTERNAL')),
          portionOf('p2', 2, 5, attemptOf('a2', SHARED_REMARK, 'SHARED', SHARED_NOTE, 'SHARED')),
        ],
      },
    ],
    homework: [],
    ...over,
  });
}

const asFields = (v: unknown) => v as Record<string, unknown>;
const published = (report: unknown, extra: Record<string, unknown> = {}) => ({
  published: true,
  id: '0190f5c0-0000-7000-8000-000000000001',
  publishedAt: '2026-11-09T10:00:00.000Z',
  updatedAt: null,
  teachers: [{ name: 'Synthetic Teacher', email: 'never-sent@example.test' }],
  report,
  generatedAt: '2026-11-20T10:00:00.000Z',
  ...extra,
});

describe('F10 · projectFor()', () => {
  for (const audience of FAMILY) {
    it(`F10-AC10 (US-046) removes private-to-staff note text for ${audience}`, () => {
      const r = asFields(week());
      for (const [entity, fields] of [
        ['report', r],
        ['published_report', published(r)],
      ] as const) {
        const body = JSON.stringify(projectFor(audience, entity, fields));
        expect(body, entity).not.toContain(PRIVATE_REMARK);
        expect(body, entity).not.toContain(PRIVATE_NOTE);
      }
      // Absent, not blanked: the private line has no remarks key and its mistake no note key.
      const out = projectFor(audience, 'report', r) as { days: { portions: Record<string, unknown>[] }[] };
      const line = out.days[0]!.portions[0]!;
      expect(line).not.toHaveProperty('remarks');
      expect(line).not.toHaveProperty('remarksVisibility');
      expect((line.mistakes as Record<string, unknown>[])[0]).not.toHaveProperty('note');
    });
  }

  it('F10-AC11 (US-046) keeps notes visible to student/guardian for STUDENT and PARENT', () => {
    for (const audience of FAMILY) {
      const out = projectFor(audience, 'published_report', published(asFields(week()))) as { report: { days: { portions: Record<string, unknown>[] }[] } };
      const line = out.report.days[0]!.portions[1]!;
      expect(line.remarks).toBe(SHARED_REMARK);
      expect(line.mistakes).toEqual([{ category: 'TAJWEED', severity: 'MAJOR', repeated: false, note: SHARED_NOTE }]);
    }
  });

  it('F10-AC3 (US-044) removes unpublished report periods for STUDENT and PARENT', () => {
    const r = asFields(week());
    const period = { id: 'x', kind: 'WEEK', from: '2026-11-02', to: '2026-11-08', publishedAt: '2026-11-09T10:00:00.000Z' };
    for (const audience of FAMILY) {
      for (const flag of [false, undefined, 'true', 1]) {
        expect(projectFor(audience, 'published_report', published(r, { published: flag })), String(flag)).toEqual({});
        expect(projectFor(audience, 'published_period', { ...period, published: flag }), String(flag)).toEqual({});
      }
      expect(projectFor(audience, 'published_report', published(r, { publishedAt: null }))).toEqual({});
      // Published: the period is there with its dates, and nothing else.
      expect(projectFor(audience, 'published_period', { ...period, published: true, publishedBy: 'u1' })).toEqual({ ...period, updatedAt: null });
    }
  });

  it('F10 unit: keeps internal notes for staff audiences', () => {
    const r = asFields(week());
    const body = JSON.stringify(projectFor('STAFF', 'report', r));
    expect(body).toContain(PRIVATE_REMARK);
    expect(body).toContain(PRIVATE_NOTE);
    expect(projectFor('STAFF', 'report', r)).toEqual(r);
    expect((['OWNER', 'ADMIN', 'TEACHER', 'STUDENT', 'PARENT'] as const).map(audienceOf)).toEqual(['STAFF', 'STAFF', 'STAFF', 'STUDENT', 'PARENT']);
  });

  it('F10 unit: an unknown audience fails closed', () => {
    expect(() => projectFor('GUARDIAN' as Audience, 'report', asFields(week()))).toThrow('unknown audience');
    expect(() => projectFor('' as Audience, 'attempt_mistake', {})).toThrow();
    // An entity that is not allowlisted yields nothing for a family audience.
    for (const audience of FAMILY) {
      for (const entity of ['portion_attempt', 'daily_record', 'student_guardian', 'constructor', 'toString']) {
        expect(projectFor(audience, entity, { remarks: PRIVATE_REMARK }), entity).toEqual({});
      }
    }
  });

  it('F10-AC17 (US-044) the family report has exactly the FR-PORT-006 field set', () => {
    const r = week({
      homework: [{ id: 'h1', classId: 'c1', status: 'DRAFT', state: 'DUE', assignedDate: '2026-11-02', dueDate: '2026-11-03', carriedOverReason: null, portions: [] }],
      sync: { offline: true, pendingChanges: 2, lastSyncedAt: '2026-11-01T00:00:00.000Z' },
    });
    for (const audience of FAMILY) {
      const out = projectFor(audience, 'published_report', published(asFields(r))) as Record<string, unknown> & { report: Record<string, unknown> };
      expect(Object.keys(out).sort()).toEqual(['generatedAt', 'id', 'publishedAt', 'report', 'teachers', 'updatedAt']);
      // The teacher's name, and nothing else about them.
      expect(out.teachers).toEqual([{ name: 'Synthetic Teacher' }]);
      expect(Object.keys(out.report).sort()).toEqual(
        ['attendance', 'classes', 'days', 'hasData', 'homework', 'mistakes', 'overallLabels', 'period', 'quality', 'qualityTrend', 'recurringDifficulties', 'sections', 'student'].sort(),
      );
      // No sync details, no "today", no excluded-record list, no draft homework.
      expect(Object.keys(out.report.homework as object).sort()).toEqual(['assigned', 'attempted', 'carriedForward', 'carriedOver', 'completed', 'confirmed', 'outstanding', 'outstandingItems']);
      // Portions with quantities and statuses; quality as its number (the label is the app's, one approved scale).
      const line = (out.report.days as { portions: Record<string, unknown>[] }[])[0]!.portions[0]!;
      expect(line).toMatchObject({ section: 'SABQI', paraNumber: 4, status: 'PARTIAL', quality: 2, assigned: { unit: 'PARA', numerator: 1, denominator: 1 }, completed: { unit: 'PARA', numerator: 1, denominator: 2 } });
      // Mistake counts by category; the day's overall label; attendance.
      expect((out.report.mistakes as { byCategory: Record<string, number> }).byCategory.TAJWEED).toBe(2);
      expect((out.report.days as Record<string, unknown>[])[0]!.overallLabel).toBe('GOOD');
      expect(out.report.attendance).toMatchObject({ counts: { present: 1 } });
      const body = JSON.stringify(out);
      expect(body).not.toContain('never-sent@example.test');
      expect(body).not.toContain('pendingChanges');
      expect(body).not.toContain('drafts');
    }
  });

  it('F10-AC17 (US-044) a pending portion links to confirmed homework only, never to a draft', () => {
    const r = asFields(week());
    const pending = (portionId: string, assignmentId: string, status: string) => ({ portionId, date: '2026-11-02', paraNumber: 4, range: null, assigned: null, completed: null, remaining: null, status: 'PARTIAL', carriedInto: { assignmentId, status, state: 'DUE' } });
    const sections = (r.sections as Record<string, unknown>[]).map((s) => ({ ...s, pending: [pending('p1', 'h-draft', 'DRAFT'), pending('p2', 'h-conf', 'CONFIRMED')] }));
    for (const audience of FAMILY) {
      const out = projectFor(audience, 'report', { ...r, sections }) as { sections: { pending: { carriedInto: unknown }[] }[] };
      expect(out.sections[0]!.pending.map((p) => p.carriedInto)).toEqual([null, { assignmentId: 'h-conf', state: 'DUE' }]);
      expect(JSON.stringify(out)).not.toContain('h-draft');
    }
  });
});

describe('F10 · note defaults', () => {
  it('F10-AC9 (US-046) a new note is private to staff by default', () => {
    expect(DEFAULT_NOTE_VISIBILITY).toBe('INTERNAL');
    expect([visibilityOrDefault(undefined), visibilityOrDefault(null), visibilityOrDefault('SHARED')]).toEqual(['INTERNAL', 'INTERNAL', 'SHARED']);
    // An attempt sent without a visibility, and a mistake note without one, are saved "Private to staff".
    const attempt = PortionAttemptCreateFields.parse({
      lessonPortionId: '0190f5c0-0000-7000-8000-000000000002',
      attemptNo: 1,
      attemptedAt: '2026-11-02T06:00:00.000Z',
      status: 'PARTIAL',
      completed: null,
      quality: null,
      noMistakes: false,
      mistakes: [],
      remarks: PRIVATE_REMARK,
    });
    expect(attempt.remarksVisibility).toBe('INTERNAL');
    expect(MistakeSchema.parse({ category: 'TAJWEED', severity: 'MINOR', repeated: false, note: PRIVATE_NOTE }).noteVisibility).toBe('INTERNAL');
    // A missing, unknown, or INTERNAL visibility never opens a note to a family (fail closed).
    expect([textForFamily(PRIVATE_REMARK, undefined), textForFamily(PRIVATE_REMARK, 'shared'), textForFamily(PRIVATE_REMARK, 'INTERNAL'), textForFamily('', 'SHARED')]).toEqual([null, null, null, null]);
    expect(textForFamily(SHARED_REMARK, 'SHARED')).toBe(SHARED_REMARK);
  });
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

describe('F14 · Excel export rows (new outbound channel)', () => {
  const row = (remarks: string, remarksVisibility: Vis) => ({
    externalRecordId: 'R-1',
    externalStudentId: 'EXT-A-001',
    recordDate: '2026-11-18',
    sessionLabel: null,
    section: 'SABQI',
    position: 1,
    paraNumber: 3,
    surahStart: null,
    ayahStart: null,
    surahEnd: null,
    ayahEnd: null,
    totalLines: null,
    assigned: 1,
    completed: 1,
    unit: 'HALF',
    mistakeCount: 2,
    status: 'COMPLETED',
    quality: 2,
    remarks,
    remarksVisibility,
    internalOnlyField: PRIVATE_NOTE,
  });

  it('F14-AC17 (US-061) a family export row never carries an internal note; a shared remark stays (AC-XLS-06)', () => {
    for (const audience of FAMILY) {
      const priv = projectFor(audience, 'export_daily_record_row', row(PRIVATE_REMARK, 'INTERNAL'));
      expect(JSON.stringify(priv)).not.toContain(PRIVATE_REMARK);
      expect(JSON.stringify(priv)).not.toContain(PRIVATE_NOTE);
      expect(priv).not.toHaveProperty('remarks');
      expect(priv).toMatchObject({ externalRecordId: 'R-1', status: 'COMPLETED', quality: 2, mistakeCount: 2, unit: 'HALF' });
      expect(projectFor(audience, 'export_daily_record_row', row(SHARED_REMARK, 'SHARED')).remarks).toBe(SHARED_REMARK);
    }
    expect(projectFor('STAFF', 'export_daily_record_row', row(PRIVATE_REMARK, 'INTERNAL')).remarks).toBe(PRIVATE_REMARK);
  });
});

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

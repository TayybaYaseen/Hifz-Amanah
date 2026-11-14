// F03 · Classes and students — mobile screen logic (docs/specs/06-f03-classes-students.md).
import { describe, expect, it } from 'vitest';
import { ApiFailure } from '../../api/client.ts';
import { errorKeys } from '../../api/errors.ts';
import { NO_FILTERS, filtersActive, parseOptionalDate, rosterFieldMessages, studentListPath, studentsEmptyState, toggleId } from './roster.ts';

describe('F03 · student list requests', () => {
  it('F03-AC19 (US-011) the list asks the server for 25 per page with search and filters applied there', () => {
    expect(studentListPath(NO_FILTERS)).toBe('/students?status=ACTIVE&limit=25');
    expect(studentListPath({ q: '  Zaid 0 ', classId: 'c1', status: 'ALL' }, 'abc')).toBe('/students?q=Zaid+0&classId=c1&status=ALL&limit=25&cursor=abc');
  });

  it('F03-AC8 (US-011) an empty result with filters shows "No matching students"; without filters, "No students yet"', () => {
    expect(studentsEmptyState(0, NO_FILTERS)).toBe('NONE');
    expect(studentsEmptyState(0, { ...NO_FILTERS, q: 'x' })).toBe('NO_MATCH');
    expect(studentsEmptyState(0, { ...NO_FILTERS, status: 'INACTIVE' })).toBe('NO_MATCH');
    expect(studentsEmptyState(3, { ...NO_FILTERS, q: 'x' })).toBeNull();
    expect(filtersActive({ ...NO_FILTERS, q: '   ' })).toBe(false);
  });
});

describe('F03 · forms', () => {
  it('F03-AC14 (US-010) / F03-AC7 (US-011) "already in use" names the class name or the External Student ID', () => {
    const name = errorKeys(new ApiFailure('VALIDATION', 400, { name: 'TAKEN' }));
    expect(rosterFieldMessages(name.fields)).toEqual({ name: 'classes.nameTaken' });
    const ext = errorKeys(new ApiFailure('VALIDATION', 400, { externalStudentId: 'TAKEN', name: 'REQUIRED' }));
    expect(rosterFieldMessages(ext.fields)).toEqual({ externalStudentId: 'students.externalIdTaken', name: 'fields.REQUIRED' });
  });

  it('F03-AC11 (US-012) move refusals map to their own messages', () => {
    const keys = errorKeys(new ApiFailure('VALIDATION', 400, { startDate: 'BEFORE_CURRENT_START', classId: 'SAME_CLASS' }));
    expect(keys.fields).toEqual({ startDate: 'fields.BEFORE_CURRENT_START', classId: 'fields.SAME_CLASS' });
  });

  it('F03-AC1 (US-010) teachers are toggled in and out of the class form', () => {
    expect(toggleId([], 't1')).toEqual(['t1']);
    expect(toggleId(['t1', 't2'], 't1')).toEqual(['t2']);
  });

  it('F03-AC17 (US-011) the admission date is optional and must be YYYY-MM-DD when given', () => {
    expect(parseOptionalDate('  ')).toEqual({ ok: true, value: null });
    expect(parseOptionalDate('2026-09-15')).toEqual({ ok: true, value: '2026-09-15' });
    expect(parseOptionalDate('15/09/2026')).toEqual({ ok: false });
  });
});

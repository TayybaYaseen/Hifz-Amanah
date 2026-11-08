// Roster screen logic (F03; US-010…012). Plain TypeScript, no React Native imports, so it is unit-tested with Vitest.
// The server applies search, filters, and paging (NFR-PERF-001); these helpers only build requests and pick messages.
import { STUDENT_PAGE_SIZE, type RosterStatus } from '@hifz/contracts';

export type StatusFilter = RosterStatus | 'ALL';

export interface StudentFilters {
  q: string;
  classId: string | null;
  status: StatusFilter;
}

export const NO_FILTERS: StudentFilters = { q: '', classId: null, status: 'ACTIVE' };

/** The list request for one page (25 per page, DEC-B59). */
export function studentListPath(filters: StudentFilters, cursor: string | null = null): string {
  const params = new URLSearchParams();
  const q = filters.q.trim();
  if (q) params.set('q', q);
  if (filters.classId) params.set('classId', filters.classId);
  params.set('status', filters.status);
  params.set('limit', String(STUDENT_PAGE_SIZE));
  if (cursor) params.set('cursor', cursor);
  return `/students?${params.toString()}`;
}

export const filtersActive = (filters: StudentFilters): boolean =>
  filters.q.trim() !== '' || filters.classId !== null || filters.status !== NO_FILTERS.status;

/**
 * Which empty state a finished, error-free list shows (F03 edge cases): "No matching students" with "Clear filters"
 * when filters are on, otherwise "No students yet".
 */
export function studentsEmptyState(count: number, filters: StudentFilters): 'NONE' | 'NO_MATCH' | null {
  if (count > 0) return null;
  return filtersActive(filters) ? 'NO_MATCH' : 'NONE';
}

/** Adds or removes a Teacher from the class form's selection. */
export function toggleId(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

/**
 * The message key for a roster field error. `fieldKey` comes from api/errors.ts (`fields.<ISSUE>`); "already in use"
 * names what is taken (F03-AC7, AC14).
 */
export function rosterFieldMessage(field: string, fieldKey: string): string {
  if (fieldKey === 'fields.TAKEN') return field === 'name' ? 'classes.nameTaken' : field === 'externalStudentId' ? 'students.externalIdTaken' : fieldKey;
  return fieldKey;
}

/** Field errors of a failed roster save, as message keys per field. */
export function rosterFieldMessages(fields: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(fields).map(([field, key]) => [field, rosterFieldMessage(field, key)]));
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** An optional date typed as YYYY-MM-DD: blank is null, a wrong shape is refused before sending. */
export function parseOptionalDate(text: string): { ok: true; value: string | null } | { ok: false } {
  const trimmed = text.trim();
  if (!trimmed) return { ok: true, value: null };
  return ISO_DATE.test(trimmed) ? { ok: true, value: trimmed } : { ok: false };
}

// F04 · Bulk Entry rules (FR-DAY-002A, FR-DAY-007, FR-CAL-010, NFR-UX-004; US-015). Pure rules, no I/O.
// Bulk Entry is attendance-only: a row holds one attendance mark and, when needed, the Leave reason or the
// Absent-after-reciting note. Nothing else.
import { defineFieldSpec } from '../sync/fields.ts';
import type { Mark } from './attendance.ts';

/**
 * Sync field classes of `attendance_record` (F12 plan Q5): status, Leave reason, and absence note are one coupled
 * meaningful group, so a merge never combines one side's status with the other side's reason. The scope keys
 * (student, class, date) are set on create only. The Leave status is derived by the server and is never sent.
 */
export const ATTENDANCE_FIELDS = defineFieldSpec({
  entity: 'attendance_record',
  groups: [['status', 'leaveReason', 'absentNote']],
});

/** One row of the sheet: the student's saved mark (if any) and what the Teacher has selected now. */
export interface BulkRow {
  studentId: string;
  /** The mark saved on the device or the server for this date, or null. */
  saved: Mark | null;
  /** What the Teacher selected in this session, or null when untouched. */
  draft: Mark | null;
}

/** The mark a row will save: the draft when the Teacher touched it, else nothing new. */
export const pendingMark = (row: BulkRow): Mark | null => row.draft;

/** True when the row holds a mark (saved or selected). */
export const isMarked = (row: BulkRow): boolean => row.draft !== null || row.saved !== null;

/**
 * "Mark all Present" (F04-AC7): fills Present only on rows with no mark at all. A student who already has attendance
 * for the date, or whom the Teacher has already marked, keeps that mark; nothing is overwritten.
 */
export function markAllPresent(rows: readonly BulkRow[]): BulkRow[] {
  return rows.map((row) => (isMarked(row) ? row : { ...row, draft: { status: 'PRESENT', leaveReason: null, absentNote: null } }));
}

/** Students with no mark at all: listed in the "N students not marked" dialog (FR-CAL-010, F04-AC8). */
export const unmarkedStudents = (rows: readonly BulkRow[]): string[] => rows.filter((r) => !isMarked(r)).map((r) => r.studentId);

/**
 * "Mark them Absent" (F04-AC8): explicit Absent drafts for exactly the listed students, chosen by the Teacher.
 * Only called after the Teacher picks that action; "Go back" changes nothing.
 */
export function markUnmarkedAbsent(rows: readonly BulkRow[], studentIds: readonly string[]): BulkRow[] {
  const ids = new Set(studentIds);
  return rows.map((row) => (ids.has(row.studentId) && !isMarked(row) ? { ...row, draft: { status: 'ABSENT', leaveReason: null, absentNote: null } } : row));
}

/** The result of one row after a save. */
export type RowOutcome = 'SAVED' | 'NEEDS_CORRECTION';

export interface BulkSummary {
  saved: number;
  needsCorrection: number;
  notMarked: number;
}

/** The result summary after a save: exact counts of saved and needs-correction rows (F04-AC9, design §4.8). */
export function bulkSummary(outcomes: Iterable<RowOutcome>, notMarked: number): BulkSummary {
  let saved = 0;
  let needsCorrection = 0;
  for (const outcome of outcomes) {
    if (outcome === 'SAVED') saved++;
    else needsCorrection++;
  }
  return { saved, needsCorrection, notMarked };
}

/** True when the draft differs from what is saved (only changed rows are sent). */
export function changed(row: BulkRow): boolean {
  if (!row.draft) return false;
  const s = row.saved;
  return !s || s.status !== row.draft.status || s.leaveReason !== row.draft.leaveReason || s.absentNote !== row.draft.absentNote;
}

// F04 · Attendance records, Leave, and counting (FR-CAL-003, FR-CAL-005, FR-CAL-007, FR-CAL-008, FR-CAL-009,
// FR-DAY-010, FR-DAY-011, FR-ATT-002; US-015…017). Pure rules, no I/O.
//
// Attendance is stored apart from performance: nothing here creates, reads, or implies a portion attempt, a failed
// recitation, or a quality value (F04-AC11, BR-6).
import type { DayKind } from './schedule.ts';

export const ATTENDANCE_STATUSES = ['PRESENT', 'LATE', 'HALF_DAY', 'LEAVE', 'ABSENT'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const LEAVE_STATUSES = ['NONE', 'REQUESTED', 'APPROVED', 'REJECTED'] as const;
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];

/** Free-text limits: the Leave reason and the Absent-after-reciting note (both internal). */
export const ATTENDANCE_TEXT_MAX = 500;

/** Roles as the calendar rules see them (a subset of @hifz/contracts Role). */
export type MarkingRole = 'OWNER' | 'ADMIN' | 'TEACHER';
export type AnyRole = MarkingRole | 'STUDENT' | 'PARENT';

/** Hifz portions may be recorded only for Present, Late, or Half day (FR-CAL-007, FR-DAY-011, F04-AC18). */
export const allowsHifz = (status: AttendanceStatus | null): boolean => status === 'PRESENT' || status === 'LATE' || status === 'HALF_DAY';

/** Owner and Admin decide Leave; their own Leave is approved at once (FR-CAL-008, F04-AC22). */
export const decidesLeave = (role: AnyRole): boolean => role === 'OWNER' || role === 'ADMIN';

/** What a user enters for one student on one date. */
export interface Mark {
  status: AttendanceStatus;
  leaveReason: string | null;
  absentNote: string | null;
}

/** The stored record as the rules need it. */
export interface AttendanceState extends Mark {
  leaveStatus: LeaveStatus;
}

const clean = (text: string | null | undefined): string | null => {
  const t = text?.trim();
  return t ? t : null;
};

/**
 * Keeps only the text that belongs to the status: a Leave reason only on LEAVE, an absence note only on ABSENT.
 * Blank text becomes null. Changing a student from Leave to Present therefore drops the reason.
 */
export function normalizeMark(mark: Mark): Mark {
  return {
    status: mark.status,
    leaveReason: mark.status === 'LEAVE' ? clean(mark.leaveReason) : null,
    absentNote: mark.status === 'ABSENT' ? clean(mark.absentNote) : null,
  };
}

/** Refusals of one mark, by field. A row with any refusal is not saved (F04-AC9, AC14, AC19, AC20). */
export type MarkIssue =
  | { field: 'reportDate'; code: 'FUTURE' | 'HOLIDAY' | 'CLOSURE' | 'NO_CLASS' | 'UNSCHEDULED' }
  | { field: 'studentId'; code: 'NOT_ENROLLED' }
  | { field: 'leaveReason'; code: 'REQUIRED' | 'TOO_LONG' }
  | { field: 'absentNote'; code: 'REQUIRED' | 'TOO_LONG' };

export interface MarkContext {
  reportDate: string;
  /** Today in the madrasa's timezone. Daily records are never for future dates (FR-DAY-001). */
  today: string;
  /** What the date is for the student's class (schedule.ts `dayInfo`). */
  dayKind: DayKind;
  /** The student is enrolled in the class on the date (F03 `classOn`). */
  enrolled: boolean;
  /** The student already has recited portions saved for the date (F05; FR-DAY-010). */
  recited: boolean;
}

/** Validates a normalized mark. Empty means it may be saved. */
export function validateMark(mark: Mark, ctx: MarkContext): MarkIssue[] {
  const issues: MarkIssue[] = [];
  if (ctx.reportDate > ctx.today) issues.push({ field: 'reportDate', code: 'FUTURE' });
  else if (ctx.dayKind !== 'SCHEDULED') issues.push({ field: 'reportDate', code: ctx.dayKind });
  if (!ctx.enrolled) issues.push({ field: 'studentId', code: 'NOT_ENROLLED' });
  if (mark.status === 'LEAVE') {
    if (!mark.leaveReason) issues.push({ field: 'leaveReason', code: 'REQUIRED' });
    else if (mark.leaveReason.length > ATTENDANCE_TEXT_MAX) issues.push({ field: 'leaveReason', code: 'TOO_LONG' });
  }
  if (mark.status === 'ABSENT') {
    if (needsAbsentNote(mark.status, ctx.recited) && !mark.absentNote) issues.push({ field: 'absentNote', code: 'REQUIRED' });
    else if (mark.absentNote && mark.absentNote.length > ATTENDANCE_TEXT_MAX) issues.push({ field: 'absentNote', code: 'TOO_LONG' });
  }
  return issues;
}

/** Absent for a student who already recited that day: suggest "Mark Late instead" (FR-DAY-010, F04-AC19). */
export const suggestsLate = (status: AttendanceStatus | null, recited: boolean): boolean => status === 'ABSENT' && recited;

/** Keeping Absent for a student who recited needs an internal note with the reason (FR-DAY-010). */
export const needsAbsentNote = (status: AttendanceStatus | null, recited: boolean): boolean => status === 'ABSENT' && recited;

/**
 * The Leave status a mark gets (FR-CAL-008):
 * - not LEAVE → NONE;
 * - LEAVE by an Owner/Admin → APPROVED at once (F04-AC22);
 * - LEAVE by a Teacher → REQUESTED (F04-AC13, AC21), unless it is the same Leave that was already decided and only
 *   other fields changed; a new reason, or turning a record into Leave, asks again.
 */
export function leaveStatusAfter(next: Mark, role: MarkingRole, previous: AttendanceState | null): LeaveStatus {
  if (next.status !== 'LEAVE') return 'NONE';
  if (decidesLeave(role)) return 'APPROVED';
  if (previous && previous.status === 'LEAVE' && previous.leaveReason === next.leaveReason) return previous.leaveStatus;
  return 'REQUESTED';
}

export type LeaveDecision = 'APPROVE' | 'REJECT';

export type DecideResult = { ok: true; leaveStatus: 'APPROVED' | 'REJECTED' } | { ok: false; code: 'FORBIDDEN' | 'NOT_AWAITING' };

/** An Owner or Admin approves or rejects a Leave awaiting a decision (F04-AC15, AC16); a Teacher cannot (AC17). */
export function decideLeave(record: AttendanceState, role: AnyRole, decision: LeaveDecision): DecideResult {
  if (!decidesLeave(role)) return { ok: false, code: 'FORBIDDEN' };
  if (record.status !== 'LEAVE' || record.leaveStatus !== 'REQUESTED') return { ok: false, code: 'NOT_AWAITING' };
  return { ok: true, leaveStatus: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED' };
}

/** How the record shows to staff: "Leave — awaiting approval", "Leave rejected" (F04-AC13, AC16). */
export type AttendanceLabel = AttendanceStatus | 'LEAVE_AWAITING' | 'LEAVE_REJECTED';

export function attendanceLabel(record: Pick<AttendanceState, 'status' | 'leaveStatus'>): AttendanceLabel {
  if (record.status !== 'LEAVE') return record.status;
  if (record.leaveStatus === 'REQUESTED') return 'LEAVE_AWAITING';
  if (record.leaveStatus === 'REJECTED') return 'LEAVE_REJECTED';
  return 'LEAVE';
}

// ---------- One student's day, and the period counts (FR-CAL-005) ----------

/**
 * What one student's date counts as:
 * - non-working days (HOLIDAY, CLOSURE, NO_CLASS, UNSCHEDULED) are never absences; a record saved before a holiday
 *   was declared is kept but excluded (F04-AC20);
 * - NOT_ENROLLED: the student was not in the class that day (mid-week enrollment, edge case);
 * - FUTURE: after today, nothing to count;
 * - NOT_MARKED: a scheduled day with no record. It is never an absence (FR-CAL-010, F04-AC8).
 */
export type DayCategory =
  | 'HOLIDAY'
  | 'CLOSURE'
  | 'NO_CLASS'
  | 'UNSCHEDULED'
  | 'NOT_ENROLLED'
  | 'FUTURE'
  | 'NOT_MARKED'
  | 'PRESENT'
  | 'LATE'
  | 'HALF_DAY'
  | 'LEAVE'
  | 'LEAVE_AWAITING'
  | 'ABSENT'
  | 'LEAVE_REJECTED';

export function dayCategory(input: {
  dayKind: DayKind;
  enrolled: boolean;
  date: string;
  today: string;
  record: Pick<AttendanceState, 'status' | 'leaveStatus'> | null;
}): DayCategory {
  if (input.dayKind !== 'SCHEDULED') return input.dayKind;
  if (!input.enrolled) return 'NOT_ENROLLED';
  if (input.date > input.today) return 'FUTURE';
  if (!input.record) return 'NOT_MARKED';
  return attendanceLabel(input.record);
}

export interface AttendanceCounts {
  /** Scheduled class days the student was enrolled for, up to today. */
  scheduled: number;
  /** Present + Late + Half day (FR-CAL-005). */
  attended: number;
  present: number;
  late: number;
  halfDay: number;
  /** Approved Leave: neither attended nor a normal absence. */
  leave: number;
  /** Leave still awaiting a decision: not yet counted either way. */
  leaveAwaiting: number;
  /** Absent plus rejected Leave. */
  absent: number;
  notMarked: number;
  holidays: number;
  closures: number;
  noClass: number;
  unscheduled: number;
}

export const emptyCounts = (): AttendanceCounts => ({
  scheduled: 0,
  attended: 0,
  present: 0,
  late: 0,
  halfDay: 0,
  leave: 0,
  leaveAwaiting: 0,
  absent: 0,
  notMarked: 0,
  holidays: 0,
  closures: 0,
  noClass: 0,
  unscheduled: 0,
});

/** Adds one day to the counts (FR-CAL-005). */
export function countDay(counts: AttendanceCounts, category: DayCategory): AttendanceCounts {
  const c = { ...counts };
  switch (category) {
    case 'HOLIDAY':
      c.holidays++;
      break;
    case 'CLOSURE':
      c.closures++;
      break;
    case 'NO_CLASS':
      c.noClass++;
      break;
    case 'UNSCHEDULED':
      c.unscheduled++;
      break;
    case 'NOT_ENROLLED':
    case 'FUTURE':
      break;
    case 'NOT_MARKED':
      c.scheduled++;
      c.notMarked++;
      break;
    case 'PRESENT':
      c.scheduled++;
      c.attended++;
      c.present++;
      break;
    case 'LATE':
      c.scheduled++;
      c.attended++;
      c.late++;
      break;
    case 'HALF_DAY':
      c.scheduled++;
      c.attended++;
      c.halfDay++;
      break;
    case 'LEAVE':
      c.scheduled++;
      c.leave++;
      break;
    case 'LEAVE_AWAITING':
      c.scheduled++;
      c.leaveAwaiting++;
      break;
    case 'ABSENT':
    case 'LEAVE_REJECTED':
      c.scheduled++;
      c.absent++;
      break;
  }
  return c;
}

export const countDays = (categories: Iterable<DayCategory>): AttendanceCounts => {
  let counts = emptyCounts();
  for (const category of categories) counts = countDay(counts, category);
  return counts;
};

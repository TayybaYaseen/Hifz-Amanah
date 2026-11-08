// F03 · Enrollment history and active status (FR-STU-002, FR-STU-004, FR-STU-006, DEC-B57). Pure rules, no I/O:
// the API and the app call these and never re-implement them.
//
// An enrollment covers the calendar dates start_date … end_date (inclusive); end_date null means open-ended.
// A student has at most one open enrollment, and the ranges of one student never overlap, so on any date a
// student is in at most one class. Enrolling a student who is already in a class is a move: the open enrollment
// ends the day before the new one starts (F03-AC11, F03-AC18).
import { addDays, compareDates } from './dates.ts';

export interface Enrollment {
  id: string;
  classId: string;
  startDate: string;
  endDate: string | null;
}

export type RosterStatus = 'ACTIVE' | 'INACTIVE';

/** True when the enrollment covers `date`. */
export function covers(enrollment: Pick<Enrollment, 'startDate' | 'endDate'>, date: string): boolean {
  return enrollment.startDate <= date && (enrollment.endDate === null || enrollment.endDate >= date);
}

/** The enrollment that applies on `date`, or null (F03-AC12: a date before a move gives the old class). */
export function enrollmentOn<E extends Enrollment>(enrollments: readonly E[], date: string): E | null {
  return enrollments.find((e) => covers(e, date)) ?? null;
}

/** The class a student was in on `date`, or null. */
export function classOn(enrollments: readonly Enrollment[], date: string): string | null {
  return enrollmentOn(enrollments, date)?.classId ?? null;
}

/** Every enrollment, oldest first (F03-AC13). Ties (never expected) fall back to the id for a stable order. */
export function enrollmentHistory<E extends Enrollment>(enrollments: readonly E[]): E[] {
  return [...enrollments].sort((a, b) => compareDates(a.startDate, b.startDate) || compareDates(a.id, b.id));
}

/** The open-ended enrollment, if any (at most one, DEC-B57). */
export function openEnrollment<E extends Enrollment>(enrollments: readonly E[]): E | null {
  return enrollments.find((e) => e.endDate === null) ?? null;
}

export type EnrollmentRefusal =
  /** The student's open enrollment is already in this class. */
  | 'SAME_CLASS'
  /** A move must start after the current enrollment started, or the old enrollment would end before it began. */
  | 'BEFORE_CURRENT_START'
  /** Without an open enrollment, the new one must start after every earlier enrollment ended. */
  | 'OVERLAPS_HISTORY';

export interface EnrollmentPlan {
  /** The open enrollment to close, and its new end date (the day before the new start). */
  end: { id: string; endDate: string } | null;
  start: { classId: string; startDate: string };
}

/**
 * What enrolling a student in `classId` from `startDate` changes (FR-STU-006). A future start date is allowed:
 * the student appears in the new class from that date (F03 edge cases).
 */
export function planEnrollment(
  enrollments: readonly Enrollment[],
  request: { classId: string; startDate: string },
): { ok: true; plan: EnrollmentPlan } | { ok: false; reason: EnrollmentRefusal } {
  const open = openEnrollment(enrollments);
  if (open) {
    if (open.classId === request.classId) return { ok: false, reason: 'SAME_CLASS' };
    if (request.startDate <= open.startDate) return { ok: false, reason: 'BEFORE_CURRENT_START' };
    return { ok: true, plan: { end: { id: open.id, endDate: addDays(request.startDate, -1) }, start: { ...request } } };
  }
  if (enrollments.some((e) => e.endDate !== null && e.endDate >= request.startDate)) return { ok: false, reason: 'OVERLAPS_HISTORY' };
  return { ok: true, plan: { end: null, start: { ...request } } };
}

/** Applies a plan to a history (what the database holds afterwards); `newId` names the new enrollment. */
export function applyPlan(enrollments: readonly Enrollment[], plan: EnrollmentPlan, newId: string): Enrollment[] {
  const closed = enrollments.map((e) => (plan.end && e.id === plan.end.id ? { ...e, endDate: plan.end.endDate } : e));
  return enrollmentHistory([...closed, { id: newId, classId: plan.start.classId, startDate: plan.start.startDate, endDate: null }]);
}

// ---------- Entry pickers and reports (F03-AC4, F03-AC9, F03-AC10) ----------

/** Daily Entry and Bulk Entry offer only active classes. A deactivated class keeps its history. */
export function pickerClasses<C extends { status: RosterStatus }>(classes: readonly C[]): C[] {
  return classes.filter((c) => c.status === 'ACTIVE');
}

/**
 * Whether a student may be picked for new entry in `classId` on `date`: the student is active, the class is
 * active, and the student's enrollment on that date is in that class.
 */
export function eligibleForEntry(
  student: { status: RosterStatus; enrollments: readonly Enrollment[] },
  klass: { id: string; status: RosterStatus },
  date: string,
): boolean {
  return student.status === 'ACTIVE' && klass.status === 'ACTIVE' && classOn(student.enrollments, date) === klass.id;
}

/**
 * Whether a student belongs in a report for the period `from` … `to` (inclusive) of a class (or of the madrasa when
 * `classId` is null): any enrollment overlapping the period counts, whatever the student's or class's status
 * today. Deactivation never removes a student from reports for earlier periods (FR-STU-004).
 */
export function inReportPeriod(enrollments: readonly Enrollment[], period: { from: string; to: string }, classId: string | null = null): boolean {
  return enrollments.some(
    (e) => (classId === null || e.classId === classId) && e.startDate <= period.to && (e.endDate === null || e.endDate >= period.from),
  );
}

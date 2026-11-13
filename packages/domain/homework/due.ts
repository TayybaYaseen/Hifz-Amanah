// F08 · Due dates, carried-over homework, next-class progress, and homework counts (FR-HW-004, FR-HW-015, FR-HW-016,
// FR-RPT-007, DEC-B30; US-036, US-038; F08-AC16, AC18, AC19). Pure rules, no I/O.
//
// - The due date defaults to the student's next scheduled class day after the assigned date: Sundays (not scheduled),
//   holidays, closures, and no-class days are skipped. Saturday's homework is due on Monday (F08-AC18).
// - Confirmed homework whose due day the student missed (Absent or Leave), or that became a non-class day, stays
//   outstanding and moves to the next class day, labelled "carried over" (F08-AC19). It is never failed, and the
//   confirmed assignment is never edited: the carried-over state is computed on read.
import type { AttendanceStatus } from '../calendar/attendance.ts';
import { dayInfo, isWorkingDay, type CalendarException, type DayKind, type ScheduleVersion } from '../calendar/schedule.ts';
import { latestAttempt } from '../hifz/progress.ts';
import type { PortionStatus } from '../hifz/status.ts';
import { addDays, compareDates, isCalendarDate } from '../roster/dates.ts';
import type { HomeworkStatus } from './lifecycle.ts';

/** How far ahead the next class day is searched (a long vacation still finds the next class). */
export const NEXT_CLASS_DAY_HORIZON = 120;

/** The first scheduled class day after `after`, or null when none falls within the horizon (no schedule). */
export function nextClassDay(
  classId: string,
  after: string,
  versions: readonly ScheduleVersion[],
  exceptions: readonly CalendarException[],
  horizon = NEXT_CLASS_DAY_HORIZON,
): string | null {
  if (!isCalendarDate(after)) throw new RangeError(`not a calendar date: ${after}`);
  for (let i = 1; i <= horizon; i++) {
    const d = addDays(after, i);
    if (isWorkingDay(dayInfo(classId, d, versions, exceptions).kind)) return d;
  }
  return null;
}

/** The default due date (FR-HW-004): the next class day after the assigned date. */
export const defaultDueDate = nextClassDay;

/** The due date may not be before the assigned date (F08 edge case). */
export function dueDateIssue(assignedDate: string, dueDate: string): 'DUE_BEFORE_ASSIGNED' | null {
  return compareDates(dueDate, assignedDate) < 0 ? 'DUE_BEFORE_ASSIGNED' : null;
}

export const CARRY_OVER_REASONS = ['ABSENT', 'LEAVE', 'HOLIDAY', 'CLOSURE', 'NO_CLASS', 'UNSCHEDULED'] as const;
export type CarryOverReason = (typeof CARRY_OVER_REASONS)[number];

export interface DayFacts {
  kind: DayKind;
  /** The student's attendance that day, or null when unmarked. */
  attendance: AttendanceStatus | null;
}

export interface CarryOver {
  /** The class day the homework is now due: the due date itself, or the next class day after the missed ones. */
  effectiveDueDate: string;
  /** Why it moved (the first missed day's reason), or null when it did not. */
  reason: CarryOverReason | null;
}

const missedReason = (facts: DayFacts): CarryOverReason | null => {
  if (!isWorkingDay(facts.kind)) return facts.kind as Exclude<DayKind, 'SCHEDULED'>;
  if (facts.attendance === 'ABSENT' || facts.attendance === 'LEAVE') return facts.attendance;
  return null;
};

/**
 * Where confirmed homework stands on `today` (F08-AC19, FR-HW-016). Walking from the due date up to today, every missed
 * day (not a class day, or the student Absent or on Leave) moves the homework to the next day; the first class day the
 * student attended (or that is still ahead) is the effective due date. Unmarked attendance on a past class day is not a
 * miss (nothing is guessed).
 */
export function carryOver(dueDate: string, today: string, dayOf: (date: string) => DayFacts, horizon = NEXT_CLASS_DAY_HORIZON): CarryOver {
  let reason: CarryOverReason | null = null;
  let d = dueDate;
  for (let i = 0; i <= horizon && compareDates(d, today) <= 0; i++) {
    const missed = missedReason(dayOf(d));
    if (missed === null) return { effectiveDueDate: d, reason };
    reason ??= missed;
    d = addDays(d, 1);
  }
  // Past today: the next day that is a class day (attendance not known yet) is where it is shown.
  for (let i = 0; i <= horizon; i++) {
    if (isWorkingDay(dayOf(d).kind)) return { effectiveDueDate: d, reason };
    reason ??= dayOf(d).kind as CarryOverReason;
    d = addDays(d, 1);
  }
  return { effectiveDueDate: d, reason };
}

// ---------- Next-class progress (FR-HW-015, F08-AC16) ----------

export interface LinkedAttempt {
  attemptNo: number;
  attemptedAt: string;
  status: PortionStatus;
}

export interface HomeworkPortionProgress {
  attempted: boolean;
  /** The latest linked attempt's status, or null when not attempted yet (never "failed"). */
  status: PortionStatus | null;
}

/** Progress of one homework portion from the attempts recorded against it (latest attempt decides). */
export function homeworkPortionProgress(linked: readonly LinkedAttempt[]): HomeworkPortionProgress {
  if (linked.length === 0) return { attempted: false, status: null };
  const ordered = [...linked].sort((a, b) => a.attemptedAt.localeCompare(b.attemptedAt) || a.attemptNo - b.attemptNo);
  const latest = latestAttempt(ordered.map((a, i) => ({ ...a, attemptNo: i + 1 })));
  return { attempted: true, status: latest?.status ?? null };
}

export const HOMEWORK_STATES = ['DRAFT', 'REJECTED', 'SUPERSEDED', 'UPCOMING', 'DUE', 'CARRIED_OVER', 'OUTSTANDING', 'ATTEMPTED'] as const;
export type HomeworkState = (typeof HOMEWORK_STATES)[number];

/**
 * The display state of an assignment. Confirmed homework is ATTEMPTED once every portion has a linked attempt;
 * otherwise UPCOMING, DUE (today), CARRIED_OVER, or OUTSTANDING (past its effective due date). Never "failed".
 */
export function homeworkState(
  a: { status: HomeworkStatus },
  portions: readonly HomeworkPortionProgress[],
  carry: CarryOver | null,
  today: string,
): HomeworkState {
  if (a.status !== 'CONFIRMED') return a.status === 'DRAFT' ? 'DRAFT' : a.status;
  if (portions.length > 0 && portions.every((p) => p.attempted)) return 'ATTEMPTED';
  if (carry?.reason) return 'CARRIED_OVER';
  const due = carry?.effectiveDueDate;
  if (!due) return 'OUTSTANDING';
  const c = compareDates(due, today);
  return c > 0 ? 'UPCOMING' : c === 0 ? 'DUE' : 'OUTSTANDING';
}

// ---------- Counts (FR-RPT-007, FR-MNR-005, F08-AC9) ----------

export interface HomeworkCounts {
  draft: number;
  confirmed: number;
  /** Confirmed portions with a linked next-class attempt. */
  attemptedPortions: number;
  /** Confirmed portions whose latest linked attempt is COMPLETED. */
  completedPortions: number;
  carriedOver: number;
}

/**
 * Homework counts, each kept separate (FR-RPT-007). REJECTED and SUPERSEDED assignments are not homework and count
 * nowhere (F08-AC9); a draft is never counted as confirmed.
 */
export function homeworkCounts(items: readonly { status: HomeworkStatus; state: HomeworkState; portions: readonly HomeworkPortionProgress[] }[]): HomeworkCounts {
  const out: HomeworkCounts = { draft: 0, confirmed: 0, attemptedPortions: 0, completedPortions: 0, carriedOver: 0 };
  for (const a of items) {
    if (a.status === 'DRAFT') out.draft += 1;
    if (a.status !== 'CONFIRMED') continue;
    out.confirmed += 1;
    if (a.state === 'CARRIED_OVER') out.carriedOver += 1;
    out.attemptedPortions += a.portions.filter((p) => p.attempted).length;
    out.completedPortions += a.portions.filter((p) => p.status === 'COMPLETED').length;
  }
  return out;
}

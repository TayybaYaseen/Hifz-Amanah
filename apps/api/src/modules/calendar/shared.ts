// Shared calendar loaders (F04): schedule versions, active exceptions, enrollments, and what a date is for a class.
// Every function runs inside the caller's tenant transaction (withTenant). The rules themselves live in
// @hifz/domain/calendar; this file only loads their inputs. Plan: docs/handover/F04-plan.md.
import { dayInfo, type CalendarException, type DayInfo, type ScheduleVersion, type Weekday } from '@hifz/domain/calendar';
import type { Enrollment } from '@hifz/domain/roster';
import type { Executor } from '../../platform/db.ts';

/** Non-superseded schedule versions of the given classes. */
export async function scheduleVersions(db: Executor, organizationId: string, classIds: readonly string[]): Promise<ScheduleVersion[]> {
  if (classIds.length === 0) return [];
  const rows = await db
    .selectFrom('class_schedules')
    .select(['class_id', 'effective_from', 'weekdays'])
    .where('organization_id', '=', organizationId)
    .where('class_id', 'in', classIds)
    .where('superseded_at', 'is', null)
    .execute();
  return rows.map((r) => ({ classId: r.class_id, effectiveFrom: r.effective_from, weekdays: r.weekdays.map(Number) as Weekday[] }));
}

/** Active (not cancelled) exceptions in a period: the madrasa's and, when given, those of the classes. */
export async function activeExceptions(
  db: Executor,
  organizationId: string,
  period: { from: string; to: string },
  classIds?: readonly string[],
): Promise<CalendarException[]> {
  let query = db
    .selectFrom('calendar_exceptions')
    .select(['id', 'class_id', 'date', 'kind', 'label'])
    .where('organization_id', '=', organizationId)
    .where('cancelled_at', 'is', null)
    .where('date', '>=', period.from)
    .where('date', '<=', period.to);
  if (classIds) {
    const ids = [...classIds];
    query = query.where((eb) => (ids.length ? eb.or([eb('class_id', 'is', null), eb('class_id', 'in', ids)]) : eb('class_id', 'is', null)));
  }
  const rows = await query.execute();
  return rows.map((r) => ({ id: r.id, classId: r.class_id, date: r.date, kind: r.kind, label: r.label }));
}

/** What `date` is for `classId` (F04-AC1…AC5, AC20). */
export async function dayFor(db: Executor, organizationId: string, classId: string, date: string): Promise<DayInfo> {
  const [versions, exceptions] = await Promise.all([
    scheduleVersions(db, organizationId, [classId]),
    activeExceptions(db, organizationId, { from: date, to: date }, [classId]),
  ]);
  return dayInfo(classId, date, versions, exceptions);
}

/** Every enrollment of the given students, keyed by student. */
export async function enrollmentsOf(db: Executor, organizationId: string, studentIds: readonly string[]): Promise<Map<string, Enrollment[]>> {
  const out = new Map<string, Enrollment[]>();
  if (studentIds.length === 0) return out;
  const rows = await db
    .selectFrom('student_enrollments')
    .select(['id', 'student_id', 'class_id', 'start_date', 'end_date'])
    .where('organization_id', '=', organizationId)
    .where('student_id', 'in', studentIds)
    .execute();
  for (const r of rows) {
    const list = out.get(r.student_id) ?? [];
    list.push({ id: r.id, classId: r.class_id, startDate: r.start_date, endDate: r.end_date });
    out.set(r.student_id, list);
  }
  return out;
}

/**
 * Whether the student has recited portions saved for the date (FR-DAY-010, F04-AC19): supplied by F05
 * (hifz/shared.ts `recitedPortions`: a non-removed portion with at least one attempt on that student and date).
 */
export type RecitedLookup = (db: Executor, organizationId: string, studentId: string, date: string) => Promise<boolean>;

/** Daily Hifz records on a date (F04-AC20): supplied by F05 (hifz/shared.ts `countDailyRecords`). */
export type DailyRecordCounter = (db: Executor, organizationId: string, date: string, classId: string | null) => Promise<number>;

/** "HH:MM:SS" from Postgres → "HH:MM". */
export const hhmm = (value: string | null): string | null => (value === null ? null : value.slice(0, 5));

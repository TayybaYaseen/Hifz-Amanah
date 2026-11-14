// F04 · Scheduled class days (FR-CAL-001, FR-CAL-002, FR-CAL-004, FR-CAL-006, FR-CAL-009; US-013, US-014).
// Pure rules, no I/O: the API and the app call these and never re-implement them.
//
// A calendar date is an ISO `YYYY-MM-DD` string in the madrasa's timezone (default Asia/Karachi); "today" is
// computed by the caller with `calendarDateIn` (packages/domain/roster). Weekday arithmetic is done in UTC on the
// date alone, so it never shifts with a timezone or DST.
//
// What a date is for one class:
// 1. A madrasa-wide exception (class null) wins over a class exception; within a level HOLIDAY > CLOSURE > NO_CLASS.
// 2. Otherwise the schedule version in force on that date decides: its weekdays are SCHEDULED, the rest UNSCHEDULED.
// 3. A class with no schedule version in force has no scheduled day.
// None of HOLIDAY, CLOSURE, NO_CLASS, or UNSCHEDULED is ever an absence (BR-7, FR-CAL-004).
import { addDays, isCalendarDate } from '../roster/dates.ts';

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export const WEEKDAYS: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 7];

export const WEEK_STARTS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as const;
export type WeekStart = (typeof WEEK_STARTS)[number];

export const EXCEPTION_KINDS = ['HOLIDAY', 'CLOSURE', 'NO_CLASS'] as const;
export type ExceptionKind = (typeof EXCEPTION_KINDS)[number];

export const DAY_KINDS = ['SCHEDULED', 'UNSCHEDULED', ...EXCEPTION_KINDS] as const;
export type DayKind = (typeof DAY_KINDS)[number];

/** One schedule version of a class: the weekdays it meets, from `effectiveFrom` until the next version starts. */
export interface ScheduleVersion {
  classId: string;
  effectiveFrom: string;
  weekdays: readonly Weekday[];
}

/** A holiday, closure, or no-class day: madrasa-wide when `classId` is null (FR-CAL-002). */
export interface CalendarException {
  id: string;
  classId: string | null;
  date: string;
  kind: ExceptionKind;
  label: string;
}

export interface DayInfo {
  date: string;
  kind: DayKind;
  /** The exception that made the day non-working, if any. */
  exception: CalendarException | null;
}

/** ISO weekday of a calendar date. */
export function weekdayOf(date: string): Weekday {
  if (!isCalendarDate(date)) throw new RangeError(`not a calendar date: ${date}`);
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return (js === 0 ? 7 : js) as Weekday;
}

const WEEK_START_DAY: Record<WeekStart, Weekday> = { MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4, FRIDAY: 5, SATURDAY: 6, SUNDAY: 7 };

/** The first and last date of the week holding `date` (weeks start on Monday unless the madrasa says otherwise). */
export function weekOf(date: string, weekStart: WeekStart = 'MONDAY'): { from: string; to: string } {
  const back = (weekdayOf(date) - WEEK_START_DAY[weekStart] + 7) % 7;
  const from = addDays(date, -back);
  return { from, to: addDays(from, 6) };
}

/** Every date from `from` to `to`, inclusive. Empty when `to` is before `from`. */
export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** The schedule version of `classId` in force on `date`: the latest one that started on or before it. */
export function versionOn(versions: readonly ScheduleVersion[], classId: string, date: string): ScheduleVersion | null {
  let best: ScheduleVersion | null = null;
  for (const v of versions) {
    if (v.classId !== classId || v.effectiveFrom > date) continue;
    if (!best || v.effectiveFrom > best.effectiveFrom) best = v;
  }
  return best;
}

const KIND_RANK: Record<ExceptionKind, number> = { HOLIDAY: 0, CLOSURE: 1, NO_CLASS: 2 };

/** The exception that applies to `classId` on `date`: madrasa-wide first, then the class's own. */
export function exceptionOn(exceptions: readonly CalendarException[], classId: string, date: string): CalendarException | null {
  const pick = (list: CalendarException[]) => list.sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind])[0] ?? null;
  const onDate = exceptions.filter((e) => e.date === date);
  return pick(onDate.filter((e) => e.classId === null)) ?? pick(onDate.filter((e) => e.classId === classId));
}

/** What `date` is for one class (F04-AC1…AC4). */
export function dayInfo(
  classId: string,
  date: string,
  versions: readonly ScheduleVersion[],
  exceptions: readonly CalendarException[],
): DayInfo {
  const exception = exceptionOn(exceptions, classId, date);
  if (exception) return { date, kind: exception.kind, exception };
  const version = versionOn(versions, classId, date);
  const scheduled = version !== null && version.weekdays.includes(weekdayOf(date));
  return { date, kind: scheduled ? 'SCHEDULED' : 'UNSCHEDULED', exception: null };
}

/** Each date of a period for one class. */
export function classDays(
  classId: string,
  period: { from: string; to: string },
  versions: readonly ScheduleVersion[],
  exceptions: readonly CalendarException[],
): DayInfo[] {
  return datesBetween(period.from, period.to).map((date) => dayInfo(classId, date, versions, exceptions));
}

/** A working day has class work; holidays, closures, no-class days, and unscheduled days do not (FR-CAL-009). */
export const isWorkingDay = (kind: DayKind): boolean => kind === 'SCHEDULED';

/** Normalizes a weekday list: unique, Monday first. */
export function normalizeWeekdays(days: Iterable<number>): Weekday[] {
  const set = new Set<number>();
  for (const d of days) {
    if (!Number.isInteger(d) || d < 1 || d > 7) throw new RangeError(`not a weekday: ${d}`);
    set.add(d);
  }
  return WEEKDAYS.filter((d) => set.has(d));
}

/** "HH:MM" on a 24-hour clock. */
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A class time range is valid when both ends are given and the end is after the start, or neither is given. */
export function validTimeRange(start: string | null, end: string | null): boolean {
  if (start === null && end === null) return true;
  if (start === null || end === null) return false;
  return TIME_PATTERN.test(start) && TIME_PATTERN.test(end) && start < end;
}

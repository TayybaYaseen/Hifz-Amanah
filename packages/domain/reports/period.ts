// F09 · Report periods (FR-RPT-003, FR-RPT-009, AC-RPT-07; US-039, US-040). Pure rules, no I/O.
//
// A report covers whole calendar dates in the madrasa's timezone (default Asia/Karachi). A weekly report runs from the
// configured week-start day (default Monday) 00:00 to the last day 23:59; a monthly report is the calendar month. A
// record belongs to the period of its `report_date` (the Teacher's date), never of its save or sync time.
import { weekOf, type WeekStart } from '../calendar/schedule.ts';
import { addDays, isCalendarDate } from '../roster/dates.ts';

export const PERIOD_KINDS = ['WEEK', 'MONTH'] as const;
export type PeriodKind = (typeof PERIOD_KINDS)[number];

export interface ReportPeriod {
  kind: PeriodKind;
  /** First calendar date, inclusive. */
  from: string;
  /** Last calendar date, inclusive. */
  to: string;
  timeZone: string;
  weekStart: WeekStart;
  /** The instant the period starts: `from` 00:00 in `timeZone`, as ISO UTC. */
  startsAt: string;
  /** The last minute of the period: `to` 23:59 in `timeZone`, as ISO UTC (the stated end, AC-RPT-07). */
  endsAt: string;
}

/** The calendar month holding `date`. */
export function monthOf(date: string): { from: string; to: string } {
  if (!isCalendarDate(date)) throw new RangeError(`not a calendar date: ${date}`);
  const from = `${date.slice(0, 7)}-01`;
  const [y, m] = date.split('-').map(Number) as [number, number];
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  return { from, to: addDays(next, -1) };
}

/** The offset of `timeZone` from UTC at `instant`, in minutes (Asia/Karachi: +300). */
function offsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - instant.getTime()) / 60000);
}

/**
 * The UTC instant of a wall-clock time on a calendar date in `timeZone`. Two passes settle the offset, so a DST change
 * on the date itself is handled (Asia/Karachi has none).
 */
export function zonedInstant(date: string, time: { hour: number; minute: number }, timeZone: string): string {
  if (!isCalendarDate(date)) throw new RangeError(`not a calendar date: ${date}`);
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const wall = Date.UTC(y, m - 1, d, time.hour, time.minute);
  let guess = wall - offsetMinutes(new Date(wall), timeZone) * 60000;
  guess = wall - offsetMinutes(new Date(guess), timeZone) * 60000;
  return new Date(guess).toISOString();
}

/** The weekly or monthly period that holds `date` (F09-AC1; FR-RPT-003). */
export function reportPeriod(kind: PeriodKind, date: string, options: { timeZone?: string; weekStart?: WeekStart } = {}): ReportPeriod {
  if (!isCalendarDate(date)) throw new RangeError(`not a calendar date: ${date}`);
  const timeZone = options.timeZone ?? 'Asia/Karachi';
  const weekStart = options.weekStart ?? 'MONDAY';
  const { from, to } = kind === 'WEEK' ? weekOf(date, weekStart) : monthOf(date);
  return {
    kind,
    from,
    to,
    timeZone,
    weekStart,
    startsAt: zonedInstant(from, { hour: 0, minute: 0 }, timeZone),
    endsAt: zonedInstant(to, { hour: 23, minute: 59 }, timeZone),
  };
}

/** The period before or after `period` (the report screen's previous/next). */
export function shiftPeriod(period: ReportPeriod, steps: -1 | 1): ReportPeriod {
  const anchor = steps < 0 ? addDays(period.from, -1) : addDays(period.to, 1);
  return reportPeriod(period.kind, anchor, { timeZone: period.timeZone, weekStart: period.weekStart });
}

/** Whether `date` falls in the period (inclusive). */
export const inPeriod = (period: { from: string; to: string }, date: string): boolean => date >= period.from && date <= period.to;

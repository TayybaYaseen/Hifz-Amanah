// Calendar dates for the roster (F03). A calendar date is an ISO `YYYY-MM-DD` string in the madrasa's timezone
// (ARCHITECTURE.md §6.1). Arithmetic is done in UTC on the date alone, so it never shifts with a timezone or DST.

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real calendar date written as YYYY-MM-DD (rejects 2026-02-30). */
export function isCalendarDate(value: string): boolean {
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

function assertDate(value: string): void {
  if (!isCalendarDate(value)) throw new RangeError(`not a calendar date: ${value}`);
}

/** `date` moved by `days` (negative moves back). */
export function addDays(date: string, days: number): string {
  assertDate(date);
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** The calendar date of `instant` in `timeZone` (an IANA name such as Asia/Karachi). */
export function calendarDateIn(instant: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
}

/** ISO dates compare correctly as strings; this names the intent. */
export const compareDates = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

// F09 · Report display rules (design.md §4.10, §5.8). Pure, tested with Vitest; the screen only renders their results.
// - Missing values read "Not recorded", never 0 (FR-RPT-009).
// - An average is the exact value to one decimal, the nearest score's label, and the number of ratings used:
//   "2.0 · Good (2 ratings)" (F09-AC7). Labels come from the one approved scale (quality.name.*).
// - Quantities keep their unit and are listed per unit, never added across units (F09-AC4).
// - Attendance categories are listed separately: attended with Late and Half day also on their own, Leave, normal
//   absence, holidays and no-class days (FR-CAL-005, F09-AC12, AC17).
import type { QuantityUnit } from '@hifz/domain/quantity';

export type Translate = (key: string, options?: Record<string, unknown>) => string;

export interface AverageLike {
  count: number;
  display: string | null;
  nearestScore: number | null;
}

/** "2.0 · Good (2 ratings)", or "Not recorded" when there were no ratings. */
export function averageText(avg: AverageLike, t: Translate, isolate: (s: string) => string = (s) => s): string {
  if (avg.count === 0 || avg.display === null || avg.nearestScore === null) return t('quality.notRecorded');
  return t('reports.qualityAverage', {
    value: isolate(avg.display),
    label: t(`quality.name.${avg.nearestScore}`),
    // A number, for the ICU plural ("1 rating", "2 ratings").
    count: avg.count,
  });
}

export interface QuantityLike {
  unit: QuantityUnit;
  numerator: number;
  denominator: number;
}

/** Per-unit totals as one line each ("12 lines", "3/4 Para"); "None" when the list is empty. */
export function totalsLines(list: readonly QuantityLike[], amount: (q: QuantityLike) => string, t: Translate): string[] {
  return list.length ? list.map((q) => amount(q)) : [t('reports.none')];
}

export interface AttendanceCountsLike {
  scheduled: number;
  attended: number;
  present: number;
  late: number;
  halfDay: number;
  leave: number;
  leaveAwaiting: number;
  absent: number;
  notMarked: number;
  holidays: number;
  closures: number;
  noClass: number;
  unscheduled: number;
}

export const ATTENDANCE_ROWS = ['scheduled', 'attended', 'present', 'late', 'halfDay', 'leave', 'leaveAwaiting', 'absent', 'notMarked', 'holidays', 'closures', 'noClass', 'unscheduled'] as const;
export type AttendanceRow = (typeof ATTENDANCE_ROWS)[number];

/**
 * The attendance lines to show: scheduled, attended, the parts of attended, Leave, normal absence always; the
 * awaiting/unmarked/non-class lines only when they occur, so a week never lists a column of zeros it does not need.
 */
export function attendanceRows(c: AttendanceCountsLike): { key: AttendanceRow; count: number }[] {
  const always: readonly AttendanceRow[] = ['scheduled', 'attended', 'present', 'late', 'halfDay', 'leave', 'absent'];
  return ATTENDANCE_ROWS.filter((k) => always.includes(k) || c[k] > 0).map((key) => ({ key, count: c[key] }));
}

export type ReportSource = 'SERVER' | 'DEVICE';

/**
 * Which report to show (NFR-OFF-008): the server's when it answers (authoritative); the device's, marked provisional,
 * when there is no connection.
 */
export const reportSource = (online: boolean, networkFailed: boolean): ReportSource => (online && !networkFailed ? 'SERVER' : 'DEVICE');

/** The banner for a report that may change: offline, or online with changes not yet on the server. */
export function provisionalNotice(input: { source: ReportSource; pendingChanges: number }): 'PROVISIONAL' | 'PENDING_CHANGES' | null {
  if (input.source === 'DEVICE') return 'PROVISIONAL';
  return input.pendingChanges > 0 ? 'PENDING_CHANGES' : null;
}

// ---------- F10 · Publishing (FR-RPT-010, F10-AC13, AC14) ----------

export type PublishBlock = 'OFFLINE' | 'UNSYNCED_CHANGES';

/**
 * Why this device must not publish right now, before any request: publishing needs a connection, and every change made
 * on this device must already be on the server (the server also refuses while a conflict for the period is open).
 */
export function publishBlock(input: { online: boolean; pendingChanges: number }): PublishBlock | null {
  if (!input.online) return 'OFFLINE';
  if (input.pendingChanges > 0) return 'UNSYNCED_CHANGES';
  return null;
}

export interface PublicationLike {
  publishedAt: string | null;
  updatedAt: string | null;
}

/** A class's publication at a glance: how many of its students' reports are published, of how many. */
export function publicationSummary(items: readonly PublicationLike[]): { published: number; total: number } {
  return { published: items.filter((i) => i.publishedAt !== null).length, total: items.length };
}

// F10 · Report publishing rules (FR-RPT-010, DEC-B33; F10-AC13…AC15). Pure, no I/O.
//
// - A Teacher (assigned classes) or an Owner/Admin publishes a weekly or monthly report, for a whole class or for one
//   student. Students and Parents see a period only once it is published (F10-AC3).
// - Publishing needs a connection (the app refuses offline before any request) and every change for the period already
//   on the server: the device's own unsynced changes, and any sync conflict still open for those students in the
//   period (a change the server has not applied yet), refuse it with the reason (F10-AC14).
// - A period that has not started yet cannot be published: there is nothing to show.
// - Later corrections update the published report; it then shows "Updated on …" (F10-AC15). The report is always
//   rebuilt from source, so the corrected values show at once; the fingerprint below tells whether what a family sees
//   differs from what was published.
import type { ReportPeriod } from './period.ts';
import type { StudentReport } from './build-report.ts';

export type PublishRefusal = 'UNSYNCED_CHANGES' | 'PERIOD_NOT_STARTED';

export interface PublishCheck {
  period: Pick<ReportPeriod, 'from'>;
  /** Today in the madrasa's timezone. */
  today: string;
  /** Changes on the publishing device that the server has not acknowledged yet (as the device reports them). */
  pendingChanges: number;
  /** Open sync conflicts for the period's students and dates (known to the server). */
  openConflicts: number;
}

/** Why publishing is refused, or null when it may go ahead. The first reason that applies wins. */
export function publishRefusal(c: PublishCheck): PublishRefusal | null {
  if (c.period.from > c.today) return 'PERIOD_NOT_STARTED';
  if (c.pendingChanges > 0 || c.openConflicts > 0) return 'UNSYNCED_CHANGES';
  return null;
}

/** JSON with object keys sorted (jsonb does not keep key order), for an exact comparison of two payloads. */
export function sortedKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, sortedKeys((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

type Json = Record<string, unknown>;
const rows = (value: unknown): Json[] => (Array.isArray(value) ? (value as Json[]) : []);

/**
 * The text whose hash is stored at publish time, from the report a family receives (already projected for them). Two
 * fingerprints differ when a source change altered what the family sees, and never only because a day passed:
 * - Callers build the report for this purpose as of `fingerprintDay(period, today)`, so days of the period never read
 *   "future" in one fingerprint and "not marked" in the next.
 * - `today`, the provisional state, and the homework figures computed against today (each assignment's state, carried
 *   over, outstanding) are left out. What was given, attempted, and completed stays in.
 */
export function publishedFingerprint(projected: Readonly<Json> | StudentReport): string {
  const { today: _today, provisional: _provisional, homework, sections, ...rest } = projected as Json;
  void _today;
  void _provisional;
  const hw = (homework ?? {}) as Json;
  const stable = {
    ...rest,
    sections: rows(sections).map((s) => ({ ...s, pending: rows(s.pending).map(({ carriedInto, ...p }) => ({ ...p, carriedInto: carriedInto ? (carriedInto as Json).assignmentId ?? null : null })) })),
    homework: { confirmed: hw.confirmed, assigned: hw.assigned, attempted: hw.attempted, completed: hw.completed, carriedForward: hw.carriedForward },
  };
  return JSON.stringify(sortedKeys(stable));
}

/** The day a fingerprint report is built for: the period's last day, or today once the period is over. */
export const fingerprintDay = (period: Pick<ReportPeriod, 'to'>, today: string): string => (today > period.to ? today : period.to);

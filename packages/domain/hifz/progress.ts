// F05 · Attempts, per-portion progress, and the per-section summary (FR-ATT-003…006, FR-DAY-005, FR-SBQ-002…004,
// FR-MNZ-002…004, FR-QTY-004, FR-QTY-005, BR-16; US-021…023; SRS AC-QTY-06, AC-ATT-05). Pure rules, no I/O.
//
// Attempts are append-only history. Current progress is the latest attempt's; the assigned quantity belongs to the
// portion and is counted once, however many attempts there are. Portions are never collapsed into one status, and
// totals are per unit only (no cross-unit sums, no conversion).
import { allowsHifz, type AttendanceStatus } from '../calendar/attendance.ts';
import { remaining, totalsByUnit, type Quantity } from '../quantity/quantity.ts';
import { SECTIONS, type Section } from '../quantity/sections.ts';
import type { PortionStatus } from './status.ts';

/** The attempt fields progress needs; stored attempts carry more (time, recorder, mistakes, remarks). */
export interface AttemptLike {
  attemptNo: number;
  status: PortionStatus;
  completed: Quantity | null;
  quality: number | null;
}

/** The latest attempt: the highest `attemptNo` (FR-ATT-005). Null when the portion has none yet. */
export function latestAttempt<T extends { attemptNo: number }>(attempts: readonly T[]): T | null {
  let best: T | null = null;
  for (const a of attempts) if (best === null || a.attemptNo > best.attemptNo) best = a;
  return best;
}

/** The next attempt number for a portion: one above the highest, from 1. Earlier attempts are never renumbered. */
export const nextAttemptNo = (attempts: readonly { attemptNo: number }[]): number => (latestAttempt(attempts)?.attemptNo ?? 0) + 1;

/** Attempts oldest first (history order; the current attempt is last). Does not change the input. */
export const attemptHistory = <T extends { attemptNo: number }>(attempts: readonly T[]): T[] => [...attempts].sort((a, b) => a.attemptNo - b.attemptNo);

export interface PortionProgress {
  /** The latest attempt's status; null when nothing was recorded yet (never read as zero or failure). */
  currentStatus: PortionStatus | null;
  /** The portion's assigned quantity, counted once (F05-AC16, BR-16). */
  assigned: Quantity;
  /** The latest attempt's completed quantity; null when not recorded. */
  completed: Quantity | null;
  /** max(0, assigned − completed) in the same unit; null when completed is unknown (FR-QTY-008). */
  remaining: Quantity | null;
  quality: number | null;
  attemptCount: number;
  /** The latest attempt's number, or null. */
  currentAttemptNo: number | null;
}

/**
 * Current progress of one portion (F05-AC16): status, completed, and quality from the latest attempt; assigned from
 * the portion, once. Remaining is never computed across units: a completed amount in another unit (never accepted by
 * validation) gives an unknown remaining instead of a conversion.
 */
export function portionProgress(portion: { assigned: Quantity }, attempts: readonly AttemptLike[]): PortionProgress {
  const latest = latestAttempt(attempts);
  const completed = latest?.completed ?? null;
  return {
    currentStatus: latest?.status ?? null,
    assigned: portion.assigned,
    completed,
    remaining: completed !== null && completed.unit === portion.assigned.unit ? remaining(portion.assigned, completed) : null,
    quality: latest?.quality ?? null,
    attemptCount: attempts.length,
    currentAttemptNo: latest?.attemptNo ?? null,
  };
}

/** A portion as the summary needs it. */
export interface SummaryPortion {
  id: string;
  section: Section;
  position: number;
  isExtra: boolean;
  paraNumber: number | null;
  assigned: Quantity;
  /** Removed portions keep their rows and attempts for audit but leave the record and its totals. */
  removed: boolean;
}

export interface SummaryPortionRow {
  id: string;
  position: number;
  isExtra: boolean;
  paraNumber: number | null;
  progress: PortionProgress;
}

export interface UnitTotals {
  /** Per unit, in canonical unit order; never summed across units (FR-QTY-004, AC-QTY-04). */
  assigned: Quantity[];
  /** Only portions whose completed amount is known; missing is never zero. */
  completed: Quantity[];
  remaining: Quantity[];
  /** Portions with no attempt yet. */
  notRecorded: number;
}

export interface SectionSummary {
  section: Section;
  /** Every non-removed portion, by position; each keeps its own status (F05-AC13, FR-MNZ-004). */
  portions: SummaryPortionRow[];
  /** Totals of the regular (non-Extra) portions. */
  totals: UnitTotals;
  /** Totals of Extra portions, kept apart from the assigned work (FR-QTY-006). */
  extraTotals: UnitTotals;
}

function totalsOf(rows: readonly SummaryPortionRow[]): UnitTotals {
  return {
    assigned: totalsByUnit(rows.map((r) => r.progress.assigned)),
    completed: totalsByUnit(rows.flatMap((r) => (r.progress.completed ? [r.progress.completed] : []))),
    remaining: totalsByUnit(rows.flatMap((r) => (r.progress.remaining ? [r.progress.remaining] : []))),
    notRecorded: rows.filter((r) => r.progress.currentStatus === null).length,
  };
}

/**
 * The record's sections in Sabaq, Sabqi, Manzil order (F05-AC13): each lists its portions separately, with current
 * progress from the latest attempt, plus per-unit totals. Removed portions are excluded; Extra portions are listed
 * (flagged) and totalled apart.
 */
export function sectionSummary(entries: readonly { portion: SummaryPortion; attempts: readonly AttemptLike[] }[]): SectionSummary[] {
  return SECTIONS.map((section) => {
    const rows = entries
      .filter((e) => e.portion.section === section && !e.portion.removed)
      .sort((a, b) => a.portion.position - b.portion.position)
      .map(
        (e): SummaryPortionRow => ({
          id: e.portion.id,
          position: e.portion.position,
          isExtra: e.portion.isExtra,
          paraNumber: e.portion.paraNumber,
          progress: portionProgress(e.portion, e.attempts),
        }),
      );
    return {
      section,
      portions: rows,
      totals: totalsOf(rows.filter((r) => !r.isExtra)),
      extraTotals: totalsOf(rows.filter((r) => r.isExtra)),
    };
  });
}

/**
 * The Para a new Sabqi portion defaults to (F05-AC12, FR-SBQ-003): the derived Para of the current Sabaq — the last
 * non-removed Sabaq portion that has one. Null when there is none. A default only; the Teacher may pick any Para.
 */
export function sabqiDefaultPara(sabaqPortions: readonly { position: number; paraNumber: number | null; removed?: boolean }[]): number | null {
  const withPara = sabaqPortions.filter((p) => !p.removed && p.paraNumber !== null).sort((a, b) => a.position - b.position);
  return withPara.at(-1)?.paraNumber ?? null;
}

export const PORTIONS_ALLOWED = ['ALLOWED', 'CHANGE_TO_LATE', 'ATTENDANCE_REQUIRED'] as const;
export type PortionsAllowed = (typeof PORTIONS_ALLOWED)[number];

/**
 * Whether Hifz portions may be added for the student's attendance on the date (FR-DAY-011, FR-CAL-007, F05-AC18):
 * Present, Late, Half day → ALLOWED; Absent or Leave → CHANGE_TO_LATE (Daily Entry offers "Change to Late");
 * unmarked → ATTENDANCE_REQUIRED (plan §7.5).
 */
export function portionsAllowed(attendance: AttendanceStatus | null): PortionsAllowed {
  if (attendance === null) return 'ATTENDANCE_REQUIRED';
  return allowsHifz(attendance) ? 'ALLOWED' : 'CHANGE_TO_LATE';
}

// F05 · Portion statuses and attempt normalization (FR-ATT-001…008, FR-ATT-011, FR-QTY-007, FR-QTY-008, FR-SAB-004,
// BR-6; US-018, US-022, US-023; SRS AC-ATT-01…03). Pure rules, no I/O.
//
// Missing data is never zero: a missing completed quantity stays null except where FR-QTY-007 (NOT_REMEMBERED → 0)
// or the approved F05 assumption (COMPLETED → the assigned quantity, plan §7.2) gives a default; a missing quality
// stays null; a missing mistake list is "not recorded", and only an explicit "No mistakes" is a count of 0.
import { isQuantity, quantity, zero, type Quantity } from '../quantity/quantity.ts';

export const PORTION_STATUSES = ['COMPLETED', 'PARTIAL', 'NOT_REMEMBERED', 'ABSENT', 'NOT_ASSIGNED', 'PENDING'] as const;
export type PortionStatus = (typeof PORTION_STATUSES)[number];

/** Statuses that carry no quality rating and are never failure or zero quality (FR-ATT-007, AGENTS §5.5). */
export const NO_QUALITY_STATUSES = ['ABSENT', 'NOT_ASSIGNED', 'PENDING'] as const satisfies readonly PortionStatus[];
export type NoQualityStatus = (typeof NO_QUALITY_STATUSES)[number];

/** Outcomes of an actual recitation: the student recited (fully, partly, or could not remember). */
export const RECITATION_STATUSES = ['COMPLETED', 'PARTIAL', 'NOT_REMEMBERED'] as const satisfies readonly PortionStatus[];

export const isPortionStatus = (value: unknown): value is PortionStatus =>
  typeof value === 'string' && (PORTION_STATUSES as readonly string[]).includes(value);

/** False for ABSENT, NOT_ASSIGNED, and PENDING: no quality is entered or counted (F05-AC5, FR-ATT-007). */
export const allowsQuality = (status: PortionStatus): boolean => !(NO_QUALITY_STATUSES as readonly string[]).includes(status);

/** True when the status is a recitation outcome (COMPLETED, PARTIAL, NOT_REMEMBERED). */
export const isRecitation = (status: PortionStatus): boolean => (RECITATION_STATUSES as readonly string[]).includes(status);

/**
 * An unsuccessful recitation. Only NOT_REMEMBERED is one; PARTIAL is partial progress, and ABSENT, NOT_ASSIGNED, and
 * PENDING are never failure (FR-ATT-002, FR-ATT-007, AC-ATT-02, AC-ATT-03).
 */
export const isFailure = (status: PortionStatus): boolean => status === 'NOT_REMEMBERED';

/** Quality Rating Scale bounds (FR-ATT-008, FR-ATT-009; lower is better). Labels are F07's and the app's. */
export const QUALITY_MIN = 1;
export const QUALITY_MAX = 5;

/** An integer 1–5. 0, 6, 2.5, and non-numbers are not scores. */
export const isQualityScore = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= QUALITY_MIN && value <= QUALITY_MAX;

/** Free-text limit of an attempt's remarks (internal staff text; matches the F04 text limit). */
export const REMARKS_MAX = 500;
/** Mistakes one attempt may carry. */
export const MISTAKES_MAX = 50;

export interface AttemptOutcome {
  status: PortionStatus;
  /** The portion's assigned quantity (null only when the portion itself is incomplete). */
  assigned: Quantity | null;
  completed: Quantity | null;
  quality: number | null;
}

export type AttemptIssue =
  | { field: 'quality'; code: 'QUALITY_NOT_ALLOWED' }
  | { field: 'quality'; code: 'OUT_OF_RANGE'; min: number; max: number };

export interface NormalizedAttempt {
  status: PortionStatus;
  completed: Quantity | null;
  quality: number | null;
  /** Non-empty means the attempt is refused; the caller keeps what the user entered. */
  issues: AttemptIssue[];
  /** Completed was filled in by a default (FR-QTY-007 / plan §7.2), not entered. The UI shows it pre-filled. */
  completedDefaulted: boolean;
}

/**
 * Applies the status defaults to an attempt (F05-AC14, AC22, AC-ATT-01):
 * - NOT_REMEMBERED with no completed → 0 in the assigned unit, so remaining = assigned;
 * - COMPLETED with no completed → the assigned quantity (plan §7.2);
 * - every other case keeps what was entered, and a missing completed stays null (FR-QTY-008).
 * Quality on ABSENT, NOT_ASSIGNED, or PENDING, or outside 1–5, is an issue; it is never silently dropped or zeroed.
 */
export function normalizeAttempt(input: AttemptOutcome): NormalizedAttempt {
  const issues: AttemptIssue[] = [];
  if (input.quality !== null) {
    if (!allowsQuality(input.status)) issues.push({ field: 'quality', code: 'QUALITY_NOT_ALLOWED' });
    else if (!isQualityScore(input.quality)) issues.push({ field: 'quality', code: 'OUT_OF_RANGE', min: QUALITY_MIN, max: QUALITY_MAX });
  }
  let completed = input.completed;
  let completedDefaulted = false;
  // A malformed assigned quantity gets no default; the portion validation reports it.
  if (completed === null && input.assigned !== null && isQuantity(input.assigned)) {
    if (input.status === 'NOT_REMEMBERED') {
      completed = zero(input.assigned.unit);
      completedDefaulted = true;
    } else if (input.status === 'COMPLETED') {
      completed = quantity(input.assigned.unit, input.assigned.numerator, input.assigned.denominator);
      completedDefaulted = true;
    }
  }
  return { status: input.status, completed, quality: input.quality, issues, completedDefaulted };
}

// ---------- Mistakes (shape; notes, visibility, and counts are @hifz/domain/mistakes, F07) ----------

export const MISTAKE_CATEGORIES = ['HARKAAT', 'TAJWEED', 'LAFZI', 'AYAT_BHOOLNA', 'TARTEEB', 'WAQF_IBTIDA'] as const;
export type MistakeCategory = (typeof MISTAKE_CATEGORIES)[number];

/** Severity only; `repeated` is a separate flag, never a severity (FR-ATT-010). */
export const MISTAKE_SEVERITIES = ['MINOR', 'MAJOR'] as const;
export type MistakeSeverity = (typeof MISTAKE_SEVERITIES)[number];

export interface MistakeEntry {
  category: MistakeCategory;
  severity: MistakeSeverity;
  repeated: boolean;
  /** Optional short note (F07, FR-ATT-012; at most MISTAKE_NOTE_MAX). Internal staff text unless SHARED. */
  note?: string | null;
  /** INTERNAL (default, staff only) or SHARED (also shown to the Student and Parent). */
  noteVisibility?: 'INTERNAL' | 'SHARED';
}

/** Longest mistake note, in characters (DEC-B86, FR-ATT-012). */
export const MISTAKE_NOTE_MAX = 200;

/**
 * The attempt's mistake count (FR-ATT-011): the number of mistakes when any are listed, 0 only when "No mistakes" was
 * chosen, and null ("not recorded") for an empty list without that choice. Never 0 by default.
 */
export function mistakeCount(attempt: { noMistakes: boolean; mistakes: readonly MistakeEntry[] }): number | null {
  if (attempt.mistakes.length > 0) return attempt.mistakes.length;
  return attempt.noMistakes ? 0 : null;
}

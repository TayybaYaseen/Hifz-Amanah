// F08 · The homework suggestion engine (FR-HW-005, FR-HW-006, FR-HW-013, FR-HW-014, FR-HW-018, FR-QTY-005, BR-5, BR-6;
// ARCHITECTURE.md §9.2; US-034, US-035; SRS AC-HW-01, AC-HW-08…10). Pure rules, no I/O.
//
// suggest(source portions with their attempts, attempts already carried forward) → suggested draft portions.
// - Only the LATEST attempt of each portion decides (FR-ATT-005); earlier attempts never add a second suggestion and the
//   assigned quantity is counted once.
// - Eligible: the latest attempt is PARTIAL or NOT_REMEMBERED. ABSENT, NOT_ASSIGNED, PENDING (never failure, FR-HW-013)
//   and COMPLETED are not suggested.
// - Remaining = max(0, assigned − completed), same portion and same unit only. A remaining of 0 is not suggested.
//   Different units, or a completed amount that was not recorded, give NO remaining (never a conversion, never "all
//   of it"): the portion is suggested without a quantity and flagged for the Teacher to review (F08-AC4).
// - Sabaq keeps its Surah, Ayat range, Total Lines, and edition and assigns the remaining LINES (FR-HW-018). Sabqi and
//   Manzil keep their Para, range, and unit.
// - Every suggestion links its source attempt and lesson portion, and the homework portion that lesson portion was
//   recorded against, if any (FR-HW-014).
import { latestAttempt } from '../hifz/progress.ts';
import type { PortionStatus } from '../hifz/status.ts';
import { quantity, subtractFloor, type Quantity } from '../quantity/quantity.ts';
import { SECTIONS, type Section } from '../quantity/sections.ts';

/** Latest-attempt statuses that make a portion eligible for carry-forward (ARCHITECTURE §9.2). */
export const CARRY_FORWARD_STATUSES = ['PARTIAL', 'NOT_REMEMBERED'] as const satisfies readonly PortionStatus[];

export interface HomeworkRange {
  surahStart: number;
  ayahStart: number;
  surahEnd: number;
  ayahEnd: number;
}

/** One attempt as the engine needs it. `rowVersion` is carried through for the confirmation source check. */
export interface SourceAttempt {
  id: string;
  attemptNo: number;
  status: PortionStatus;
  completed: Quantity | null;
  rowVersion?: number | null;
}

/** One lesson portion of a daily record, with its attempts. */
export interface SourcePortion {
  id: string;
  section: Section;
  position: number;
  isExtra: boolean;
  removed: boolean;
  paraNumber: number | null;
  range: HomeworkRange | null;
  /** Sabaq only. */
  totalLines: number | null;
  lineCountEdition?: string | null;
  assigned: Quantity;
  /** The homework portion this lesson portion was recorded against (FR-HW-015), if any. */
  homeworkPortionId: string | null;
  rowVersion?: number | null;
  attempts: readonly SourceAttempt[];
}

export type RemainingResult =
  | { kind: 'REMAINING'; quantity: Quantity }
  /** Assigned and completed are in different units: nothing is computed (FR-QTY-004, F08-AC4). */
  | { kind: 'UNIT_MISMATCH' }
  /** The completed amount was not recorded: remaining is unknown, never "all of it" (FR-QTY-008). */
  | { kind: 'UNKNOWN' };

/** Remaining work on ONE portion: same unit only (FR-QTY-005, BR-5). */
export function remainingOf(assigned: Quantity, completed: Quantity | null): RemainingResult {
  if (completed === null) return { kind: 'UNKNOWN' };
  if (completed.unit !== assigned.unit) return { kind: 'UNIT_MISMATCH' };
  return { kind: 'REMAINING', quantity: subtractFloor(assigned, completed) };
}

/** True for PARTIAL and NOT_REMEMBERED (FR-HW-013: ABSENT, NOT_ASSIGNED, PENDING are never failed work). */
export const carriesForward = (status: PortionStatus): boolean => (CARRY_FORWARD_STATUSES as readonly string[]).includes(status);

export interface SuggestedPortion {
  sourceLessonPortionId: string;
  sourceAttemptId: string;
  /** The homework portion the source lesson portion was recorded against (a carried-forward chain), or null. */
  sourceHomeworkPortionId: string | null;
  section: Section;
  /** Number within its section in this suggestion, from 1. */
  position: number;
  paraNumber: number | null;
  range: HomeworkRange | null;
  /** Sabaq: the source's Total Lines, unchanged (FR-HW-018). */
  totalLines: number | null;
  lineCountEdition: string | null;
  /** The remaining quantity to assign, or null when it cannot be computed (needsReview). */
  assigned: Quantity | null;
  /** No remaining could be computed (unit mismatch or completed not recorded): the Teacher must set it (F08-AC4). */
  needsReview: boolean;
  /** Why it was suggested (design.md §4.9 "explanation"): the source's status and quantities. */
  why: { status: PortionStatus; assigned: Quantity; completed: Quantity | null; reason: 'REMAINING' | 'UNIT_MISMATCH' | 'UNKNOWN' };
  /** Row versions of the source, for the offline confirmation check (FR-HW-017). */
  sourceVersions: { lessonPortion: number | null; attempt: number | null };
}

export interface SuggestInput {
  portions: readonly SourcePortion[];
  /** Attempt ids already carried forward by another live (draft or confirmed) assignment: not suggested twice. */
  alreadyCarried?: ReadonlySet<string>;
}

const SECTION_ORDER: Record<Section, number> = { SABAQ: 0, SABQI: 1, MANZIL: 2 };

const copy = (q: Quantity): Quantity => quantity(q.unit, q.numerator, q.denominator);

/** One portion's suggestion, or null when it is not eligible. */
export function suggestFor(portion: SourcePortion, alreadyCarried: ReadonlySet<string> = new Set()): Omit<SuggestedPortion, 'position'> | null {
  // Removed portions left the record; Extra work beyond the assignment is not owed (FR-QTY-006).
  if (portion.removed || portion.isExtra) return null;
  const latest = latestAttempt(portion.attempts);
  if (latest === null || !carriesForward(latest.status) || alreadyCarried.has(latest.id)) return null;
  const rem = remainingOf(portion.assigned, latest.completed);
  if (rem.kind === 'REMAINING' && rem.quantity.numerator === 0) return null;
  const sabaq = portion.section === 'SABAQ';
  return {
    sourceLessonPortionId: portion.id,
    sourceAttemptId: latest.id,
    sourceHomeworkPortionId: portion.homeworkPortionId,
    section: portion.section,
    paraNumber: portion.paraNumber,
    range: portion.range ? { ...portion.range } : null,
    totalLines: sabaq ? portion.totalLines : null,
    lineCountEdition: sabaq ? (portion.lineCountEdition ?? null) : null,
    assigned: rem.kind === 'REMAINING' ? rem.quantity : null,
    needsReview: rem.kind !== 'REMAINING',
    why: { status: latest.status, assigned: copy(portion.assigned), completed: latest.completed ? copy(latest.completed) : null, reason: rem.kind },
    sourceVersions: { lessonPortion: portion.rowVersion ?? null, attempt: latest.rowVersion ?? null },
  };
}

/**
 * The suggested next assignment (F08-AC3…AC6, AC22): eligible portions in Sabaq, Sabqi, Manzil order, then by their
 * source position, numbered from 1 within each section. Empty means "Nothing to carry forward".
 */
export function suggest(input: SuggestInput): SuggestedPortion[] {
  const carried = input.alreadyCarried ?? new Set<string>();
  const picked = [...input.portions]
    .sort((a, b) => SECTION_ORDER[a.section] - SECTION_ORDER[b.section] || a.position - b.position || a.id.localeCompare(b.id))
    .flatMap((p) => {
      const s = suggestFor(p, carried);
      return s ? [s] : [];
    });
  return SECTIONS.flatMap((section) => picked.filter((s) => s.section === section).map((s, i) => ({ ...s, position: i + 1 })));
}

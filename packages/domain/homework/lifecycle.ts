// F08 · The homework lifecycle (FR-HW-007…012, FR-HW-017, BR-9…11; ARCHITECTURE.md §9.2; US-036…038; SRS AC-HW-02…07).
// Pure rules, no I/O.
//
//   DRAFT ──Teacher edits/adds/removes──▶ DRAFT ──explicit confirm──▶ CONFIRMED ──explicit revise (Owner/Admin)──▶ SUPERSEDED
//     └──reject──▶ REJECTED                                              (a new CONFIRMED assignment, revision_of → old)
//
// Nothing here confirms on its own: there is no time- or schedule-based transition (F08-AC11). Confirmed assignments are
// immutable; a source correction rebuilds DRAFT portions only (F08-AC14), and a confirmed assignment changes only through
// an explicit revision that creates a new one (F08-AC15).
import { validatePortionFields, type PortionFieldError, type RangeReference } from '../hifz/portion.ts';
import type { Quantity } from '../quantity/quantity.ts';
import type { Section } from '../quantity/sections.ts';
import { defineFieldSpec } from '../sync/fields.ts';
import type { HomeworkRange, SuggestedPortion } from './suggest.ts';

export const HOMEWORK_STATUSES = ['DRAFT', 'CONFIRMED', 'SUPERSEDED', 'REJECTED'] as const;
export type HomeworkStatus = (typeof HOMEWORK_STATUSES)[number];

/** Where a draft portion came from (F08-AC8, AC-HW-02). */
export const PORTION_ORIGINS = ['SUGGESTED', 'TEACHER_EDITED', 'TEACHER_ADDED'] as const;
export type PortionOrigin = (typeof PORTION_ORIGINS)[number];

/** General and per-portion instructions (the F05 remarks limit). */
export const HOMEWORK_INSTRUCTIONS_MAX = 500;
/** Portions one assignment may hold. */
export const HOMEWORK_PORTIONS_MAX = 30;

export interface HomeworkPortion {
  id: string;
  section: Section;
  position: number;
  paraNumber: number | null;
  range: HomeworkRange | null;
  totalLines: number | null;
  lineCountEdition?: string | null;
  /** Null only on a suggested portion that needs review (no remaining could be computed). */
  assigned: Quantity | null;
  needsReview: boolean;
  origin: PortionOrigin;
  sourceAttemptId: string | null;
  sourceLessonPortionId: string | null;
  sourceHomeworkPortionId: string | null;
  instructions: string | null;
  /** Removed from the draft by the Teacher, or by a rebuild; the row is kept (no hard delete). */
  removed: boolean;
}

export interface HomeworkAssignment {
  id: string;
  studentId: string;
  status: HomeworkStatus;
  assignedDate: string;
  dueDate: string;
  instructions: string | null;
  createdBy: string;
  confirmedBy: string | null;
  confirmedAt: string | null;
  revisionOf: string | null;
  portions: HomeworkPortion[];
}

const ALLOWED: Record<HomeworkStatus, readonly HomeworkStatus[]> = {
  DRAFT: ['CONFIRMED', 'REJECTED'],
  CONFIRMED: ['SUPERSEDED'],
  SUPERSEDED: [],
  REJECTED: [],
};

/** Allowed status changes. CONFIRMED → SUPERSEDED happens only through a revision. */
export const canTransition = (from: HomeworkStatus, to: HomeworkStatus): boolean => ALLOWED[from].includes(to);

/** Draft and confirmed homework is live; rejected and superseded homework is not counted (F08-AC9). */
export const isLive = (status: HomeworkStatus): boolean => status === 'DRAFT' || status === 'CONFIRMED';

/** Only a draft may be edited, rejected, or confirmed (BR-9, FR-HW-012). */
export const isEditable = (status: HomeworkStatus): boolean => status === 'DRAFT';

export class HomeworkTransitionError extends Error {
  readonly from: HomeworkStatus;
  readonly to: HomeworkStatus;
  constructor(from: HomeworkStatus, to: HomeworkStatus) {
    super(`Homework cannot go from ${from} to ${to}`);
    this.name = 'HomeworkTransitionError';
    this.from = from;
    this.to = to;
  }
}

const transition = (a: HomeworkAssignment, to: HomeworkStatus): void => {
  if (!canTransition(a.status, to)) throw new HomeworkTransitionError(a.status, to);
};

export type ConfirmIssue =
  | { portionId: null; field: 'portions'; code: 'REQUIRED' | 'TOO_MANY' }
  /** A portion still has no quantity (it needs review), or fails the F05 portion rules. */
  | { portionId: string; field: string; code: string };

/**
 * What stops a draft from being confirmed: no active portion, a portion without a quantity (needs review), or a
 * portion failing the section rules. Empty means it may be confirmed. All-or-nothing: one bad portion confirms nothing
 * (F08-AC12).
 */
export function confirmIssues(portions: readonly HomeworkPortion[], ref?: RangeReference | null): ConfirmIssue[] {
  const active = portions.filter((p) => !p.removed);
  if (active.length === 0) return [{ portionId: null, field: 'portions', code: 'REQUIRED' }];
  if (active.length > HOMEWORK_PORTIONS_MAX) return [{ portionId: null, field: 'portions', code: 'TOO_MANY' }];
  const issues: ConfirmIssue[] = [];
  for (const p of active) {
    if (p.assigned === null) {
      issues.push({ portionId: p.id, field: 'assigned', code: 'REQUIRED' });
      continue;
    }
    issues.push(...portionIssues(p, ref).map((e) => ({ portionId: p.id, field: e.field, code: e.code })));
  }
  return issues;
}

/** The F05 portion rules for one homework portion (units by section, Sabaq range and lines, Para). */
export function portionIssues(p: Pick<HomeworkPortion, 'section' | 'position' | 'paraNumber' | 'range' | 'totalLines' | 'assigned'>, ref?: RangeReference | null): PortionFieldError[] {
  return validatePortionFields(
    { section: p.section, position: p.position, paraNumber: p.section === 'SABAQ' ? null : p.paraNumber, range: p.range ? { ...p.range } : null, totalLines: p.totalLines, assigned: p.assigned },
    ref,
  );
}

/**
 * Explicit confirmation (F08-AC10, AC-HW-04): status CONFIRMED with the confirming user and time. Never called by a
 * timer or a schedule (F08-AC11). Throws on anything but a valid draft; the input is not changed.
 */
export function confirmDraft(a: HomeworkAssignment, by: { userId: string; at: string }, ref?: RangeReference | null): HomeworkAssignment {
  transition(a, 'CONFIRMED');
  const issues = confirmIssues(a.portions, ref);
  if (issues.length > 0) throw new HomeworkConfirmError(issues);
  return { ...a, status: 'CONFIRMED', confirmedBy: by.userId, confirmedAt: by.at, portions: a.portions.map((p) => ({ ...p })) };
}

export class HomeworkConfirmError extends Error {
  readonly issues: ConfirmIssue[];
  constructor(issues: ConfirmIssue[]) {
    super('The draft cannot be confirmed');
    this.name = 'HomeworkConfirmError';
    this.issues = issues;
  }
}

/** Rejecting a draft (F08-AC9): REJECTED, no longer counted as homework. */
export function rejectDraft(a: HomeworkAssignment): HomeworkAssignment {
  transition(a, 'REJECTED');
  return { ...a, status: 'REJECTED', portions: a.portions.map((p) => ({ ...p })) };
}

/**
 * An Owner/Admin revision (F08-AC15, FR-HW-012): a new CONFIRMED assignment linked to the old one, and the old one
 * SUPERSEDED. The old assignment's content is never edited; only its status changes.
 */
export function reviseAssignment(
  old: HomeworkAssignment,
  revision: Omit<HomeworkAssignment, 'status' | 'confirmedBy' | 'confirmedAt' | 'revisionOf' | 'createdBy' | 'studentId'>,
  by: { userId: string; at: string },
  ref?: RangeReference | null,
): { superseded: HomeworkAssignment; created: HomeworkAssignment } {
  transition(old, 'SUPERSEDED');
  const created = confirmDraft(
    { ...revision, studentId: old.studentId, status: 'DRAFT', createdBy: by.userId, confirmedBy: null, confirmedAt: null, revisionOf: old.id },
    by,
    ref,
  );
  return { superseded: { ...old, status: 'SUPERSEDED', portions: old.portions.map((p) => ({ ...p })) }, created };
}

/** How a Teacher's change to a suggested portion marks it (F08-AC8): a quantity or range change makes it EDITED. */
export function originAfterEdit(p: HomeworkPortion, edited: Partial<Pick<HomeworkPortion, 'assigned' | 'range' | 'paraNumber' | 'totalLines'>>): PortionOrigin {
  if (p.origin !== 'SUGGESTED') return p.origin;
  const changed = (Object.keys(edited) as (keyof typeof edited)[]).some((k) => JSON.stringify(edited[k]) !== JSON.stringify(p[k]));
  return changed ? 'TEACHER_EDITED' : 'SUGGESTED';
}

/**
 * Rebuilds a DRAFT after a source change (FR-HW-011, F08-AC14, AC-HW-06/07), limited to the lesson portions in `scope`:
 * - an active SUGGESTED portion takes the new suggestion's values and source (same id, its instructions kept), or is
 *   removed when its source is no longer eligible;
 * - a newly eligible source gets a new SUGGESTED portion at the end of its section;
 * - TEACHER_EDITED and TEACHER_ADDED portions, and portions the Teacher removed, are never changed or re-added.
 * A non-draft assignment is returned unchanged (confirmed homework is never silently changed, AC-HW-07).
 * `changed` is false when nothing differs, so the caller writes nothing.
 */
export function rebuildDraft(
  a: HomeworkAssignment,
  suggestions: readonly SuggestedPortion[],
  scope: ReadonlySet<string>,
  newId: () => string,
): { assignment: HomeworkAssignment; changed: boolean } {
  if (a.status !== 'DRAFT') return { assignment: a, changed: false };
  const inScope = suggestions.filter((s) => scope.has(s.sourceLessonPortionId));
  const bySource = new Map(inScope.map((s) => [s.sourceLessonPortionId, s]));
  const known = new Set(a.portions.filter((p) => p.sourceLessonPortionId !== null).map((p) => p.sourceLessonPortionId as string));
  let changed = false;
  const portions = a.portions.map((p): HomeworkPortion => {
    if (p.removed || p.origin !== 'SUGGESTED' || p.sourceLessonPortionId === null || !scope.has(p.sourceLessonPortionId)) return { ...p };
    const s = bySource.get(p.sourceLessonPortionId);
    if (!s) {
      changed = true;
      return { ...p, removed: true };
    }
    const next: HomeworkPortion = {
      ...p,
      section: s.section,
      paraNumber: s.paraNumber,
      range: s.range ? { ...s.range } : null,
      totalLines: s.totalLines,
      lineCountEdition: s.lineCountEdition,
      assigned: s.assigned,
      needsReview: s.needsReview,
      sourceAttemptId: s.sourceAttemptId,
      sourceHomeworkPortionId: s.sourceHomeworkPortionId,
    };
    if (JSON.stringify(stripId(next)) !== JSON.stringify(stripId(p))) changed = true;
    return next;
  });
  for (const s of inScope) {
    if (known.has(s.sourceLessonPortionId)) continue;
    const last = Math.max(0, ...portions.filter((p) => !p.removed && p.section === s.section).map((p) => p.position));
    portions.push({
      id: newId(),
      section: s.section,
      position: last + 1,
      paraNumber: s.paraNumber,
      range: s.range ? { ...s.range } : null,
      totalLines: s.totalLines,
      lineCountEdition: s.lineCountEdition,
      assigned: s.assigned,
      needsReview: s.needsReview,
      origin: 'SUGGESTED',
      sourceAttemptId: s.sourceAttemptId,
      sourceLessonPortionId: s.sourceLessonPortionId,
      sourceHomeworkPortionId: s.sourceHomeworkPortionId,
      instructions: null,
      removed: false,
    });
    changed = true;
  }
  return { assignment: { ...a, portions }, changed };
}

const stripId = ({ id: _id, ...rest }: HomeworkPortion) => rest;

/** A suggestion as a new SUGGESTED draft portion. */
export function portionFromSuggestion(s: SuggestedPortion, id: string): HomeworkPortion {
  return {
    id,
    section: s.section,
    position: s.position,
    paraNumber: s.paraNumber,
    range: s.range ? { ...s.range } : null,
    totalLines: s.totalLines,
    lineCountEdition: s.lineCountEdition,
    assigned: s.assigned,
    needsReview: s.needsReview,
    origin: 'SUGGESTED',
    sourceAttemptId: s.sourceAttemptId,
    sourceLessonPortionId: s.sourceLessonPortionId,
    sourceHomeworkPortionId: s.sourceHomeworkPortionId,
    instructions: null,
    removed: false,
  };
}

// ---------- Sync field classes (F12 plan Q4/Q5) ----------

/**
 * `homework_assignment`: status, portions, due date, and instructions are each meaningful (ARCHITECTURE §8.2 "homework
 * status/portions"); a draft edited on two devices becomes a conflict, never last-write-wins.
 */
export const HOMEWORK_ASSIGNMENT_FIELDS = defineFieldSpec({ entity: 'homework_assignment' });

// Shared homework loaders and writers (F08; plan docs/handover/F08-plan.md §2). Every function runs inside the caller's
// tenant transaction (withTenant). The rules live in @hifz/domain/homework; this file loads their inputs, maps rows to
// domain shapes, and writes portions. Confirmed homework is protected again by the 0014 database trigger.
import type { HomeworkPortionValue } from '@hifz/contracts';
import { activeExceptions, scheduleVersions } from '../calendar/shared.ts';
import { nextClassDay, type HomeworkAssignment, type HomeworkPortion } from '@hifz/domain/homework';
import { addDays } from '@hifz/domain/roster';
import type { Executor, HomeworkAssignmentsTable, HomeworkPortionsTable, Tx } from '../../platform/db.ts';
import { quantityOf, rangeOf, UUID } from '../hifz/shared.ts';

export type AssignmentRow = Omit<HomeworkAssignmentsTable, 'row_version'> & { row_version: string | number };
export type PortionRow = HomeworkPortionsTable;

const SECTION_RANK = { SABAQ: 0, SABQI: 1, MANZIL: 2 } as const;

/** Portions in section, then position order (active and removed alike). */
export const byPosition = <T extends { section: keyof typeof SECTION_RANK; position: number; id: string }>(list: readonly T[]): T[] =>
  [...list].sort((a, b) => SECTION_RANK[a.section] - SECTION_RANK[b.section] || a.position - b.position || a.id.localeCompare(b.id));

export function portionOf(r: PortionRow): HomeworkPortion {
  return {
    id: r.id,
    section: r.section,
    position: r.position,
    paraNumber: r.para_number,
    range: rangeOf(r),
    totalLines: r.total_lines,
    lineCountEdition: r.line_count_edition,
    assigned: quantityOf(r.assigned_unit, r.assigned_num, r.assigned_den),
    needsReview: r.needs_review,
    origin: r.origin,
    sourceAttemptId: r.source_attempt_id,
    sourceLessonPortionId: r.source_lesson_portion_id,
    sourceHomeworkPortionId: r.source_homework_portion_id,
    instructions: r.instructions,
    removed: r.removed_at !== null,
  };
}

/** The stored value of a portion with its keys in a fixed order (exact conflict comparison). */
export function portionValue(p: HomeworkPortion): HomeworkPortionValue {
  return {
    id: p.id,
    section: p.section,
    position: p.position,
    paraNumber: p.paraNumber,
    range: p.range ? { surahStart: p.range.surahStart, ayahStart: p.range.ayahStart, surahEnd: p.range.surahEnd, ayahEnd: p.range.ayahEnd } : null,
    totalLines: p.totalLines,
    lineCountEdition: p.lineCountEdition ?? null,
    assigned: p.assigned ? { unit: p.assigned.unit, numerator: p.assigned.numerator, denominator: p.assigned.denominator } : null,
    needsReview: p.needsReview,
    origin: p.origin,
    sourceAttemptId: p.sourceAttemptId,
    sourceLessonPortionId: p.sourceLessonPortionId,
    sourceHomeworkPortionId: p.sourceHomeworkPortionId,
    instructions: p.instructions,
  };
}

export function assignmentOf(a: AssignmentRow, portions: readonly PortionRow[]): HomeworkAssignment {
  return {
    id: a.id,
    studentId: a.student_id,
    status: a.status,
    assignedDate: a.assigned_date,
    dueDate: a.due_date,
    instructions: a.instructions,
    createdBy: a.created_by,
    confirmedBy: a.confirmed_by,
    confirmedAt: a.confirmed_at ? a.confirmed_at.toISOString() : null,
    revisionOf: a.revision_of,
    portions: byPosition(portions).map(portionOf),
  };
}

/** The sync fields of an assignment: its active portions only, by section and position. */
export function syncFields(a: AssignmentRow, portions: readonly PortionRow[]): Record<string, unknown> {
  return {
    studentId: a.student_id,
    classId: a.class_id,
    sourceDailyRecordId: a.source_daily_record_id,
    assignedDate: a.assigned_date,
    dueDate: a.due_date,
    status: a.status,
    instructions: a.instructions,
    createdBy: a.created_by,
    confirmedBy: a.confirmed_by,
    confirmedAt: a.confirmed_at ? a.confirmed_at.toISOString() : null,
    revisionOf: a.revision_of,
    portions: byPosition(portions.filter((p) => p.removed_at === null)).map((p) => portionValue(portionOf(p))),
  };
}

/** One assignment and all its portions (removed ones too), or null. `forUpdate` locks the assignment row. */
export async function loadAssignment(db: Executor, organizationId: string, id: string, options: { forUpdate?: boolean } = {}): Promise<{ row: AssignmentRow; portions: PortionRow[] } | null> {
  if (!UUID.test(id)) return null;
  let q = db.selectFrom('homework_assignments').selectAll().where('organization_id', '=', organizationId).where('id', '=', id);
  if (options.forUpdate) q = q.forUpdate();
  const row = await q.executeTakeFirst();
  if (!row) return null;
  const portions = await db.selectFrom('homework_portions').selectAll().where('organization_id', '=', organizationId).where('assignment_id', '=', id).execute();
  return { row, portions };
}

export async function loadAssignments(db: Executor, organizationId: string, ids: readonly string[]): Promise<{ row: AssignmentRow; portions: PortionRow[] }[]> {
  if (ids.length === 0) return [];
  const rows = await db.selectFrom('homework_assignments').selectAll().where('organization_id', '=', organizationId).where('id', 'in', [...ids]).execute();
  const portions = rows.length
    ? await db
        .selectFrom('homework_portions')
        .selectAll()
        .where('organization_id', '=', organizationId)
        .where(
          'assignment_id',
          'in',
          rows.map((r) => r.id),
        )
        .execute()
    : [];
  return rows.map((row) => ({ row, portions: portions.filter((p) => p.assignment_id === row.id) }));
}

/**
 * Writes a draft's portions: each given portion is inserted or updated (a removed one is marked removed, never
 * deleted); existing portions not in the list are left as they are. Ids are the client's UUIDv7s (or the server's for a
 * rebuild). Section never changes on an existing portion (it is not an updatable column).
 */
export async function writePortions(tx: Tx, organizationId: string, assignmentId: string, portions: readonly HomeworkPortion[], existing: readonly PortionRow[], at: Date): Promise<void> {
  const known = new Map(existing.map((p) => [p.id, p]));
  for (const p of portions) {
    const values = {
      position: p.position,
      para_number: p.paraNumber as number,
      surah_start: p.range?.surahStart ?? null,
      ayah_start: p.range?.ayahStart ?? null,
      surah_end: p.range?.surahEnd ?? null,
      ayah_end: p.range?.ayahEnd ?? null,
      total_lines: p.totalLines,
      line_count_edition: p.lineCountEdition ?? null,
      assigned_unit: p.assigned?.unit ?? null,
      assigned_num: p.assigned?.numerator ?? null,
      assigned_den: p.assigned?.denominator ?? null,
      needs_review: p.needsReview,
      origin: p.origin,
      source_attempt_id: p.sourceAttemptId,
      source_lesson_portion_id: p.sourceLessonPortionId,
      source_homework_portion_id: p.sourceHomeworkPortionId,
      instructions: p.instructions,
      removed_at: p.removed ? (known.get(p.id)?.removed_at ?? at) : null,
    };
    const old = known.get(p.id);
    if (!old) {
      await tx
        .insertInto('homework_portions')
        .values({ id: p.id, organization_id: organizationId, assignment_id: assignmentId, section: p.section, created_at: at, updated_at: at, ...values })
        .execute();
      continue;
    }
    if (sameRow(old, values)) continue;
    await tx.updateTable('homework_portions').set({ ...values, updated_at: at }).where('organization_id', '=', organizationId).where('id', '=', p.id).execute();
  }
}

const sameRow = (old: PortionRow, values: Record<string, unknown>): boolean =>
  Object.entries(values).every(([k, v]) => {
    const was = (old as unknown as Record<string, unknown>)[k];
    if (k === 'removed_at') return (was === null) === (v === null);
    return was === v;
  });

/**
 * Attempts already carried forward by a live (draft or confirmed) assignment's active portion, other than `except`
 * (FR-HW-014: one source is not carried forward twice).
 */
export async function carriedElsewhere(db: Executor, organizationId: string, attemptIds: readonly string[], except: string | null): Promise<Set<string>> {
  if (attemptIds.length === 0) return new Set();
  let q = db
    .selectFrom('homework_portions as p')
    .innerJoin('homework_assignments as a', (j) => j.onRef('a.id', '=', 'p.assignment_id').onRef('a.organization_id', '=', 'p.organization_id'))
    .select('p.source_attempt_id')
    .where('p.organization_id', '=', organizationId)
    .where('p.source_attempt_id', 'in', [...attemptIds])
    .where('p.removed_at', 'is', null)
    .where('a.status', 'in', ['DRAFT', 'CONFIRMED']);
  if (except) q = q.where('a.id', '!=', except);
  const rows = await q.execute();
  return new Set(rows.flatMap((r) => (r.source_attempt_id ? [r.source_attempt_id] : [])));
}

/** The default due date (FR-HW-004, F08-AC18): the class's next scheduled day after the assigned date, or null. */
export async function defaultDue(db: Executor, organizationId: string, classId: string, assignedDate: string): Promise<string | null> {
  const [versions, exceptions] = await Promise.all([
    scheduleVersions(db, organizationId, [classId]),
    activeExceptions(db, organizationId, { from: assignedDate, to: addDays(assignedDate, 130) }, [classId]),
  ]);
  return nextClassDay(classId, assignedDate, versions, exceptions);
}

/** Cleans instructions as stored: trimmed, blank → null. */
export function cleanInstructions(text: string | null | undefined): string | null {
  const t = text?.trim();
  return t ? t : null;
}

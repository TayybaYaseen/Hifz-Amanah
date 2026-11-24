// The hifz module's interface for the Excel import and export (F14; US-059, US-061; SRS §15.1; ARCHITECTURE §11).
// Runs inside the caller's tenant transaction. Reads portions with their latest attempt (current progress uses the
// latest attempt per portion, FR-ATT-005) and writes the one field only an import sets: an attempt's uncategorized
// `MistakeCount` (portion_attempts.mistake_count_summary). Every other hifz write goes through the sync handlers.
import type { Quantity } from '@hifz/domain/quantity';
import type { PortionStatus } from '@hifz/domain/hifz';
import type { Executor, Tx } from '../../platform/db.ts';
import { currentMistakes } from './portion-attempt-sync.ts';
import { quantityOf, rangeOf, type RangeValue } from './shared.ts';

export interface StoredAttempt {
  id: string;
  attemptNo: number;
  status: PortionStatus;
  completed: Quantity | null;
  quality: number | null;
  noMistakes: boolean;
  /** Categorized mistakes recorded in the app. */
  categorizedCount: number;
  /** An imported uncategorized MistakeCount, or null (unknown). */
  mistakeCountSummary: number | null;
  /** Staff text: never logged. */
  remarks: string | null;
  remarksVisibility: 'INTERNAL' | 'SHARED';
}

export interface StoredPortion {
  id: string;
  recordId: string;
  studentId: string;
  classId: string;
  recordDate: string;
  sessionLabel: string | null;
  section: 'SABAQ' | 'SABQI' | 'MANZIL';
  position: number;
  isExtra: boolean;
  paraNumber: number | null;
  range: RangeValue | null;
  totalLines: number | null;
  assigned: Quantity;
  latest: StoredAttempt | null;
}

export type PortionFilter =
  | { portionIds: readonly string[] }
  | { studentIds: readonly string[]; dates: readonly string[] }
  /** A date range; null students or classes = no filter on them (the caller has already applied the scope). */
  | { studentIds: readonly string[] | null; from: string; to: string; classIds: readonly string[] | null };

/** Non-removed portions matching the filter, each with its latest attempt (or null). */
export async function storedPortions(db: Executor, org: string, filter: PortionFilter): Promise<StoredPortion[]> {
  let q = db
    .selectFrom('lesson_portions as p')
    .innerJoin('daily_records as r', (j) => j.onRef('r.id', '=', 'p.daily_record_id').onRef('r.organization_id', '=', 'p.organization_id'))
    .select([
      'p.id',
      'p.section',
      'p.position',
      'p.is_extra',
      'p.para_number',
      'p.surah_start',
      'p.ayah_start',
      'p.surah_end',
      'p.ayah_end',
      'p.total_lines',
      'p.assigned_unit',
      'p.assigned_num',
      'p.assigned_den',
      'r.id as record_id',
      'r.student_id',
      'r.class_id',
      'r.report_date',
      'r.session_label',
    ])
    .where('p.organization_id', '=', org)
    .where('p.removed_at', 'is', null);
  if ('portionIds' in filter) {
    if (filter.portionIds.length === 0) return [];
    q = q.where('p.id', 'in', [...filter.portionIds]);
  } else if ('dates' in filter) {
    if (filter.studentIds.length === 0 || filter.dates.length === 0) return [];
    q = q.where('r.student_id', 'in', [...filter.studentIds]).where('r.report_date', 'in', [...filter.dates]);
  } else {
    q = q.where('r.report_date', '>=', filter.from).where('r.report_date', '<=', filter.to);
    if (filter.studentIds !== null) {
      if (filter.studentIds.length === 0) return [];
      q = q.where('r.student_id', 'in', [...filter.studentIds]);
    }
    if (filter.classIds !== null) {
      if (filter.classIds.length === 0) return [];
      q = q.where('r.class_id', 'in', [...filter.classIds]);
    }
  }
  const portions = await q.orderBy('r.report_date').orderBy('r.student_id').orderBy('r.session_label').orderBy('p.section').orderBy('p.position').orderBy('p.id').execute();
  if (portions.length === 0) return [];
  const attempts = await db
    .selectFrom('portion_attempts')
    .select(['id', 'lesson_portion_id', 'attempt_no', 'status', 'completed_unit', 'completed_num', 'completed_den', 'quality', 'no_mistakes', 'mistake_count_summary', 'remarks', 'remarks_visibility'])
    .where('organization_id', '=', org)
    .where(
      'lesson_portion_id',
      'in',
      portions.map((p) => p.id),
    )
    .execute();
  const latest = new Map<string, (typeof attempts)[number]>();
  for (const a of attempts) {
    const seen = latest.get(a.lesson_portion_id);
    if (!seen || a.attempt_no > seen.attempt_no) latest.set(a.lesson_portion_id, a);
  }
  const mistakes = await currentMistakes(db as Tx, org, [...latest.values()].map((a) => a.id));
  return portions.map((p) => {
    const a = latest.get(p.id);
    return {
      id: p.id,
      recordId: p.record_id,
      studentId: p.student_id,
      classId: p.class_id,
      recordDate: p.report_date,
      sessionLabel: p.session_label,
      section: p.section,
      position: p.position,
      isExtra: p.is_extra,
      paraNumber: p.para_number,
      range: rangeOf(p),
      totalLines: p.total_lines,
      assigned: { unit: p.assigned_unit, numerator: p.assigned_num, denominator: p.assigned_den },
      latest: a
        ? {
            id: a.id,
            attemptNo: a.attempt_no,
            status: a.status,
            completed: quantityOf(a.completed_unit, a.completed_num, a.completed_den),
            quality: a.quality,
            noMistakes: a.no_mistakes,
            categorizedCount: (mistakes.get(a.id) ?? []).length,
            mistakeCountSummary: a.mistake_count_summary,
            remarks: a.remarks,
            remarksVisibility: a.remarks_visibility,
          }
        : null,
    };
  });
}

/** Daily records of students on given dates (to add imported portions to an existing record of that day). */
export async function recordsOnDates(db: Executor, org: string, studentIds: readonly string[], dates: readonly string[]): Promise<{ id: string; studentId: string; classId: string; date: string; sessionLabel: string | null }[]> {
  if (studentIds.length === 0 || dates.length === 0) return [];
  const rows = await db
    .selectFrom('daily_records')
    .select(['id', 'student_id', 'class_id', 'report_date', 'session_label'])
    .where('organization_id', '=', org)
    .where('student_id', 'in', [...studentIds])
    .where('report_date', 'in', [...dates])
    .orderBy('created_at')
    .orderBy('id')
    .execute();
  return rows.map((r) => ({ id: r.id, studentId: r.student_id, classId: r.class_id, date: r.report_date, sessionLabel: r.session_label }));
}

/**
 * Stores an imported MistakeCount on the attempt (SRS §15.1): an uncategorized total, never split into categories and
 * never a mistake row. Null clears nothing (an empty cell is "not recorded"); the caller passes a number.
 */
export async function setImportedMistakeCount(tx: Tx, org: string, attemptId: string, count: number, at: Date, actorUserId: string): Promise<void> {
  await tx
    .updateTable('portion_attempts')
    .set({ mistake_count_summary: count, updated_at: at, updated_by: actorUserId })
    .where('organization_id', '=', org)
    .where('id', '=', attemptId)
    .execute();
}

// Homework sources (F08, FR-HW-005…006, FR-HW-011, FR-HW-014): the hifz module's read interface for the homework
// module. Lesson portions with their attempts, in the shape @hifz/domain/homework `suggest()` takes. Runs inside the
// caller's tenant transaction. Nothing here decides eligibility; the domain does.
import type { SourceAttempt, SourcePortion } from '@hifz/domain/homework';
import type { Executor, Tx } from '../../platform/db.ts';
import { quantityOf, rangeOf } from './shared.ts';

export interface RecordSourcePortion extends SourcePortion {
  dailyRecordId: string;
  studentId: string;
  classId: string;
  reportDate: string;
}

/** Lesson portions (removed ones included, flagged) and every attempt, for one record or a set of portions. */
export async function sourcePortions(db: Executor, organizationId: string, where: { dailyRecordId: string } | { lessonPortionIds: readonly string[] }): Promise<RecordSourcePortion[]> {
  let q = db
    .selectFrom('lesson_portions as p')
    .innerJoin('daily_records as r', (j) => j.onRef('r.id', '=', 'p.daily_record_id').onRef('r.organization_id', '=', 'p.organization_id'))
    .select([
      'p.id',
      'p.section',
      'p.position',
      'p.is_extra',
      'p.removed_at',
      'p.para_number',
      'p.surah_start',
      'p.ayah_start',
      'p.surah_end',
      'p.ayah_end',
      'p.total_lines',
      'p.line_count_edition',
      'p.assigned_unit',
      'p.assigned_num',
      'p.assigned_den',
      'p.homework_portion_id',
      'p.row_version',
      'r.id as record_id',
      'r.student_id',
      'r.class_id',
      'r.report_date',
    ])
    .where('p.organization_id', '=', organizationId);
  if ('dailyRecordId' in where) q = q.where('p.daily_record_id', '=', where.dailyRecordId);
  else {
    if (where.lessonPortionIds.length === 0) return [];
    q = q.where('p.id', 'in', [...where.lessonPortionIds]);
  }
  const portions = await q.execute();
  if (portions.length === 0) return [];
  const attempts = await db
    .selectFrom('portion_attempts')
    .select(['id', 'lesson_portion_id', 'attempt_no', 'status', 'completed_unit', 'completed_num', 'completed_den', 'row_version'])
    .where('organization_id', '=', organizationId)
    .where(
      'lesson_portion_id',
      'in',
      portions.map((p) => p.id),
    )
    .execute();
  const byPortion = new Map<string, SourceAttempt[]>();
  for (const a of attempts) {
    const list = byPortion.get(a.lesson_portion_id) ?? [];
    list.push({ id: a.id, attemptNo: a.attempt_no, status: a.status, completed: quantityOf(a.completed_unit, a.completed_num, a.completed_den), rowVersion: Number(a.row_version) });
    byPortion.set(a.lesson_portion_id, list);
  }
  return portions.map((p) => ({
    id: p.id,
    section: p.section,
    position: p.position,
    isExtra: p.is_extra,
    removed: p.removed_at !== null,
    paraNumber: p.para_number,
    range: rangeOf(p),
    totalLines: p.total_lines,
    lineCountEdition: p.line_count_edition,
    assigned: { unit: p.assigned_unit, numerator: p.assigned_num, denominator: p.assigned_den },
    homeworkPortionId: p.homework_portion_id,
    rowVersion: Number(p.row_version),
    attempts: byPortion.get(p.id) ?? [],
    dailyRecordId: p.record_id,
    studentId: p.student_id,
    classId: p.class_id,
    reportDate: p.report_date,
  }));
}

/** The lesson portion an attempt belongs to, or null. */
export async function lessonPortionOfAttempt(db: Executor, organizationId: string, attemptId: string): Promise<string | null> {
  const r = await db.selectFrom('portion_attempts').select('lesson_portion_id').where('organization_id', '=', organizationId).where('id', '=', attemptId).executeTakeFirst();
  return r?.lesson_portion_id ?? null;
}

/** Hook the hifz handlers call after a source change; the homework module implements it (F08-AC14). */
export interface HomeworkSourceHooks {
  /** Rebuilds the drafts sourced from the lesson portion; returns notices (CONFIRMED_HOMEWORK_UNCHANGED). */
  sourceChanged(tx: Tx, change: { actor: { userId: string; organizationId: string }; opId?: string | null; at: Date }, lessonPortionId: string): Promise<string[]>;
  /** Checks a next-class link (F08-AC16): the homework portion is this student's, same section, confirmed, active. */
  checkLink(tx: Tx, organizationId: string, link: { homeworkPortionId: string; studentId: string; section: string }): Promise<boolean>;
}

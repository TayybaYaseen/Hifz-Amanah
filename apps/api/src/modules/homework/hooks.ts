// What the homework module does when a source changes (FR-HW-011, FR-HW-012, BR-11; F08-AC14, AC16; F05-AC4).
// Called by the F05 handlers in the same transaction as the change (attempt created or corrected, lesson portion
// corrected or removed), and by conflict resolution.
//
// - DRAFT assignments sourced from the changed lesson portion (or built from its daily record) are rebuilt with the
//   domain `rebuildDraft`: suggested portions follow the source, the Teacher's portions stay. The rebuild is a change of
//   the draft (row version, change log, audit HOMEWORK_DRAFT_RECALCULATED), so devices pull it and an offline
//   confirmation built on the old values becomes a conflict (FR-HW-017).
// - CONFIRMED assignments are never touched; when one was carried forward from the changed portion, the change carries
//   the notice CONFIRMED_HOMEWORK_UNCHANGED ("Confirmed homework was not changed — Revise?").
import { v7 as uuidv7 } from 'uuid';
import { rebuildDraft, suggest } from '@hifz/domain/homework';
import type { Tx } from '../../platform/db.ts';
import { recordAudit } from '../audit/audit.ts';
import { sourcePortions, type HomeworkSourceHooks } from '../hifz/sources.ts';
import { appendChange } from '../sync/change-log.ts';
import { assignmentOf, carriedElsewhere, loadAssignment, writePortions } from './shared.ts';

export const CONFIRMED_HOMEWORK_UNCHANGED = 'CONFIRMED_HOMEWORK_UNCHANGED';

export function homeworkHooks(): HomeworkSourceHooks {
  return {
    async sourceChanged(tx: Tx, change, lessonPortionId) {
      const org = change.actor.organizationId;
      const [lp] = await sourcePortions(tx, org, { lessonPortionIds: [lessonPortionId] });
      if (!lp) return [];
      const drafts = await tx
        .selectFrom('homework_assignments as a')
        .select('a.id')
        .where('a.organization_id', '=', org)
        .where('a.status', '=', 'DRAFT')
        .where((eb) =>
          eb.or([
            eb('a.source_daily_record_id', '=', lp.dailyRecordId),
            eb.exists(
              eb
                .selectFrom('homework_portions as p')
                .select('p.id')
                .whereRef('p.assignment_id', '=', 'a.id')
                .whereRef('p.organization_id', '=', 'a.organization_id')
                .where('p.source_lesson_portion_id', '=', lessonPortionId),
            ),
          ]),
        )
        .orderBy('a.id')
        .execute();
      for (const { id } of drafts) {
        const loaded = await loadAssignment(tx, org, id, { forUpdate: true });
        if (!loaded || loaded.row.status !== 'DRAFT' || loaded.row.student_id !== lp.studentId) continue;
        const carried = await carriedElsewhere(tx, org, lp.attempts.map((a) => a.id), id);
        const { assignment, changed } = rebuildDraft(assignmentOf(loaded.row, loaded.portions), suggest({ portions: [lp], alreadyCarried: carried }), new Set([lessonPortionId]), uuidv7);
        if (!changed) continue;
        await writePortions(tx, org, id, assignment.portions, loaded.portions, change.at);
        const next = Number(loaded.row.row_version) + 1;
        await tx
          .updateTable('homework_assignments')
          .set({ row_version: next, updated_at: change.at, updated_by: change.actor.userId })
          .where('organization_id', '=', org)
          .where('id', '=', id)
          .execute();
        await appendChange(tx, {
          organizationId: org,
          entity: 'homework_assignment',
          entityId: id,
          rowVersion: next,
          op: 'UPSERT',
          changedFields: ['portions'],
          keys: { studentId: loaded.row.student_id, classId: loaded.row.class_id },
          actorUserId: change.actor.userId,
          // The change belongs to the operation that changed the source: the same device's later confirmation is not a
          // conflict with its own correction; anyone else's is (F12 changedSince).
          opId: change.opId ?? null,
          at: change.at,
        });
        await recordAudit(tx, {
          organizationId: org,
          actorUserId: change.actor.userId,
          action: 'HOMEWORK_DRAFT_RECALCULATED',
          targetType: 'HOMEWORK_ASSIGNMENT',
          targetId: id,
          summary: {
            studentId: loaded.row.student_id,
            sourceLessonPortionId: lessonPortionId,
            portionCount: assignment.portions.filter((p) => !p.removed).length,
            rowVersion: next,
          },
          at: change.at,
        });
      }
      const confirmed = await tx
        .selectFrom('homework_portions as p')
        .innerJoin('homework_assignments as a', (j) => j.onRef('a.id', '=', 'p.assignment_id').onRef('a.organization_id', '=', 'p.organization_id'))
        .select('a.id')
        .where('p.organization_id', '=', org)
        .where('p.source_lesson_portion_id', '=', lessonPortionId)
        .where('p.removed_at', 'is', null)
        .where('a.status', '=', 'CONFIRMED')
        .executeTakeFirst();
      return confirmed ? [CONFIRMED_HOMEWORK_UNCHANGED] : [];
    },

    async checkLink(tx, organizationId, link) {
      const row = await tx
        .selectFrom('homework_portions as p')
        .innerJoin('homework_assignments as a', (j) => j.onRef('a.id', '=', 'p.assignment_id').onRef('a.organization_id', '=', 'p.organization_id'))
        .select(['a.student_id', 'a.status', 'p.section', 'p.removed_at'])
        .where('p.organization_id', '=', organizationId)
        .where('p.id', '=', link.homeworkPortionId)
        .executeTakeFirst();
      return row !== undefined && row.student_id === link.studentId && row.status === 'CONFIRMED' && row.section === link.section && row.removed_at === null;
    },
  };
}

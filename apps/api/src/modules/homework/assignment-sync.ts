// The `homework_assignment` sync handler (F08; US-033…037; FR-HW-001…009, FR-HW-013, FR-HW-014, FR-HW-017, FR-HW-018;
// F08-AC1…AC12, AC18, AC20…AC22). Plan docs/handover/F08-plan.md §2.
//
// - CREATE: a DRAFT with its portions (client UUIDv7s). The class is the student's class on the assigned date; the
//   Teacher must reach it (`daily.write` / `homework.confirm`, same grants). The due date defaults to the next class day.
// - SUGGESTED portions are re-derived from their source attempt with the domain `suggestFor` (never a client quantity,
//   AGENTS §6): the source must be this student's latest attempt on its portion, still eligible, and not carried forward
//   by another live assignment. TEACHER_EDITED and TEACHER_ADDED portions pass the F05 portion rules.
// - UPDATE (drafts only): due date, instructions, the full active portion list (a portion left out is removed, its row
//   kept), or status REJECTED. Never last-write-wins: portions, status, due date, and instructions are meaningful.
// - COMMAND CONFIRM_HOMEWORK (online and offline, FR-HW-017): applies only when the draft and every source the device
//   built it from are unchanged since (changes by other users or devices count; the device's own earlier ones do not).
//   Otherwise a sync conflict is stored and the draft stays a draft (F08-AC21). Validation is all-or-nothing (F08-AC12).
// - Instructions are staff text: audited by field name only, never logged.
import { z } from 'zod';
import {
  ConfirmHomeworkFields,
  HOMEWORK_INSTRUCTIONS_MAX,
  HOMEWORK_PORTIONS_MAX,
  HomeworkAssignmentCreateFields,
  HomeworkAssignmentUpdateFields,
  HomeworkPortionInput,
  type HomeworkSourceVersion,
} from '@hifz/contracts';
import { latestAttempt, type RangeReference } from '@hifz/domain/hifz';
import {
  HOMEWORK_ASSIGNMENT_FIELDS,
  confirmIssues,
  dueDateIssue,
  suggestFor,
  type HomeworkPortion,
} from '@hifz/domain/homework';
import { classOn, isCalendarDate } from '@hifz/domain/roster';
import type { Clock } from '../../platform/clock.ts';
import type { Tx } from '../../platform/db.ts';
import { recordAudit } from '../audit/audit.ts';
import { enrollmentsOf } from '../calendar/shared.ts';
import type { QuranMetadataService } from '../quran-ref/metadata-service.ts';
import { todayFor } from '../roster/shared.ts';
import { changedSince } from '../sync/change-log.ts';
import type { AppliedChange, CommandOutcome, Prepared, SyncHandler, SyncRow } from '../sync/handler.ts';
import { hasIssues, inDailyScope, loadRecordContext, rangeReference, schemaIssues, type Issues } from '../hifz/shared.ts';
import { sourcePortions, type RecordSourcePortion } from '../hifz/sources.ts';
import { teacherPortion } from './portions.ts';
import { carriedElsewhere, cleanInstructions, defaultDue, loadAssignment, loadAssignments, portionOf, syncFields, writePortions, type PortionRow } from './shared.ts';

export interface HomeworkSyncDeps {
  clock: Clock;
  quran: QuranMetadataService;
}

const refuse = (issues: Issues): Prepared => ({ ok: false, issues });

/** The student's class on the date (enrollments are inclusive), or null. */
async function classOnDate(tx: Tx, organizationId: string, studentId: string, date: string): Promise<string | null> {
  const enrollments = (await enrollmentsOf(tx, organizationId, [studentId])).get(studentId) ?? [];
  return classOn(enrollments, date);
}

const toRow = (loaded: { row: Parameters<typeof syncFields>[0]; portions: PortionRow[] }): SyncRow => ({
  id: loaded.row.id,
  rowVersion: Number(loaded.row.row_version),
  fields: syncFields(loaded.row, loaded.portions),
  keys: { studentId: loaded.row.student_id, classId: loaded.row.class_id },
});

export function homeworkAssignmentSyncHandler(deps: HomeworkSyncDeps): SyncHandler {
  /**
   * Checks and normalizes a list of portions for one student's draft (`assignmentId` null on create). Issue keys are
   * `portions.<index>.<field>` in the list's order.
   */
  async function preparePortions(
    tx: Tx,
    organizationId: string,
    ctx: { studentId: string; assignmentId: string | null; existing: readonly PortionRow[] },
    raw: unknown,
  ): Promise<{ issues: Issues } | { portions: HomeworkPortion[] }> {
    const parsed = z.array(HomeworkPortionInput).safeParse(raw);
    if (!parsed.success) return { issues: Object.fromEntries(Object.entries(schemaIssues(parsed.error)).map(([k, v]) => [`portions.${k}`, v])) };
    const inputs = parsed.data;
    if (inputs.length > HOMEWORK_PORTIONS_MAX) return { issues: { portions: 'TOO_MANY', 'portions.max': String(HOMEWORK_PORTIONS_MAX) } };
    const issues: Issues = {};
    const at = (i: number, field: string, code: string) => (issues[`portions.${i}.${field}`] ??= code);

    // Ids: unique in the list, and not another assignment's portion.
    const seen = new Set<string>();
    inputs.forEach((p, i) => {
      if (seen.has(p.id)) at(i, 'id', 'DUPLICATE_ID');
      seen.add(p.id);
    });
    const mine = new Set(ctx.existing.map((p) => p.id));
    const foreign = inputs.filter((p) => !mine.has(p.id)).map((p) => p.id);
    if (foreign.length) {
      const taken = await tx.selectFrom('homework_portions').select('id').where('organization_id', '=', organizationId).where('id', 'in', foreign).execute();
      const takenIds = new Set(taken.map((t) => t.id));
      inputs.forEach((p, i) => takenIds.has(p.id) && at(i, 'id', 'ID_TAKEN'));
    }

    // Sources: the attempts' lesson portions, with every attempt (latest-attempt rule).
    const attemptIds = [...new Set(inputs.flatMap((p) => (p.sourceAttemptId ? [p.sourceAttemptId] : [])))];
    const attemptPortion = new Map<string, string>();
    if (attemptIds.length) {
      const rows = await tx.selectFrom('portion_attempts').select(['id', 'lesson_portion_id']).where('organization_id', '=', organizationId).where('id', 'in', attemptIds).execute();
      for (const r of rows) attemptPortion.set(r.id, r.lesson_portion_id);
    }
    const sources = new Map((await sourcePortions(tx, organizationId, { lessonPortionIds: [...new Set(attemptPortion.values())] })).map((p) => [p.id, p]));
    const carried = await carriedElsewhere(tx, organizationId, attemptIds, ctx.assignmentId);
    const needsRef = inputs.some((p) => p.section === 'SABAQ' || p.range !== null);
    const ref: RangeReference | null = needsRef ? await rangeReference(tx, deps.quran, organizationId) : null;

    const out: HomeworkPortion[] = [];
    for (const [i, p] of inputs.entries()) {
      const instructions = cleanInstructions(p.instructions);
      if (instructions !== null && instructions.length > HOMEWORK_INSTRUCTIONS_MAX) at(i, 'instructions', 'TOO_LONG');
      let source: RecordSourcePortion | null = null;
      if (p.origin === 'TEACHER_ADDED') {
        if (p.sourceAttemptId !== null) at(i, 'sourceAttemptId', 'SOURCE_NOT_ALLOWED');
      } else if (p.sourceAttemptId === null) {
        at(i, 'sourceAttemptId', 'SOURCE_REQUIRED');
      } else {
        const lp = sources.get(attemptPortion.get(p.sourceAttemptId) ?? '');
        if (!lp || lp.studentId !== ctx.studentId) at(i, 'sourceAttemptId', 'NOT_FOUND');
        else if (carried.has(p.sourceAttemptId)) at(i, 'sourceAttemptId', 'ALREADY_ASSIGNED');
        else source = lp;
      }
      if (issues[`portions.${i}.sourceAttemptId`]) continue;

      if (p.origin === 'SUGGESTED' && source) {
        // Re-derived from the source (FR-HW-018 for Sabaq); the client's values are not used.
        if (latestAttempt(source.attempts)?.id !== p.sourceAttemptId) {
          at(i, 'sourceAttemptId', 'NOT_LATEST');
          continue;
        }
        const s = suggestFor(source);
        if (!s) {
          at(i, 'sourceAttemptId', 'NOT_ELIGIBLE');
          continue;
        }
        out.push({
          id: p.id,
          section: s.section,
          position: p.position,
          paraNumber: s.paraNumber,
          range: s.range,
          totalLines: s.totalLines,
          lineCountEdition: s.lineCountEdition,
          assigned: s.assigned,
          needsReview: s.needsReview,
          origin: 'SUGGESTED',
          sourceAttemptId: s.sourceAttemptId,
          sourceLessonPortionId: s.sourceLessonPortionId,
          sourceHomeworkPortionId: s.sourceHomeworkPortionId,
          instructions,
          removed: false,
        });
        continue;
      }

      // TEACHER_EDITED / TEACHER_ADDED: the Teacher's values against the F05 portion rules.
      const link = source
        ? { attemptId: p.sourceAttemptId, lessonPortionId: source.id, homeworkPortionId: source.homeworkPortionId, section: source.section, lineCountEdition: source.lineCountEdition ?? null }
        : null;
      const checked = await teacherPortion(tx, deps.quran, organizationId, p, p.origin as 'TEACHER_EDITED' | 'TEACHER_ADDED', ref, link);
      if ('issues' in checked) for (const [field, code] of checked.issues) at(i, field, code);
      else out.push(checked.portion);
    }
    return hasIssues(issues) ? { issues } : { portions: out };
  }

  /** The draft's full portion list after an edit: the given active ones plus the existing ones left out, removed. */
  const withRemoved = (active: HomeworkPortion[], existing: readonly PortionRow[]): HomeworkPortion[] => {
    const kept = new Set(active.map((p) => p.id));
    return [...active, ...existing.filter((p) => !kept.has(p.id) && p.removed_at === null).map((p) => ({ ...portionOf(p), removed: true }))];
  };

  /** True when the source changed since `base` by anyone but this device's earlier operations (F12 changedSince). */
  async function sourceChanged(tx: Tx, organizationId: string, s: HomeworkSourceVersion, self: { userId: string; deviceId: string; seq: number }): Promise<boolean> {
    const current = s.entity === 'portion_attempt'
      ? await tx.selectFrom('portion_attempts').select('row_version').where('organization_id', '=', organizationId).where('id', '=', s.id).executeTakeFirst()
      : await tx.selectFrom('lesson_portions').select('row_version').where('organization_id', '=', organizationId).where('id', '=', s.id).executeTakeFirst();
    if (!current) return true;
    return (await changedSince(tx, organizationId, s.entity, s.id, s.rowVersion ?? 0, self)).length > 0;
  }

  return {
    entity: 'homework_assignment',
    opTypes: ['CREATE', 'UPDATE'],
    createSchema: z.strictObject(HomeworkAssignmentCreateFields.shape),
    updateSchema: HomeworkAssignmentUpdateFields,
    commands: { CONFIRM_HOMEWORK: ConfirmHomeworkFields },
    fieldSpec: HOMEWORK_ASSIGNMENT_FIELDS,
    // Instructions (assignment and portions) are staff text: `instructions` and `portions` are audited by name only.
    auditValueFields: ['dueDate', 'status'],
    tables: ['homework_portions', 'homework_assignments'],

    async keysForCreate(fields, { tx, organizationId }) {
      const studentId = typeof fields.studentId === 'string' ? fields.studentId : null;
      const date = typeof fields.assignedDate === 'string' && isCalendarDate(fields.assignedDate) ? fields.assignedDate : null;
      if (!studentId || !date) return { studentId: null, classId: null };
      const student = await tx.selectFrom('students').select('id').where('organization_id', '=', organizationId).where('id', '=', studentId).executeTakeFirst();
      if (!student) return { studentId: null, classId: null };
      return { studentId, classId: await classOnDate(tx, organizationId, studentId, date) };
    },

    async prepareCreate(tx, actor, raw) {
      const parsed = HomeworkAssignmentCreateFields.safeParse(raw);
      if (!parsed.success) return refuse(schemaIssues(parsed.error));
      const f = parsed.data;
      const org = actor.organizationId;
      if (!isCalendarDate(f.assignedDate)) return refuse({ assignedDate: 'INVALID' });
      const classId = await classOnDate(tx, org, f.studentId, f.assignedDate);
      if (classId === null) {
        const student = await tx.selectFrom('students').select('id').where('organization_id', '=', org).where('id', '=', f.studentId).executeTakeFirst();
        return student ? refuse({ studentId: 'NOT_ENROLLED' }) : { ok: false, notFound: true };
      }
      if (!(await inDailyScope(tx, actor, classId))) return { ok: false, notFound: true };
      const issues: Issues = {};
      if (f.assignedDate > (await todayFor(tx, org, deps.clock))) issues.assignedDate = 'FUTURE';
      if (f.sourceDailyRecordId !== null) {
        const record = await loadRecordContext(tx, org, f.sourceDailyRecordId);
        if (!record || record.studentId !== f.studentId) issues.sourceDailyRecordId = 'NOT_FOUND';
      }
      let dueDate = f.dueDate;
      if (dueDate !== null && !isCalendarDate(dueDate)) issues.dueDate = 'INVALID';
      else if (dueDate !== null) {
        const issue = dueDateIssue(f.assignedDate, dueDate);
        if (issue) issues.dueDate = issue;
      } else {
        dueDate = await defaultDue(tx, org, classId, f.assignedDate);
        if (dueDate === null) issues.dueDate = 'NO_CLASS_DAY';
      }
      const instructions = cleanInstructions(f.instructions);
      if (instructions !== null && instructions.length > HOMEWORK_INSTRUCTIONS_MAX) {
        issues.instructions = 'TOO_LONG';
        issues['instructions.max'] = String(HOMEWORK_INSTRUCTIONS_MAX);
      }
      const portions = await preparePortions(tx, org, { studentId: f.studentId, assignmentId: null, existing: [] }, f.portions);
      if ('issues' in portions) Object.assign(issues, portions.issues);
      if (hasIssues(issues) || 'issues' in portions) return refuse(issues);
      return {
        ok: true,
        fields: {
          studentId: f.studentId,
          classId,
          sourceDailyRecordId: f.sourceDailyRecordId,
          assignedDate: f.assignedDate,
          dueDate,
          instructions,
          status: 'DRAFT',
          portions: portions.portions,
        },
      };
    },

    async prepareUpdate(tx, actor, row, changes) {
      const org = actor.organizationId;
      if (!row.keys.classId || !(await inDailyScope(tx, actor, row.keys.classId))) return { ok: false, notFound: true };
      const out: Record<string, unknown> = { ...changes };
      if (Object.hasOwn(out, 'status') && out.status === row.fields.status) delete out.status;
      if (Object.keys(out).length === 0) return { ok: true, fields: {} };
      // Confirmed homework is never edited (FR-HW-012); a rejected or superseded one neither.
      if (row.fields.status !== 'DRAFT') return refuse({ status: 'NOT_DRAFT' });
      const issues: Issues = {};
      const loaded = (await loadAssignment(tx, org, row.id))!;

      if (out.status === 'CONFIRMED') {
        // Only a conflict resolution reaches this (the UPDATE schema allows REJECTED only): an explicit confirmation by
        // the resolver, all-or-nothing (F08-AC12).
        const problems = confirmIssues(loaded.portions.map(portionOf), await rangeReference(tx, deps.quran, org));
        if (problems.length) return refuse(Object.fromEntries(problems.map((p) => [p.portionId ? `portions.${p.portionId}.${p.field}` : p.field, p.code])));
        out.confirmedBy = actor.userId;
        out.confirmedAt = deps.clock.now().toISOString();
      } else if (out.status !== undefined && out.status !== 'REJECTED') {
        return refuse({ status: 'INVALID' });
      }
      if (Object.hasOwn(out, 'dueDate')) {
        const due = out.dueDate as string;
        const issue = isCalendarDate(due) ? dueDateIssue(row.fields.assignedDate as string, due) : 'INVALID';
        if (issue) issues.dueDate = issue;
      }
      if (Object.hasOwn(out, 'instructions')) {
        const text = cleanInstructions(out.instructions as string | null);
        if (text !== null && text.length > HOMEWORK_INSTRUCTIONS_MAX) {
          issues.instructions = 'TOO_LONG';
          issues['instructions.max'] = String(HOMEWORK_INSTRUCTIONS_MAX);
        }
        out.instructions = text;
      }
      if (Object.hasOwn(out, 'portions')) {
        const prepared = await preparePortions(tx, org, { studentId: row.keys.studentId as string, assignmentId: row.id, existing: loaded.portions }, out.portions);
        if ('issues' in prepared) Object.assign(issues, prepared.issues);
        else out.portions = withRemoved(prepared.portions, loaded.portions);
      }
      return hasIssues(issues) ? refuse(issues) : { ok: true, fields: out };
    },

    async prepareCommand(tx, actor, row, command, fields, ctx): Promise<CommandOutcome> {
      const org = actor.organizationId;
      if (command !== 'CONFIRM_HOMEWORK') return refuse({ command: 'NOT_SUPPORTED' });
      if (!row.keys.classId || !(await inDailyScope(tx, actor, row.keys.classId))) return { ok: false, notFound: true };
      if (row.fields.status !== 'DRAFT') return refuse({ status: 'NOT_DRAFT' });
      const f = ConfirmHomeworkFields.parse(fields);
      const self = { userId: actor.userId, deviceId: ctx.deviceId, seq: ctx.seq };
      const loaded = (await loadAssignment(tx, org, row.id))!;
      const active = loaded.portions.filter((p) => p.removed_at === null);

      // FR-HW-017: the draft and its sources must be what the device saw. A source the device did not list (a rebuild
      // added it) is a change too.
      const listed = new Set(f.sources.map((s) => `${s.entity}:${s.id}`));
      const unlisted = active.some(
        (p) => (p.source_attempt_id && !listed.has(`portion_attempt:${p.source_attempt_id}`)) || (p.source_lesson_portion_id && !listed.has(`lesson_portion:${p.source_lesson_portion_id}`)),
      );
      let changed = unlisted || (await changedSince(tx, org, 'homework_assignment', row.id, ctx.baseVersion ?? 0, self)).length > 0;
      for (const s of f.sources) {
        if (changed) break;
        changed = await sourceChanged(tx, org, s, self);
      }
      if (changed) return { ok: false, conflict: { device: { status: 'CONFIRMED' }, conflictFields: ['status'] } };

      const problems = confirmIssues(active.map(portionOf), await rangeReference(tx, deps.quran, org));
      if (problems.length) return refuse(Object.fromEntries(problems.map((p) => [p.portionId ? `portions.${p.portionId}.${p.field}` : p.field, p.code])));
      // The device's confirmation time is kept (F08-AC20); a clock ahead of the server's is capped at now.
      const now = deps.clock.now();
      const confirmedAt = new Date(Math.min(Date.parse(f.confirmedAt), now.getTime())).toISOString();
      return { ok: true, fields: { status: 'CONFIRMED', confirmedBy: actor.userId, confirmedAt } };
    },

    async load(tx, organizationId, id, { forUpdate }) {
      const loaded = await loadAssignment(tx, organizationId, id, { forUpdate });
      return loaded ? toRow(loaded) : null;
    },

    async loadMany(tx, organizationId, ids) {
      return (await loadAssignments(tx, organizationId, ids)).map(toRow);
    },

    async insert(tx, organizationId, id, fields, meta) {
      const inserted = await tx
        .insertInto('homework_assignments')
        .values({
          id,
          organization_id: organizationId,
          student_id: fields.studentId as string,
          class_id: fields.classId as string,
          source_daily_record_id: (fields.sourceDailyRecordId as string | null) ?? null,
          assigned_date: fields.assignedDate as string,
          due_date: fields.dueDate as string,
          status: 'DRAFT',
          revision_of: null,
          instructions: (fields.instructions as string | null) ?? null,
          created_by: meta.actorUserId,
          created_at: meta.at,
          updated_at: meta.at,
          updated_by: meta.actorUserId,
          confirmed_by: null,
          confirmed_at: null,
          rejected_by: null,
          rejected_at: null,
          superseded_by_user: null,
          superseded_at: null,
          row_version: 1,
        })
        .onConflict((oc) => oc.column('id').doNothing())
        .returning('id')
        .executeTakeFirst();
      if (inserted === undefined) return false;
      await writePortions(tx, organizationId, id, fields.portions as HomeworkPortion[], [], meta.at);
      return true;
    },

    async update(tx, organizationId, id, changes, rowVersion, meta) {
      // Portions first: the database refuses portion writes once the assignment is no longer a draft.
      if (Object.hasOwn(changes, 'portions')) {
        const existing = await tx.selectFrom('homework_portions').selectAll().where('organization_id', '=', organizationId).where('assignment_id', '=', id).execute();
        await writePortions(tx, organizationId, id, changes.portions as HomeworkPortion[], existing, meta.at);
      }
      const set: Record<string, unknown> = { updated_at: meta.at, updated_by: meta.actorUserId, row_version: rowVersion };
      for (const [field, value] of Object.entries(changes)) {
        switch (field) {
          case 'dueDate':
            set.due_date = value;
            break;
          case 'instructions':
            set.instructions = value;
            break;
          case 'status':
            set.status = value;
            if (value === 'REJECTED') Object.assign(set, { rejected_by: meta.actorUserId, rejected_at: meta.at });
            if (value === 'CONFIRMED') Object.assign(set, { confirmed_by: (changes.confirmedBy as string | undefined) ?? meta.actorUserId, confirmed_at: new Date((changes.confirmedAt as string | undefined) ?? meta.at.toISOString()) });
            break;
          case 'confirmedBy':
          case 'confirmedAt':
          case 'portions':
            break;
          default:
            throw new Error(`homework_assignment: field ${field} is not updatable`);
        }
      }
      await tx.updateTable('homework_assignments').set(set).where('organization_id', '=', organizationId).where('id', '=', id).execute();
    },

    // Safe for conflict lists: dates and status, never instructions.
    label: (row) => `Homework · ${String(row.fields.assignedDate)} → ${String(row.fields.dueDate)} · ${String(row.fields.status)}`,

    async audit(tx: Tx, change: AppliedChange) {
      await auditChange(tx, change, change.opType === 'COMMAND' ? 'COMMAND' : change.opType);
    },

    async auditResolution(tx: Tx, change: AppliedChange) {
      if (change.changes.status === 'CONFIRMED' || change.changes.status === 'REJECTED') await auditChange(tx, change, 'RESOLUTION');
    },
  };
}

async function auditChange(tx: Tx, change: AppliedChange, via: 'CREATE' | 'UPDATE' | 'COMMAND' | 'RESOLUTION'): Promise<void> {
  const org = change.actor.organizationId;
  const a = await tx
    .selectFrom('homework_assignments')
    .select(['student_id', 'class_id', 'assigned_date', 'due_date', 'status', 'confirmed_by', 'confirmed_at', 'source_daily_record_id'])
    .where('organization_id', '=', org)
    .where('id', '=', change.entityId)
    .executeTakeFirstOrThrow();
  const portions = await tx
    .selectFrom('homework_portions')
    .select(['origin'])
    .where('organization_id', '=', org)
    .where('assignment_id', '=', change.entityId)
    .where('removed_at', 'is', null)
    .execute();
  const origins = { SUGGESTED: 0, TEACHER_EDITED: 0, TEACHER_ADDED: 0 };
  for (const p of portions) origins[p.origin] += 1;
  const action =
    via === 'CREATE'
      ? 'HOMEWORK_DRAFT_CREATED'
      : a.status === 'CONFIRMED' && (via === 'COMMAND' || via === 'RESOLUTION')
        ? 'HOMEWORK_CONFIRMED'
        : a.status === 'REJECTED' && change.changes.status === 'REJECTED'
          ? 'HOMEWORK_REJECTED'
          : 'HOMEWORK_DRAFT_UPDATED';
  await recordAudit(tx, {
    organizationId: org,
    actorUserId: change.actor.userId,
    action,
    targetType: 'HOMEWORK_ASSIGNMENT',
    targetId: change.entityId,
    summary: {
      studentId: a.student_id,
      classId: a.class_id,
      sourceDailyRecordId: a.source_daily_record_id,
      assignedDate: a.assigned_date,
      dueDate: a.due_date,
      status: a.status,
      ...(a.status === 'CONFIRMED' ? { confirmedBy: a.confirmed_by, confirmedAt: a.confirmed_at?.toISOString() ?? null } : {}),
      portionCount: portions.length,
      origins,
      rowVersion: change.rowVersion,
      ...(via === 'RESOLUTION' ? { via: 'CONFLICT_RESOLUTION' } : {}),
      // Field names only: instructions are staff text (ARCHITECTURE.md §15).
      fields: Object.keys(change.changes).filter((k) => k !== 'confirmedBy' && k !== 'confirmedAt').sort(),
    },
    at: change.at,
  });
}

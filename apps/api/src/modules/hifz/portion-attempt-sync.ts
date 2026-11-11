// The `portion_attempt` sync handler (F05; US-018, US-020…023; FR-ATT-001…008, FR-ATT-011, FR-QTY-007, FR-QTY-008,
// FR-DAY-009, FR-DAY-011; F05-AC5, AC10, AC14…AC16, AC19, AC22).
//
// - CREATE adds one attempt to a portion; earlier attempts are never changed (append-only history, F05-AC15). The
//   attempt number must be unused on the portion (`attemptNo: ATTEMPT_NO_TAKEN`); a removed portion takes no new
//   attempt (`lessonPortionId: PORTION_REMOVED`). Attendance on the record's date must allow Hifz (FR-DAY-011).
// - Mistakes travel inside the attempt (plan §7.4) and are written to attempt_mistakes in the same transaction.
// - The status defaults come from the domain (`normalizeAttempt`): NOT_REMEMBERED with no completed → 0 completed;
//   COMPLETED with no completed → the assigned quantity (plan §7.2); otherwise a missing completed stays null.
//   Quality only on a recitation (FR-ATT-007); "No mistakes" excludes a mistake list (FR-ATT-011).
// - UPDATE is an audited correction of that attempt through F12 conflict detection: the outcome group (status,
//   completed, quality, noMistakes, mistakes) conflicts as a unit; never last-write-wins. A corrected mistake list
//   replaces the old rows by detaching them (superseded_at), never deleting them.
// - Remarks are internal staff text: never logged, audited by field name only, never sent to a Student or Parent.
import { v7 as uuidv7 } from 'uuid';
import { z } from 'zod';
import { PortionAttemptCreateFields, PortionAttemptUpdateFields, type MistakeValue } from '@hifz/contracts';
import {
  PORTION_ATTEMPT_FIELDS,
  REMARKS_MAX,
  mistakeCount,
  normalizeAttempt,
  portionsAllowed,
  validateAttemptFields,
  type PortionDraft,
  type PortionStatus,
} from '@hifz/domain/hifz';
import { valuesEqual } from '@hifz/domain/sync';
import type { Quantity } from '@hifz/domain/quantity';
import type { PortionAttemptsTable, Tx } from '../../platform/db.ts';
import { recordAudit } from '../audit/audit.ts';
import type { AppliedChange, Prepared, SyncHandler, SyncRow, WriteMeta } from '../sync/handler.ts';
import {
  UUID,
  attendanceOn,
  canonical,
  cleanRemarks,
  enrolledFor,
  hasIssues,
  inDailyScope,
  loadPortionContext,
  portionIssues,
  quantityOf,
  schemaIssues,
  type Issues,
  type PortionContext,
} from './shared.ts';

type Row = Pick<
  PortionAttemptsTable,
  'id' | 'lesson_portion_id' | 'attempt_no' | 'attempted_at' | 'recorded_by' | 'status' | 'completed_unit' | 'completed_num' | 'completed_den' | 'quality' | 'no_mistakes' | 'remarks'
> & { row_version: string | number; student_id: string; class_id: string };

const COLUMNS = [
  'a.id',
  'a.lesson_portion_id',
  'a.attempt_no',
  'a.attempted_at',
  'a.recorded_by',
  'a.status',
  'a.completed_unit',
  'a.completed_num',
  'a.completed_den',
  'a.quality',
  'a.no_mistakes',
  'a.remarks',
  'a.row_version',
  'r.student_id',
  'r.class_id',
] as const;

const OUTCOME = ['status', 'completed', 'quality', 'noMistakes', 'mistakes'] as const;

const toRow = (r: Row, mistakes: MistakeValue[]): SyncRow => ({
  id: r.id,
  rowVersion: Number(r.row_version),
  fields: {
    lessonPortionId: r.lesson_portion_id,
    attemptNo: r.attempt_no,
    attemptedAt: r.attempted_at.toISOString(),
    recordedBy: r.recorded_by,
    status: r.status,
    completed: quantityOf(r.completed_unit, r.completed_num, r.completed_den),
    quality: r.quality,
    noMistakes: r.no_mistakes,
    mistakes,
    remarks: r.remarks,
  },
  keys: { studentId: r.student_id, classId: r.class_id },
});

const draftOf = (p: PortionContext['portion']): PortionDraft => ({
  section: p.section,
  position: p.position,
  paraNumber: p.paraNumber,
  range: p.range ? { ...p.range } : null,
  totalLines: p.totalLines,
  assigned: p.assigned,
});

/** Current (not superseded) mistakes of the given attempts, in position order, keyed by attempt. */
export async function currentMistakes(tx: Tx, organizationId: string, attemptIds: readonly string[]): Promise<Map<string, MistakeValue[]>> {
  const out = new Map<string, MistakeValue[]>();
  if (attemptIds.length === 0) return out;
  const rows = await tx
    .selectFrom('attempt_mistakes')
    .select(['attempt_id', 'category', 'severity', 'repeated'])
    .where('organization_id', '=', organizationId)
    .where('attempt_id', 'in', [...attemptIds])
    .where('superseded_at', 'is', null)
    .orderBy('attempt_id')
    .orderBy('position')
    .execute();
  for (const r of rows) {
    const list = out.get(r.attempt_id) ?? [];
    list.push({ category: r.category, severity: r.severity, repeated: r.repeated });
    out.set(r.attempt_id, list);
  }
  return out;
}

async function writeMistakes(tx: Tx, organizationId: string, attemptId: string, mistakes: readonly MistakeValue[], meta: WriteMeta): Promise<void> {
  if (mistakes.length === 0) return;
  // Ids are generated here: mistakes are not offline-creatable on their own (F07 may add the separate entity).
  await tx
    .insertInto('attempt_mistakes')
    .values(
      mistakes.map((m, i) => ({
        id: uuidv7(),
        organization_id: organizationId,
        attempt_id: attemptId,
        position: i + 1,
        category: m.category,
        severity: m.severity,
        repeated: m.repeated,
        created_at: meta.at,
        superseded_at: null,
      })),
    )
    .execute();
}

const mistakesOf = (list: readonly MistakeValue[]): MistakeValue[] => list.map((m) => ({ category: m.category, severity: m.severity, repeated: m.repeated }));

export function portionAttemptSyncHandler(): SyncHandler {
  const refuse = (issues: Issues): Prepared => ({ ok: false, issues });

  /** Scope, enrollment, the portion not removed, and (for a new attempt) attendance on the record's date. */
  async function checkPortion(tx: Tx, actor: Parameters<NonNullable<SyncHandler['prepareCreate']>>[1], ctx: PortionContext | null, mode: 'CREATE' | 'CORRECTION'): Promise<Prepared | null> {
    if (!ctx || !(await inDailyScope(tx, actor, ctx.record.classId))) return { ok: false, notFound: true };
    if (!(await enrolledFor(tx, actor.organizationId, ctx.record, mode))) return refuse({ studentId: 'NOT_ENROLLED' });
    if (ctx.portion.removed) return refuse({ lessonPortionId: 'PORTION_REMOVED' });
    if (mode === 'CREATE') {
      const allowed = portionsAllowed(await attendanceOn(tx, actor.organizationId, ctx.record.studentId, ctx.record.reportDate));
      if (allowed !== 'ALLOWED') return refuse({ attendance: allowed === 'CHANGE_TO_LATE' ? 'ATTENDANCE_CHANGE_TO_LATE' : 'ATTENDANCE_REQUIRED' });
    }
    return null;
  }

  /** The outcome against the portion and the status rules; returns the normalized completed quantity. */
  function checkOutcome(
    portion: PortionContext['portion'],
    a: { status: PortionStatus; completed: Quantity | null; quality: number | null; noMistakes: boolean; mistakes: readonly MistakeValue[]; remarks: string | null },
  ): { issues: Issues } | { completed: Quantity | null } {
    const issues = portionIssues(validateAttemptFields(draftOf(portion), { status: a.status, completed: a.completed, quality: a.quality, noMistakes: a.noMistakes, mistakes: a.mistakes, remarks: a.remarks }));
    if (a.remarks !== null && a.remarks.length > REMARKS_MAX) {
      issues.remarks ??= 'TOO_LONG';
      issues['remarks.max'] ??= String(REMARKS_MAX);
    }
    if (hasIssues(issues)) return { issues };
    const normalized = normalizeAttempt({ status: a.status, assigned: portion.assigned, completed: a.completed, quality: a.quality });
    return { completed: normalized.completed ? canonical(normalized.completed) : null };
  }

  return {
    entity: 'portion_attempt',
    opTypes: ['CREATE', 'UPDATE'],
    createSchema: z.strictObject(PortionAttemptCreateFields.shape),
    updateSchema: z.strictObject(PortionAttemptUpdateFields.shape),
    fieldSpec: PORTION_ATTEMPT_FIELDS,
    // Remarks are internal text and never appear by value; every other field may.
    auditValueFields: ['attemptNo', 'attemptedAt', 'status', 'completed', 'quality', 'noMistakes', 'mistakes'],
    tables: [],
    async keysForCreate(fields, { tx, organizationId }) {
      const ctx = typeof fields.lessonPortionId === 'string' ? await loadPortionContext(tx, organizationId, fields.lessonPortionId) : null;
      return ctx ? { studentId: ctx.record.studentId, classId: ctx.record.classId } : { studentId: null, classId: null };
    },

    async prepareCreate(tx, actor, raw) {
      const parsed = PortionAttemptCreateFields.safeParse(raw);
      if (!parsed.success) return refuse(schemaIssues(parsed.error));
      const f = parsed.data;
      const ctx = await loadPortionContext(tx, actor.organizationId, f.lessonPortionId);
      const refused = await checkPortion(tx, actor, ctx, 'CREATE');
      if (refused) return refused;
      const portion = ctx!.portion;
      const taken = await tx
        .selectFrom('portion_attempts')
        .select('id')
        .where('organization_id', '=', actor.organizationId)
        .where('lesson_portion_id', '=', portion.id)
        .where('attempt_no', '=', f.attemptNo)
        .executeTakeFirst();
      if (taken) return refuse({ attemptNo: 'ATTEMPT_NO_TAKEN' });
      const remarks = cleanRemarks(f.remarks);
      const mistakes = mistakesOf(f.mistakes);
      const checked = checkOutcome(portion, { status: f.status, completed: f.completed, quality: f.quality, noMistakes: f.noMistakes, mistakes, remarks });
      if ('issues' in checked) return refuse(checked.issues);
      return {
        ok: true,
        fields: {
          lessonPortionId: portion.id,
          attemptNo: f.attemptNo,
          attemptedAt: new Date(f.attemptedAt).toISOString(),
          status: f.status,
          completed: checked.completed,
          quality: f.quality,
          noMistakes: f.noMistakes,
          mistakes,
          remarks,
        },
      };
    },

    async prepareUpdate(tx, actor, row, changes) {
      const ctx = await loadPortionContext(tx, actor.organizationId, row.fields.lessonPortionId as string);
      const refused = await checkPortion(tx, actor, ctx, 'CORRECTION');
      if (refused) return refused;
      const portion = ctx!.portion;
      const out: Record<string, unknown> = { ...changes };
      if (Object.hasOwn(changes, 'remarks')) out.remarks = cleanRemarks(changes.remarks as string | null);
      if (Object.hasOwn(changes, 'attemptedAt')) out.attemptedAt = new Date(changes.attemptedAt as string).toISOString();
      if (Object.hasOwn(changes, 'mistakes')) out.mistakes = mistakesOf(changes.mistakes as MistakeValue[]);
      const merged = { ...row.fields, ...out };
      const status = merged.status as PortionStatus;
      const quality = (merged.quality as number | null) ?? null;
      const mistakes = (merged.mistakes as MistakeValue[]) ?? [];
      const issues: Issues = {};
      if (quality !== null && ['ABSENT', 'NOT_ASSIGNED', 'PENDING'].includes(status)) issues.quality = 'QUALITY_NOT_ALLOWED';
      if (merged.noMistakes === true && mistakes.length > 0) issues.mistakes = 'NO_MISTAKES_CONFLICT';
      if (hasIssues(issues)) return refuse(issues);
      if (OUTCOME.some((k) => Object.hasOwn(changes, k)) || Object.hasOwn(changes, 'remarks')) {
        const checked = checkOutcome(portion, {
          status,
          completed: (merged.completed as Quantity | null) ?? null,
          quality,
          noMistakes: merged.noMistakes === true,
          mistakes,
          remarks: (merged.remarks as string | null) ?? null,
        });
        if ('issues' in checked) return refuse(checked.issues);
        if (OUTCOME.some((k) => Object.hasOwn(changes, k))) {
          // The status default (NOT_REMEMBERED → 0, COMPLETED → assigned) applies to a correction too (F05-AC14).
          if (valuesEqual(checked.completed, row.fields.completed)) delete out.completed;
          else out.completed = checked.completed;
        }
      }
      return { ok: true, fields: out };
    },

    async load(tx, organizationId, id, { forUpdate }) {
      if (!UUID.test(id)) return null;
      let q = tx
        .selectFrom('portion_attempts as a')
        .innerJoin('lesson_portions as p', (j) => j.onRef('p.id', '=', 'a.lesson_portion_id').onRef('p.organization_id', '=', 'a.organization_id'))
        .innerJoin('daily_records as r', (j) => j.onRef('r.id', '=', 'p.daily_record_id').onRef('r.organization_id', '=', 'p.organization_id'))
        .select(COLUMNS)
        .where('a.organization_id', '=', organizationId)
        .where('a.id', '=', id);
      if (forUpdate) q = q.forUpdate('a');
      const r = await q.executeTakeFirst();
      if (!r) return null;
      return toRow(r, (await currentMistakes(tx, organizationId, [r.id])).get(r.id) ?? []);
    },

    async loadMany(tx, organizationId, ids) {
      if (ids.length === 0) return [];
      const rows = await tx
        .selectFrom('portion_attempts as a')
        .innerJoin('lesson_portions as p', (j) => j.onRef('p.id', '=', 'a.lesson_portion_id').onRef('p.organization_id', '=', 'a.organization_id'))
        .innerJoin('daily_records as r', (j) => j.onRef('r.id', '=', 'p.daily_record_id').onRef('r.organization_id', '=', 'p.organization_id'))
        .select(COLUMNS)
        .where('a.organization_id', '=', organizationId)
        .where('a.id', 'in', [...ids])
        .execute();
      const mistakes = await currentMistakes(tx, organizationId, rows.map((r) => r.id));
      return rows.map((r) => toRow(r, mistakes.get(r.id) ?? []));
    },

    async insert(tx, organizationId, id, fields, meta) {
      const completed = fields.completed as Quantity | null;
      const inserted = await tx
        .insertInto('portion_attempts')
        .values({
          id,
          organization_id: organizationId,
          lesson_portion_id: fields.lessonPortionId as string,
          attempt_no: fields.attemptNo as number,
          attempted_at: new Date(fields.attemptedAt as string),
          recorded_by: meta.actorUserId,
          status: fields.status as PortionStatus,
          completed_unit: completed?.unit ?? null,
          completed_num: completed?.numerator ?? null,
          completed_den: completed?.denominator ?? null,
          quality: (fields.quality as number | null) ?? null,
          no_mistakes: fields.noMistakes as boolean,
          remarks: (fields.remarks as string | null) ?? null,
          created_at: meta.at,
          updated_at: meta.at,
          updated_by: meta.actorUserId,
          row_version: 1,
        })
        .onConflict((oc) => oc.column('id').doNothing())
        .returning('id')
        .executeTakeFirst();
      if (inserted === undefined) return false;
      await writeMistakes(tx, organizationId, id, fields.mistakes as MistakeValue[], meta);
      return true;
    },

    async update(tx, organizationId, id, changes, rowVersion, meta) {
      const set: Record<string, unknown> = { updated_at: meta.at, updated_by: meta.actorUserId, row_version: rowVersion };
      for (const [field, value] of Object.entries(changes)) {
        switch (field) {
          case 'attemptedAt':
            set.attempted_at = new Date(value as string);
            break;
          case 'status':
            set.status = value;
            break;
          case 'completed': {
            const q = value as Quantity | null;
            Object.assign(set, { completed_unit: q?.unit ?? null, completed_num: q?.numerator ?? null, completed_den: q?.denominator ?? null });
            break;
          }
          case 'quality':
            set.quality = value;
            break;
          case 'noMistakes':
            set.no_mistakes = value;
            break;
          case 'remarks':
            set.remarks = value;
            break;
          case 'mistakes':
            break;
          default:
            throw new Error(`portion_attempt: field ${field} is not updatable`);
        }
      }
      await tx.updateTable('portion_attempts').set(set).where('organization_id', '=', organizationId).where('id', '=', id).execute();
      if (Object.hasOwn(changes, 'mistakes')) {
        // The old list is detached, never deleted (history is kept); the new list becomes current.
        await tx.updateTable('attempt_mistakes').set({ superseded_at: meta.at }).where('organization_id', '=', organizationId).where('attempt_id', '=', id).where('superseded_at', 'is', null).execute();
        await writeMistakes(tx, organizationId, id, changes.mistakes as MistakeValue[], meta);
      }
    },

    // Safe for conflict lists: attempt number and status, never a remark.
    label: (row) => `Attempt ${String(row.fields.attemptNo)} · ${String(row.fields.status)}`,

    async audit(tx: Tx, change: AppliedChange) {
      const org = change.actor.organizationId;
      const a = await tx
        .selectFrom('portion_attempts as a')
        .innerJoin('lesson_portions as p', (j) => j.onRef('p.id', '=', 'a.lesson_portion_id').onRef('p.organization_id', '=', 'a.organization_id'))
        .innerJoin('daily_records as r', (j) => j.onRef('r.id', '=', 'p.daily_record_id').onRef('r.organization_id', '=', 'p.organization_id'))
        .select(['a.lesson_portion_id', 'a.attempt_no', 'a.status', 'a.completed_unit', 'a.completed_num', 'a.completed_den', 'a.quality', 'a.no_mistakes', 'p.daily_record_id', 'p.section', 'r.student_id', 'r.report_date'])
        .where('a.organization_id', '=', org)
        .where('a.id', '=', change.entityId)
        .executeTakeFirstOrThrow();
      const mistakes = (await currentMistakes(tx, org, [change.entityId])).get(change.entityId) ?? [];
      await recordAudit(tx, {
        organizationId: org,
        actorUserId: change.actor.userId,
        action: change.opType === 'CREATE' ? 'PORTION_ATTEMPT_CREATED' : 'PORTION_ATTEMPT_CORRECTED',
        targetType: 'PORTION_ATTEMPT',
        targetId: change.entityId,
        summary: {
          lessonPortionId: a.lesson_portion_id,
          dailyRecordId: a.daily_record_id,
          studentId: a.student_id,
          reportDate: a.report_date,
          section: a.section,
          attemptNo: a.attempt_no,
          status: a.status,
          completed: quantityOf(a.completed_unit, a.completed_num, a.completed_den),
          quality: a.quality,
          mistakeCount: mistakeCount({ noMistakes: a.no_mistakes, mistakes }),
          rowVersion: change.rowVersion,
          // Field names only for remarks: internal staff text (ARCHITECTURE.md §15).
          fields: Object.keys(change.changes).sort(),
        },
        at: change.at,
      });
    },
  };
}

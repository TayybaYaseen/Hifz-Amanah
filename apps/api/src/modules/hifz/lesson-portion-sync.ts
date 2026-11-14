// The `lesson_portion` sync handler (F05; US-018, US-020…022; FR-DAY-003…005, FR-DAY-011, FR-SAB-001…004,
// FR-SAB-008…010, FR-SBQ-001…004, FR-MNZ-001…004, FR-QTY-004…010; F05-AC3, AC10…AC14, AC18, AC20…AC22).
//
// - The portion belongs to a daily record; its scope keys (student, class) are the record's. A record outside the
//   caller's scope, or in another madrasa, is NOT_FOUND.
// - CREATE needs the student's attendance on the record's date to be Present, Late, or Half day (FR-DAY-011):
//   `attendance: ATTENDANCE_CHANGE_TO_LATE` for Absent/Leave, `attendance: ATTENDANCE_REQUIRED` when unmarked.
// - Sabaq (lines only, one Surah): the range is checked against the madrasa's active Quran metadata (never guessed;
//   with none loaded, `range: METADATA_UNAVAILABLE`); the Para is derived on the server and a client Para is refused
//   (`paraNumber: SABAQ_PARA_NOT_ACCEPTED`); the line-count edition is the madrasa's; Total Lines' source is LAYOUT
//   when it equals the usable layout's count, else MANUAL (FR-SAB-008). A Para unit is refused, never converted
//   (FR-SAB-010, F05-AC20). When the Assigned Lines are not sent, they default to Total Lines (F05-AC21).
// - UPDATE is an audited correction through F12 conflict detection (never last-write-wins). `removed: true` removes
//   the portion: its row and attempts stay (audited LESSON_PORTION_REMOVED). A removed portion is not edited again.
// - There is no edit lock: an old record can be corrected (FR-DAY-009, F05-AC19).
import { z } from 'zod';
import { LessonPortionCreateFields, LessonPortionUpdateFields } from '@hifz/contracts';
import {
  LESSON_PORTION_FIELDS,
  deriveSabaqPara,
  portionsAllowed,
  totalLinesSource,
  validatePortionFields,
  type PortionDraft,
  type RangeReference,
} from '@hifz/domain/hifz';
import { validateQuantities, type Quantity } from '@hifz/domain/quantity';
import type { LessonPortionsTable, Tx } from '../../platform/db.ts';
import { recordAudit } from '../audit/audit.ts';
import type { Actor } from '../identity/auth-service.ts';
import type { QuranMetadataService } from '../quran-ref/metadata-service.ts';
import type { AppliedChange, Prepared, SyncHandler, SyncRow } from '../sync/handler.ts';
import {
  UUID,
  attendanceOn,
  canonical,
  enrolledFor,
  hasIssues,
  inDailyScope,
  loadRecordContext,
  portionIssues,
  rangeOf,
  rangeReference,
  schemaIssues,
  type Issues,
  type RangeValue,
  type RecordContext,
} from './shared.ts';

type Row = Pick<
  LessonPortionsTable,
  | 'id'
  | 'daily_record_id'
  | 'section'
  | 'position'
  | 'is_extra'
  | 'para_number'
  | 'surah_start'
  | 'ayah_start'
  | 'surah_end'
  | 'ayah_end'
  | 'assigned_unit'
  | 'assigned_num'
  | 'assigned_den'
  | 'total_lines'
  | 'total_lines_source'
  | 'line_count_edition'
  | 'removed_at'
> & { row_version: string | number; student_id: string; class_id: string };

const COLUMNS = [
  'p.id',
  'p.daily_record_id',
  'p.section',
  'p.position',
  'p.is_extra',
  'p.para_number',
  'p.surah_start',
  'p.ayah_start',
  'p.surah_end',
  'p.ayah_end',
  'p.assigned_unit',
  'p.assigned_num',
  'p.assigned_den',
  'p.total_lines',
  'p.total_lines_source',
  'p.line_count_edition',
  'p.removed_at',
  'p.row_version',
  'r.student_id',
  'r.class_id',
] as const;

const toRow = (r: Row): SyncRow => ({
  id: r.id,
  rowVersion: Number(r.row_version),
  fields: {
    dailyRecordId: r.daily_record_id,
    section: r.section,
    position: r.position,
    isExtra: r.is_extra,
    paraNumber: r.para_number,
    range: rangeOf(r),
    assigned: { unit: r.assigned_unit, numerator: r.assigned_num, denominator: r.assigned_den },
    totalLines: r.total_lines,
    totalLinesSource: r.total_lines_source,
    lineCountEdition: r.line_count_edition,
    removed: r.removed_at !== null,
  },
  keys: { studentId: r.student_id, classId: r.class_id },
});

const GROUP = ['paraNumber', 'range', 'totalLines', 'totalLinesSource', 'assigned'] as const;

/**
 * Sabaq Assigned Lines default to Total Lines when not sent (F05-AC21, `defaultAssignedLines`). Applied before the
 * strict schema, so the contract type keeps `assigned` required for the app.
 */
const withSabaqDefault = (input: unknown): unknown => {
  if (typeof input !== 'object' || input === null) return input;
  const f = input as Record<string, unknown>;
  if (f.section === 'SABAQ' && (f.assigned === undefined || f.assigned === null) && typeof f.totalLines === 'number' && Number.isSafeInteger(f.totalLines) && f.totalLines > 0) {
    return { ...f, assigned: { unit: 'LINES', numerator: f.totalLines, denominator: 1 } };
  }
  return input;
};

const draftOf = (f: Record<string, unknown>, position: number): PortionDraft => {
  const range = f.range as RangeValue | null;
  return {
    section: f.section as PortionDraft['section'],
    position,
    isExtra: f.isExtra as boolean,
    paraNumber: f.section === 'SABAQ' ? null : ((f.paraNumber as number | null) ?? null),
    range: range ? { ...range } : null,
    totalLines: (f.totalLines as number | null) ?? null,
    assigned: f.assigned as Quantity,
  };
};

export interface LessonPortionSyncDeps {
  quran: QuranMetadataService;
}

export function lessonPortionSyncHandler(deps: LessonPortionSyncDeps): SyncHandler {
  const refuse = (issues: Issues): Prepared => ({ ok: false, issues });

  async function rowOf(tx: Tx, organizationId: string, id: string, forUpdate: boolean): Promise<Row | undefined> {
    let q = tx
      .selectFrom('lesson_portions as p')
      .innerJoin('daily_records as r', (j) => j.onRef('r.id', '=', 'p.daily_record_id').onRef('r.organization_id', '=', 'p.organization_id'))
      .select(COLUMNS)
      .where('p.organization_id', '=', organizationId)
      .where('p.id', '=', id);
    if (forUpdate) q = q.forUpdate('p');
    return q.executeTakeFirst();
  }

  /**
   * The portion's own fields against the section rules and, when a range is given, the madrasa's metadata. Sabaq
   * gets its derived Para, edition, and Total Lines source. Returns the server-derived fields to write.
   */
  async function checkPortion(tx: Tx, organizationId: string, f: Record<string, unknown>, position: number): Promise<{ issues: Issues } | { derived: Record<string, unknown> }> {
    const sabaq = f.section === 'SABAQ';
    const range = f.range as RangeValue | null;
    let ref: RangeReference | null = null;
    if (sabaq || range !== null) {
      ref = await rangeReference(tx, deps.quran, organizationId);
      // A Sabaq range is never accepted unchecked (FR-SAB-007, FR-SAB-009).
      if (sabaq && ref === null) return { issues: { range: 'METADATA_UNAVAILABLE' } };
    }
    if (!sabaq && f.totalLinesSource !== null && f.totalLinesSource !== undefined) return { issues: { totalLinesSource: 'NOT_ALLOWED' } };
    const issues = portionIssues(validatePortionFields(draftOf(f, position), ref));
    if (hasIssues(issues)) return { issues };
    if (!sabaq || !range || !ref) return { derived: {} };
    const paraNumber = deriveSabaqPara(range, ref);
    if (paraNumber === null) return { issues: { range: 'PARA_UNKNOWN' } };
    const counted = await deps.quran.countLinesFor(tx, organizationId, { surah: range.surahStart, ayahStart: range.ayahStart, ayahEnd: range.ayahEnd });
    return {
      derived: {
        paraNumber,
        lineCountEdition: counted.edition,
        totalLinesSource: totalLinesSource(f.totalLines as number, counted.totalLines),
      },
    };
  }

  /** Scope, enrollment, and (for new portions) attendance on the record's date. */
  async function checkRecord(tx: Tx, actor: Actor, record: RecordContext | null, mode: 'CREATE' | 'CORRECTION'): Promise<Prepared | null> {
    if (!record || !(await inDailyScope(tx, actor, record.classId))) return { ok: false, notFound: true };
    if (!(await enrolledFor(tx, actor.organizationId, record, mode))) return refuse({ studentId: 'NOT_ENROLLED' });
    if (mode === 'CREATE') {
      const allowed = portionsAllowed(await attendanceOn(tx, actor.organizationId, record.studentId, record.reportDate));
      if (allowed !== 'ALLOWED') return refuse({ attendance: allowed === 'CHANGE_TO_LATE' ? 'ATTENDANCE_CHANGE_TO_LATE' : 'ATTENDANCE_REQUIRED' });
    }
    return null;
  }

  return {
    entity: 'lesson_portion',
    opTypes: ['CREATE', 'UPDATE'],
    createSchema: z.preprocess(withSabaqDefault, z.strictObject(LessonPortionCreateFields.shape)),
    updateSchema: z.strictObject(LessonPortionUpdateFields.shape),
    fieldSpec: LESSON_PORTION_FIELDS,
    // Portions carry no free text: every field may appear in audit summaries.
    auditValueFields: ['position', 'isExtra', 'paraNumber', 'range', 'assigned', 'totalLines', 'totalLinesSource', 'lineCountEdition', 'removed'],
    tables: [],
    async keysForCreate(fields, { tx, organizationId }) {
      const record = typeof fields.dailyRecordId === 'string' ? await loadRecordContext(tx, organizationId, fields.dailyRecordId) : null;
      return record ? { studentId: record.studentId, classId: record.classId } : { studentId: null, classId: null };
    },

    async prepareCreate(tx, actor, raw) {
      const parsed = LessonPortionCreateFields.safeParse(withSabaqDefault(raw));
      if (!parsed.success) return refuse(schemaIssues(parsed.error));
      const f = parsed.data;
      const refused = await checkRecord(tx, actor, await loadRecordContext(tx, actor.organizationId, f.dailyRecordId), 'CREATE');
      if (refused) return refused;
      const fields: Record<string, unknown> = {
        dailyRecordId: f.dailyRecordId,
        section: f.section,
        position: f.position,
        isExtra: f.isExtra,
        paraNumber: f.paraNumber,
        range: f.range ? { surahStart: f.range.surahStart, ayahStart: f.range.ayahStart, surahEnd: f.range.surahEnd, ayahEnd: f.range.ayahEnd } : null,
        assigned: f.assigned,
        totalLines: f.totalLines,
        totalLinesSource: f.totalLinesSource,
        lineCountEdition: null,
      };
      const checked = await checkPortion(tx, actor.organizationId, fields, f.position);
      if ('issues' in checked) return refuse(checked.issues);
      return { ok: true, fields: { ...fields, assigned: canonical(f.assigned), ...checked.derived, removed: false } };
    },

    async prepareUpdate(tx, actor, row, changes) {
      if (row.fields.removed === true) return refuse({ removed: 'PORTION_REMOVED' });
      const refused = await checkRecord(tx, actor, await loadRecordContext(tx, actor.organizationId, row.fields.dailyRecordId as string), 'CORRECTION');
      if (refused) return refused;
      const sabaq = row.fields.section === 'SABAQ';
      // The server derives a Sabaq Para; a client value is refused, never trusted (FR-SAB-001). Null is accepted
      // (the app sends the group with paraNumber null) and replaced by the derived Para.
      if (sabaq && changes.paraNumber !== undefined && changes.paraNumber !== null) return refuse({ paraNumber: 'SABAQ_PARA_NOT_ACCEPTED' });
      const out: Record<string, unknown> = { ...changes };
      if (sabaq) delete out.paraNumber;
      const merged = { ...row.fields, ...changes };
      const position = (merged.position as number) ?? 1;
      if (GROUP.some((k) => Object.hasOwn(changes, k))) {
        const checked = await checkPortion(tx, actor.organizationId, merged, position);
        if ('issues' in checked) return refuse(checked.issues);
        Object.assign(out, checked.derived);
        if (out.assigned) out.assigned = canonical(out.assigned as Quantity);
        // Every recorded attempt must still fit the assigned quantity (same unit, completed ≤ assigned).
        const issue = await attemptsMisfit(tx, actor.organizationId, row.id, merged);
        if (issue) return refuse({ assigned: issue });
      }
      if (out.removed !== undefined && out.removed !== true) delete out.removed;
      return { ok: true, fields: out };
    },

    async load(tx, organizationId, id, { forUpdate }) {
      if (!UUID.test(id)) return null;
      const r = await rowOf(tx, organizationId, id, forUpdate);
      return r ? toRow(r) : null;
    },

    async loadMany(tx, organizationId, ids) {
      if (ids.length === 0) return [];
      const rows = await tx
        .selectFrom('lesson_portions as p')
        .innerJoin('daily_records as r', (j) => j.onRef('r.id', '=', 'p.daily_record_id').onRef('r.organization_id', '=', 'p.organization_id'))
        .select(COLUMNS)
        .where('p.organization_id', '=', organizationId)
        .where('p.id', 'in', [...ids])
        .execute();
      return rows.map(toRow);
    },

    async insert(tx, organizationId, id, fields, meta) {
      const range = fields.range as RangeValue | null;
      const assigned = fields.assigned as Quantity;
      const inserted = await tx
        .insertInto('lesson_portions')
        .values({
          id,
          organization_id: organizationId,
          daily_record_id: fields.dailyRecordId as string,
          section: fields.section as LessonPortionsTable['section'],
          position: fields.position as number,
          is_extra: fields.isExtra as boolean,
          para_number: (fields.paraNumber as number | null) ?? null,
          surah_start: range?.surahStart ?? null,
          ayah_start: range?.ayahStart ?? null,
          surah_end: range?.surahEnd ?? null,
          ayah_end: range?.ayahEnd ?? null,
          assigned_unit: assigned.unit,
          assigned_num: assigned.numerator,
          assigned_den: assigned.denominator,
          total_lines: (fields.totalLines as number | null) ?? null,
          total_lines_source: (fields.totalLinesSource as LessonPortionsTable['total_lines_source']) ?? null,
          line_count_edition: (fields.lineCountEdition as string | null) ?? null,
          removed_at: null,
          removed_by: null,
          created_by: meta.actorUserId,
          created_at: meta.at,
          updated_at: meta.at,
          updated_by: meta.actorUserId,
          row_version: 1,
        })
        .onConflict((oc) => oc.column('id').doNothing())
        .returning('id')
        .executeTakeFirst();
      return inserted !== undefined;
    },

    async update(tx, organizationId, id, changes, rowVersion, meta) {
      const set: Record<string, unknown> = { updated_at: meta.at, updated_by: meta.actorUserId, row_version: rowVersion };
      for (const [field, value] of Object.entries(changes)) {
        switch (field) {
          case 'position':
            set.position = value;
            break;
          case 'isExtra':
            set.is_extra = value;
            break;
          case 'paraNumber':
            set.para_number = value;
            break;
          case 'range': {
            const r = value as RangeValue | null;
            Object.assign(set, { surah_start: r?.surahStart ?? null, ayah_start: r?.ayahStart ?? null, surah_end: r?.surahEnd ?? null, ayah_end: r?.ayahEnd ?? null });
            break;
          }
          case 'assigned': {
            const q = value as Quantity;
            Object.assign(set, { assigned_unit: q.unit, assigned_num: q.numerator, assigned_den: q.denominator });
            break;
          }
          case 'totalLines':
            set.total_lines = value;
            break;
          case 'totalLinesSource':
            set.total_lines_source = value;
            break;
          case 'lineCountEdition':
            set.line_count_edition = value;
            break;
          case 'removed':
            if (value === true) Object.assign(set, { removed_at: meta.at, removed_by: meta.actorUserId });
            break;
          default:
            throw new Error(`lesson_portion: field ${field} is not updatable`);
        }
      }
      await tx.updateTable('lesson_portions').set(set).where('organization_id', '=', organizationId).where('id', '=', id).execute();
    },

    // Safe for conflict lists: section, portion number, and Para; never a remark.
    label: (row) => `${String(row.fields.section)} · Portion ${String(row.fields.position)}${row.fields.paraNumber ? ` · Para ${String(row.fields.paraNumber)}` : ''}`,

    async audit(tx: Tx, change: AppliedChange) {
      const org = change.actor.organizationId;
      const p = await tx
        .selectFrom('lesson_portions as p')
        .innerJoin('daily_records as r', (j) => j.onRef('r.id', '=', 'p.daily_record_id').onRef('r.organization_id', '=', 'p.organization_id'))
        .select(['p.daily_record_id', 'p.section', 'p.position', 'p.para_number', 'p.is_extra', 'p.assigned_unit', 'p.assigned_num', 'p.assigned_den', 'p.total_lines', 'r.student_id', 'r.report_date'])
        .where('p.organization_id', '=', org)
        .where('p.id', '=', change.entityId)
        .executeTakeFirstOrThrow();
      const removed = change.changes.removed === true;
      const attempts = removed
        ? Number(
            (
              await tx
                .selectFrom('portion_attempts')
                .select((eb) => eb.fn.countAll<string>().as('n'))
                .where('organization_id', '=', org)
                .where('lesson_portion_id', '=', change.entityId)
                .executeTakeFirstOrThrow()
            ).n,
          )
        : undefined;
      await recordAudit(tx, {
        organizationId: org,
        actorUserId: change.actor.userId,
        action: change.opType === 'CREATE' ? 'LESSON_PORTION_CREATED' : removed ? 'LESSON_PORTION_REMOVED' : 'LESSON_PORTION_UPDATED',
        targetType: 'LESSON_PORTION',
        targetId: change.entityId,
        summary: {
          dailyRecordId: p.daily_record_id,
          studentId: p.student_id,
          reportDate: p.report_date,
          section: p.section,
          position: p.position,
          paraNumber: p.para_number,
          isExtra: p.is_extra,
          assigned: { unit: p.assigned_unit, numerator: p.assigned_num, denominator: p.assigned_den },
          totalLines: p.total_lines,
          rowVersion: change.rowVersion,
          ...(attempts === undefined ? {} : { attemptsKept: attempts }),
          fields: Object.keys(change.changes).sort(),
        },
        at: change.at,
      });
    },
  };
}

/** The first way a recorded attempt no longer fits the portion's (new) assigned quantity, or null. */
async function attemptsMisfit(tx: Tx, organizationId: string, portionId: string, merged: Record<string, unknown>): Promise<string | null> {
  const attempts = await tx
    .selectFrom('portion_attempts')
    .select(['completed_unit', 'completed_num', 'completed_den'])
    .where('organization_id', '=', organizationId)
    .where('lesson_portion_id', '=', portionId)
    .where('completed_unit', 'is not', null)
    .execute();
  const section = merged.section as PortionDraft['section'];
  for (const a of attempts) {
    const completed = { unit: a.completed_unit!, numerator: a.completed_num!, denominator: a.completed_den! };
    const issue = validateQuantities(section, {
      totalLines: section === 'SABAQ' ? (merged.totalLines as number | null) : undefined,
      assigned: merged.assigned as Quantity,
      completed,
    }).find((i) => i.field === 'completed');
    if (issue) return issue.code;
  }
  return null;
}

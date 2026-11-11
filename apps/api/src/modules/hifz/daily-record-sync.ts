// The `daily_record` sync handler (F05; US-018, US-019; FR-DAY-001, FR-DAY-008, FR-DAY-009, DEC-B24, DEC-B25;
// F05-AC1, AC2, AC6, AC7, AC17). Every daily-record write, online or offline, is a sync operation.
//
// - CREATE carries the client's UUIDv7, student, class, the Teacher's report date, and the session label. The
//   server records who and when; the report date is never changed by save or sync time (F05-AC1, AC2).
// - Out of the caller's `daily.write` scope (another madrasa, an unassigned class) is NOT_FOUND, like a missing id.
// - A future date (in the madrasa's timezone) is refused (F05-AC17); so is a date that is not a class day for the
//   class (holiday, closure, no-class day, unscheduled: FR-CAL-004, FR-CAL-009), with the F04 codes.
// - Report mode (F05-AC6, AC7): SINGLE refuses a second record for the student and date (REJECTED VALIDATION
//   `reportDate: DUPLICATE_RECORD`, `reportDate.existingId: <id>`); MULTI_SESSION needs a label and refuses a label
//   already used that day (`sessionLabel: DUPLICATE_SESSION`, `sessionLabel.existingId`). Never last-write-wins.
// - UPDATE changes the session label only (moving a record to another student or date is not supported).
import { z } from 'zod';
import { DailyRecordCreateFields, DailyRecordUpdateFields } from '@hifz/contracts';
import { DAILY_RECORD_FIELDS, checkNewRecord, isFutureDate, type NewRecordCheck } from '@hifz/domain/hifz';
import type { Clock } from '../../platform/clock.ts';
import type { DailyRecordsTable, Tx } from '../../platform/db.ts';
import { isCalendarDate } from '@hifz/domain/roster';
import { recordAudit } from '../audit/audit.ts';
import { dayFor } from '../calendar/shared.ts';
import { todayFor } from '../roster/shared.ts';
import type { AppliedChange, Prepared, SyncHandler, SyncRow } from '../sync/handler.ts';
import { enrolledFor, hasIssues, inDailyScope, recordsOn, reportModeOf, schemaIssues, type Issues } from './shared.ts';

type Row = Pick<DailyRecordsTable, 'id' | 'student_id' | 'class_id' | 'report_date' | 'session_label' | 'recorded_by' | 'client_saved_at'> & {
  row_version: string | number;
};

const COLUMNS = ['id', 'student_id', 'class_id', 'report_date', 'session_label', 'recorded_by', 'client_saved_at', 'row_version'] as const;

const toRow = (r: Row): SyncRow => ({
  id: r.id,
  rowVersion: Number(r.row_version),
  fields: {
    studentId: r.student_id,
    classId: r.class_id,
    reportDate: r.report_date,
    sessionLabel: r.session_label,
    recordedBy: r.recorded_by,
    clientSavedAt: r.client_saved_at ? r.client_saved_at.toISOString() : null,
  },
  keys: { studentId: r.student_id, classId: r.class_id },
});

/** The report-mode refusal as field issues; a duplicate names the existing record (F05-AC6, AC7). */
function modeIssues(check: Exclude<NewRecordCheck, { ok: true }>): Issues {
  switch (check.code) {
    case 'DUPLICATE_RECORD':
      return { reportDate: 'DUPLICATE_RECORD', 'reportDate.existingId': check.existingId };
    case 'DUPLICATE_SESSION':
      return { sessionLabel: 'DUPLICATE_SESSION', 'sessionLabel.existingId': check.existingId };
    case 'SESSION_LABEL_TOO_LONG':
      return { sessionLabel: 'SESSION_LABEL_TOO_LONG', 'sessionLabel.max': String(check.max) };
    default:
      return { sessionLabel: check.code };
  }
}

export interface DailyRecordSyncDeps {
  clock: Clock;
}

export function dailyRecordSyncHandler(deps: DailyRecordSyncDeps): SyncHandler {
  const refuse = (issues: Issues): Prepared => ({ ok: false, issues });

  return {
    entity: 'daily_record',
    opTypes: ['CREATE', 'UPDATE'],
    // Shape and unknown keys here; the semantic codes come from prepareCreate (schemaIssues keeps them).
    createSchema: z.strictObject(DailyRecordCreateFields.shape),
    updateSchema: DailyRecordUpdateFields,
    fieldSpec: DAILY_RECORD_FIELDS,
    // A session label ("Fajr") is not sensitive; ids and dates are in every summary.
    auditValueFields: ['sessionLabel'],
    tables: ['attempt_mistakes', 'portion_attempts', 'lesson_portions', 'daily_records'],
    keysForCreate: (fields) => ({ studentId: fields.studentId as string, classId: fields.classId as string }),

    async prepareCreate(tx, actor, raw) {
      const parsed = DailyRecordCreateFields.safeParse(raw);
      if (!parsed.success) return refuse(schemaIssues(parsed.error));
      const f = parsed.data;
      if (!isCalendarDate(f.reportDate)) return refuse({ reportDate: 'INVALID' });
      const org = actor.organizationId;
      const klass = await tx.selectFrom('classes').select('id').where('organization_id', '=', org).where('id', '=', f.classId).executeTakeFirst();
      if (!klass) return refuse({ classId: 'INVALID' });
      // The class itself must be in the caller's scope, not just the student (F02-AC7, FR-SEC-003).
      if (!(await inDailyScope(tx, actor, f.classId))) return { ok: false, notFound: true };
      const target = { studentId: f.studentId, classId: f.classId, reportDate: f.reportDate };
      const issues: Issues = {};
      const [today, day, enrolled] = await Promise.all([todayFor(tx, org, deps.clock), dayFor(tx, org, f.classId, f.reportDate), enrolledFor(tx, org, target, 'CREATE')]);
      if (isFutureDate(f.reportDate, today)) issues.reportDate = 'FUTURE';
      else if (day.kind !== 'SCHEDULED') issues.reportDate = day.kind;
      if (!enrolled) issues.studentId = 'NOT_ENROLLED';
      if (hasIssues(issues)) return refuse(issues);
      const check = checkNewRecord(await reportModeOf(tx, org), await recordsOn(tx, org, f.studentId, f.reportDate), f.sessionLabel);
      if (!check.ok) return refuse(modeIssues(check));
      return { ok: true, fields: { ...target, sessionLabel: check.sessionLabel, clientSavedAt: f.clientSavedAt ?? null } };
    },

    async prepareUpdate(tx, actor, row, changes) {
      const org = actor.organizationId;
      const target = { studentId: row.keys.studentId!, classId: row.keys.classId!, reportDate: row.fields.reportDate as string };
      if (!(await inDailyScope(tx, actor, target.classId))) return { ok: false, notFound: true };
      if (!(await enrolledFor(tx, org, target, 'CORRECTION'))) return refuse({ studentId: 'NOT_ENROLLED' });
      const others = (await recordsOn(tx, org, target.studentId, target.reportDate)).filter((r) => r.id !== row.id);
      const check = checkNewRecord(await reportModeOf(tx, org), others, (changes.sessionLabel as string | null | undefined) ?? null);
      if (!check.ok) return refuse(modeIssues(check));
      return { ok: true, fields: { sessionLabel: check.sessionLabel } };
    },

    async load(tx, organizationId, id, { forUpdate }) {
      let q = tx.selectFrom('daily_records').select(COLUMNS).where('organization_id', '=', organizationId).where('id', '=', id);
      if (forUpdate) q = q.forUpdate();
      const r = await q.executeTakeFirst();
      return r ? toRow(r) : null;
    },

    async loadMany(tx, organizationId, ids) {
      if (ids.length === 0) return [];
      const rows = await tx.selectFrom('daily_records').select(COLUMNS).where('organization_id', '=', organizationId).where('id', 'in', [...ids]).execute();
      return rows.map(toRow);
    },

    async insert(tx, organizationId, id, fields, meta) {
      const clientSavedAt = fields.clientSavedAt as string | null;
      const inserted = await tx
        .insertInto('daily_records')
        .values({
          id,
          organization_id: organizationId,
          student_id: fields.studentId as string,
          class_id: fields.classId as string,
          report_date: fields.reportDate as string,
          session_label: (fields.sessionLabel as string | null) ?? null,
          recorded_by: meta.actorUserId,
          client_saved_at: clientSavedAt ? new Date(clientSavedAt) : null,
          server_received_at: meta.at,
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
        if (field === 'sessionLabel') set.session_label = value;
        else throw new Error(`daily_record: field ${field} is not updatable`);
      }
      await tx.updateTable('daily_records').set(set).where('organization_id', '=', organizationId).where('id', '=', id).execute();
    },

    // Safe for conflict lists: a date and a session label, never a name or remark.
    label: (row) => `Daily record ${String(row.fields.reportDate)}${row.fields.sessionLabel ? ` · ${String(row.fields.sessionLabel)}` : ''}`,

    async audit(tx: Tx, change: AppliedChange) {
      const r = await tx
        .selectFrom('daily_records')
        .select(['student_id', 'class_id', 'report_date', 'session_label'])
        .where('organization_id', '=', change.actor.organizationId)
        .where('id', '=', change.entityId)
        .executeTakeFirstOrThrow();
      await recordAudit(tx, {
        organizationId: change.actor.organizationId,
        actorUserId: change.actor.userId,
        action: change.opType === 'CREATE' ? 'DAILY_RECORD_CREATED' : 'DAILY_RECORD_UPDATED',
        targetType: 'DAILY_RECORD',
        targetId: change.entityId,
        summary: {
          studentId: r.student_id,
          classId: r.class_id,
          reportDate: r.report_date,
          sessionLabel: r.session_label,
          rowVersion: change.rowVersion,
          fields: Object.keys(change.changes).sort(),
        },
        at: change.at,
      });
    },
  };
}

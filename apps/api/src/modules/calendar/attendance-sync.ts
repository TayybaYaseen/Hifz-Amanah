// The `attendance_record` sync handler (F04; US-015, US-016; FR-CAL-003, FR-CAL-007, FR-CAL-008, FR-CAL-009,
// FR-DAY-002A, FR-DAY-007, FR-DAY-010; F04-AC6…AC14, AC18, AC19, AC21, AC22). Every attendance write, from Bulk
// Entry or Daily Entry, online or offline, is a sync operation: one op per student row, each validated and
// committed on its own, so one invalid row never blocks the others (F04-AC9) and a replayed op_id creates nothing
// (F04-AC10).
//
// - CREATE carries the client's UUIDv7, student, class, date, status, and the Leave reason / absence note. The server
//   derives the Leave status from the caller's role (Teacher → REQUESTED, Owner/Admin → APPROVED) and records who.
// - UPDATE carries the coupled group (status, Leave reason, absence note) whole (F12 plan Q5).
// - A second CREATE for the same student and date is a create-create collision (F12 decision Q11): same values →
//   no-op, different values → a conflict on the existing record. Never last-write-wins.
// - Leave decisions are NOT sync operations: they are online Owner/Admin requests (attendance-service.ts).
import { AttendanceCreateFields, AttendanceUpdateFields, type AttendanceStatus, type LeaveStatus } from '@hifz/contracts';
import {
  ATTENDANCE_FIELDS,
  leaveStatusAfter,
  normalizeMark,
  validateMark,
  type AttendanceState,
  type Mark,
  type MarkingRole,
} from '@hifz/domain/calendar';
import { classOn, eligibleForEntry } from '@hifz/domain/roster';
import type { Clock } from '../../platform/clock.ts';
import type { AttendanceRecordsTable, Tx } from '../../platform/db.ts';
import { authorize } from '../access/policy.ts';
import { recordAudit } from '../audit/audit.ts';
import type { Actor } from '../identity/auth-service.ts';
import { rosterActor, todayFor } from '../roster/shared.ts';
import type { AppliedChange, Prepared, SyncHandler, SyncRow, WriteMeta } from '../sync/handler.ts';
import { dayFor, enrollmentsOf, noRecitedPortionsYet, type RecitedLookup } from './shared.ts';

type Row = Pick<
  AttendanceRecordsTable,
  'id' | 'student_id' | 'class_id' | 'report_date' | 'status' | 'leave_status' | 'leave_reason' | 'absent_note'
> & { row_version: string | number };

const COLUMNS = ['id', 'student_id', 'class_id', 'report_date', 'status', 'leave_status', 'leave_reason', 'absent_note', 'row_version'] as const;

const toRow = (r: Row): SyncRow => ({
  id: r.id,
  rowVersion: Number(r.row_version),
  fields: {
    studentId: r.student_id,
    classId: r.class_id,
    reportDate: r.report_date,
    status: r.status,
    leaveStatus: r.leave_status,
    leaveReason: r.leave_reason,
    absentNote: r.absent_note,
  },
  keys: { studentId: r.student_id, classId: r.class_id },
});

const stateOf = (fields: Record<string, unknown>): AttendanceState => ({
  status: fields.status as AttendanceStatus,
  leaveStatus: fields.leaveStatus as LeaveStatus,
  leaveReason: (fields.leaveReason as string | null) ?? null,
  absentNote: (fields.absentNote as string | null) ?? null,
});

const markOf = (fields: Record<string, unknown>): Mark =>
  normalizeMark({
    status: fields.status as AttendanceStatus,
    leaveReason: (fields.leaveReason as string | null | undefined) ?? null,
    absentNote: (fields.absentNote as string | null | undefined) ?? null,
  });

/** Sync is for Owner, Admin, and Teacher only (sync-service requireSyncRole). */
const roleOf = (actor: Actor): MarkingRole => actor.role as MarkingRole;

/** The Leave bookkeeping columns for a Leave status a write sets (who asked, who decided). */
function leaveColumns(leaveStatus: LeaveStatus, meta: WriteMeta) {
  switch (leaveStatus) {
    case 'NONE':
      return { leave_status: leaveStatus, leave_requested_by: null, leave_requested_at: null, leave_decided_by: null, leave_decided_at: null };
    case 'REQUESTED':
      return { leave_status: leaveStatus, leave_requested_by: meta.actorUserId, leave_requested_at: meta.at, leave_decided_by: null, leave_decided_at: null };
    case 'APPROVED':
    case 'REJECTED':
      // Leave marked by an Owner/Admin is approved at once: they asked and decided (F04-AC22).
      return { leave_status: leaveStatus, leave_requested_by: meta.actorUserId, leave_requested_at: meta.at, leave_decided_by: meta.actorUserId, leave_decided_at: meta.at };
  }
}

export interface AttendanceSyncDeps {
  clock: Clock;
  recited?: RecitedLookup;
}

export function attendanceSyncHandler(deps: AttendanceSyncDeps): SyncHandler {
  const recited = deps.recited ?? noRecitedPortionsYet;

  /** Validates a mark for a student, class, and date in the caller's scope. */
  async function check(
    tx: Tx,
    actor: Actor,
    target: { studentId: string; classId: string; reportDate: string },
    mark: Mark,
    mode: 'CREATE' | 'UPDATE',
  ): Promise<Record<string, string> | 'NOT_FOUND' | null> {
    const org = actor.organizationId;
    const klass = await tx.selectFrom('classes').select(['id', 'status']).where('organization_id', '=', org).where('id', '=', target.classId).executeTakeFirst();
    if (!klass) return { classId: 'INVALID' };
    // The class itself must be in the caller's scope, not just the student (F02-AC7, FR-SEC-003).
    const access = await rosterActor(tx, actor);
    if (authorize(access, 'daily.write', { organizationId: org, classIds: [target.classId] }) !== 'ALLOW') return 'NOT_FOUND';
    const student = await tx.selectFrom('students').select(['id', 'status']).where('organization_id', '=', org).where('id', '=', target.studentId).executeTakeFirst();
    if (!student) return { studentId: 'NOT_ENROLLED' };
    const enrollments = (await enrollmentsOf(tx, org, [student.id])).get(student.id) ?? [];
    // A new record needs an active student in an active class (F03 pickers); a correction needs only that the student
    // was in that class on that date (records never lock, FR-DAY-009).
    const enrolled =
      mode === 'CREATE'
        ? eligibleForEntry({ status: student.status, enrollments }, { id: klass.id, status: klass.status }, target.reportDate)
        : classOn(enrollments, target.reportDate) === target.classId;
    const [today, day, hasRecited] = await Promise.all([
      todayFor(tx, org, deps.clock),
      dayFor(tx, org, target.classId, target.reportDate),
      recited(tx, org, target.studentId, target.reportDate),
    ]);
    const issues = validateMark(mark, { reportDate: target.reportDate, today, dayKind: day.kind, enrolled, recited: hasRecited });
    if (issues.length === 0) return null;
    const fields: Record<string, string> = {};
    for (const issue of issues) fields[issue.field] ??= issue.code;
    return fields;
  }

  const refuse = (result: Record<string, string> | 'NOT_FOUND'): Prepared =>
    result === 'NOT_FOUND' ? { ok: false, notFound: true } : { ok: false, issues: result };

  return {
    entity: 'attendance_record',
    opTypes: ['CREATE', 'UPDATE'],
    createSchema: AttendanceCreateFields,
    updateSchema: AttendanceUpdateFields,
    fieldSpec: ATTENDANCE_FIELDS,
    // Status and Leave status may appear in audit summaries; the Leave reason and absence note never do.
    auditValueFields: ['status', 'leaveStatus'],
    collisionFields: ['status', 'leaveReason', 'absentNote'],
    tables: ['attendance_records'],
    keysForCreate: (fields) => ({ studentId: fields.studentId as string, classId: fields.classId as string }),

    async prepareCreate(tx, actor, fields) {
      const mark = markOf(fields);
      const target = { studentId: fields.studentId as string, classId: fields.classId as string, reportDate: fields.reportDate as string };
      const refused = await check(tx, actor, target, mark, 'CREATE');
      if (refused) return refuse(refused);
      return { ok: true, fields: { ...target, ...mark, leaveStatus: leaveStatusAfter(mark, roleOf(actor), null) } };
    },

    async prepareUpdate(tx, actor, row, changes) {
      const before = stateOf(row.fields);
      const mark = markOf({ ...row.fields, ...changes });
      const target = { studentId: row.keys.studentId!, classId: row.keys.classId!, reportDate: row.fields.reportDate as string };
      const refused = await check(tx, actor, target, mark, 'UPDATE');
      if (refused) return refuse(refused);
      const out: Record<string, unknown> = { ...mark };
      // The Leave status changes only when the status or the reason does: re-saving the same Leave keeps its decision,
      // and an Admin resolving a conflict in favour of the stored values approves nothing.
      if (mark.status !== before.status || mark.leaveReason !== before.leaveReason) {
        const leaveStatus = leaveStatusAfter(mark, roleOf(actor), before);
        if (leaveStatus !== before.leaveStatus || mark.status === 'LEAVE') out.leaveStatus = leaveStatus;
      }
      return { ok: true, fields: out };
    },

    async findNaturalDuplicate(tx, organizationId, fields) {
      const r = await tx
        .selectFrom('attendance_records')
        .select(COLUMNS)
        .where('organization_id', '=', organizationId)
        .where('student_id', '=', fields.studentId as string)
        .where('report_date', '=', fields.reportDate as string)
        .forUpdate()
        .executeTakeFirst();
      return r ? toRow(r) : null;
    },

    async load(tx, organizationId, id, { forUpdate }) {
      let q = tx.selectFrom('attendance_records').select(COLUMNS).where('organization_id', '=', organizationId).where('id', '=', id);
      if (forUpdate) q = q.forUpdate();
      const r = await q.executeTakeFirst();
      return r ? toRow(r) : null;
    },

    async loadMany(tx, organizationId, ids) {
      if (ids.length === 0) return [];
      const rows = await tx.selectFrom('attendance_records').select(COLUMNS).where('organization_id', '=', organizationId).where('id', 'in', [...ids]).execute();
      return rows.map(toRow);
    },

    async insert(tx, organizationId, id, fields, meta) {
      const leaveStatus = fields.leaveStatus as LeaveStatus;
      const inserted = await tx
        .insertInto('attendance_records')
        .values({
          id,
          organization_id: organizationId,
          student_id: fields.studentId as string,
          class_id: fields.classId as string,
          report_date: fields.reportDate as string,
          session_label: null,
          status: fields.status as AttendanceStatus,
          leave_reason: (fields.leaveReason as string | null) ?? null,
          absent_note: (fields.absentNote as string | null) ?? null,
          ...leaveColumns(leaveStatus, meta),
          recorded_by: meta.actorUserId,
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
        if (field === 'status') set.status = value;
        else if (field === 'leaveReason') set.leave_reason = value;
        else if (field === 'absentNote') set.absent_note = value;
        else if (field === 'leaveStatus') Object.assign(set, leaveColumns(value as LeaveStatus, meta));
        else throw new Error(`attendance_record: field ${field} is not updatable`);
      }
      await tx.updateTable('attendance_records').set(set).where('organization_id', '=', organizationId).where('id', '=', id).execute();
    },

    // Safe for conflict lists: a date and a status, never a name, reason, or note.
    label: (row) => `Attendance ${String(row.fields.reportDate)} · ${String(row.fields.status)}`,

    async audit(tx: Tx, change: AppliedChange) {
      const record = await tx
        .selectFrom('attendance_records')
        .select(['student_id', 'class_id', 'report_date', 'status', 'leave_status'])
        .where('organization_id', '=', change.actor.organizationId)
        .where('id', '=', change.entityId)
        .executeTakeFirstOrThrow();
      const summary = {
        studentId: record.student_id,
        classId: record.class_id,
        reportDate: record.report_date,
        status: record.status,
        leaveStatus: record.leave_status,
        rowVersion: change.rowVersion,
        // Field names only: the Leave reason and the absence note are internal text (ARCHITECTURE.md §15).
        fields: Object.keys(change.changes).sort(),
      };
      await recordAudit(tx, {
        organizationId: change.actor.organizationId,
        actorUserId: change.actor.userId,
        action: change.opType === 'CREATE' ? 'ATTENDANCE_RECORDED' : 'ATTENDANCE_CHANGED',
        targetType: 'ATTENDANCE_RECORD',
        targetId: change.entityId,
        summary,
        at: change.at,
      });
      // Leave marked by an Owner/Admin is approved at once, and that decision is audited like any other (F04-AC22).
      if (Object.hasOwn(change.changes, 'leaveStatus') && record.leave_status === 'APPROVED') {
        await recordAudit(tx, {
          organizationId: change.actor.organizationId,
          actorUserId: change.actor.userId,
          action: 'LEAVE_APPROVED',
          targetType: 'ATTENDANCE_RECORD',
          targetId: change.entityId,
          summary: { studentId: record.student_id, reportDate: record.report_date, atOnce: true },
          at: change.at,
        });
      }
    },
  };
}

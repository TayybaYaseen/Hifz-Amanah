// Attendance reads and Leave decisions (US-015…017; FR-CAL-003, FR-CAL-005, FR-CAL-008; F04-AC1…AC5, AC8, AC13,
// AC15…AC17, AC20). Attendance writes are sync operations (attendance-sync.ts); this service serves:
// - the Bulk Entry sheet: students enrolled in a class on a date, their records, and what the date is (AC5, AC6);
// - the attendance summary of a class for a period, per FR-CAL-005 (reused by reports, F09);
// - the Leave approval list and the approve/reject decision (Owner/Admin, online only, ARCHITECTURE §8.3).
import type {
  AttendanceRecordView,
  AttendanceSheetQuery,
  AttendanceSheetResponse,
  AttendanceSummaryQuery,
  AttendanceSummaryResponse,
  LeaveDecisionRequest,
  LeaveItem,
  LeaveListResponse,
  ListLeaveQuery,
} from '@hifz/contracts';
import { LEAVE_PAGE_SIZE, SUMMARY_MAX_DAYS } from '@hifz/contracts';
import { classDays, countDays, dayCategory, decideLeave, type DayCategory } from '@hifz/domain/calendar';
import { addDays, classOn, eligibleForEntry, inReportPeriod, isCalendarDate } from '@hifz/domain/roster';
import { sql } from 'kysely';
import type { Clock } from '../../platform/clock.ts';
import type { Db, Tx } from '../../platform/db.ts';
import { AppError, fieldError } from '../../platform/errors.ts';
import { withTenant } from '../../platform/tenant.ts';
import { recordAudit } from '../audit/audit.ts';
import type { Actor } from '../identity/auth-service.ts';
import { requireAccess, requireRole, rosterActor, todayFor } from '../roster/shared.ts';
import { appendChange, lockOrganization } from '../sync/change-log.ts';
import { activeExceptions, dayFor, enrollmentsOf, noRecitedPortionsYet, scheduleVersions, type RecitedLookup } from './shared.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const RECORD_COLUMNS = ['a.id', 'a.student_id', 'a.class_id', 'a.report_date', 'a.status', 'a.leave_status', 'a.leave_reason', 'a.absent_note', 'a.row_version'] as const;

interface RecordRow {
  id: string;
  student_id: string;
  class_id: string;
  report_date: string;
  status: AttendanceRecordView['status'];
  leave_status: AttendanceRecordView['leaveStatus'];
  leave_reason: string | null;
  absent_note: string | null;
  row_version: string | number;
}

const toView = (r: RecordRow): AttendanceRecordView => ({
  id: r.id,
  studentId: r.student_id,
  classId: r.class_id,
  reportDate: r.report_date,
  status: r.status,
  leaveStatus: r.leave_status,
  leaveReason: r.leave_reason,
  absentNote: r.absent_note,
  rowVersion: Number(r.row_version),
});

interface LeaveCursor {
  d: string;
  i: string;
}

const encodeCursor = (c: LeaveCursor) => Buffer.from(JSON.stringify(c), 'utf8').toString('base64url');

function decodeCursor(value: string): LeaveCursor {
  try {
    const c = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<LeaveCursor>;
    if (typeof c.d === 'string' && isCalendarDate(c.d) && typeof c.i === 'string' && UUID.test(c.i)) return { d: c.d, i: c.i };
  } catch {
    // fall through
  }
  throw fieldError('cursor', 'INVALID');
}

export class AttendanceService {
  private readonly db: Db;
  private readonly clock: Clock;
  private readonly recited: RecitedLookup;

  constructor(db: Db, clock: Clock, recited: RecitedLookup = noRecitedPortionsYet) {
    this.db = db;
    this.clock = clock;
    this.recited = recited;
  }

  /** A class the caller may enter daily work for (Owner/Admin, or its Teacher). */
  private async entryClass(tx: Tx, actor: Actor, classId: string): Promise<{ id: string; name: string; status: 'ACTIVE' | 'INACTIVE' }> {
    if (!UUID.test(classId)) throw new AppError('NOT_FOUND');
    const klass = await tx.selectFrom('classes').select(['id', 'name', 'status']).where('organization_id', '=', actor.organizationId).where('id', '=', classId).executeTakeFirst();
    if (!klass) throw new AppError('NOT_FOUND');
    requireAccess(await rosterActor(tx, actor), 'daily.write', { organizationId: actor.organizationId, classIds: [classId] });
    return klass;
  }

  // ---------- GET /attendance/sheet (Bulk Entry) ----------

  async sheet(actor: Actor, query: AttendanceSheetQuery): Promise<AttendanceSheetResponse> {
    requireRole(actor, 'daily.write');
    if (!isCalendarDate(query.date)) throw fieldError('date', 'INVALID');
    return withTenant(this.db, actor.organizationId, async (tx) => {
      const klass = await this.entryClass(tx, actor, query.classId);
      // A deactivated class is not a picker (F03-AC4): the same 404 as a missing class.
      if (klass.status !== 'ACTIVE') throw new AppError('NOT_FOUND');
      const org = actor.organizationId;
      const [today, day] = await Promise.all([todayFor(tx, org, this.clock), dayFor(tx, org, klass.id, query.date)]);
      const candidates = await tx
        .selectFrom('students')
        .innerJoin('student_enrollments as e', (j) => j.onRef('e.student_id', '=', 'students.id').onRef('e.organization_id', '=', 'students.organization_id'))
        .select(['students.id', 'students.name', 'students.external_student_id', 'students.status'])
        .where('students.organization_id', '=', org)
        .where('e.class_id', '=', klass.id)
        .where('e.start_date', '<=', query.date)
        .where((eb) => eb.or([eb('e.end_date', 'is', null), eb('e.end_date', '>=', query.date)]))
        .orderBy(sql`lower(students.name)`)
        .orderBy('students.id')
        .execute();
      const histories = await enrollmentsOf(tx, org, candidates.map((c) => c.id));
      const students = candidates.filter((c) => eligibleForEntry({ status: c.status, enrollments: histories.get(c.id) ?? [] }, klass, query.date));
      const records = students.length
        ? await tx
            .selectFrom('attendance_records as a')
            .select(RECORD_COLUMNS)
            .where('a.organization_id', '=', org)
            .where('a.report_date', '=', query.date)
            .where(
              'a.student_id',
              'in',
              students.map((s) => s.id),
            )
            .execute()
        : [];
      const byStudent = new Map(records.map((r) => [r.student_id, toView(r)]));
      return {
        classId: klass.id,
        className: klass.name,
        date: query.date,
        today,
        day: { kind: day.kind, label: day.exception?.label ?? null },
        students: await Promise.all(
          students.map(async (s) => ({
            id: s.id,
            name: s.name,
            externalStudentId: s.external_student_id,
            record: byStudent.get(s.id) ?? null,
            recited: await this.recited(tx, org, s.id, query.date),
          })),
        ),
      };
    });
  }

  // ---------- GET /attendance/summary (FR-CAL-005) ----------

  async summary(actor: Actor, query: AttendanceSummaryQuery): Promise<AttendanceSummaryResponse> {
    requireRole(actor, 'daily.write');
    if (!isCalendarDate(query.from)) throw fieldError('from', 'INVALID');
    if (!isCalendarDate(query.to) || query.to < query.from) throw fieldError('to', 'INVALID');
    if (addDays(query.from, SUMMARY_MAX_DAYS - 1) < query.to) throw fieldError('to', 'TOO_LONG');
    const period = { from: query.from, to: query.to };
    return withTenant(this.db, actor.organizationId, async (tx) => {
      const klass = await this.entryClass(tx, actor, query.classId);
      const org = actor.organizationId;
      const [today, versions, exceptions] = await Promise.all([
        todayFor(tx, org, this.clock),
        scheduleVersions(tx, org, [klass.id]),
        activeExceptions(tx, org, period, [klass.id]),
      ]);
      const days = classDays(klass.id, period, versions, exceptions);
      // Everyone enrolled in the class at any time in the period, whatever their status today (FR-STU-004).
      const enrolled = await tx
        .selectFrom('student_enrollments as e')
        .innerJoin('students as s', (j) => j.onRef('s.id', '=', 'e.student_id').onRef('s.organization_id', '=', 'e.organization_id'))
        .select(['s.id', 's.name'])
        .distinct()
        .where('e.organization_id', '=', org)
        .where('e.class_id', '=', klass.id)
        .where('e.start_date', '<=', period.to)
        .where((eb) => eb.or([eb('e.end_date', 'is', null), eb('e.end_date', '>=', period.from)]))
        .execute();
      const histories = await enrollmentsOf(tx, org, enrolled.map((s) => s.id));
      const students = enrolled
        .filter((s) => inReportPeriod(histories.get(s.id) ?? [], period, klass.id))
        .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.id.localeCompare(b.id));
      const records = await tx
        .selectFrom('attendance_records as a')
        .select(RECORD_COLUMNS)
        .where('a.organization_id', '=', org)
        .where('a.class_id', '=', klass.id)
        .where('a.report_date', '>=', period.from)
        .where('a.report_date', '<=', period.to)
        .execute();
      const recordOf = new Map(records.map((r) => [`${r.student_id}:${r.report_date}`, r]));
      return {
        classId: klass.id,
        from: period.from,
        to: period.to,
        today,
        days: days.map((d) => ({ date: d.date, kind: d.kind, label: d.exception?.label ?? null })),
        students: students.map((s) => {
          const enrollments = histories.get(s.id) ?? [];
          const categories: Record<string, DayCategory> = {};
          for (const d of days) {
            const r = recordOf.get(`${s.id}:${d.date}`);
            categories[d.date] = dayCategory({
              dayKind: d.kind,
              enrolled: classOn(enrollments, d.date) === klass.id,
              date: d.date,
              today,
              record: r ? { status: r.status, leaveStatus: r.leave_status } : null,
            });
          }
          return { studentId: s.id, name: s.name, days: categories, counts: countDays(Object.values(categories)) };
        }),
      };
    });
  }

  // ---------- GET /attendance/leave (Owner/Admin) ----------

  async leaveList(actor: Actor, query: ListLeaveQuery): Promise<LeaveListResponse> {
    requireRole(actor, 'leave.decide');
    const after = query.cursor ? decodeCursor(query.cursor) : null;
    return withTenant(this.db, actor.organizationId, async (tx) => {
      let q = tx
        .selectFrom('attendance_records as a')
        .innerJoin('students as s', (j) => j.onRef('s.id', '=', 'a.student_id').onRef('s.organization_id', '=', 'a.organization_id'))
        .innerJoin('classes as c', (j) => j.onRef('c.id', '=', 'a.class_id').onRef('c.organization_id', '=', 'a.organization_id'))
        .leftJoin('users as rq', 'rq.id', 'a.leave_requested_by')
        .leftJoin('users as dc', 'dc.id', 'a.leave_decided_by')
        .select([
          ...RECORD_COLUMNS,
          's.name as student_name',
          'c.name as class_name',
          'a.leave_requested_by',
          'rq.display_name as requested_name',
          'a.leave_decided_by',
          'dc.display_name as decided_name',
          'a.leave_decided_at',
        ])
        .where('a.organization_id', '=', actor.organizationId)
        .where('a.status', '=', 'LEAVE')
        .where('a.leave_status', '=', query.status);
      if (after) q = q.where((eb) => eb.or([eb('a.report_date', '<', after.d), eb.and([eb('a.report_date', '=', after.d), eb('a.id', '>', after.i)])]));
      const rows = await q.orderBy('a.report_date', 'desc').orderBy('a.id').limit(LEAVE_PAGE_SIZE + 1).execute();
      const page = rows.slice(0, LEAVE_PAGE_SIZE);
      const last = page.at(-1);
      const items: LeaveItem[] = page.map((r) => ({
        record: toView(r),
        studentName: r.student_name,
        className: r.class_name,
        requestedBy: r.leave_requested_by ? { userId: r.leave_requested_by, displayName: r.requested_name ?? '' } : null,
        decidedBy: r.leave_decided_by ? { userId: r.leave_decided_by, displayName: r.decided_name ?? '' } : null,
        decidedAt: r.leave_decided_at ? r.leave_decided_at.toISOString() : null,
      }));
      return { items, nextCursor: rows.length > LEAVE_PAGE_SIZE && last ? encodeCursor({ d: last.report_date, i: last.id }) : null };
    });
  }

  // ---------- POST /attendance/:id/leave-decision (Owner/Admin) ----------

  /**
   * Approves or rejects a Leave awaiting a decision (F04-AC15, AC16). A Teacher gets 403 before anything is loaded
   * (AC17). The decision is a new version of the record, so every device sees it after its next sync (edge case).
   */
  async decide(actor: Actor, id: string, input: LeaveDecisionRequest): Promise<AttendanceRecordView> {
    requireRole(actor, 'leave.decide');
    if (!UUID.test(id)) throw new AppError('NOT_FOUND');
    const org = actor.organizationId;
    return withTenant(this.db, org, async (tx) => {
      await lockOrganization(tx, org);
      const row = await tx.selectFrom('attendance_records as a').select(RECORD_COLUMNS).where('a.organization_id', '=', org).where('a.id', '=', id).forUpdate().executeTakeFirst();
      if (!row) throw new AppError('NOT_FOUND');
      const outcome = decideLeave({ status: row.status, leaveStatus: row.leave_status, leaveReason: row.leave_reason, absentNote: row.absent_note }, actor.role, input.decision);
      if (!outcome.ok) throw new AppError(outcome.code === 'FORBIDDEN' ? 'FORBIDDEN' : 'LEAVE_NOT_AWAITING');
      // The decision is about the version the Admin saw; a changed record is reviewed again.
      if (Number(row.row_version) !== input.rowVersion) throw new AppError('CONFLICT_STALE');
      const open = await tx
        .selectFrom('sync_conflicts')
        .select('id')
        .where('organization_id', '=', org)
        .where('entity', '=', 'attendance_record')
        .where('entity_id', '=', id)
        .where('status', '=', 'OPEN')
        .executeTakeFirst();
      if (open) throw new AppError('CONFLICT_OPEN');
      const now = this.clock.now();
      const next = Number(row.row_version) + 1;
      await tx
        .updateTable('attendance_records')
        .set({ leave_status: outcome.leaveStatus, leave_decided_by: actor.userId, leave_decided_at: now, updated_at: now, updated_by: actor.userId, row_version: next })
        .where('organization_id', '=', org)
        .where('id', '=', id)
        .execute();
      await appendChange(tx, {
        organizationId: org,
        entity: 'attendance_record',
        entityId: id,
        rowVersion: next,
        op: 'UPSERT',
        changedFields: ['leaveStatus'],
        keys: { studentId: row.student_id, classId: row.class_id },
        actorUserId: actor.userId,
        opId: null,
        at: now,
      });
      await recordAudit(tx, {
        organizationId: org,
        actorUserId: actor.userId,
        action: outcome.leaveStatus === 'APPROVED' ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED',
        targetType: 'ATTENDANCE_RECORD',
        targetId: id,
        summary: { studentId: row.student_id, classId: row.class_id, reportDate: row.report_date, rowVersion: next },
        at: now,
      });
      return { ...toView(row), leaveStatus: outcome.leaveStatus, rowVersion: next };
    });
  }
}

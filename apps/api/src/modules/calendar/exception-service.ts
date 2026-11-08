// Holidays, closures, and no-class days (US-014; FR-CAL-002, FR-CAL-004, FR-CAL-009; F04-AC3, AC4, AC5, AC20).
// Owner/Admin declare them for the whole madrasa or one class; assigned Teachers read the madrasa's and their
// classes'. Declaring one on a date that already has records needs an explicit confirmation with the count; the
// records stay (never deleted) and are excluded at report time. An exception is cancelled, never deleted.
import { v7 as uuidv7 } from 'uuid';
import type { CalendarExceptionView, CreateExceptionRequest, ExceptionImpact, ExceptionImpactQuery, ExceptionListResponse, ListExceptionsQuery } from '@hifz/contracts';
import { addDays, isCalendarDate } from '@hifz/domain/roster';
import type { Clock } from '../../platform/clock.ts';
import type { Db, Executor, Tx } from '../../platform/db.ts';
import { AppError, fieldError } from '../../platform/errors.ts';
import { withTenant } from '../../platform/tenant.ts';
import { scopeOf } from '../access/policy.ts';
import { recordAudit } from '../audit/audit.ts';
import type { Actor } from '../identity/auth-service.ts';
import { lockOrganization } from '../sync/change-log.ts';
import { requireRole, requiredText, rosterActor, uniqueViolation } from '../roster/shared.ts';
import { noDailyRecordsYet, type DailyRecordCounter } from './shared.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class ExceptionService {
  private readonly db: Db;
  private readonly clock: Clock;
  private readonly dailyRecords: DailyRecordCounter;

  constructor(db: Db, clock: Clock, dailyRecords: DailyRecordCounter = noDailyRecordsYet) {
    this.db = db;
    this.clock = clock;
    this.dailyRecords = dailyRecords;
  }

  /** Exceptions in a period: the madrasa's and those of the classes in the caller's scope. */
  async list(actor: Actor, query: ListExceptionsQuery): Promise<ExceptionListResponse> {
    requireRole(actor, 'classes.view');
    if (!isCalendarDate(query.from)) throw fieldError('from', 'INVALID');
    if (!isCalendarDate(query.to) || query.to < query.from || addDays(query.from, 366) < query.to) throw fieldError('to', 'INVALID');
    return withTenant(this.db, actor.organizationId, async (tx) => {
      const scope = scopeOf(await rosterActor(tx, actor));
      let q = tx
        .selectFrom('calendar_exceptions as e')
        .leftJoin('classes as c', (j) => j.onRef('c.id', '=', 'e.class_id').onRef('c.organization_id', '=', 'e.organization_id'))
        .select(['e.id', 'e.class_id', 'c.name as class_name', 'e.date', 'e.kind', 'e.label', 'e.created_at'])
        .where('e.organization_id', '=', actor.organizationId)
        .where('e.cancelled_at', 'is', null)
        .where('e.date', '>=', query.from)
        .where('e.date', '<=', query.to);
      if (scope.kind === 'CLASSES') {
        const ids = [...scope.classIds];
        q = q.where((eb) => (ids.length ? eb.or([eb('e.class_id', 'is', null), eb('e.class_id', 'in', ids)]) : eb('e.class_id', 'is', null)));
      }
      const rows = await q.orderBy('e.date').orderBy('e.id').execute();
      return { items: rows.map(toView) };
    });
  }

  /** How many records exist on the date: shown before the Admin confirms (F04-AC20). */
  async impact(actor: Actor, query: ExceptionImpactQuery): Promise<ExceptionImpact> {
    requireRole(actor, 'classes.manage');
    if (!isCalendarDate(query.date)) throw fieldError('date', 'INVALID');
    return withTenant(this.db, actor.organizationId, async (tx) => {
      if (query.classId) await this.requireClass(tx, actor, query.classId);
      return this.count(tx, actor.organizationId, query.date, query.classId ?? null);
    });
  }

  private async count(db: Executor, organizationId: string, date: string, classId: string | null): Promise<ExceptionImpact> {
    let q = db.selectFrom('attendance_records').select((eb) => eb.fn.countAll<string>().as('n')).where('organization_id', '=', organizationId).where('report_date', '=', date);
    if (classId) q = q.where('class_id', '=', classId);
    const { n } = await q.executeTakeFirstOrThrow();
    return { attendanceRecords: Number(n), dailyRecords: await this.dailyRecords(db, organizationId, date, classId) };
  }

  private async requireClass(tx: Tx, actor: Actor, classId: string): Promise<void> {
    if (!UUID.test(classId)) throw fieldError('classId', 'INVALID');
    const klass = await tx.selectFrom('classes').select('id').where('organization_id', '=', actor.organizationId).where('id', '=', classId).executeTakeFirst();
    if (!klass) throw fieldError('classId', 'INVALID');
  }

  /**
   * Owner/Admin. Refused with 409 RECORDS_EXIST (fields.records = count) while records exist on the date and the
   * request is not confirmed (FR-CAL-009). Past, present, and future dates are allowed (a holiday is often declared
   * ahead).
   */
  async create(actor: Actor, input: CreateExceptionRequest): Promise<CalendarExceptionView> {
    requireRole(actor, 'classes.manage');
    const label = requiredText('label', input.label);
    if (!isCalendarDate(input.date)) throw fieldError('date', 'INVALID');
    const now = this.clock.now();
    const id = uuidv7();
    try {
      return await withTenant(this.db, actor.organizationId, async (tx) => {
        if (input.classId) await this.requireClass(tx, actor, input.classId);
        // Serializes with attendance writes: every sync write takes this lock first (sync/change-log.ts), so a record
        // saved concurrently is either counted here or refused afterwards as a holiday.
        await lockOrganization(tx, actor.organizationId);
        const found = await this.count(tx, actor.organizationId, input.date, input.classId);
        const records = found.attendanceRecords + found.dailyRecords;
        if (records > 0 && !input.confirm) throw new AppError('RECORDS_EXIST', { records: String(records) });
        await tx
          .insertInto('calendar_exceptions')
          .values({
            id,
            organization_id: actor.organizationId,
            class_id: input.classId,
            date: input.date,
            kind: input.kind,
            label,
            records_confirmed: records,
            created_at: now,
            created_by: actor.userId,
            cancelled_at: null,
            cancelled_by: null,
          })
          .execute();
        await recordAudit(tx, {
          organizationId: actor.organizationId,
          actorUserId: actor.userId,
          action: 'CALENDAR_EXCEPTION_CREATED',
          targetType: 'CALENDAR_EXCEPTION',
          targetId: id,
          summary: { classId: input.classId, date: input.date, kind: input.kind, recordsConfirmed: records },
          at: now,
        });
        return this.one(tx, actor.organizationId, id);
      });
    } catch (error) {
      if (uniqueViolation(error) === 'calendar_exceptions_one_active') throw fieldError('date', 'TAKEN');
      throw error;
    }
  }

  /** Owner/Admin: the date is a working day again (if the schedule says so). The row stays, cancelled. */
  async cancel(actor: Actor, id: string): Promise<CalendarExceptionView> {
    requireRole(actor, 'classes.manage');
    if (!UUID.test(id)) throw new AppError('NOT_FOUND');
    const now = this.clock.now();
    return withTenant(this.db, actor.organizationId, async (tx) => {
      const row = await tx
        .selectFrom('calendar_exceptions')
        .select(['id', 'class_id', 'date', 'kind', 'cancelled_at'])
        .where('organization_id', '=', actor.organizationId)
        .where('id', '=', id)
        .forUpdate()
        .executeTakeFirst();
      if (!row || row.cancelled_at) throw new AppError('NOT_FOUND');
      await tx.updateTable('calendar_exceptions').set({ cancelled_at: now, cancelled_by: actor.userId }).where('organization_id', '=', actor.organizationId).where('id', '=', id).execute();
      await recordAudit(tx, {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        action: 'CALENDAR_EXCEPTION_CANCELLED',
        targetType: 'CALENDAR_EXCEPTION',
        targetId: id,
        summary: { classId: row.class_id, date: row.date, kind: row.kind },
        at: now,
      });
      return this.one(tx, actor.organizationId, id);
    });
  }

  private async one(tx: Tx, organizationId: string, id: string): Promise<CalendarExceptionView> {
    const row = await tx
      .selectFrom('calendar_exceptions as e')
      .leftJoin('classes as c', (j) => j.onRef('c.id', '=', 'e.class_id').onRef('c.organization_id', '=', 'e.organization_id'))
      .select(['e.id', 'e.class_id', 'c.name as class_name', 'e.date', 'e.kind', 'e.label', 'e.created_at'])
      .where('e.organization_id', '=', organizationId)
      .where('e.id', '=', id)
      .executeTakeFirstOrThrow();
    return toView(row);
  }
}

function toView(r: { id: string; class_id: string | null; class_name: string | null; date: string; kind: CalendarExceptionView['kind']; label: string; created_at: Date }): CalendarExceptionView {
  return { id: r.id, classId: r.class_id, className: r.class_name, date: r.date, kind: r.kind, label: r.label, createdAt: r.created_at.toISOString() };
}

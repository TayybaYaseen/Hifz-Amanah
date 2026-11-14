// Class timetables (US-013; FR-CAL-001, FR-CAL-006; F04-AC1, AC2). Owner/Admin set a weekly schedule from an
// effective date; earlier days keep the version that was in force then. Assigned Teachers may read it.
import { v7 as uuidv7 } from 'uuid';
import type { ClassScheduleResponse, ScheduleVersionView, SetScheduleRequest } from '@hifz/contracts';
import { normalizeWeekdays, validTimeRange } from '@hifz/domain/calendar';
import { addDays, isCalendarDate } from '@hifz/domain/roster';
import type { Clock } from '../../platform/clock.ts';
import type { Db, Tx } from '../../platform/db.ts';
import { AppError, fieldError } from '../../platform/errors.ts';
import { withTenant } from '../../platform/tenant.ts';
import { recordAudit } from '../audit/audit.ts';
import type { Actor } from '../identity/auth-service.ts';
import { requireAccess, requireRole, rosterActor, todayFor } from '../roster/shared.ts';
import { hhmm } from './shared.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class ScheduleService {
  private readonly db: Db;
  private readonly clock: Clock;

  constructor(db: Db, clock: Clock) {
    this.db = db;
    this.clock = clock;
  }

  private async loadClass(tx: Tx, actor: Actor, classId: string): Promise<{ id: string; status: string }> {
    if (!UUID.test(classId)) throw new AppError('NOT_FOUND');
    const klass = await tx.selectFrom('classes').select(['id', 'status']).where('organization_id', '=', actor.organizationId).where('id', '=', classId).executeTakeFirst();
    if (!klass) throw new AppError('NOT_FOUND');
    return klass;
  }

  private async view(tx: Tx, organizationId: string, classId: string): Promise<ClassScheduleResponse> {
    const rows = await tx
      .selectFrom('class_schedules')
      .select(['weekdays', 'start_time', 'end_time', 'effective_from'])
      .where('organization_id', '=', organizationId)
      .where('class_id', '=', classId)
      .where('superseded_at', 'is', null)
      .orderBy('effective_from')
      .execute();
    const versions: ScheduleVersionView[] = rows.map((r, i) => ({
      effectiveFrom: r.effective_from,
      effectiveTo: rows[i + 1] ? addDays(rows[i + 1]!.effective_from, -1) : null,
      weekdays: r.weekdays.map(Number),
      startTime: hhmm(r.start_time),
      endTime: hhmm(r.end_time),
    }));
    const today = await todayFor(tx, organizationId, this.clock);
    // Versions are oldest first, so the last one that started by today is in force.
    const current = versions.filter((v) => v.effectiveFrom <= today).at(-1) ?? null;
    return { classId, current, versions };
  }

  /** Owner, Admin, or a Teacher of the class. */
  async get(actor: Actor, classId: string): Promise<ClassScheduleResponse> {
    requireRole(actor, 'classes.view');
    return withTenant(this.db, actor.organizationId, async (tx) => {
      await this.loadClass(tx, actor, classId);
      requireAccess(await rosterActor(tx, actor), 'classes.view', { organizationId: actor.organizationId, classIds: [classId] });
      return this.view(tx, actor.organizationId, classId);
    });
  }

  /**
   * Owner/Admin (F04-AC2). The new version applies from `effectiveFrom`; versions starting on or after that date are
   * superseded (kept, never deleted), so the latest instruction wins for the future and the past stays as it was.
   */
  async set(actor: Actor, classId: string, input: SetScheduleRequest): Promise<ClassScheduleResponse> {
    requireRole(actor, 'classes.manage');
    if (!isCalendarDate(input.effectiveFrom)) throw fieldError('effectiveFrom', 'INVALID');
    let weekdays: number[];
    try {
      weekdays = normalizeWeekdays(input.weekdays);
    } catch {
      throw fieldError('weekdays', 'INVALID');
    }
    if (!validTimeRange(input.startTime, input.endTime)) throw fieldError('endTime', 'INVALID');
    const now = this.clock.now();
    return withTenant(this.db, actor.organizationId, async (tx) => {
      const klass = await this.loadClass(tx, actor, classId);
      if (klass.status !== 'ACTIVE') throw fieldError('classId', 'CLASS_INACTIVE');
      // One writer per class at a time: lock the class row.
      await tx.selectFrom('classes').select('id').where('organization_id', '=', actor.organizationId).where('id', '=', classId).forUpdate().execute();
      await tx
        .updateTable('class_schedules')
        .set({ superseded_at: now, superseded_by: actor.userId })
        .where('organization_id', '=', actor.organizationId)
        .where('class_id', '=', classId)
        .where('superseded_at', 'is', null)
        .where('effective_from', '>=', input.effectiveFrom)
        .execute();
      await tx
        .updateTable('class_schedules')
        .set({ effective_to: addDays(input.effectiveFrom, -1) })
        .where('organization_id', '=', actor.organizationId)
        .where('class_id', '=', classId)
        .where('superseded_at', 'is', null)
        .where('effective_from', '<', input.effectiveFrom)
        .where((eb) => eb.or([eb('effective_to', 'is', null), eb('effective_to', '>=', input.effectiveFrom)]))
        .execute();
      await tx
        .insertInto('class_schedules')
        .values({
          id: uuidv7(),
          organization_id: actor.organizationId,
          class_id: classId,
          weekdays,
          start_time: input.startTime,
          end_time: input.endTime,
          effective_from: input.effectiveFrom,
          effective_to: null,
          created_at: now,
          created_by: actor.userId,
          superseded_at: null,
          superseded_by: null,
        })
        .execute();
      await recordAudit(tx, {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        action: 'SCHEDULE_SET',
        targetType: 'CLASS',
        targetId: classId,
        summary: { effectiveFrom: input.effectiveFrom, weekdays, startTime: input.startTime, endTime: input.endTime },
        at: now,
      });
      return this.view(tx, actor.organizationId, classId);
    });
  }
}

// Classes and teacher assignments (US-010; FR-CLS-001…003, DEC-B58). Owner/Admin create, edit, deactivate, and
// reactivate classes; a Teacher only views the classes they are assigned to (or every class with "all classes").
// Every write runs in one tenant transaction with its audit record (ARCHITECTURE.md §15) and, when a Teacher's set
// of classes changes, a scope change for that Teacher so their device re-syncs its scope (F12 decision Q8).
import { sql } from 'kysely';
import { v7 as uuidv7 } from 'uuid';
import type { ClassListResponse, ClassResponse, CreateClassRequest, ListClassesQuery, TeacherOptionsResponse, UpdateClassRequest } from '@hifz/contracts';
import { covers, pickerClasses } from '@hifz/domain/roster';
import type { Clock } from '../../platform/clock.ts';
import type { Db, Tx } from '../../platform/db.ts';
import { AppError, fieldError } from '../../platform/errors.ts';
import { withTenant } from '../../platform/tenant.ts';
import { can, scopeOf, type AccessActor } from '../access/policy.ts';
import { recordAudit } from '../audit/audit.ts';
import type { Actor } from '../identity/auth-service.ts';
import { recordScopeChange } from '../sync/change-log.ts';
import { requireAccess, requireRole, requiredText, rosterActor, todayFor, uniqueViolation } from './shared.ts';

type ClassRow = { id: string; name: string; status: 'ACTIVE' | 'INACTIVE'; row_version: string };

const NAME_KEY = 'classes_active_name_key';

/** "Class name already in use" (F03-AC14) when a concurrent request won the race to the unique index. */
async function mapNameClash<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (uniqueViolation(error) === NAME_KEY) throw fieldError('name', 'TAKEN');
    throw error;
  }
}

export class ClassService {
  private readonly db: Db;
  private readonly clock: Clock;

  constructor(db: Db, clock: Clock) {
    this.db = db;
    this.clock = clock;
  }

  // ---------- Reads ----------

  async list(actor: Actor, query: ListClassesQuery): Promise<ClassListResponse> {
    requireRole(actor, 'classes.view');
    return withTenant(this.db, actor.organizationId, async (tx) => {
      const access = await rosterActor(tx, actor);
      const scope = scopeOf(access);
      if (scope.kind === 'CLASSES' && scope.classIds.size === 0) return { items: [] };
      let q = tx.selectFrom('classes').select(['id', 'name', 'status', 'row_version']).where('organization_id', '=', actor.organizationId);
      if (query.status !== 'ALL') q = q.where('status', '=', query.status);
      if (scope.kind === 'CLASSES') q = q.where('id', 'in', [...scope.classIds]);
      const rows = await q.orderBy(sql`lower(name)`).orderBy('id').execute();
      return { items: await this.respond(tx, actor, access, rows) };
    });
  }

  async get(actor: Actor, id: string): Promise<ClassResponse> {
    requireRole(actor, 'classes.view');
    return withTenant(this.db, actor.organizationId, async (tx) => {
      const access = await rosterActor(tx, actor);
      const row = await this.load(tx, actor.organizationId, id);
      requireAccess(access, 'classes.view', { organizationId: actor.organizationId, classIds: [row.id] });
      return (await this.respond(tx, actor, access, [row]))[0]!;
    });
  }

  /** Active classes in the caller's scope, for Daily Entry and Bulk Entry pickers (F03-AC4). */
  async entryClasses(actor: Actor): Promise<{ items: Array<{ id: string; name: string }> }> {
    requireRole(actor, 'daily.write');
    const { items } = await this.list(actor, { status: 'ALL' });
    return { items: pickerClasses(items).map(({ id, name }) => ({ id, name })) };
  }

  /** Active Teachers of the madrasa, for the class form (Owner/Admin). */
  async teacherOptions(actor: Actor): Promise<TeacherOptionsResponse> {
    requireRole(actor, 'classes.manage');
    return withTenant(this.db, actor.organizationId, async (tx) => {
      const rows = await tx
        .selectFrom('memberships')
        .innerJoin('users', 'users.id', 'memberships.user_id')
        .select(['users.id', 'users.display_name'])
        .where('memberships.organization_id', '=', actor.organizationId)
        .where('memberships.role', '=', 'TEACHER')
        .where('memberships.status', '=', 'ACTIVE')
        .where('users.status', '=', 'ACTIVE')
        .orderBy(sql`lower(users.display_name)`)
        .orderBy('users.id')
        .execute();
      return { items: rows.map((r) => ({ userId: r.id, displayName: r.display_name })) };
    });
  }

  // ---------- Writes (Owner/Admin only, F03-AC3) ----------

  async create(actor: Actor, input: CreateClassRequest): Promise<ClassResponse> {
    requireRole(actor, 'classes.manage');
    const name = requiredText('name', input.name);
    const teacherIds = [...new Set(input.teacherIds)];
    const now = this.clock.now();
    const id = uuidv7();
    await mapNameClash(() =>
      withTenant(this.db, actor.organizationId, async (tx) => {
        await this.checkTeachers(tx, actor.organizationId, teacherIds);
        await this.checkNameFree(tx, actor.organizationId, name, null);
        await tx
          .insertInto('classes')
          .values({ id, organization_id: actor.organizationId, name, status: 'ACTIVE', created_at: now, updated_at: now, deactivated_at: null })
          .execute();
        await this.assign(tx, actor, id, teacherIds, now);
        await recordAudit(tx, {
          organizationId: actor.organizationId,
          actorUserId: actor.userId,
          action: 'CLASS_CREATED',
          targetType: 'CLASS',
          targetId: id,
          summary: { name, teacherIds },
          at: now,
        });
      }),
    );
    return this.get(actor, id);
  }

  async update(actor: Actor, id: string, input: UpdateClassRequest): Promise<ClassResponse> {
    requireRole(actor, 'classes.manage');
    const name = input.name === undefined ? undefined : requiredText('name', input.name);
    const now = this.clock.now();
    await mapNameClash(() =>
      withTenant(this.db, actor.organizationId, async (tx) => {
        const row = await this.load(tx, actor.organizationId, id, true);
        const changes: Record<string, unknown> = {};
        if (name !== undefined && name !== row.name) {
          if (row.status === 'ACTIVE') await this.checkNameFree(tx, actor.organizationId, name, id);
          changes.name = { from: row.name, to: name };
        }
        let added: string[] = [];
        let removed: string[] = [];
        if (input.teacherIds !== undefined) {
          const wanted = new Set(input.teacherIds);
          const current = new Set(await this.currentTeacherIds(tx, actor.organizationId, id));
          added = [...wanted].filter((t) => !current.has(t));
          removed = [...current].filter((t) => !wanted.has(t));
          await this.checkTeachers(tx, actor.organizationId, added);
        }
        if (!changes.name && !added.length && !removed.length) return;
        await tx
          .updateTable('classes')
          .set({ ...(changes.name ? { name } : {}), updated_at: now, row_version: Number(row.row_version) + 1 })
          .where('organization_id', '=', actor.organizationId)
          .where('id', '=', id)
          .execute();
        await this.assign(tx, actor, id, added, now);
        await this.unassign(tx, actor, id, removed, now);
        await recordAudit(tx, {
          organizationId: actor.organizationId,
          actorUserId: actor.userId,
          action: 'CLASS_UPDATED',
          targetType: 'CLASS',
          targetId: id,
          summary: { changes, teachersAdded: added, teachersRemoved: removed },
          at: now,
        });
      }),
    );
    return this.get(actor, id);
  }

  /**
   * Hides the class from new entry; its records, reports, assignments, and enrollments are kept (F03-AC4). Active
   * students stay enrolled: the app warns with their list first (F03 edge cases).
   */
  async deactivate(actor: Actor, id: string): Promise<ClassResponse> {
    return this.setStatus(actor, id, 'INACTIVE');
  }

  /** A deactivated class's name may have been reused meanwhile; then reactivation is refused (F03-AC14). */
  async reactivate(actor: Actor, id: string): Promise<ClassResponse> {
    return this.setStatus(actor, id, 'ACTIVE');
  }

  // ---------- Internals ----------

  private async setStatus(actor: Actor, id: string, status: 'ACTIVE' | 'INACTIVE'): Promise<ClassResponse> {
    requireRole(actor, 'classes.manage');
    const now = this.clock.now();
    await mapNameClash(() =>
      withTenant(this.db, actor.organizationId, async (tx) => {
        const row = await this.load(tx, actor.organizationId, id, true);
        if (row.status === status) return;
        if (status === 'ACTIVE') await this.checkNameFree(tx, actor.organizationId, row.name, id);
        const activeStudents = status === 'INACTIVE' ? await this.activeStudentCounts(tx, actor.organizationId, [id], await todayFor(tx, actor.organizationId, this.clock)) : null;
        await tx
          .updateTable('classes')
          .set({ status, deactivated_at: status === 'INACTIVE' ? now : null, updated_at: now, row_version: Number(row.row_version) + 1 })
          .where('organization_id', '=', actor.organizationId)
          .where('id', '=', id)
          .execute();
        await recordAudit(tx, {
          organizationId: actor.organizationId,
          actorUserId: actor.userId,
          action: status === 'INACTIVE' ? 'CLASS_DEACTIVATED' : 'CLASS_REACTIVATED',
          targetType: 'CLASS',
          targetId: id,
          summary: activeStudents ? { activeStudentsKept: activeStudents.get(id) ?? 0 } : {},
          at: now,
        });
      }),
    );
    return this.get(actor, id);
  }

  private async load(tx: Tx, organizationId: string, id: string, forUpdate = false): Promise<ClassRow> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new AppError('NOT_FOUND');
    let q = tx.selectFrom('classes').select(['id', 'name', 'status', 'row_version']).where('organization_id', '=', organizationId).where('id', '=', id);
    if (forUpdate) q = q.forUpdate();
    const row = await q.executeTakeFirst();
    if (!row) throw new AppError('NOT_FOUND');
    return row;
  }

  /** Active class names are unique per madrasa, ignoring case (F03-AC14, DEC-B58). */
  private async checkNameFree(tx: Tx, organizationId: string, name: string, exceptId: string | null): Promise<void> {
    let q = tx
      .selectFrom('classes')
      .select('id')
      .where('organization_id', '=', organizationId)
      .where('status', '=', 'ACTIVE')
      .where(sql`lower(btrim(name))`, '=', name.trim().toLowerCase());
    if (exceptId) q = q.where('id', '!=', exceptId);
    if (await q.executeTakeFirst()) throw fieldError('name', 'TAKEN');
  }

  /** Every id must be an active Teacher of this madrasa (an unknown or cross-tenant id is invalid). */
  private async checkTeachers(tx: Tx, organizationId: string, teacherIds: readonly string[]): Promise<void> {
    if (!teacherIds.length) return;
    const rows = await tx
      .selectFrom('memberships')
      .innerJoin('users', 'users.id', 'memberships.user_id')
      .select('memberships.user_id')
      .where('memberships.organization_id', '=', organizationId)
      .where('memberships.user_id', 'in', [...teacherIds])
      .where('memberships.role', '=', 'TEACHER')
      .where('memberships.status', '=', 'ACTIVE')
      .where('users.status', '=', 'ACTIVE')
      .execute();
    if (rows.length !== new Set(teacherIds).size) throw fieldError('teacherIds', 'INVALID');
  }

  private async currentTeacherIds(tx: Tx, organizationId: string, classId: string): Promise<string[]> {
    const rows = await tx
      .selectFrom('class_teachers')
      .select('teacher_user_id')
      .where('organization_id', '=', organizationId)
      .where('class_id', '=', classId)
      .where('unassigned_at', 'is', null)
      .execute();
    return rows.map((r) => r.teacher_user_id);
  }

  private async assign(tx: Tx, actor: Actor, classId: string, teacherIds: readonly string[], now: Date): Promise<void> {
    for (const teacherId of teacherIds) {
      await tx
        .insertInto('class_teachers')
        .values({
          id: uuidv7(),
          organization_id: actor.organizationId,
          class_id: classId,
          teacher_user_id: teacherId,
          assigned_at: now,
          assigned_by: actor.userId,
          unassigned_at: null,
          unassigned_by: null,
        })
        .execute();
      await recordScopeChange(tx, actor.organizationId, teacherId, now);
    }
  }

  private async unassign(tx: Tx, actor: Actor, classId: string, teacherIds: readonly string[], now: Date): Promise<void> {
    if (!teacherIds.length) return;
    await tx
      .updateTable('class_teachers')
      .set({ unassigned_at: now, unassigned_by: actor.userId })
      .where('organization_id', '=', actor.organizationId)
      .where('class_id', '=', classId)
      .where('teacher_user_id', 'in', [...teacherIds])
      .where('unassigned_at', 'is', null)
      .execute();
    for (const teacherId of teacherIds) await recordScopeChange(tx, actor.organizationId, teacherId, now);
  }

  /** Active students enrolled in each class on `today`. */
  private async activeStudentCounts(tx: Tx, organizationId: string, classIds: readonly string[], today: string): Promise<Map<string, number>> {
    if (!classIds.length) return new Map();
    const rows = await tx
      .selectFrom('student_enrollments')
      .innerJoin('students', (join) =>
        join.onRef('students.id', '=', 'student_enrollments.student_id').onRef('students.organization_id', '=', 'student_enrollments.organization_id'),
      )
      .select(['student_enrollments.class_id', 'student_enrollments.start_date', 'student_enrollments.end_date'])
      .where('student_enrollments.organization_id', '=', organizationId)
      .where('student_enrollments.class_id', 'in', [...classIds])
      .where('student_enrollments.start_date', '<=', today)
      .where((eb) => eb.or([eb('student_enrollments.end_date', 'is', null), eb('student_enrollments.end_date', '>=', today)]))
      .where('students.status', '=', 'ACTIVE')
      .execute();
    const counts = new Map<string, number>();
    for (const r of rows) {
      if (covers({ startDate: r.start_date, endDate: r.end_date }, today)) counts.set(r.class_id, (counts.get(r.class_id) ?? 0) + 1);
    }
    return counts;
  }

  private async respond(tx: Tx, actor: Actor, access: AccessActor, rows: readonly ClassRow[]): Promise<ClassResponse[]> {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const teachers = await tx
      .selectFrom('class_teachers')
      .innerJoin('users', 'users.id', 'class_teachers.teacher_user_id')
      .select(['class_teachers.class_id', 'users.id', 'users.display_name'])
      .where('class_teachers.organization_id', '=', actor.organizationId)
      .where('class_teachers.class_id', 'in', ids)
      .where('class_teachers.unassigned_at', 'is', null)
      .orderBy(sql`lower(users.display_name)`)
      .orderBy('users.id')
      .execute();
    const counts = await this.activeStudentCounts(tx, actor.organizationId, ids, await todayFor(tx, actor.organizationId, this.clock));
    const canManage = can(access, 'classes.manage');
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      teachers: teachers.filter((t) => t.class_id === r.id).map((t) => ({ userId: t.id, displayName: t.display_name })),
      activeStudentCount: counts.get(r.id) ?? 0,
      canManage,
    }));
  }
}

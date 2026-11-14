// Students and enrollments (US-011, US-012; FR-STU-001…006, NFR-PERF-001, NFR-PRV-001, DEC-B14, DEC-B56…B59).
// - Owner/Admin add, edit, deactivate, reactivate, and move students.
// - A Teacher adds and edits students only in their assigned classes, and never deactivates or moves them (DEC-B14).
// - A student's class history is kept: a move ends the old enrollment the day before the new one (F03-AC11).
// - Nothing is ever deleted (FR-STU-004).
// Teacher visibility: a student is in a Teacher's scope while the student has an enrollment in one of the Teacher's
// classes that has not ended (current, or starting on a later date). Plan: docs/handover/F03-plan.md.
import { sql } from 'kysely';
import { v7 as uuidv7 } from 'uuid';
import type {
  CreateStudentRequest,
  EnrollStudentRequest,
  EntryStudentsResponse,
  ListStudentsQuery,
  StudentListResponse,
  StudentResponse,
  StudentSummary,
  UpdateStudentRequest,
} from '@hifz/contracts';
import { eligibleForEntry, enrollmentHistory, enrollmentOn, isCalendarDate, planEnrollment, type Enrollment } from '@hifz/domain/roster';
import type { Clock } from '../../platform/clock.ts';
import type { Db, Tx } from '../../platform/db.ts';
import { AppError, fieldError } from '../../platform/errors.ts';
import { withTenant } from '../../platform/tenant.ts';
import { can, scopeOf, type AccessActor } from '../access/policy.ts';
import { projectFor } from '../access/projection.ts';
import { recordAudit } from '../audit/audit.ts';
import type { Actor } from '../identity/auth-service.ts';
import { recordScopeChange } from '../sync/change-log.ts';
import {
  decodeCursor,
  encodeCursor,
  likePattern,
  optionalText,
  requireAccess,
  requireRole,
  requiredText,
  rosterActor,
  todayFor,
  uniqueViolation,
} from './shared.ts';

type StudentRow = {
  id: string;
  name: string;
  external_student_id: string | null;
  admission_date: string | null;
  private_notes: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  row_version: string;
};

type EnrollmentRow = Enrollment & { studentId: string; className: string };

const EXTERNAL_ID_KEY = 'students_external_id_key';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function mapExternalIdClash<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (uniqueViolation(error) === EXTERNAL_ID_KEY) throw fieldError('externalStudentId', 'TAKEN');
    throw error;
  }
}

function calendarDate(field: string, value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (!isCalendarDate(value)) throw fieldError(field, 'INVALID');
  return value;
}

export class StudentService {
  private readonly db: Db;
  private readonly clock: Clock;

  constructor(db: Db, clock: Clock) {
    this.db = db;
    this.clock = clock;
  }

  // ---------- Reads ----------

  /** Search, filters, and 25-per-page keyset pages, all on the server (F03-AC8, AC19; NFR-PERF-001). */
  async list(actor: Actor, query: ListStudentsQuery): Promise<StudentListResponse> {
    requireRole(actor, 'students.view');
    const after = query.cursor ? decodeCursor(query.cursor) : null;
    return withTenant(this.db, actor.organizationId, async (tx) => {
      const access = await rosterActor(tx, actor);
      const scope = scopeOf(access);
      const today = await todayFor(tx, actor.organizationId, this.clock);
      let classIds: string[] | null = scope.kind === 'CLASSES' ? [...scope.classIds] : null;
      if (query.classId) classIds = classIds === null || classIds.includes(query.classId) ? [query.classId] : [];
      if (classIds !== null && classIds.length === 0) return { items: [], nextCursor: null };

      let q = tx
        .selectFrom('students')
        .select(['students.id', 'students.name', 'students.external_student_id', 'students.status', sql<string>`lower(students.name)`.as('name_key')])
        .where('students.organization_id', '=', actor.organizationId);
      if (query.status !== 'ALL') q = q.where('students.status', '=', query.status);
      const text = query.q?.trim();
      if (text) {
        const pattern = likePattern(text);
        q = q.where((eb) => eb.or([eb('students.name', 'ilike', pattern), eb('students.external_student_id', 'ilike', pattern)]));
      }
      if (classIds !== null) {
        const ids = classIds;
        q = q.where((eb) =>
          eb.exists(
            eb
              .selectFrom('student_enrollments as e')
              .select(sql`1`.as('one'))
              .whereRef('e.student_id', '=', 'students.id')
              .where('e.organization_id', '=', actor.organizationId)
              .where('e.class_id', 'in', ids)
              .where((inner) => inner.or([inner('e.end_date', 'is', null), inner('e.end_date', '>=', today)])),
          ),
        );
      }
      if (after) q = q.where(sql<boolean>`(lower(students.name), students.id) > (${after.n}, ${after.i}::uuid)`);
      const rows = await q.orderBy(sql`lower(students.name)`).orderBy('students.id').limit(query.limit + 1).execute();
      const page = rows.slice(0, query.limit);
      const enrollments = await this.enrollmentsOf(tx, actor.organizationId, page.map((r) => r.id));
      const last = page.at(-1);
      return {
        items: page.map((r) => this.summary(r, enrollments.get(r.id) ?? [], today)),
        nextCursor: rows.length > query.limit && last ? encodeCursor({ n: last.name_key, i: last.id }) : null,
      };
    });
  }

  async get(actor: Actor, id: string): Promise<StudentResponse> {
    requireRole(actor, 'students.view');
    return withTenant(this.db, actor.organizationId, async (tx) => {
      const access = await rosterActor(tx, actor);
      const today = await todayFor(tx, actor.organizationId, this.clock);
      const row = await this.load(tx, actor.organizationId, id);
      const history = (await this.enrollmentsOf(tx, actor.organizationId, [id])).get(id) ?? [];
      requireAccess(access, 'students.view', this.resource(actor, id, history, today));
      return this.respond(access, row, history, today);
    });
  }

  /** Active students enrolled in an active class on a date, for Daily Entry and Bulk Entry pickers (F03-AC4, AC9, AC10). */
  async entryStudents(actor: Actor, classId: string, date: string | undefined): Promise<EntryStudentsResponse> {
    requireRole(actor, 'daily.write');
    return withTenant(this.db, actor.organizationId, async (tx) => {
      const access = await rosterActor(tx, actor);
      const on = date ?? (await todayFor(tx, actor.organizationId, this.clock));
      if (!isCalendarDate(on)) throw fieldError('date', 'INVALID');
      if (!UUID.test(classId)) throw new AppError('NOT_FOUND');
      const klass = await tx.selectFrom('classes').select(['id', 'status']).where('organization_id', '=', actor.organizationId).where('id', '=', classId).executeTakeFirst();
      if (!klass) throw new AppError('NOT_FOUND');
      requireAccess(access, 'daily.write', { organizationId: actor.organizationId, classIds: [classId] });
      // A deactivated class is not a picker (F03-AC4): the same 404 as a missing class.
      if (klass.status !== 'ACTIVE') throw new AppError('NOT_FOUND');
      const candidates = await tx
        .selectFrom('students')
        .innerJoin('student_enrollments as e', (join) => join.onRef('e.student_id', '=', 'students.id').onRef('e.organization_id', '=', 'students.organization_id'))
        .select(['students.id', 'students.name', 'students.external_student_id', 'students.status'])
        .where('students.organization_id', '=', actor.organizationId)
        .where('e.class_id', '=', classId)
        .where('e.start_date', '<=', on)
        .where((eb) => eb.or([eb('e.end_date', 'is', null), eb('e.end_date', '>=', on)]))
        .orderBy(sql`lower(students.name)`)
        .orderBy('students.id')
        .execute();
      const histories = await this.enrollmentsOf(tx, actor.organizationId, candidates.map((c) => c.id));
      const items = candidates
        .filter((c) => eligibleForEntry({ status: c.status, enrollments: histories.get(c.id) ?? [] }, klass, on))
        .map((c) => ({ id: c.id, name: c.name, externalStudentId: c.external_student_id }));
      return { date: on, items };
    });
  }

  // ---------- Writes ----------

  /**
   * Adds a student to a class (F03-AC6, AC15, AC17). The enrollment starts on the admission date when one is given,
   * otherwise today in the madrasa's timezone.
   */
  async create(actor: Actor, input: CreateStudentRequest): Promise<StudentResponse> {
    requireRole(actor, 'students.edit');
    const name = requiredText('name', input.name);
    const externalStudentId = optionalText(input.externalStudentId);
    const admissionDate = calendarDate('admissionDate', input.admissionDate);
    const privateNotes = optionalText(input.privateNotes);
    const now = this.clock.now();
    const id = uuidv7();
    await mapExternalIdClash(() =>
      withTenant(this.db, actor.organizationId, async (tx) => {
        const access = await rosterActor(tx, actor);
        const klass = await this.loadClass(tx, actor.organizationId, input.classId);
        // A Teacher may add students only to an assigned class; another class is refused like a missing one (F03-AC15).
        requireAccess(access, 'students.edit', { organizationId: actor.organizationId, classIds: [klass.id] });
        if (klass.status !== 'ACTIVE') throw fieldError('classId', 'CLASS_INACTIVE');
        await this.checkExternalIdFree(tx, actor.organizationId, externalStudentId, null);
        const startDate = admissionDate ?? (await todayFor(tx, actor.organizationId, this.clock));
        await tx
          .insertInto('students')
          .values({
            id,
            organization_id: actor.organizationId,
            name,
            external_student_id: externalStudentId,
            admission_date: admissionDate,
            private_notes: privateNotes,
            status: 'ACTIVE',
            created_at: now,
            updated_at: now,
            deactivated_at: null,
          })
          .execute();
        await tx
          .insertInto('student_enrollments')
          .values({
            id: uuidv7(),
            organization_id: actor.organizationId,
            student_id: id,
            class_id: klass.id,
            start_date: startDate,
            end_date: null,
            created_at: now,
            created_by: actor.userId,
            ended_at: null,
            ended_by: null,
          })
          .execute();
        // A new student has no earlier rows on any device, so no Teacher needs a scope reset (F12 decision Q8).
        await recordAudit(tx, {
          organizationId: actor.organizationId,
          actorUserId: actor.userId,
          action: 'STUDENT_CREATED',
          targetType: 'STUDENT',
          targetId: id,
          // Field names only: names and notes are personal data (ARCHITECTURE.md §15).
          summary: { classId: klass.id, startDate, fields: this.fieldNames({ name, externalStudentId, admissionDate, privateNotes }) },
          at: now,
        });
      }),
    );
    return this.get(actor, id);
  }

  /** Edits profile fields (F03-AC15). The class is changed only by a move (Owner/Admin). */
  async update(actor: Actor, id: string, input: UpdateStudentRequest): Promise<StudentResponse> {
    requireRole(actor, 'students.edit');
    const next: Partial<Pick<StudentRow, 'name' | 'external_student_id' | 'admission_date' | 'private_notes'>> = {};
    if (input.name !== undefined) next.name = requiredText('name', input.name);
    if (input.externalStudentId !== undefined) next.external_student_id = optionalText(input.externalStudentId);
    if (input.admissionDate !== undefined) next.admission_date = calendarDate('admissionDate', input.admissionDate);
    if (input.privateNotes !== undefined) next.private_notes = optionalText(input.privateNotes);
    const now = this.clock.now();
    await mapExternalIdClash(() =>
      withTenant(this.db, actor.organizationId, async (tx) => {
        const access = await rosterActor(tx, actor);
        const today = await todayFor(tx, actor.organizationId, this.clock);
        const row = await this.load(tx, actor.organizationId, id, true);
        const history = (await this.enrollmentsOf(tx, actor.organizationId, [id])).get(id) ?? [];
        requireAccess(access, 'students.edit', this.resource(actor, id, history, today));
        const changed = (Object.keys(next) as Array<keyof typeof next>).filter((k) => next[k] !== row[k]);
        if (!changed.length) return;
        if (changed.includes('external_student_id')) await this.checkExternalIdFree(tx, actor.organizationId, next.external_student_id ?? null, id);
        await tx
          .updateTable('students')
          .set({ ...Object.fromEntries(changed.map((k) => [k, next[k] ?? null])), updated_at: now, row_version: Number(row.row_version) + 1 })
          .where('organization_id', '=', actor.organizationId)
          .where('id', '=', id)
          .execute();
        await recordAudit(tx, {
          organizationId: actor.organizationId,
          actorUserId: actor.userId,
          action: 'STUDENT_UPDATED',
          targetType: 'STUDENT',
          targetId: id,
          summary: { fields: changed.map((k) => FIELD_NAMES[k]) },
          at: now,
        });
      }),
    );
    return this.get(actor, id);
  }

  /** Owner/Admin. The student leaves entry pickers; nothing is deleted and the enrollment is kept (F03-AC9). */
  async deactivate(actor: Actor, id: string): Promise<StudentResponse> {
    return this.setStatus(actor, id, 'INACTIVE');
  }

  /** Owner/Admin. The student is back in the pickers of their class, with all history intact (F03-AC10). */
  async reactivate(actor: Actor, id: string): Promise<StudentResponse> {
    return this.setStatus(actor, id, 'ACTIVE');
  }

  /**
   * Owner/Admin: enrolls a student in a class from a date. A student with an open enrollment is moved: the old one
   * ends the day before (F03-AC11, AC18). Every Teacher of either class gets a scope change (F12 decision Q8).
   */
  async enroll(actor: Actor, id: string, input: EnrollStudentRequest): Promise<StudentResponse> {
    requireRole(actor, 'students.deactivateOrMove');
    const startDate = calendarDate('startDate', input.startDate)!;
    const now = this.clock.now();
    await withTenant(this.db, actor.organizationId, async (tx) => {
      // Lock the student first: concurrent moves of one student are serialized, so ranges never overlap.
      await this.load(tx, actor.organizationId, id, true);
      const klass = await this.loadClass(tx, actor.organizationId, input.classId);
      if (klass.status !== 'ACTIVE') throw fieldError('classId', 'CLASS_INACTIVE');
      const history = (await this.enrollmentsOf(tx, actor.organizationId, [id])).get(id) ?? [];
      const planned = planEnrollment(history, { classId: klass.id, startDate });
      if (!planned.ok) throw fieldError(planned.reason === 'SAME_CLASS' ? 'classId' : 'startDate', planned.reason);
      const { end, start } = planned.plan;
      const fromClassId = end ? history.find((e) => e.id === end.id)!.classId : null;
      if (end) {
        await tx
          .updateTable('student_enrollments')
          .set({ end_date: end.endDate, ended_at: now, ended_by: actor.userId })
          .where('organization_id', '=', actor.organizationId)
          .where('id', '=', end.id)
          .where('end_date', 'is', null)
          .execute();
      }
      await tx
        .insertInto('student_enrollments')
        .values({
          id: uuidv7(),
          organization_id: actor.organizationId,
          student_id: id,
          class_id: start.classId,
          start_date: start.startDate,
          end_date: null,
          created_at: now,
          created_by: actor.userId,
          ended_at: null,
          ended_by: null,
        })
        .execute();
      const affected = await tx
        .selectFrom('class_teachers')
        .select('teacher_user_id')
        .distinct()
        .where('organization_id', '=', actor.organizationId)
        .where('class_id', 'in', fromClassId ? [fromClassId, start.classId] : [start.classId])
        .where('unassigned_at', 'is', null)
        .execute();
      for (const { teacher_user_id } of affected) await recordScopeChange(tx, actor.organizationId, teacher_user_id, now);
      await recordAudit(tx, {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        action: end ? 'STUDENT_MOVED' : 'STUDENT_ENROLLED',
        targetType: 'STUDENT',
        targetId: id,
        summary: { fromClassId, toClassId: start.classId, startDate: start.startDate, previousEndDate: end?.endDate ?? null },
        at: now,
      });
    });
    return this.get(actor, id);
  }

  // ---------- Internals ----------

  private async setStatus(actor: Actor, id: string, status: 'ACTIVE' | 'INACTIVE'): Promise<StudentResponse> {
    requireRole(actor, 'students.deactivateOrMove');
    const now = this.clock.now();
    await withTenant(this.db, actor.organizationId, async (tx) => {
      const row = await this.load(tx, actor.organizationId, id, true);
      if (row.status === status) return;
      await tx
        .updateTable('students')
        .set({ status, deactivated_at: status === 'INACTIVE' ? now : null, updated_at: now, row_version: Number(row.row_version) + 1 })
        .where('organization_id', '=', actor.organizationId)
        .where('id', '=', id)
        .execute();
      await recordAudit(tx, {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        action: status === 'INACTIVE' ? 'STUDENT_DEACTIVATED' : 'STUDENT_REACTIVATED',
        targetType: 'STUDENT',
        targetId: id,
        summary: { from: row.status, to: status },
        at: now,
      });
    });
    return this.get(actor, id);
  }

  private async load(tx: Tx, organizationId: string, id: string, forUpdate = false): Promise<StudentRow> {
    if (!UUID.test(id)) throw new AppError('NOT_FOUND');
    let q = tx
      .selectFrom('students')
      .select(['id', 'name', 'external_student_id', 'admission_date', 'private_notes', 'status', 'row_version'])
      .where('organization_id', '=', organizationId)
      .where('id', '=', id);
    if (forUpdate) q = q.forUpdate();
    const row = await q.executeTakeFirst();
    if (!row) throw new AppError('NOT_FOUND');
    return row;
  }

  /** A class referenced in a body; unknown or another madrasa's is the same 404. */
  private async loadClass(tx: Tx, organizationId: string, id: string): Promise<{ id: string; status: 'ACTIVE' | 'INACTIVE' }> {
    const row = await tx.selectFrom('classes').select(['id', 'status']).where('organization_id', '=', organizationId).where('id', '=', id).executeTakeFirst();
    if (!row) throw new AppError('NOT_FOUND');
    return row;
  }

  /** The External Student ID is unique within the madrasa, ignoring case (F03-AC7). */
  private async checkExternalIdFree(tx: Tx, organizationId: string, externalId: string | null, exceptId: string | null): Promise<void> {
    if (externalId === null) return;
    let q = tx
      .selectFrom('students')
      .select('id')
      .where('organization_id', '=', organizationId)
      .where(sql`lower(btrim(external_student_id))`, '=', externalId.toLowerCase());
    if (exceptId) q = q.where('id', '!=', exceptId);
    if (await q.executeTakeFirst()) throw fieldError('externalStudentId', 'TAKEN');
  }

  private async enrollmentsOf(tx: Tx, organizationId: string, studentIds: readonly string[]): Promise<Map<string, EnrollmentRow[]>> {
    const map = new Map<string, EnrollmentRow[]>();
    if (!studentIds.length) return map;
    const rows = await tx
      .selectFrom('student_enrollments as e')
      .innerJoin('classes as c', (join) => join.onRef('c.id', '=', 'e.class_id').onRef('c.organization_id', '=', 'e.organization_id'))
      .select(['e.id', 'e.student_id', 'e.class_id', 'e.start_date', 'e.end_date', 'c.name'])
      .where('e.organization_id', '=', organizationId)
      .where('e.student_id', 'in', [...studentIds])
      .execute();
    for (const r of rows) {
      const list = map.get(r.student_id) ?? [];
      list.push({ id: r.id, studentId: r.student_id, classId: r.class_id, className: r.name, startDate: r.start_date, endDate: r.end_date });
      map.set(r.student_id, list);
    }
    for (const [key, list] of map) map.set(key, enrollmentHistory(list));
    return map;
  }

  /** The classes that put a student in a Teacher's scope: enrollments that have not ended. */
  private resource(actor: Actor, studentId: string, history: readonly EnrollmentRow[], today: string) {
    return {
      organizationId: actor.organizationId,
      studentId,
      classIds: history.filter((e) => e.endDate === null || e.endDate >= today).map((e) => e.classId),
    };
  }

  private summary(row: Pick<StudentRow, 'id' | 'name' | 'external_student_id' | 'status'>, history: readonly EnrollmentRow[], today: string): StudentSummary {
    const current = enrollmentOn(history, today);
    const upcoming = history.find((e) => e.startDate > today) ?? null;
    return {
      id: row.id,
      name: row.name,
      externalStudentId: row.external_student_id,
      status: row.status,
      currentClass: current ? { id: current.classId, name: current.className } : null,
      upcomingClass: upcoming ? { id: upcoming.classId, name: upcoming.className, startDate: upcoming.startDate } : null,
    };
  }

  private respond(access: AccessActor, row: StudentRow, history: readonly EnrollmentRow[], today: string): StudentResponse {
    const response: StudentResponse = {
      ...this.summary(row, history, today),
      admissionDate: row.admission_date,
      privateNotes: row.private_notes,
      enrollments: history.map((e) => ({ id: e.id, classId: e.classId, className: e.className, startDate: e.startDate, endDate: e.endDate })),
      canEdit: true,
      canManage: can(access, 'students.deactivateOrMove'),
    };
    // Staff-only route; the projection is the single outbound choke point (ARCHITECTURE.md §7.4).
    return projectFor('STAFF', 'student', response as unknown as Record<string, unknown>) as unknown as StudentResponse;
  }

  private fieldNames(values: Record<string, unknown>): string[] {
    return Object.entries(values)
      .filter(([, v]) => v !== null)
      .map(([k]) => k);
  }
}

const FIELD_NAMES = {
  name: 'name',
  external_student_id: 'externalStudentId',
  admission_date: 'admissionDate',
  private_notes: 'privateNotes',
} as const;

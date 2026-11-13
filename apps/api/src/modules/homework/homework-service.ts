// Homework for staff (F08; US-033…038): the student's assignments with derived state and next-class progress, one
// assignment, the server's suggestion for a daily record, and the Owner/Admin revision. Plan docs/handover/F08-plan.md.
//
// Drafts, edits, rejection, and confirmation are sync operations (assignment-sync.ts), online and offline alike.
// Everything shown here is derived on read: the display state, "carried over — absent/holiday" (FR-HW-016), portion
// progress from the next-class attempts linked to it (FR-HW-015), and the homework counts (FR-RPT-007). Nothing here
// stores a total. Reads are staff only; a Teacher reaches the classes they are assigned to, and anything else is 404.
import {
  HomeworkListQuery,
  HomeworkSuggestionQuery,
  ReviseHomeworkRequest,
  type HomeworkAssignmentView,
  type HomeworkListResponse,
  type HomeworkPortionView,
  type HomeworkSuggestionResponse,
  type ReviseHomeworkResponse,
} from '@hifz/contracts';
import { dayInfo, type AttendanceStatus, type CalendarException, type ScheduleVersion } from '@hifz/domain/calendar';
import type { PortionStatus } from '@hifz/domain/hifz';
import {
  carryOver,
  confirmIssues,
  dueDateIssue,
  homeworkCounts,
  homeworkPortionProgress,
  homeworkState,
  suggest,
  type HomeworkPortion,
  type HomeworkPortionProgress,
} from '@hifz/domain/homework';
import { addDays, isCalendarDate } from '@hifz/domain/roster';
import type { Clock } from '../../platform/clock.ts';
import type { Db, Tx } from '../../platform/db.ts';
import { AppError, fieldError, parse } from '../../platform/errors.ts';
import { withTenant } from '../../platform/tenant.ts';
import { recordAudit } from '../audit/audit.ts';
import { activeExceptions, scheduleVersions } from '../calendar/shared.ts';
import { UUID, inDailyScope, loadRecordContext, quantityOf, rangeReference } from '../hifz/shared.ts';
import { sourcePortions } from '../hifz/sources.ts';
import type { Actor } from '../identity/auth-service.ts';
import type { QuranMetadataService } from '../quran-ref/metadata-service.ts';
import { assignedClassIds, requireRole, todayFor } from '../roster/shared.ts';
import { appendChange, lockOrganization } from '../sync/change-log.ts';
import { teacherPortion } from './portions.ts';
import { byPosition, carriedElsewhere, defaultDue, loadAssignment, loadAssignments, portionOf, portionValue, writePortions, type AssignmentRow, type PortionRow } from './shared.ts';

interface ListCursor {
  d: string;
  i: string;
}

const encodeCursor = (c: ListCursor): string => Buffer.from(JSON.stringify(c), 'utf8').toString('base64url');

function decodeCursor(value: string): ListCursor {
  try {
    const c = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<ListCursor>;
    if (typeof c.d === 'string' && isCalendarDate(c.d) && typeof c.i === 'string' && UUID.test(c.i)) return { d: c.d, i: c.i };
  } catch {
    // fall through
  }
  throw fieldError('cursor', 'INVALID');
}

type Loaded = { row: AssignmentRow; portions: PortionRow[] };

export class HomeworkService {
  private readonly db: Db;
  private readonly clock: Clock;
  private readonly quran: QuranMetadataService;

  constructor(db: Db, clock: Clock, quran: QuranMetadataService) {
    this.db = db;
    this.clock = clock;
    this.quran = quran;
  }

  /** Class ids a Teacher reaches, or null for the whole madrasa. */
  private async reach(tx: Tx, actor: Actor): Promise<string[] | null> {
    if (actor.role !== 'TEACHER' || actor.allClasses) return null;
    return assignedClassIds(tx, actor.organizationId, actor.userId);
  }

  // ---------- GET /homework/assignments ----------

  async list(actor: Actor, query: unknown): Promise<HomeworkListResponse> {
    requireRole(actor, 'daily.write');
    const q = parse(HomeworkListQuery, query);
    const cursor = q.cursor ? decodeCursor(q.cursor) : null;
    const org = actor.organizationId;
    return withTenant(this.db, org, async (tx) => {
      const student = await tx.selectFrom('students').select('id').where('organization_id', '=', org).where('id', '=', q.studentId).executeTakeFirst();
      if (!student) throw new AppError('NOT_FOUND');
      const reach = await this.reach(tx, actor);
      if (reach && reach.length === 0) throw new AppError('NOT_FOUND');
      let base = tx.selectFrom('homework_assignments').select(['id', 'assigned_date', 'status']).where('organization_id', '=', org).where('student_id', '=', q.studentId);
      if (reach) base = base.where('class_id', 'in', reach);
      const all = await base.orderBy('assigned_date', 'desc').orderBy('id').execute();
      if (reach && all.length === 0) {
        // A Teacher sees a student only through a class they reach (FR-SEC-003).
        const enrolled = await tx.selectFrom('student_enrollments').select('id').where('organization_id', '=', org).where('student_id', '=', q.studentId).where('class_id', 'in', reach).executeTakeFirst();
        if (!enrolled) throw new AppError('NOT_FOUND');
      }
      const filtered = all.filter((a) => (q.status ? a.status === q.status : true));
      const start = cursor ? filtered.findIndex((a) => a.assigned_date < cursor.d || (a.assigned_date === cursor.d && a.id > cursor.i)) : 0;
      const page = start < 0 ? [] : filtered.slice(start, start + q.limit);
      const more = start >= 0 && filtered.length > start + q.limit;
      // Counts cover every live assignment of the student in reach (not just the page); rejected and superseded count
      // nowhere (F08-AC9).
      const live = all.filter((a) => a.status === 'DRAFT' || a.status === 'CONFIRMED').map((a) => a.id);
      const views = await this.views(tx, org, await loadAssignments(tx, org, [...new Set([...page.map((a) => a.id), ...live])]));
      const byId = new Map(views.map((v) => [v.id, v]));
      const counts = homeworkCounts(live.map((id) => byId.get(id)!).map((v) => ({ status: v.status, state: v.state, portions: v.portions.filter((p) => !p.removed).map((p) => p.progress) })));
      const last = page.at(-1);
      return {
        items: page.map((a) => byId.get(a.id)!),
        nextCursor: more && last ? encodeCursor({ d: last.assigned_date, i: last.id }) : null,
        counts,
      };
    });
  }

  // ---------- GET /homework/assignments/:id ----------

  async detail(actor: Actor, id: string): Promise<HomeworkAssignmentView> {
    requireRole(actor, 'daily.write');
    const org = actor.organizationId;
    return withTenant(this.db, org, async (tx) => {
      const loaded = await loadAssignment(tx, org, id);
      if (!loaded || !(await inDailyScope(tx, actor, loaded.row.class_id))) throw new AppError('NOT_FOUND');
      return (await this.views(tx, org, [loaded]))[0]!;
    });
  }

  // ---------- GET /homework/suggestion ----------

  /**
   * The server's suggestion for a daily record (F08-AC3…AC6, AC22): `suggest()` over the record's latest attempts,
   * leaving out attempts already carried forward by a live assignment. Empty = "Nothing to carry forward". Nothing is
   * stored; the app creates the draft (offline too).
   */
  async suggestion(actor: Actor, query: unknown): Promise<HomeworkSuggestionResponse> {
    requireRole(actor, 'daily.write');
    const q = parse(HomeworkSuggestionQuery, query);
    const org = actor.organizationId;
    return withTenant(this.db, org, async (tx) => {
      const record = await loadRecordContext(tx, org, q.dailyRecordId);
      if (!record || !(await inDailyScope(tx, actor, record.classId))) throw new AppError('NOT_FOUND');
      const portions = await sourcePortions(tx, org, { dailyRecordId: record.id });
      const carried = await carriedElsewhere(tx, org, portions.flatMap((p) => p.attempts.map((a) => a.id)), null);
      const assignedDate = await todayFor(tx, org, this.clock);
      return {
        dailyRecordId: record.id,
        studentId: record.studentId,
        assignedDate,
        defaultDueDate: await defaultDue(tx, org, record.classId, assignedDate),
        portions: suggest({ portions, alreadyCarried: carried }).map((s) => ({
          section: s.section,
          position: s.position,
          paraNumber: s.paraNumber,
          range: s.range,
          totalLines: s.totalLines,
          assigned: s.assigned,
          needsReview: s.needsReview,
          sourceAttemptId: s.sourceAttemptId,
          sourceLessonPortionId: s.sourceLessonPortionId,
          sourceHomeworkPortionId: s.sourceHomeworkPortionId,
          why: s.why,
          sourceVersions: s.sourceVersions,
        })),
      };
    });
  }

  // ---------- POST /homework/assignments/:id/revise ----------

  /**
   * An explicit revision of confirmed homework (FR-HW-012, DEC-B17, F08-AC15): Owner/Admin only — a Teacher gets 403
   * (F08-AC17). In one transaction: a new assignment, confirmed by the reviser, linked by `revision_of`; the old one
   * SUPERSEDED with its content unchanged; both audited and both in the change log. A retry with the same new id
   * returns the same result.
   */
  async revise(actor: Actor, id: string, body: unknown): Promise<ReviseHomeworkResponse> {
    requireRole(actor, 'homework.revise');
    const input = parse(ReviseHomeworkRequest, body);
    const org = actor.organizationId;
    const now = this.clock.now();
    return withTenant(this.db, org, async (tx) => {
      await lockOrganization(tx, org);
      const old = await loadAssignment(tx, org, id, { forUpdate: true });
      if (!old) throw new AppError('NOT_FOUND');
      const retry = await tx.selectFrom('homework_assignments').select(['id', 'revision_of']).where('organization_id', '=', org).where('id', '=', input.id).executeTakeFirst();
      if (retry) {
        if (retry.revision_of !== old.row.id) throw new AppError('VALIDATION', { id: 'ID_TAKEN' });
        return this.revisionResult(tx, org, input.id, old.row.id);
      }
      if (old.row.status !== 'CONFIRMED') throw new AppError('VALIDATION', { status: 'NOT_CONFIRMED' });

      const issues: Record<string, string> = {};
      const dueIssue = isCalendarDate(input.dueDate) ? dueDateIssue(old.row.assigned_date, input.dueDate) : 'INVALID';
      if (dueIssue) issues.dueDate = dueIssue;
      const instructions = input.instructions?.trim() || null;
      if (instructions !== null && instructions.length > 500) issues.instructions = 'TOO_LONG';
      const ref = await rangeReference(tx, this.quran, org);
      const oldPortions = new Map(old.portions.filter((p) => p.removed_at === null).map((p) => [p.id, p]));
      const portions: HomeworkPortion[] = [];
      const seen = new Set<string>();
      for (const [i, p] of input.portions.entries()) {
        if (seen.has(p.id)) issues[`portions.${i}.id`] = 'DUPLICATE_ID';
        seen.add(p.id);
        const revised = p.revisesPortionId ? oldPortions.get(p.revisesPortionId) : undefined;
        if (p.revisesPortionId && !revised) {
          issues[`portions.${i}.revisesPortionId`] = 'NOT_FOUND';
          continue;
        }
        const source = revised
          ? { attemptId: revised.source_attempt_id, lessonPortionId: revised.source_lesson_portion_id, homeworkPortionId: revised.id, section: revised.section, lineCountEdition: revised.line_count_edition }
          : null;
        // A revised portion with a source attempt stays traceable (TEACHER_EDITED); otherwise it is new (TEACHER_ADDED).
        const origin = source?.attemptId ? 'TEACHER_EDITED' : 'TEACHER_ADDED';
        const checked = await teacherPortion(tx, this.quran, org, p, origin, ref, source);
        if ('issues' in checked) for (const [field, code] of checked.issues) issues[`portions.${i}.${field}`] ??= code;
        else portions.push({ ...checked.portion, sourceAttemptId: origin === 'TEACHER_EDITED' ? checked.portion.sourceAttemptId : null, sourceLessonPortionId: origin === 'TEACHER_EDITED' ? checked.portion.sourceLessonPortionId : null });
      }
      const taken = await tx.selectFrom('homework_portions').select('id').where('organization_id', '=', org).where('id', 'in', input.portions.map((p) => p.id)).execute();
      for (const t of taken) issues[`portions.${input.portions.findIndex((p) => p.id === t.id)}.id`] = 'ID_TAKEN';
      if (Object.keys(issues).length === 0 && confirmIssues(portions, ref).length > 0) issues.portions = 'INVALID';
      if (Object.keys(issues).length) throw new AppError('VALIDATION', issues);

      // The new assignment: written as a draft, then confirmed (the database lets portions change only on a draft).
      await tx
        .insertInto('homework_assignments')
        .values({
          id: input.id,
          organization_id: org,
          student_id: old.row.student_id,
          class_id: old.row.class_id,
          source_daily_record_id: old.row.source_daily_record_id,
          assigned_date: old.row.assigned_date,
          due_date: input.dueDate,
          status: 'DRAFT',
          revision_of: old.row.id,
          instructions,
          created_by: actor.userId,
          created_at: now,
          updated_at: now,
          updated_by: actor.userId,
          confirmed_by: null,
          confirmed_at: null,
          rejected_by: null,
          rejected_at: null,
          superseded_by_user: null,
          superseded_at: null,
          row_version: 1,
        })
        .execute();
      await writePortions(tx, org, input.id, portions, [], now);
      await tx.updateTable('homework_assignments').set({ status: 'CONFIRMED', confirmed_by: actor.userId, confirmed_at: now }).where('organization_id', '=', org).where('id', '=', input.id).execute();
      const oldNext = Number(old.row.row_version) + 1;
      await tx
        .updateTable('homework_assignments')
        .set({ status: 'SUPERSEDED', superseded_by_user: actor.userId, superseded_at: now, updated_at: now, updated_by: actor.userId, row_version: oldNext })
        .where('organization_id', '=', org)
        .where('id', '=', old.row.id)
        .execute();
      const keys = { studentId: old.row.student_id, classId: old.row.class_id };
      await appendChange(tx, { organizationId: org, entity: 'homework_assignment', entityId: input.id, rowVersion: 1, op: 'UPSERT', changedFields: ['status', 'portions', 'dueDate', 'instructions'], keys, actorUserId: actor.userId, opId: null, at: now });
      await appendChange(tx, { organizationId: org, entity: 'homework_assignment', entityId: old.row.id, rowVersion: oldNext, op: 'UPSERT', changedFields: ['status'], keys, actorUserId: actor.userId, opId: null, at: now });
      await recordAudit(tx, {
        organizationId: org,
        actorUserId: actor.userId,
        action: 'HOMEWORK_REVISED',
        targetType: 'HOMEWORK_ASSIGNMENT',
        targetId: input.id,
        summary: { revisionOf: old.row.id, studentId: old.row.student_id, dueDate: input.dueDate, portionCount: portions.length, confirmedBy: actor.userId, fields: ['dueDate', 'instructions', 'portions'] },
        at: now,
      });
      await recordAudit(tx, {
        organizationId: org,
        actorUserId: actor.userId,
        action: 'HOMEWORK_SUPERSEDED',
        targetType: 'HOMEWORK_ASSIGNMENT',
        targetId: old.row.id,
        summary: { supersededBy: input.id, studentId: old.row.student_id, rowVersion: oldNext },
        at: now,
      });
      return this.revisionResult(tx, org, input.id, old.row.id);
    });
  }

  private async revisionResult(tx: Tx, org: string, createdId: string, supersededId: string): Promise<ReviseHomeworkResponse> {
    const loaded = await loadAssignments(tx, org, [createdId, supersededId]);
    const [created, superseded] = await this.views(tx, org, [loaded.find((l) => l.row.id === createdId)!, loaded.find((l) => l.row.id === supersededId)!]);
    return { created: created!, superseded: superseded! };
  }

  // ---------- Views ----------

  /** Views in the given order, with sources, progress, carried-over state, and names, in a fixed number of queries. */
  private async views(tx: Tx, org: string, list: readonly Loaded[]): Promise<HomeworkAssignmentView[]> {
    if (list.length === 0) return [];
    const today = await todayFor(tx, org, this.clock);
    const ids = list.map((l) => l.row.id);
    const portionIds = list.flatMap((l) => l.portions.map((p) => p.id));
    const userIds = [...new Set(list.flatMap((l) => [l.row.created_by, ...(l.row.confirmed_by ? [l.row.confirmed_by] : [])]))];
    const [users, students, supersededBy, sources, linked] = await Promise.all([
      tx.selectFrom('users').select(['id', 'display_name']).where('id', 'in', userIds).execute(),
      tx.selectFrom('students').select(['id', 'name']).where('organization_id', '=', org).where('id', 'in', [...new Set(list.map((l) => l.row.student_id))]).execute(),
      tx.selectFrom('homework_assignments').select(['id', 'revision_of']).where('organization_id', '=', org).where('revision_of', 'in', ids).execute(),
      this.sourcesOf(tx, org, list.flatMap((l) => l.portions.flatMap((p) => (p.source_attempt_id ? [p.source_attempt_id] : [])))),
      this.linkedAttempts(tx, org, portionIds),
    ]);
    const name = new Map(users.map((u) => [u.id, u.display_name]));
    const studentName = new Map(students.map((s) => [s.id, s.name]));
    const successor = new Map(supersededBy.map((s) => [s.revision_of as string, s.id]));
    const days = await this.dayFacts(tx, org, list, today);

    return list.map(({ row, portions }) => {
      const portionViews: HomeworkPortionView[] = byPosition(portions)
        .sort((a, b) => Number(a.removed_at !== null) - Number(b.removed_at !== null))
        .map((p) => {
          const links = linked.get(p.id) ?? { lessonPortionIds: [], attempts: [] };
          const progress: HomeworkPortionProgress = homeworkPortionProgress(links.attempts);
          return {
            ...portionValue(portionOf(p)),
            removed: p.removed_at !== null,
            source: p.source_attempt_id ? (sources.get(p.source_attempt_id) ?? null) : null,
            progress: { ...progress, lessonPortionIds: links.lessonPortionIds },
          };
        });
      const active = portionViews.filter((p) => !p.removed);
      const carry = row.status === 'CONFIRMED' ? carryOver(row.due_date, today, days(row.class_id, row.student_id)) : null;
      const state = homeworkState({ status: row.status }, active.map((p) => p.progress), carry, today);
      return {
        id: row.id,
        studentId: row.student_id,
        studentName: studentName.get(row.student_id) ?? '',
        classId: row.class_id,
        sourceDailyRecordId: row.source_daily_record_id,
        assignedDate: row.assigned_date,
        dueDate: row.due_date,
        status: row.status,
        state,
        carriedOver: carry?.reason && state === 'CARRIED_OVER' ? { reason: carry.reason, effectiveDueDate: carry.effectiveDueDate } : null,
        instructions: row.instructions,
        createdBy: { userId: row.created_by, displayName: name.get(row.created_by) ?? '' },
        confirmedBy: row.confirmed_by ? { userId: row.confirmed_by, displayName: name.get(row.confirmed_by) ?? '' } : null,
        confirmedAt: row.confirmed_at ? row.confirmed_at.toISOString() : null,
        revisionOf: row.revision_of,
        supersededBy: successor.get(row.id) ?? null,
        createdAt: row.created_at.toISOString(),
        rowVersion: Number(row.row_version),
        // Drafts keep removed rows for history; confirmed homework shows only what was confirmed.
        portions: row.status === 'DRAFT' || row.status === 'REJECTED' ? portionViews : active,
      };
    });
  }

  private async sourcesOf(tx: Tx, org: string, attemptIds: readonly string[]): Promise<Map<string, NonNullable<HomeworkPortionView['source']>>> {
    const out = new Map<string, NonNullable<HomeworkPortionView['source']>>();
    if (attemptIds.length === 0) return out;
    const rows = await tx
      .selectFrom('portion_attempts as a')
      .innerJoin('lesson_portions as p', (j) => j.onRef('p.id', '=', 'a.lesson_portion_id').onRef('p.organization_id', '=', 'a.organization_id'))
      .innerJoin('daily_records as r', (j) => j.onRef('r.id', '=', 'p.daily_record_id').onRef('r.organization_id', '=', 'p.organization_id'))
      .select(['a.id', 'a.status', 'a.completed_unit', 'a.completed_num', 'a.completed_den', 'p.id as portion_id', 'p.assigned_unit', 'p.assigned_num', 'p.assigned_den', 'r.report_date'])
      .where('a.organization_id', '=', org)
      .where('a.id', 'in', [...new Set(attemptIds)])
      .execute();
    for (const r of rows) {
      out.set(r.id, {
        attemptId: r.id,
        lessonPortionId: r.portion_id,
        reportDate: r.report_date,
        status: r.status,
        assigned: { unit: r.assigned_unit, numerator: r.assigned_num, denominator: r.assigned_den },
        completed: quantityOf(r.completed_unit, r.completed_num, r.completed_den),
      });
    }
    return out;
  }

  /** Next-class lesson portions recorded against each homework portion, with their attempts (FR-HW-015). */
  private async linkedAttempts(tx: Tx, org: string, portionIds: readonly string[]) {
    const out = new Map<string, { lessonPortionIds: string[]; attempts: { attemptNo: number; attemptedAt: string; status: PortionStatus }[] }>();
    if (portionIds.length === 0) return out;
    const rows = await tx
      .selectFrom('lesson_portions as p')
      .leftJoin('portion_attempts as a', (j) => j.onRef('a.lesson_portion_id', '=', 'p.id').onRef('a.organization_id', '=', 'p.organization_id'))
      .select(['p.id', 'p.homework_portion_id', 'a.attempt_no', 'a.attempted_at', 'a.status'])
      .where('p.organization_id', '=', org)
      .where('p.homework_portion_id', 'in', [...portionIds])
      .where('p.removed_at', 'is', null)
      .execute();
    for (const r of rows) {
      const entry = out.get(r.homework_portion_id!) ?? { lessonPortionIds: [], attempts: [] };
      if (!entry.lessonPortionIds.includes(r.id)) entry.lessonPortionIds.push(r.id);
      if (r.attempt_no !== null && r.attempted_at !== null && r.status !== null) entry.attempts.push({ attemptNo: r.attempt_no, attemptedAt: r.attempted_at.toISOString(), status: r.status });
      out.set(r.homework_portion_id!, entry);
    }
    return out;
  }

  /**
   * What each day from the earliest confirmed due date on is for a class, and the student's attendance on it, for the
   * carried-over rule (FR-HW-016). Loaded once for the whole list.
   */
  private async dayFacts(tx: Tx, org: string, list: readonly Loaded[], today: string) {
    const confirmed = list.filter((l) => l.row.status === 'CONFIRMED');
    const versions = new Map<string, ScheduleVersion[]>();
    let exceptions: CalendarException[] = [];
    const attendance = new Map<string, AttendanceStatus>();
    if (confirmed.length) {
      const from = confirmed.map((l) => l.row.due_date).sort()[0]!;
      const to = addDays(today > from ? today : from, 130);
      const classIds = [...new Set(confirmed.map((l) => l.row.class_id))];
      for (const v of await scheduleVersions(tx, org, classIds)) versions.set(v.classId, [...(versions.get(v.classId) ?? []), v]);
      exceptions = await activeExceptions(tx, org, { from, to }, classIds);
      const rows = await tx
        .selectFrom('attendance_records')
        .select(['student_id', 'report_date', 'status'])
        .where('organization_id', '=', org)
        .where('student_id', 'in', [...new Set(confirmed.map((l) => l.row.student_id))])
        .where('report_date', '>=', from)
        .where('report_date', '<=', today)
        .execute();
      for (const r of rows) attendance.set(`${r.student_id}:${r.report_date}`, r.status);
    }
    return (classId: string, studentId: string) => (date: string) => ({
      kind: dayInfo(classId, date, versions.get(classId) ?? [], exceptions).kind,
      attendance: attendance.get(`${studentId}:${date}`) ?? null,
    });
  }
}

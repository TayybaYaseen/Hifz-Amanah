// Published reports (F10; US-044, US-045; FR-RPT-010, FR-PORT-006, NFR-PORT-006; DEC-B33). Plan docs/handover/F10-plan.md.
//
// The reporting module owns report_published. This service:
// - publishes and unpublishes a week or month for a class or one student (Teacher for assigned classes, Owner, Admin),
//   refusing while changes for the period are not on the server (F10-AC13, AC14), audited in the same transaction;
// - tells staff which students' reports are published, and when they were last updated;
// - lists and loads published reports for the portal (the portal module decides who may see which student).
//
// "Updated on …" (F10-AC15): reports are always rebuilt from source, so a corrected record shows at once. To say that it
// changed, each published row keeps the SHA-256 of the family payload's fingerprint (@hifz/domain/reports
// publishedFingerprint, built as of fingerprintDay so the passing of days alone never counts). Whenever a published
// report is read (by a family or on the staff publication list) the fingerprint is recomputed; a different one stores the
// new hash and sets updated_at to when the student's sources (or the madrasa's calendar) last changed.
import { createHash } from 'node:crypto';
import { v7 as uuidv7 } from 'uuid';
import {
  PORTAL_REPORTS_PAGE_SIZE,
  PortalReportListQuery,
  PublicationQuery,
  PublishReportsRequest,
  UnpublishReportsRequest,
  type PortalReportListResponse,
  type PublicationResponse,
  type PublishReportsResponse,
} from '@hifz/contracts';
import { fingerprintDay, publishRefusal, publishedFingerprint, type ReportPeriod, type StudentReport } from '@hifz/domain/reports';
import type { Clock } from '../../platform/clock.ts';
import type { Db, Tx } from '../../platform/db.ts';
import { AppError, fieldError, parse } from '../../platform/errors.ts';
import { withTenant } from '../../platform/tenant.ts';
import { projectFor } from '../access/projection.ts';
import { recordAudit } from '../audit/audit.ts';
import type { Actor } from '../identity/auth-service.ts';
import { requireRole } from '../roster/shared.ts';
import type { ReportService, ReportSettings } from './report-service.ts';
import type { StudentRef } from './sources.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

/** What a published row needs for the "Updated on" check. */
interface PublishedRow {
  id: string;
  student_id: string;
  published_at: Date;
  content_hash: string;
  updated_at: Date | null;
}

/** A published report loaded for a family (before projection). */
export interface LoadedPublishedReport {
  id: string;
  publishedAt: string;
  updatedAt: string | null;
  report: StudentReport;
  teachers: { name: string }[];
}

export class PublishedReports {
  private readonly db: Db;
  private readonly clock: Clock;
  private readonly reports: ReportService;

  constructor(db: Db, clock: Clock, reports: ReportService) {
    this.db = db;
    this.clock = clock;
    this.reports = reports;
  }

  // ---------- Staff: POST /reports/publish (F10-AC13, AC14) ----------

  async publish(actor: Actor, body: unknown): Promise<PublishReportsResponse> {
    requireRole(actor, 'reports.publish');
    const input = parse(PublishReportsRequest, body);
    const org = actor.organizationId;
    return withTenant(this.db, org, async (tx) => {
      const { settings, today, period } = await this.reports.periodIn(tx, org, input.kind, input.date);
      const target = await this.target(tx, actor, input, period);
      const refusal = publishRefusal({ period, today, pendingChanges: input.pendingChanges, openConflicts: await this.openConflicts(tx, org, target.students, period) });
      if (refusal) throw new AppError('PUBLISH_REFUSED', { reason: refusal });
      if (target.students.length === 0) return { period, count: 0 };
      const hashes = await this.hashes(tx, org, target.students, period, today, settings);
      const now = this.clock.now();
      await tx
        .insertInto('report_published')
        .values(
          target.students.map((s) => ({
            id: uuidv7(),
            organization_id: org,
            student_id: s.id,
            period_kind: period.kind,
            period_start: period.from,
            period_end: period.to,
            published_by: actor.userId,
            published_at: now,
            content_hash: hashes.get(s.id)!,
            updated_at: null,
            unpublished_by: null,
            unpublished_at: null,
          })),
        )
        // Publishing again (after a correction or an unpublish) is a fresh publication of the same report id.
        .onConflict((oc) =>
          oc.columns(['organization_id', 'student_id', 'period_kind', 'period_start']).doUpdateSet({
            period_end: (eb) => eb.ref('excluded.period_end'),
            published_by: (eb) => eb.ref('excluded.published_by'),
            published_at: (eb) => eb.ref('excluded.published_at'),
            content_hash: (eb) => eb.ref('excluded.content_hash'),
            updated_at: null,
            unpublished_by: null,
            unpublished_at: null,
          }),
        )
        .execute();
      await recordAudit(tx, {
        organizationId: org,
        actorUserId: actor.userId,
        action: 'REPORT_PUBLISHED',
        targetType: target.type,
        targetId: target.id,
        summary: { periodKind: period.kind, periodFrom: period.from, periodTo: period.to, students: target.students.length, studentIds: target.students.map((s) => s.id) },
        at: now,
      });
      return { period, count: target.students.length };
    });
  }

  // ---------- Staff: POST /reports/unpublish ----------

  /** The period disappears from Student and Parent views on their next request (F10 edge case). */
  async unpublish(actor: Actor, body: unknown): Promise<PublishReportsResponse> {
    requireRole(actor, 'reports.publish');
    const input = parse(UnpublishReportsRequest, body);
    const org = actor.organizationId;
    return withTenant(this.db, org, async (tx) => {
      const { period } = await this.reports.periodIn(tx, org, input.kind, input.date);
      const target = await this.target(tx, actor, input, period);
      if (target.students.length === 0) return { period, count: 0 };
      const now = this.clock.now();
      const ended = await tx
        .updateTable('report_published')
        .set({ unpublished_by: actor.userId, unpublished_at: now })
        .where('organization_id', '=', org)
        .where('period_kind', '=', period.kind)
        .where('period_start', '=', period.from)
        .where(
          'student_id',
          'in',
          target.students.map((s) => s.id),
        )
        .where('unpublished_at', 'is', null)
        .returning('student_id')
        .execute();
      if (ended.length) {
        await recordAudit(tx, {
          organizationId: org,
          actorUserId: actor.userId,
          action: 'REPORT_UNPUBLISHED',
          targetType: target.type,
          targetId: target.id,
          summary: { periodKind: period.kind, periodFrom: period.from, periodTo: period.to, students: ended.length, studentIds: ended.map((r) => r.student_id) },
          at: now,
        });
      }
      return { period, count: ended.length };
    });
  }

  // ---------- Staff: GET /reports/publication ----------

  async publication(actor: Actor, query: unknown): Promise<PublicationResponse> {
    requireRole(actor, 'reports.publish');
    const q = parse(PublicationQuery, query);
    const org = actor.organizationId;
    return withTenant(this.db, org, async (tx) => {
      const { settings, today, period } = await this.reports.periodIn(tx, org, q.kind, q.date);
      const target = await this.target(tx, actor, q, period);
      if (target.students.length === 0) return { period, items: [] };
      const rows = await tx
        .selectFrom('report_published')
        .select(['id', 'student_id', 'published_at', 'content_hash', 'updated_at'])
        .where('organization_id', '=', org)
        .where('period_kind', '=', period.kind)
        .where('period_start', '=', period.from)
        .where(
          'student_id',
          'in',
          target.students.map((s) => s.id),
        )
        .where('unpublished_at', 'is', null)
        .execute();
      const published = await this.refreshUpdated(tx, org, rows, target.students, period, today, settings);
      return {
        period,
        items: target.students.map((s) => {
          const row = published.get(s.id);
          return { studentId: s.id, studentName: s.name, publishedAt: row?.published_at.toISOString() ?? null, updatedAt: row?.updated_at?.toISOString() ?? null };
        }),
      };
    });
  }

  // ---------- Portal reads (the caller has already limited `studentId` to the family's students) ----------

  /** A student's published periods, newest first, a page at a time (F10-AC1, AC3). */
  async listFor(tx: Tx, org: string, studentId: string, query: unknown): Promise<PortalReportListResponse> {
    const q = parse(PortalReportListQuery, query);
    const cursor = q.cursor === undefined ? null : decodeCursor(q.cursor);
    let sel = tx
      .selectFrom('report_published')
      .select(['id', 'period_kind', 'period_start', 'period_end', 'published_at', 'updated_at'])
      .where('organization_id', '=', org)
      .where('student_id', '=', studentId)
      .where('unpublished_at', 'is', null);
    if (q.kind) sel = sel.where('period_kind', '=', q.kind);
    if (cursor) {
      sel = sel.where((eb) => eb.or([eb('period_start', '<', cursor.start), eb.and([eb('period_start', '=', cursor.start), eb('period_kind', '>', cursor.kind)])]));
    }
    const rows = await sel.orderBy('period_start', 'desc').orderBy('period_kind', 'asc').limit(PORTAL_REPORTS_PAGE_SIZE + 1).execute();
    const page = rows.slice(0, PORTAL_REPORTS_PAGE_SIZE);
    const last = page.at(-1);
    const items = page
      .map((r) =>
        projectFor('PARENT', 'published_period', {
          published: true,
          id: r.id,
          kind: r.period_kind,
          from: r.period_start,
          to: r.period_end,
          publishedAt: r.published_at.toISOString(),
          updatedAt: r.updated_at?.toISOString() ?? null,
        }),
      )
      .filter((i) => Object.keys(i).length > 0) as unknown as PortalReportListResponse['items'];
    return { items, nextCursor: rows.length > PORTAL_REPORTS_PAGE_SIZE && last ? encodeCursor({ start: last.period_start, kind: last.period_kind }) : null };
  }

  /**
   * One published report by id, if it belongs to one of `studentIds` and is published right now; otherwise 404, the
   * same as a missing id (F10-AC2, AC3, AC7). The report is built from source as of today; the "Updated on" check runs.
   */
  async loadFor(tx: Tx, org: string, id: string, studentIds: readonly string[]): Promise<LoadedPublishedReport> {
    if (!UUID.test(id) || studentIds.length === 0) throw new AppError('NOT_FOUND');
    const row = await tx
      .selectFrom('report_published as p')
      .innerJoin('students as s', (j) => j.onRef('s.id', '=', 'p.student_id').onRef('s.organization_id', '=', 'p.organization_id'))
      .select(['p.id', 'p.student_id', 's.name', 'p.period_kind', 'p.period_start', 'p.published_at', 'p.content_hash', 'p.updated_at'])
      .where('p.organization_id', '=', org)
      .where('p.id', '=', id)
      .where('p.student_id', 'in', [...studentIds])
      .where('p.unpublished_at', 'is', null)
      .executeTakeFirst();
    if (!row) throw new AppError('NOT_FOUND');
    const { settings, today, period } = await this.reports.periodIn(tx, org, row.period_kind, row.period_start);
    const student = { id: row.student_id, name: row.name };
    const [report] = await this.reports.reportsFor(tx, org, [student], period, today, settings);
    const refreshed = (await this.refreshUpdated(tx, org, [row], [student], period, today, settings)).get(row.student_id)!;
    const teachers = await this.teachersOf(tx, org, report!.classes.map((c) => c.classId), period);
    return { id: row.id, publishedAt: refreshed.published_at.toISOString(), updatedAt: refreshed.updated_at?.toISOString() ?? null, report: report!, teachers };
  }

  // ---------- Internals ----------

  /** The students a publish request covers, after the caller's scope check (404 outside it, FR-SEC-008). */
  private async target(
    tx: Tx,
    actor: Actor,
    input: { classId?: string | undefined; studentId?: string | undefined },
    period: ReportPeriod,
  ): Promise<{ type: 'CLASS' | 'STUDENT'; id: string; students: StudentRef[] }> {
    const org = actor.organizationId;
    const reach = await this.reports.reachOf(tx, actor);
    if (input.classId !== undefined) {
      const cls = await tx.selectFrom('classes').select('id').where('organization_id', '=', org).where('id', '=', input.classId).executeTakeFirst();
      if (!cls || (reach && !reach.includes(cls.id))) throw new AppError('NOT_FOUND');
      return { type: 'CLASS', id: cls.id, students: await this.reports.studentsOfClass(tx, org, cls.id, period) };
    }
    if (input.studentId === undefined) throw fieldError('classId', 'TARGET_REQUIRED');
    const student = await this.reports.studentInReach(tx, org, input.studentId, reach);
    return { type: 'STUDENT', id: student.id, students: [student] };
  }

  /**
   * Open sync conflicts for these students on a date in the period: a change the server has not applied yet (F10-AC14).
   * A conflict whose date cannot be told counts, so publishing errs on the side of waiting.
   */
  private async openConflicts(tx: Tx, org: string, students: readonly StudentRef[], period: ReportPeriod): Promise<number> {
    if (students.length === 0) return 0;
    const rows = await tx
      .selectFrom('sync_conflicts')
      .select(['entity', 'entity_id', 'server_fields'])
      .where('organization_id', '=', org)
      .where('status', '=', 'OPEN')
      .where(
        'student_id',
        'in',
        students.map((s) => s.id),
      )
      .execute();
    let count = 0;
    for (const r of rows) {
      const fields = (r.server_fields ?? {}) as Record<string, unknown>;
      let date = typeof fields.reportDate === 'string' ? fields.reportDate : typeof fields.assignedDate === 'string' ? fields.assignedDate : null;
      if (date === null && r.entity === 'lesson_portion') {
        date =
          (
            await tx
              .selectFrom('lesson_portions as p')
              .innerJoin('daily_records as d', (j) => j.onRef('d.id', '=', 'p.daily_record_id').onRef('d.organization_id', '=', 'p.organization_id'))
              .select('d.report_date')
              .where('p.organization_id', '=', org)
              .where('p.id', '=', r.entity_id)
              .executeTakeFirst()
          )?.report_date ?? null;
      }
      if (date === null && r.entity === 'portion_attempt') {
        date =
          (
            await tx
              .selectFrom('portion_attempts as a')
              .innerJoin('lesson_portions as p', (j) => j.onRef('p.id', '=', 'a.lesson_portion_id').onRef('p.organization_id', '=', 'a.organization_id'))
              .innerJoin('daily_records as d', (j) => j.onRef('d.id', '=', 'p.daily_record_id').onRef('d.organization_id', '=', 'p.organization_id'))
              .select('d.report_date')
              .where('a.organization_id', '=', org)
              .where('a.id', '=', r.entity_id)
              .executeTakeFirst()
          )?.report_date ?? null;
      }
      if (date === null || (date >= period.from && date <= period.to)) count += 1;
    }
    return count;
  }

  /** Each student's family fingerprint hash for the period, built as of fingerprintDay. */
  private async hashes(tx: Tx, org: string, students: readonly StudentRef[], period: ReportPeriod, today: string, settings: ReportSettings): Promise<Map<string, string>> {
    const built = await this.reports.reportsFor(tx, org, students, period, fingerprintDay(period, today), settings);
    return new Map(built.map((r) => [r.student.id, sha256(publishedFingerprint(projectFor('PARENT', 'report', r as unknown as Record<string, unknown>)))]));
  }

  /**
   * Recomputes the fingerprint of each published row; a changed one stores the new hash and sets updated_at to the time
   * the student's or the madrasa's sources last changed (never before publishing). Returns the rows as they now are.
   */
  private async refreshUpdated(tx: Tx, org: string, rows: readonly PublishedRow[], students: readonly StudentRef[], period: ReportPeriod, today: string, settings: ReportSettings): Promise<Map<string, PublishedRow>> {
    const out = new Map(rows.map((r) => [r.student_id, { ...r }]));
    if (rows.length === 0) return out;
    const covered = students.filter((s) => out.has(s.id));
    const hashes = await this.hashes(tx, org, covered, period, today, settings);
    const changed = rows.filter((r) => hashes.get(r.student_id) !== r.content_hash);
    if (changed.length === 0) return out;
    const stamps = await tx
      .selectFrom('report_stamps')
      .select(['scope_key', 'stamped_at'])
      .where('organization_id', '=', org)
      .where('scope_key', 'in', ['ORG', ...changed.map((r) => r.student_id)])
      .execute();
    const at = new Map(stamps.map((s) => [s.scope_key, s.stamped_at]));
    const now = this.clock.now();
    for (const r of changed) {
      const last = [at.get(r.student_id), at.get('ORG')].filter((d): d is Date => d instanceof Date).reduce<Date | null>((a, d) => (a === null || d > a ? d : a), null);
      const updatedAt = last && last > r.published_at && last <= now ? last : now;
      await tx.updateTable('report_published').set({ content_hash: hashes.get(r.student_id)!, updated_at: updatedAt }).where('organization_id', '=', org).where('id', '=', r.id).execute();
      out.set(r.student_id, { ...r, content_hash: hashes.get(r.student_id)!, updated_at: updatedAt });
    }
    return out;
  }

  /** The teachers of these classes at any time during the period, by name (FR-PORT-006 "the teacher's name"). */
  private async teachersOf(tx: Tx, org: string, classIds: readonly string[], period: ReportPeriod): Promise<{ name: string }[]> {
    if (classIds.length === 0) return [];
    const rows = await tx
      .selectFrom('class_teachers as t')
      .innerJoin('users as u', 'u.id', 't.teacher_user_id')
      .select('u.display_name')
      .distinct()
      .where('t.organization_id', '=', org)
      .where('t.class_id', 'in', [...new Set(classIds)])
      .where('t.assigned_at', '<=', new Date(period.endsAt))
      .where((eb) => eb.or([eb('t.unassigned_at', 'is', null), eb('t.unassigned_at', '>=', new Date(period.startsAt))]))
      .orderBy('u.display_name')
      .execute();
    return rows.map((r) => ({ name: r.display_name }));
  }
}

// ---------- List cursor ----------

interface PeriodCursor {
  start: string;
  kind: 'WEEK' | 'MONTH';
}

const encodeCursor = (c: PeriodCursor): string => Buffer.from(JSON.stringify(c), 'utf8').toString('base64url');

function decodeCursor(value: string): PeriodCursor {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<PeriodCursor>;
    if (typeof parsed.start === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.start) && (parsed.kind === 'WEEK' || parsed.kind === 'MONTH')) return { start: parsed.start, kind: parsed.kind };
  } catch {
    // fall through
  }
  throw fieldError('cursor', 'INVALID');
}

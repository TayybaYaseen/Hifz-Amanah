// Weekly and monthly reports for staff (F09; US-039…043, US-073; FR-WKR-*, FR-MNR-*, FR-RPT-001…009, FR-RPT-011).
// Plan docs/handover/F09-plan.md; cache design ADR-020.
//
// - Staff only in F09 (Owner, Admin, assigned Teacher; `reports.publish` is the staff report capability of SRS §17.1).
//   A Student or Parent gets 403 before anything is loaded: they see published reports through the F10 portal only
//   (FR-RPT-010), so no report body, and no internal note, can reach them from here (F09-AC15, AC19).
// - A Teacher reaches a student enrolled (at any time) in one of their classes, and the report shows only the days in
//   those classes; a class summary only for an assigned class (or every class with the "all classes" flag). Anything
//   else, or another madrasa's id, is 404 like a missing id (FR-SEC-003, FR-SEC-008).
// - Every report is built by @hifz/domain/reports from the source rows (FR-RPT-001). The cache holds a computed copy,
//   checked on every read against the source stamps the database bumps on each source change, the date it was built
//   for, and the madrasa's timezone and week start; anything different rebuilds from source (F09-AC3, FR-RPT-008).
// - Every payload leaves through projectFor() (ARCHITECTURE.md §7.4).
import {
  ClassSummaryExportQuery,
  ClassSummaryQuery,
  StudentReportQuery,
  type ClassSummaryResponse,
  type ClassSummaryRowView,
  type StudentReportResponse,
  type StudentReportView,
} from '@hifz/contracts';
import { buildReport, classSummary, reportPeriod, type ClassSummary, type ClassSummaryRow, type PeriodKind, type ReportPeriod, type StudentReport } from '@hifz/domain/reports';
import type { WeekStart } from '@hifz/domain/calendar';
import { calendarDateIn, inReportPeriod, isCalendarDate } from '@hifz/domain/roster';
import { sql } from 'kysely';
import type { Clock } from '../../platform/clock.ts';
import type { Db, Tx } from '../../platform/db.ts';
import { AppError, fieldError, parse } from '../../platform/errors.ts';
import { withTenant } from '../../platform/tenant.ts';
import { projectFor } from '../access/projection.ts';
import { recordAudit } from '../audit/audit.ts';
import { enrollmentsOf } from '../calendar/shared.ts';
import type { HomeworkService } from '../homework/homework-service.ts';
import type { Actor } from '../identity/auth-service.ts';
import { assignedClassIds, requireRole } from '../roster/shared.ts';
import { chromiumRenderer, classSummaryHtml, classSummaryXlsx, type PdfRenderer } from './export.ts';
import { loadReportInputs, type StudentRef } from './sources.ts';

// Compile-time guard: the domain report and summary row are the contract views. A drift between
// @hifz/domain/reports and packages/contracts/src/reports.ts fails the typecheck here.
const asView = (r: StudentReport): StudentReportView => r;
const asRowView = (r: ClassSummaryRow): ClassSummaryRowView => r;
void asView;
void asRowView;

/** The organization settings a report depends on. */
export interface ReportSettings {
  timeZone: string;
  weekStart: WeekStart;
}

const isUuid = (v: string): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

const settingsKey = (s: ReportSettings): string => `${s.timeZone}|${s.weekStart}`;

/** 'ALL', or the sorted class ids of the viewer's scope. */
const scopeKeyOf = (scope: readonly string[] | null): string => (scope === null ? 'ALL' : [...scope].sort().join(','));

/** Cached rows for one period and scope, by student, with the stamps they must match. */
interface Stamps {
  org: string;
  students: Map<string, string>;
}

export interface CacheMismatch {
  studentId: string;
  periodKind: PeriodKind;
  periodStart: string;
  scopeKey: string;
}

export class ReportService {
  private readonly db: Db;
  private readonly clock: Clock;
  private readonly homework: HomeworkService;
  private readonly pdf: PdfRenderer;

  constructor(db: Db, clock: Clock, homework: HomeworkService, pdf: PdfRenderer = chromiumRenderer()) {
    this.db = db;
    this.clock = clock;
    this.homework = homework;
    this.pdf = pdf;
  }

  /** Closes the PDF renderer (the app's onClose). */
  async close(): Promise<void> {
    await this.pdf.close();
  }

  // ---------- GET /reports/student ----------

  async studentReport(actor: Actor, query: unknown): Promise<StudentReportResponse> {
    requireRole(actor, 'reports.publish');
    const q = parse(StudentReportQuery, query);
    if (q.date !== undefined && !isCalendarDate(q.date)) throw fieldError('date', 'INVALID');
    const org = actor.organizationId;
    return withTenant(this.db, org, async (tx) => {
      const reach = await this.reachOf(tx, actor);
      const student = await this.studentInReach(tx, org, q.studentId, reach);
      const settings = await this.settings(tx, org);
      const today = calendarDateIn(this.clock.now(), settings.timeZone);
      const period = reportPeriod(q.kind, q.date ?? today, settings);
      const [report] = await this.reports(tx, org, [student], period, today, reach, settings);
      return { report: projectFor('STAFF', 'report', report as unknown as Record<string, unknown>) as unknown as StudentReportView, generatedAt: this.clock.now().toISOString() };
    });
  }

  // ---------- GET /reports/class-summary ----------

  async classSummary(actor: Actor, query: unknown): Promise<ClassSummaryResponse> {
    requireRole(actor, 'reports.publish');
    const q = parse(ClassSummaryQuery, query);
    if (q.date !== undefined && !isCalendarDate(q.date)) throw fieldError('date', 'INVALID');
    return withTenant(this.db, actor.organizationId, async (tx) => {
      const { className, summary } = await this.summaryFor(tx, actor, q);
      return { classId: summary.classId, className, period: summary.period, today: summary.today, rows: summary.rows, generatedAt: this.clock.now().toISOString() };
    });
  }

  // ---------- GET /reports/class-summary/export (F09-AC20) ----------

  /**
   * The class summary as a file: the same projected summary the screen gets, rendered by export.ts. Staff only with the
   * summary's scope rules; audited CLASS_SUMMARY_EXPORTED (format, period, row count; never the content) in the same
   * transaction (ARCHITECTURE.md §15 "export jobs"). The file is built before the audit row, so a failed render leaves
   * no audit of an export that did not happen.
   */
  async exportClassSummary(actor: Actor, query: unknown): Promise<{ body: Buffer; contentType: string; fileName: string }> {
    requireRole(actor, 'reports.publish');
    const q = parse(ClassSummaryExportQuery, query);
    if (q.date !== undefined && !isCalendarDate(q.date)) throw fieldError('date', 'INVALID');
    const org = actor.organizationId;
    const locale = q.locale ?? 'en';
    return withTenant(this.db, org, async (tx) => {
      const { className, summary } = await this.summaryFor(tx, actor, q);
      const meta = { className, generatedAt: this.clock.now().toISOString(), locale };
      const body = q.format === 'xlsx' ? await classSummaryXlsx(summary, meta) : await this.pdf.render(classSummaryHtml(summary, meta));
      await recordAudit(tx, {
        organizationId: org,
        actorUserId: actor.userId,
        action: 'CLASS_SUMMARY_EXPORTED',
        targetType: 'CLASS',
        targetId: summary.classId,
        summary: { format: q.format, periodKind: summary.period.kind, periodFrom: summary.period.from, periodTo: summary.period.to, locale, rows: summary.rows.length },
        at: this.clock.now(),
      });
      return {
        body,
        contentType: q.format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf',
        fileName: `class-summary-${summary.period.kind.toLowerCase()}-${summary.period.from}.${q.format}`,
      };
    });
  }

  /** The class summary for the screen and the exports, after projectFor('STAFF', 'class_summary'). */
  private async summaryFor(tx: Tx, actor: Actor, q: { classId: string; kind: PeriodKind; date?: string | undefined }): Promise<{ className: string; summary: ClassSummary }> {
    const org = actor.organizationId;
    const cls = await tx.selectFrom('classes').select(['id', 'name']).where('organization_id', '=', org).where('id', '=', q.classId).executeTakeFirst();
    if (!cls) throw new AppError('NOT_FOUND');
    const reach = await this.reachOf(tx, actor);
    if (reach && !reach.includes(cls.id)) throw new AppError('NOT_FOUND');
    const settings = await this.settings(tx, org);
    const today = calendarDateIn(this.clock.now(), settings.timeZone);
    const period = reportPeriod(q.kind, q.date ?? today, settings);
    const inClass = await this.studentsOfClass(tx, org, cls.id, period);
    const reports = await this.reports(tx, org, inClass, period, today, [cls.id], settings);
    const summary = classSummary(cls.id, period, today, reports);
    return { className: cls.name, summary: projectFor('STAFF', 'class_summary', summary as unknown as Record<string, unknown>) as unknown as ClassSummary };
  }

  // ---------- Cache verification (FR-RPT-008, NFR-PERF-004) ----------

  /**
   * Recomputes up to `sample` cached reports of the madrasa from source and lists the ones whose cached payload differs
   * from a fresh build while their stamps say they are current. An empty list means the cache is reproducible. The
   * nightly job of ARCHITECTURE.md §9.3 calls this once a worker entrypoint exists (no pg-boss worker yet).
   */
  async verifyCache(organizationId: string, sample = 50): Promise<CacheMismatch[]> {
    return withTenant(this.db, organizationId, async (tx) => {
      const settings = await this.settings(tx, organizationId);
      const today = calendarDateIn(this.clock.now(), settings.timeZone);
      const rows = await tx
        .selectFrom('report_cache as c')
        .innerJoin('students as s', (j) => j.onRef('s.id', '=', 'c.student_id').onRef('s.organization_id', '=', 'c.organization_id'))
        .select(['c.student_id', 's.name', 'c.period_kind', 'c.period_start', 'c.scope_key', 'c.settings_key', 'c.as_of', 'c.org_stamp', 'c.student_stamp', 'c.payload'])
        .where('c.organization_id', '=', organizationId)
        .where('c.as_of', '=', today)
        .where('c.settings_key', '=', settingsKey(settings))
        .orderBy('c.built_at', 'desc')
        .limit(sample)
        .execute();
      const stamps = await this.stamps(tx, organizationId, rows.map((r) => r.student_id));
      const mismatches: CacheMismatch[] = [];
      for (const r of rows) {
        if (String(r.org_stamp) !== stamps.org || String(r.student_stamp) !== (stamps.students.get(r.student_id) ?? '0')) continue; // stale: rebuilt on next read
        const period = reportPeriod(r.period_kind, r.period_start, settings);
        const scope = r.scope_key === 'ALL' ? null : r.scope_key.split(',');
        const inputs = await loadReportInputs(tx, { homework: this.homework }, organizationId, [{ id: r.student_id, name: r.name }], period, today, scope);
        const fresh = buildReport(inputs.get(r.student_id)!);
        if (JSON.stringify(canonicalJson(fresh)) !== JSON.stringify(canonicalJson(r.payload))) {
          mismatches.push({ studentId: r.student_id, periodKind: r.period_kind, periodStart: r.period_start, scopeKey: r.scope_key });
        }
      }
      return mismatches;
    });
  }

  // ---------- For publishing and the portal (F10) ----------

  /** Class ids a Teacher reaches, or null for the whole madrasa (Owner, Admin, "all classes"). */
  async reachOf(tx: Tx, actor: Actor): Promise<string[] | null> {
    if (actor.role !== 'TEACHER' || actor.allClasses) return null;
    return assignedClassIds(tx, actor.organizationId, actor.userId);
  }

  /**
   * A student the reach includes: anyone in the madrasa for a null reach, otherwise a student enrolled (at any time) in
   * one of the reached classes. Anything else, including another madrasa's id, is 404 like a missing id.
   */
  async studentInReach(tx: Tx, org: string, studentId: string, reach: readonly string[] | null): Promise<StudentRef> {
    if (!isUuid(studentId)) throw new AppError('NOT_FOUND');
    const student = await tx.selectFrom('students').select(['id', 'name']).where('organization_id', '=', org).where('id', '=', studentId).executeTakeFirst();
    if (!student) throw new AppError('NOT_FOUND');
    if (reach) {
      const enrolled = reach.length
        ? await tx.selectFrom('student_enrollments').select('id').where('organization_id', '=', org).where('student_id', '=', student.id).where('class_id', 'in', [...reach]).executeTakeFirst()
        : undefined;
      if (!enrolled) throw new AppError('NOT_FOUND');
    }
    return { id: student.id, name: student.name };
  }

  /** Every student enrolled in the class at any time during the period, whatever their status today (FR-STU-004). */
  async studentsOfClass(tx: Tx, org: string, classId: string, period: ReportPeriod): Promise<StudentRef[]> {
    const enrolledRows = await tx
      .selectFrom('student_enrollments as e')
      .innerJoin('students as s', (j) => j.onRef('s.id', '=', 'e.student_id').onRef('s.organization_id', '=', 'e.organization_id'))
      .select(['s.id', 's.name'])
      .where('e.organization_id', '=', org)
      .where('e.class_id', '=', classId)
      .where('e.start_date', '<=', period.to)
      .where((eb) => eb.or([eb('e.end_date', 'is', null), eb('e.end_date', '>=', period.from)]))
      .execute();
    const students = [...new Map(enrolledRows.map((r) => [r.id, { id: r.id, name: r.name }])).values()];
    const enrollments = await enrollmentsOf(tx, org, students.map((s) => s.id));
    return students.filter((s) => inReportPeriod(enrollments.get(s.id) ?? [], period, classId));
  }

  /** The madrasa's settings, its today, and the period of `kind` holding `date` (default today). */
  async periodIn(tx: Tx, org: string, kind: PeriodKind, date?: string): Promise<{ settings: ReportSettings; today: string; period: ReportPeriod }> {
    if (date !== undefined && !isCalendarDate(date)) throw fieldError('date', 'INVALID');
    const settings = await this.settings(tx, org);
    const today = calendarDateIn(this.clock.now(), settings.timeZone);
    return { settings, today, period: reportPeriod(kind, date ?? today, settings) };
  }

  /** The reports of these students (whole madrasa unless `scope`) as of `asOf`, cache-checked like every staff read. */
  reportsFor(tx: Tx, org: string, students: readonly StudentRef[], period: ReportPeriod, asOf: string, settings: ReportSettings, scope: readonly string[] | null = null): Promise<StudentReport[]> {
    return this.reports(tx, org, students, period, asOf, scope, settings);
  }

  // ---------- Internals ----------

  private async settings(tx: Tx, org: string): Promise<ReportSettings> {
    const o = await tx.selectFrom('organizations').select(['timezone', 'week_start']).where('id', '=', org).executeTakeFirstOrThrow();
    return { timeZone: o.timezone, weekStart: o.week_start };
  }

  /** The madrasa stamp and each student's stamp; '0' when nothing was ever written. */
  private async stamps(tx: Tx, org: string, studentIds: readonly string[]): Promise<Stamps> {
    const keys = ['ORG', ...new Set(studentIds)];
    const rows = await tx.selectFrom('report_stamps').select(['scope_key', 'stamp']).where('organization_id', '=', org).where('scope_key', 'in', keys).execute();
    const byKey = new Map(rows.map((r) => [r.scope_key, String(r.stamp)]));
    return { org: byKey.get('ORG') ?? '0', students: new Map(studentIds.map((id) => [id, byKey.get(id) ?? '0'])) };
  }

  /**
   * The students' reports for one period and scope, in the given order: current cache rows where they match, the rest
   * built from source in one batch and written back in one statement. The stamps are read before the sources, so a
   * change committed meanwhile leaves a stamp the next read will not match: it rebuilds rather than serve stale data.
   */
  private async reports(tx: Tx, org: string, students: readonly StudentRef[], period: ReportPeriod, today: string, scope: readonly string[] | null, settings: ReportSettings): Promise<StudentReport[]> {
    if (students.length === 0) return [];
    const scopeKey = scopeKeyOf(scope);
    const sKey = settingsKey(settings);
    const stamps = await this.stamps(tx, org, students.map((s) => s.id));
    const cached = await tx
      .selectFrom('report_cache')
      .select(['student_id', 'settings_key', 'as_of', 'org_stamp', 'student_stamp', 'payload'])
      .where('organization_id', '=', org)
      .where(
        'student_id',
        'in',
        students.map((s) => s.id),
      )
      .where('period_kind', '=', period.kind)
      .where('period_start', '=', period.from)
      .where('scope_key', '=', scopeKey)
      .execute();
    const hits = new Map<string, StudentReport>();
    for (const c of cached) {
      const current = c.settings_key === sKey && c.as_of === today && String(c.org_stamp) === stamps.org && String(c.student_stamp) === (stamps.students.get(c.student_id) ?? '0');
      if (current) hits.set(c.student_id, c.payload as StudentReport);
    }
    const misses = students.filter((s) => !hits.has(s.id));
    if (misses.length) {
      const inputs = await loadReportInputs(tx, { homework: this.homework }, org, misses, period, today, scope);
      const builtAt = this.clock.now();
      const fresh = misses.map((s) => buildReport(inputs.get(s.id)!));
      for (const r of fresh) hits.set(r.student.id, r);
      await tx
        .insertInto('report_cache')
        .values(
          fresh.map((r) => ({
            organization_id: org,
            student_id: r.student.id,
            period_kind: period.kind,
            period_start: period.from,
            scope_key: scopeKey,
            settings_key: sKey,
            as_of: today,
            org_stamp: stamps.org,
            student_stamp: stamps.students.get(r.student.id) ?? '0',
            payload: JSON.stringify(r),
            built_at: builtAt,
          })),
        )
        .onConflict((oc) =>
          oc.columns(['organization_id', 'student_id', 'period_kind', 'period_start', 'scope_key']).doUpdateSet({
            settings_key: (eb) => eb.ref('excluded.settings_key'),
            as_of: (eb) => eb.ref('excluded.as_of'),
            org_stamp: (eb) => eb.ref('excluded.org_stamp'),
            student_stamp: (eb) => eb.ref('excluded.student_stamp'),
            payload: sql`excluded.payload`,
            built_at: (eb) => eb.ref('excluded.built_at'),
          }),
        )
        .execute();
    }
    return students.map((s) => hits.get(s.id)!);
  }
}

/** JSON with object keys sorted (jsonb does not keep key order), for exact comparison. */
function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, canonicalJson((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

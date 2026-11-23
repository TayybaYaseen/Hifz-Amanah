// Excel export (F14; US-061; FR-XLS-006, FR-XLS-007, FR-XLS-009, FR-XLS-017, FR-EXP-004, NFR-XLS-004; BR-13;
// AC-XLS-05, AC-XLS-06). Plan: docs/handover/F14-plan.md.
//
// - Same organization, role, date-range, and note-visibility limits as the in-app views (FR-XLS-007): a Teacher gets
//   only the students and records of their classes (F14-AC16); at most 1,000 students or records per file, else the
//   export is refused so the user narrows it (FR-XLS-017).
// - Private staff notes (a student's Notes, an attempt's TeacherNotes) appear only in a STAFF file and only when the
//   user asked for them (the app warns first, design §4.15). A FAMILY (student/guardian) file is built through
//   projectFor('PARENT', 'export_daily_record_row', …): internal notes are absent, a remark the Teacher shared stays
//   (F14-AC17, BR-13).
// - Files keep identifiers, dates, units, canonical statuses, and Arabic text unchanged, and every text cell is
//   escaped against formula injection (F14-AC18, AC19). The Students and DailyRecords files use the import templates,
//   so they can be imported back (an exported portion id is a stable ExternalRecordID).
// - The report export carries the period, timezone, filters, generation time, and the pending-offline-changes flag
//   (SRS §15.1, F14-AC19). Server-built files come from synced data only, so the flag is false (NFR-OFF-008).
// - Every export is audited EXPORT_CREATED with counts and filters, never student details (F14-AC20).
import {
  DAILY_RECORD_COLUMNS,
  DailyRecordsExportQuery,
  EXPORT_ROW_LIMIT,
  ReportExportQuery,
  STUDENT_COLUMNS,
  StudentsExportQuery,
  TEMPLATE_VERSIONS,
  type Locale,
} from '@hifz/contracts';
import { attemptMistakeCount } from '@hifz/domain/mistakes';
import type { ClassSummary } from '@hifz/domain/reports';
import { classOn, isCalendarDate } from '@hifz/domain/roster';
import type { Clock } from '../../platform/clock.ts';
import type { Db } from '../../platform/db.ts';
import { AppError, fieldError, parse } from '../../platform/errors.ts';
import { withTenant } from '../../platform/tenant.ts';
import { can, scopeOf } from '../access/policy.ts';
import { projectFor } from '../access/projection.ts';
import { recordAudit } from '../audit/audit.ts';
import { enrollmentsOf } from '../calendar/shared.ts';
import { storedPortions } from '../hifz/import-support.ts';
import type { Actor } from '../identity/auth-service.ts';
import { exportTable } from '../reporting/export.ts';
import type { ReportService } from '../reporting/report-service.ts';
import { requireRole, rosterActor, todayFor } from '../roster/shared.ts';
import { localeOf } from './messages.ts';
import { templateQuantities } from './rows.ts';
import { writeWorkbook } from './workbook.ts';

export interface ExportFile {
  body: Buffer;
  fileName: string;
}

interface AboutLabels {
  template: string;
  version: string;
  generated: string;
  filters: string;
  period: string;
  timeZone: string;
  pending: string;
  no: string;
  privateNotes: string;
  noPrivateNotes: string;
  familyAudience: string;
  rows: string;
  title: Record<'Students' | 'DailyRecords' | 'Report', string>;
}

// TODO(F11): move into packages/i18n-keys with the other server strings; wording awaits the glossary (DEC-B39).
const ABOUT: Record<Locale, AboutLabels> = {
  en: {
    template: 'Template',
    version: 'Template version',
    generated: 'Generated',
    filters: 'Filters',
    period: 'Period',
    timeZone: 'Timezone',
    pending: 'Pending offline changes',
    no: 'No (built from synced data)',
    privateNotes: 'Contains private staff notes. Staff only: do not share with students or parents.',
    noPrivateNotes: 'No private staff notes.',
    familyAudience: 'For a student or guardian: private staff notes are not included.',
    rows: 'Rows',
    title: { Students: 'Student list', DailyRecords: 'Daily Hifz records', Report: 'Class report' },
  },
  'ur-Latn': {
    template: 'Template',
    version: 'Template version',
    generated: 'Tayyar kiya gaya',
    filters: 'Filters',
    period: 'Muddat',
    timeZone: 'Time zone',
    pending: 'Offline tabdeeliyan baqi',
    no: 'Nahin (sync shuda data se)',
    privateNotes: 'Is mein amle ke niji notes hain. Sirf amle ke liye: talaba ya walidain ko na dein.',
    noPrivateNotes: 'Amle ke niji notes shamil nahin.',
    familyAudience: 'Talib-e-ilm ya sarparast ke liye: amle ke niji notes shamil nahin.',
    rows: 'Lines',
    title: { Students: 'Talaba ki fehrist', DailyRecords: 'Rozana Hifz record', Report: 'Jamaat ki report' },
  },
  ur: {
    template: 'سانچہ',
    version: 'سانچے کا ورژن',
    generated: 'تیار کیا گیا',
    filters: 'فلٹر',
    period: 'مدت',
    timeZone: 'ٹائم زون',
    pending: 'آف لائن تبدیلیاں باقی',
    no: 'نہیں (ہم آہنگ ڈیٹا سے)',
    privateNotes: 'اس میں عملے کے نجی نوٹس ہیں۔ صرف عملے کے لیے: طلبہ یا والدین کو نہ دیں۔',
    noPrivateNotes: 'عملے کے نجی نوٹس شامل نہیں۔',
    familyAudience: 'طالب علم یا سرپرست کے لیے: عملے کے نجی نوٹس شامل نہیں۔',
    rows: 'سطریں',
    title: { Students: 'طلبہ کی فہرست', DailyRecords: 'روزانہ حفظ ریکارڈ', Report: 'جماعت کی رپورٹ' },
  },
};

const filtersText = (filters: Record<string, string | boolean | null | undefined>): string =>
  Object.entries(filters)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join('; ');

export class ExportService {
  private readonly db: Db;
  private readonly clock: Clock;
  private readonly reports: ReportService;

  constructor(db: Db, clock: Clock, reports: ReportService) {
    this.db = db;
    this.clock = clock;
    this.reports = reports;
  }

  /** The Students template with the caller's students (Teacher: their classes). */
  async students(actor: Actor, query: unknown, acceptLanguage: string | undefined): Promise<ExportFile> {
    requireRole(actor, 'students.view');
    const q = parse(StudentsExportQuery, query);
    const locale = localeOf(q.locale, acceptLanguage);
    const l = ABOUT[locale];
    const org = actor.organizationId;
    const now = this.clock.now();
    return withTenant(this.db, org, async (tx) => {
      const access = await rosterActor(tx, actor);
      const scope = scopeOf(access);
      const includeNotes = q.includeNotes && can(access, 'notes.internal.view');
      const today = await todayFor(tx, org, this.clock);
      let classIds: string[] | null = scope.kind === 'CLASSES' ? [...scope.classIds] : null;
      if (q.classId) classIds = classIds === null || classIds.includes(q.classId) ? [q.classId] : [];
      let sq = tx.selectFrom('students').select(['id', 'name', 'external_student_id', 'admission_date', 'status', 'private_notes']).where('organization_id', '=', org);
      if (q.status !== 'ALL') sq = sq.where('status', '=', q.status);
      const students = classIds !== null && classIds.length === 0 ? [] : await sq.orderBy('name').orderBy('id').execute();
      const enrollments = await enrollmentsOf(tx, org, students.map((s) => s.id));
      const classes = new Map((await tx.selectFrom('classes').select(['id', 'name']).where('organization_id', '=', org).execute()).map((c) => [c.id, c.name]));
      const visible = students.filter((s) => {
        if (classIds === null) return true;
        return (enrollments.get(s.id) ?? []).some((e) => (e.endDate === null || e.endDate >= today) && classIds!.includes(e.classId));
      });
      if (visible.length > EXPORT_ROW_LIMIT) throw new AppError('EXPORT_TOO_LARGE', { max: String(EXPORT_ROW_LIMIT) });
      const rows = visible.map((s) => {
        const current = classOn(enrollments.get(s.id) ?? [], today);
        // Staff-only file: the projection is the outbound choke point (ARCHITECTURE §7.4).
        const p = projectFor('STAFF', 'student', { ...s }) as typeof s;
        return [p.external_student_id, p.name, current ? (classes.get(current) ?? null) : null, p.admission_date, p.status, includeNotes ? p.private_notes : null];
      });
      const body = await writeWorkbook({
        templateName: 'Students',
        templateVersion: TEMPLATE_VERSIONS.Students,
        createdAt: now,
        about: [
          [l.title.Students, ''],
          [l.template, 'Students'],
          [l.version, TEMPLATE_VERSIONS.Students],
          [l.generated, now.toISOString()],
          [l.filters, filtersText({ classId: q.classId, status: q.status })],
          [l.rows, String(rows.length)],
          ['', includeNotes ? l.privateNotes : l.noPrivateNotes],
        ],
        sheets: [{ name: 'Students', header: STUDENT_COLUMNS, rows }],
        meta: [
          ['GeneratedAt', now.toISOString()],
          ['Filters', filtersText({ classId: q.classId, status: q.status })],
          ['Audience', 'STAFF'],
          ['IncludesPrivateNotes', String(includeNotes)],
          ['PendingOfflineChanges', 'false'],
        ],
      });
      await recordAudit(tx, {
        organizationId: org,
        actorUserId: actor.userId,
        action: 'EXPORT_CREATED',
        targetType: 'EXPORT',
        targetId: null,
        summary: { kind: 'STUDENTS', rows: rows.length, classId: q.classId ?? null, status: q.status, includesPrivate: includeNotes, locale },
        at: now,
      });
      return { body, fileName: `students-${now.toISOString().slice(0, 10)}.xlsx` };
    });
  }

  /** The DailyRecords template: one row per portion (its latest attempt), in the caller's scope and date range. */
  async dailyRecords(actor: Actor, query: unknown, acceptLanguage: string | undefined): Promise<ExportFile> {
    requireRole(actor, 'daily.write');
    const q = parse(DailyRecordsExportQuery, query);
    if (!isCalendarDate(q.from)) throw fieldError('from', 'INVALID');
    if (!isCalendarDate(q.to) || q.to < q.from) throw fieldError('to', 'INVALID');
    const locale = localeOf(q.locale, acceptLanguage);
    const l = ABOUT[locale];
    const org = actor.organizationId;
    const now = this.clock.now();
    return withTenant(this.db, org, async (tx) => {
      const access = await rosterActor(tx, actor);
      const scope = scopeOf(access);
      let classIds: string[] | null = scope.kind === 'CLASSES' ? [...scope.classIds] : null;
      if (q.classId) classIds = classIds === null || classIds.includes(q.classId) ? [q.classId] : [];
      if (q.studentId) {
        const s = await tx.selectFrom('students').select('id').where('organization_id', '=', org).where('id', '=', q.studentId).executeTakeFirst();
        if (!s) throw new AppError('NOT_FOUND');
      }
      const staff = q.audience === 'STAFF';
      const includeNotes = staff && q.includeNotes && can(access, 'notes.internal.view');
      const portions = await storedPortions(tx, org, { from: q.from, to: q.to, classIds, studentIds: q.studentId ? [q.studentId] : null });
      if (portions.length > EXPORT_ROW_LIMIT) throw new AppError('EXPORT_TOO_LARGE', { max: String(EXPORT_ROW_LIMIT) });
      const studentIds = [...new Set(portions.map((p) => p.studentId))];
      const ext = new Map(
        studentIds.length
          ? (await tx.selectFrom('students').select(['id', 'external_student_id']).where('organization_id', '=', org).where('id', 'in', studentIds).execute()).map((s) => [s.id, s.external_student_id])
          : [],
      );
      const keys = new Map(
        portions.length
          ? (
              await tx
                .selectFrom('import_record_keys')
                .select(['lesson_portion_id', 'external_record_id'])
                .where('organization_id', '=', org)
                .where(
                  'lesson_portion_id',
                  'in',
                  portions.map((p) => p.id),
                )
                .execute()
            ).map((k) => [k.lesson_portion_id, k.external_record_id])
          : [],
      );
      const rows = portions.map((p) => {
        const a = p.latest;
        const tq = templateQuantities(p.assigned, a?.completed ?? null);
        const count = a ? attemptMistakeCount({ noMistakes: a.noMistakes, mistakes: new Array(a.categorizedCount).fill(null) as never[], uncategorizedCount: a.mistakeCountSummary }) : null;
        const line = {
          externalRecordId: keys.get(p.id) ?? p.id,
          externalStudentId: ext.get(p.studentId) ?? null,
          recordDate: p.recordDate,
          sessionLabel: p.sessionLabel,
          section: p.section,
          position: p.position,
          paraNumber: p.paraNumber,
          surahStart: p.range?.surahStart ?? null,
          ayahStart: p.range?.ayahStart ?? null,
          surahEnd: p.range?.surahEnd ?? null,
          ayahEnd: p.range?.ayahEnd ?? null,
          totalLines: p.totalLines,
          assigned: tq.assigned,
          completed: tq.completed,
          unit: tq.unit,
          mistakeCount: count && count.kind === 'COUNT' ? count.count : null,
          status: a?.status ?? null,
          quality: a?.quality ?? null,
          remarks: a?.remarks ?? null,
          remarksVisibility: a?.remarksVisibility ?? 'INTERNAL',
        };
        // FAMILY files leave through the projection: an INTERNAL remark is absent (F14-AC17).
        const out = staff ? projectFor('STAFF', 'export_daily_record_row', line) : projectFor('PARENT', 'export_daily_record_row', line);
        const notes = staff ? (includeNotes ? (out.remarks as string | null) : null) : ((out.remarks as string | undefined) ?? null);
        return [
          out.externalRecordId,
          out.externalStudentId,
          out.recordDate,
          out.sessionLabel,
          out.section,
          out.position,
          out.paraNumber,
          out.surahStart,
          out.ayahStart,
          out.surahEnd,
          out.ayahEnd,
          out.totalLines,
          out.assigned,
          out.completed,
          out.unit,
          out.mistakeCount,
          out.status,
          out.quality,
          notes,
        ] as (string | number | null)[];
      });
      const filters = filtersText({ from: q.from, to: q.to, classId: q.classId, studentId: q.studentId, audience: q.audience });
      const body = await writeWorkbook({
        templateName: 'DailyRecords',
        templateVersion: TEMPLATE_VERSIONS.DailyRecords,
        createdAt: now,
        about: [
          [l.title.DailyRecords, ''],
          [l.template, 'DailyRecords'],
          [l.version, TEMPLATE_VERSIONS.DailyRecords],
          [l.period, `${q.from} – ${q.to}`],
          [l.generated, now.toISOString()],
          [l.filters, filters],
          [l.rows, String(rows.length)],
          ['', staff ? (includeNotes ? l.privateNotes : l.noPrivateNotes) : l.familyAudience],
        ],
        sheets: [{ name: 'DailyRecords', header: DAILY_RECORD_COLUMNS, rows }],
        meta: [
          ['GeneratedAt', now.toISOString()],
          ['PeriodFrom', q.from],
          ['PeriodTo', q.to],
          ['Filters', filters],
          ['Audience', q.audience],
          ['IncludesPrivateNotes', String(includeNotes)],
          ['PendingOfflineChanges', 'false'],
        ],
      });
      await recordAudit(tx, {
        organizationId: org,
        actorUserId: actor.userId,
        action: 'EXPORT_CREATED',
        targetType: 'EXPORT',
        targetId: null,
        summary: { kind: 'DAILY_RECORDS', rows: rows.length, from: q.from, to: q.to, classId: q.classId ?? null, studentId: q.studentId ?? null, audience: q.audience, includesPrivate: includeNotes, locale },
        at: now,
      });
      return { body, fileName: `daily-records-${q.from}-${q.to}.xlsx` };
    });
  }

  /** A class's weekly or monthly report data, with its period, timezone, filters, generation time, and pending flag. */
  async report(actor: Actor, query: unknown, acceptLanguage: string | undefined): Promise<ExportFile> {
    const q = parse(ReportExportQuery, query);
    const locale = localeOf(q.locale, acceptLanguage);
    const l = ABOUT[locale];
    // Same scope and role as the class summary screen (FR-RPT-011); staff only.
    const summary = await this.reports.classSummary(actor, { classId: q.classId, kind: q.kind, ...(q.date ? { date: q.date } : {}) });
    if (summary.rows.length > EXPORT_ROW_LIMIT) throw new AppError('EXPORT_TOO_LARGE', { max: String(EXPORT_ROW_LIMIT) });
    const table = exportTable(summary as unknown as ClassSummary, locale);
    const now = this.clock.now();
    const filters = filtersText({ classId: q.classId, className: summary.className, kind: q.kind, date: q.date });
    const body = await writeWorkbook({
      templateName: 'ClassReport',
      templateVersion: '1',
      createdAt: now,
      about: [
        [l.title.Report, summary.className],
        [l.period, `${summary.period.kind} ${summary.period.from} – ${summary.period.to}`],
        [l.timeZone, summary.period.timeZone],
        [l.filters, filters],
        [l.generated, now.toISOString()],
        [l.pending, l.no],
        ['', l.noPrivateNotes],
      ],
      sheets: [{ name: 'Report', header: table.header, rows: table.rows, rightToLeft: locale === 'ur' }],
      meta: [
        ['ReportType', summary.period.kind],
        ['PeriodFrom', summary.period.from],
        ['PeriodTo', summary.period.to],
        ['TimeZone', summary.period.timeZone],
        ['Filters', filters],
        ['GeneratedAt', now.toISOString()],
        ['Locale', locale],
        ['PendingOfflineChanges', 'false'],
      ],
    });
    await withTenant(this.db, actor.organizationId, (tx) =>
      recordAudit(tx, {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        action: 'EXPORT_CREATED',
        targetType: 'EXPORT',
        targetId: null,
        summary: { kind: 'REPORT', rows: summary.rows.length, classId: q.classId, periodKind: q.kind, periodFrom: summary.period.from, periodTo: summary.period.to, locale },
        at: now,
      }),
    );
    return { body, fileName: `report-${summary.period.kind.toLowerCase()}-${summary.period.from}.xlsx` };
  }
}

// Daily records for staff (F05; US-018…023): the list, the record detail with attempt history and derived progress,
// and the madrasa's daily-report mode (US-019). Plan docs/handover/F05-plan.md §4, §5.
//
// Writes are not here: records, portions, and attempts are sync operations (daily-record-sync.ts,
// lesson-portion-sync.ts, portion-attempt-sync.ts). Progress and the section summary are derived from the stored
// attempts by @hifz/domain/hifz (latest attempt drives status; the assigned quantity counts once, F05-AC16); nothing
// here stores a total. Reads are staff only (`daily.write`: Owner, Admin, assigned Teacher); a record outside the
// caller's scope, or in another madrasa, is 404 like a missing id.
import {
  DAILY_RECORD_RANGE_MAX_DAYS,
  DailyRecordListQuery,
  type DailyRecordDetail,
  type DailyRecordListResponse,
  type DailyRecordView,
  type DailyReportModeResponse,
  type LessonPortionView,
  type PortionAttemptView,
  type ReportModeConflict,
  SetDailyReportModeRequest,
} from '@hifz/contracts';
import {
  attemptHistory,
  checkModeSwitch,
  mistakeCount,
  portionProgress,
  portionsAllowed,
  sectionSummary,
  type AttemptLike,
  type SummaryPortion,
} from '@hifz/domain/hifz';
import { SECTIONS } from '@hifz/domain/quantity';
import { addDays, isCalendarDate } from '@hifz/domain/roster';
import { sql } from 'kysely';
import type { Clock } from '../../platform/clock.ts';
import type { Db, Tx } from '../../platform/db.ts';
import { AppError, fieldError, parse } from '../../platform/errors.ts';
import { withTenant } from '../../platform/tenant.ts';
import { recordAudit } from '../audit/audit.ts';
import type { Actor } from '../identity/auth-service.ts';
import { assignedClassIds, requireRole } from '../roster/shared.ts';
import { lockOrganization } from '../sync/change-log.ts';
import { currentMistakes } from './portion-attempt-sync.ts';
import { UUID, attendanceOn, inDailyScope, quantityOf, rangeOf, reportModeOf } from './shared.ts';

interface ListCursor {
  /** report_date of the last item. */
  d: string;
  /** id of the last item. */
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

const SECTION_ORDER = sql<number>`CASE p.section WHEN 'SABAQ' THEN 1 WHEN 'SABQI' THEN 2 ELSE 3 END`;

export class DailyRecordService {
  private readonly db: Db;
  private readonly clock: Clock;

  constructor(db: Db, clock: Clock) {
    this.db = db;
    this.clock = clock;
  }

  /** The class ids a Teacher reaches, or null for the whole madrasa (Owner, Admin, "all classes"). */
  private async reach(tx: Tx, actor: Actor): Promise<string[] | null> {
    if (actor.role !== 'TEACHER' || actor.allClasses) return null;
    return assignedClassIds(tx, actor.organizationId, actor.userId);
  }

  // ---------- GET /hifz/daily-records ----------

  async list(actor: Actor, query: unknown): Promise<DailyRecordListResponse> {
    requireRole(actor, 'daily.write');
    const q = parse(DailyRecordListQuery, query);
    const from = q.date ?? q.from!;
    const to = q.date ?? q.to!;
    if (!isCalendarDate(from)) throw fieldError(q.date ? 'date' : 'from', 'INVALID');
    if (!isCalendarDate(to)) throw fieldError('to', 'INVALID');
    if (addDays(from, DAILY_RECORD_RANGE_MAX_DAYS - 1) < to) throw new AppError('VALIDATION', { to: 'TOO_LONG', 'to.max': String(DAILY_RECORD_RANGE_MAX_DAYS) });
    const cursor = q.cursor ? decodeCursor(q.cursor) : null;
    const org = actor.organizationId;
    return withTenant(this.db, org, async (tx) => {
      const reach = await this.reach(tx, actor);
      if (q.classId && reach && !reach.includes(q.classId)) throw new AppError('NOT_FOUND');
      if (reach && reach.length === 0) return { items: [], nextCursor: null };
      let base = tx
        .selectFrom('daily_records as r')
        .innerJoin('students as s', (j) => j.onRef('s.id', '=', 'r.student_id').onRef('s.organization_id', '=', 'r.organization_id'))
        .innerJoin('users as u', 'u.id', 'r.recorded_by')
        .select([
          'r.id',
          'r.student_id',
          's.name as student_name',
          'r.class_id',
          'r.report_date',
          'r.session_label',
          'r.recorded_by',
          'u.display_name',
          'r.client_saved_at',
          'r.server_received_at',
          'r.row_version',
          (eb) =>
            eb
              .selectFrom('lesson_portions as p')
              .select((e) => e.fn.countAll<string>().as('n'))
              .whereRef('p.daily_record_id', '=', 'r.id')
              .whereRef('p.organization_id', '=', 'r.organization_id')
              .where('p.removed_at', 'is', null)
              .as('portion_count'),
        ])
        .where('r.organization_id', '=', org)
        .where('r.report_date', '>=', from)
        .where('r.report_date', '<=', to);
      if (q.studentId) base = base.where('r.student_id', '=', q.studentId);
      if (q.classId) base = base.where('r.class_id', '=', q.classId);
      if (reach) base = base.where('r.class_id', 'in', reach);
      if (cursor) base = base.where((eb) => eb.or([eb('r.report_date', '<', cursor.d), eb.and([eb('r.report_date', '=', cursor.d), eb('r.id', '>', cursor.i)])]));
      const rows = await base.orderBy('r.report_date', 'desc').orderBy('r.id').limit(q.limit + 1).execute();
      const page = rows.slice(0, q.limit);
      const last = page.at(-1);
      return {
        items: page.map(
          (r): DailyRecordView => ({
            id: r.id,
            studentId: r.student_id,
            studentName: r.student_name,
            classId: r.class_id,
            reportDate: r.report_date,
            sessionLabel: r.session_label,
            recordedBy: { userId: r.recorded_by, displayName: r.display_name },
            portionCount: Number(r.portion_count ?? 0),
            clientSavedAt: r.client_saved_at ? r.client_saved_at.toISOString() : null,
            serverReceivedAt: r.server_received_at.toISOString(),
            rowVersion: Number(r.row_version),
          }),
        ),
        nextCursor: rows.length > q.limit && last ? encodeCursor({ d: last.report_date, i: last.id }) : null,
      };
    });
  }

  // ---------- GET /hifz/daily-records/:id ----------

  async detail(actor: Actor, id: string): Promise<DailyRecordDetail> {
    requireRole(actor, 'daily.write');
    if (!UUID.test(id)) throw new AppError('NOT_FOUND');
    const org = actor.organizationId;
    return withTenant(this.db, org, async (tx) => {
      const r = await tx
        .selectFrom('daily_records as r')
        .innerJoin('students as s', (j) => j.onRef('s.id', '=', 'r.student_id').onRef('s.organization_id', '=', 'r.organization_id'))
        .innerJoin('users as u', 'u.id', 'r.recorded_by')
        .select(['r.id', 'r.student_id', 's.name as student_name', 'r.class_id', 'r.report_date', 'r.session_label', 'r.recorded_by', 'u.display_name', 'r.client_saved_at', 'r.server_received_at', 'r.row_version'])
        .where('r.organization_id', '=', org)
        .where('r.id', '=', id)
        .executeTakeFirst();
      if (!r || !(await inDailyScope(tx, actor, r.class_id))) throw new AppError('NOT_FOUND');

      const portions = await tx
        .selectFrom('lesson_portions as p')
        .selectAll('p')
        .where('p.organization_id', '=', org)
        .where('p.daily_record_id', '=', r.id)
        .orderBy(SECTION_ORDER)
        .orderBy('p.position')
        .orderBy('p.created_at')
        .orderBy('p.id')
        .execute();
      const attempts = portions.length
        ? await tx
            .selectFrom('portion_attempts as a')
            .innerJoin('users as u', 'u.id', 'a.recorded_by')
            .select([
              'a.id',
              'a.lesson_portion_id',
              'a.attempt_no',
              'a.attempted_at',
              'a.recorded_by',
              'u.display_name',
              'a.status',
              'a.completed_unit',
              'a.completed_num',
              'a.completed_den',
              'a.quality',
              'a.no_mistakes',
              'a.remarks',
              'a.row_version',
            ])
            .where('a.organization_id', '=', org)
            .where(
              'a.lesson_portion_id',
              'in',
              portions.map((p) => p.id),
            )
            .execute()
        : [];
      const mistakes = await currentMistakes(tx, org, attempts.map((a) => a.id));

      const attemptsOf = new Map<string, PortionAttemptView[]>();
      for (const a of attempts) {
        const list = mistakes.get(a.id) ?? [];
        const view: PortionAttemptView = {
          id: a.id,
          attemptNo: a.attempt_no,
          attemptedAt: a.attempted_at.toISOString(),
          recordedBy: { userId: a.recorded_by, displayName: a.display_name },
          status: a.status,
          completed: quantityOf(a.completed_unit, a.completed_num, a.completed_den),
          quality: a.quality,
          noMistakes: a.no_mistakes,
          mistakeCount: mistakeCount({ noMistakes: a.no_mistakes, mistakes: list }),
          mistakes: list.map((m, i) => ({ ...m, position: i + 1 })),
          // Internal staff text: this route is staff-only (daily.write); Students and Parents never reach it.
          remarks: a.remarks,
          rowVersion: Number(a.row_version),
        };
        attemptsOf.set(a.lesson_portion_id, [...(attemptsOf.get(a.lesson_portion_id) ?? []), view]);
      }

      const like = (list: readonly PortionAttemptView[]): AttemptLike[] => list.map((a) => ({ attemptNo: a.attemptNo, status: a.status, completed: a.completed, quality: a.quality }));
      const portionViews: LessonPortionView[] = portions.map((p) => {
        const history = attemptHistory(attemptsOf.get(p.id) ?? []);
        const assigned = { unit: p.assigned_unit, numerator: p.assigned_num, denominator: p.assigned_den };
        return {
          id: p.id,
          section: p.section,
          position: p.position,
          isExtra: p.is_extra,
          paraNumber: p.para_number,
          range: rangeOf(p),
          assigned,
          totalLines: p.total_lines,
          totalLinesSource: p.total_lines_source,
          lineCountEdition: p.line_count_edition,
          removed: p.removed_at !== null,
          removedAt: p.removed_at ? p.removed_at.toISOString() : null,
          attempts: history,
          progress: portionProgress({ assigned }, like(history)),
          rowVersion: Number(p.row_version),
        };
      });
      const summary = sectionSummary(
        portionViews.map((p) => ({
          portion: { id: p.id, section: p.section, position: p.position, isExtra: p.isExtra, paraNumber: p.paraNumber, assigned: p.assigned, removed: p.removed } satisfies SummaryPortion,
          attempts: like(p.attempts),
        })),
      );
      const status = await attendanceOn(tx, org, r.student_id, r.report_date);
      return {
        record: {
          id: r.id,
          studentId: r.student_id,
          studentName: r.student_name,
          classId: r.class_id,
          reportDate: r.report_date,
          sessionLabel: r.session_label,
          recordedBy: { userId: r.recorded_by, displayName: r.display_name },
          portionCount: portionViews.filter((p) => !p.removed).length,
          clientSavedAt: r.client_saved_at ? r.client_saved_at.toISOString() : null,
          serverReceivedAt: r.server_received_at.toISOString(),
          rowVersion: Number(r.row_version),
        },
        attendance: { status, portionsAllowed: portionsAllowed(status) },
        portions: portionViews,
        sectionSummary: SECTIONS.map((section) => {
          const s = summary.find((x) => x.section === section)!;
          return { section, portionIds: s.portions.map((p) => p.id), totals: s.totals, extraTotals: s.extraTotals };
        }),
      };
    });
  }

  // ---------- PUT /organization/daily-report-mode (US-019) ----------

  /**
   * Owner/Admin only (SRS §17.1); a Teacher gets 403 (F05-AC9). Switching to SINGLE is refused with 409
   * MODE_CONFLICTS while any student has more than one record on a date, listing them (F05-AC8). Runs under the
   * organization's sync lock, so no record is created between the check and the switch. Audited
   * DAILY_REPORT_MODE_CHANGED in the same transaction.
   */
  async setMode(actor: Actor, body: unknown): Promise<DailyReportModeResponse> {
    requireRole(actor, 'organization.settings.update');
    const input = parse(SetDailyReportModeRequest, body);
    const org = actor.organizationId;
    const now = this.clock.now();
    return withTenant(this.db, org, async (tx) => {
      await lockOrganization(tx, org);
      const current = await reportModeOf(tx, org);
      if (current === input.mode) return { mode: current };
      if (input.mode === 'SINGLE') {
        // Only the student/date pairs with more than one record can conflict.
        const rows = await tx
          .selectFrom('daily_records as r')
          .innerJoin('students as s', (j) => j.onRef('s.id', '=', 'r.student_id').onRef('s.organization_id', '=', 'r.organization_id'))
          .select(['r.id', 'r.student_id', 's.name', 'r.report_date', 'r.session_label'])
          .where('r.organization_id', '=', org)
          .where(sql<boolean>`(r.student_id, r.report_date) IN (SELECT d.student_id, d.report_date FROM daily_records d WHERE d.organization_id = ${org} GROUP BY d.student_id, d.report_date HAVING count(*) > 1)`)
          .execute();
        const check = checkModeSwitch('SINGLE', rows.map((x) => ({ id: x.id, studentId: x.student_id, reportDate: x.report_date, sessionLabel: x.session_label })));
        if (!check.ok) {
          const names = new Map(rows.map((x) => [x.student_id, x.name]));
          const conflicts: ReportModeConflict[] = check.conflicts.map((c) => ({
            studentId: c.studentId,
            studentName: names.get(c.studentId) ?? '',
            reportDate: c.reportDate,
            sessionLabels: c.sessionLabels,
          }));
          throw new AppError('MODE_CONFLICTS', undefined, conflicts);
        }
      }
      await sql`SELECT app_set_daily_report_mode(${input.mode})`.execute(tx);
      await recordAudit(tx, {
        organizationId: org,
        actorUserId: actor.userId,
        action: 'DAILY_REPORT_MODE_CHANGED',
        targetType: 'ORGANIZATION',
        targetId: org,
        summary: { from: current, to: input.mode },
        at: now,
      });
      return { mode: input.mode };
    });
  }
}

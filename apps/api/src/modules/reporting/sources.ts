// Report sources (F09; ARCHITECTURE.md §9.3; NFR-PERF-002). Loads everything buildReport() needs for a set of students
// and one period in a fixed number of queries, however many students there are: every query takes the whole student
// (or record, portion, attempt) list at once. Nothing here decides anything; the rules are @hifz/domain/reports.
//
// Loads go through the owning modules' shared loaders (calendar, hifz, homework service) rather than re-reading their
// tables in new ways, except the batched record/portion/attempt reads, which follow the hifz record detail.
import type { HomeworkAssignmentView } from '@hifz/contracts';
import type { CalendarException, ScheduleVersion } from '@hifz/domain/calendar';
import type { ReportAttendanceRow, ReportHomework, ReportInput, ReportPeriod, ReportRecord } from '@hifz/domain/reports';
import type { Enrollment } from '@hifz/domain/roster';
import type { Tx } from '../../platform/db.ts';
import { activeExceptions, enrollmentsOf, scheduleVersions } from '../calendar/shared.ts';
import { currentMistakes } from '../hifz/portion-attempt-sync.ts';
import { quantityOf, rangeOf } from '../hifz/shared.ts';
import type { HomeworkService } from '../homework/homework-service.ts';

export interface StudentRef {
  id: string;
  name: string;
}

/** The report inputs of each student, keyed by student id. `scope` is the viewer's classes (null = whole madrasa). */
export async function loadReportInputs(
  tx: Tx,
  deps: { homework: HomeworkService },
  org: string,
  students: readonly StudentRef[],
  period: ReportPeriod,
  today: string,
  scope: readonly string[] | null,
): Promise<Map<string, ReportInput>> {
  const out = new Map<string, ReportInput>();
  if (students.length === 0) return out;
  const ids = students.map((s) => s.id);

  const enrollments = await enrollmentsOf(tx, org, ids);
  const classIds = [...new Set([...enrollments.values()].flat().map((e) => e.classId))];
  const [versions, exceptions, attendance, records, homework] = await Promise.all([
    scheduleVersions(tx, org, classIds),
    activeExceptions(tx, org, period, classIds),
    loadAttendance(tx, org, ids, period),
    loadRecords(tx, org, ids, period),
    deps.homework.forReport(tx, org, ids, period),
  ]);

  for (const s of students) {
    out.set(s.id, {
      period,
      today,
      student: { id: s.id, name: s.name },
      enrollments: enrollments.get(s.id) ?? ([] as Enrollment[]),
      scope,
      schedules: versions as ScheduleVersion[],
      exceptions: exceptions as CalendarException[],
      attendance: attendance.get(s.id) ?? [],
      records: records.get(s.id) ?? [],
      homework: homework.filter((h) => h.studentId === s.id).map(homeworkOf),
    });
  }
  return out;
}

async function loadAttendance(tx: Tx, org: string, studentIds: readonly string[], period: { from: string; to: string }): Promise<Map<string, ReportAttendanceRow[]>> {
  const rows = await tx
    .selectFrom('attendance_records')
    .select(['student_id', 'class_id', 'report_date', 'status', 'leave_status'])
    .where('organization_id', '=', org)
    .where('student_id', 'in', [...studentIds])
    .where('report_date', '>=', period.from)
    .where('report_date', '<=', period.to)
    .execute();
  const out = new Map<string, ReportAttendanceRow[]>();
  for (const r of rows) out.set(r.student_id, [...(out.get(r.student_id) ?? []), { date: r.report_date, classId: r.class_id, status: r.status, leaveStatus: r.leave_status }]);
  return out;
}

/** Daily records of the period with their portions (removed ones flagged), attempts, and current mistakes. */
async function loadRecords(tx: Tx, org: string, studentIds: readonly string[], period: { from: string; to: string }): Promise<Map<string, ReportRecord[]>> {
  const records = await tx
    .selectFrom('daily_records')
    .select(['id', 'student_id', 'class_id', 'report_date', 'session_label', 'overall_label'])
    .where('organization_id', '=', org)
    .where('student_id', 'in', [...studentIds])
    .where('report_date', '>=', period.from)
    .where('report_date', '<=', period.to)
    .execute();
  const out = new Map<string, ReportRecord[]>();
  if (records.length === 0) return out;
  const portions = await tx
    .selectFrom('lesson_portions')
    .select(['id', 'daily_record_id', 'section', 'position', 'is_extra', 'para_number', 'surah_start', 'ayah_start', 'surah_end', 'ayah_end', 'assigned_unit', 'assigned_num', 'assigned_den', 'total_lines', 'removed_at'])
    .where('organization_id', '=', org)
    .where(
      'daily_record_id',
      'in',
      records.map((r) => r.id),
    )
    .execute();
  const attempts = portions.length
    ? await tx
        .selectFrom('portion_attempts')
        .select(['id', 'lesson_portion_id', 'attempt_no', 'attempted_at', 'status', 'completed_unit', 'completed_num', 'completed_den', 'quality', 'no_mistakes', 'remarks', 'remarks_visibility'])
        .where('organization_id', '=', org)
        .where(
          'lesson_portion_id',
          'in',
          portions.map((p) => p.id),
        )
        .execute()
    : [];
  const mistakes = await currentMistakes(tx, org, attempts.map((a) => a.id));

  const attemptsOf = new Map<string, ReportRecord['portions'][number]['attempts'][number][]>();
  for (const a of attempts) {
    attemptsOf.set(a.lesson_portion_id, [
      ...(attemptsOf.get(a.lesson_portion_id) ?? []),
      {
        id: a.id,
        attemptNo: a.attempt_no,
        attemptedAt: a.attempted_at.toISOString(),
        status: a.status,
        completed: quantityOf(a.completed_unit, a.completed_num, a.completed_den),
        quality: a.quality,
        noMistakes: a.no_mistakes,
        mistakes: (mistakes.get(a.id) ?? []).map((m) => ({ category: m.category, severity: m.severity, repeated: m.repeated, note: m.note ?? null, noteVisibility: m.noteVisibility ?? 'INTERNAL' })),
        remarks: a.remarks,
        remarksVisibility: a.remarks_visibility,
      },
    ]);
  }
  const portionsOf = new Map<string, ReportRecord['portions'][number][]>();
  for (const p of portions) {
    portionsOf.set(p.daily_record_id, [
      ...(portionsOf.get(p.daily_record_id) ?? []),
      {
        id: p.id,
        section: p.section,
        position: p.position,
        isExtra: p.is_extra,
        paraNumber: p.para_number,
        range: rangeOf(p),
        assigned: { unit: p.assigned_unit, numerator: p.assigned_num, denominator: p.assigned_den },
        totalLines: p.total_lines,
        removed: p.removed_at !== null,
        attempts: attemptsOf.get(p.id) ?? [],
      },
    ]);
  }
  for (const r of records) {
    out.set(r.student_id, [
      ...(out.get(r.student_id) ?? []),
      { id: r.id, date: r.report_date, classId: r.class_id, sessionLabel: r.session_label, overallLabel: r.overall_label, portions: portionsOf.get(r.id) ?? [] },
    ]);
  }
  return out;
}

/** A homework view as the report needs it. */
export function homeworkOf(v: HomeworkAssignmentView): ReportHomework {
  return {
    id: v.id,
    classId: v.classId,
    status: v.status,
    state: v.state,
    assignedDate: v.assignedDate,
    dueDate: v.dueDate,
    carriedOverReason: v.carriedOver?.reason ?? null,
    portions: v.portions.map((p) => ({
      id: p.id,
      section: p.section,
      paraNumber: p.paraNumber,
      assigned: p.assigned,
      carriedForward: p.origin !== 'TEACHER_ADDED',
      sourceLessonPortionId: p.sourceLessonPortionId,
      removed: p.removed,
      progress: { attempted: p.progress.attempted, status: p.progress.status },
    })),
  };
}

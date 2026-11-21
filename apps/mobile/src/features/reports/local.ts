// F09 · Reports on the device (NFR-OFF-008; F09-AC16; design.md §4.10 "Offline/provisional"). Without a connection the
// Reports screen builds the report from this device's copy with the same @hifz/domain/reports buildReport() the server
// uses, and marks it Provisional with the last successful sync time and the pending-change count. The server's report
// is the authoritative one; nothing built here is stored or sent.
//
// What the device does not know is not guessed:
// - Enrollment history is not on the device: the student counts as in the chosen class for the whole period.
// - Without a cached timetable (the Homework and Reports screens cache it online) the days cannot be classified, so the
//   screen says so and shows no attendance counts; recorded work is still listed.
import type { AttendanceStatus, LeaveStatus } from '@hifz/domain/calendar';
import { classSummary, type ClassSummary, type ReportHomework, type ReportInput, type ReportPeriod, type ReportRecord, type ReportSyncState, type StudentReport, buildReport } from '@hifz/domain/reports';
import type { SqlExecutor } from '../../local-db/driver.ts';
import { readRecord } from '../daily-entry/local.ts';
import { assignmentsForStudent, deviceState, readCalendar } from '../homework/local.ts';

export interface DeviceReportArgs {
  student: { id: string; name: string };
  classId: string;
  period: ReportPeriod;
  today: string;
  sync: ReportSyncState;
}

/** Whether the device has the class timetable it needs to tell class days from other days. */
export async function hasCalendar(db: SqlExecutor, classId: string): Promise<boolean> {
  const cal = await readCalendar(db, classId);
  return cal !== null && cal.versions.length > 0;
}

/** The report inputs from the device's tables, scoped to the chosen class. */
export async function deviceReportInput(db: SqlExecutor, args: DeviceReportArgs): Promise<ReportInput> {
  const { student, classId, period, today } = args;
  const cal = await readCalendar(db, classId);
  const marks = await db.all<{ class_id: string; report_date: string; status: string; leave_status: string }>(
    'SELECT class_id, report_date, status, leave_status FROM attendance_records WHERE student_id = ? AND report_date >= ? AND report_date <= ?',
    [student.id, period.from, period.to],
  );
  const recordIds = await db.all<{ id: string }>('SELECT id FROM daily_records WHERE student_id = ? AND report_date >= ? AND report_date <= ?', [student.id, period.from, period.to]);
  const records: ReportRecord[] = [];
  for (const { id } of recordIds) {
    const r = await readRecord(db, id);
    if (!r) continue;
    records.push({
      id: r.id,
      date: r.reportDate,
      classId: r.classId,
      sessionLabel: r.sessionLabel,
      overallLabel: r.overallLabel ?? null,
      portions: r.portions.flatMap((p) =>
        p.assigned
          ? [
              {
                id: p.id,
                section: p.section,
                position: p.position,
                isExtra: p.isExtra,
                paraNumber: p.paraNumber,
                range: p.range,
                assigned: p.assigned,
                totalLines: p.totalLines,
                removed: p.removed,
                attempts: p.attempts.map((a) => ({
                  id: a.id,
                  attemptNo: a.attemptNo,
                  attemptedAt: a.attemptedAt,
                  status: a.status,
                  completed: a.completed,
                  quality: a.quality,
                  noMistakes: a.noMistakes,
                  mistakes: a.mistakes.map((m) => ({ category: m.category, severity: m.severity, repeated: m.repeated, note: m.note ?? null, noteVisibility: m.noteVisibility ?? 'INTERNAL' })),
                  remarks: a.remarks,
                })),
              },
            ]
          : [],
      ),
    });
  }
  const homework: ReportHomework[] = [];
  for (const a of await assignmentsForStudent(db, student.id)) {
    if (a.assignedDate > period.to || (a.status !== 'CONFIRMED' && a.status !== 'DRAFT')) continue;
    const state = await deviceState(db, a, today);
    homework.push({
      id: a.id,
      classId: a.classId ?? classId,
      status: a.status,
      state: state.state,
      assignedDate: a.assignedDate,
      dueDate: a.dueDate ?? a.assignedDate,
      carriedOverReason: state.state === 'CARRIED_OVER' ? (state.carry?.reason ?? null) : null,
      portions: a.portions.map((p) => ({
        id: p.id,
        section: p.section,
        paraNumber: p.paraNumber,
        assigned: p.assigned,
        carriedForward: p.origin !== 'TEACHER_ADDED',
        sourceLessonPortionId: p.sourceLessonPortionId,
        removed: p.removed,
        progress: state.progress.get(p.id) ?? { attempted: false, status: null },
      })),
    });
  }
  const versions = cal?.versions.length
    ? cal.versions
    : // No timetable on the device: every day counts as a possible class day so recorded work is listed. The screen
      // hides the attendance counts in this case (they would rest on a guess).
      [{ classId, effectiveFrom: period.from, weekdays: [1, 2, 3, 4, 5, 6, 7] as const }];
  return {
    period,
    today,
    student,
    enrollments: [{ id: 'device', classId, startDate: period.from, endDate: period.to }],
    scope: [classId],
    schedules: versions.map((v) => ({ classId: v.classId, effectiveFrom: v.effectiveFrom, weekdays: [...v.weekdays] })),
    exceptions: cal?.exceptions ?? [],
    attendance: marks.map((m) => ({ date: m.report_date, classId: m.class_id, status: m.status as AttendanceStatus, leaveStatus: m.leave_status as LeaveStatus })),
    records,
    homework,
    sync: args.sync,
  };
}

/** A provisional report built on the device. */
export async function deviceReport(db: SqlExecutor, args: DeviceReportArgs): Promise<StudentReport> {
  return buildReport(await deviceReportInput(db, args));
}

/** A provisional class summary built on the device from the cached roster. */
export async function deviceClassSummary(
  db: SqlExecutor,
  args: Omit<DeviceReportArgs, 'student'> & { students: ReadonlyArray<{ id: string; name: string }> },
): Promise<ClassSummary> {
  const reports: StudentReport[] = [];
  for (const s of args.students) reports.push(await deviceReport(db, { ...args, student: s }));
  return classSummary(args.classId, args.period, args.today, reports);
}

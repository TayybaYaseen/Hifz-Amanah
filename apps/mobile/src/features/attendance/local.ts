// F04 · attendance on the device (US-015, US-016; F04-AC10, AC12; AGENTS.md §7). Bulk Entry writes each student's
// mark to the local `attendance_records` table and queues its sync operation in the same SQLite transaction, so the
// app can say "Saved on this device" before the server acknowledges. One operation per student row: one invalid row
// never blocks the others (F04-AC9). Replays are harmless because every op has its own op_id (F04-AC10).
//
// `class_roster_cache` keeps the last student list fetched for each class so Bulk Entry can open offline (the roster
// itself is online-only, F03). The day type (holiday, no class) cannot be checked offline; the server re-checks every
// mark when it syncs and refuses a mark on a non-working day, which then shows in the Sync Queue.
import type { AttendanceSheetStudent, AttendanceStatus, AttendanceSyncFields, LeaveStatus } from '@hifz/contracts';
import { ATTENDANCE_FIELDS, leaveStatusAfter, normalizeMark, type Mark, type MarkingRole } from '@hifz/domain/calendar';
import type { SqlExecutor } from '../../local-db/driver.ts';
import type { Migration } from '../../local-db/migrations.ts';
import type { Outbox } from '../../sync/outbox.ts';
import type { EntityRegistry, LocalEntityHandler } from '../../sync/registry.ts';
import { DAILY_RECORD_RETENTION_DAYS } from '../../sync/retention.ts';

/** Local schema for F04 (workspace migration 4). Additive only: the outbox is untouched (F12-AC16). */
export const attendanceMigration = (version: number): Migration => ({
  version,
  name: 'F04 attendance records and class roster cache',
  up: async (tx) => {
    await tx.exec(`
      CREATE TABLE attendance_records (
        id            TEXT PRIMARY KEY,
        row_version   INTEGER,
        student_id    TEXT NOT NULL,
        class_id      TEXT NOT NULL,
        report_date   TEXT NOT NULL,
        status        TEXT NOT NULL,
        leave_status  TEXT NOT NULL DEFAULT 'NONE',
        leave_reason  TEXT,
        absent_note   TEXT
      );
      CREATE INDEX attendance_records_day ON attendance_records (class_id, report_date);
      CREATE TABLE class_roster_cache (
        class_id    TEXT PRIMARY KEY,
        class_name  TEXT NOT NULL,
        students    TEXT NOT NULL,
        fetched_at  TEXT NOT NULL
      );
    `);
  },
});

/** A student's attendance for one date as the device knows it. */
export interface LocalMark extends Mark {
  id: string;
  /** Server version; null until the server has acknowledged the record. */
  rowVersion: number | null;
  leaveStatus: LeaveStatus;
}

interface Row {
  id: string;
  row_version: number | null;
  student_id: string;
  status: AttendanceStatus;
  leave_status: LeaveStatus;
  leave_reason: string | null;
  absent_note: string | null;
}

const toMark = (r: Row): LocalMark => ({
  id: r.id,
  rowVersion: r.row_version === null ? null : Number(r.row_version),
  status: r.status,
  leaveStatus: r.leave_status,
  leaveReason: r.leave_reason,
  absentNote: r.absent_note,
});

export const attendanceHandler: LocalEntityHandler = {
  entity: 'attendance_record',
  table: 'attendance_records',
  fieldSpec: ATTENDANCE_FIELDS,
  upsertFromServer: async (tx, id, rowVersion, f) => {
    const fields = f as Partial<AttendanceSyncFields>;
    await tx.run(
      `INSERT INTO attendance_records (id, row_version, student_id, class_id, report_date, status, leave_status, leave_reason, absent_note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET row_version = excluded.row_version, student_id = excluded.student_id,
         class_id = excluded.class_id, report_date = excluded.report_date, status = excluded.status,
         leave_status = excluded.leave_status, leave_reason = excluded.leave_reason, absent_note = excluded.absent_note`,
      [
        id,
        rowVersion,
        fields.studentId ?? null,
        fields.classId ?? null,
        fields.reportDate ?? null,
        fields.status ?? null,
        fields.leaveStatus ?? 'NONE',
        fields.leaveReason ?? null,
        fields.absentNote ?? null,
      ],
    );
  },
  // The Sync Queue shows the date; the student's name travels as the op label. Never a reason or note (AGENTS §6).
  label: (f) => (typeof f.reportDate === 'string' ? f.reportDate : null),
  fieldGroups: [{ id: 'attendance', labelKey: 'attendance.title', fields: ['status', 'leaveReason', 'absentNote'] }],
  fieldLabelKey: (field) => ({ status: 'attendance.statusField', leaveReason: 'attendance.leaveReason', absentNote: 'attendance.absentNote' })[field] ?? null,
  retention: { dateColumn: 'report_date', days: DAILY_RECORD_RETENTION_DAYS },
  onDiscard: async (tx, op) => {
    if (op.opType === 'CREATE') await tx.run('DELETE FROM attendance_records WHERE id = ?', [op.entityId]);
  },
};

/** Registers the F04 entity once. */
export function registerAttendance(registry: EntityRegistry): void {
  if (!registry.get('attendance_record')) registry.register(attendanceHandler);
}

/**
 * The marks on the device for a class and date, by student. When the device holds two records for one student (a
 * local create that collided with the server's), the unsynced one wins: it is the Teacher's latest choice.
 */
export async function readMarks(db: SqlExecutor, classId: string, date: string): Promise<Map<string, LocalMark>> {
  const rows = await db.all<Row>(
    `SELECT id, row_version, student_id, status, leave_status, leave_reason, absent_note FROM attendance_records
     WHERE class_id = ? AND report_date = ? ORDER BY (row_version IS NULL), id`,
    [classId, date],
  );
  const marks = new Map<string, LocalMark>();
  for (const row of rows) marks.set(row.student_id, toMark(row));
  return marks;
}

export interface CachedRoster {
  className: string;
  students: Array<Pick<AttendanceSheetStudent, 'id' | 'name' | 'externalStudentId'>>;
  fetchedAt: string;
}

export async function cacheRoster(db: SqlExecutor, classId: string, className: string, students: CachedRoster['students'], at: string): Promise<void> {
  await db.run(
    `INSERT INTO class_roster_cache (class_id, class_name, students, fetched_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (class_id) DO UPDATE SET class_name = excluded.class_name, students = excluded.students, fetched_at = excluded.fetched_at`,
    [classId, className, JSON.stringify(students.map(({ id, name, externalStudentId }) => ({ id, name, externalStudentId }))), at],
  );
}

/** Classes whose roster this device has cached, by name: Bulk Entry's class list when offline. */
export async function cachedClasses(db: SqlExecutor): Promise<Array<{ id: string; name: string }>> {
  const rows = await db.all<{ class_id: string; class_name: string }>('SELECT class_id, class_name FROM class_roster_cache ORDER BY class_name');
  return rows.map((r) => ({ id: r.class_id, name: r.class_name }));
}

export async function cachedRoster(db: SqlExecutor, classId: string): Promise<CachedRoster | null> {
  const row = await db.get<{ class_name: string; students: string; fetched_at: string }>(
    'SELECT class_name, students, fetched_at FROM class_roster_cache WHERE class_id = ?',
    [classId],
  );
  return row ? { className: row.class_name, students: JSON.parse(row.students) as CachedRoster['students'], fetchedAt: row.fetched_at } : null;
}

export interface MarkToSave {
  studentId: string;
  /** Shown in the Sync Queue (a name, never a note). */
  label: string;
  existing: LocalMark | null;
  mark: Mark;
}

/**
 * Saves one student's mark on the device and queues its sync operation, in one transaction (F12-AC1).
 * A new record is a CREATE with a client UUIDv7; an existing one is an UPDATE of the coupled group (status, Leave
 * reason, absence note), whose base version the outbox derives (review N3). The local Leave status follows the same
 * rule as the server (Teacher → awaiting approval, Owner/Admin → approved); the server's value replaces it on sync.
 */
export async function saveMark(outbox: Outbox, input: MarkToSave, ctx: { classId: string; date: string; role: MarkingRole }): Promise<string> {
  const mark = normalizeMark(input.mark);
  const leaveStatus = leaveStatusAfter(mark, ctx.role, input.existing);
  if (input.existing) {
    const id = input.existing.id;
    await outbox.saveWithUpdate(
      async (tx) => {
        await tx.run('UPDATE attendance_records SET status = ?, leave_status = ?, leave_reason = ?, absent_note = ? WHERE id = ?', [
          mark.status,
          leaveStatus,
          mark.leaveReason,
          mark.absentNote,
          id,
        ]);
      },
      { entity: 'attendance_record', entityId: id, fields: { status: mark.status, leaveReason: mark.leaveReason, absentNote: mark.absentNote }, label: input.label },
    );
    return id;
  }
  const id = outbox.newEntityId();
  await outbox.saveWithOp(
    async (tx) => {
      await tx.run(
        `INSERT INTO attendance_records (id, row_version, student_id, class_id, report_date, status, leave_status, leave_reason, absent_note)
         VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
        [id, input.studentId, ctx.classId, ctx.date, mark.status, leaveStatus, mark.leaveReason, mark.absentNote],
      );
    },
    {
      entity: 'attendance_record',
      entityId: id,
      opType: 'CREATE',
      baseVersion: null,
      fields: { studentId: input.studentId, classId: ctx.classId, reportDate: ctx.date, ...mark },
      label: input.label,
    },
  );
  return id;
}

/**
 * The same write as {@link saveMark}, inside the caller's transaction: F05 Daily Entry saves an attendance change
 * together with the daily record, its portions, and their attempts in ONE transaction (F05 UI spec §2.3, F12-AC1).
 * Returns the record ID and the queued op ID (portions depend on it, so the server sees the attendance first).
 */
export async function writeMarkInTx(
  tx: SqlExecutor,
  outbox: Outbox,
  input: MarkToSave,
  ctx: { classId: string; date: string; role: MarkingRole },
): Promise<{ id: string; opId: string }> {
  const mark = normalizeMark(input.mark);
  const leaveStatus = leaveStatusAfter(mark, ctx.role, input.existing);
  if (input.existing) {
    const id = input.existing.id;
    await tx.run('UPDATE attendance_records SET status = ?, leave_status = ?, leave_reason = ?, absent_note = ? WHERE id = ?', [
      mark.status,
      leaveStatus,
      mark.leaveReason,
      mark.absentNote,
      id,
    ]);
    const { opId } = await outbox.enqueueUpdate(tx, {
      entity: 'attendance_record',
      entityId: id,
      fields: { status: mark.status, leaveReason: mark.leaveReason, absentNote: mark.absentNote },
      label: input.label,
    });
    return { id, opId };
  }
  const id = outbox.newEntityId();
  await tx.run(
    `INSERT INTO attendance_records (id, row_version, student_id, class_id, report_date, status, leave_status, leave_reason, absent_note)
     VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
    [id, input.studentId, ctx.classId, ctx.date, mark.status, leaveStatus, mark.leaveReason, mark.absentNote],
  );
  const { opId } = await outbox.enqueue(tx, {
    entity: 'attendance_record',
    entityId: id,
    opType: 'CREATE',
    baseVersion: null,
    fields: { studentId: input.studentId, classId: ctx.classId, reportDate: ctx.date, ...mark },
    label: input.label,
  });
  return { id, opId };
}

/** The student's mark on a date, whatever the class (Daily Entry reads it before showing the sections). */
export async function readStudentMark(db: SqlExecutor, studentId: string, date: string): Promise<LocalMark | null> {
  const row = await db.get<Row>(
    `SELECT id, row_version, student_id, status, leave_status, leave_reason, absent_note FROM attendance_records
     WHERE student_id = ? AND report_date = ? ORDER BY (row_version IS NULL) DESC, id LIMIT 1`,
    [studentId, date],
  );
  return row ? toMark(row) : null;
}

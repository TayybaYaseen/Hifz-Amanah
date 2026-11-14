// F04 · Calendar and attendance — integration against real Postgres (docs/specs/08-f04-calendar-attendance.md).
// Seeded fixtures (e2e/fixtures/personas.ts): A1 (teacher.a1; S1, S2), A2 (teacher.a2; S3), B1 (teacher.b1; SB1);
// every class meets Monday–Saturday from 90 days ago. Attendance writes go through POST /sync/push.
import { sql } from 'kysely';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { weekdayOf } from '@hifz/domain/calendar';
import { addDays, calendarDateIn } from '@hifz/domain/roster';
import { withTenant } from '../../src/platform/tenant.ts';
import { startHarness, type Harness } from '../support/harness.ts';

let h: Harness;
let ids: { classes: Record<'A1' | 'A2' | 'B1', string>; students: Record<'S1' | 'S2' | 'S3' | 'SB1', string> };

type AuditRow = { action: string; actor_user_id: string | null; target_type: string; summary: Record<string, unknown>; created_at: string };
type OpResult = { opId: string; status: string; code?: string; fields?: Record<string, string>; rowVersion?: number; entityId?: string; conflictId?: string };

const DEVICE = '0190f5c0-0000-4000-8000-000000000001';
const DEVICE_2 = '0190f5c0-0000-4000-8000-000000000002';

beforeAll(async () => {
  h = await startHarness();
}, 60_000);

afterAll(async () => {
  await h?.stop();
});

beforeEach(async () => {
  await h.reset();
  ids = (await h.control('GET', '/roster/ids')).json();
});

const today = () => calendarDateIn(h.clock.now(), 'Asia/Karachi');

/** The most recent Monday–Saturday on or before `back` days ago (a scheduled day for the seeded classes). */
function classDay(back = 1): string {
  let d = addDays(today(), -back);
  while (weekdayOf(d) === 7) d = addDays(d, -1);
  return d;
}

/** The most recent Sunday before today. */
function lastSunday(): string {
  let d = addDays(today(), -1);
  while (weekdayOf(d) !== 7) d = addDays(d, -1);
  return d;
}

const audit = async (targetId: string) => (await h.control('GET', `/audit-target/${targetId}`)).json().items as AuditRow[];

let seq = 0;
interface Mark {
  student: 'S1' | 'S2' | 'S3' | 'SB1';
  status: string;
  leaveReason?: string | null;
  absentNote?: string | null;
  classKey?: 'A1' | 'A2' | 'B1';
  date: string;
}

function createOp(mark: Mark, entityId = uuidv7()) {
  return {
    opId: uuidv7(),
    seq: ++seq,
    entity: 'attendance_record',
    entityId,
    opType: 'CREATE',
    baseVersion: null,
    fields: {
      studentId: ids.students[mark.student],
      classId: ids.classes[mark.classKey ?? 'A1'],
      reportDate: mark.date,
      status: mark.status,
      leaveReason: mark.leaveReason ?? null,
      absentNote: mark.absentNote ?? null,
    },
    dependsOn: [] as string[],
    clientSavedAt: new Date().toISOString(),
  };
}

function updateOp(entityId: string, baseVersion: number, fields: { status: string; leaveReason?: string | null; absentNote?: string | null }, dependsOn: string[] = []) {
  return {
    opId: uuidv7(),
    seq: ++seq,
    entity: 'attendance_record',
    entityId,
    opType: 'UPDATE',
    baseVersion,
    fields: { status: fields.status, leaveReason: fields.leaveReason ?? null, absentNote: fields.absentNote ?? null },
    dependsOn,
    clientSavedAt: new Date().toISOString(),
  };
}

async function push(token: string, ops: object[], deviceId = DEVICE): Promise<OpResult[]> {
  const res = await h.call('POST', '/sync/push', token, { protocolVersion: 1, deviceId, ops });
  expect(res.statusCode, res.body).toBe(200);
  return res.json().results as OpResult[];
}

async function records(studentKey: keyof typeof ids.students) {
  const { rows } = await sql<{ id: string; status: string; leave_status: string; leave_reason: string | null; report_date: string; row_version: string }>`
    SELECT id, status, leave_status, leave_reason, report_date::text, row_version::text FROM attendance_records WHERE student_id = ${ids.students[studentKey]} ORDER BY report_date`.execute(h.db);
  return rows;
}

async function summary(token: string, classKey: 'A1' | 'A2', from: string, to: string) {
  const res = await h.call('GET', `/attendance/summary?classId=${ids.classes[classKey]}&from=${from}&to=${to}`, token);
  expect(res.statusCode, res.body).toBe(200);
  return res.json() as {
    days: Array<{ date: string; kind: string; label: string | null }>;
    students: Array<{ studentId: string; days: Record<string, string>; counts: Record<string, number> }>;
  };
}

const studentRow = (s: Awaited<ReturnType<typeof summary>>, key: keyof typeof ids.students) => s.students.find((x) => x.studentId === ids.students[key])!;

describe('F04 · timetable (US-013)', () => {
  it('F04-AC1 (US-013) a Monday–Saturday class has Sunday as a no-class day in the week', async () => {
    const admin = await h.signIn('admin.a');
    const sunday = lastSunday();
    const s = await summary(admin, 'A1', addDays(sunday, -6), sunday);
    expect(s.days.map((d) => d.kind)).toEqual(['SCHEDULED', 'SCHEDULED', 'SCHEDULED', 'SCHEDULED', 'SCHEDULED', 'SCHEDULED', 'UNSCHEDULED']);
    expect(weekdayOf(s.days[0]!.date)).toBe(1);
    // No student is absent on the Sunday, and unmarked weekdays are "not marked", not absences.
    expect(studentRow(s, 'S1').days[sunday]).toBe('UNSCHEDULED');
    expect(studentRow(s, 'S1').counts).toMatchObject({ scheduled: 6, notMarked: 6, absent: 0, unscheduled: 1 });

    const schedule = (await h.call('GET', `/classes/${ids.classes.A1}/schedule`, await h.signIn('teacher.a1'))).json();
    expect(schedule.current).toMatchObject({ weekdays: [1, 2, 3, 4, 5, 6], effectiveTo: null });
  });

  it('F04-AC2 (US-013) a schedule change applies from its effective date only, and is audited', async () => {
    const admin = await h.signIn('admin.a');
    const sunday = lastSunday();
    const monday = addDays(sunday, -6);
    const wednesday = addDays(monday, 2);
    const res = await h.call('PUT', `/classes/${ids.classes.A1}/schedule`, admin, { effectiveFrom: wednesday, weekdays: [4, 1, 2, 3], startTime: '08:00', endTime: '12:00' });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().versions.map((v: { effectiveFrom: string; effectiveTo: string | null; weekdays: number[] }) => [v.effectiveTo, v.weekdays])).toEqual([
      [addDays(wednesday, -1), [1, 2, 3, 4, 5, 6]],
      [null, [1, 2, 3, 4]],
    ]);
    const s = await summary(admin, 'A1', monday, sunday);
    expect(s.days.map((d) => d.kind)).toEqual(['SCHEDULED', 'SCHEDULED', 'SCHEDULED', 'SCHEDULED', 'UNSCHEDULED', 'UNSCHEDULED', 'UNSCHEDULED']);
    // The previous week keeps the old schedule.
    const before = await summary(admin, 'A1', addDays(monday, -7), addDays(monday, -1));
    expect(before.days.filter((d) => d.kind === 'SCHEDULED')).toHaveLength(6);
    expect((await audit(ids.classes.A1)).map((a) => a.action)).toContain('SCHEDULE_SET');
  });

  it('F04 security: only Owner/Admin set schedules; a Teacher of another class cannot read one', async () => {
    const body = { effectiveFrom: today(), weekdays: [1] };
    expect((await h.call('PUT', `/classes/${ids.classes.A1}/schedule`, await h.signIn('teacher.a1'), body)).statusCode).toBe(403);
    expect((await h.call('GET', `/classes/${ids.classes.A1}/schedule`, await h.signIn('teacher.a2'))).statusCode).toBe(404);
    expect((await h.call('GET', `/classes/${ids.classes.A1}/schedule`, await h.signIn('admin.b'))).statusCode).toBe(404);
    expect((await h.call('PUT', `/classes/${ids.classes.A1}/schedule`, await h.signIn('admin.a'), { ...body, weekdays: [8] })).statusCode).toBe(400);
    expect((await h.call('PUT', `/classes/${ids.classes.A1}/schedule`, await h.signIn('admin.a'), { ...body, startTime: '12:00', endTime: '08:00' })).json().error.fields).toEqual({ endTime: 'INVALID' });
  });
});

describe('F04 · holidays and closures (US-014)', () => {
  it('F04-AC3 (US-014) a madrasa holiday is shown as a holiday, with no student absent', async () => {
    const admin = await h.signIn('admin.a');
    const day = classDay(2);
    const res = await h.call('POST', '/calendar/exceptions', admin, { date: day, kind: 'HOLIDAY', label: 'Test holiday' });
    expect(res.statusCode, res.body).toBe(201);
    expect(res.json()).toMatchObject({ classId: null, date: day, kind: 'HOLIDAY', label: 'Test holiday' });
    for (const klass of ['A1', 'A2'] as const) {
      const s = await summary(admin, klass, day, day);
      expect(s.days).toEqual([{ date: day, kind: 'HOLIDAY', label: 'Test holiday' }]);
      for (const st of s.students) expect(st.counts).toMatchObject({ holidays: 1, absent: 0, scheduled: 0 });
    }
    // Teachers see the madrasa-wide holiday.
    const list = (await h.call('GET', `/calendar/exceptions?from=${day}&to=${day}`, await h.signIn('teacher.a1'))).json().items;
    expect(list).toHaveLength(1);
  });

  it('F04-AC4 (US-014) a no-class exception affects only that class', async () => {
    const admin = await h.signIn('admin.a');
    const day = classDay(2);
    expect((await h.call('POST', '/calendar/exceptions', admin, { classId: ids.classes.A1, date: day, kind: 'NO_CLASS', label: 'Teacher away' })).statusCode).toBe(201);
    expect(studentRow(await summary(admin, 'A1', day, day), 'S1').days[day]).toBe('NO_CLASS');
    expect(studentRow(await summary(admin, 'A2', day, day), 'S3').days[day]).toBe('NOT_MARKED');
    // teacher.a2 does not see A1's exception; teacher.a1 does.
    expect((await h.call('GET', `/calendar/exceptions?from=${day}&to=${day}`, await h.signIn('teacher.a2'))).json().items).toEqual([]);
    expect((await h.call('GET', `/calendar/exceptions?from=${day}&to=${day}`, await h.signIn('teacher.a1'))).json().items).toHaveLength(1);
    // A second identical exception is refused; another class is fine.
    expect((await h.call('POST', '/calendar/exceptions', admin, { classId: ids.classes.A1, date: day, kind: 'NO_CLASS', label: 'Again' })).json().error.fields).toEqual({ date: 'TAKEN' });
  });

  it('F04-AC5 (US-014) Bulk Entry on a holiday says it is a holiday and records nothing automatically', async () => {
    const admin = await h.signIn('admin.a');
    const day = classDay(2);
    await h.call('POST', '/calendar/exceptions', admin, { date: day, kind: 'HOLIDAY', label: 'Test holiday' });
    const sheet = (await h.call('GET', `/attendance/sheet?classId=${ids.classes.A1}&date=${day}`, await h.signIn('teacher.a1'))).json();
    expect(sheet.day).toEqual({ kind: 'HOLIDAY', label: 'Test holiday' });
    expect(sheet.students.every((s: { record: unknown }) => s.record === null)).toBe(true);
    expect(Number((await sql<{ n: string }>`SELECT count(*) AS n FROM attendance_records`.execute(h.db)).rows[0]!.n)).toBe(0);
  });

  it('F04-AC20 (US-014) a holiday declared on a recorded date warns with the count, keeps the records, excludes them, and refuses new ones', async () => {
    const teacher = await h.signIn('teacher.a1');
    const admin = await h.signIn('admin.a');
    const day = classDay(2);
    const [r1] = await push(teacher, [createOp({ student: 'S1', status: 'ABSENT', date: day })]);
    expect(r1!.status).toBe('APPLIED');

    const impact = (await h.call('GET', `/calendar/exceptions/impact?date=${day}`, admin)).json();
    expect(impact).toEqual({ attendanceRecords: 1, dailyRecords: 0 });
    const warned = await h.call('POST', '/calendar/exceptions', admin, { date: day, kind: 'HOLIDAY', label: 'Late holiday' });
    expect(warned.statusCode).toBe(409);
    expect(warned.json().error).toMatchObject({ code: 'RECORDS_EXIST', fields: { records: '1' } });
    expect((await h.call('GET', `/calendar/exceptions?from=${day}&to=${day}`, admin)).json().items).toEqual([]);

    const confirmed = await h.call('POST', '/calendar/exceptions', admin, { date: day, kind: 'HOLIDAY', label: 'Late holiday', confirm: true });
    expect(confirmed.statusCode).toBe(201);
    // Kept in history, excluded from the summary.
    expect(await records('S1')).toHaveLength(1);
    expect(studentRow(await summary(admin, 'A1', day, day), 'S1')).toMatchObject({ days: { [day]: 'HOLIDAY' }, counts: { absent: 0, holidays: 1 } });
    // New entries and edits for that date are refused.
    const [r2, r3] = await push(teacher, [createOp({ student: 'S2', status: 'PRESENT', date: day }), updateOp(r1!.entityId!, 1, { status: 'LATE' })]);
    expect(r2).toMatchObject({ status: 'REJECTED', code: 'VALIDATION', fields: { reportDate: 'HOLIDAY' } });
    expect(r3).toMatchObject({ status: 'REJECTED', code: 'VALIDATION', fields: { reportDate: 'HOLIDAY' } });
    const created = (await audit(confirmed.json().id)).find((a) => a.action === 'CALENDAR_EXCEPTION_CREATED')!;
    expect(created.summary).toMatchObject({ recordsConfirmed: 1, date: day });

    // Cancelling the holiday restores the working day and the record counts again.
    expect((await h.call('POST', `/calendar/exceptions/${confirmed.json().id}/cancel`, admin)).statusCode).toBe(200);
    expect(studentRow(await summary(admin, 'A1', day, day), 'S1').counts).toMatchObject({ absent: 1 });
  });

  it('F04 security: a Teacher cannot declare or cancel exceptions', async () => {
    const teacher = await h.signIn('teacher.a1');
    expect((await h.call('POST', '/calendar/exceptions', teacher, { date: today(), kind: 'HOLIDAY', label: 'x' })).statusCode).toBe(403);
    expect((await h.call('GET', `/calendar/exceptions/impact?date=${today()}`, teacher)).statusCode).toBe(403);
    expect((await h.call('POST', '/calendar/exceptions', await h.signIn('admin.a'), { date: today(), kind: 'HOLIDAY', label: '   ' })).json().error.fields).toEqual({ label: 'REQUIRED' });
    // Another madrasa's class cannot be named.
    expect((await h.call('POST', '/calendar/exceptions', await h.signIn('admin.b'), { classId: ids.classes.A1, date: today(), kind: 'NO_CLASS', label: 'x' })).json().error.fields).toEqual({ classId: 'INVALID' });
  });
});

describe('F04 · Bulk Entry (US-015)', () => {
  it('F04-AC6 (US-015) the sheet lists the enrolled students with attendance fields only', async () => {
    const sheet = (await h.call('GET', `/attendance/sheet?classId=${ids.classes.A1}&date=${classDay()}`, await h.signIn('teacher.a1'))).json();
    expect(sheet.day.kind).toBe('SCHEDULED');
    expect(sheet.students.map((s: { name: string }) => s.name)).toEqual(['Test Student One', 'Test Student Two']);
    expect(Object.keys(sheet.students[0]).sort()).toEqual(['externalStudentId', 'id', 'name', 'recited', 'record']);
    // Another Teacher's class is not found.
    expect((await h.call('GET', `/attendance/sheet?classId=${ids.classes.A1}&date=${classDay()}`, await h.signIn('teacher.a2'))).statusCode).toBe(404);
  });

  it('F04-AC7 (US-015) Mark all Present keeps existing marks: an existing record is never overwritten by a new create', async () => {
    const teacher = await h.signIn('teacher.a1');
    const day = classDay();
    await push(teacher, [createOp({ student: 'S2', status: 'ABSENT', date: day })]);
    // The app sends Present only for unmarked students; even a stray create for S2 from another device does not overwrite.
    const [s1, s2] = await push(await h.signIn('admin.a'), [createOp({ student: 'S1', status: 'PRESENT', date: day }), createOp({ student: 'S2', status: 'PRESENT', date: day })], DEVICE_2);
    expect(s1!.status).toBe('APPLIED');
    expect(s2!.status).toBe('CONFLICT');
    expect((await records('S2')).map((r) => r.status)).toEqual(['ABSENT']);
  });

  it('F04-AC8 (US-015) an unmarked student has no record and is "not marked", never absent', async () => {
    const teacher = await h.signIn('teacher.a1');
    const day = classDay();
    await push(teacher, [createOp({ student: 'S1', status: 'PRESENT', date: day })]);
    const s = await summary(teacher, 'A1', day, day);
    expect(studentRow(s, 'S2')).toMatchObject({ days: { [day]: 'NOT_MARKED' }, counts: { notMarked: 1, absent: 0 } });
    expect(await records('S2')).toEqual([]);
    // "Mark them Absent" sends explicit Absent records by that Teacher.
    const [r] = await push(teacher, [createOp({ student: 'S2', status: 'ABSENT', date: day })]);
    const recorded = (await audit(r!.entityId!)).find((a) => a.action === 'ATTENDANCE_RECORDED')!;
    expect(recorded.actor_user_id).toBe(await h.userId('teacher.a1'));
  });

  it('F04-AC9 (US-015) one invalid row does not block the valid rows; each row has its own result', async () => {
    const teacher = await h.signIn('teacher.a1');
    const day = classDay();
    const results = await push(teacher, [
      createOp({ student: 'S1', status: 'PRESENT', date: day }),
      createOp({ student: 'S3', status: 'PRESENT', date: day }), // S3 is in A2, not A1
      createOp({ student: 'S2', status: 'LEAVE', leaveReason: '', date: day }),
    ]);
    expect(results.map((r) => r.status)).toEqual(['APPLIED', 'REJECTED', 'REJECTED']);
    expect(results[1]).toMatchObject({ code: 'VALIDATION', fields: { studentId: 'NOT_ENROLLED' } });
    expect(results[2]).toMatchObject({ code: 'VALIDATION', fields: { leaveReason: 'REQUIRED' } });
    expect(await records('S1')).toHaveLength(1);
    expect(await records('S3')).toEqual([]);
  });

  it('F04-AC10 (US-015) retrying a sent bulk save creates no duplicate records', async () => {
    const teacher = await h.signIn('teacher.a1');
    const day = classDay();
    const ops = [createOp({ student: 'S1', status: 'PRESENT', date: day }), createOp({ student: 'S2', status: 'LATE', date: day })];
    const first = await push(teacher, ops);
    const again = await push(teacher, ops);
    expect(again).toEqual(first);
    expect(await records('S1')).toHaveLength(1);
    expect(await records('S2')).toHaveLength(1);
    expect((await audit(first[0]!.entityId!)).filter((a) => a.action === 'ATTENDANCE_RECORDED')).toHaveLength(1);
  });

  it('F04-AC11 (US-015) an Absent mark writes only the attendance record', async () => {
    const teacher = await h.signIn('teacher.a1');
    const [r] = await push(teacher, [createOp({ student: 'S1', status: 'ABSENT', date: classDay() })]);
    const changes = await sql<{ entity: string }>`SELECT DISTINCT entity FROM change_log`.execute(h.db);
    expect(changes.rows.map((c) => c.entity)).toEqual(['attendance_record']);
    const row = (await sql<Record<string, unknown>>`SELECT * FROM attendance_records WHERE id = ${r!.entityId!}`.execute(h.db)).rows[0]!;
    // No performance column exists on the record.
    for (const column of Object.keys(row)) expect(column).not.toMatch(/quality|portion|attempt|mistake|sabaq|sabqi|manzil/);
  });

  it('F04-AC18 (US-015) Absent can become Late and Present can become Half day, each change audited', async () => {
    const teacher = await h.signIn('teacher.a1');
    const day = classDay();
    const [a, p] = await push(teacher, [createOp({ student: 'S1', status: 'ABSENT', date: day }), createOp({ student: 'S2', status: 'PRESENT', date: day })]);
    const [toLate, toHalf] = await push(teacher, [updateOp(a!.entityId!, 1, { status: 'LATE' }), updateOp(p!.entityId!, 1, { status: 'HALF_DAY' })]);
    expect(toLate).toMatchObject({ status: 'APPLIED', rowVersion: 2 });
    expect(toHalf).toMatchObject({ status: 'APPLIED', rowVersion: 2 });
    expect((await records('S1'))[0]).toMatchObject({ status: 'LATE' });
    expect((await records('S2'))[0]).toMatchObject({ status: 'HALF_DAY' });
    const changed = (await audit(a!.entityId!)).find((x) => x.action === 'ATTENDANCE_CHANGED')!;
    expect(changed.summary).toMatchObject({ status: 'LATE', rowVersion: 2, fields: ['absentNote', 'leaveReason', 'status'] });
    expect(studentRow(await summary(teacher, 'A1', day, day), 'S1').counts).toMatchObject({ attended: 1, late: 1, absent: 0 });
  });

  it('F04 validation: future dates, Sundays, other classes, and other madrasas are refused', async () => {
    const teacher = await h.signIn('teacher.a1');
    const [future, sunday, otherClass] = await push(teacher, [
      createOp({ student: 'S1', status: 'PRESENT', date: addDays(today(), 1) }),
      createOp({ student: 'S1', status: 'PRESENT', date: lastSunday() }),
      createOp({ student: 'S3', status: 'PRESENT', date: classDay(), classKey: 'A2' }),
    ]);
    expect(future).toMatchObject({ status: 'REJECTED', fields: { reportDate: 'FUTURE' } });
    expect(sunday).toMatchObject({ status: 'REJECTED', fields: { reportDate: 'UNSCHEDULED' } });
    expect(otherClass).toMatchObject({ status: 'REJECTED', code: 'NOT_FOUND' });
    // A1 class with S3 (in teacher.a1's scope by class) is not enrolled; B1 from Madrasa A is not found.
    const [cross] = await push(teacher, [createOp({ student: 'SB1', status: 'PRESENT', date: classDay(), classKey: 'B1' })]);
    expect(cross).toMatchObject({ status: 'REJECTED', code: 'NOT_FOUND' });
    // Fields the server owns are refused outright.
    const smuggled = createOp({ student: 'S1', status: 'LEAVE', leaveReason: 'x', date: classDay() });
    (smuggled.fields as Record<string, unknown>).leaveStatus = 'APPROVED';
    const [refused] = await push(teacher, [smuggled]);
    expect(refused).toMatchObject({ status: 'REJECTED', code: 'VALIDATION', fields: { leaveStatus: 'NOT_ALLOWED' } });
    expect(await records('S1')).toEqual([]);
  });

  it('F04 sync: a create-create collision with different values is a conflict on the existing record, resolvable either way', async () => {
    const teacher = await h.signIn('teacher.a1');
    const admin = await h.signIn('admin.a');
    const day = classDay();
    const [first] = await push(teacher, [createOp({ student: 'S1', status: 'PRESENT', date: day })]);
    // Same values from another device: a no-op on the existing record.
    const [same] = await push(admin, [createOp({ student: 'S1', status: 'PRESENT', date: day })], DEVICE_2);
    expect(same).toMatchObject({ status: 'APPLIED', entityId: first!.entityId, rowVersion: 1 });
    // Different values: a conflict holding both; the record is unchanged.
    const deviceCreate = createOp({ student: 'S1', status: 'LATE', date: day });
    const [clash] = await push(admin, [deviceCreate], DEVICE_2);
    expect(clash!.status).toBe('CONFLICT');
    expect((await records('S1')).map((r) => r.status)).toEqual(['PRESENT']);
    // A later edit of the never-created device id is refused for good once the conflict is resolved.
    const dependent = updateOp(deviceCreate.entityId, 1, { status: 'HALF_DAY' }, [deviceCreate.opId]);
    expect((await push(admin, [dependent], DEVICE_2))[0]).toMatchObject({ status: 'RETRY', code: 'DEPENDENCY_PENDING' });
    const resolved = await h.call('POST', `/sync/conflicts/${clash!.conflictId}/resolve`, admin, { choice: 'KEEP_DEVICE' });
    expect(resolved.statusCode, resolved.body).toBe(200);
    expect((await records('S1')).map((r) => [r.id, r.status])).toEqual([[first!.entityId, 'LATE']]);
    expect((await push(admin, [dependent], DEVICE_2))[0]).toMatchObject({ status: 'REJECTED', code: 'NOT_FOUND' });
  });

  it('F04 sync: attendance rows reach only the devices in scope, with a Leave decision as a new version', async () => {
    const teacher = await h.signIn('teacher.a1');
    const [r] = await push(teacher, [createOp({ student: 'S1', status: 'LEAVE', leaveReason: 'Family travel', date: classDay() })]);
    const pull = async (token: string) => (await h.call('GET', '/sync/pull', token)).json().changes as Array<{ entityId: string; rowVersion: number; fields: Record<string, unknown> }>;
    expect((await pull(teacher)).find((c) => c.entityId === r!.entityId)).toMatchObject({ rowVersion: 1, fields: { status: 'LEAVE', leaveStatus: 'REQUESTED' } });
    expect((await pull(await h.signIn('teacher.a2'))).find((c) => c.entityId === r!.entityId)).toBeUndefined();
    await h.call('POST', `/attendance/${r!.entityId}/leave-decision`, await h.signIn('admin.a'), { decision: 'APPROVE', rowVersion: 1 });
    expect((await pull(teacher)).find((c) => c.entityId === r!.entityId)).toMatchObject({ rowVersion: 2, fields: { leaveStatus: 'APPROVED' } });
  });
});

describe('F04 · Leave (US-016, US-017)', () => {
  async function teacherLeave(student: 'S1' | 'S2' = 'S1') {
    const [r] = await push(await h.signIn('teacher.a1'), [createOp({ student, status: 'LEAVE', leaveReason: 'Family wedding', date: classDay() })]);
    expect(r!.status).toBe('APPLIED');
    return r!.entityId!;
  }

  it('F04-AC13 (US-016) a Teacher-marked Leave with a reason awaits approval', async () => {
    const id = await teacherLeave();
    expect((await records('S1'))[0]).toMatchObject({ status: 'LEAVE', leave_status: 'REQUESTED', leave_reason: 'Family wedding' });
    const list = (await h.call('GET', '/attendance/leave', await h.signIn('admin.a'))).json();
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({ studentName: 'Test Student One', className: 'Hifz A1', requestedBy: { displayName: 'Test teacher.a1' }, record: { id, leaveReason: 'Family wedding' } });
    const s = await summary(await h.signIn('teacher.a1'), 'A1', classDay(), classDay());
    expect(studentRow(s, 'S1').counts).toMatchObject({ leaveAwaiting: 1, leave: 0, absent: 0 });
  });

  it('F04-AC14 (US-016) Leave without a reason is rejected and nothing is saved', async () => {
    const teacher = await h.signIn('teacher.a1');
    for (const leaveReason of [null, '', '   ']) {
      const [r] = await push(teacher, [createOp({ student: 'S2', status: 'LEAVE', leaveReason, date: classDay() })]);
      expect(r).toMatchObject({ status: 'REJECTED', code: 'VALIDATION', fields: { leaveReason: 'REQUIRED' } });
    }
    expect(await records('S2')).toEqual([]);
    // Changing an existing record to Leave needs a reason too.
    const [p] = await push(teacher, [createOp({ student: 'S2', status: 'PRESENT', date: classDay() })]);
    expect((await push(teacher, [updateOp(p!.entityId!, 1, { status: 'LEAVE' })]))[0]).toMatchObject({ status: 'REJECTED', fields: { leaveReason: 'REQUIRED' } });
  });

  it('F04-AC15 (US-017) Admin approval counts as Leave and is audited with the Admin and the time', async () => {
    const id = await teacherLeave();
    const admin = await h.signIn('admin.a');
    const res = await h.call('POST', `/attendance/${id}/leave-decision`, admin, { decision: 'APPROVE', rowVersion: 1 });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({ leaveStatus: 'APPROVED', rowVersion: 2 });
    expect(studentRow(await summary(admin, 'A1', classDay(), classDay()), 'S1').counts).toMatchObject({ leave: 1, absent: 0, attended: 0 });
    const decision = (await audit(id)).find((a) => a.action === 'LEAVE_APPROVED')!;
    expect(decision.actor_user_id).toBe(await h.userId('admin.a'));
    expect(decision.created_at).toBeTruthy();
    // Deciding again is refused.
    expect((await h.call('POST', `/attendance/${id}/leave-decision`, admin, { decision: 'REJECT', rowVersion: 2 })).json().error.code).toBe('LEAVE_NOT_AWAITING');
    expect((await h.call('GET', '/attendance/leave?status=APPROVED', admin)).json().items[0]).toMatchObject({ decidedBy: { displayName: 'Test admin.a' } });
  });

  it('F04-AC16 (US-017) Admin rejection counts as a normal absence and shows as rejected', async () => {
    const id = await teacherLeave();
    const owner = await h.signIn('owner.a');
    expect((await h.call('POST', `/attendance/${id}/leave-decision`, owner, { decision: 'REJECT', rowVersion: 1 })).json()).toMatchObject({ leaveStatus: 'REJECTED' });
    const row = studentRow(await summary(owner, 'A1', classDay(), classDay()), 'S1');
    expect(row).toMatchObject({ days: { [classDay()]: 'LEAVE_REJECTED' }, counts: { absent: 1, leave: 0 } });
    expect((await audit(id)).map((a) => a.action)).toContain('LEAVE_REJECTED');
  });

  it('F04-AC17 (US-017) a Teacher cannot approve or reject a Leave', async () => {
    const id = await teacherLeave();
    const teacher = await h.signIn('teacher.a1');
    for (const decision of ['APPROVE', 'REJECT']) {
      const res = await h.call('POST', `/attendance/${id}/leave-decision`, teacher, { decision, rowVersion: 1 });
      expect(res.statusCode).toBe(403);
    }
    expect((await h.call('GET', '/attendance/leave', teacher)).statusCode).toBe(403);
    expect((await records('S1'))[0]).toMatchObject({ leave_status: 'REQUESTED' });
    // Another madrasa's Admin cannot find it.
    expect((await h.call('POST', `/attendance/${id}/leave-decision`, await h.signIn('admin.b'), { decision: 'APPROVE', rowVersion: 1 })).statusCode).toBe(404);
  });

  it('F04-AC21 (US-016) a Bulk Entry Leave row needs a reason and then shows awaiting approval', async () => {
    const teacher = await h.signIn('teacher.a1');
    const [missing, given] = await push(teacher, [
      createOp({ student: 'S1', status: 'LEAVE', date: classDay() }),
      createOp({ student: 'S2', status: 'LEAVE', leaveReason: 'Doctor visit', date: classDay() }),
    ]);
    expect(missing).toMatchObject({ status: 'REJECTED', fields: { leaveReason: 'REQUIRED' } });
    expect(given!.status).toBe('APPLIED');
    const sheet = (await h.call('GET', `/attendance/sheet?classId=${ids.classes.A1}&date=${classDay()}`, teacher)).json();
    expect(sheet.students.find((s: { id: string }) => s.id === ids.students.S2).record).toMatchObject({ status: 'LEAVE', leaveStatus: 'REQUESTED' });
  });

  it('F04-AC22 (US-017) Leave marked by an Owner or Admin is approved at once and audited', async () => {
    const [r] = await push(await h.signIn('admin.a'), [createOp({ student: 'S1', status: 'LEAVE', leaveReason: 'Hajj travel', date: classDay() })]);
    expect((await records('S1'))[0]).toMatchObject({ leave_status: 'APPROVED' });
    expect((await audit(r!.entityId!)).map((a) => a.action)).toEqual(['ATTENDANCE_RECORDED', 'LEAVE_APPROVED']);
    expect((await h.call('GET', '/attendance/leave', await h.signIn('admin.a'))).json().items).toEqual([]);
    // A Teacher changing the reason asks for approval again.
    const [u] = await push(await h.signIn('teacher.a1'), [updateOp(r!.entityId!, 1, { status: 'LEAVE', leaveReason: 'Travel' })]);
    expect(u!.status).toBe('APPLIED');
    expect((await records('S1'))[0]).toMatchObject({ leave_status: 'REQUESTED' });
  });

  it('F04-AC23 (US-016) Leave reasons and absence notes never reach Students, Parents, logs, or audit', async () => {
    const reason = 'Confidential-reason-7731';
    await push(await h.signIn('teacher.a1'), [createOp({ student: 'S1', status: 'LEAVE', leaveReason: reason, date: classDay() })]);
    for (const who of ['student.s1', 'parent.p1'] as const) {
      const token = await h.signIn(who);
      for (const url of [`/attendance/sheet?classId=${ids.classes.A1}&date=${classDay()}`, `/attendance/summary?classId=${ids.classes.A1}&from=${classDay()}&to=${classDay()}`, '/attendance/leave', '/sync/pull']) {
        const res = await h.call('GET', url, token);
        expect(res.statusCode).toBe(403);
        expect(res.body).not.toContain(reason);
      }
    }
    const found = (await h.control('POST', '/search', { text: reason })).json();
    // Only the attendance record itself holds it: never the audit log, sync ops, or the logs.
    expect(found).toEqual({ database: 1, logs: 0 });
  });
});

describe('F04 · storage', () => {
  it('F04 Done: no delete route, and the database refuses deletes of calendar rows', async () => {
    await push(await h.signIn('teacher.a1'), [createOp({ student: 'S1', status: 'PRESENT', date: classDay() })]);
    await h.call('POST', '/calendar/exceptions', await h.signIn('admin.a'), { date: addDays(today(), 7), kind: 'HOLIDAY', label: 'Ahead' });
    for (const table of ['attendance_records', 'calendar_exceptions', 'class_schedules']) {
      await expect(sql`DELETE FROM ${sql.table(table)}`.execute(h.db)).rejects.toThrow(/never deleted/);
    }
    const orgA = (await h.call('GET', '/organization', await h.signIn('admin.a'))).json().id;
    await expect(withTenant(h.db, orgA, (tx) => sql`DELETE FROM attendance_records`.execute(tx))).rejects.toThrow(/permission denied/);
  });

  it('F04 security: row-level security hides another madrasa’s calendar rows', async () => {
    await push(await h.signIn('teacher.a1'), [createOp({ student: 'S1', status: 'PRESENT', date: classDay() })]);
    const orgB = (await h.call('GET', '/organization', await h.signIn('admin.b'))).json().id;
    const seen = await withTenant(h.db, orgB, async (tx) => ({
      attendance: (await tx.selectFrom('attendance_records').select('id').execute()).length,
      schedules: (await tx.selectFrom('class_schedules').select('id').execute()).length,
    }));
    expect(seen).toEqual({ attendance: 0, schedules: 1 });
  });
});

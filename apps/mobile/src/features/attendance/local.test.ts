// F04 · attendance on the device: one transaction per row with its sync operation (F04-AC12, F12-AC1), the local
// Leave status rule (F04-AC13, AC22), UPDATEs based on the server version, and the offline roster cache.
import { describe, expect, it } from 'vitest';
import { WORKSPACE_MIGRATIONS, runMigrations } from '../../local-db/migrations.ts';
import { openNodeDriver } from '../../local-db/testing/nodeDriver.ts';
import { EntityRegistry } from '../../sync/registry.ts';
import { FakeClock, makeOutbox } from '../../sync/testing/probe.ts';
import { attendanceHandler, cacheRoster, cachedClasses, cachedRoster, readMarks, registerAttendance, saveMark } from './local.ts';

const CLASS = '0190f5c0-0000-7000-8000-00000000c1a5';
const S1 = '0190f5c0-0000-7000-8000-0000000000s1'.replace('s1', 'a1');
const S2 = '0190f5c0-0000-7000-8000-0000000000a2';
const DATE = '2026-11-06';

async function setup() {
  const db = openNodeDriver();
  await runMigrations(db, WORKSPACE_MIGRATIONS);
  const registry = new EntityRegistry();
  registerAttendance(registry);
  const outbox = makeOutbox(db, new FakeClock(), registry);
  return { db, outbox, registry };
}

describe('F04 · attendance on the device', () => {
  it('F04-AC12 (US-015) a mark is saved on the device with its CREATE operation in one transaction', async () => {
    const { db, outbox } = await setup();
    const id = await saveMark(outbox, { studentId: S1, label: 'Test Student One', existing: null, mark: { status: 'PRESENT', leaveReason: null, absentNote: null } }, { classId: CLASS, date: DATE, role: 'TEACHER' });
    const marks = await readMarks(db, CLASS, DATE);
    expect(marks.get(S1)).toMatchObject({ id, rowVersion: null, status: 'PRESENT', leaveStatus: 'NONE' });
    const [op] = await outbox.list();
    expect(op).toMatchObject({ entity: 'attendance_record', entityId: id, opType: 'CREATE', baseVersion: null, label: 'Test Student One', sentCount: 0 });
    expect(op!.fields).toEqual({ studentId: S1, classId: CLASS, reportDate: DATE, status: 'PRESENT', leaveReason: null, absentNote: null });
  });

  it('F04-AC13 / AC22 (US-016, US-017) a Teacher’s Leave awaits approval locally; an Admin’s is approved', async () => {
    const { db, outbox } = await setup();
    const leave = { status: 'LEAVE' as const, leaveReason: '  Family wedding ', absentNote: 'dropped' };
    await saveMark(outbox, { studentId: S1, label: 'One', existing: null, mark: leave }, { classId: CLASS, date: DATE, role: 'TEACHER' });
    await saveMark(outbox, { studentId: S2, label: 'Two', existing: null, mark: leave }, { classId: CLASS, date: DATE, role: 'ADMIN' });
    const marks = await readMarks(db, CLASS, DATE);
    // The mark is normalized: trimmed reason, no absence note on a Leave.
    expect(marks.get(S1)).toMatchObject({ leaveStatus: 'REQUESTED', leaveReason: 'Family wedding', absentNote: null });
    expect(marks.get(S2)).toMatchObject({ leaveStatus: 'APPROVED' });
  });

  it('F04-AC18 (US-015) changing a synced record queues an UPDATE of the coupled group on its server version', async () => {
    const { db, outbox } = await setup();
    const id = '0190f5c0-0000-7000-8000-00000000abcd';
    await attendanceHandler.upsertFromServer(db, id, 3, { studentId: S1, classId: CLASS, reportDate: DATE, status: 'ABSENT', leaveStatus: 'NONE', leaveReason: null, absentNote: null });
    const existing = (await readMarks(db, CLASS, DATE)).get(S1)!;
    await saveMark(outbox, { studentId: S1, label: 'One', existing, mark: { status: 'LATE', leaveReason: null, absentNote: null } }, { classId: CLASS, date: DATE, role: 'TEACHER' });
    const [op] = await outbox.list();
    expect(op).toMatchObject({ opType: 'UPDATE', entityId: id, baseVersion: 3 });
    expect(op!.fields).toEqual({ status: 'LATE', leaveReason: null, absentNote: null });
    expect((await readMarks(db, CLASS, DATE)).get(S1)).toMatchObject({ id, status: 'LATE', rowVersion: 3 });
  });

  it('F04 unit: when the device holds two records for one student, the unsynced one is shown', async () => {
    const { db, outbox } = await setup();
    await saveMark(outbox, { studentId: S1, label: 'One', existing: null, mark: { status: 'LATE', leaveReason: null, absentNote: null } }, { classId: CLASS, date: DATE, role: 'TEACHER' });
    await attendanceHandler.upsertFromServer(db, '0190f5c0-0000-7000-8000-00000000beef', 1, { studentId: S1, classId: CLASS, reportDate: DATE, status: 'PRESENT', leaveStatus: 'NONE', leaveReason: null, absentNote: null });
    expect((await readMarks(db, CLASS, DATE)).get(S1)).toMatchObject({ status: 'LATE', rowVersion: null });
  });

  it('F12-AC18 discarding a never-synced CREATE removes the local mark', async () => {
    const { db, outbox } = await setup();
    const id = await saveMark(outbox, { studentId: S1, label: 'One', existing: null, mark: { status: 'ABSENT', leaveReason: null, absentNote: null } }, { classId: CLASS, date: DATE, role: 'TEACHER' });
    await db.transaction((tx) => attendanceHandler.onDiscard!(tx, { entityId: id, opType: 'CREATE' }));
    expect((await readMarks(db, CLASS, DATE)).size).toBe(0);
  });

  it('F04-AC12 (US-015) the roster cache lets Bulk Entry open offline, and holds no notes', async () => {
    const { db } = await setup();
    expect(await cachedRoster(db, CLASS)).toBeNull();
    await cacheRoster(db, CLASS, 'Hifz A1', [{ id: S1, name: 'Test Student One', externalStudentId: 'R-1', record: null, recited: false } as never], '2026-11-08T06:00:00.000Z');
    expect(await cachedRoster(db, CLASS)).toEqual({ className: 'Hifz A1', students: [{ id: S1, name: 'Test Student One', externalStudentId: 'R-1' }], fetchedAt: '2026-11-08T06:00:00.000Z' });
    expect(await cachedClasses(db)).toEqual([{ id: CLASS, name: 'Hifz A1' }]);
  });

  it('F04 unit: the Sync Queue label never carries a reason or note', () => {
    expect(attendanceHandler.label({ reportDate: DATE, leaveReason: 'secret', absentNote: 'secret' })).toBe(DATE);
  });
});

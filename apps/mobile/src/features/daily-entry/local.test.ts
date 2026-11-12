// F05 · Daily records on the device (US-018, US-022, US-023; F05-AC1, AC4, AC11, AC15; F12-AC1, AC3, AC16).
// SYNTHETIC DATA ONLY.
import { describe, expect, it } from 'vitest';
import type { PushRequest } from '@hifz/contracts';
import { WORKSPACE_MIGRATIONS, runMigrations, schemaVersion } from '../../local-db/migrations.ts';
import { openNodeDriver } from '../../local-db/testing/nodeDriver.ts';
import { EntityRegistry } from '../../sync/registry.ts';
import { FakeClock, FakeTransport, makeEngine, makeOutbox } from '../../sync/testing/probe.ts';
import { readMarks, registerAttendance } from '../attendance/local.ts';
import {
  addAttempt,
  cacheReportMode,
  readCachedReportMode,
  readRecord,
  recitedOn,
  recordSyncState,
  recordsOn,
  registerDailyEntry,
  saveCorrection,
  saveNewEntry,
  type AttemptWrite,
  type NewEntryInput,
  type PortionWrite,
} from './local.ts';

const CLASS = '0190f5c0-0000-7000-8000-00000000c1a5';
const STUDENT = '0190f5c0-0000-7000-8000-0000000000a1';
const DATE = '2026-11-09';
const ACTOR = { userId: '0190f5c0-0000-7000-8000-00000000f001', name: 'Test Teacher' };

async function setup(clock = new FakeClock()) {
  const db = openNodeDriver();
  await runMigrations(db, WORKSPACE_MIGRATIONS);
  const registry = new EntityRegistry();
  registerAttendance(registry);
  registerDailyEntry(registry);
  const outbox = makeOutbox(db, clock, registry);
  return { db, outbox, registry, clock };
}

const sabaq: PortionWrite = {
  section: 'SABAQ',
  position: 1,
  isExtra: false,
  paraNumber: 1,
  range: { surahStart: 1, ayahStart: 1, surahEnd: 1, ayahEnd: 4 },
  assigned: { unit: 'LINES', numerator: 6, denominator: 1 },
  totalLines: 6,
  totalLinesSource: 'LAYOUT',
};
const sabqi = (position: number, para: number): PortionWrite => ({
  section: 'SABQI',
  position,
  isExtra: false,
  paraNumber: para,
  range: null,
  assigned: { unit: 'PARA', numerator: 1, denominator: 2 },
  totalLines: null,
  totalLinesSource: null,
});
const attempt = (over: Partial<AttemptWrite> = {}): AttemptWrite => ({ status: 'COMPLETED', completed: null, quality: null, noMistakes: false, mistakes: [], remarks: null, ...over });

const entry = (over: Partial<NewEntryInput> = {}): NewEntryInput => ({
  studentId: STUDENT,
  classId: CLASS,
  reportDate: DATE,
  sessionLabel: null,
  studentName: 'Test Student One',
  className: 'Hifz A1',
  actor: ACTOR,
  attendance: null,
  portions: [
    { portion: sabaq, attempt: attempt({ completed: { unit: 'LINES', numerator: 6, denominator: 1 }, quality: 2, mistakes: [{ category: 'TAJWEED', severity: 'MINOR', repeated: false }], remarks: 'staff only' }) },
    { portion: sabqi(1, 3), attempt: attempt({ completed: { unit: 'PARA', numerator: 1, denominator: 2 } }) },
    { portion: sabqi(2, 4), attempt: attempt({ status: 'PARTIAL', completed: { unit: 'PARA', numerator: 1, denominator: 4 } }) },
  ],
  now: '2026-11-10T05:00:00.000Z',
  ...over,
});

describe('F05 · daily records on the device', () => {
  it('F12-AC16 (US-051) the F05 migration runs over pending operations and keeps the outbox unchanged', async () => {
    const db = openNodeDriver();
    const before = WORKSPACE_MIGRATIONS.slice(0, 5);
    await runMigrations(db, before);
    const registry = new EntityRegistry();
    registerAttendance(registry);
    const outbox = makeOutbox(db, new FakeClock(), registry);
    // Pending attendance work queued by the previous app version.
    const id = outbox.newEntityId();
    await outbox.saveWithOp(
      async (tx) => {
        await tx.run(`INSERT INTO attendance_records (id, row_version, student_id, class_id, report_date, status) VALUES (?, NULL, ?, ?, ?, 'PRESENT')`, [id, STUDENT, CLASS, DATE]);
      },
      { entity: 'attendance_record', entityId: id, opType: 'CREATE', baseVersion: null, fields: { studentId: STUDENT, classId: CLASS, reportDate: DATE, status: 'PRESENT', leaveReason: null, absentNote: null }, label: 'One' },
    );
    const snapshot = await db.all('SELECT * FROM outbox ORDER BY seq');
    expect(await runMigrations(db, WORKSPACE_MIGRATIONS.slice(0, 6))).toEqual([6]);
    expect(await schemaVersion(db)).toBe(6);
    expect(await db.all('SELECT * FROM outbox ORDER BY seq')).toEqual(snapshot);
    expect((await outbox.list()).map((i) => i.status.state)).toEqual(['PENDING']);
    // The new tables exist and the report mode is not known until fetched (UI spec 8.8).
    expect(await db.all("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('daily_records', 'lesson_portions', 'portion_attempts') ORDER BY name")).toHaveLength(3);
    expect(await readCachedReportMode(db)).toBeNull();
    await cacheReportMode(db, 'MULTI_SESSION');
    expect(await readCachedReportMode(db)).toBe('MULTI_SESSION');
  });

  it('F05-AC1, F12-AC1 (US-018) the record, portions, attempts, attendance, and all their operations are written in one transaction', async () => {
    const { db, outbox } = await setup();
    const id = await saveNewEntry(
      outbox,
      entry({ attendance: { input: { studentId: STUDENT, label: 'Test Student One', existing: null, mark: { status: 'PRESENT', leaveReason: null, absentNote: null } }, ctx: { classId: CLASS, date: DATE, role: 'TEACHER' } } }),
    );
    const record = (await readRecord(db, id!))!;
    expect(record).toMatchObject({ reportDate: DATE, studentName: 'Test Student One', rowVersion: null });
    expect(record.portions.map((p) => `${p.section}${p.position}`)).toEqual(['SABAQ1', 'SABQI1', 'SABQI2']);
    expect(record.portions.every((p) => p.attempts.length === 1 && p.attempts[0]!.attemptNo === 1)).toBe(true);
    const ops = await outbox.list();
    expect(ops.map((o) => `${o.entity}:${o.opType}`)).toEqual([
      'attendance_record:CREATE',
      'daily_record:CREATE',
      'lesson_portion:CREATE',
      'portion_attempt:CREATE',
      'lesson_portion:CREATE',
      'portion_attempt:CREATE',
      'lesson_portion:CREATE',
      'portion_attempt:CREATE',
    ]);
    // Dependencies: record → portion → attempt; portions also wait for the attendance change.
    const [att, rec, portion, attemptOp] = ops;
    expect(rec!.dependsOn).toEqual([att!.opId]);
    expect(portion!.dependsOn).toEqual([rec!.opId, att!.opId]);
    expect(attemptOp!.dependsOn).toEqual([portion!.opId]);
    // The client never sends a Sabaq Para (FR-SAB-001); Sabqi sends its own; remarks never in a label.
    expect(portion!.fields).toMatchObject({ section: 'SABAQ', paraNumber: null, totalLines: 6, totalLinesSource: 'LAYOUT', dailyRecordId: id });
    expect(ops[4]!.fields).toMatchObject({ section: 'SABQI', paraNumber: 3 });
    expect(ops.every((o) => !String(o.label).includes('staff only'))).toBe(true);
    expect((await readMarks(db, CLASS, DATE)).get(STUDENT)).toMatchObject({ status: 'PRESENT' });
    expect(await recitedOn(db, STUDENT, DATE)).toBe(true);
    expect(await recordsOn(db, STUDENT, DATE)).toEqual([{ id, sessionLabel: null }]);
  });

  it('F12-AC1 (US-018) if any write fails, nothing is kept: no rows and no operations', async () => {
    const { db, outbox } = await setup();
    const broken = { ...sabaq, assigned: undefined as never };
    await expect(saveNewEntry(outbox, entry({ portions: [{ portion: sabaq, attempt: attempt() }, { portion: broken, attempt: attempt() }] }))).rejects.toThrow();
    expect(await outbox.list()).toEqual([]);
    expect(await db.all('SELECT id FROM daily_records')).toEqual([]);
    expect(await db.all('SELECT id FROM lesson_portions')).toEqual([]);
  });

  it('F12-AC9 (US-018) "Saved on this device" until the server acknowledges every operation; then "Synced"', async () => {
    const { db, outbox, registry, clock } = await setup();
    const id = (await saveNewEntry(outbox, entry()))!;
    let record = (await readRecord(db, id))!;
    expect(recordSyncState(await outbox.list(), record)).toBe('PENDING');
    const transport = new FakeTransport();
    const pushed: PushRequest[] = [];
    transport.onPush = (req) => {
      pushed.push(req);
      return { results: req.ops.map((op) => ({ opId: op.opId, status: 'APPLIED' as const, rowVersion: 1, entityId: op.entityId })), serverTime: new Date(clock.now).toISOString() };
    };
    const engine = makeEngine(db, outbox, registry, transport, clock);
    await engine.syncNow({ ignoreBackoff: true });
    record = (await readRecord(db, id))!;
    expect(pushed.length).toBeGreaterThan(0);
    expect(recordSyncState(await outbox.list(), record)).toBe('SYNCED');
    // The report date is the Teacher's date, unchanged by the sync time (F05-AC2).
    expect(record.reportDate).toBe(DATE);
  });

  it('F12 (US-018) a rejected portion makes the record "action required", never synced', async () => {
    const { db, outbox, registry, clock } = await setup();
    const id = (await saveNewEntry(outbox, entry()))!;
    const transport = new FakeTransport();
    transport.onPush = (req) => ({
      results: req.ops.map((op) =>
        op.entity === 'lesson_portion' && (op.fields as { position?: number }).position === 2
          ? { opId: op.opId, status: 'REJECTED' as const, code: 'VALIDATION', fields: { assigned: 'REQUIRED' } }
          : { opId: op.opId, status: 'APPLIED' as const, rowVersion: 1, entityId: op.entityId },
      ),
      serverTime: new Date(clock.now).toISOString(),
    });
    await makeEngine(db, outbox, registry, transport, clock).syncNow({ ignoreBackoff: true });
    const state = recordSyncState(await outbox.list(), (await readRecord(db, id))!);
    expect(['FAILED', 'ACTION_REQUIRED']).toContain(state);
  });

  it('F05-AC4, AC11 (US-023) a correction queues UPDATEs only for what changed; other portions keep their outcome', async () => {
    const { db, outbox } = await setup();
    const id = (await saveNewEntry(outbox, entry()))!;
    const record = (await readRecord(db, id))!;
    const second = record.portions[2]!;
    const first = record.portions[1]!;
    const before = (await outbox.list()).length;
    const ops = await saveCorrection(outbox, {
      recordId: id,
      reportDate: DATE,
      studentName: 'Test Student One',
      attendance: null,
      actor: ACTOR,
      now: '2026-11-10T06:00:00.000Z',
      portions: [
        {
          id: second.id,
          portion: sabqi(2, 4),
          portionChanged: false,
          positionChanged: false,
          removed: false,
          attempt: attempt({ status: 'COMPLETED', completed: { unit: 'PARA', numerator: 1, denominator: 2 } }),
          latestAttemptId: second.attempts[0]!.id,
          outcomeChanged: true,
          remarksChanged: false,
        },
      ],
    });
    expect(ops).toBe(1);
    const queued = (await outbox.list()).slice(before);
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ entity: 'portion_attempt', opType: 'UPDATE', entityId: second.attempts[0]!.id, baseVersion: 1 });
    // The outcome group travels whole (no partial merge, no last-write-wins).
    expect(Object.keys(queued[0]!.fields).sort()).toEqual(['completed', 'mistakes', 'noMistakes', 'quality', 'status']);
    const after = (await readRecord(db, id))!;
    expect(after.portions[2]!.attempts[0]!.status).toBe('COMPLETED');
    expect(after.portions[1]!.attempts[0]).toEqual(first.attempts[0]);
  });

  it('F05 (US-023) removing a portion keeps its row and attempts; a new portion in an unsynced record depends on its CREATE', async () => {
    const { db, outbox } = await setup();
    const id = (await saveNewEntry(outbox, entry()))!;
    const record = (await readRecord(db, id))!;
    const recordCreate = (await outbox.list()).find((o) => o.entity === 'daily_record')!;
    await saveCorrection(outbox, {
      recordId: id,
      reportDate: DATE,
      studentName: 'Test Student One',
      attendance: null,
      actor: ACTOR,
      now: '2026-11-10T06:00:00.000Z',
      portions: [
        { id: record.portions[2]!.id, portion: sabqi(2, 4), portionChanged: false, positionChanged: false, removed: true, attempt: null, latestAttemptId: null, outcomeChanged: false, remarksChanged: false },
        { id: null, portion: { ...sabqi(1, 7), section: 'MANZIL' }, portionChanged: true, positionChanged: false, removed: false, attempt: attempt({ status: 'PENDING' }), latestAttemptId: null, outcomeChanged: true, remarksChanged: false },
      ],
    });
    const after = (await readRecord(db, id))!;
    const removed = after.portions.find((p) => p.id === record.portions[2]!.id)!;
    expect(removed).toMatchObject({ removed: true });
    expect(removed.attempts).toHaveLength(1);
    const ops = await outbox.list();
    expect(ops.find((o) => o.entity === 'lesson_portion' && o.opType === 'UPDATE')!.fields).toEqual({ removed: true });
    const manzil = ops.find((o) => o.entity === 'lesson_portion' && o.opType === 'CREATE' && (o.fields as { section: string }).section === 'MANZIL')!;
    expect(manzil.dependsOn).toContain(recordCreate.opId);
  });

  it('F05-AC15 (US-023) a new attempt gets the next number and never changes earlier attempts', async () => {
    const { db, outbox } = await setup();
    const id = (await saveNewEntry(outbox, entry()))!;
    const portion = (await readRecord(db, id))!.portions[2]!;
    const firstBefore = portion.attempts[0]!;
    const attemptId = await addAttempt(outbox, { portionId: portion.id, reportDate: DATE, studentName: 'Test Student One', actor: ACTOR, attempt: attempt({ quality: 1 }), now: '2026-11-10T07:00:00.000Z' });
    const after = (await readRecord(db, id))!.portions[2]!;
    expect(after.attempts.map((a) => a.attemptNo)).toEqual([1, 2]);
    expect(after.attempts[0]).toEqual(firstBefore);
    const op = (await outbox.list()).find((o) => o.entityId === attemptId)!;
    expect(op).toMatchObject({ opType: 'CREATE', fields: { attemptNo: 2, lessonPortionId: portion.id } });
    expect(op.dependsOn).toHaveLength(1);
  });

  it('F05 (UI spec 8.6) Absent or Leave with no portion saves only the attendance', async () => {
    const { db, outbox } = await setup();
    const id = await saveNewEntry(
      outbox,
      entry({ portions: [], attendance: { input: { studentId: STUDENT, label: 'One', existing: null, mark: { status: 'LEAVE', leaveReason: 'Family wedding', absentNote: null } }, ctx: { classId: CLASS, date: DATE, role: 'TEACHER' } } }),
    );
    expect(id).toBeNull();
    expect((await outbox.list()).map((o) => o.entity)).toEqual(['attendance_record']);
    expect(await db.all('SELECT id FROM daily_records')).toEqual([]);
  });
});

describe('F07 · mistakes and quality on the device', () => {
  it('F12-AC16 (US-051) the F07 migration runs over pending daily-entry operations and keeps the outbox unchanged', async () => {
    const db = openNodeDriver();
    await runMigrations(db, WORKSPACE_MIGRATIONS.slice(0, 6));
    const registry = new EntityRegistry();
    registerAttendance(registry);
    registerDailyEntry(registry);
    const outbox = makeOutbox(db, new FakeClock(), registry);
    // A record queued by the previous app version (no overall_label column yet).
    const id = outbox.newEntityId();
    await outbox.saveWithOp(
      async (tx) => {
        await tx.run('INSERT INTO daily_records (id, row_version, student_id, class_id, report_date, session_label) VALUES (?, NULL, ?, ?, ?, NULL)', [id, STUDENT, CLASS, DATE]);
      },
      { entity: 'daily_record', entityId: id, opType: 'CREATE', baseVersion: null, fields: { studentId: STUDENT, classId: CLASS, reportDate: DATE, sessionLabel: null }, label: 'One' },
    );
    const snapshot = await db.all('SELECT * FROM outbox ORDER BY seq');
    expect(await runMigrations(db, WORKSPACE_MIGRATIONS)).toEqual([7]);
    expect(await schemaVersion(db)).toBe(7);
    expect(await db.all('SELECT * FROM outbox ORDER BY seq')).toEqual(snapshot);
    // Records saved before the migration have no overall label (never filled in from quality).
    expect((await readRecord(db, id))!.overallLabel).toBeNull();
    expect((await outbox.list()).map((i) => i.status.state)).toEqual(['PENDING']);
  });

  it('F07-AC12, AC13 (US-032) the overall label is saved once on the record and sent with it; quality is untouched', async () => {
    const { db, outbox } = await setup();
    const id = (await saveNewEntry(outbox, entry({ overallLabel: 'GOOD' })))!;
    const record = (await readRecord(db, id))!;
    expect(record.overallLabel).toBe('GOOD');
    expect(record.portions.map((p) => p.attempts[0]!.quality)).toEqual([2, null, null]);
    const ops = await outbox.list();
    expect(ops.find((o) => o.entity === 'daily_record')!.fields).toMatchObject({ overallLabel: 'GOOD' });
    // Without a choice the record's label is null, whatever the scores.
    const other = (await saveNewEntry(outbox, entry({ studentId: '0190f5c0-0000-7000-8000-0000000000a2' })))!;
    expect((await readRecord(db, other))!.overallLabel).toBeNull();
  });

  it('F07-AC12 (US-032) changing only the overall label queues one daily_record UPDATE with that field', async () => {
    const { db, outbox } = await setup();
    const id = (await saveNewEntry(outbox, entry()))!;
    const before = (await outbox.list()).length;
    const n = await saveCorrection(outbox, { recordId: id, reportDate: DATE, studentName: 'Test Student One', overallLabel: 'NEEDS_IMPROVEMENT', attendance: null, actor: ACTOR, portions: [], now: '2026-11-10T06:00:00.000Z' });
    expect(n).toBe(1);
    expect((await readRecord(db, id))!.overallLabel).toBe('NEEDS_IMPROVEMENT');
    const ops = await outbox.list();
    expect(ops.length).toBeGreaterThanOrEqual(before);
    const record = ops.filter((o) => o.entity === 'daily_record');
    // The unsynced CREATE absorbs the change or an UPDATE carries it; either way only the label travels.
    const last = record.at(-1)!;
    expect(last.fields).toMatchObject({ overallLabel: 'NEEDS_IMPROVEMENT' });
    expect(Object.keys(last.fields)).not.toContain('quality');
  });

  it('F07-AC15 (US-028) a mistake note and its visibility round-trip on the device; INTERNAL is the default', async () => {
    const { db, outbox } = await setup();
    const id = (await saveNewEntry(
      outbox,
      entry({
        portions: [
          {
            portion: sabqi(1, 3),
            attempt: attempt({
              status: 'PARTIAL',
              mistakes: [
                { category: 'TAJWEED', severity: 'MINOR', repeated: false, note: 'Synthetic staff note', noteVisibility: 'INTERNAL' },
                { category: 'LAFZI', severity: 'MAJOR', repeated: true, note: 'Synthetic shared note', noteVisibility: 'SHARED' },
                { category: 'HARKAAT', severity: 'MINOR', repeated: false },
              ],
            }),
          },
        ],
      }),
    ))!;
    const mistakes = (await readRecord(db, id))!.portions[0]!.attempts[0]!.mistakes;
    expect(mistakes).toEqual([
      { category: 'TAJWEED', severity: 'MINOR', repeated: false, note: 'Synthetic staff note', noteVisibility: 'INTERNAL' },
      { category: 'LAFZI', severity: 'MAJOR', repeated: true, note: 'Synthetic shared note', noteVisibility: 'SHARED' },
      { category: 'HARKAAT', severity: 'MINOR', repeated: false, note: null, noteVisibility: 'INTERNAL' },
    ]);
    // A note is staff text: never in an operation label (the Sync Queue).
    expect((await outbox.list()).every((o) => !String(o.label).includes('Synthetic'))).toBe(true);
  });
});

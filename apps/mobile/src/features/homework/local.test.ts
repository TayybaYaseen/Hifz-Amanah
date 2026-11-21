// F08 · Homework on the device (US-033…038; F08-AC1, AC3…AC10, AC13, AC14, AC16, AC19…AC22; F12-AC1, AC16).
// SYNTHETIC DATA ONLY.
import { describe, expect, it } from 'vitest';
import type { PushRequest } from '@hifz/contracts';
import { WORKSPACE_MIGRATIONS, runMigrations } from '../../local-db/migrations.ts';
import { openNodeDriver } from '../../local-db/testing/nodeDriver.ts';
import type { OutboxItem } from '../../sync/outbox.ts';
import { readCacheToken } from '../../sync/cacheEpoch.ts';
import { EntityRegistry } from '../../sync/registry.ts';
import { FakeClock, FakeTransport, makeEngine, makeOutbox } from '../../sync/testing/probe.ts';
import { registerAttendance } from '../attendance/local.ts';
import { addAttempt, readRecord, registerDailyEntry, saveCorrection, saveNewEntry, type AttemptWrite, type LocalRecord, type NewEntryInput, type PortionWrite } from '../daily-entry/local.ts';
import { newPortion } from '../daily-entry/form.ts';
import { formFromHomework, homeworkIssues, newEditorEntry, toHomeworkPortion } from './form.ts';
import {
  assignmentSync,
  assignmentsForStudent,
  cacheCalendar,
  carriedAttemptIds,
  confirmDraft,
  conflictOpIds,
  countsOf,
  createDraftForRecordInTx,
  defaultDueOnDevice,
  deviceState,
  displayedAssignment,
  dismissNotices,
  duePortions,
  homeworkAssignmentHandler,
  noticesFor,
  readAssignment,
  registerHomework,
  rejectDraft,
  saveDraftEdits,
  saveNewAssignment,
  storeViews,
  suggestionsFor,
  tabOf,
  ConfirmationPendingError,
  NotDraftError,
  type LocalHomeworkPortion,
} from './local.ts';

const CLASS = '0190f5c0-0000-7000-8000-00000000c1a5';
const STUDENT = '0190f5c0-0000-7000-8000-0000000000a1';
const DATE = '2026-11-14'; // a Saturday
const ACTOR = { userId: '0190f5c0-0000-7000-8000-00000000f001', name: 'Test Teacher' };

async function setup(clock = new FakeClock()) {
  const db = openNodeDriver();
  await runMigrations(db, WORKSPACE_MIGRATIONS);
  const registry = new EntityRegistry();
  registerAttendance(registry);
  registerDailyEntry(registry);
  registerHomework(registry);
  const outbox = makeOutbox(db, clock, registry);
  return { db, outbox, registry, clock };
}

const lines = (n: number) => ({ unit: 'LINES' as const, numerator: n, denominator: 1 });
const para = (n: number, d: number) => ({ unit: 'PARA' as const, numerator: n, denominator: d });
const attempt = (over: Partial<AttemptWrite> = {}): AttemptWrite => ({ status: 'COMPLETED', completed: null, quality: null, noMistakes: false, mistakes: [], remarks: null, ...over });
const sabaq: PortionWrite = { section: 'SABAQ', position: 1, isExtra: false, paraNumber: 1, range: { surahStart: 2, ayahStart: 1, surahEnd: 2, ayahEnd: 10 }, assigned: lines(10), totalLines: 10, totalLinesSource: 'MANUAL' };
const rev = (section: 'SABQI' | 'MANZIL', position: number, paraNumber: number, assigned = para(1, 1)): PortionWrite => ({ section, position, isExtra: false, paraNumber, range: null, assigned, totalLines: null, totalLinesSource: null });

/** The F08 E2E lesson: Sabaq 6 of 10 lines Partial; Sabqi Para 3 Not Remembered; Manzil 1 Completed, 2 Pending, 3 Not Assigned. */
const lesson = (over: Partial<NewEntryInput> = {}): NewEntryInput => ({
  studentId: STUDENT,
  classId: CLASS,
  reportDate: DATE,
  sessionLabel: null,
  studentName: 'Test Student One',
  className: 'Hifz A1',
  actor: ACTOR,
  attendance: null,
  portions: [
    { portion: sabaq, attempt: attempt({ status: 'PARTIAL', completed: lines(6) }) },
    { portion: rev('SABQI', 1, 3, para(3, 4)), attempt: attempt({ status: 'NOT_REMEMBERED', completed: para(0, 1) }) },
    { portion: rev('MANZIL', 1, 1), attempt: attempt({ status: 'COMPLETED', completed: para(1, 1) }) },
    { portion: rev('MANZIL', 2, 2), attempt: attempt({ status: 'PENDING' }) },
    { portion: rev('MANZIL', 3, 3), attempt: attempt({ status: 'NOT_ASSIGNED' }) },
  ],
  now: '2026-11-14T05:00:00.000Z',
  ...over,
});

async function saveWithDraft(env: Awaited<ReturnType<typeof setup>>, input = lesson()) {
  let draftId: string | null = null;
  const recordId = (await saveNewEntry(env.outbox, {
    ...input,
    afterSave: async (tx, id) => {
      draftId = await createDraftForRecordInTx(tx, env.outbox, (await readRecord(tx, id))!, { actor: ACTOR, studentName: input.studentName, dueDate: '2026-11-16' });
    },
  }))!;
  return { recordId, draftId: draftId as string | null };
}

const applyAll = (transport: FakeTransport, clock: FakeClock, extra: (op: PushRequest['ops'][number]) => object = () => ({})) => {
  transport.onPush = (req) => ({
    results: req.ops.map((op) => ({ opId: op.opId, status: 'APPLIED' as const, rowVersion: 1, entityId: op.entityId, ...extra(op) })),
    serverTime: new Date(clock.now).toISOString(),
  });
};

describe('F08 · homework drafts on the device', () => {
  it('F08-AC5, AC6, AC22 (US-035) saving a record builds ONE draft in the same transaction: Sabaq 4 of 10 lines and Sabqi Para 3, nothing else', async () => {
    const env = await setup();
    const { recordId, draftId } = await saveWithDraft(env);
    expect(draftId).not.toBeNull();
    const draft = (await readAssignment(env.db, draftId!))!;
    expect(draft.status).toBe('DRAFT');
    expect(draft.sourceDailyRecordId).toBe(recordId);
    expect(draft.assignedDate).toBe(DATE);
    const record = (await readRecord(env.db, recordId))!;
    const [s, q] = draft.portions;
    expect(draft.portions).toHaveLength(2);
    // F08-AC22: the Sabaq keeps Al-Baqarah 1–10 and Total Lines 10 and assigns the 4 remaining lines.
    expect(s).toMatchObject({ section: 'SABAQ', range: { surahStart: 2, ayahStart: 1, surahEnd: 2, ayahEnd: 10 }, totalLines: 10, assigned: lines(4), origin: 'SUGGESTED', needsReview: false });
    expect(s!.sourceAttemptId).toBe(record.portions[0]!.attempts[0]!.id);
    expect(s!.sourceLessonPortionId).toBe(record.portions[0]!.id);
    expect(s!.sourceReportDate).toBe(DATE);
    // Sabqi keeps its Para and unit; Not Remembered → the whole assignment remains.
    expect(q).toMatchObject({ section: 'SABQI', paraNumber: 3, assigned: para(3, 4), origin: 'SUGGESTED' });
    // F08-AC6: Completed, Pending, and Not Assigned are not suggested.
    expect(draft.portions.some((p) => p.section === 'MANZIL')).toBe(false);
    // The CREATE is queued in the same save and waits for the attempts and portions it is built from.
    const items = await env.outbox.list();
    const create = items.find((i) => i.entity === 'homework_assignment')!;
    expect(create.opType).toBe('CREATE');
    const attemptOps = items.filter((i) => i.entity === 'portion_attempt').map((i) => i.opId);
    expect(create.dependsOn).toEqual(expect.arrayContaining(attemptOps.slice(0, 2)));
    expect((create.fields.portions as unknown[]).length).toBe(2);
    expect(create.fields).not.toHaveProperty('status');
    expect(create.label).toBe(`Test Student One · ${DATE}`);
  });

  it('F08-AC6 (US-035) a record with nothing eligible creates no draft ("Nothing to carry forward")', async () => {
    const env = await setup();
    const { draftId } = await saveWithDraft(env, lesson({ portions: [{ portion: rev('SABQI', 1, 3), attempt: attempt({ status: 'ABSENT' }) }, { portion: rev('MANZIL', 1, 1), attempt: attempt({ completed: para(1, 1) }) }] }));
    expect(draftId).toBeNull();
    expect(await env.db.all('SELECT id FROM homework_assignments')).toEqual([]);
    expect((await env.outbox.list()).some((i) => i.entity === 'homework_assignment')).toBe(false);
  });

  it('F08-AC4 (US-034) a completed amount in another unit gives no remaining and flags the portion for review', () => {
    const record = {
      id: 'r',
      portions: [
        {
          id: 'lp', rowVersion: 1, dailyRecordId: 'r', section: 'SABQI', position: 1, isExtra: false, paraNumber: 5, range: null, assigned: para(1, 2), totalLines: null,
          totalLinesSource: null, lineCountEdition: null, removed: false, homeworkPortionId: null,
          attempts: [{ id: 'a1', rowVersion: 1, lessonPortionId: 'lp', attemptNo: 1, attemptedAt: 'x', recordedBy: null, recordedByName: null, status: 'PARTIAL', completed: lines(6), quality: null, noMistakes: false, mistakes: [], remarks: null }],
        },
      ],
    } as unknown as LocalRecord;
    const [s] = suggestionsFor(record, new Set());
    expect(s).toMatchObject({ assigned: null, needsReview: true, why: { reason: 'UNIT_MISMATCH' } });
  });

  it('F08 (US-035) an attempt already carried forward by a live draft is not suggested twice; a rejected draft frees it (F08-AC9)', async () => {
    const env = await setup();
    const { recordId, draftId } = await saveWithDraft(env);
    const record = (await readRecord(env.db, recordId))!;
    expect(suggestionsFor(record, await carriedAttemptIds(env.db))).toEqual([]);
    await rejectDraft(env.outbox, draftId!);
    expect((await readAssignment(env.db, draftId!))!.status).toBe('REJECTED');
    expect(suggestionsFor(record, await carriedAttemptIds(env.db))).toHaveLength(2);
    const reject = (await env.outbox.list()).at(-1)!;
    expect(reject).toMatchObject({ entity: 'homework_assignment', opType: 'UPDATE', fields: { status: 'REJECTED' }, baseVersion: 1 });
  });

  it('F08-AC8 (US-036) draft edits: quantity edited, a portion removed, one added, due date changed → one UPDATE; origins recorded', async () => {
    const env = await setup();
    const { draftId } = await saveWithDraft(env);
    const draft = (await readAssignment(env.db, draftId!))!;
    const [s, q] = draft.portions as [LocalHomeworkPortion, LocalHomeworkPortion];
    const edited = toHomeworkPortion({ form: { ...formFromHomework(s, 'k1', s.id), assignedLines: '3' }, base: s }, 1, null, () => env.outbox.newEntityId());
    const unchanged = toHomeworkPortion({ form: formFromHomework(q, 'k2', q.id), base: q }, 1, null, () => env.outbox.newEntityId());
    const added = toHomeworkPortion({ form: { ...newPortion('k3', 'MANZIL'), para: '4', unit: 'COMPLETE' }, base: null }, 1, null, () => env.outbox.newEntityId());
    expect(edited).toMatchObject({ origin: 'TEACHER_EDITED', assigned: lines(3), sourceAttemptId: s.sourceAttemptId });
    expect(unchanged).toEqual({ ...q, removed: false });
    expect(added).toMatchObject({ origin: 'TEACHER_ADDED', section: 'MANZIL', paraNumber: 4, assigned: para(1, 1), sourceAttemptId: null });
    const before = (await env.outbox.list()).length;
    expect(await saveDraftEdits(env.outbox, draftId!, { dueDate: '2026-11-17', portions: [edited, { ...unchanged, removed: true }, added] })).toBe(true);
    const items = await env.outbox.list();
    expect(items).toHaveLength(before + 1);
    const update = items.at(-1)!;
    expect(update.opType).toBe('UPDATE');
    expect(update.fields.dueDate).toBe('2026-11-17');
    // A removed portion is left out of the list (its row is kept on the server).
    expect((update.fields.portions as Array<{ origin: string }>).map((p) => p.origin)).toEqual(['TEACHER_EDITED', 'TEACHER_ADDED']);
    const reopened = (await readAssignment(env.db, draftId!))!;
    expect(reopened.dueDate).toBe('2026-11-17');
    expect(reopened.portions.filter((p) => !p.removed).map((p) => p.origin)).toEqual(['TEACHER_EDITED', 'TEACHER_ADDED']);
    expect(reopened.portions.find((p) => p.removed)?.id).toBe(q.id);
    // Saving the same values again queues nothing.
    expect(await saveDraftEdits(env.outbox, draftId!, { dueDate: '2026-11-17', portions: reopened.portions })).toBe(false);
  });

  it('F08-AC1, AC12 (US-033) a homework portion is checked with the F05 portion rules (Sabaq lines ≤ Total Lines; Sabqi Para required)', () => {
    const tooMany = { ...formFromHomework({ section: 'SABAQ', paraNumber: null, range: { surahStart: 2, ayahStart: 1, surahEnd: 2, ayahEnd: 10 }, totalLines: 10, assigned: lines(12) }, 'k', null) };
    expect(homeworkIssues(tooMany, 1, null).map((i) => i.messageKey)).toContain('assigned.ABOVE_TOTAL');
    const noPara = { ...newPortion('k2', 'SABQI'), unit: 'RUBU' as const };
    expect(homeworkIssues(noPara, 1, null).map((i) => i.messageKey)).toContain('para.REQUIRED');
    expect(homeworkIssues({ ...noPara, para: '3' }, 1, null)).toEqual([]);
  });

  it('F08-AC10, AC20 (US-037) confirming queues CONFIRM_HOMEWORK with the device time and the sources it saw; the row stays a draft until the server answers', async () => {
    const env = await setup();
    const { draftId } = await saveWithDraft(env);
    await confirmDraft(env.outbox, draftId!, { confirmedAt: '2026-11-14T06:00:00.000Z' });
    const items = await env.outbox.list();
    const cmd = items.at(-1)!;
    expect(cmd).toMatchObject({ entity: 'homework_assignment', opType: 'COMMAND', command: 'CONFIRM_HOMEWORK', baseVersion: 1 });
    const create = items.find((i) => i.entity === 'homework_assignment' && i.opType === 'CREATE')!;
    expect(cmd.dependsOn).toContain(create.opId);
    const sources = cmd.fields.sources as Array<{ entity: string; rowVersion: number | null }>;
    expect(sources.map((s) => s.entity).sort()).toEqual(['lesson_portion', 'lesson_portion', 'portion_attempt', 'portion_attempt']);
    // Created on this device and not synced yet: no server version.
    expect(sources.every((s) => s.rowVersion === null)).toBe(true);
    const a = (await readAssignment(env.db, draftId!))!;
    expect(a.status).toBe('DRAFT');
    const sync = assignmentSync(items, a);
    expect(sync.confirm).toBe('ON_DEVICE');
    expect(tabOf(a, sync)).toBe('CONFIRMED');
    // The server confirms; the pull brings the confirmed row with the original confirmation time.
    const transport = new FakeTransport();
    applyAll(transport, env.clock);
    await makeEngine(env.db, env.outbox, env.registry, transport, env.clock).syncNow({ ignoreBackoff: true });
    // Acknowledged, not pulled yet: still confirmed on the list, never back to a suggestion (review M1).
    expect(assignmentSync(await env.outbox.list(), (await readAssignment(env.db, draftId!))!).confirm).toBe('ACKNOWLEDGED');
    await env.db.transaction((tx) =>
      homeworkAssignmentHandler.upsertFromServer(tx, draftId!, 3, { ...{ studentId: STUDENT, classId: CLASS, sourceDailyRecordId: a.sourceDailyRecordId, assignedDate: DATE, dueDate: '2026-11-16', status: 'CONFIRMED', instructions: null, createdBy: ACTOR.userId, confirmedBy: ACTOR.userId, confirmedAt: '2026-11-14T06:00:00.000Z', revisionOf: null }, portions: a.portions.map(({ sourceReportDate: _d, why: _w, removed: _r, ...p }) => ({ ...p, lineCountEdition: p.lineCountEdition ?? null })) }),
    );
    const confirmed = (await readAssignment(env.db, draftId!))!;
    expect(confirmed).toMatchObject({ status: 'CONFIRMED', confirmedBy: ACTOR.userId, confirmedAt: '2026-11-14T06:00:00.000Z' });
    // What only the device knew (the source date) survives the pull.
    expect(confirmed.portions[0]!.sourceReportDate).toBe(DATE);
    // Confirmed homework is never edited on the device (FR-HW-012).
    await expect(saveDraftEdits(env.outbox, draftId!, { dueDate: '2026-11-20' })).rejects.toBeInstanceOf(NotDraftError);
    await expect(confirmDraft(env.outbox, draftId!, { confirmedAt: '2026-11-14T07:00:00.000Z' })).rejects.toBeInstanceOf(NotDraftError);
  });

  it('F08-AC21 (US-037) a confirmation the server turned into a conflict is "to review", never shown as confirmed', () => {
    const a = { id: '0190f5c0-0000-7000-8000-0000000000aa', rowVersion: 2, status: 'DRAFT' as const };
    const item = {
      opId: 'o', seq: 1, entity: 'homework_assignment', entityId: a.id, opType: 'COMMAND', command: 'CONFIRM_HOMEWORK', fields: {}, baseVersion: 2, dependsOn: [], label: null, createdAt: '', syncedAt: null, lastError: null, sentCount: 1,
      status: { state: 'ACTION_REQUIRED', attempts: 1, nextAttemptAt: null, failure: null, rowVersion: null, conflictId: '0190f5c0-0000-7000-8000-0000000000cc' },
    } as unknown as OutboxItem;
    const sync = assignmentSync([item], a);
    expect(sync).toMatchObject({ confirm: 'CONFLICT', conflictId: '0190f5c0-0000-7000-8000-0000000000cc', state: 'ACTION_REQUIRED' });
    expect(tabOf(a, sync)).toBe('CONFIRMED');
    // Once the conflict is settled (kept server: still a draft) it is a suggestion again.
    expect(tabOf(a, assignmentSync([{ ...item, status: { ...item.status, state: 'SYNCED' } }], a))).toBe('SUGGESTED');
  });

  it('F08-AC16 (US-038) a lesson portion recorded against a due homework portion carries the link and waits for its confirmation', async () => {
    const env = await setup();
    const id = await saveNewAssignment(env.outbox, {
      studentId: STUDENT, classId: CLASS, studentName: 'Test Student One', sourceDailyRecordId: null, assignedDate: DATE, dueDate: DATE, instructions: 'Revise twice', actor: ACTOR,
      portions: [toHomeworkPortion({ form: { ...newPortion('k', 'SABQI'), para: '4', unit: 'COMPLETE' }, base: null }, 1, null, () => env.outbox.newEntityId())],
    });
    await confirmDraft(env.outbox, id, { confirmedAt: '2026-11-14T06:00:00.000Z' });
    // Only confirmed homework is due: still a draft on the device until the server confirms.
    expect(await duePortions(env.db, STUDENT, DATE)).toEqual([]);
    await env.db.run("UPDATE homework_assignments SET status = 'CONFIRMED', row_version = 2 WHERE id = ?", [id]);
    const due = await duePortions(env.db, STUDENT, DATE);
    expect(due).toHaveLength(1);
    const hp = due[0]!.portion.id;
    const confirmOp = (await env.outbox.list()).at(-1)!.opId;
    await saveNewEntry(env.outbox, lesson({ portions: [{ portion: { ...rev('SABQI', 1, 4), homeworkPortionId: hp }, attempt: attempt({ completed: para(1, 1) }) }] }));
    const create = (await env.outbox.list()).find((i) => i.entity === 'lesson_portion')!;
    expect(create.fields.homeworkPortionId).toBe(hp);
    expect(create.dependsOn).toContain(confirmOp);
    expect(await duePortions(env.db, STUDENT, DATE)).toEqual([]);
    const a = (await readAssignment(env.db, id))!;
    const state = await deviceState(env.db, a, DATE);
    expect(state.state).toBe('ATTEMPTED');
    expect(state.progress.get(hp)).toMatchObject({ attempted: true, status: 'COMPLETED' });
  });

  it('F08-AC18, AC19 (US-036, US-038) due date and carried-over homework from the cached calendar: Saturday → Monday; Absent on the due day → carried over, never failed', async () => {
    const env = await setup();
    expect(await defaultDueOnDevice(env.db, CLASS, DATE)).toBeNull();
    await cacheCalendar(env.db, await readCacheToken(env.db, CLASS), CLASS, [{ effectiveFrom: '2026-01-01', weekdays: [1, 2, 3, 4, 5, 6] }], [], '2026-11-14T00:00:00.000Z');
    expect(await defaultDueOnDevice(env.db, CLASS, DATE)).toBe('2026-11-16');
    await cacheCalendar(env.db, await readCacheToken(env.db, CLASS), CLASS, [{ effectiveFrom: '2026-01-01', weekdays: [1, 2, 3, 4, 5, 6] }], [{ id: 'h', classId: null, date: '2026-11-16', kind: 'HOLIDAY', label: 'Test holiday' }], '2026-11-14T00:00:00.000Z');
    expect(await defaultDueOnDevice(env.db, CLASS, DATE)).toBe('2026-11-17');
    const id = await saveNewAssignment(env.outbox, {
      studentId: STUDENT, classId: CLASS, studentName: 'Test Student One', sourceDailyRecordId: null, assignedDate: DATE, dueDate: '2026-11-17', instructions: null, actor: ACTOR,
      portions: [toHomeworkPortion({ form: { ...newPortion('k', 'MANZIL'), para: '2', unit: 'COMPLETE' }, base: null }, 1, null, () => env.outbox.newEntityId())],
    });
    await env.db.run("UPDATE homework_assignments SET status = 'CONFIRMED', row_version = 2 WHERE id = ?", [id]);
    await env.db.run("INSERT INTO attendance_records (id, row_version, student_id, class_id, report_date, status) VALUES ('m1', 1, ?, ?, '2026-11-17', 'ABSENT')", [STUDENT, CLASS]);
    const a = (await readAssignment(env.db, id))!;
    const s = await deviceState(env.db, a, '2026-11-18');
    expect(s.state).toBe('CARRIED_OVER');
    expect(s.carry).toEqual({ effectiveDueDate: '2026-11-18', reason: 'ABSENT' });
    // The confirmed assignment itself is unchanged, and it is counted as confirmed + carried over, never failed.
    expect((await readAssignment(env.db, id))!.dueDate).toBe('2026-11-17');
    expect(countsOf([{ status: 'CONFIRMED', state: s.state, portions: [...s.progress.values()] }])).toMatchObject({ confirmed: 1, carriedOver: 1, completedPortions: 0 });
  });

  it('F08-AC9, AC13 (US-036, US-038) counts: rejected homework counts nowhere; a second confirmed assignment leaves the first unchanged', async () => {
    expect(countsOf([{ status: 'REJECTED', state: 'REJECTED', portions: [] }, { status: 'DRAFT', state: 'DRAFT', portions: [] }])).toMatchObject({ draft: 1, confirmed: 0 });
    const env = await setup();
    const mk = (paraNumber: string) =>
      saveNewAssignment(env.outbox, {
        studentId: STUDENT, classId: CLASS, studentName: 'S', sourceDailyRecordId: null, assignedDate: DATE, dueDate: DATE, instructions: null, actor: ACTOR,
        portions: [toHomeworkPortion({ form: { ...newPortion('k', 'MANZIL'), para: paraNumber, unit: 'COMPLETE' }, base: null }, 1, null, () => env.outbox.newEntityId())],
      });
    const first = await mk('2');
    await env.db.run("UPDATE homework_assignments SET status = 'CONFIRMED', row_version = 2 WHERE id = ?", [first]);
    const before = await readAssignment(env.db, first);
    const second = await mk('5');
    await confirmDraft(env.outbox, second, { confirmedAt: '2026-11-14T08:00:00.000Z' });
    expect(await readAssignment(env.db, first)).toEqual(before);
    expect((await assignmentsForStudent(env.db, STUDENT)).map((a) => a.id)).toEqual([second, first]);
  });

  it('F08-AC14, F05-AC4 (US-038) a correction whose result carries CONFIRMED_HOMEWORK_UNCHANGED leaves a notice on the record; dismissing it hides it', async () => {
    const env = await setup();
    const { recordId } = await saveWithDraft(env);
    const transport = new FakeTransport();
    applyAll(transport, env.clock);
    const engine = makeEngine(env.db, env.outbox, env.registry, transport, env.clock);
    await engine.syncNow({ ignoreBackoff: true });
    const record = (await readRecord(env.db, recordId))!;
    const p = record.portions[1]!;
    await saveCorrection(env.outbox, {
      recordId, reportDate: DATE, studentName: 'Test Student One', attendance: null, actor: ACTOR, now: '2026-11-14T07:00:00.000Z',
      portions: [{ id: p.id, portion: rev('SABQI', 1, 3, para(3, 4)), portionChanged: false, positionChanged: false, removed: false, attempt: attempt({ status: 'PARTIAL', completed: para(1, 4) }), latestAttemptId: p.attempts[0]!.id, outcomeChanged: true, remarksChanged: false }],
    });
    applyAll(transport, env.clock, (op) => (op.opType === 'UPDATE' && op.entity === 'portion_attempt' ? { notices: ['CONFIRMED_HOMEWORK_UNCHANGED'] } : {}));
    await engine.syncNow({ ignoreBackoff: true });
    await engine.syncNow({ ignoreBackoff: true }); // a replayed result adds nothing
    const ids = [record.id, ...record.portions.flatMap((x) => [x.id, ...x.attempts.map((a) => a.id)])];
    const notices = await noticesFor(env.db, ids);
    expect(notices.map((n) => n.notice)).toEqual(['CONFIRMED_HOMEWORK_UNCHANGED']);
    await dismissNotices(env.db, notices.map((n) => n.opId), '2026-11-14T08:00:00.000Z');
    expect(await noticesFor(env.db, ids)).toEqual([]);
  });

  it('F08 (US-038) server views are stored with names, except rows with an unsynced change (never last-write-wins)', async () => {
    const env = await setup();
    const { draftId } = await saveWithDraft(env);
    const a = (await readAssignment(env.db, draftId!))!;
    const view = {
      id: a.id, studentId: STUDENT, studentName: 'Test Student One', classId: CLASS, sourceDailyRecordId: a.sourceDailyRecordId, assignedDate: DATE, dueDate: '2026-11-20', status: 'DRAFT' as const,
      state: 'DRAFT' as const, carriedOver: null, instructions: 'server', createdBy: { userId: ACTOR.userId, displayName: 'Teacher A1' }, confirmedBy: null, confirmedAt: null, revisionOf: null,
      supersededBy: null, createdAt: '2026-11-14T05:00:00.000Z', rowVersion: 1, portions: [],
    };
    await storeViews(env.db, [view]);
    const kept = (await readAssignment(env.db, draftId!))!;
    expect(kept.dueDate).toBe('2026-11-16');
    expect(kept.portions).toHaveLength(2);
    expect(kept.createdByName).toBe('Teacher A1');
  });
});

describe('F08 · review fixes (H1, M1, M2, L1, L3)', () => {
  /** The correction of one portion's latest attempt, as Daily Entry sends it. */
  const correct = (env: Awaited<ReturnType<typeof setup>>, record: LocalRecord, index: number, portion: PortionWrite, next: AttemptWrite) =>
    saveCorrection(env.outbox, {
      recordId: record.id, reportDate: DATE, studentName: 'Test Student One', attendance: null, actor: ACTOR, now: '2026-11-14T07:00:00.000Z',
      portions: [{ id: record.portions[index]!.id, portion, portionChanged: false, positionChanged: false, removed: false, attempt: next, latestAttemptId: record.portions[index]!.attempts.at(-1)!.id, outcomeChanged: true, remarksChanged: false }],
    });
  const homeworkOps = async (env: Awaited<ReturnType<typeof setup>>) => (await env.outbox.list()).filter((i) => i.entity === 'homework_assignment');

  it('F08 H1 (US-034, FR-HW-011) a correction to Completed drops the suggested portion from the local draft, in the same transaction, with one UPDATE after the correction', async () => {
    const env = await setup();
    const { recordId, draftId } = await saveWithDraft(env);
    const record = (await readRecord(env.db, recordId))!;
    await correct(env, record, 1, rev('SABQI', 1, 3, para(3, 4)), attempt({ status: 'COMPLETED', completed: para(3, 4) }));
    const draft = (await readAssignment(env.db, draftId!))!;
    expect(draft.status).toBe('DRAFT');
    expect(draft.portions.filter((p) => !p.removed).map((p) => p.section)).toEqual(['SABAQ']);
    expect(draft.portions.find((p) => p.section === 'SABQI')?.removed).toBe(true);
    const items = await env.outbox.list();
    const update = items.at(-1)!;
    expect(update).toMatchObject({ entity: 'homework_assignment', opType: 'UPDATE' });
    expect((update.fields.portions as Array<{ section: string }>).map((p) => p.section)).toEqual(['SABAQ']);
    const attemptUpdate = items.find((i) => i.entity === 'portion_attempt' && i.opType === 'UPDATE')!;
    expect(update.dependsOn).toContain(attemptUpdate.opId);
  });

  it("F08 H1 (US-034, F08-AC22) a correction to another completed amount updates the remaining on the draft; the Teacher's added portion is kept", async () => {
    const env = await setup();
    const { recordId, draftId } = await saveWithDraft(env);
    const before = (await readAssignment(env.db, draftId!))!;
    const added = toHomeworkPortion({ form: { ...newPortion('k', 'MANZIL'), para: '7', unit: 'COMPLETE' }, base: null }, 1, null, () => env.outbox.newEntityId());
    await saveDraftEdits(env.outbox, draftId!, { portions: [...before.portions, added] });
    const record = (await readRecord(env.db, recordId))!;
    await correct(env, record, 0, sabaq, attempt({ status: 'PARTIAL', completed: lines(8) }));
    const draft = (await readAssignment(env.db, draftId!))!;
    const s = draft.portions.find((p) => p.section === 'SABAQ')!;
    expect(s).toMatchObject({ id: before.portions[0]!.id, assigned: lines(2), origin: 'SUGGESTED', why: { status: 'PARTIAL', completed: lines(8) } });
    expect(draft.portions.find((p) => p.section === 'SABQI')).toMatchObject({ assigned: para(3, 4), origin: 'SUGGESTED', removed: false });
    expect(draft.portions.find((p) => p.section === 'MANZIL')).toMatchObject({ origin: 'TEACHER_ADDED', paraNumber: 7, removed: false });
  });

  it("F08 H1 (US-034) a new attempt that completes the portion drops it from the local draft in the attempt's transaction", async () => {
    const env = await setup();
    const { recordId, draftId } = await saveWithDraft(env);
    const record = (await readRecord(env.db, recordId))!;
    await addAttempt(env.outbox, { portionId: record.portions[0]!.id, reportDate: DATE, studentName: 'Test Student One', actor: ACTOR, attempt: attempt({ status: 'COMPLETED', completed: lines(10) }), now: '2026-11-14T07:00:00.000Z' });
    const draft = (await readAssignment(env.db, draftId!))!;
    expect(draft.portions.filter((p) => !p.removed).map((p) => p.section)).toEqual(['SABQI']);
    expect((await env.outbox.list()).at(-1)).toMatchObject({ entity: 'homework_assignment', opType: 'UPDATE' });
  });

  it('F08 H1 (US-038, FR-HW-012) confirmed homework, and a draft whose confirmation is queued, are never rebuilt on the device', async () => {
    const env = await setup();
    const { recordId, draftId } = await saveWithDraft(env);
    await confirmDraft(env.outbox, draftId!, { confirmedAt: '2026-11-14T06:00:00.000Z' });
    const queued = (await readAssignment(env.db, draftId!))!;
    const opsBefore = (await homeworkOps(env)).length;
    await correct(env, (await readRecord(env.db, recordId))!, 1, rev('SABQI', 1, 3, para(3, 4)), attempt({ status: 'COMPLETED', completed: para(3, 4) }));
    expect(await readAssignment(env.db, draftId!)).toEqual(queued);
    expect(await homeworkOps(env)).toHaveLength(opsBefore);
    // Confirmed on the server and pulled: never changed by a later correction either.
    await env.db.run("UPDATE homework_assignments SET status = 'CONFIRMED', row_version = 2 WHERE id = ?", [draftId]);
    const confirmed = (await readAssignment(env.db, draftId!))!;
    await correct(env, (await readRecord(env.db, recordId))!, 0, sabaq, attempt({ status: 'PARTIAL', completed: lines(9) }));
    expect(await readAssignment(env.db, draftId!)).toEqual(confirmed);
    expect(await homeworkOps(env)).toHaveLength(opsBefore);
  });

  it('F08 H1 (F12-AC1) the correction and the draft rebuild are one transaction: a failure keeps neither', async () => {
    const env = await setup();
    const { recordId, draftId } = await saveWithDraft(env);
    const record = (await readRecord(env.db, recordId))!;
    const draftBefore = await readAssignment(env.db, draftId!);
    const queueBefore = await env.outbox.list();
    await env.db.exec("CREATE TRIGGER fail_homework BEFORE INSERT ON outbox WHEN NEW.entity = 'homework_assignment' BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;");
    await expect(correct(env, record, 1, rev('SABQI', 1, 3, para(3, 4)), attempt({ status: 'COMPLETED', completed: para(3, 4) }))).rejects.toThrow();
    expect(await readAssignment(env.db, draftId!)).toEqual(draftBefore);
    expect((await readRecord(env.db, recordId))!.portions[1]!.attempts.at(-1)).toMatchObject({ status: 'NOT_REMEMBERED' });
    expect(await env.outbox.list()).toEqual(queueBefore);
  });

  it('F08 L1 (US-037) a draft is not edited or rejected while its confirmation is queued or syncing; a refused (FAILED) one may be fixed', async () => {
    const env = await setup();
    const { draftId } = await saveWithDraft(env);
    await confirmDraft(env.outbox, draftId!, { confirmedAt: '2026-11-14T06:00:00.000Z' });
    await expect(saveDraftEdits(env.outbox, draftId!, { dueDate: '2026-11-20' })).rejects.toBeInstanceOf(ConfirmationPendingError);
    await expect(rejectDraft(env.outbox, draftId!)).rejects.toBeInstanceOf(NotDraftError);
    const cmd = (await env.outbox.list()).at(-1)!;
    await env.db.run("UPDATE outbox SET state = 'SYNCING' WHERE op_id = ?", [cmd.opId]);
    await expect(rejectDraft(env.outbox, draftId!)).rejects.toBeInstanceOf(ConfirmationPendingError);
    await expect(confirmDraft(env.outbox, draftId!, { confirmedAt: '2026-11-14T07:00:00.000Z' })).rejects.toBeInstanceOf(ConfirmationPendingError);
    expect((await readAssignment(env.db, draftId!))!.status).toBe('DRAFT');
    await env.db.run("UPDATE outbox SET state = 'FAILED', failure_code = 'VALIDATION' WHERE op_id = ?", [cmd.opId]);
    expect(await saveDraftEdits(env.outbox, draftId!, { dueDate: '2026-11-20' })).toBe(true);
  });

  it("F08 M1 (US-037, F08-AC20) between the server's acknowledgement and the pull the assignment stays confirmed; a settled conflict does not", async () => {
    const env = await setup();
    const { draftId } = await saveWithDraft(env);
    await confirmDraft(env.outbox, draftId!, { confirmedAt: '2026-11-14T06:00:00.000Z' });
    const transport = new FakeTransport();
    applyAll(transport, env.clock);
    await makeEngine(env.db, env.outbox, env.registry, transport, env.clock).syncNow({ ignoreBackoff: true });
    const a = (await readAssignment(env.db, draftId!))!;
    expect(a.status).toBe('DRAFT');
    const items = await env.outbox.list();
    const sync = assignmentSync(items, a, await conflictOpIds(env.db));
    expect(sync).toMatchObject({ confirm: 'ACKNOWLEDGED', confirmedAt: '2026-11-14T06:00:00.000Z', state: 'SYNCED' });
    expect(tabOf(a, sync)).toBe('CONFIRMED');
    const shown = displayedAssignment(a, sync, ACTOR);
    expect(shown).toMatchObject({ status: 'CONFIRMED', confirmedAt: '2026-11-14T06:00:00.000Z', confirmedBy: ACTOR.userId, confirmedByName: ACTOR.name });
    // Nothing is changed on the device meanwhile (the server has it confirmed).
    await expect(saveDraftEdits(env.outbox, draftId!, { dueDate: '2026-11-20' })).rejects.toBeInstanceOf(ConfirmationPendingError);
    // A confirmation whose result was a conflict and was then settled is not "applied": the pull decides.
    const cmd = items.find((i) => i.command === 'CONFIRM_HOMEWORK')!;
    expect(assignmentSync(items, a, new Set([cmd.opId])).confirm).toBe('NONE');
    // A newer server row than the acknowledged one decides on its own.
    expect(assignmentSync(items, { ...a, rowVersion: (cmd.status.rowVersion ?? 0) + 1 }).confirm).toBe('NONE');
  });

  it('F08 L3 (US-038) counts follow the tabs: a draft confirmed on the device counts as confirmed; one in conflict is not confirmed (F08-AC21)', () => {
    expect(countsOf([{ status: 'DRAFT', state: 'DRAFT', portions: [], confirm: 'ON_DEVICE' }])).toMatchObject({ draft: 0, confirmed: 1 });
    expect(countsOf([{ status: 'DRAFT', state: 'DRAFT', portions: [], confirm: 'ACKNOWLEDGED' }])).toMatchObject({ draft: 0, confirmed: 1 });
    expect(countsOf([{ status: 'DRAFT', state: 'DRAFT', portions: [], confirm: 'CONFLICT' }])).toMatchObject({ draft: 1, confirmed: 0 });
    expect(countsOf([{ status: 'DRAFT', state: 'DRAFT', portions: [], confirm: 'FAILED' }])).toMatchObject({ draft: 1, confirmed: 0 });
  });

  it("F08 M2 (US-033, F08-AC1) an added portion's issues carry the same key as its editor entry, so they are shown on it", () => {
    const entry = newEditorEntry('hw-1', 'SABQI');
    const issues = homeworkIssues({ ...entry.form, unit: 'RUBU' }, 1, null);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((i) => i.portionKey === entry.key)).toBe(true);
  });
});

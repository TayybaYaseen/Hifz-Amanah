// F08 · Homework and carry forward — integration against real Postgres (docs/specs/11-f08-homework-carry-forward.md;
// plan docs/handover/F08-plan.md). Seeded fixtures (e2e/fixtures/personas.ts): A1 (teacher.a1; S1, S2), A2 (teacher.a2;
// S3), B1 (teacher.b1; SB1); every class meets Monday–Saturday. Writes go through POST /sync/push; reads through
// /homework/*. Quran data is the SYNTHETIC fixture only (never real metadata): "Al-Baqarah" is synthetic Surah 2.
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { weekdayOf } from '@hifz/domain/calendar';
import { addDays } from '@hifz/domain/roster';
import { startHarness, type Harness } from '../support/harness.ts';
import {
  DEVICE,
  DEVICE_2,
  applied,
  attemptOp,
  attemptUpdateOp,
  attendanceOp,
  classDay,
  detail,
  lines,
  op,
  para,
  portionOp,
  portionUpdateOp,
  presentRecord,
  push,
  seedQuran,
  today,
  type Ids,
  type PortionInput,
  type Quantity,
  type StudentKey,
} from '../hifz/support.ts';

let h: Harness;
let ids: Ids;

type AuditRow = { action: string; actor_user_id: string | null; summary: Record<string, unknown> };
const audit = async (targetId: string) => (await h.control('GET', `/audit-target/${targetId}`)).json().items as AuditRow[];

beforeAll(async () => {
  h = await startHarness();
}, 60_000);

afterAll(async () => {
  await h?.stop();
});

beforeEach(async () => {
  await h.reset();
  ids = (await h.control('GET', '/roster/ids')).json();
  await seedQuran(h);
});

const SABAQ_2_1_10 = { surahStart: 2, ayahStart: 1, surahEnd: 2, ayahEnd: 10 };

interface Recorded {
  portionId: string;
  attemptId: string;
}

/** A lesson portion with one attempt on the record. */
async function recite(token: string, recordId: string, p: PortionInput, a: { status: string; completed?: Quantity | null }): Promise<Recorded> {
  const { id: portionId } = await applied(h, token, portionOp(recordId, p));
  const { id: attemptId } = await applied(h, token, attemptOp(portionId, a));
  return { portionId, attemptId };
}

/** Every portion and attempt of a record, with the row versions a device would have seen (FR-HW-017). */
async function sourcesOf(token: string, recordId: string) {
  const d = await detail(h, token, recordId);
  return d.portions.flatMap((p: { id: string; rowVersion: number; attempts: { id: string; rowVersion: number }[] }) => [
    { entity: 'lesson_portion', id: p.id, rowVersion: p.rowVersion },
    ...p.attempts.map((a) => ({ entity: 'portion_attempt', id: a.id, rowVersion: a.rowVersion })),
  ]);
}

const suggested = (sourceAttemptId: string, over: Record<string, unknown> = {}) => ({
  id: uuidv7(),
  section: 'SABQI',
  position: 1,
  paraNumber: null,
  range: null,
  totalLines: null,
  // Bogus on purpose: the server derives suggested quantities and never trusts the client's (AGENTS §6).
  assigned: { unit: 'PARA', numerator: 1, denominator: 1 },
  origin: 'SUGGESTED',
  sourceAttemptId,
  instructions: null,
  ...over,
});

function draftOp(student: StudentKey, fields: { assignedDate: string; dueDate?: string | null; sourceDailyRecordId?: string | null; instructions?: string | null; portions: object[] }, id = uuidv7()) {
  return op('homework_assignment', 'CREATE', id, { studentId: ids.students[student], sourceDailyRecordId: null, dueDate: null, instructions: null, ...fields }, null);
}

const confirmOp = (id: string, base: number | null, sources: object[], confirmedAt = new Date().toISOString()) =>
  op('homework_assignment', 'COMMAND', id, { confirmedAt, sources }, base, [], 'CONFIRM_HOMEWORK');

const updateOp = (id: string, base: number, fields: Record<string, unknown>) => op('homework_assignment', 'UPDATE', id, fields, base);

async function homework(token: string, id: string) {
  const res = await h.call('GET', `/homework/assignments/${id}`, token);
  expect(res.statusCode, res.body).toBe(200);
  return res.json();
}

/** S1's record with a partial Sabaq (6 of 10 lines) and a partial Sabqi Para 3 (1/2 of 3/4). */
async function partialLesson(token: string, day = classDay(h, 1)) {
  const recordId = await presentRecord(h, token, ids, 'S1', day);
  const sabaq = await recite(token, recordId, { section: 'SABAQ', range: SABAQ_2_1_10, totalLines: 10, assigned: lines(10) }, { status: 'PARTIAL', completed: lines(6) });
  const sabqi = await recite(token, recordId, { section: 'SABQI', paraNumber: 3, assigned: para(3, 4) }, { status: 'PARTIAL', completed: para(1, 2) });
  return { recordId, day, sabaq, sabqi };
}

describe('F08 · suggestions (US-034, US-035)', () => {
  it('F08-AC3/AC5/AC6/AC22 (US-034, US-035) the server suggests only eligible portions, with remaining quantities and sources', async () => {
    const teacher = await h.signIn('teacher.a1');
    const { recordId, sabaq, sabqi } = await partialLesson(teacher);
    const notRemembered = await recite(teacher, recordId, { section: 'SABQI', position: 2, paraNumber: 4, assigned: para(1, 2) }, { status: 'NOT_REMEMBERED' });
    for (const [i, status] of (['COMPLETED', 'PENDING', 'NOT_ASSIGNED', 'ABSENT'] as const).entries()) {
      await recite(teacher, recordId, { section: 'MANZIL', position: i + 1, paraNumber: i + 1, assigned: para(1) }, { status });
    }
    const res = await h.call('GET', `/homework/suggestion?dailyRecordId=${recordId}`, teacher);
    expect(res.statusCode, res.body).toBe(200);
    const s = res.json();
    expect(s.portions.map((p: { section: string; sourceAttemptId: string }) => [p.section, p.sourceAttemptId])).toEqual([
      ['SABAQ', sabaq.attemptId],
      ['SABQI', sabqi.attemptId],
      ['SABQI', notRemembered.attemptId],
    ]);
    expect(s.portions[0]).toMatchObject({ range: SABAQ_2_1_10, totalLines: 10, assigned: lines(4), needsReview: false, sourceLessonPortionId: sabaq.portionId });
    expect(s.portions[1]).toMatchObject({ paraNumber: 3, assigned: para(1, 4), why: { status: 'PARTIAL', assigned: para(3, 4), completed: para(1, 2) } });
    expect(s.portions[2]).toMatchObject({ paraNumber: 4, assigned: para(1, 2) });
    expect(s.defaultDueDate).not.toBeNull();
  });

  it('F08-AC22 (US-035) a suggested portion is re-derived by the server and linked to its source; ineligible sources are refused', async () => {
    const teacher = await h.signIn('teacher.a1');
    const { recordId, day, sabaq, sabqi } = await partialLesson(teacher);
    const completed = await recite(teacher, recordId, { section: 'MANZIL', paraNumber: 1, assigned: para(1) }, { status: 'COMPLETED' });
    const absent = await recite(teacher, recordId, { section: 'MANZIL', position: 2, paraNumber: 2, assigned: para(1) }, { status: 'ABSENT' });
    const [bad] = await push(h, teacher, [
      draftOp('S1', { assignedDate: day, sourceDailyRecordId: recordId, portions: [suggested(completed.attemptId, { section: 'MANZIL' }), suggested(absent.attemptId, { section: 'MANZIL', position: 2 })] }),
    ]);
    expect(bad).toMatchObject({ status: 'REJECTED', fields: { 'portions.0.sourceAttemptId': 'NOT_ELIGIBLE', 'portions.1.sourceAttemptId': 'NOT_ELIGIBLE' } });

    const { id } = await applied(h, teacher, draftOp('S1', { assignedDate: day, sourceDailyRecordId: recordId, portions: [suggested(sabaq.attemptId, { section: 'SABAQ' }), suggested(sabqi.attemptId)] }));
    const hw = await homework(teacher, id);
    expect(hw).toMatchObject({ status: 'DRAFT', state: 'DRAFT', confirmedBy: null, confirmedAt: null });
    expect(hw.portions[0]).toMatchObject({ section: 'SABAQ', range: SABAQ_2_1_10, totalLines: 10, assigned: lines(4), origin: 'SUGGESTED', sourceAttemptId: sabaq.attemptId, sourceLessonPortionId: sabaq.portionId, paraNumber: 1 });
    expect(hw.portions[1]).toMatchObject({ section: 'SABQI', paraNumber: 3, assigned: para(1, 4), source: { attemptId: sabqi.attemptId, status: 'PARTIAL', reportDate: day } });
    // The same source is not carried forward twice while this draft is live.
    const [again] = await push(h, teacher, [draftOp('S1', { assignedDate: day, portions: [suggested(sabqi.attemptId)] })]);
    expect(again).toMatchObject({ status: 'REJECTED', fields: { 'portions.0.sourceAttemptId': 'ALREADY_ASSIGNED' } });
    expect((await audit(id)).map((a) => a.action)).toEqual(['HOMEWORK_DRAFT_CREATED']);
  });

  it('F08-AC4 (US-034) mismatched units give no remaining and a review flag; confirmation needs the Teacher\'s quantity (F08-AC12)', async () => {
    const teacher = await h.signIn('teacher.a1');
    const day = classDay(h, 1);
    const recordId = await presentRecord(h, teacher, ids, 'S1', day);
    const { id: portionId } = await applied(h, teacher, portionOp(recordId, { section: 'SABQI', paraNumber: 3, assigned: para(1, 2) }));
    const legacy = await h.control('POST', '/hifz/legacy-attempt', { lessonPortionId: portionId, status: 'PARTIAL', completed: lines(6) });
    const attemptId = legacy.json().id as string;
    const s = (await h.call('GET', `/homework/suggestion?dailyRecordId=${recordId}`, teacher)).json();
    expect(s.portions).toEqual([expect.objectContaining({ assigned: null, needsReview: true, why: expect.objectContaining({ reason: 'UNIT_MISMATCH' }) })]);

    const portion = suggested(attemptId);
    const { id, rowVersion } = await applied(h, teacher, draftOp('S1', { assignedDate: day, portions: [portion] }));
    expect((await homework(teacher, id)).portions[0]).toMatchObject({ assigned: null, needsReview: true });
    const [refused] = await push(h, teacher, [confirmOp(id, rowVersion, await sourcesOf(teacher, recordId))]);
    expect(refused).toMatchObject({ status: 'REJECTED', code: 'VALIDATION', fields: { [`portions.${portion.id}.assigned`]: 'REQUIRED' } });
    expect((await homework(teacher, id)).status).toBe('DRAFT');
    // The Teacher sets the quantity (TEACHER_EDITED) and confirms.
    const edited = await applied(h, teacher, updateOp(id, rowVersion, { portions: [{ ...portion, origin: 'TEACHER_EDITED', paraNumber: 3, assigned: para(1, 4) }] }));
    const ok = await applied(h, teacher, confirmOp(id, edited.rowVersion, await sourcesOf(teacher, recordId)));
    expect((await homework(teacher, ok.id)).portions[0]).toMatchObject({ origin: 'TEACHER_EDITED', assigned: para(1, 4), needsReview: false });
  });
});

describe('F08 · drafts (US-033, US-036)', () => {
  it('F08-AC1/AC2 (US-033) an assignment stores its portions, dates, status, creator, and instructions', async () => {
    const teacher = await h.signIn('teacher.a1');
    const day = classDay(h, 1);
    const due = addDays(day, 2);
    const added = (o: Record<string, unknown>) => ({ id: uuidv7(), paraNumber: null, range: null, totalLines: null, origin: 'TEACHER_ADDED', sourceAttemptId: null, instructions: null, ...o });
    const { id } = await applied(
      h,
      teacher,
      draftOp('S1', {
        assignedDate: day,
        dueDate: due,
        instructions: '  Revise before Fajr  ',
        portions: [
          added({ section: 'SABAQ', position: 1, range: SABAQ_2_1_10, totalLines: 10, assigned: lines(10), instructions: 'Listen twice' }),
          added({ section: 'SABQI', position: 1, paraNumber: 3, assigned: para(1, 4) }),
          added({ section: 'SABQI', position: 2, paraNumber: 4, assigned: para(1) }),
        ],
      }),
    );
    const hw = await homework(teacher, id);
    expect(hw).toMatchObject({ assignedDate: day, dueDate: due, status: 'DRAFT', instructions: 'Revise before Fajr', createdBy: { userId: await h.userId('teacher.a1') }, studentId: ids.students.S1, classId: ids.classes.A1 });
    expect(hw.portions.map((p: { section: string; paraNumber: number; assigned: Quantity; range: unknown; totalLines: number | null; instructions: string | null }) => [p.section, p.paraNumber, p.assigned, p.range, p.totalLines, p.instructions])).toEqual([
      ['SABAQ', 1, lines(10), SABAQ_2_1_10, 10, 'Listen twice'],
      ['SABQI', 3, para(1, 4), null, null, null],
      ['SABQI', 4, para(1), null, null, null],
    ]);
    // A Para preset on Sabaq and a due date before the assigned date are refused.
    const [bad] = await push(h, teacher, [draftOp('S1', { assignedDate: day, dueDate: addDays(day, -1), portions: [added({ section: 'SABAQ', position: 1, range: SABAQ_2_1_10, totalLines: 10, assigned: para(1, 2) })] })]);
    expect(bad).toMatchObject({ status: 'REJECTED', fields: { dueDate: 'DUE_BEFORE_ASSIGNED', 'portions.0.unit': 'UNIT_NOT_ALLOWED' } });
  });

  it('F08-AC8 (US-036) draft edits are kept and each portion records its origin; removed portions keep their row', async () => {
    const teacher = await h.signIn('teacher.a1');
    const { recordId, day, sabaq, sabqi } = await partialLesson(teacher);
    const sabaqP = suggested(sabaq.attemptId, { section: 'SABAQ' });
    const sabqiP = suggested(sabqi.attemptId);
    const { id, rowVersion } = await applied(h, teacher, draftOp('S1', { assignedDate: day, sourceDailyRecordId: recordId, portions: [sabaqP, sabqiP] }));
    const manzil = { id: uuidv7(), section: 'MANZIL', position: 1, paraNumber: 4, range: null, totalLines: null, assigned: para(1, 2), origin: 'TEACHER_ADDED', sourceAttemptId: null, instructions: null };
    const newDue = addDays(day, 3);
    await applied(h, teacher, updateOp(id, rowVersion, { dueDate: newDue, portions: [{ ...sabqiP, origin: 'TEACHER_EDITED', paraNumber: 3, assigned: para(1, 2) }, manzil] }));
    const hw = await homework(teacher, id);
    expect(hw.dueDate).toBe(newDue);
    expect(hw.portions.map((p: { id: string; origin: string; removed: boolean }) => [p.id, p.origin, p.removed])).toEqual([
      [sabqiP.id, 'TEACHER_EDITED', false],
      [manzil.id, 'TEACHER_ADDED', false],
      [sabaqP.id, 'SUGGESTED', true],
    ]);
    expect(hw.portions[0].assigned).toEqual(para(1, 2));
    expect((await audit(id)).map((a) => a.action)).toEqual(['HOMEWORK_DRAFT_CREATED', 'HOMEWORK_DRAFT_UPDATED']);
  });

  it('F08-AC9 (US-036) a rejected draft is not counted as homework and cannot be confirmed', async () => {
    const teacher = await h.signIn('teacher.a1');
    const { recordId, day, sabqi } = await partialLesson(teacher);
    const { id, rowVersion } = await applied(h, teacher, draftOp('S1', { assignedDate: day, portions: [suggested(sabqi.attemptId)] }));
    const before = (await h.call('GET', `/homework/assignments?studentId=${ids.students.S1}`, teacher)).json();
    expect(before.counts).toMatchObject({ draft: 1, confirmed: 0 });
    const rejected = await applied(h, teacher, updateOp(id, rowVersion, { status: 'REJECTED' }));
    const after = (await h.call('GET', `/homework/assignments?studentId=${ids.students.S1}`, teacher)).json();
    expect(after.items.map((a: { id: string; status: string }) => [a.id, a.status])).toEqual([[id, 'REJECTED']]);
    expect(after.counts).toEqual({ draft: 0, confirmed: 0, attemptedPortions: 0, completedPortions: 0, carriedOver: 0 });
    const [confirm] = await push(h, teacher, [confirmOp(id, rejected.rowVersion, await sourcesOf(teacher, recordId))]);
    expect(confirm).toMatchObject({ status: 'REJECTED', fields: { status: 'NOT_DRAFT' } });
    expect((await audit(id)).map((a) => a.action)).toEqual(['HOMEWORK_DRAFT_CREATED', 'HOMEWORK_REJECTED']);
    // The source is free again once the draft is rejected.
    await applied(h, teacher, draftOp('S1', { assignedDate: day, portions: [suggested(sabqi.attemptId)] }));
  });

  it('F08-AC18 (US-036) the due date defaults to the next scheduled class day, skipping a holiday', async () => {
    const teacher = await h.signIn('teacher.a1');
    const admin = await h.signIn('admin.a');
    let saturday = addDays(today(h), -2);
    while (weekdayOf(saturday) !== 6) saturday = addDays(saturday, -1);
    const monday = addDays(saturday, 2);
    const added = { id: uuidv7(), section: 'SABQI', position: 1, paraNumber: 3, range: null, totalLines: null, assigned: para(1, 4), origin: 'TEACHER_ADDED', sourceAttemptId: null, instructions: null };
    const { id } = await applied(h, teacher, draftOp('S1', { assignedDate: saturday, portions: [added] }));
    expect((await homework(teacher, id)).dueDate).toBe(monday);
    const holiday = await h.call('POST', '/calendar/exceptions', admin, { date: monday, kind: 'HOLIDAY', label: 'Synthetic holiday', confirm: true });
    expect(holiday.statusCode, holiday.body).toBe(201);
    const { id: second } = await applied(h, teacher, draftOp('S1', { assignedDate: saturday, portions: [{ ...added, id: uuidv7() }] }));
    expect((await homework(teacher, second)).dueDate).toBe(addDays(monday, 1));
    // The suggestion endpoint gives the same default from today.
    const { recordId } = await partialLesson(teacher, classDay(h, 0));
    expect((await h.call('GET', `/homework/suggestion?dailyRecordId=${recordId}`, teacher)).json().defaultDueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('F08 · confirmation (US-037)', () => {
  it('F08-AC10/AC20 (US-037) confirming stores the Teacher and the device confirmation time, and is audited', async () => {
    const teacher = await h.signIn('teacher.a1');
    const { recordId, day, sabqi } = await partialLesson(teacher);
    const { id, rowVersion } = await applied(h, teacher, draftOp('S1', { assignedDate: day, portions: [suggested(sabqi.attemptId)] }));
    const confirmedAt = new Date(Date.now() - 10 * 60_000).toISOString();
    const res = await applied(h, teacher, confirmOp(id, rowVersion, await sourcesOf(teacher, recordId), confirmedAt));
    expect(res.rowVersion).toBe(rowVersion + 1);
    const hw = await homework(teacher, id);
    expect(hw).toMatchObject({ status: 'CONFIRMED', confirmedBy: { userId: await h.userId('teacher.a1') }, confirmedAt });
    expect(hw.state).not.toBe('DRAFT');
    const entries = await audit(id);
    expect(entries.map((a) => a.action)).toEqual(['HOMEWORK_DRAFT_CREATED', 'HOMEWORK_CONFIRMED']);
    expect(entries[1]!.summary).toMatchObject({ status: 'CONFIRMED', confirmedAt });
  });

  it('F08-AC11 (US-037) a draft is never confirmed automatically', async () => {
    const teacher = await h.signIn('teacher.a1');
    const { day, sabqi } = await partialLesson(teacher);
    const { id } = await applied(h, teacher, draftOp('S1', { assignedDate: day, portions: [suggested(sabqi.attemptId)] }));
    h.clock.advance(14 * 24 * 60 * 60 * 1000);
    // Past the due date and several class days later (a new session: the old one expired meanwhile).
    expect(await homework(await h.signIn('teacher.a1'), id)).toMatchObject({ status: 'DRAFT', state: 'DRAFT', confirmedBy: null });
  });

  it('F08-AC12 (US-037) a confirmation that fails partway confirms nothing', async () => {
    const teacher = await h.signIn('teacher.a1');
    const { recordId, day, sabqi } = await partialLesson(teacher);
    const { id, rowVersion } = await applied(h, teacher, draftOp('S1', { assignedDate: day, portions: [suggested(sabqi.attemptId)] }));
    await h.control('POST', '/audit/fail-next');
    const res = await h.call('POST', '/sync/push', teacher, { protocolVersion: 1, deviceId: DEVICE, ops: [confirmOp(id, rowVersion, await sourcesOf(teacher, recordId))] });
    expect(res.statusCode).toBe(500);
    const hw = await homework(teacher, id);
    expect(hw).toMatchObject({ status: 'DRAFT', confirmedBy: null, confirmedAt: null, rowVersion });
    expect((await audit(id)).map((a) => a.action)).toEqual(['HOMEWORK_DRAFT_CREATED']);
  });

  it('F08-AC21 (US-037) an offline confirmation whose source changed on the server becomes a conflict, not a confirmation', async () => {
    const teacher = await h.signIn('teacher.a1');
    const admin = await h.signIn('admin.a');
    const { recordId, day, sabqi } = await partialLesson(teacher);
    const { id, rowVersion } = await applied(h, teacher, draftOp('S1', { assignedDate: day, portions: [suggested(sabqi.attemptId)] }));
    const sources = await sourcesOf(teacher, recordId);
    // Meanwhile an Admin corrects the source attempt: the draft is rebuilt on the server.
    const attempt = (await detail(h, admin, recordId)).portions[1].attempts[0];
    const fix = await applied(h, admin, attemptUpdateOp(sabqi.attemptId, attempt.rowVersion, { status: 'PARTIAL', completed: para(1, 4), quality: null, noMistakes: false, mistakes: [] }), DEVICE_2);
    expect(fix.rowVersion).toBe(attempt.rowVersion + 1);
    expect((await homework(teacher, id)).portions[0].assigned).toEqual(para(1, 2));

    const [conflict] = await push(h, teacher, [confirmOp(id, rowVersion, sources)]);
    expect(conflict).toMatchObject({ status: 'CONFLICT' });
    expect(await homework(teacher, id)).toMatchObject({ status: 'DRAFT', confirmedBy: null });
    // Resolution "keep this device" is the Teacher's explicit confirmation of the rebuilt draft, audited.
    const resolved = await h.call('POST', `/sync/conflicts/${conflict!.conflictId}/resolve`, teacher, { choice: 'KEEP_DEVICE' });
    expect(resolved.statusCode, resolved.body).toBe(200);
    expect(await homework(teacher, id)).toMatchObject({ status: 'CONFIRMED', confirmedBy: { userId: await h.userId('teacher.a1') } });
    const actions = (await audit(id)).map((a) => a.action);
    expect(actions).toEqual(['HOMEWORK_DRAFT_CREATED', 'HOMEWORK_DRAFT_RECALCULATED', 'HOMEWORK_CONFIRMED']);
  });

  it('F08 (US-037) the device\'s own earlier correction is not a conflict; a draft and its confirmation can sync together', async () => {
    const teacher = await h.signIn('teacher.a1');
    const { recordId, day, sabqi } = await partialLesson(teacher);
    const sources = await sourcesOf(teacher, recordId);
    const draftId = uuidv7();
    const create = draftOp('S1', { assignedDate: day, portions: [suggested(sabqi.attemptId)] }, draftId);
    const attempt = (await detail(h, teacher, recordId)).portions[1].attempts[0];
    const own = attemptUpdateOp(sabqi.attemptId, attempt.rowVersion, { status: 'PARTIAL', completed: para(1, 4), quality: null, noMistakes: false, mistakes: [] });
    const confirm = { ...confirmOp(draftId, null, sources), dependsOn: [create.opId] };
    const results = await push(h, teacher, [create, own, confirm]);
    expect(results.map((r) => r.status)).toEqual(['APPLIED', 'APPLIED', 'APPLIED']);
    expect(await homework(teacher, draftId)).toMatchObject({ status: 'CONFIRMED' });
    expect((await homework(teacher, draftId)).portions[0].assigned).toEqual(para(1, 2));
  });
});

describe('F08 · history and revision (US-038)', () => {
  async function confirmedHomework(teacher: string) {
    const lesson = await partialLesson(teacher);
    const portion = suggested(lesson.sabqi.attemptId);
    const { id, rowVersion } = await applied(h, teacher, draftOp('S1', { assignedDate: lesson.day, sourceDailyRecordId: lesson.recordId, portions: [portion] }));
    await applied(h, teacher, confirmOp(id, rowVersion, await sourcesOf(teacher, lesson.recordId)));
    return { ...lesson, id, portionId: portion.id };
  }

  const rowOf = (id: string) => h.db.selectFrom('homework_assignments').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
  const portionsOf = (id: string) => h.db.selectFrom('homework_portions').selectAll().where('assignment_id', '=', id).orderBy('id').execute();

  it('F08-AC13 (US-038) a new assignment keeps the earlier one unchanged', async () => {
    const teacher = await h.signIn('teacher.a1');
    const first = await confirmedHomework(teacher);
    const [row, portions] = [await rowOf(first.id), await portionsOf(first.id)];
    const added = { id: uuidv7(), section: 'MANZIL', position: 1, paraNumber: 5, range: null, totalLines: null, assigned: para(1), origin: 'TEACHER_ADDED', sourceAttemptId: null, instructions: null };
    const second = await applied(h, teacher, draftOp('S1', { assignedDate: classDay(h, 0), portions: [added] }));
    await applied(h, teacher, confirmOp(second.id, second.rowVersion, []));
    expect(await rowOf(first.id)).toEqual(row);
    expect(await portionsOf(first.id)).toEqual(portions);
  });

  it('F08-AC14 (US-038) correcting a source attempt rebuilds drafts only, with the notice', async () => {
    const teacher = await h.signIn('teacher.a1');
    const confirmed = await confirmedHomework(teacher);
    const confirmedRow = await rowOf(confirmed.id);
    // A draft from the Sabaq of the same record.
    const sabaqP = suggested(confirmed.sabaq.attemptId, { section: 'SABAQ' });
    const draft = await applied(h, teacher, draftOp('S1', { assignedDate: confirmed.day, sourceDailyRecordId: confirmed.recordId, portions: [sabaqP] }));
    expect((await homework(teacher, draft.id)).portions[0].assigned).toEqual(lines(4));

    const d = await detail(h, teacher, confirmed.recordId);
    const sabaqAttempt = d.portions.find((p: { section: string }) => p.section === 'SABAQ').attempts[0];
    const [fixSabaq] = await push(h, teacher, [attemptUpdateOp(confirmed.sabaq.attemptId, sabaqAttempt.rowVersion, { status: 'PARTIAL', completed: lines(8), quality: null, noMistakes: false, mistakes: [] })]);
    expect(fixSabaq).toMatchObject({ status: 'APPLIED' });
    expect(fixSabaq!.notices).toBeUndefined();
    const rebuilt = await homework(teacher, draft.id);
    expect(rebuilt).toMatchObject({ status: 'DRAFT', rowVersion: draft.rowVersion + 1 });
    expect(rebuilt.portions[0]).toMatchObject({ id: sabaqP.id, assigned: lines(2), origin: 'SUGGESTED' });

    const sabqiAttempt = d.portions.find((p: { section: string }) => p.section === 'SABQI').attempts[0];
    const [fixSabqi] = await push(h, teacher, [attemptUpdateOp(confirmed.sabqi.attemptId, sabqiAttempt.rowVersion, { status: 'COMPLETED', completed: para(3, 4), quality: 2, noMistakes: true, mistakes: [] })]);
    expect(fixSabqi).toMatchObject({ status: 'APPLIED', notices: ['CONFIRMED_HOMEWORK_UNCHANGED'] });
    expect(await rowOf(confirmed.id)).toEqual(confirmedRow);
    expect((await homework(teacher, confirmed.id)).portions[0].assigned).toEqual(para(1, 4));

    // A correction that makes the Sabaq complete removes its suggestion from the draft (row kept).
    const [complete] = await push(h, teacher, [attemptUpdateOp(confirmed.sabaq.attemptId, sabaqAttempt.rowVersion + 1, { status: 'COMPLETED', completed: lines(10), quality: null, noMistakes: false, mistakes: [] })]);
    expect(complete!.status).toBe('APPLIED');
    expect((await homework(teacher, draft.id)).portions.map((p: { removed: boolean }) => p.removed)).toEqual([true]);
    // A lesson portion correction (assigned quantity) also reports the confirmed homework as unchanged.
    const sabqiPortion = d.portions.find((p: { section: string }) => p.section === 'SABQI');
    const [portionFix] = await push(h, teacher, [portionUpdateOp(sabqiPortion.id, sabqiPortion.rowVersion, { paraNumber: 3, range: null, totalLines: null, totalLinesSource: null, assigned: para(1) })]);
    expect(portionFix).toMatchObject({ status: 'APPLIED', notices: ['CONFIRMED_HOMEWORK_UNCHANGED'] });
  });

  it('F08-AC15 (US-038) an Admin revision creates a linked confirmed assignment and supersedes the old one', async () => {
    const teacher = await h.signIn('teacher.a1');
    const admin = await h.signIn('admin.a');
    const old = await confirmedHomework(teacher);
    const before = await rowOf(old.id);
    const newId = uuidv7();
    const body = {
      id: newId,
      dueDate: addDays(old.day, 4),
      instructions: 'Revised by the Admin',
      portions: [{ id: uuidv7(), section: 'SABQI', position: 1, paraNumber: 3, range: null, totalLines: null, assigned: para(1, 2), instructions: null, revisesPortionId: old.portionId }],
    };
    const res = await h.call('POST', `/homework/assignments/${old.id}/revise`, admin, body);
    expect(res.statusCode, res.body).toBe(200);
    const { created, superseded } = res.json();
    expect(created).toMatchObject({ id: newId, status: 'CONFIRMED', revisionOf: old.id, confirmedBy: { userId: await h.userId('admin.a') }, instructions: 'Revised by the Admin' });
    expect(created.portions[0]).toMatchObject({ origin: 'TEACHER_EDITED', sourceHomeworkPortionId: old.portionId, sourceAttemptId: old.sabqi.attemptId, assigned: para(1, 2) });
    expect(superseded).toMatchObject({ id: old.id, status: 'SUPERSEDED', supersededBy: newId, state: 'SUPERSEDED' });
    const after = await rowOf(old.id);
    expect({ ...after, status: before.status, superseded_at: null, superseded_by_user: null, updated_at: before.updated_at, updated_by: before.updated_by, row_version: before.row_version }).toEqual(before);
    expect((await audit(newId)).map((a) => a.action)).toEqual(['HOMEWORK_REVISED']);
    expect((await audit(old.id)).map((a) => a.action)).toContain('HOMEWORK_SUPERSEDED');
    // A retry returns the same result; a second revision of the superseded one is refused.
    expect((await h.call('POST', `/homework/assignments/${old.id}/revise`, admin, body)).json().created.id).toBe(newId);
    const again = await h.call('POST', `/homework/assignments/${old.id}/revise`, admin, { ...body, id: uuidv7() });
    expect(again.statusCode).toBe(400);
    expect(again.json().error.fields).toMatchObject({ status: 'NOT_CONFIRMED' });
  });

  it('F08-AC16 (US-038) a next-class lesson portion links to its homework portion', async () => {
    const teacher = await h.signIn('teacher.a1');
    const hw = await confirmedHomework(teacher);
    const nextDay = classDay(h, 0);
    const recordId = await presentRecord(h, teacher, ids, 'S1', nextDay === hw.day ? today(h) : nextDay);
    const lp = portionOp(recordId, { section: 'SABQI', paraNumber: 3, assigned: para(1, 4) });
    (lp.fields as Record<string, unknown>).homeworkPortionId = hw.portionId;
    const { id: portionId } = await applied(h, teacher, lp);
    const { id: attemptId } = await applied(h, teacher, attemptOp(portionId, { status: 'COMPLETED' }));
    const record = await detail(h, teacher, recordId);
    expect(record.portions[0]).toMatchObject({ id: portionId, homeworkPortionId: hw.portionId });
    expect(record.portions[0].attempts[0].id).toBe(attemptId);
    const view = await homework(teacher, hw.id);
    expect(view.portions[0].progress).toEqual({ attempted: true, status: 'COMPLETED', lessonPortionIds: [portionId] });
    expect(view.state).toBe('ATTEMPTED');
    // Only this student's confirmed homework, in the same section, can be linked.
    const wrongSection = portionOp(recordId, { section: 'MANZIL', position: 1, paraNumber: 3, assigned: para(1, 4) });
    (wrongSection.fields as Record<string, unknown>).homeworkPortionId = hw.portionId;
    const s2Record = await presentRecord(h, teacher, ids, 'S2', record.record.reportDate);
    const otherStudent = portionOp(s2Record, { section: 'SABQI', paraNumber: 3, assigned: para(1, 4) });
    (otherStudent.fields as Record<string, unknown>).homeworkPortionId = hw.portionId;
    const results = await push(h, teacher, [wrongSection, otherStudent]);
    expect(results.map((r) => r.fields?.homeworkPortionId)).toEqual(['HOMEWORK_PORTION_MISMATCH', 'HOMEWORK_PORTION_MISMATCH']);
  });

  it('F08-AC17 (US-038) a Teacher cannot revise confirmed homework', async () => {
    const teacher = await h.signIn('teacher.a1');
    const hw = await confirmedHomework(teacher);
    const res = await h.call('POST', `/homework/assignments/${hw.id}/revise`, teacher, { id: uuidv7(), dueDate: hw.day, portions: [] });
    expect(res.statusCode).toBe(403);
    // Nor edit it through sync: confirmed homework is not a draft.
    const view = await homework(teacher, hw.id);
    const [edit] = await push(h, teacher, [updateOp(hw.id, view.rowVersion, { instructions: 'changed' })]);
    expect(edit).toMatchObject({ status: 'REJECTED', fields: { status: 'NOT_DRAFT' } });
  });

  it('F08-AC19 (US-038) homework missed through absence carries over unchanged and is never failed', async () => {
    const teacher = await h.signIn('teacher.a1');
    const assigned = classDay(h, 6);
    let due = addDays(assigned, 1);
    while (weekdayOf(due) === 7) due = addDays(due, 1);
    const added = { id: uuidv7(), section: 'SABQI', position: 1, paraNumber: 3, range: null, totalLines: null, assigned: para(1, 4), origin: 'TEACHER_ADDED', sourceAttemptId: null, instructions: null };
    const { id, rowVersion } = await applied(h, teacher, draftOp('S1', { assignedDate: assigned, dueDate: due, portions: [added] }));
    await applied(h, teacher, confirmOp(id, rowVersion, []));
    const before = await rowOf(id);
    await applied(h, teacher, attendanceOp(ids, 'S1', due, 'ABSENT'));
    const view = await homework(teacher, id);
    let next = addDays(due, 1);
    while (weekdayOf(next) === 7) next = addDays(next, 1);
    expect(view).toMatchObject({ status: 'CONFIRMED', state: 'CARRIED_OVER', carriedOver: { reason: 'ABSENT', effectiveDueDate: next } });
    expect(await rowOf(id)).toEqual(before);
    const list = (await h.call('GET', `/homework/assignments?studentId=${ids.students.S1}`, teacher)).json();
    expect(list.counts).toMatchObject({ confirmed: 1, carriedOver: 1, completedPortions: 0 });
  });
});

describe('F08 · security and integrity', () => {
  it('F08 (US-037) homework is staff-only and scoped to the Teacher\'s classes; another madrasa sees nothing', async () => {
    const teacher = await h.signIn('teacher.a1');
    const { recordId, day, sabqi } = await partialLesson(teacher);
    const { id, rowVersion } = await applied(h, teacher, draftOp('S1', { assignedDate: day, portions: [suggested(sabqi.attemptId)] }));
    const other = await h.signIn('teacher.a2');
    expect((await h.call('GET', `/homework/assignments/${id}`, other)).statusCode).toBe(404);
    expect((await h.call('GET', `/homework/suggestion?dailyRecordId=${recordId}`, other)).statusCode).toBe(404);
    expect((await h.call('GET', `/homework/assignments?studentId=${ids.students.S1}`, other)).statusCode).toBe(404);
    const [confirm] = await push(h, other, [confirmOp(id, rowVersion, [])]);
    expect(confirm).toMatchObject({ status: 'REJECTED', code: 'NOT_FOUND' });
    const [create] = await push(h, other, [draftOp('S1', { assignedDate: day, portions: [] })]);
    expect(create).toMatchObject({ status: 'REJECTED', code: 'NOT_FOUND' });
    const foreign = await h.signIn('teacher.b1');
    expect((await h.call('GET', `/homework/assignments/${id}`, foreign)).statusCode).toBe(404);
    const student = await h.signIn('student.s1');
    expect((await h.call('GET', `/homework/assignments?studentId=${ids.students.S1}`, student)).statusCode).toBe(403);
    const parent = await h.signIn('parent.p1');
    expect((await h.call('GET', `/homework/assignments/${id}`, parent)).statusCode).toBe(403);
  });

  it('F08 (US-038) the database refuses any change to confirmed homework and any delete', async () => {
    const teacher = await h.signIn('teacher.a1');
    const { recordId, day, sabqi } = await partialLesson(teacher);
    const portion = suggested(sabqi.attemptId);
    const { id, rowVersion } = await applied(h, teacher, draftOp('S1', { assignedDate: day, portions: [portion] }));
    await applied(h, teacher, confirmOp(id, rowVersion, await sourcesOf(teacher, recordId)));
    await expect(h.db.updateTable('homework_assignments').set({ instructions: 'changed' }).where('id', '=', id).execute()).rejects.toThrow(/never|only/);
    await expect(h.db.updateTable('homework_portions').set({ assigned_num: 3 }).where('id', '=', portion.id).execute()).rejects.toThrow(/never changed/);
    await expect(h.db.deleteFrom('homework_assignments').where('id', '=', id).execute()).rejects.toThrow();
  });

  it('F08 (US-033) instructions are staff text: never in logs or audit values', async () => {
    const teacher = await h.signIn('teacher.a1');
    const secret = 'Synthetic-instruction-7f3a';
    const day = classDay(h, 1);
    const added = { id: uuidv7(), section: 'SABQI', position: 1, paraNumber: 3, range: null, totalLines: null, assigned: para(1, 4), origin: 'TEACHER_ADDED', sourceAttemptId: null, instructions: secret };
    const { id } = await applied(h, teacher, draftOp('S1', { assignedDate: day, instructions: secret, portions: [added] }));
    expect(JSON.stringify(await audit(id))).not.toContain(secret);
    const found = (await h.control('POST', '/search', { text: secret })).json();
    expect(found.logs).toBe(0);
  });
});

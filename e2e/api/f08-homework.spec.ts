// F08 · Homework and carry forward — API E2E (docs/specs/11-f08-homework-carry-forward.md; plan docs/handover/F08-plan.md)
// Screen journeys: e2e/mobile/f08-homework/.
// Seeded fixtures: A1 (teacher.a1; S1, S2), A2 (teacher.a2; S3); every class meets Monday–Saturday.
// Drafts, edits, rejection, and confirmation are `homework_assignment` operations through POST /sync/push (the app's one
// path, online and offline); reads are GET /homework/*; revision is POST /homework/assignments/:id/revise (Owner/Admin).
// Quran data is the SYNTHETIC test fixture (control.seedSyntheticQuran), never real metadata: "Al-Baqarah" below is
// synthetic Surah 2.
import { randomBytes } from 'node:crypto';
import type { APIRequestContext } from '@playwright/test';
import { expect, test, type TestControl } from './support/fixtures';

type StudentKey = 'S1' | 'S2' | 'S3';
type Ids = { classes: Record<string, string>; students: Record<string, string> };
type OpResult = { opId: string; status: string; code?: string; fields?: Record<string, string>; rowVersion?: number; entityId?: string; conflictId?: string; notices?: string[] };
type Quantity = { unit: string; numerator: number; denominator: number };

const DEVICE = '0190f5c0-0000-4000-8000-0000000000f8';
const DEVICE_2 = '0190f5c0-0000-4000-8000-0000000000f9';

/** A canonical lowercase UUIDv7, as the app generates for offline-created entities and op IDs. */
function uuidv7(): string {
  const bytes = randomBytes(16);
  const ms = BigInt(Date.now());
  for (let i = 0; i < 6; i++) bytes[i] = Number((ms >> BigInt(8 * (5 - i))) & 0xffn);
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date());

/** The most recent Monday–Saturday on or before `back` days ago: a scheduled day for every seeded class. */
function classDay(back = 1): string {
  let d = addDays(today(), -back);
  while (weekday(d) === 7) d = addDays(d, -1);
  return d;
}

const nextClassDay = (date: string) => {
  let d = addDays(date, 1);
  while (weekday(d) === 7) d = addDays(d, 1);
  return d;
};

const lines = (n: number): Quantity => ({ unit: 'LINES', numerator: n, denominator: 1 });
const para = (numerator: number, denominator = 1): Quantity => ({ unit: 'PARA', numerator, denominator });
const SABAQ_2_1_10 = { surahStart: 2, ayahStart: 1, surahEnd: 2, ayahEnd: 10 };

let seq = 0;
function op(entity: string, opType: 'CREATE' | 'UPDATE' | 'COMMAND', entityId: string, fields: Record<string, unknown>, baseVersion: number | null = null, command?: string) {
  return { opId: uuidv7(), seq: ++seq, entity, entityId, opType, ...(command ? { command } : {}), baseVersion, fields, dependsOn: [] as string[], clientSavedAt: new Date().toISOString() };
}

async function push(api: APIRequestContext, ops: object[], deviceId = DEVICE): Promise<OpResult[]> {
  const res = await api.post('/sync/push', { data: { protocolVersion: 1, deviceId, ops } });
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()).results as OpResult[];
}

async function applied(api: APIRequestContext, o: object, deviceId = DEVICE): Promise<{ id: string; rowVersion: number; notices?: string[] }> {
  const [r] = await push(api, [o], deviceId);
  expect(r, JSON.stringify(r)).toMatchObject({ status: 'APPLIED' });
  return { id: r!.entityId!, rowVersion: r!.rowVersion!, ...(r!.notices ? { notices: r!.notices } : {}) };
}

async function getJson(api: APIRequestContext, url: string) {
  const res = await api.get(url);
  expect(res.status(), await res.text()).toBe(200);
  return res.json();
}

const homework = (api: APIRequestContext, id: string) => getJson(api, `/homework/assignments/${id}`);
const record = (api: APIRequestContext, id: string) => getJson(api, `/hifz/daily-records/${id}`);

/** Attendance PRESENT and a daily record for the student and date; returns the record id. */
async function presentRecord(api: APIRequestContext, ids: Ids, student: StudentKey, date: string): Promise<string> {
  const results = await push(api, [
    op('attendance_record', 'CREATE', uuidv7(), { studentId: ids.students[student], classId: ids.classes.A1, reportDate: date, status: 'PRESENT', leaveReason: null, absentNote: null }),
    op('daily_record', 'CREATE', uuidv7(), { studentId: ids.students[student], classId: ids.classes.A1, reportDate: date, sessionLabel: null }),
  ]);
  expect(results.map((r) => r.status), JSON.stringify(results)).toEqual(['APPLIED', 'APPLIED']);
  return results[1]!.entityId!;
}

interface PortionInput {
  section: 'SABAQ' | 'SABQI' | 'MANZIL';
  position?: number;
  paraNumber?: number | null;
  range?: typeof SABAQ_2_1_10 | null;
  assigned: Quantity;
  totalLines?: number | null;
  homeworkPortionId?: string;
}

const portionOp = (recordId: string, p: PortionInput) =>
  op('lesson_portion', 'CREATE', uuidv7(), {
    dailyRecordId: recordId,
    section: p.section,
    position: p.position ?? 1,
    isExtra: false,
    paraNumber: p.paraNumber ?? null,
    range: p.range ?? null,
    totalLines: p.totalLines ?? null,
    totalLinesSource: p.section === 'SABAQ' ? 'MANUAL' : null,
    assigned: p.assigned,
    ...(p.homeworkPortionId ? { homeworkPortionId: p.homeworkPortionId } : {}),
  });

const attemptOp = (portionId: string, status: string, completed: Quantity | null = null) =>
  op('portion_attempt', 'CREATE', uuidv7(), { lessonPortionId: portionId, attemptNo: 1, attemptedAt: new Date().toISOString(), status, completed, quality: null, noMistakes: false, mistakes: [], remarks: null });

const correctAttempt = (id: string, base: number, status: string, completed: Quantity | null) =>
  op('portion_attempt', 'UPDATE', id, { status, completed, quality: null, noMistakes: false, mistakes: [] }, base);

async function recite(api: APIRequestContext, recordId: string, p: PortionInput, status: string, completed: Quantity | null = null) {
  const portion = await applied(api, portionOp(recordId, p));
  const attempt = await applied(api, attemptOp(portion.id, status, completed));
  return { portionId: portion.id, attemptId: attempt.id };
}

/** What a device saw when it built the draft: every portion and attempt of the record with its row version. */
async function sourcesOf(api: APIRequestContext, recordId: string) {
  const d = await record(api, recordId);
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
  assigned: null,
  origin: 'SUGGESTED',
  sourceAttemptId,
  instructions: null,
  ...over,
});

const added = (over: Record<string, unknown>) => ({ id: uuidv7(), position: 1, paraNumber: null, range: null, totalLines: null, origin: 'TEACHER_ADDED', sourceAttemptId: null, instructions: null, ...over });

const draftOp = (ids: Ids, student: StudentKey, fields: { assignedDate: string; dueDate?: string | null; sourceDailyRecordId?: string | null; instructions?: string | null; portions: object[] }, id = uuidv7()) =>
  op('homework_assignment', 'CREATE', id, { studentId: ids.students[student], sourceDailyRecordId: null, dueDate: null, instructions: null, ...fields });

const confirmOp = (id: string, base: number | null, sources: object[], confirmedAt = new Date().toISOString()) =>
  op('homework_assignment', 'COMMAND', id, { confirmedAt, sources }, base, 'CONFIRM_HOMEWORK');

const updateOp = (id: string, base: number, fields: Record<string, unknown>) => op('homework_assignment', 'UPDATE', id, fields, base);

const actions = async (control: TestControl, id: string) => (await control.auditForTarget(id)).map((a) => a.action);

/** S1 recites a partial Sabaq (6 of 10 lines, Al-Baqarah 1–10) and a partial Sabqi Para 3 (Half of Salasah). */
async function partialLesson(api: APIRequestContext, ids: Ids, day = classDay(1)) {
  const recordId = await presentRecord(api, ids, 'S1', day);
  const sabaq = await recite(api, recordId, { section: 'SABAQ', range: SABAQ_2_1_10, totalLines: 10, assigned: lines(10) }, 'PARTIAL', lines(6));
  const sabqi = await recite(api, recordId, { section: 'SABQI', paraNumber: 3, assigned: para(3, 4) }, 'PARTIAL', para(1, 2));
  return { recordId, day, sabaq, sabqi };
}

/** A confirmed assignment carrying S1's partial Sabqi forward. */
async function confirmedHomework(api: APIRequestContext, ids: Ids) {
  const lesson = await partialLesson(api, ids);
  const portion = suggested(lesson.sabqi.attemptId);
  const draft = await applied(api, draftOp(ids, 'S1', { assignedDate: lesson.day, sourceDailyRecordId: lesson.recordId, portions: [portion] }));
  const confirmed = await applied(api, confirmOp(draft.id, draft.rowVersion, await sourcesOf(api, lesson.recordId)));
  return { ...lesson, id: draft.id, portionId: portion.id, rowVersion: confirmed.rowVersion };
}

test.describe('F08 · Homework and carry forward', { tag: '@F08' }, () => {
  test.beforeEach(async ({ control }) => {
    await control.seedSyntheticQuran('ALIF');
  });

  test('F08-AC1 (US-033) each homework portion stores its own section, Para, range, quantity, and instructions', async ({ as, control }) => {
    // Create homework: Sabaq Al-Baqarah 1–10, 10 of 10 LINES; Sabqi Para 3 Rubu; Sabqi Para 4 Complete; read back three portions.
    const ids = await control.rosterIds();
    const teacher = await as('teacher.a1');
    const day = classDay(1);
    const { id } = await applied(
      teacher,
      draftOp(ids, 'S1', {
        assignedDate: day,
        portions: [
          added({ section: 'SABAQ', range: SABAQ_2_1_10, totalLines: 10, assigned: lines(10), instructions: 'Listen twice' }),
          added({ section: 'SABQI', paraNumber: 3, assigned: para(1, 4) }),
          added({ section: 'SABQI', position: 2, paraNumber: 4, assigned: para(1) }),
        ],
      }),
    );
    const hw = await homework(teacher, id);
    expect(hw.portions.map((p: Record<string, unknown>) => [p.section, p.paraNumber, p.range, p.totalLines, p.assigned, p.instructions])).toEqual([
      ['SABAQ', 1, SABAQ_2_1_10, 10, lines(10), 'Listen twice'],
      ['SABQI', 3, null, null, para(1, 4), null],
      ['SABQI', 4, null, null, para(1), null],
    ]);
  });

  test('F08-AC22 (US-035) a partial Sabaq is suggested with its original range and the remaining lines (AC-HW-10)', async ({ as, control }) => {
    // Record Sabaq Al-Baqarah 1–10, total 10, assigned 10, completed 6, PARTIAL.
    // The draft Sabaq portion has Al-Baqarah 1–10, total_lines 10, assigned 4 LINES, source_attempt_id set, status DRAFT.
    // A Sabqi Para 3 PARTIAL Salasah/Half in the same record is suggested as PARA 1/4.
    const ids = await control.rosterIds();
    const teacher = await as('teacher.a1');
    const { recordId, day, sabaq, sabqi } = await partialLesson(teacher, ids);
    const suggestion = await getJson(teacher, `/homework/suggestion?dailyRecordId=${recordId}`);
    expect(suggestion.portions).toEqual([
      expect.objectContaining({ section: 'SABAQ', range: SABAQ_2_1_10, totalLines: 10, assigned: lines(4), sourceAttemptId: sabaq.attemptId }),
      expect.objectContaining({ section: 'SABQI', paraNumber: 3, assigned: para(1, 4), sourceAttemptId: sabqi.attemptId }),
    ]);
    const { id } = await applied(teacher, draftOp(ids, 'S1', { assignedDate: day, sourceDailyRecordId: recordId, portions: [suggested(sabaq.attemptId, { section: 'SABAQ' }), suggested(sabqi.attemptId)] }));
    const hw = await homework(teacher, id);
    expect(hw.status).toBe('DRAFT');
    expect(hw.portions[0]).toMatchObject({ section: 'SABAQ', range: SABAQ_2_1_10, totalLines: 10, assigned: lines(4), sourceAttemptId: sabaq.attemptId, origin: 'SUGGESTED' });
    expect(hw.portions[1]).toMatchObject({ section: 'SABQI', paraNumber: 3, assigned: para(1, 4) });
  });

  test('F08-AC2 (US-033) an assignment stores dates, status, creator, and instructions', async ({ as, control }) => {
    // Read the assignment: assigned date, due date, status, creator teacher.a1, general instructions.
    const ids = await control.rosterIds();
    const teacher = await as('teacher.a1');
    const day = classDay(1);
    const due = nextClassDay(day);
    const { id } = await applied(teacher, draftOp(ids, 'S1', { assignedDate: day, dueDate: due, instructions: 'Revise before Fajr', portions: [added({ section: 'SABQI', paraNumber: 3, assigned: para(1, 4) })] }));
    expect(await homework(teacher, id)).toMatchObject({
      assignedDate: day,
      dueDate: due,
      status: 'DRAFT',
      instructions: 'Revise before Fajr',
      createdBy: { userId: await control.userIdOf('teacher.a1') },
    });
    // A due date before the assigned date is refused.
    const [bad] = await push(teacher, [draftOp(ids, 'S1', { assignedDate: day, dueDate: addDays(day, -1), portions: [] })]);
    expect(bad).toMatchObject({ status: 'REJECTED', fields: { dueDate: 'DUE_BEFORE_ASSIGNED' } });
  });

  test('F08-AC3 (US-034) 3/4 assigned and 1/2 completed suggest 1/4 Para', async ({ as, control }) => {
    // Record PARTIAL Salasah/Half; the draft suggestion portion has PARA 1/4.
    const ids = await control.rosterIds();
    const teacher = await as('teacher.a1');
    const { recordId, day, sabqi } = await partialLesson(teacher, ids);
    const { id } = await applied(teacher, draftOp(ids, 'S1', { assignedDate: day, sourceDailyRecordId: recordId, portions: [suggested(sabqi.attemptId, { assigned: para(1) })] }));
    expect((await homework(teacher, id)).portions[0].assigned).toEqual(para(1, 4));
  });

  test('F08-AC4 (US-034) mismatched units give no remaining and a review flag', async ({ as, control }) => {
    // Assigned PARA Half, completed 6 LINES; the suggestion has no remaining quantity and needs_review = true.
    const ids = await control.rosterIds();
    const teacher = await as('teacher.a1');
    const day = classDay(1);
    const recordId = await presentRecord(teacher, ids, 'S1', day);
    const portion = await applied(teacher, portionOp(recordId, { section: 'SABQI', paraNumber: 3, assigned: para(1, 2) }));
    const attemptId = await control.legacyAttempt({ lessonPortionId: portion.id, status: 'PARTIAL', completed: lines(6) });
    const suggestion = await getJson(teacher, `/homework/suggestion?dailyRecordId=${recordId}`);
    expect(suggestion.portions).toEqual([expect.objectContaining({ sourceAttemptId: attemptId, assigned: null, needsReview: true })]);
    const { id } = await applied(teacher, draftOp(ids, 'S1', { assignedDate: day, portions: [suggested(attemptId)] }));
    expect((await homework(teacher, id)).portions[0]).toMatchObject({ assigned: null, needsReview: true });
  });

  test('F08-AC5 (US-035) Partial and Not Remembered with remaining are suggested and linked (AC-HW-01, AC-HW-08)', async ({ as, control }) => {
    // Each suggestion portion links to its source attempt ID and carries the remaining quantity.
    const ids = await control.rosterIds();
    const teacher = await as('teacher.a1');
    const day = classDay(1);
    const recordId = await presentRecord(teacher, ids, 'S1', day);
    const partial = await recite(teacher, recordId, { section: 'SABQI', paraNumber: 3, assigned: para(3, 4) }, 'PARTIAL', para(1, 4));
    const notRemembered = await recite(teacher, recordId, { section: 'MANZIL', paraNumber: 7, assigned: para(1) }, 'NOT_REMEMBERED');
    const suggestion = await getJson(teacher, `/homework/suggestion?dailyRecordId=${recordId}`);
    expect(suggestion.portions.map((p: Record<string, unknown>) => [p.sourceAttemptId, p.sourceLessonPortionId, p.assigned])).toEqual([
      [partial.attemptId, partial.portionId, para(1, 2)],
      [notRemembered.attemptId, notRemembered.portionId, para(1)],
    ]);
    const { id } = await applied(teacher, draftOp(ids, 'S1', { assignedDate: day, portions: [suggested(partial.attemptId), suggested(notRemembered.attemptId, { section: 'MANZIL' })] }));
    const hw = await homework(teacher, id);
    expect(hw.portions.map((p: Record<string, unknown>) => [p.sourceAttemptId, p.assigned])).toEqual([
      [partial.attemptId, para(1, 2)],
      [notRemembered.attemptId, para(1)],
    ]);
  });

  test('F08-AC6 (US-035) Absent, Not Assigned, Pending, and Completed are not suggested (AC-HW-09)', async ({ as, control }) => {
    // Record one portion of each; suggestions contain none of them.
    const ids = await control.rosterIds();
    const teacher = await as('teacher.a1');
    const day = classDay(1);
    const recordId = await presentRecord(teacher, ids, 'S1', day);
    const attempts: string[] = [];
    for (const [i, status] of ['ABSENT', 'NOT_ASSIGNED', 'PENDING', 'COMPLETED'].entries()) {
      attempts.push((await recite(teacher, recordId, { section: 'MANZIL', position: i + 1, paraNumber: i + 1, assigned: para(1) }, status)).attemptId);
    }
    expect((await getJson(teacher, `/homework/suggestion?dailyRecordId=${recordId}`)).portions).toEqual([]);
    // The server never carries them forward, even when a client asks.
    const [refused] = await push(teacher, [draftOp(ids, 'S1', { assignedDate: day, portions: attempts.map((a, i) => suggested(a, { section: 'MANZIL', position: i + 1 })) })]);
    expect(refused).toMatchObject({ status: 'REJECTED', fields: { 'portions.0.sourceAttemptId': 'NOT_ELIGIBLE', 'portions.3.sourceAttemptId': 'NOT_ELIGIBLE' } });
  });

  test('F08-AC8 (US-036) draft edits are kept and each portion records its origin (AC-HW-02)', async ({ as, control }) => {
    // Edit a quantity, remove one portion, add one, change due date; portions are SUGGESTED, EDITED, ADDED.
    const ids = await control.rosterIds();
    const teacher = await as('teacher.a1');
    const day = classDay(1);
    const recordId = await presentRecord(teacher, ids, 'S1', day);
    const a = await recite(teacher, recordId, { section: 'SABQI', paraNumber: 3, assigned: para(3, 4) }, 'PARTIAL', para(1, 4));
    const b = await recite(teacher, recordId, { section: 'SABQI', position: 2, paraNumber: 4, assigned: para(1) }, 'NOT_REMEMBERED');
    const c = await recite(teacher, recordId, { section: 'MANZIL', paraNumber: 9, assigned: para(1) }, 'PARTIAL', para(1, 2));
    const [pa, pb, pc] = [suggested(a.attemptId), suggested(b.attemptId, { position: 2 }), suggested(c.attemptId, { section: 'MANZIL' })];
    const draft = await applied(teacher, draftOp(ids, 'S1', { assignedDate: day, sourceDailyRecordId: recordId, portions: [pa, pb, pc] }));
    const extra = added({ section: 'MANZIL', position: 2, paraNumber: 10, assigned: para(1, 4) });
    const due = addDays(day, 4);
    await applied(teacher, updateOp(draft.id, draft.rowVersion, { dueDate: due, portions: [pa, { ...pb, origin: 'TEACHER_EDITED', paraNumber: 4, assigned: para(1, 2) }, extra] }));
    const hw = await homework(teacher, draft.id);
    expect(hw.dueDate).toBe(due);
    expect(hw.portions.map((p: Record<string, unknown>) => [p.id, p.origin, p.removed])).toEqual([
      [pa.id, 'SUGGESTED', false],
      [pb.id, 'TEACHER_EDITED', false],
      [extra.id, 'TEACHER_ADDED', false],
      [pc.id, 'SUGGESTED', true],
    ]);
  });

  test('F08-AC9 (US-036) a rejected draft is not counted as homework', async ({ as, control }) => {
    // Reject the draft; status REJECTED; homework counts in reports exclude it.
    const ids = await control.rosterIds();
    const teacher = await as('teacher.a1');
    const { day, sabqi } = await partialLesson(teacher, ids);
    const draft = await applied(teacher, draftOp(ids, 'S1', { assignedDate: day, portions: [suggested(sabqi.attemptId)] }));
    await applied(teacher, updateOp(draft.id, draft.rowVersion, { status: 'REJECTED' }));
    const list = await getJson(teacher, `/homework/assignments?studentId=${ids.students.S1}`);
    expect(list.items.map((x: { status: string }) => x.status)).toEqual(['REJECTED']);
    expect(list.counts).toEqual({ draft: 0, confirmed: 0, attemptedPortions: 0, completedPortions: 0, carriedOver: 0 });
    expect(await actions(control, draft.id)).toEqual(['HOMEWORK_DRAFT_CREATED', 'HOMEWORK_REJECTED']);
  });

  test('F08-AC10 (US-037) confirming stores the confirmer and time and is audited (AC-HW-04)', async ({ as, control }) => {
    // Confirm as teacher.a1; status CONFIRMED, confirmed_by teacher.a1, confirmed_at set; audit present.
    const ids = await control.rosterIds();
    const teacher = await as('teacher.a1');
    const { recordId, day, sabqi } = await partialLesson(teacher, ids);
    const draft = await applied(teacher, draftOp(ids, 'S1', { assignedDate: day, portions: [suggested(sabqi.attemptId)] }));
    const confirmedAt = new Date(Date.now() - 5 * 60_000).toISOString();
    await applied(teacher, confirmOp(draft.id, draft.rowVersion, await sourcesOf(teacher, recordId), confirmedAt));
    expect(await homework(teacher, draft.id)).toMatchObject({ status: 'CONFIRMED', confirmedBy: { userId: await control.userIdOf('teacher.a1') }, confirmedAt });
    expect(await actions(control, draft.id)).toEqual(['HOMEWORK_DRAFT_CREATED', 'HOMEWORK_CONFIRMED']);
  });

  test('F08-AC11 (US-037) a draft is never confirmed automatically (AC-HW-03)', async ({ as, control }) => {
    // control.advanceClock(past due date and next class); the draft is still DRAFT.
    const ids = await control.rosterIds();
    const teacher = await as('teacher.a1');
    const { day, sabqi } = await partialLesson(teacher, ids);
    const draft = await applied(teacher, draftOp(ids, 'S1', { assignedDate: day, portions: [suggested(sabqi.attemptId)] }));
    await control.advanceClock(10 * 24 * 60 * 60 * 1000);
    const again = await as('teacher.a1');
    expect(await homework(again, draft.id)).toMatchObject({ status: 'DRAFT', state: 'DRAFT', confirmedBy: null, confirmedAt: null });
  });

  test('F08-AC12 (US-037) a confirmation that fails partway confirms nothing', async ({ as, control }) => {
    // Confirm a draft with one invalid portion → error; draft unchanged; no partial confirmed assignment exists.
    const ids = await control.rosterIds();
    const teacher = await as('teacher.a1');
    const day = classDay(1);
    const recordId = await presentRecord(teacher, ids, 'S1', day);
    const good = await recite(teacher, recordId, { section: 'SABQI', paraNumber: 3, assigned: para(3, 4) }, 'PARTIAL', para(1, 4));
    const odd = await applied(teacher, portionOp(recordId, { section: 'SABQI', position: 2, paraNumber: 4, assigned: para(1, 2) }));
    const legacy = await control.legacyAttempt({ lessonPortionId: odd.id, status: 'PARTIAL', completed: lines(6) });
    const invalid = suggested(legacy, { position: 2 });
    const draft = await applied(teacher, draftOp(ids, 'S1', { assignedDate: day, portions: [suggested(good.attemptId), invalid] }));
    const [refused] = await push(teacher, [confirmOp(draft.id, draft.rowVersion, await sourcesOf(teacher, recordId))]);
    expect(refused).toMatchObject({ status: 'REJECTED', code: 'VALIDATION', fields: { [`portions.${invalid.id}.assigned`]: 'REQUIRED' } });
    expect(await homework(teacher, draft.id)).toMatchObject({ status: 'DRAFT', confirmedBy: null, rowVersion: draft.rowVersion });
    // Once the Teacher fixes it, a failure while saving (the audit write) still rolls the whole confirmation back.
    const fixed = await applied(teacher, updateOp(draft.id, draft.rowVersion, { portions: [suggested(good.attemptId), { ...invalid, origin: 'TEACHER_EDITED', paraNumber: 4, assigned: para(1, 4) }] }));
    await control.failNextAuditWrite();
    const res = await teacher.post('/sync/push', { data: { protocolVersion: 1, deviceId: DEVICE, ops: [confirmOp(draft.id, fixed.rowVersion, await sourcesOf(teacher, recordId))] } });
    expect(res.status()).toBe(500);
    expect(await homework(teacher, draft.id)).toMatchObject({ status: 'DRAFT', confirmedBy: null, rowVersion: fixed.rowVersion });
    const list = await getJson(teacher, `/homework/assignments?studentId=${ids.students.S1}`);
    expect(list.counts).toMatchObject({ confirmed: 0, draft: 1 });
  });

  test('F08-AC13 (US-038) a new assignment keeps the earlier one unchanged (AC-HW-05)', async ({ as, control }) => {
    // Confirm assignment 1; create and confirm assignment 2; assignment 1 is byte-identical.
    const ids = await control.rosterIds();
    const teacher = await as('teacher.a1');
    const first = await confirmedHomework(teacher, ids);
    const before = await homework(teacher, first.id);
    const second = await applied(teacher, draftOp(ids, 'S1', { assignedDate: classDay(0), portions: [added({ section: 'MANZIL', paraNumber: 5, assigned: para(1) })] }));
    await applied(teacher, confirmOp(second.id, second.rowVersion, []));
    expect(await homework(teacher, first.id)).toEqual(before);
  });

  test('F08-AC14 (US-038) correcting a source attempt rebuilds drafts only (AC-HW-06, AC-HW-07)', async ({ as, control }) => {
    // Correct the source attempt; the draft quantity changes; confirmed homework unchanged; response has the notice.
    const ids = await control.rosterIds();
    const teacher = await as('teacher.a1');
    const confirmed = await confirmedHomework(teacher, ids);
    const before = await homework(teacher, confirmed.id);
    const draft = await applied(teacher, draftOp(ids, 'S1', { assignedDate: confirmed.day, sourceDailyRecordId: confirmed.recordId, portions: [suggested(confirmed.sabaq.attemptId, { section: 'SABAQ' })] }));
    const d = await record(teacher, confirmed.recordId);
    const sabaqAttempt = d.portions.find((p: { section: string }) => p.section === 'SABAQ').attempts[0];
    await applied(teacher, correctAttempt(confirmed.sabaq.attemptId, sabaqAttempt.rowVersion, 'PARTIAL', lines(7)));
    expect((await homework(teacher, draft.id)).portions[0].assigned).toEqual(lines(3));
    const sabqiAttempt = d.portions.find((p: { section: string }) => p.section === 'SABQI').attempts[0];
    const fix = await applied(teacher, correctAttempt(confirmed.sabqi.attemptId, sabqiAttempt.rowVersion, 'COMPLETED', para(3, 4)));
    expect(fix.notices).toEqual(['CONFIRMED_HOMEWORK_UNCHANGED']);
    // The confirmed homework is unchanged; only the live "why" block reflects the corrected source.
    const stored = (v: { portions: Record<string, unknown>[] }) => ({ ...v, portions: v.portions.map(({ source: _source, ...p }) => p) });
    expect(stored(await homework(teacher, confirmed.id))).toEqual(stored(before));
  });

  test('F08-AC15 (US-038) an Admin’s revision creates a linked assignment and supersedes the old one', async ({ as, control }) => {
    // Revise and confirm; new assignment links to the old; old status SUPERSEDED; both audited.
    const ids = await control.rosterIds();
    const teacher = await as('teacher.a1');
    const old = await confirmedHomework(teacher, ids);
    const admin = await as('admin.a');
    const newId = uuidv7();
    const res = await admin.post(`/homework/assignments/${old.id}/revise`, {
      data: { id: newId, dueDate: addDays(old.day, 3), instructions: 'Revised', portions: [{ ...added({ section: 'SABQI', paraNumber: 3, assigned: para(1, 2) }), origin: undefined, sourceAttemptId: undefined, revisesPortionId: old.portionId }] },
    });
    expect(res.status(), await res.text()).toBe(200);
    const { created, superseded } = await res.json();
    expect(created).toMatchObject({ id: newId, status: 'CONFIRMED', revisionOf: old.id, confirmedBy: { userId: await control.userIdOf('admin.a') } });
    expect(created.portions[0]).toMatchObject({ sourceHomeworkPortionId: old.portionId, assigned: para(1, 2) });
    expect(superseded).toMatchObject({ id: old.id, status: 'SUPERSEDED', supersededBy: newId });
    expect(await actions(control, newId)).toEqual(['HOMEWORK_REVISED']);
    expect(await actions(control, old.id)).toEqual(['HOMEWORK_DRAFT_CREATED', 'HOMEWORK_CONFIRMED', 'HOMEWORK_SUPERSEDED']);
  });

  test('F08-AC16 (US-038) a next-class attempt links to its homework portion (FR-HW-015)', async ({ as, control }) => {
    // Record an attempt on the due homework portion; the attempt references that homework portion ID.
    const ids = await control.rosterIds();
    const teacher = await as('teacher.a1');
    const hw = await confirmedHomework(teacher, ids);
    const recordId = await presentRecord(teacher, ids, 'S1', today() === hw.day ? today() : classDay(0));
    const portion = await applied(teacher, portionOp(recordId, { section: 'SABQI', paraNumber: 3, assigned: para(1, 4), homeworkPortionId: hw.portionId }));
    const attempt = await applied(teacher, attemptOp(portion.id, 'COMPLETED'));
    const d = await record(teacher, recordId);
    expect(d.portions[0]).toMatchObject({ homeworkPortionId: hw.portionId });
    expect(d.portions[0].attempts[0].id).toBe(attempt.id);
    expect((await homework(teacher, hw.id)).portions[0].progress).toEqual({ attempted: true, status: 'COMPLETED', lessonPortionIds: [portion.id] });
  });

  // Added by the decision review of 2026-10-30 (SRS §17).
  test('F08-AC17 (US-038) a Teacher cannot revise confirmed homework', async ({ as, control }) => {
    // Given a Teacher, when they try to revise confirmed homework, then there is no Revise control, and the API returns forbidden.
    const ids = await control.rosterIds();
    const teacher = await as('teacher.a1');
    const hw = await confirmedHomework(teacher, ids);
    const res = await teacher.post(`/homework/assignments/${hw.id}/revise`, { data: { id: uuidv7(), dueDate: hw.day, portions: [] } });
    expect(res.status()).toBe(403);
    expect((await homework(teacher, hw.id)).status).toBe('CONFIRMED');
  });

  test('F08-AC18 (US-036) the due date defaults to the next scheduled class day', async ({ as, control }) => {
    // Given a class scheduled Monday to Saturday, when homework is drafted on Saturday, then the due date defaults to Monday; if Monday is a holiday, it defaults to Tuesday.
    const ids = await control.rosterIds();
    const teacher = await as('teacher.a1');
    let saturday = addDays(today(), -2);
    while (weekday(saturday) !== 6) saturday = addDays(saturday, -1);
    const monday = addDays(saturday, 2);
    const portion = () => added({ section: 'SABQI', paraNumber: 3, assigned: para(1, 4) });
    const first = await applied(teacher, draftOp(ids, 'S1', { assignedDate: saturday, portions: [portion()] }));
    expect((await homework(teacher, first.id)).dueDate).toBe(monday);
    const admin = await as('admin.a');
    const holiday = await admin.post('/calendar/exceptions', { data: { date: monday, kind: 'HOLIDAY', label: 'Synthetic holiday', confirm: true } });
    expect(holiday.status(), await holiday.text()).toBe(201);
    const second = await applied(teacher, draftOp(ids, 'S1', { assignedDate: saturday, portions: [portion()] }));
    expect((await homework(teacher, second.id)).dueDate).toBe(addDays(monday, 1));
  });

  test('F08-AC19 (US-038) homework missed through absence or a holiday carries over unchanged', async ({ as, control }) => {
    // Given confirmed homework due on a day the student is Absent or on Leave, or that becomes a holiday, when the next class day comes, then the same homework is shown as outstanding and labelled "carried over — absent/holiday". It is not counted as failed, and the confirmed assignment is unchanged.
    const ids = await control.rosterIds();
    const teacher = await as('teacher.a1');
    const assigned = classDay(8);
    const absentDue = nextClassDay(assigned);
    const holidayDue = nextClassDay(absentDue);
    const make = async (due: string) => {
      const draft = await applied(teacher, draftOp(ids, 'S1', { assignedDate: assigned, dueDate: due, portions: [added({ section: 'SABQI', paraNumber: 3, assigned: para(1, 4) })] }));
      await applied(teacher, confirmOp(draft.id, draft.rowVersion, []));
      return draft.id;
    };
    const absentHw = await make(absentDue);
    const holidayHw = await make(holidayDue);
    const before = [await homework(teacher, absentHw), await homework(teacher, holidayHw)];
    await applied(teacher, op('attendance_record', 'CREATE', uuidv7(), { studentId: ids.students.S1, classId: ids.classes.A1, reportDate: absentDue, status: 'ABSENT', leaveReason: null, absentNote: null }));
    const admin = await as('admin.a');
    expect((await admin.post('/calendar/exceptions', { data: { date: holidayDue, kind: 'HOLIDAY', label: 'Synthetic holiday', confirm: true } })).status()).toBe(201);
    const absentView = await homework(teacher, absentHw);
    expect(absentView).toMatchObject({ status: 'CONFIRMED', state: 'CARRIED_OVER', carriedOver: { reason: 'ABSENT' } });
    const holidayView = await homework(teacher, holidayHw);
    expect(holidayView).toMatchObject({ status: 'CONFIRMED', state: 'CARRIED_OVER', carriedOver: { reason: 'HOLIDAY', effectiveDueDate: nextClassDay(holidayDue) } });
    // Unchanged: the confirmed content and version are as confirmed.
    for (const [view, was] of [[absentView, before[0]], [holidayView, before[1]]]) {
      expect({ ...view, state: was.state, carriedOver: was.carriedOver }).toEqual(was);
    }
    const list = await getJson(teacher, `/homework/assignments?studentId=${ids.students.S1}`);
    expect(list.counts).toMatchObject({ confirmed: 2, carriedOver: 2, completedPortions: 0 });
  });

  test('F08-AC21 (US-037) an offline confirmation against changed source data becomes a conflict', async ({ as, control }) => {
    // Given an offline confirmation whose source records changed on the server after the draft was built, when it syncs, then the homework is not confirmed, and a sync conflict is created for review.
    const ids = await control.rosterIds();
    const teacher = await as('teacher.a1');
    const { recordId, day, sabqi } = await partialLesson(teacher, ids);
    const draft = await applied(teacher, draftOp(ids, 'S1', { assignedDate: day, portions: [suggested(sabqi.attemptId)] }));
    const seen = await sourcesOf(teacher, recordId);
    // While the Teacher is offline, an Admin corrects the source on the server.
    const admin = await as('admin.a');
    const attempt = (await record(admin, recordId)).portions.find((p: { section: string }) => p.section === 'SABQI').attempts[0];
    await applied(admin, correctAttempt(sabqi.attemptId, attempt.rowVersion, 'PARTIAL', para(1, 4)), DEVICE_2);
    const [result] = await push(teacher, [confirmOp(draft.id, draft.rowVersion, seen, new Date(Date.now() - 60_000).toISOString())]);
    expect(result).toMatchObject({ status: 'CONFLICT' });
    expect(await homework(teacher, draft.id)).toMatchObject({ status: 'DRAFT', confirmedBy: null });
    const conflicts = await getJson(teacher, '/sync/conflicts');
    expect(conflicts.items).toEqual([expect.objectContaining({ id: result!.conflictId, entity: 'homework_assignment', entityId: draft.id })]);
  });
});

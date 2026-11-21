// F09 · Weekly and monthly reports — API E2E (docs/specs/12-f09-weekly-monthly-reports.md; plan docs/handover/F09-plan.md)
// Screen journeys: e2e/mobile/f09-reports/.
// Seeded fixtures: A1 (teacher.a1; S1, S2), A2 (teacher.a2; S3); every class meets Monday–Saturday. Source records are
// written through POST /sync/push (the app's path); reports are read from GET /reports/*. Synthetic data only; Quran data
// is the SYNTHETIC test fixture ("Surah 2" below is synthetic).
import type { APIRequestContext } from '@playwright/test';
import { addDays, applied, attemptOp, correctAttemptOp, getJson, lines, op, para, presentRecord, push, recite, recordDetail, sourcesOf, today, uuidv7, type Ids, type StudentKey } from './support/daily-entry';
import { expect, test } from './support/fixtures';

const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
/** Last week's Monday: every day of that week is in the past and inside the seeded enrollment. */
const lastMonday = () => addDays(addDays(today(), -7), -(weekday(addDays(today(), -7)) - 1));
const day = (offset: number) => addDays(lastMonday(), offset); // 0 = Monday … 6 = Sunday
const SABAQ_2_1_10 = { surahStart: 2, ayahStart: 1, surahEnd: 2, ayahEnd: 10 };
const MAJOR = { category: 'TAJWEED', severity: 'MAJOR', repeated: false };

let ids: Ids;

const report = async (api: APIRequestContext, student: StudentKey, kind: 'WEEK' | 'MONTH', date: string) =>
  (await getJson(api, `/reports/student?studentId=${ids.students[student]}&kind=${kind}&date=${date}`)).report;

const sectionOf = (r: { sections: { section: string }[] }, s: string) => r.sections.find((x) => x.section === s) as unknown as {
  portionCount: number;
  totals: Record<string, unknown>;
  statusCounts: Record<string, number>;
  paras: { paraNumber: number | null; portionCount: number }[];
  pending: { portionId: string; carriedInto: unknown }[];
};

const mark = (student: StudentKey, date: string, status: string, leaveReason: string | null = null) =>
  op('attendance_record', 'CREATE', uuidv7(), { studentId: ids.students[student], classId: ids.classes[student === 'S3' ? 'A2' : 'A1'], reportDate: date, status, leaveReason, absentNote: null });

test.describe('F09 · Weekly and monthly reports', { tag: '@F09' }, () => {
  test.beforeEach(async ({ control }) => {
    ids = await control.rosterIds();
    await control.seedSyntheticQuran();
  });

  test('F09-AC1 (US-039) the week is Monday 00:00 to Sunday 23:59 Asia/Karachi (AC-RPT-07)', async ({ as }) => {
    const teacher = await as('teacher.a1');
    // Saturday of last week and the following Monday: each lands in its own week (report date, not sync date).
    const sat = await presentRecord(teacher, ids, 'S1', day(5));
    await recite(teacher, sat, { section: 'SABQI', paraNumber: 1, assigned: para(1) }, { status: 'COMPLETED', completed: para(1) });
    const nextMon = await presentRecord(teacher, ids, 'S1', addDays(day(0), 7));
    await recite(teacher, nextMon, { section: 'SABQI', paraNumber: 2, assigned: para(1) }, { status: 'COMPLETED', completed: para(1) });
    const r = await report(teacher, 'S1', 'WEEK', day(3));
    expect(r.period).toMatchObject({ kind: 'WEEK', from: day(0), to: day(6), timeZone: 'Asia/Karachi', weekStart: 'MONDAY' });
    expect(r.period.startsAt).toBe(new Date(`${day(0)}T00:00:00+05:00`).toISOString());
    expect(r.period.endsAt).toBe(new Date(`${day(6)}T23:59:00+05:00`).toISOString());
    expect(r.days.map((d: { date: string }) => d.date)).toEqual([day(5)]);
    const next = await report(teacher, 'S1', 'WEEK', addDays(day(0), 7));
    expect(next.days.map((d: { date: string }) => d.date)).toEqual([addDays(day(0), 7)]);
  });

  test('F09-AC2 (US-039) every total equals a direct calculation from source records (AC-RPT-01)', async ({ as }) => {
    const teacher = await as('teacher.a1');
    const seeded = [
      { d: 0, assigned: 10, done: 6, status: 'PARTIAL', quality: 2 },
      { d: 1, assigned: 8, done: 8, status: 'COMPLETED', quality: 1 },
      { d: 2, assigned: 12, done: 0, status: 'NOT_REMEMBERED', quality: null },
      { d: 3, assigned: 5, done: 5, status: 'COMPLETED', quality: 4 },
    ];
    for (const s of seeded) {
      const rec = await presentRecord(teacher, ids, 'S1', day(s.d));
      await recite(teacher, rec, { section: 'SABQI', paraNumber: 4, assigned: lines(s.assigned) }, { status: s.status, completed: lines(s.done), quality: s.quality });
    }
    const r = await report(teacher, 'S1', 'WEEK', day(0));
    const sum = (f: (s: (typeof seeded)[number]) => number) => seeded.reduce((a, s) => a + f(s), 0);
    const rated = seeded.flatMap((s) => (s.quality === null ? [] : [s.quality]));
    expect(sectionOf(r, 'SABQI').totals).toMatchObject({ assigned: [lines(sum((s) => s.assigned))], completed: [lines(sum((s) => s.done))], remaining: [lines(sum((s) => s.assigned - s.done))] });
    expect(sectionOf(r, 'SABQI').statusCounts).toMatchObject({ COMPLETED: 2, PARTIAL: 1, NOT_REMEMBERED: 1 });
    expect(r.quality).toMatchObject({ count: rated.length, sum: rated.reduce((a, q) => a + q, 0) });
    expect(r.attendance.counts).toMatchObject({ attended: 4, present: 4 });
  });

  test('F09-AC3 (US-039) a corrected record changes the next report view (AC-RPT-02)', async ({ as }) => {
    const teacher = await as('teacher.a1');
    const rec = await presentRecord(teacher, ids, 'S1', day(0));
    const { attemptId } = await recite(teacher, rec, { section: 'SABQI', paraNumber: 3, assigned: para(1) }, { status: 'PARTIAL', completed: para(1, 2), quality: 4 });
    const before = await report(teacher, 'S1', 'WEEK', day(0));
    expect(sectionOf(before, 'SABQI').totals).toMatchObject({ completed: [para(1, 2)] });
    expect(before.quality).toMatchObject({ display: '4.0' });
    await applied(teacher, correctAttemptOp(attemptId, 1, { status: 'COMPLETED', completed: para(1), quality: 2 }));
    const after = await report(teacher, 'S1', 'WEEK', day(0));
    expect(sectionOf(after, 'SABQI').totals).toMatchObject({ completed: [para(1)], remaining: [para(0)] });
    expect(after.quality).toMatchObject({ display: '2.0', count: 1 });
  });

  test('F09-AC4 (US-039) quantities are grouped by unit (AC-RPT-04)', async ({ as }) => {
    const teacher = await as('teacher.a1');
    const rec = await presentRecord(teacher, ids, 'S1', day(1));
    await recite(teacher, rec, { section: 'SABQI', position: 1, paraNumber: 4, assigned: lines(12) }, { status: 'COMPLETED', completed: lines(12) });
    await recite(teacher, rec, { section: 'SABQI', position: 2, paraNumber: 5, assigned: para(1, 2) }, { status: 'COMPLETED', completed: para(1, 2) });
    const r = await report(teacher, 'S1', 'WEEK', day(1));
    expect(sectionOf(r, 'SABQI').totals).toMatchObject({ assigned: [para(1, 2), lines(12)], completed: [para(1, 2), lines(12)] });
  });

  test('F09-AC5 (US-039) a portion with two attempts counts once with the latest status (AC-RPT-05)', async ({ as }) => {
    const teacher = await as('teacher.a1');
    const rec = await presentRecord(teacher, ids, 'S1', day(2));
    const { portionId } = await recite(teacher, rec, { section: 'MANZIL', paraNumber: 6, assigned: para(1) }, { status: 'PARTIAL', completed: para(1, 2) });
    await applied(teacher, attemptOp(portionId, { attemptNo: 2, status: 'COMPLETED', completed: para(1) }));
    const r = await report(teacher, 'S1', 'WEEK', day(2));
    expect(sectionOf(r, 'MANZIL').totals).toMatchObject({ assigned: [para(1)], completed: [para(1)] });
    expect(sectionOf(r, 'MANZIL').statusCounts).toMatchObject({ COMPLETED: 1, PARTIAL: 0 });
    expect(r.days[0].portions).toHaveLength(1);
    expect(r.days[0].portions[0]).toMatchObject({ status: 'COMPLETED', attempts: [expect.objectContaining({ status: 'PARTIAL' }), expect.objectContaining({ status: 'COMPLETED' })] });
  });

  test('F09-AC6 (US-039) confirmed homework and drafts are separate counts (AC-RPT-06)', async ({ as }) => {
    const teacher = await as('teacher.a1');
    const rec = await presentRecord(teacher, ids, 'S1', day(0));
    const { attemptId } = await recite(teacher, rec, { section: 'SABQI', paraNumber: 3, assigned: para(3, 4) }, { status: 'PARTIAL', completed: para(1, 2) });
    const added = () => ({ id: uuidv7(), section: 'SABQI', position: 1, paraNumber: 3, range: null, totalLines: null, assigned: para(1, 4), origin: 'TEACHER_ADDED', sourceAttemptId: null, instructions: null });
    const draft = (assignedDate: string, portions: object[], sourceDailyRecordId: string | null = null) =>
      op('homework_assignment', 'CREATE', uuidv7(), { studentId: ids.students.S1, sourceDailyRecordId, dueDate: null, instructions: null, assignedDate, portions });
    const suggested = { id: uuidv7(), section: 'SABQI', position: 1, paraNumber: null, range: null, totalLines: null, assigned: para(1), origin: 'SUGGESTED', sourceAttemptId: attemptId, instructions: null };
    const created = await applied(teacher, draft(day(0), [suggested], rec));
    await applied(teacher, op('homework_assignment', 'COMMAND', created.id, { confirmedAt: new Date().toISOString(), sources: await sourcesOf(teacher, rec) }, created.rowVersion, 'CONFIRM_HOMEWORK'));
    await applied(teacher, draft(day(1), [added()]));
    await applied(teacher, draft(day(2), [added()]));
    const r = await report(teacher, 'S1', 'WEEK', day(0));
    expect(r.homework).toMatchObject({ confirmed: 1, drafts: 2 });
  });

  test('F09-AC7 (US-039) scores 1, 3 and two missing → 2.0 · Good (2 ratings) (AC-RPT-03)', async ({ as }) => {
    const teacher = await as('teacher.a1');
    for (const [i, quality] of [1, 3, null, null].entries()) {
      const rec = await presentRecord(teacher, ids, 'S1', day(i));
      await recite(teacher, rec, { section: 'SABQI', paraNumber: 2, assigned: para(1) }, { status: 'COMPLETED', completed: para(1), quality });
    }
    const r = await report(teacher, 'S1', 'WEEK', day(0));
    // The app renders this as "2.0 · Good (2 ratings)" from the approved scale (apps/mobile/src/features/reports/view.ts).
    expect(r.quality).toMatchObject({ value: 2, display: '2.0', nearestScore: 2, count: 2 });
  });

  test('F09-AC8 (US-040) the monthly report keeps sections separate with Para-wise progress', async ({ as }) => {
    const teacher = await as('teacher.a1');
    const rec = await presentRecord(teacher, ids, 'S1', day(0));
    await recite(teacher, rec, { section: 'SABAQ', range: SABAQ_2_1_10, totalLines: 10, assigned: lines(10) }, { status: 'PARTIAL', completed: lines(7) });
    await recite(teacher, rec, { section: 'SABQI', paraNumber: 5, assigned: para(1, 2) }, { status: 'PARTIAL', completed: para(1, 4) });
    await recite(teacher, rec, { section: 'MANZIL', paraNumber: 11, assigned: para(1) }, { status: 'COMPLETED', completed: para(1) });
    const r = await report(teacher, 'S1', 'MONTH', day(0));
    expect(r.period.kind).toBe('MONTH');
    expect(r.sections.map((s: { section: string }) => s.section)).toEqual(['SABAQ', 'SABQI', 'MANZIL']);
    expect(sectionOf(r, 'SABAQ').totals).toMatchObject({ assigned: [lines(10)], completed: [lines(7)], remaining: [lines(3)] });
    expect(sectionOf(r, 'SABQI').paras).toEqual([expect.objectContaining({ paraNumber: 5, portionCount: 1 })]);
    expect(sectionOf(r, 'SABQI').pending).toHaveLength(1);
    expect(sectionOf(r, 'SABAQ').pending).toHaveLength(1);
    expect(sectionOf(r, 'MANZIL').pending).toHaveLength(0);
  });

  test('F09-AC9 (US-040) monthly homework has four separate measures', async ({ as }) => {
    const teacher = await as('teacher.a1');
    const rec = await presentRecord(teacher, ids, 'S1', day(0));
    const { attemptId } = await recite(teacher, rec, { section: 'SABQI', paraNumber: 3, assigned: para(3, 4) }, { status: 'PARTIAL', completed: para(1, 2) });
    const suggested = { id: uuidv7(), section: 'SABQI', position: 1, paraNumber: null, range: null, totalLines: null, assigned: para(1), origin: 'SUGGESTED', sourceAttemptId: attemptId, instructions: null };
    const extra = { id: uuidv7(), section: 'MANZIL', position: 1, paraNumber: 4, range: null, totalLines: null, assigned: para(1, 2), origin: 'TEACHER_ADDED', sourceAttemptId: null, instructions: null };
    const created = await applied(teacher, op('homework_assignment', 'CREATE', uuidv7(), { studentId: ids.students.S1, sourceDailyRecordId: rec, dueDate: null, instructions: null, assignedDate: day(0), portions: [suggested, extra] }));
    await applied(teacher, op('homework_assignment', 'COMMAND', created.id, { confirmedAt: new Date().toISOString(), sources: await sourcesOf(teacher, rec) }, created.rowVersion, 'CONFIRM_HOMEWORK'));
    // The next class day: the carried-forward portion is recited and completed.
    const hw = await getJson(teacher, `/homework/assignments/${created.id}`);
    const carried = hw.portions.find((p: { origin: string }) => p.origin === 'SUGGESTED');
    const tue = await presentRecord(teacher, ids, 'S1', day(1));
    const next = await applied(teacher, op('lesson_portion', 'CREATE', uuidv7(), { dailyRecordId: tue, section: 'SABQI', position: 1, isExtra: false, paraNumber: 3, range: null, totalLines: null, totalLinesSource: null, assigned: carried.assigned, homeworkPortionId: carried.id }));
    await applied(teacher, attemptOp(next.id, { status: 'COMPLETED', completed: carried.assigned }));
    const r = await report(teacher, 'S1', 'MONTH', day(0));
    expect(r.homework).toMatchObject({ assigned: 2, attempted: 1, completed: 1, carriedForward: 1 });
  });

  test('F09-AC10 (US-040) a Para with Major or repeated mistakes in 3+ attempts is listed', async ({ as }) => {
    const teacher = await as('teacher.a1');
    for (const i of [0, 1, 2]) {
      const rec = await presentRecord(teacher, ids, 'S1', day(i));
      await recite(teacher, rec, { section: 'SABQI', paraNumber: 7, assigned: para(1, 2) }, { status: 'PARTIAL', completed: para(1, 4), mistakes: [MAJOR, { category: 'LAFZI', severity: 'MINOR', repeated: true }] });
    }
    for (const i of [3, 4]) {
      const rec = await presentRecord(teacher, ids, 'S1', day(i));
      await recite(teacher, rec, { section: 'SABQI', paraNumber: 9, assigned: para(1, 2) }, { status: 'PARTIAL', completed: para(1, 4), mistakes: [MAJOR] });
    }
    const r = await report(teacher, 'S1', 'MONTH', day(0));
    const forPara7 = r.recurringDifficulties.filter((d: { paraNumber: number }) => d.paraNumber === 7);
    expect(forPara7).toEqual([expect.objectContaining({ majorOrRepeatedAttempts: 3, dates: [day(0), day(1), day(2)], byCategory: expect.objectContaining({ TAJWEED: 3, LAFZI: 3 }) })]);
    expect(r.recurringDifficulties.some((d: { paraNumber: number }) => d.paraNumber === 9)).toBe(false);
  });

  test('F09-AC11 (US-041) absent days do not appear as failed or zero performance', async ({ as }) => {
    const teacher = await as('teacher.a1');
    for (const i of [0, 1, 2, 3]) {
      const rec = await presentRecord(teacher, ids, 'S1', day(i));
      await recite(teacher, rec, { section: 'SABQI', paraNumber: 2, assigned: para(1, 2) }, { status: 'COMPLETED', completed: para(1, 2), quality: 2 });
    }
    await push(teacher, [mark('S1', day(4), 'ABSENT'), mark('S1', day(5), 'ABSENT')]);
    const r = await report(teacher, 'S1', 'WEEK', day(0));
    expect(r.attendance.counts).toMatchObject({ absent: 2, attended: 4 });
    expect(r.days.map((d: { date: string }) => d.date)).toEqual([day(0), day(1), day(2), day(3)]);
    expect(sectionOf(r, 'SABQI').statusCounts).toMatchObject({ ABSENT: 0, NOT_REMEMBERED: 0, COMPLETED: 4 });
    expect(r.quality).toMatchObject({ count: 4, value: 2 });
  });

  test('F09-AC12 (US-041) holidays and unscheduled Sundays are not absences (AC-RPT-08)', async ({ as }) => {
    const admin = await as('admin.a');
    expect((await admin.post('/calendar/exceptions', { data: { date: day(2), kind: 'HOLIDAY', label: 'Synthetic holiday', confirm: true } })).status()).toBe(201);
    const teacher = await as('teacher.a1');
    await push(teacher, [mark('S1', day(0), 'PRESENT'), mark('S1', day(1), 'PRESENT')]);
    const r = await report(teacher, 'S1', 'WEEK', day(0));
    const of = (d: string) => r.attendance.days.find((x: { date: string }) => x.date === d);
    expect(of(day(2))).toMatchObject({ category: 'HOLIDAY', exceptionLabel: 'Synthetic holiday' });
    expect(of(day(6))).toMatchObject({ category: 'UNSCHEDULED' });
    expect(r.attendance.counts).toMatchObject({ holidays: 1, unscheduled: 1, absent: 0 });
  });

  test('F09-AC13 (US-042) Leave and normal absences are counted separately', async ({ as }) => {
    const admin = await as('admin.a');
    const teacher = await as('teacher.a1');
    await push(admin, [mark('S1', day(0), 'LEAVE', 'Synthetic reason')]);
    const [requested] = await push(teacher, [mark('S1', day(1), 'LEAVE', 'Synthetic reason')]);
    expect((await admin.post(`/attendance/${requested!.entityId}/leave-decision`, { data: { decision: 'REJECT', rowVersion: 1 } })).status()).toBe(200);
    await push(teacher, [mark('S1', day(2), 'ABSENT')]);
    const r = await report(teacher, 'S1', 'WEEK', day(0));
    expect(r.attendance.counts).toMatchObject({ leave: 1, absent: 2 });
  });

  test('F09-AC14 (US-043) three Manzil portions on one day are three lines', async ({ as }) => {
    const teacher = await as('teacher.a1');
    const rec = await presentRecord(teacher, ids, 'S1', day(3));
    await recite(teacher, rec, { section: 'MANZIL', position: 1, paraNumber: 1, assigned: para(1) }, { status: 'COMPLETED', completed: para(1) });
    await recite(teacher, rec, { section: 'MANZIL', position: 2, paraNumber: 5, assigned: para(1) }, { status: 'PARTIAL', completed: para(1, 2) });
    await recite(teacher, rec, { section: 'MANZIL', position: 3, paraNumber: 10, assigned: para(1) }, { status: 'NOT_REMEMBERED' });
    const r = await report(teacher, 'S1', 'WEEK', day(3));
    expect(r.days[0].portions.map((p: { paraNumber: number; status: string; completed: unknown }) => [p.paraNumber, p.status, p.completed])).toEqual([
      [1, 'COMPLETED', para(1)],
      [5, 'PARTIAL', para(1, 2)],
      [10, 'NOT_REMEMBERED', para(0)],
    ]);
  });

  test('F09-AC15 (US-039) internal notes are absent from the payload for viewers without permission', async ({ as }) => {
    const teacher = await as('teacher.a1');
    const rec = await presentRecord(teacher, ids, 'S1', day(0));
    const { portionId } = await recite(teacher, rec, { section: 'SABQI', paraNumber: 3, assigned: para(1) }, { status: 'PARTIAL', completed: para(1, 2), mistakes: [{ ...MAJOR, note: 'Synthetic private note', noteVisibility: 'INTERNAL' }] });
    expect(portionId).toBeTruthy();
    // Staff see the note in the report (it is theirs).
    expect(JSON.stringify(await report(teacher, 'S1', 'WEEK', day(0)))).toContain('Synthetic private note');
    // Students and Parents receive no report body at all in F09 (the published view is F10).
    for (const who of ['student.s1', 'parent.p1'] as const) {
      const api = await as(who);
      const res = await api.get(`/reports/student?studentId=${ids.students.S1}&kind=WEEK&date=${day(0)}`);
      expect(res.status()).toBe(403);
      expect(await res.text()).not.toContain('Synthetic private note');
    }
  });

  // Added by the decision review of 2026-10-30 (SRS §17).
  test('F09-AC17 (US-041) attended counts Present, Late, and Half day; Leave and Absent are separate', async ({ as }) => {
    // Given one week with Present, Late, Half day, approved Leave, and Absent each once, when the report is built, then attended is 3, Late and Half day are each also shown as 1, Leave is 1, and normal absence is 1.
    const admin = await as('admin.a');
    const teacher = await as('teacher.a1');
    await push(teacher, [mark('S1', day(0), 'PRESENT'), mark('S1', day(1), 'LATE'), mark('S1', day(2), 'HALF_DAY'), mark('S1', day(4), 'ABSENT')]);
    await push(admin, [mark('S1', day(3), 'LEAVE', 'Synthetic reason')]);
    const r = await report(teacher, 'S1', 'WEEK', day(0));
    expect(r.attendance.counts).toMatchObject({ attended: 3, late: 1, halfDay: 1, leave: 1, absent: 1 });
  });

  test('F09-AC18 (US-073) the class summary has one derived row per enrolled student', async ({ as }) => {
    // Given a class and a week or month, when the class summary opens, then it has one row per student enrolled during the period with attendance counts (Present, Late, Half day, Leave, Absent), portions completed per section by unit, average quality with the number of ratings, and outstanding confirmed homework, all derived from source records.
    const teacher = await as('teacher.a1');
    const rec = await presentRecord(teacher, ids, 'S1', day(0));
    await recite(teacher, rec, { section: 'SABAQ', range: SABAQ_2_1_10, totalLines: 10, assigned: lines(10) }, { status: 'COMPLETED', completed: lines(10), quality: 1 });
    await push(teacher, [mark('S2', day(0), 'LATE'), mark('S2', day(1), 'ABSENT')]);
    for (const kind of ['WEEK', 'MONTH'] as const) {
      const s = await getJson(teacher, `/reports/class-summary?classId=${ids.classes.A1}&kind=${kind}&date=${day(0)}`);
      expect(s.rows.map((r: { studentId: string }) => r.studentId).sort()).toEqual([ids.students.S1, ids.students.S2].sort());
      const s1 = s.rows.find((r: { studentId: string }) => r.studentId === ids.students.S1);
      const s2 = s.rows.find((r: { studentId: string }) => r.studentId === ids.students.S2);
      expect(s1).toMatchObject({ attendance: { present: 1 }, completed: { SABAQ: [lines(10)], SABQI: [], MANZIL: [] }, quality: { count: 1, display: '1.0' }, outstandingHomework: 0 });
      expect(s2).toMatchObject({ attendance: { late: 1, absent: 1, present: 0, halfDay: 0, leave: 0 }, quality: { count: 0, value: null } });
    }
  });

  test('F09-AC19 (US-073) class summaries are staff-only and scoped to assigned classes', async ({ as, control }) => {
    // Given a Teacher, Student, or Parent, when they request a class summary, then a Teacher gets it only for assigned classes (or all classes with the flag), and a Student or Parent is refused.
    const url = (cls: string) => `/reports/class-summary?classId=${cls}&kind=WEEK&date=${day(0)}`;
    const a1 = await as('teacher.a1');
    expect((await a1.get(url(ids.classes.A1))).status()).toBe(200);
    expect((await a1.get(url(ids.classes.A2))).status()).toBe(404);
    for (const who of ['student.s1', 'parent.p1'] as const) expect((await (await as(who)).get(url(ids.classes.A1))).status()).toBe(403);
    expect((await (await as('admin.b')).get(url(ids.classes.A1))).status()).toBe(404);
    // The "all classes" flag widens a Teacher's reach (FR-SEC-003).
    expect((await (await as('teacher.a2')).get(url(ids.classes.A1))).status()).toBe(404);
    const owner = await as('owner.a');
    expect((await owner.post(`/accounts/${await control.userIdOf('teacher.a2')}/all-classes`, { data: { allClasses: true } })).status()).toBe(200);
    expect((await (await as('teacher.a2')).get(url(ids.classes.A1))).status()).toBe(200);
  });

  // Built in F09 at the user's request (2026-11-21, docs/handover/F09-plan.md §2): a minimal class-summary export;
  // F13 adds the madrasa's PDF template and F14 the other Excel exports.
  test('F09-AC20 (US-073) class summaries export to PDF and Excel with the same values', async ({ as, control }) => {
    // Given a class summary, when it is exported as PDF or Excel, then the file holds the same rows and values, with no internal notes.
    const teacher = await as('teacher.a1');
    const rec = await presentRecord(teacher, ids, 'S1', day(0));
    await recite(teacher, rec, { section: 'SABAQ', range: SABAQ_2_1_10, totalLines: 10, assigned: lines(10) }, { status: 'PARTIAL', completed: lines(7), quality: 2, mistakes: [{ ...MAJOR, note: 'Synthetic private note', noteVisibility: 'INTERNAL' }] });
    await push(teacher, [mark('S2', day(0), 'LATE'), mark('S2', day(1), 'ABSENT')]);
    const q = `classId=${ids.classes.A1}&kind=WEEK&date=${day(0)}`;
    const screen = await getJson(teacher, `/reports/class-summary?${q}`);

    // Excel: the same rows and values, cell by cell.
    const xlsx = await teacher.get(`/reports/class-summary/export?${q}&format=xlsx`);
    expect(xlsx.status()).toBe(200);
    expect(xlsx.headers()['content-type']).toContain('spreadsheetml');
    const { default: ExcelJS } = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await xlsx.body());
    const rows = wb.getWorksheet('ClassSummary')!.getSheetValues().slice(2).map((r) => (r as unknown[]).slice(1));
    expect(rows.map((r) => r[0])).toEqual(screen.rows.map((r: { studentName: string }) => r.studentName));
    for (const [i, row] of screen.rows.entries()) {
      expect(rows[i]!.slice(1, 8)).toEqual([row.attendance.scheduled, row.attendance.attended, row.attendance.present, row.attendance.late, row.attendance.halfDay, row.attendance.leave, row.attendance.absent]);
      expect(rows[i]!.slice(11, 14)).toEqual([row.quality.display ?? 'Not recorded', row.quality.count, row.outstandingHomework]);
    }
    expect(rows[0]![8]).toBe('7 lines');
    expect(JSON.stringify(wb.model)).not.toContain('Synthetic private note');

    // PDF: a real PDF from the same summary (its HTML is checked row by row in the integration tests), no note in it.
    const pdf = await teacher.get(`/reports/class-summary/export?${q}&format=pdf`);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()['content-type']).toBe('application/pdf');
    const bytes = await pdf.body();
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(bytes.toString('latin1')).not.toContain('Synthetic private note');

    // Staff only, and every export is audited.
    for (const who of ['student.s1', 'parent.p1'] as const) expect((await (await as(who)).get(`/reports/class-summary/export?${q}&format=pdf`)).status()).toBe(403);
    const audit = await control.auditForTarget(ids.classes.A1);
    expect(audit.filter((a) => a.action === 'CLASS_SUMMARY_EXPORTED').map((a) => (a.summary as { format: string }).format).sort()).toEqual(['pdf', 'xlsx']);
  });

  test('F09 edge (US-039) no records in the period reads "No records for this period", never a page of zeros', async ({ as }) => {
    const r = await report(await as('teacher.a1'), 'S2', 'WEEK', day(0));
    expect(r.hasData).toBe(false);
    expect(r.quality.value).toBeNull();
    // A record whose day later became a holiday is left out, not deleted.
    const teacher = await as('teacher.a1');
    const rec = await presentRecord(teacher, ids, 'S2', day(1));
    await recite(teacher, rec, { section: 'SABQI', paraNumber: 2, assigned: para(1) }, { status: 'COMPLETED', completed: para(1) });
    expect((await report(teacher, 'S2', 'WEEK', day(0))).days).toHaveLength(1);
    expect((await (await as('admin.a')).post('/calendar/exceptions', { data: { date: day(1), kind: 'HOLIDAY', label: 'Synthetic', confirm: true } })).status()).toBe(201);
    const after = await report(teacher, 'S2', 'WEEK', day(0));
    expect(after.days).toHaveLength(0);
    expect(after.excludedRecords).toHaveLength(1);
    expect((await recordDetail(teacher, rec)).record.id).toBe(rec);
  });
});

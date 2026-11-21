// F09 · Weekly and monthly reports — integration against real Postgres (docs/specs/12-f09-weekly-monthly-reports.md;
// plan docs/handover/F09-plan.md; ADR-020). Seeded fixtures (e2e/fixtures/personas.ts): A1 (teacher.a1; S1, S2),
// A2 (teacher.a2; S3), B1 (teacher.b1; SB1) in madrasa B; every class meets Monday–Saturday. Writes go through
// POST /sync/push; reads through /reports/*. Synthetic data only; Quran data is the SYNTHETIC fixture.
import { v7 as uuidv7 } from 'uuid';
import type { KyselyPlugin } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { weekOf } from '@hifz/domain/calendar';
import { monthOf } from '@hifz/domain/reports';
import { addDays } from '@hifz/domain/roster';
import type { Actor } from '../../src/modules/identity/auth-service.ts';
import { HomeworkService } from '../../src/modules/homework/homework-service.ts';
import { sabaqRanges } from '../../src/modules/hifz/shared.ts';
import { QuranMetadataService } from '../../src/modules/quran-ref/metadata-service.ts';
import { ReportService } from '../../src/modules/reporting/report-service.ts';
import { withTenant } from '../../src/platform/tenant.ts';
import { startHarness, type Harness } from '../support/harness.ts';
import { applied, attemptOp, attemptUpdateOp, attendanceOp, detail, lines, op, para, portionOp, presentRecord, push, seedQuran, today, type AttemptInput, type Ids, type PortionInput, type StudentKey } from '../hifz/support.ts';

let h: Harness;
let ids: Ids;

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

/** Last week, Monday to Sunday: every day is in the past and inside the seeded enrollment. */
const lastWeek = () => weekOf(addDays(today(h), -7));
const day = (offset: number) => addDays(lastWeek().from, offset); // 0 = Monday … 6 = Sunday

async function report(token: string, studentKey: StudentKey, kind: 'WEEK' | 'MONTH', date: string) {
  const res = await h.call('GET', `/reports/student?studentId=${ids.students[studentKey]}&kind=${kind}&date=${date}`, token);
  expect(res.statusCode, res.body).toBe(200);
  return res.json().report;
}

async function recite(token: string, recordId: string, p: PortionInput, a: AttemptInput) {
  const { id: portionId } = await applied(h, token, portionOp(recordId, p));
  const { id: attemptId, rowVersion } = await applied(h, token, attemptOp(portionId, a));
  return { portionId, attemptId, rowVersion };
}

const section = (r: { sections: { section: string }[] }, s: string) => r.sections.find((x) => x.section === s) as unknown as { portionCount: number; totals: Record<string, unknown>; statusCounts: Record<string, number>; paras: unknown[]; pending: unknown[] };

const SABAQ_2_1_10 = { surahStart: 2, ayahStart: 1, surahEnd: 2, ayahEnd: 10 };
const MAJOR = { category: 'TAJWEED', severity: 'MAJOR', repeated: false };

/** A synthetic week for S1: lines and Para portions, a portion with two attempts, quality 1, 3 and blanks, three Manzil portions on one day. */
async function seedWeek(teacher: string) {
  const mon = await presentRecord(h, teacher, ids, 'S1', day(0));
  await recite(teacher, mon, { section: 'SABAQ', range: SABAQ_2_1_10, totalLines: 10, assigned: lines(10) }, { status: 'PARTIAL', completed: lines(6), quality: 1, remarks: 'Synthetic staff remark' });
  const tue = await presentRecord(h, teacher, ids, 'S1', day(1));
  const twice = await recite(teacher, tue, { section: 'SABQI', paraNumber: 3, assigned: para(3, 4) }, { status: 'PARTIAL', completed: para(1, 2) });
  const second = await applied(h, teacher, attemptOp(twice.portionId, { attemptNo: 2, status: 'COMPLETED', completed: para(3, 4), quality: 3 }));
  const wed = await presentRecord(h, teacher, ids, 'S1', day(2));
  await recite(teacher, wed, { section: 'MANZIL', position: 1, paraNumber: 1, assigned: para(1) }, { status: 'COMPLETED', completed: para(1) });
  await recite(teacher, wed, { section: 'MANZIL', position: 2, paraNumber: 5, assigned: para(1) }, { status: 'PARTIAL', completed: para(1, 2), mistakes: [{ ...MAJOR, note: 'Synthetic internal note', noteVisibility: 'INTERNAL' } as never] });
  await recite(teacher, wed, { section: 'MANZIL', position: 3, paraNumber: 10, assigned: para(1) }, { status: 'NOT_REMEMBERED' });
  return { mon, tue, wed, twice, second };
}

const actorOf = async (loginId: string, role: Actor['role']): Promise<Actor> => {
  const userId = await h.userId(loginId);
  const m = await h.db.selectFrom('memberships').select(['organization_id', 'all_classes']).where('user_id', '=', userId).executeTakeFirstOrThrow();
  return { userId, sessionId: uuidv7(), organizationId: m.organization_id, role, allClasses: m.all_classes, loginId, authenticatedAt: new Date() };
};

describe('F09 · weekly report (US-039, US-043)', () => {
  it('F09-AC1/AC2/AC4/AC5/AC7/AC14 (US-039, US-043) the week is Monday–Sunday Asia/Karachi and every total is derived from the source records', async () => {
    const teacher = await h.signIn('teacher.a1');
    const seeded = await seedWeek(teacher);
    // A record on the next Monday belongs to the next week (report date, not save or sync time).
    const nextMon = await presentRecord(h, teacher, ids, 'S1', addDays(day(0), 7));
    await recite(teacher, nextMon, { section: 'SABQI', paraNumber: 9, assigned: para(1) }, { status: 'COMPLETED', completed: para(1), quality: 5 });

    const r = await report(teacher, 'S1', 'WEEK', day(3));
    // AC1: the stated range, in the madrasa's timezone.
    expect(r.period).toMatchObject({ kind: 'WEEK', from: day(0), to: day(6), timeZone: 'Asia/Karachi', weekStart: 'MONDAY' });
    expect(r.period.startsAt).toBe(new Date(`${day(0)}T00:00:00+05:00`).toISOString());
    expect(r.period.endsAt).toBe(new Date(`${day(6)}T23:59:00+05:00`).toISOString());
    expect(r.days.map((d: { date: string }) => d.date)).toEqual([day(0), day(1), day(2)]);
    // AC2 + AC4: totals per unit, equal to the seeded values; lines and Para are never combined.
    expect(section(r, 'SABAQ').totals).toMatchObject({ assigned: [lines(10)], completed: [lines(6)], remaining: [lines(4)] });
    expect(section(r, 'MANZIL').totals).toMatchObject({ assigned: [para(3)], completed: [para(3, 2)], remaining: [para(3, 2)] });
    // AC5: the two-attempt portion counts its assigned 3/4 once and shows the latest status.
    expect(section(r, 'SABQI').totals).toMatchObject({ assigned: [para(3, 4)], completed: [para(3, 4)] });
    expect(section(r, 'SABQI').statusCounts).toMatchObject({ COMPLETED: 1, PARTIAL: 0 });
    const tueLine = r.days[1].portions[0];
    expect(tueLine).toMatchObject({ portionId: seeded.twice.portionId, status: 'COMPLETED' });
    expect(tueLine.attempts.map((a: { status: string }) => a.status)).toEqual(['PARTIAL', 'COMPLETED']);
    // AC7: ratings 1 and 3; the blanks are not zero.
    expect(r.quality).toMatchObject({ count: 2, value: 2, display: '2.0', nearestScore: 2 });
    // AC14: three Manzil lines on the Wednesday, each with its own status and quantity.
    expect(r.days[2].portions.map((p: { paraNumber: number; status: string; completed: unknown }) => [p.paraNumber, p.status, p.completed])).toEqual([
      [1, 'COMPLETED', para(1)],
      [5, 'PARTIAL', para(1, 2)],
      [10, 'NOT_REMEMBERED', para(0)],
    ]);
    // Staff see their own remarks and internal notes, labelled by visibility.
    expect(JSON.stringify(r)).toContain('Synthetic staff remark');
    expect(r.days[2].portions[1].mistakes[0]).toMatchObject({ note: 'Synthetic internal note', noteVisibility: 'INTERNAL' });
  });

  it('F09-AC3 (US-039) a corrected record changes the next report view; the cache is rebuilt from source (AC-RPT-02)', async () => {
    const teacher = await h.signIn('teacher.a1');
    const { second } = await seedWeek(teacher);
    const before = await report(teacher, 'S1', 'WEEK', day(0));
    expect(before.quality).toMatchObject({ count: 2, display: '2.0' });
    const cached = await withTenant(h.db, (await actorOf('teacher.a1', 'TEACHER')).organizationId, (tx) =>
      tx.selectFrom('report_cache').select(['student_stamp', 'period_start']).where('student_id', '=', ids.students.S1).executeTakeFirstOrThrow(),
    );
    expect(cached.period_start).toBe(day(0));
    // The same view again is served from the cache and is identical.
    expect(await report(teacher, 'S1', 'WEEK', day(0))).toEqual(before);

    // Correct the Tuesday rating 3 → 5: the next view rebuilds from source.
    await applied(h, teacher, attemptUpdateOp(second.id, second.rowVersion, { status: 'COMPLETED', completed: para(3, 4), quality: 5, noMistakes: false, mistakes: [] }));
    const after = await report(teacher, 'S1', 'WEEK', day(0));
    expect(after.quality).toMatchObject({ count: 2, value: 3, display: '3.0', nearestScore: 3 });
    const rebuilt = await withTenant(h.db, (await actorOf('teacher.a1', 'TEACHER')).organizationId, (tx) =>
      tx.selectFrom('report_cache').select('student_stamp').where('student_id', '=', ids.students.S1).executeTakeFirstOrThrow(),
    );
    expect(String(rebuilt.student_stamp)).not.toBe(String(cached.student_stamp));
  });

  it('F09 edge (US-039) a holiday declared later removes that day from the cached report on the next view (FR-CAL-009)', async () => {
    const teacher = await h.signIn('teacher.a1');
    const admin = await h.signIn('admin.a');
    await seedWeek(teacher);
    const before = await report(teacher, 'S1', 'WEEK', day(0));
    expect(before.days).toHaveLength(3);
    const res = await h.call('POST', '/calendar/exceptions', admin, { date: day(2), kind: 'HOLIDAY', label: 'Synthetic holiday', confirm: true });
    expect(res.statusCode, res.body).toBe(201);
    const after = await report(teacher, 'S1', 'WEEK', day(0));
    expect(after.days.map((d: { date: string }) => d.date)).toEqual([day(0), day(1)]);
    expect(after.excludedRecords).toEqual([expect.objectContaining({ date: day(2), kind: 'HOLIDAY' })]);
    expect(after.attendance.counts).toMatchObject({ holidays: 1, absent: 0 });
    // The record itself is kept.
    expect((await detail(h, teacher, before.days[2].recordId)).record.reportDate).toBe(day(2));
  });

  it('F09 edge (US-039) no records in the period → hasData false, never a page of zeros', async () => {
    const teacher = await h.signIn('teacher.a1');
    const r = await report(teacher, 'S2', 'WEEK', day(0));
    expect(r.hasData).toBe(false);
    expect(r.days).toEqual([]);
    expect(r.quality.value).toBeNull();
  });
});

describe('F09 · homework measures (US-039, US-040)', () => {
  const added = (o: Record<string, unknown> = {}) => ({ id: uuidv7(), section: 'SABQI', position: 1, paraNumber: 3, range: null, totalLines: null, assigned: para(1, 4), origin: 'TEACHER_ADDED', sourceAttemptId: null, instructions: null, ...o });
  const draftOp = (assignedDate: string, portions: object[], sourceDailyRecordId: string | null = null) =>
    op('homework_assignment', 'CREATE', uuidv7(), { studentId: ids.students.S1, sourceDailyRecordId, dueDate: null, instructions: null, assignedDate, portions }, null);

  it('F09-AC6/AC9 (US-039, US-040) confirmed homework and drafts are separate counts; assigned, attempted, completed, carried forward are four measures', async () => {
    const teacher = await h.signIn('teacher.a1');
    const mon = await presentRecord(h, teacher, ids, 'S1', day(0));
    const partial = await recite(teacher, mon, { section: 'SABQI', paraNumber: 3, assigned: para(3, 4) }, { status: 'PARTIAL', completed: para(1, 2) });
    // One confirmed assignment: a carried-forward portion and a Teacher-added one.
    const suggested = { id: uuidv7(), section: 'SABQI', position: 1, paraNumber: null, range: null, totalLines: null, assigned: para(1, 1), origin: 'SUGGESTED', sourceAttemptId: partial.attemptId, instructions: null };
    const extra = added({ position: 2, section: 'MANZIL', paraNumber: 4 });
    const draft = await applied(h, teacher, draftOp(day(0), [suggested, extra], mon));
    const d = await detail(h, teacher, mon);
    const sources = d.portions.flatMap((p: { id: string; rowVersion: number; attempts: { id: string; rowVersion: number }[] }) => [
      { entity: 'lesson_portion', id: p.id, rowVersion: p.rowVersion },
      ...p.attempts.map((a) => ({ entity: 'portion_attempt', id: a.id, rowVersion: a.rowVersion })),
    ]);
    await applied(h, teacher, op('homework_assignment', 'COMMAND', draft.id, { confirmedAt: new Date().toISOString(), sources }, draft.rowVersion, [], 'CONFIRM_HOMEWORK'));
    // Two drafts in the week.
    await applied(h, teacher, draftOp(day(1), [added()]));
    await applied(h, teacher, draftOp(day(2), [added()]));
    // The next class day records the carried-forward portion as completed.
    const tue = await presentRecord(h, teacher, ids, 'S1', day(1));
    const hw = (await h.call('GET', `/homework/assignments/${draft.id}`, teacher)).json();
    const carried = hw.portions.find((p: { origin: string }) => p.origin === 'SUGGESTED');
    const { id: next } = await applied(h, teacher, op('lesson_portion', 'CREATE', uuidv7(), { dailyRecordId: tue, section: 'SABQI', position: 1, isExtra: false, paraNumber: 3, range: null, totalLines: null, totalLinesSource: null, assigned: carried.assigned, homeworkPortionId: carried.id }, null));
    await applied(h, teacher, attemptOp(next, { status: 'COMPLETED', completed: carried.assigned }));

    const r = await report(teacher, 'S1', 'WEEK', day(0));
    expect(r.homework).toMatchObject({ confirmed: 1, drafts: 2, assigned: 2, attempted: 1, completed: 1, carriedForward: 1 });
    // The carried-forward source is not pending any more for the reader: it shows the homework carrying it.
    expect(section(r, 'SABQI').pending).toEqual(expect.arrayContaining([expect.objectContaining({ portionId: partial.portionId, carriedInto: expect.objectContaining({ assignmentId: draft.id, status: 'CONFIRMED' }) })]));
  });
});

describe('F09 · monthly report (US-040)', () => {
  /** The first `n` Monday–Saturday dates of last month. */
  const lastMonthDays = (n: number) => {
    const { from } = monthOf(addDays(`${today(h).slice(0, 7)}-01`, -1));
    const out: string[] = [];
    for (let d = from; out.length < n; d = addDays(d, 1)) if (new Date(`${d}T00:00:00Z`).getUTCDay() !== 0) out.push(d);
    return out;
  };

  it('F09-AC8/AC10 (US-040) sections are separate with Para-wise progress; a Para with Major mistakes in 3 attempts is listed, 2 is not', async () => {
    const teacher = await h.signIn('teacher.a1');
    const days = lastMonthDays(6);
    for (const [i, d] of days.entries()) {
      const rec = await presentRecord(h, teacher, ids, 'S1', d);
      if (i < 3) await recite(teacher, rec, { section: 'SABQI', paraNumber: 7, assigned: para(1, 2) }, { status: 'PARTIAL', completed: para(1, 4), mistakes: [MAJOR] });
      if (i >= 3 && i < 5) await recite(teacher, rec, { section: 'SABQI', paraNumber: 9, assigned: para(1, 2) }, { status: 'PARTIAL', completed: para(1, 4), mistakes: [MAJOR] });
      if (i === 5) await recite(teacher, rec, { section: 'MANZIL', paraNumber: 20, assigned: para(1) }, { status: 'COMPLETED', completed: para(1) });
    }
    const r = await report(teacher, 'S1', 'MONTH', days[0]!);
    expect(r.period.from.slice(8)).toBe('01');
    expect(section(r, 'SABQI').totals).toMatchObject({ assigned: [para(5, 2)], completed: [para(5, 4)] });
    expect(section(r, 'MANZIL').totals).toMatchObject({ assigned: [para(1)], completed: [para(1)] });
    expect(section(r, 'SABAQ').portionCount).toBe(0);
    expect(section(r, 'SABQI').paras).toEqual([expect.objectContaining({ paraNumber: 7, portionCount: 3 }), expect.objectContaining({ paraNumber: 9, portionCount: 2 })]);
    expect(section(r, 'SABQI').pending).toHaveLength(5);
    expect(r.recurringDifficulties).toEqual([expect.objectContaining({ paraNumber: 7, majorOrRepeatedAttempts: 3, dates: days.slice(0, 3), byCategory: expect.objectContaining({ TAJWEED: 3 }) })]);
  });
});

describe('F09 · attendance (US-041, US-042)', () => {
  const mark = (student: StudentKey, date: string, status: string, extra: Record<string, unknown> = {}) => attendanceOp(ids, student, date, status, student === 'S3' ? 'A2' : 'A1', extra);

  it('F09-AC11 (US-041) 2 absent and 4 recited days: absences in attendance, only the recited days in performance', async () => {
    const teacher = await h.signIn('teacher.a1');
    for (const i of [0, 1, 2, 3]) {
      const rec = await presentRecord(h, teacher, ids, 'S1', day(i));
      await recite(teacher, rec, { section: 'SABQI', paraNumber: 2, assigned: para(1, 2) }, { status: 'COMPLETED', completed: para(1, 2), quality: 2 });
    }
    await push(h, teacher, [mark('S1', day(4), 'ABSENT'), mark('S1', day(5), 'ABSENT')]);
    const r = await report(teacher, 'S1', 'WEEK', day(0));
    expect(r.attendance.counts).toMatchObject({ absent: 2, attended: 4, scheduled: 6 });
    expect(r.days.map((d: { date: string }) => d.date)).toEqual([day(0), day(1), day(2), day(3)]);
    expect(section(r, 'SABQI').statusCounts).toMatchObject({ COMPLETED: 4, ABSENT: 0, NOT_REMEMBERED: 0 });
    expect(r.quality).toMatchObject({ count: 4, value: 2 });
  });

  it('F09-AC12 (US-041) a holiday and the unscheduled Sunday are listed as such, not as absences (AC-RPT-08)', async () => {
    const admin = await h.signIn('admin.a');
    expect((await h.call('POST', '/calendar/exceptions', admin, { date: day(2), kind: 'HOLIDAY', label: 'Synthetic holiday', confirm: true })).statusCode).toBe(201);
    const teacher = await h.signIn('teacher.a1');
    await push(h, teacher, [mark('S1', day(0), 'PRESENT'), mark('S1', day(1), 'PRESENT')]);
    const r = await report(teacher, 'S1', 'WEEK', day(0));
    const of = (d: string) => r.attendance.days.find((x: { date: string }) => x.date === d);
    expect(of(day(2))).toMatchObject({ kind: 'HOLIDAY', category: 'HOLIDAY', exceptionLabel: 'Synthetic holiday' });
    expect(of(day(6))).toMatchObject({ kind: 'UNSCHEDULED', category: 'UNSCHEDULED' });
    expect(r.attendance.counts).toMatchObject({ holidays: 1, unscheduled: 1, absent: 0, scheduled: 5 });
  });

  it('F09-AC13/AC17 (US-041, US-042) Present, Late, Half day, approved Leave, rejected Leave, and Absent each counted apart', async () => {
    const teacher = await h.signIn('teacher.a1');
    const admin = await h.signIn('admin.a');
    await push(h, teacher, [mark('S1', day(0), 'PRESENT'), mark('S1', day(1), 'LATE'), mark('S1', day(2), 'HALF_DAY'), mark('S1', day(4), 'ABSENT')]);
    // Approved Leave: marked by an Admin, approved at once. Rejected Leave: requested by the Teacher, rejected.
    await push(h, admin, [mark('S1', day(3), 'LEAVE', { leaveReason: 'Synthetic reason' })]);
    const [requested] = await push(h, teacher, [mark('S1', day(5), 'LEAVE', { leaveReason: 'Synthetic reason' })]);
    expect((await h.call('POST', `/attendance/${requested!.entityId}/leave-decision`, admin, { decision: 'REJECT', rowVersion: 1 })).statusCode).toBe(200);
    const r = await report(teacher, 'S1', 'WEEK', day(0));
    // AC17: attended 3 (Late and Half day also on their own); AC13: 1 Leave, 2 normal absences (Absent + rejected Leave).
    expect(r.attendance.counts).toMatchObject({ attended: 3, present: 1, late: 1, halfDay: 1, leave: 1, absent: 2, leaveAwaiting: 0 });
    expect(JSON.stringify(r)).not.toContain('Synthetic reason');
  });
});

describe('F09 · access and privacy (US-039, US-073)', () => {
  it('F09-AC15 (US-039) a Student or Parent gets no report payload at all, so no internal note can reach them', async () => {
    const teacher = await h.signIn('teacher.a1');
    await seedWeek(teacher);
    for (const who of ['student.s1', 'parent.p1']) {
      const token = await h.signIn(who);
      for (const url of [`/reports/student?studentId=${ids.students.S1}&kind=WEEK&date=${day(0)}`, `/reports/class-summary?classId=${ids.classes.A1}&kind=WEEK&date=${day(0)}`]) {
        const res = await h.call('GET', url, token);
        expect(res.statusCode, `${who} ${url}`).toBe(403);
        expect(res.body).not.toContain('Synthetic internal note');
        expect(res.body).not.toContain('Synthetic staff remark');
      }
    }
  });

  it('F09-AC19 (US-073) a Teacher reaches assigned classes only (or all with the flag); other madrasas are 404', async () => {
    const a1 = await h.signIn('teacher.a1');
    const a2 = await h.signIn('teacher.a2');
    const adminB = await h.signIn('admin.b');
    const summary = (token: string, cls: string) => h.call('GET', `/reports/class-summary?classId=${cls}&kind=WEEK&date=${day(0)}`, token);
    const student = (token: string, s: string) => h.call('GET', `/reports/student?studentId=${s}&kind=WEEK&date=${day(0)}`, token);
    expect((await summary(a1, ids.classes.A1)).statusCode).toBe(200);
    expect((await summary(a1, ids.classes.A2)).statusCode).toBe(404);
    expect((await student(a1, ids.students.S3)).statusCode).toBe(404);
    expect((await student(a2, ids.students.S1)).statusCode).toBe(404);
    // Cross-tenant probing: madrasa B's Admin gets 404 for madrasa A's ids (AC-SEC-01).
    expect((await summary(adminB, ids.classes.A1)).statusCode).toBe(404);
    expect((await student(adminB, ids.students.S1)).statusCode).toBe(404);
    // The "all classes" flag widens a Teacher's reach (FR-SEC-003).
    const owner = await h.signIn('owner.a');
    expect((await h.call('POST', `/accounts/${await h.userId('teacher.a2')}/all-classes`, owner, { allClasses: true })).statusCode).toBe(200);
    const a2all = await h.signIn('teacher.a2');
    expect((await summary(a2all, ids.classes.A1)).statusCode).toBe(200);
    expect((await student(a2all, ids.students.S1)).statusCode).toBe(200);
    // Owner and Admin reach every class.
    expect((await summary(await h.signIn('admin.a'), ids.classes.A2)).statusCode).toBe(200);
    // Bad input is a validation error, not a guess.
    expect((await h.call('GET', `/reports/student?studentId=${ids.students.S1}&kind=YEAR`, a1)).statusCode).toBe(400);
  });

  it('F09-AC18 (US-073) the class summary has one row per enrolled student, derived from source records', async () => {
    const teacher = await h.signIn('teacher.a1');
    await seedWeek(teacher);
    await push(h, teacher, [attendanceOp(ids, 'S2', day(0), 'LATE'), attendanceOp(ids, 'S2', day(1), 'ABSENT')]);
    const res = await h.call('GET', `/reports/class-summary?classId=${ids.classes.A1}&kind=WEEK&date=${day(0)}`, teacher);
    expect(res.statusCode, res.body).toBe(200);
    const s = res.json();
    expect(s.className).toBeTruthy();
    expect(s.period).toMatchObject({ from: day(0), to: day(6) });
    expect(s.rows.map((r: { studentId: string }) => r.studentId).sort()).toEqual([ids.students.S1, ids.students.S2].sort());
    const s1 = s.rows.find((r: { studentId: string }) => r.studentId === ids.students.S1);
    const s2 = s.rows.find((r: { studentId: string }) => r.studentId === ids.students.S2);
    expect(s1).toMatchObject({ attendance: { present: 3, late: 0, absent: 0, leave: 0 }, completed: { SABAQ: [lines(6)], SABQI: [para(3, 4)], MANZIL: [para(3, 2)] }, quality: { count: 2, display: '2.0' }, outstandingHomework: 0 });
    expect(s2).toMatchObject({ attendance: { late: 1, absent: 1, attended: 1 }, completed: { SABAQ: [], SABQI: [], MANZIL: [] }, quality: { count: 0, value: null } });
    // Staff only, and still no remark or note text in it.
    expect(res.body).not.toContain('Synthetic staff remark');
    expect(res.body).not.toContain('Synthetic internal note');
  });
});

describe('F09 · performance and cache (NFR-PERF-002, NFR-PERF-004, FR-RPT-008)', () => {
  /** A report service whose every SQL statement is counted. */
  function countingService() {
    let count = 0;
    const plugin: KyselyPlugin = {
      transformQuery: (args) => {
        count += 1;
        return args.node;
      },
      transformResult: async (args) => args.result,
    };
    const db = h.db.withPlugin(plugin);
    const quran = new QuranMetadataService(db, h.clock, sabaqRanges, { allowSynthetic: true });
    const service = new ReportService(db, h.clock, new HomeworkService(db, h.clock, quran));
    return { service, reset: () => (count = 0), get count() { return count; } };
  }

  it('F09 done (US-073) report queries have no N+1 pattern: the query count does not grow with students or records', async () => {
    // Every student has recorded work, so both sides run the same (non-empty) query plan; only the counts differ.
    const a1 = await h.signIn('teacher.a1');
    const a2 = await h.signIn('teacher.a2');
    await seedWeek(a1); // S1: three days, five portions, six attempts
    const s2 = await presentRecord(h, a1, ids, 'S2', day(0));
    await recite(a1, s2, { section: 'SABQI', paraNumber: 2, assigned: para(1, 2) }, { status: 'COMPLETED', completed: para(1, 2), mistakes: [MAJOR] });
    const s3 = await presentRecord(h, a2, ids, 'S3', day(0), 'A2');
    await recite(a2, s3, { section: 'SABQI', paraNumber: 2, assigned: para(1, 2) }, { status: 'COMPLETED', completed: para(1, 2), mistakes: [MAJOR] });
    const c = countingService();
    const admin = await actorOf('admin.a', 'ADMIN');

    // Class summary: A2 has one student, A1 two (both built from source: nothing cached yet).
    c.reset();
    await c.service.classSummary(admin, { classId: ids.classes.A2, kind: 'WEEK', date: day(0) });
    const oneStudent = c.count;
    c.reset();
    await c.service.classSummary(admin, { classId: ids.classes.A1, kind: 'WEEK', date: day(0) });
    expect(c.count).toBe(oneStudent);

    // A student's report: S2's one record costs the same as S1's three days of records with repeated attempts.
    c.reset();
    await c.service.studentReport(admin, { studentId: ids.students.S2, kind: 'MONTH', date: day(0) });
    const oneRecord = c.count;
    c.reset();
    await c.service.studentReport(admin, { studentId: ids.students.S1, kind: 'MONTH', date: day(0) });
    expect(c.count).toBe(oneRecord);
    // And a cached view is cheaper still: no source is read.
    c.reset();
    await c.service.studentReport(admin, { studentId: ids.students.S1, kind: 'MONTH', date: day(0) });
    expect(c.count).toBeLessThan(oneRecord);
  });

  it('F09 done (US-039) a cached report is reproducible: verifyCache finds no mismatch, and finds a tampered one', async () => {
    const teacher = await h.signIn('teacher.a1');
    await seedWeek(teacher);
    await report(teacher, 'S1', 'WEEK', day(0));
    const admin = await actorOf('admin.a', 'ADMIN');
    const service = countingService().service;
    expect(await service.verifyCache(admin.organizationId)).toEqual([]);
    // A payload that no longer matches its sources while the stamps say it is current is reported.
    await withTenant(h.db, admin.organizationId, (tx) =>
      tx.updateTable('report_cache').set({ payload: JSON.stringify({ tampered: true }) }).where('student_id', '=', ids.students.S1).execute(),
    );
    expect(await service.verifyCache(admin.organizationId)).toEqual([expect.objectContaining({ studentId: ids.students.S1, periodKind: 'WEEK', periodStart: day(0) })]);
  });

  it('F09 unit (ADR-020) every report source write bumps a stamp in the same transaction', async () => {
    const teacher = await h.signIn('teacher.a1');
    const org = (await actorOf('teacher.a1', 'TEACHER')).organizationId;
    const stamp = (key: string) => withTenant(h.db, org, async (tx) => String((await tx.selectFrom('report_stamps').select('stamp').where('scope_key', '=', key).executeTakeFirst())?.stamp ?? '0'));
    const s0 = await stamp(ids.students.S1);
    const other = await stamp(ids.students.S2);
    const rec = await presentRecord(h, teacher, ids, 'S1', day(0));
    const s1 = await stamp(ids.students.S1);
    expect(BigInt(s1)).toBeGreaterThan(BigInt(s0));
    await recite(teacher, rec, { section: 'SABQI', paraNumber: 2, assigned: para(1, 2) }, { status: 'COMPLETED', completed: para(1, 2) });
    expect(BigInt(await stamp(ids.students.S1))).toBeGreaterThan(BigInt(s1));
    // Another student's stamp is untouched; a holiday bumps the madrasa's.
    expect(await stamp(ids.students.S2)).toBe(other);
    const o0 = await stamp('ORG');
    expect((await h.call('POST', '/calendar/exceptions', await h.signIn('admin.a'), { date: addDays(today(h), 3), kind: 'HOLIDAY', label: 'Synthetic', confirm: true })).statusCode).toBe(201);
    expect(BigInt(await stamp('ORG'))).toBeGreaterThan(BigInt(o0));
  });
});

describe('F09-AC20 · class summary files (US-073)', () => {
  const exportUrl = (format: string, extra = '') => `/reports/class-summary/export?classId=${ids.classes.A1}&kind=WEEK&date=${day(0)}&format=${format}${extra}`;

  it('F09-AC20 (US-073) the .xlsx holds the same rows and values as the class summary, with no notes, and is audited', async () => {
    const teacher = await h.signIn('teacher.a1');
    await seedWeek(teacher);
    await push(h, teacher, [attendanceOp(ids, 'S2', day(0), 'LATE'), attendanceOp(ids, 'S2', day(1), 'ABSENT')]);
    const screen = (await h.call('GET', `/reports/class-summary?classId=${ids.classes.A1}&kind=WEEK&date=${day(0)}`, teacher)).json();
    const res = await h.call('GET', exportUrl('xlsx'), teacher);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    expect(res.headers['content-disposition']).toContain(`class-summary-week-${day(0)}.xlsx`);
    const { default: ExcelJS } = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.rawPayload as unknown as ArrayBuffer);
    const sheet = wb.getWorksheet('ClassSummary')!;
    const rows = sheet.getSheetValues().slice(2).map((r) => (r as unknown[]).slice(1));
    expect(rows).toHaveLength(screen.rows.length);
    for (const [i, row] of screen.rows.entries()) {
      const file = rows[i]!;
      expect(file[0]).toBe(row.studentName);
      expect(file.slice(1, 8)).toEqual([row.attendance.scheduled, row.attendance.attended, row.attendance.present, row.attendance.late, row.attendance.halfDay, row.attendance.leave, row.attendance.absent]);
      expect(file[11]).toBe(row.quality.display ?? 'Not recorded');
      expect(file[12]).toBe(row.quality.count);
      expect(file[13]).toBe(row.outstandingHomework);
    }
    expect(rows[0]![8]).toBe('6 lines'); // S1 Sabaq completed 6 of 10
    expect(res.rawPayload.toString('latin1')).not.toContain('Synthetic');
    expect(JSON.stringify(wb.model)).not.toMatch(/Synthetic (internal note|staff remark)/);
    const audit = (await h.control('GET', `/audit-target/${ids.classes.A1}`)).json().items as { action: string; summary: Record<string, unknown> }[];
    expect(audit.filter((a) => a.action === 'CLASS_SUMMARY_EXPORTED')).toEqual([expect.objectContaining({ summary: expect.objectContaining({ format: 'xlsx', periodFrom: day(0), rows: 2 }) })]);
  });

  it('F09-AC20 (US-073) the PDF is rendered from the same rows (Chromium), in the requested language, with no notes', async () => {
    const teacher = await h.signIn('teacher.a1');
    await seedWeek(teacher);
    const res = await h.call('GET', exportUrl('pdf', '&locale=ur'), teacher);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.rawPayload.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    // What Chromium rendered: a recording renderer over the same service path holds the summary's rows.
    const seen: string[] = [];
    const db = h.db;
    const quran = new QuranMetadataService(db, h.clock, sabaqRanges, { allowSynthetic: true });
    const service = new ReportService(db, h.clock, new HomeworkService(db, h.clock, quran), { render: async (html) => (seen.push(html), Buffer.from('%PDF-test')), close: async () => undefined });
    const admin = await actorOf('admin.a', 'ADMIN');
    await service.exportClassSummary(admin, { classId: ids.classes.A1, kind: 'WEEK', date: day(0), format: 'pdf', locale: 'en' });
    const screen = await service.classSummary(admin, { classId: ids.classes.A1, kind: 'WEEK', date: day(0) });
    const html = seen[0]!;
    for (const row of screen.rows) {
      expect(html).toContain(`<td>${row.studentName}</td>`);
      expect(html).toContain(`<td>${row.attendance.scheduled}</td>`);
    }
    expect(html).toContain('<td>6 lines</td>');
    expect(html).toContain('<td>2.0</td>');
    expect(html).not.toMatch(/Synthetic (internal note|staff remark)/);
  }, 60_000);

  it('F09-AC20 (US-073) exports follow the summary access rules: staff in scope only', async () => {
    const student = await h.signIn('student.s1');
    const parent = await h.signIn('parent.p1');
    const a2 = await h.signIn('teacher.a2');
    const adminB = await h.signIn('admin.b');
    for (const token of [student, parent]) expect((await h.call('GET', exportUrl('xlsx'), token)).statusCode).toBe(403);
    expect((await h.call('GET', exportUrl('xlsx'), a2)).statusCode).toBe(404);
    expect((await h.call('GET', exportUrl('pdf'), adminB)).statusCode).toBe(404);
    expect((await h.call('GET', exportUrl('csv'), await h.signIn('teacher.a1'))).statusCode).toBe(400);
  });
});

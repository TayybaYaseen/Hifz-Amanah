// Test control · F09 report scenarios for the mobile flows (e2e/mobile/f09-reports/). Non-production only.
// Every row is written through the real API (sign-in, POST /sync/push, POST /calendar/exceptions, the Leave decision)
// with in-process requests, so the data passes every server rule exactly as the app's would. SYNTHETIC DATA ONLY:
// seeded personas of madrasa ALIF and the synthetic Quran fixture (Surah 2 Ayat 1–20 = 10 lines).
//
// Scenarios (dates relative to today in Asia/Karachi; "last week" is Monday–Sunday before this one):
// - WEEK: S1 last week — Mon: Sabaq 2:1–20 6/10 lines Partial (quality 1, a staff remark), Sabqi Para 4 12 lines and
//   Para 5 1/2 Para; Tue: Sabqi Para 3 3/4 with two attempts (Partial, then Completed quality 3); Wed: Manzil Para 1
//   Completed, Para 5 Partial 1/2 (a Major mistake with an internal note), Para 10 Not Remembered. One confirmed
//   homework (Mon's Sabaq) and two draft suggestions. Average quality 2.0 · Good (2 ratings).
// - MONTH: S1 in last month's first nine class days (c0…c8) — c0–c2 Sabqi Para 7 with a Major mistake; c3–c4 Para 9
//   with a Major mistake; c5 Manzil Para 20 Completed; c6 a holiday; c7 Absent; c8 Leave approved; and the next class
//   day after c8 a rejected Leave. Homework: one confirmed (a carried-forward and a Teacher-added portion), the
//   carried-forward one completed the next class day.
// - SUMMARY: last week — S1 Mon Present with Sabaq 10/10 lines quality 1; S2 Mon Late, Tue Absent.
// `correct` changes the WEEK scenario's Tuesday rating 3 → 5 (another device's correction, F09-AC3).
import type { FastifyInstance } from 'fastify';
import { v7 as uuidv7 } from 'uuid';
import { weekOf } from '@hifz/domain/calendar';
import { addDays, calendarDateIn } from '@hifz/domain/roster';
import { AppError } from '../platform/errors.ts';
import type { Db } from '../platform/db.ts';
import type { Clock } from '../platform/clock.ts';
import { TEST_PASSWORD, classes as fixtureClasses } from '../../../../e2e/fixtures/personas.ts';

type Quantity = { unit: string; numerator: number; denominator: number };
const lines = (n: number): Quantity => ({ unit: 'LINES', numerator: n, denominator: 1 });
const para = (numerator: number, denominator = 1): Quantity => ({ unit: 'PARA', numerator, denominator });
const DEVICE = '0190f5c0-0000-4000-8000-0000000000c9';
const MAJOR = { category: 'TAJWEED', severity: 'MAJOR', repeated: false };

export interface ReportSeedDeps {
  app: FastifyInstance;
  db: Db;
  clock: Clock;
  secret: string;
}

export type ReportScenario = 'WEEK' | 'MONTH' | 'SUMMARY';

export class ReportSeeder {
  private seq = 0;
  /** The WEEK scenario's Tuesday second attempt, for `correct`. */
  private toCorrect: { id: string; rowVersion: number } | null = null;

  private readonly deps: ReportSeedDeps;

  constructor(deps: ReportSeedDeps) {
    this.deps = deps;
  }

  forget(): void {
    this.toCorrect = null;
  }

  private async inject(method: 'GET' | 'POST', url: string, token: string | null, payload?: object) {
    const res = await this.deps.app.inject({ method, url, headers: token ? { authorization: `Bearer ${token}` } : {}, ...(payload ? { payload } : {}) });
    if (res.statusCode >= 300) throw new Error(`report seed ${method} ${url} → ${res.statusCode} ${res.body}`);
    return res.json();
  }

  private async signIn(loginId: string): Promise<string> {
    let body = await this.inject('POST', '/auth/sign-in', null, { loginId, password: TEST_PASSWORD });
    if (body.step === 'TWO_FACTOR_REQUIRED') {
      const totp = await this.deps.app.inject({ method: 'GET', url: `/__test/totp/${loginId}`, headers: { 'x-test-control-secret': this.deps.secret } });
      body = await this.inject('POST', '/auth/two-factor/verify', null, { challengeToken: body.challengeToken, code: totp.json().code });
    }
    return body.accessToken as string;
  }

  private op(entity: string, opType: 'CREATE' | 'UPDATE' | 'COMMAND', entityId: string, fields: Record<string, unknown>, baseVersion: number | null = null, command?: string) {
    return { opId: uuidv7(), seq: ++this.seq, entity, entityId, opType, ...(command ? { command } : {}), baseVersion, fields, dependsOn: [] as string[], clientSavedAt: new Date().toISOString() };
  }

  /** Pushes ops; every one must be APPLIED. Returns entity ids and row versions. */
  private async push(token: string, ops: object[]): Promise<{ id: string; rowVersion: number }[]> {
    const { results } = await this.inject('POST', '/sync/push', token, { protocolVersion: 1, deviceId: DEVICE, ops });
    for (const r of results) if (r.status !== 'APPLIED') throw new Error(`report seed op not applied: ${JSON.stringify(r)}`);
    return results.map((r: { entityId: string; rowVersion: number }) => ({ id: r.entityId, rowVersion: r.rowVersion }));
  }

  private async ids() {
    const org = await this.deps.db.selectFrom('organizations').select(['id', 'timezone']).where('code', '=', 'ALIF').executeTakeFirst();
    if (!org) throw new AppError('NOT_FOUND');
    const cls = await this.deps.db.selectFrom('classes').select('id').where('organization_id', '=', org.id).where('name', '=', fixtureClasses.A1.name).executeTakeFirst();
    const students = await this.deps.db.selectFrom('students').select(['id', 'external_student_id']).where('organization_id', '=', org.id).execute();
    const sid = (ext: string) => students.find((s) => s.external_student_id === ext)?.id ?? '';
    if (!cls) throw new AppError('NOT_FOUND');
    return { classId: cls.id, S1: sid('EXT-A-001'), S2: sid('EXT-A-002'), today: calendarDateIn(this.deps.clock.now(), org.timezone) };
  }

  private mark(classId: string, studentId: string, date: string, status: string, leaveReason: string | null = null) {
    return this.op('attendance_record', 'CREATE', uuidv7(), { studentId, classId, reportDate: date, status, leaveReason, absentNote: null });
  }

  private async record(token: string, classId: string, studentId: string, date: string): Promise<string> {
    const [, r] = await this.push(token, [this.mark(classId, studentId, date, 'PRESENT'), this.op('daily_record', 'CREATE', uuidv7(), { studentId, classId, reportDate: date, sessionLabel: null })]);
    return r!.id;
  }

  private async recite(
    token: string,
    recordId: string,
    p: { section: string; position?: number; paraNumber?: number | null; range?: object | null; totalLines?: number | null; assigned: Quantity; homeworkPortionId?: string },
    a: { status: string; completed?: Quantity | null; quality?: number | null; mistakes?: object[]; remarks?: string | null; attemptNo?: number },
  ) {
    const fields: Record<string, unknown> = {
      dailyRecordId: recordId,
      section: p.section,
      position: p.position ?? 1,
      isExtra: false,
      paraNumber: p.section === 'SABAQ' ? null : (p.paraNumber ?? null),
      range: p.range ?? null,
      totalLines: p.totalLines ?? null,
      totalLinesSource: p.section === 'SABAQ' ? 'MANUAL' : null,
      assigned: p.assigned,
      ...(p.homeworkPortionId ? { homeworkPortionId: p.homeworkPortionId } : {}),
    };
    const [portion] = await this.push(token, [this.op('lesson_portion', 'CREATE', uuidv7(), fields)]);
    const [attempt] = await this.push(token, [this.attemptOp(portion!.id, a)]);
    return { portionId: portion!.id, attemptId: attempt!.id };
  }

  private attemptOp(portionId: string, a: { status: string; completed?: Quantity | null; quality?: number | null; mistakes?: object[]; remarks?: string | null; attemptNo?: number }) {
    return this.op('portion_attempt', 'CREATE', uuidv7(), {
      lessonPortionId: portionId,
      attemptNo: a.attemptNo ?? 1,
      attemptedAt: new Date().toISOString(),
      status: a.status,
      completed: a.completed ?? null,
      quality: a.quality ?? null,
      noMistakes: false,
      mistakes: a.mistakes ?? [],
      remarks: a.remarks ?? null,
    });
  }

  /** A confirmed assignment for S1 from the record's sources: one suggested portion, plus optional Teacher-added ones. */
  private async confirmed(token: string, studentId: string, recordId: string, assignedDate: string, sourceAttemptId: string, added: object[] = []) {
    const suggested = { id: uuidv7(), section: 'SABQI', position: 1, paraNumber: null, range: null, totalLines: null, assigned: para(1), origin: 'SUGGESTED', sourceAttemptId, instructions: null };
    const [draft] = await this.push(token, [this.op('homework_assignment', 'CREATE', uuidv7(), { studentId, sourceDailyRecordId: recordId, dueDate: null, instructions: null, assignedDate, portions: [suggested, ...added] })]);
    const detail = await this.inject('GET', `/hifz/daily-records/${recordId}`, token);
    const sources = detail.portions.flatMap((p: { id: string; rowVersion: number; attempts: { id: string; rowVersion: number }[] }) => [
      { entity: 'lesson_portion', id: p.id, rowVersion: p.rowVersion },
      ...p.attempts.map((x) => ({ entity: 'portion_attempt', id: x.id, rowVersion: x.rowVersion })),
    ]);
    await this.push(token, [this.op('homework_assignment', 'COMMAND', draft!.id, { confirmedAt: new Date().toISOString(), sources }, draft!.rowVersion, 'CONFIRM_HOMEWORK')]);
    return draft!.id;
  }

  private draft(studentId: string, assignedDate: string) {
    const portion = { id: uuidv7(), section: 'SABQI', position: 1, paraNumber: 3, range: null, totalLines: null, assigned: para(1, 4), origin: 'TEACHER_ADDED', sourceAttemptId: null, instructions: null };
    return this.op('homework_assignment', 'CREATE', uuidv7(), { studentId, sourceDailyRecordId: null, dueDate: null, instructions: null, assignedDate, portions: [portion] });
  }

  async seed(scenario: ReportScenario): Promise<Record<string, string>> {
    const ids = await this.ids();
    const teacher = await this.signIn('teacher-a1');
    const monday = weekOf(addDays(ids.today, -7)).from;
    const d = (n: number) => addDays(monday, n);

    if (scenario === 'WEEK') {
      const mon = await this.record(teacher, ids.classId, ids.S1, d(0));
      const sabaq = await this.recite(
        teacher,
        mon,
        { section: 'SABAQ', range: { surahStart: 2, ayahStart: 1, surahEnd: 2, ayahEnd: 20 }, totalLines: 10, assigned: lines(10) },
        { status: 'PARTIAL', completed: lines(6), quality: 1, remarks: 'Synthetic staff remark' },
      );
      await this.recite(teacher, mon, { section: 'SABQI', position: 1, paraNumber: 4, assigned: lines(12) }, { status: 'COMPLETED', completed: lines(12) });
      await this.recite(teacher, mon, { section: 'SABQI', position: 2, paraNumber: 5, assigned: para(1, 2) }, { status: 'COMPLETED', completed: para(1, 2) });
      const tue = await this.record(teacher, ids.classId, ids.S1, d(1));
      const twice = await this.recite(teacher, tue, { section: 'SABQI', paraNumber: 3, assigned: para(3, 4) }, { status: 'PARTIAL', completed: para(1, 2) });
      const [second] = await this.push(teacher, [this.attemptOp(twice.portionId, { attemptNo: 2, status: 'COMPLETED', completed: para(3, 4), quality: 3 })]);
      this.toCorrect = second!;
      const wed = await this.record(teacher, ids.classId, ids.S1, d(2));
      await this.recite(teacher, wed, { section: 'MANZIL', position: 1, paraNumber: 1, assigned: para(1) }, { status: 'COMPLETED', completed: para(1) });
      await this.recite(teacher, wed, { section: 'MANZIL', position: 2, paraNumber: 5, assigned: para(1) }, { status: 'PARTIAL', completed: para(1, 2), mistakes: [{ ...MAJOR, note: 'Synthetic private note', noteVisibility: 'INTERNAL' }] });
      await this.recite(teacher, wed, { section: 'MANZIL', position: 3, paraNumber: 10, assigned: para(1) }, { status: 'NOT_REMEMBERED' });
      await this.confirmed(teacher, ids.S1, mon, d(0), sabaq.attemptId);
      await this.push(teacher, [this.draft(ids.S1, d(1)), this.draft(ids.S1, d(2))]);
      return { from: d(0), to: d(6), tuesday: d(1), wednesday: d(2) };
    }

    if (scenario === 'SUMMARY') {
      const mon = await this.record(teacher, ids.classId, ids.S1, d(0));
      await this.recite(teacher, mon, { section: 'SABAQ', range: { surahStart: 2, ayahStart: 1, surahEnd: 2, ayahEnd: 20 }, totalLines: 10, assigned: lines(10) }, { status: 'COMPLETED', completed: lines(10), quality: 1 });
      await this.push(teacher, [this.mark(ids.classId, ids.S2, d(0), 'LATE'), this.mark(ids.classId, ids.S2, d(1), 'ABSENT')]);
      return { from: d(0), to: d(6) };
    }

    // MONTH: the first class days (Monday–Saturday) of last month.
    const first = `${addDays(`${ids.today.slice(0, 7)}-01`, -1).slice(0, 7)}-01`;
    const c: string[] = [];
    for (let x = first; c.length < 10; x = addDays(x, 1)) if (new Date(`${x}T00:00:00Z`).getUTCDay() !== 0) c.push(x);
    const admin = await this.signIn('admin-a');
    const rec: string[] = [];
    for (let i = 0; i < 6; i++) rec.push(await this.record(teacher, ids.classId, ids.S1, c[i]!));
    const p7: string[] = [];
    for (const i of [0, 1, 2]) p7.push((await this.recite(teacher, rec[i]!, { section: 'SABQI', paraNumber: 7, assigned: para(1, 2) }, { status: 'PARTIAL', completed: para(1, 4), quality: 2, mistakes: [MAJOR] })).attemptId);
    for (const i of [3, 4]) await this.recite(teacher, rec[i]!, { section: 'SABQI', paraNumber: 9, assigned: para(1, 2) }, { status: 'PARTIAL', completed: para(1, 4), quality: 3, mistakes: [MAJOR] });
    await this.recite(teacher, rec[5]!, { section: 'MANZIL', paraNumber: 20, assigned: para(1) }, { status: 'COMPLETED', completed: para(1) });
    await this.inject('POST', '/calendar/exceptions', admin, { date: c[6], kind: 'HOLIDAY', label: 'Synthetic holiday', confirm: true });
    await this.push(teacher, [this.mark(ids.classId, ids.S1, c[7]!, 'ABSENT')]);
    await this.push(admin, [this.mark(ids.classId, ids.S1, c[8]!, 'LEAVE', 'Synthetic reason')]);
    const [requested] = await this.push(teacher, [this.mark(ids.classId, ids.S1, c[9]!, 'LEAVE', 'Synthetic reason')]);
    await this.inject('POST', `/attendance/${requested!.id}/leave-decision`, admin, { decision: 'REJECT', rowVersion: requested!.rowVersion });
    // Homework: c0's Para 7 carried forward and completed on c1; a Teacher-added Manzil portion not attempted.
    const added = { id: uuidv7(), section: 'MANZIL', position: 1, paraNumber: 4, range: null, totalLines: null, assigned: para(1, 2), origin: 'TEACHER_ADDED', sourceAttemptId: null, instructions: null };
    const hwId = await this.confirmed(teacher, ids.S1, rec[0]!, c[0]!, p7[0]!, [added]);
    const hw = await this.inject('GET', `/homework/assignments/${hwId}`, teacher);
    const carried = hw.portions.find((p: { origin: string }) => p.origin === 'SUGGESTED');
    await this.recite(teacher, rec[1]!, { section: 'SABQI', position: 2, paraNumber: 7, assigned: carried.assigned, homeworkPortionId: carried.id }, { status: 'COMPLETED', completed: carried.assigned });
    return { from: first, firstDay: c[0]!, holiday: c[6]! };
  }

  /** Another device corrects the WEEK scenario's Tuesday rating 3 → 5 (F09-AC3). */
  async correct(): Promise<void> {
    if (!this.toCorrect) throw new AppError('NOT_FOUND');
    const teacher = await this.signIn('teacher-a1');
    const [r] = await this.push(teacher, [
      this.op('portion_attempt', 'UPDATE', this.toCorrect.id, { status: 'COMPLETED', completed: para(3, 4), quality: 5, noMistakes: false, mistakes: [] }, this.toCorrect.rowVersion),
    ]);
    this.toCorrect = r!;
  }
}

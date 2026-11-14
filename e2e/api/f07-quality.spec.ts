// F07 · Mistakes and quality — API E2E (docs/specs/10-f07-mistakes-quality.md; plan docs/handover/F07-plan.md)
// Screen journeys: e2e/mobile/f07-quality/.
// Seeded fixtures: A1 (teacher.a1; S1, S2), A2 (teacher.a2; S3); every class meets Monday–Saturday.
// Writes go through POST /sync/push; the record is GET /hifz/daily-records/:id and the period summary (F07's report
// surface until F09) is GET /hifz/performance-summary. Synthetic data only.
import { randomBytes } from 'node:crypto';
import type { APIRequestContext } from '@playwright/test';
import { expect, test, type TestControl } from './support/fixtures';

type Ids = { classes: Record<string, string>; students: Record<string, string> };
type OpResult = { opId: string; status: string; code?: string; fields?: Record<string, string>; rowVersion?: number; entityId?: string };
type Quantity = { unit: string; numerator: number; denominator: number };
type Mistake = { category: string; severity: string; repeated: boolean; note?: string | null; noteVisibility?: string };

const DEVICE = '0190f5c0-0000-4000-8000-0000000000f7';

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
function classDay(back = 1): string {
  let d = addDays(today(), -back);
  while (weekday(d) === 7) d = addDays(d, -1);
  return d;
}
const para = (numerator: number, denominator = 1): Quantity => ({ unit: 'PARA', numerator, denominator });

let seq = 0;
const op = (entity: string, opType: 'CREATE' | 'UPDATE', entityId: string, fields: Record<string, unknown>, baseVersion: number | null = null) => ({
  opId: uuidv7(),
  seq: ++seq,
  entity,
  entityId,
  opType,
  baseVersion,
  fields,
  dependsOn: [] as string[],
  clientSavedAt: new Date().toISOString(),
});

const attendance = (ids: Ids, student: string, date: string) =>
  op('attendance_record', 'CREATE', uuidv7(), { studentId: ids.students[student], classId: ids.classes.A1, reportDate: date, status: 'PRESENT', leaveReason: null, absentNote: null });
const record = (ids: Ids, student: string, date: string, overallLabel?: string | null) =>
  op('daily_record', 'CREATE', uuidv7(), { studentId: ids.students[student], classId: ids.classes.A1, reportDate: date, sessionLabel: null, ...(overallLabel !== undefined ? { overallLabel } : {}) });
const labelUpdate = (id: string, base: number, overallLabel: string | null) => op('daily_record', 'UPDATE', id, { overallLabel }, base);
const sabqi = (recordId: string, position: number) =>
  op('lesson_portion', 'CREATE', uuidv7(), { dailyRecordId: recordId, section: 'SABQI', position, isExtra: false, paraNumber: 1, range: null, totalLines: null, totalLinesSource: null, assigned: para(1) });
const attempt = (portionId: string, a: { attemptNo?: number; status: string; quality?: number | null; noMistakes?: boolean; mistakes?: Mistake[] }) =>
  op('portion_attempt', 'CREATE', uuidv7(), {
    lessonPortionId: portionId,
    attemptNo: a.attemptNo ?? 1,
    attemptedAt: new Date().toISOString(),
    status: a.status,
    completed: null,
    quality: a.quality ?? null,
    noMistakes: a.noMistakes ?? false,
    mistakes: a.mistakes ?? [],
    remarks: null,
  });
const m = (category: string, severity = 'MINOR', repeated = false, extra: Partial<Mistake> = {}): Mistake => ({ category, severity, repeated, ...extra });

async function push(api: APIRequestContext, ops: object[]): Promise<OpResult[]> {
  const res = await api.post('/sync/push', { data: { protocolVersion: 1, deviceId: DEVICE, ops } });
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()).results as OpResult[];
}
async function applied(api: APIRequestContext, o: object): Promise<string> {
  const [r] = await push(api, [o]);
  expect(r, JSON.stringify(r)).toMatchObject({ status: 'APPLIED' });
  return r!.entityId!;
}
async function detail(api: APIRequestContext, id: string) {
  const res = await api.get(`/hifz/daily-records/${id}`);
  expect(res.status(), await res.text()).toBe(200);
  return res.json();
}
async function summary(api: APIRequestContext, ids: Ids, student: string, from: string, to: string) {
  const res = await api.get(`/hifz/performance-summary?studentId=${ids.students[student]}&from=${from}&to=${to}`);
  expect(res.status(), await res.text()).toBe(200);
  return res.json();
}

/** A Present record for the student on the date with `n` Sabqi portions; returns the record and portion ids. */
async function recordWithPortions(api: APIRequestContext, ids: Ids, student: string, date: string, n = 1, overallLabel?: string | null) {
  const [a, r] = await push(api, [attendance(ids, student, date), record(ids, student, date, overallLabel)]);
  expect([a!.status, r!.status], JSON.stringify([a, r])).toEqual(['APPLIED', 'APPLIED']);
  const portions: string[] = [];
  for (let i = 1; i <= n; i++) portions.push(await applied(api, sabqi(r!.entityId!, i)));
  return { recordId: r!.entityId!, portions };
}

const audits = async (control: TestControl, id: string) => control.auditForTarget(id);

test.describe('F07 · Mistakes and quality', { tag: '@F07' }, () => {
  test('F07-AC1 (US-028) two mistakes are stored on the attempt, one category each', async ({ as, control }) => {
    const ids = await control.rosterIds();
    const teacher = await as('teacher.a1');
    const { recordId, portions } = await recordWithPortions(teacher, ids, 'S1', classDay(1));
    await applied(teacher, attempt(portions[0]!, { status: 'PARTIAL', mistakes: [m('TAJWEED'), m('LAFZI')] }));
    const a = (await detail(teacher, recordId)).portions[0].attempts[0];
    expect(a.mistakes.map((x: Mistake) => x.category)).toEqual(['TAJWEED', 'LAFZI']);
    expect(a.mistakeCount).toBe(2);
    const [bad] = await push(teacher, [attempt(portions[0]!, { attemptNo: 2, status: 'PARTIAL', mistakes: [{ category: ['TAJWEED', 'LAFZI'], severity: 'MINOR', repeated: false } as never] })]);
    expect(bad).toMatchObject({ status: 'REJECTED', code: 'VALIDATION' });
  });

  test('F07-AC2 (US-028) a mistake saved in Urdu is the same canonical value', async ({ as, control }) => {
    const ids = await control.rosterIds();
    const teacher = await as('teacher.a1');
    const { recordId, portions } = await recordWithPortions(teacher, ids, 'S1', classDay(1));
    // The interface language never reaches storage: the op carries the canonical value; a label is refused.
    const [label] = await push(teacher, [attempt(portions[0]!, { status: 'PARTIAL', mistakes: [m('تجوید')] })]);
    expect(label).toMatchObject({ status: 'REJECTED', code: 'VALIDATION' });
    await applied(teacher, attempt(portions[0]!, { status: 'PARTIAL', mistakes: [m('TAJWEED')] }));
    const res = await teacher.get(`/hifz/daily-records/${recordId}`, { headers: { 'Accept-Language': 'en' } });
    expect((await res.json()).portions[0].attempts[0].mistakes[0].category).toBe('TAJWEED');
  });

  test('F07-AC3 (US-028) the weekly report counts mistakes per category', async ({ as, control }) => {
    const ids = await control.rosterIds();
    const teacher = await as('teacher.a1');
    const d1 = await recordWithPortions(teacher, ids, 'S1', classDay(1));
    const d2 = await recordWithPortions(teacher, ids, 'S1', classDay(2));
    await applied(teacher, attempt(d1.portions[0]!, { status: 'PARTIAL', mistakes: [m('TAJWEED'), m('LAFZI')] }));
    await applied(teacher, attempt(d2.portions[0]!, { status: 'PARTIAL', mistakes: [m('TAJWEED', 'MAJOR')] }));
    const s = await summary(teacher, ids, 'S1', classDay(7), classDay(0));
    expect(s.mistakes.byCategory).toEqual({ HARKAAT: 0, TAJWEED: 2, LAFZI: 1, AYAT_BHOOLNA: 0, TARTEEB: 0, WAQF_IBTIDA: 0 });
    expect(s.mistakes).toMatchObject({ total: 3, major: 1, uncategorized: 0 });
  });

  test('F07-AC4 (US-029) severity accepts only MINOR or MAJOR', async ({ as, control }) => {
    const ids = await control.rosterIds();
    const teacher = await as('teacher.a1');
    const { recordId, portions } = await recordWithPortions(teacher, ids, 'S1', classDay(1));
    const [critical] = await push(teacher, [attempt(portions[0]!, { status: 'PARTIAL', mistakes: [m('HARKAAT', 'CRITICAL')] })]);
    expect(critical).toMatchObject({ status: 'REJECTED', code: 'VALIDATION' });
    await applied(teacher, attempt(portions[0]!, { status: 'PARTIAL', mistakes: [m('HARKAAT', 'MAJOR')] }));
    expect((await detail(teacher, recordId)).portions[0].attempts[0].mistakes[0].severity).toBe('MAJOR');
  });

  test('F07-AC5 (US-030) Repeated is a separate flag that leaves severity unchanged', async ({ as, control }) => {
    const ids = await control.rosterIds();
    const teacher = await as('teacher.a1');
    const { recordId, portions } = await recordWithPortions(teacher, ids, 'S1', classDay(1));
    await applied(teacher, attempt(portions[0]!, { status: 'PARTIAL', mistakes: [m('TARTEEB', 'MINOR', true)] }));
    expect((await detail(teacher, recordId)).portions[0].attempts[0].mistakes[0]).toMatchObject({ severity: 'MINOR', repeated: true });
  });

  test('F07-AC7 (US-031) no quality is stored as NULL, never 0', async ({ as, control }) => {
    const ids = await control.rosterIds();
    const teacher = await as('teacher.a1');
    const day = classDay(1);
    const { recordId, portions } = await recordWithPortions(teacher, ids, 'S1', day);
    await applied(teacher, attempt(portions[0]!, { status: 'COMPLETED' }));
    expect((await detail(teacher, recordId)).portions[0].attempts[0].quality).toBeNull();
    expect((await summary(teacher, ids, 'S1', day, day)).quality).toEqual({ count: 0, value: null, display: null, nearestScore: null });
    const [zero] = await push(teacher, [attempt(portions[0]!, { attemptNo: 2, status: 'COMPLETED', quality: 0 })]);
    expect(zero).toMatchObject({ status: 'REJECTED', code: 'VALIDATION' });
  });

  test('F07-AC8 (US-031) scores 1, 2, 2 and one missing average 1.7 · Good (3 ratings)', async ({ as, control }) => {
    const ids = await control.rosterIds();
    const teacher = await as('teacher.a1');
    const day = classDay(1);
    const { portions } = await recordWithPortions(teacher, ids, 'S1', day, 4);
    for (const [i, quality] of [1, 2, 2, null].entries()) await applied(teacher, attempt(portions[i]!, { status: 'COMPLETED', quality }));
    const q = (await summary(teacher, ids, 'S1', day, day)).quality;
    expect(q).toMatchObject({ count: 3, display: '1.7', nearestScore: 2 });
    expect(q.value).toBeCloseTo(1.67, 2);
  });

  test('F07-AC9 (US-031) an average of exactly 1.5 is labelled Good', async ({ as, control }) => {
    const ids = await control.rosterIds();
    const teacher = await as('teacher.a1');
    const day = classDay(1);
    const { portions } = await recordWithPortions(teacher, ids, 'S2', day, 2);
    await applied(teacher, attempt(portions[0]!, { status: 'COMPLETED', quality: 1 }));
    await applied(teacher, attempt(portions[1]!, { status: 'COMPLETED', quality: 2 }));
    expect((await summary(teacher, ids, 'S2', day, day)).quality).toEqual({ count: 2, value: 1.5, display: '1.5', nearestScore: 2 });
  });

  test('F07-AC10 (US-031) Absent, Not Assigned, and Pending attempts reject quality', async ({ as, control }) => {
    const ids = await control.rosterIds();
    const teacher = await as('teacher.a1');
    const day = classDay(1);
    const { portions } = await recordWithPortions(teacher, ids, 'S1', day, 4);
    const statuses = ['ABSENT', 'NOT_ASSIGNED', 'PENDING'];
    for (const [i, status] of statuses.entries()) {
      const [r] = await push(teacher, [attempt(portions[i]!, { status, quality: 3 })]);
      expect(r, status).toMatchObject({ status: 'REJECTED', fields: { quality: 'QUALITY_NOT_ALLOWED' } });
      await applied(teacher, attempt(portions[i]!, { status }));
    }
    await applied(teacher, attempt(portions[3]!, { status: 'COMPLETED', quality: 4 }));
    expect((await summary(teacher, ids, 'S1', day, day)).quality).toMatchObject({ count: 1, value: 4 });
  });

  test('F07-AC11 (US-031) no automated process writes a quality score', async ({ as, control }) => {
    // Paths that exist today: sync replay, record edits, and pulls. AI (Phase 7), Excel import (F14), and homework
    // recalculation (F08) add their own check here when they ship (plan §2.3).
    const ids = await control.rosterIds();
    const teacher = await as('teacher.a1');
    const { recordId, portions } = await recordWithPortions(teacher, ids, 'S1', classDay(1));
    const o = attempt(portions[0]!, { status: 'PARTIAL' });
    await applied(teacher, o);
    await push(teacher, [o]);
    const d0 = await detail(teacher, recordId);
    await applied(teacher, labelUpdate(recordId, d0.record.rowVersion, 'EXCELLENT'));
    expect((await teacher.get('/sync/pull')).status()).toBe(200);
    const d = await detail(teacher, recordId);
    expect(d.portions[0].attempts.map((a: { quality: number | null }) => a.quality)).toEqual([null]);
  });

  test('F07-AC12 (US-032) the overall label is stored once per record', async ({ as, control }) => {
    const ids = await control.rosterIds();
    const teacher = await as('teacher.a1');
    const { recordId, portions } = await recordWithPortions(teacher, ids, 'S1', classDay(1), 2, 'GOOD');
    await applied(teacher, attempt(portions[0]!, { status: 'COMPLETED', quality: 4 }));
    await applied(teacher, attempt(portions[1]!, { status: 'COMPLETED', quality: 1 }));
    const d = await detail(teacher, recordId);
    expect(d.record.overallLabel).toBe('GOOD');
    expect(d.portions.map((p: { attempts: { quality: number }[] }) => p.attempts[0]!.quality)).toEqual([4, 1]);
    const [weak] = await push(teacher, [labelUpdate(recordId, d.record.rowVersion, 'WEAK')]);
    expect(weak).toMatchObject({ status: 'REJECTED', code: 'VALIDATION' });
  });

  test('F07-AC13 (US-032) the overall label and quality scores are never derived from each other', async ({ as, control }) => {
    const ids = await control.rosterIds();
    const teacher = await as('teacher.a1');
    const a = await recordWithPortions(teacher, ids, 'S1', classDay(1), 2);
    for (const p of a.portions) await applied(teacher, attempt(p, { status: 'COMPLETED', quality: 1 }));
    expect((await detail(teacher, a.recordId)).record.overallLabel).toBeNull();
    const b = await recordWithPortions(teacher, ids, 'S2', classDay(1));
    await applied(teacher, attempt(b.portions[0]!, { status: 'COMPLETED' }));
    const d0 = await detail(teacher, b.recordId);
    await applied(teacher, labelUpdate(b.recordId, d0.record.rowVersion, 'NEEDS_IMPROVEMENT'));
    const d = await detail(teacher, b.recordId);
    expect(d.record.overallLabel).toBe('NEEDS_IMPROVEMENT');
    expect(d.portions[0].attempts[0].quality).toBeNull();
  });

  // Added by the decision review of 2026-10-30 (SRS §17).
  test('F07-AC14 (US-028) "No mistakes" stores 0; an empty list stays Not recorded', async ({ as, control }) => {
    const ids = await control.rosterIds();
    const teacher = await as('teacher.a1');
    const day = classDay(1);
    const { recordId, portions } = await recordWithPortions(teacher, ids, 'S1', day, 2);
    await applied(teacher, attempt(portions[0]!, { status: 'COMPLETED', noMistakes: true }));
    await applied(teacher, attempt(portions[1]!, { status: 'COMPLETED' }));
    const d = await detail(teacher, recordId);
    expect(d.portions.map((p: { attempts: { mistakeCount: number | null }[] }) => p.attempts[0]!.mistakeCount)).toEqual([0, null]);
    expect((await summary(teacher, ids, 'S1', day, day)).mistakes).toMatchObject({ total: 0, noMistakesAttempts: 1, notRecordedAttempts: 1 });
  });

  test('F07-AC15 (US-028) mistake notes are private by default', async ({ as, control }) => {
    // Staff see both notes with their visibility; notes never reach the audit log. The Student/Parent projection
    // (absent INTERNAL note, shown SHARED note) is unit-tested in apps/api/src/modules/access/projection.test.ts; the
    // portal routes that use it arrive with F10, which adds the end-to-end Student/Parent check (plan §2.3).
    const ids = await control.rosterIds();
    const teacher = await as('teacher.a1');
    const { recordId, portions } = await recordWithPortions(teacher, ids, 'S1', classDay(1));
    const attemptId = await applied(
      teacher,
      attempt(portions[0]!, { status: 'PARTIAL', mistakes: [m('TAJWEED', 'MINOR', false, { note: 'Synthetic private note' }), m('LAFZI', 'MINOR', false, { note: 'Synthetic family note', noteVisibility: 'SHARED' })] }),
    );
    const [first, second] = (await detail(teacher, recordId)).portions[0].attempts[0].mistakes;
    expect(first).toMatchObject({ note: 'Synthetic private note', noteVisibility: 'INTERNAL' });
    expect(second).toMatchObject({ note: 'Synthetic family note', noteVisibility: 'SHARED' });
    expect(JSON.stringify(await audits(control, attemptId))).not.toContain('Synthetic');
    // The Student's own session never reaches staff records.
    const student = await as('student.s1');
    expect((await student.get(`/hifz/daily-records/${recordId}`)).status()).toBe(403);
  });
});

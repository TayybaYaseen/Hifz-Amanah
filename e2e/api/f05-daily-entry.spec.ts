// F05 · Daily Hifz entry — API E2E (docs/specs/09-f05-daily-hifz-entry.md)
// Screen journeys: e2e/mobile/f05-daily-entry/.
// Seeded fixtures: A1 (teacher.a1; S1, S2), A2 (teacher.a2; S3); every class meets Monday–Saturday.
// Daily records, portions, and attempts are written through POST /sync/push (`daily_record`, `lesson_portion`,
// `portion_attempt`); the daily report is GET /hifz/daily-records/:id (its derived progress and section summary).
// Quran data is the SYNTHETIC test fixture (control.seedSyntheticQuran: every Surah has 20 Ayat, Para 1 = Surahs 1–3,
// a test layout for Surahs 1–3 at 2 Ayat per line), never real metadata: "Al-Fatihah" and "Al-Baqarah" in the steps
// below are synthetic Surahs 1 and 2.
import { randomBytes } from 'node:crypto';
import type { APIRequestContext } from '@playwright/test';
import { expect, test, type TestControl } from './support/fixtures';

type StudentKey = 'S1' | 'S2' | 'S3';
type Ids = { classes: Record<string, string>; students: Record<string, string> };
type OpResult = { opId: string; status: string; code?: string; fields?: Record<string, string>; rowVersion?: number; entityId?: string };
type Quantity = { unit: string; numerator: number; denominator: number };
type Progress = { currentStatus: string | null; assigned: Quantity; completed: Quantity | null; remaining: Quantity | null; quality: number | null; attemptCount: number };
type Attempt = { id: string; attemptNo: number; attemptedAt: string; recordedBy: { userId: string }; status: string; completed: Quantity | null; quality: number | null; mistakeCount: number | null; mistakes: unknown[]; remarks: string | null };
type Portion = { id: string; section: string; paraNumber: number | null; range: unknown; assigned: Quantity; totalLines: number | null; totalLinesSource: string | null; lineCountEdition: string | null; attempts: Attempt[]; progress: Progress };
type Detail = {
  record: { id: string; reportDate: string; sessionLabel: string | null; clientSavedAt: string | null; serverReceivedAt: string };
  attendance: { status: string | null; portionsAllowed: string };
  portions: Portion[];
  sectionSummary: Array<{ section: string; portionIds: string[]; totals: { assigned: Quantity[]; completed: Quantity[]; remaining: Quantity[] } }>;
};

const DEVICE = '0190f5c0-0000-4000-8000-0000000000f5';

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

/** Today in Asia/Karachi (the seeded madrasas' timezone). */
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date());

/** The most recent Monday–Saturday on or before `back` days ago: a scheduled day for every seeded class. */
function classDay(back = 1): string {
  let d = addDays(today(), -back);
  while (weekday(d) === 7) d = addDays(d, -1);
  return d;
}

const lines = (n: number): Quantity => ({ unit: 'LINES', numerator: n, denominator: 1 });
const para = (numerator: number, denominator = 1): Quantity => ({ unit: 'PARA', numerator, denominator });

let seq = 0;

function op(entity: string, opType: 'CREATE' | 'UPDATE', entityId: string, fields: Record<string, unknown>, baseVersion: number | null = null) {
  return { opId: uuidv7(), seq: ++seq, entity, entityId, opType, baseVersion, fields, dependsOn: [] as string[], clientSavedAt: new Date().toISOString() };
}

const attendance = (ids: Ids, student: StudentKey, date: string, status: string) =>
  op('attendance_record', 'CREATE', uuidv7(), { studentId: ids.students[student], classId: ids.classes.A1, reportDate: date, status, leaveReason: status === 'LEAVE' ? 'Synthetic family reason' : null, absentNote: null });

const record = (ids: Ids, student: StudentKey, date: string, sessionLabel: string | null = null, clientSavedAt?: string) =>
  op('daily_record', 'CREATE', uuidv7(), { studentId: ids.students[student], classId: ids.classes.A1, reportDate: date, sessionLabel, ...(clientSavedAt ? { clientSavedAt } : {}) });

interface PortionInput {
  section: 'SABAQ' | 'SABQI' | 'MANZIL';
  position?: number;
  paraNumber?: number | null;
  range?: { surahStart: number; ayahStart: number; surahEnd: number; ayahEnd: number } | null;
  assigned?: Quantity;
  totalLines?: number | null;
}

function portion(recordId: string, p: PortionInput) {
  const sabaq = p.section === 'SABAQ';
  return op('lesson_portion', 'CREATE', uuidv7(), {
    dailyRecordId: recordId,
    section: p.section,
    position: p.position ?? 1,
    isExtra: false,
    paraNumber: p.paraNumber ?? null,
    range: p.range ?? null,
    totalLines: p.totalLines ?? null,
    // "total 10 LINES" is entered by hand: the synthetic layout counts 5 lines for Surah 2 Ayat 1–10.
    totalLinesSource: sabaq ? 'MANUAL' : null,
    ...(p.assigned ? { assigned: p.assigned } : {}),
  });
}

interface AttemptInput {
  attemptNo?: number;
  status: string;
  completed?: Quantity | null;
  quality?: number | null;
  noMistakes?: boolean;
  mistakes?: { category: string; severity: string; repeated: boolean }[];
  remarks?: string | null;
}

const attempt = (portionId: string, a: AttemptInput) =>
  op('portion_attempt', 'CREATE', uuidv7(), {
    lessonPortionId: portionId,
    attemptNo: a.attemptNo ?? 1,
    attemptedAt: new Date().toISOString(),
    status: a.status,
    completed: a.completed ?? null,
    quality: a.quality ?? null,
    noMistakes: a.noMistakes ?? false,
    mistakes: a.mistakes ?? [],
    remarks: a.remarks ?? null,
  });

/** A correction of an attempt: the outcome group travels whole (F12 plan Q5). */
const correctAttempt = (id: string, base: number, outcome: { status: string; completed: Quantity | null; quality: number | null; noMistakes: boolean; mistakes: unknown[] }) =>
  op('portion_attempt', 'UPDATE', id, outcome, base);

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

async function detail(api: APIRequestContext, id: string): Promise<Detail> {
  const res = await api.get(`/hifz/daily-records/${id}`);
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()) as Detail;
}

/** Marks the student Present and creates their record for the date; returns the record id. */
async function presentRecord(api: APIRequestContext, ids: Ids, student: StudentKey, date: string): Promise<string> {
  const [a, r] = await push(api, [attendance(ids, student, date, 'PRESENT'), record(ids, student, date)]);
  expect([a!.status, r!.status], JSON.stringify([a, r])).toEqual(['APPLIED', 'APPLIED']);
  return r!.entityId!;
}

const actions = async (control: TestControl, id: string) => (await control.auditForTarget(id)).map((a) => a.action);

const SABAQ_2_1_10 = { surahStart: 2, ayahStart: 1, surahEnd: 2, ayahEnd: 10 };

test.describe('F05 · Daily Hifz entry', { tag: '@F05' }, () => {
  test('F05-AC1 (US-018) report_date is the date the Teacher chose, separate from save and sync times', async ({ as, control }) => {
    // As teacher.a1 save a record for S1 with report_date = yesterday.
    // Stored report_date is yesterday; created_at and synced_at are today.
    const ids = await control.rosterIds();
    const teacher = await as('teacher.a1');
    const day = classDay(1);
    const id = await applied(teacher, record(ids, 'S1', day));
    const d = await detail(teacher, id);
    expect(d.record.reportDate).toBe(day);
    expect(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date(d.record.serverReceivedAt))).toBe(today());
    expect(await actions(control, id)).toEqual(['DAILY_RECORD_CREATED']);
  });

  test('F05-AC2 (US-018) a record synced the next day keeps its report_date', async ({ as, control }) => {
    // Submit a sync operation for report_date D with client save time D; control.advanceClock(1 day) before sending.
    // Stored report_date is D.
    const ids = await control.rosterIds();
    const day = classDay(0);
    const savedAt = new Date().toISOString();
    const o = record(ids, 'S1', day, null, savedAt);
    await control.advanceClock(24 * 60 * 60 * 1000);
    const teacher = await as('teacher.a1');
    const id = await applied(teacher, o);
    const d = await detail(teacher, id);
    expect(d.record.reportDate).toBe(day);
    expect(d.record.clientSavedAt).toBe(savedAt);
    expect(Date.parse(d.record.serverReceivedAt) - Date.parse(savedAt)).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000 - 60_000);
  });

  test.fixme('F05-AC4 (US-018) editing a portion audits, recalculates drafts and reports, and keeps confirmed homework', async () => {
    // Waits for homework (F08) and weekly reports (F09); the audited edit is covered in apps/api/test/hifz (plan §1).
    // Seed a Partial portion with a confirmed homework and a draft suggestion; edit the portion.
    // Audit has the edit; the draft is rebuilt; the weekly report total changes; the confirmed homework is unchanged;
    // the response carries the "Confirmed homework was not changed" notice.
  });

  test('F05-AC5 (US-018) an Absent day has no failed portion and no quality', async ({ as, control }) => {
    // Save S1 Absent for date D; no portion is failed and no quality value exists for D.
    const ids = await control.rosterIds();
    const teacher = await as('teacher.a1');
    const day = classDay(1);
    const [a, r] = await push(teacher, [attendance(ids, 'S1', day, 'ABSENT'), record(ids, 'S1', day)]);
    expect([a!.status, r!.status]).toEqual(['APPLIED', 'APPLIED']);
    const [p] = await push(teacher, [portion(r!.entityId!, { section: 'SABQI', paraNumber: 3, assigned: para(1) })]);
    expect(p).toMatchObject({ status: 'REJECTED', fields: { attendance: 'ATTENDANCE_CHANGE_TO_LATE' } });
    const d = await detail(teacher, r!.entityId!);
    expect(d.attendance).toEqual({ status: 'ABSENT', portionsAllowed: 'CHANGE_TO_LATE' });
    expect(d.portions).toEqual([]);
    expect(d.sectionSummary.every((s) => s.portionIds.length === 0)).toBe(true);
    // An ABSENT portion outcome carries no quality either (FR-ATT-007).
    const s2 = await presentRecord(teacher, ids, 'S2', day);
    const portionId = await applied(teacher, portion(s2, { section: 'SABQI', paraNumber: 3, assigned: para(1) }));
    const [withQuality] = await push(teacher, [attempt(portionId, { status: 'ABSENT', quality: 3 })]);
    expect(withQuality).toMatchObject({ status: 'REJECTED', fields: { quality: 'QUALITY_NOT_ALLOWED' } });
    await applied(teacher, attempt(portionId, { status: 'ABSENT' }));
    expect((await detail(teacher, s2)).portions[0]!.progress).toMatchObject({ currentStatus: 'ABSENT', quality: null, completed: null });
  });

  test('F05-AC6 (US-019) SINGLE mode refuses a second record for the same student and date', async ({ as, control }) => {
    // Create a record for S1 on D; create another → refused with a reference to the existing record.
    const ids = await control.rosterIds();
    const teacher = await as('teacher.a1');
    const day = classDay(1);
    const id = await applied(teacher, record(ids, 'S1', day));
    const [dup] = await push(teacher, [record(ids, 'S1', day)]);
    expect(dup).toMatchObject({ status: 'REJECTED', code: 'VALIDATION', fields: { reportDate: 'DUPLICATE_RECORD', 'reportDate.existingId': id } });
    const list = await (await teacher.get(`/hifz/daily-records?studentId=${ids.students.S1}&date=${day}`)).json();
    expect(list.items.map((r: { id: string }) => r.id)).toEqual([id]);
  });

  test('F05-AC7 (US-019) MULTI_SESSION mode requires a label and allows distinct labels', async ({ as, control }) => {
    // admin.a sets MULTI_SESSION. Record without session_label → rejected.
    // Records "Fajr" and "Asr" for S1 on D → both saved; a second "Fajr" → refused.
    const ids = await control.rosterIds();
    const admin = await as('admin.a');
    const set = await admin.put('/organization/daily-report-mode', { data: { mode: 'MULTI_SESSION' } });
    expect(set.status(), await set.text()).toBe(200);
    const teacher = await as('teacher.a1');
    const day = classDay(1);
    const [none] = await push(teacher, [record(ids, 'S1', day)]);
    expect(none).toMatchObject({ status: 'REJECTED', fields: { sessionLabel: 'SESSION_LABEL_REQUIRED' } });
    const fajr = await applied(teacher, record(ids, 'S1', day, 'Fajr'));
    await applied(teacher, record(ids, 'S1', day, 'Asr'));
    const [again] = await push(teacher, [record(ids, 'S1', day, 'Fajr')]);
    expect(again).toMatchObject({ status: 'REJECTED', fields: { sessionLabel: 'DUPLICATE_SESSION', 'sessionLabel.existingId': fajr } });
  });

  test('F05-AC8 (US-019) switching back to SINGLE is blocked while conflicts exist', async ({ as, control }) => {
    // With two sessions for S1 on D, admin.a sets SINGLE → refused; the response lists S1 and D.
    const ids = await control.rosterIds();
    const admin = await as('admin.a');
    expect((await admin.put('/organization/daily-report-mode', { data: { mode: 'MULTI_SESSION' } })).status()).toBe(200);
    const teacher = await as('teacher.a1');
    const day = classDay(1);
    await applied(teacher, record(ids, 'S1', day, 'Fajr'));
    await applied(teacher, record(ids, 'S1', day, 'Asr'));
    const res = await admin.put('/organization/daily-report-mode', { data: { mode: 'SINGLE' } });
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe('MODE_CONFLICTS');
    expect(body.error.conflicts).toEqual([{ studentId: ids.students.S1, studentName: 'Test Student One', reportDate: day, sessionLabels: ['Asr', 'Fajr'] }]);
    expect((await (await admin.get('/organization')).json()).dailyReportMode).toBe('MULTI_SESSION');
  });

  test('F05-AC9 (US-019) a Teacher cannot change the daily-report mode', async ({ as }) => {
    // As teacher.a1 update the mode → forbidden.
    const teacher = await as('teacher.a1');
    const res = await teacher.put('/organization/daily-report-mode', { data: { mode: 'MULTI_SESSION' } });
    expect(res.status()).toBe(403);
    expect((await res.json()).error.code).toBe('FORBIDDEN');
    expect((await (await teacher.get('/organization')).json()).dailyReportMode).toBe('SINGLE');
  });

  test('F05-AC10 (US-020) a Sabaq portion stores its range, lines, derived Para, and every other field', async ({ as, control }) => {
    // Save Sabaq: Al-Baqarah Ayat 1–10, total 10 LINES, assigned 10, completed 10, COMPLETED, 1 mistake, quality 2, remarks.
    // Read it back: every field matches; para_number is derived (Para 1) although none was sent; quantities are LINES.
    // (Synthetic Surah 2; Total Lines 10 is entered by hand, so its source is MANUAL.)
    await control.seedSyntheticQuran();
    const ids = await control.rosterIds();
    const teacher = await as('teacher.a1');
    const recordId = await presentRecord(teacher, ids, 'S1', classDay(1));
    const portionId = await applied(teacher, portion(recordId, { section: 'SABAQ', range: SABAQ_2_1_10, totalLines: 10, assigned: lines(10) }));
    await applied(
      teacher,
      attempt(portionId, { status: 'COMPLETED', completed: lines(10), quality: 2, mistakes: [{ category: 'TAJWEED', severity: 'MINOR', repeated: false }], remarks: 'Synthetic staff remark' }),
    );
    const p = (await detail(teacher, recordId)).portions[0]!;
    expect(p).toMatchObject({
      section: 'SABAQ',
      paraNumber: 1,
      range: SABAQ_2_1_10,
      assigned: lines(10),
      totalLines: 10,
      totalLinesSource: 'MANUAL',
      lineCountEdition: 'INDOPAK_16_LINE',
    });
    expect(p.attempts).toHaveLength(1);
    expect(p.attempts[0]).toMatchObject({
      status: 'COMPLETED',
      completed: lines(10),
      quality: 2,
      mistakeCount: 1,
      mistakes: [{ category: 'TAJWEED', severity: 'MINOR', repeated: false, position: 1 }],
      remarks: 'Synthetic staff remark',
    });
    expect(p.progress).toMatchObject({ currentStatus: 'COMPLETED', remaining: lines(0) });
  });

  test('F05-AC20 (US-020) a Sabaq portion in a Para unit is rejected; Sabqi and Manzil still accept Para presets', async ({ as, control }) => {
    // Save Sabaq with assigned Half (PARA 1/2) → validation error on the unit; nothing stored.
    // Save Sabqi Para 3 Salasah and Manzil Para 10 Rubu in the same record → accepted.
    await control.seedSyntheticQuran();
    const ids = await control.rosterIds();
    const teacher = await as('teacher.a1');
    const recordId = await presentRecord(teacher, ids, 'S1', classDay(1));
    const [half] = await push(teacher, [portion(recordId, { section: 'SABAQ', range: SABAQ_2_1_10, totalLines: 10, assigned: para(1, 2) })]);
    expect(half).toMatchObject({ status: 'REJECTED', code: 'VALIDATION', fields: { unit: 'UNIT_NOT_ALLOWED' } });
    expect((await detail(teacher, recordId)).portions).toEqual([]);
    const [sabqi, manzil] = await push(teacher, [
      portion(recordId, { section: 'SABQI', paraNumber: 3, assigned: para(3, 4) }),
      portion(recordId, { section: 'MANZIL', paraNumber: 10, assigned: para(1, 4) }),
    ]);
    expect([sabqi!.status, manzil!.status]).toEqual(['APPLIED', 'APPLIED']);
    const d = await detail(teacher, recordId);
    expect(d.portions.map((p) => [p.section, p.paraNumber, p.assigned])).toEqual([
      ['SABQI', 3, para(3, 4)],
      ['MANZIL', 10, para(1, 4)],
    ]);
  });

  test('F05-AC21 (US-020) a Sabaq range crossing two Surahs or ending before it starts is rejected', async ({ as, control }) => {
    // Al-Fatihah 5 → Al-Baqarah 3 → refused (one Surah per portion). Al-Baqarah 10 → 1 → refused.
    // Al-Baqarah 1–10 with no assigned lines sent → assigned defaults to total_lines.
    // (Synthetic Surahs 1 and 2.)
    await control.seedSyntheticQuran();
    const ids = await control.rosterIds();
    const teacher = await as('teacher.a1');
    const recordId = await presentRecord(teacher, ids, 'S1', classDay(1));
    const [cross] = await push(teacher, [portion(recordId, { section: 'SABAQ', range: { surahStart: 1, ayahStart: 5, surahEnd: 2, ayahEnd: 3 }, totalLines: 4, assigned: lines(4) })]);
    expect(cross).toMatchObject({ status: 'REJECTED', fields: { range: 'CROSSES_SURAH' } });
    const [backwards] = await push(teacher, [portion(recordId, { section: 'SABAQ', range: { surahStart: 2, ayahStart: 10, surahEnd: 2, ayahEnd: 1 }, totalLines: 4, assigned: lines(4) })]);
    expect(backwards).toMatchObject({ status: 'REJECTED', fields: { range: 'END_BEFORE_START' } });
    await applied(teacher, portion(recordId, { section: 'SABAQ', range: SABAQ_2_1_10, totalLines: 10 }));
    expect((await detail(teacher, recordId)).portions[0]).toMatchObject({ range: SABAQ_2_1_10, totalLines: 10, assigned: lines(10) });
  });

  test('F05-AC22 (US-020) Sabaq remaining lines, line limits, and the Not Remembered default', async ({ as, control }) => {
    // Assigned 10, completed 7 → remaining 3 LINES. Completed 11 → refused. Assigned 12 with total 10 → refused. Completed 2.5 → refused.
    // NOT_REMEMBERED with assigned 10 and no completed → completed 0, remaining 10 LINES.
    await control.seedSyntheticQuran();
    const ids = await control.rosterIds();
    const teacher = await as('teacher.a1');
    const recordId = await presentRecord(teacher, ids, 'S1', classDay(1));
    const p1 = await applied(teacher, portion(recordId, { section: 'SABAQ', range: SABAQ_2_1_10, totalLines: 10, assigned: lines(10) }));
    const [eleven] = await push(teacher, [attempt(p1, { status: 'PARTIAL', completed: lines(11) })]);
    expect(eleven).toMatchObject({ status: 'REJECTED', fields: { completed: 'ABOVE_ASSIGNED' } });
    const [twelve] = await push(teacher, [portion(recordId, { section: 'SABAQ', position: 2, range: SABAQ_2_1_10, totalLines: 10, assigned: lines(12) })]);
    expect(twelve).toMatchObject({ status: 'REJECTED', fields: { assigned: 'ABOVE_TOTAL' } });
    const [fraction] = await push(teacher, [attempt(p1, { status: 'PARTIAL', completed: { unit: 'LINES', numerator: 5, denominator: 2 } })]);
    expect(fraction).toMatchObject({ status: 'REJECTED', code: 'VALIDATION' });
    await applied(teacher, attempt(p1, { status: 'PARTIAL', completed: lines(7) }));
    const p2 = await applied(teacher, portion(recordId, { section: 'SABAQ', position: 2, range: { surahStart: 2, ayahStart: 11, surahEnd: 2, ayahEnd: 20 }, totalLines: 10, assigned: lines(10) }));
    await applied(teacher, attempt(p2, { status: 'NOT_REMEMBERED' }));
    const d = await detail(teacher, recordId);
    expect(d.portions[0]!.progress).toMatchObject({ completed: lines(7), remaining: lines(3) });
    expect(d.portions[1]!.attempts[0]!.completed).toEqual(lines(0));
    expect(d.portions[1]!.progress).toMatchObject({ currentStatus: 'NOT_REMEMBERED', completed: lines(0), remaining: lines(10) });
  });

  test('F05-AC11 (US-021) Sabqi portions keep independent statuses', async ({ as, control }) => {
    // Sabqi Para 3 COMPLETED and Para 4 PARTIAL; update Para 4 only; Para 3 is unchanged.
    const ids = await control.rosterIds();
    const teacher = await as('teacher.a1');
    const recordId = await presentRecord(teacher, ids, 'S1', classDay(1));
    const p3 = await applied(teacher, portion(recordId, { section: 'SABQI', paraNumber: 3, assigned: para(1) }));
    const p4 = await applied(teacher, portion(recordId, { section: 'SABQI', position: 2, paraNumber: 4, assigned: para(1) }));
    await applied(teacher, attempt(p3, { status: 'COMPLETED' }));
    const a4 = await applied(teacher, attempt(p4, { status: 'PARTIAL', completed: para(1, 4) }));
    const before = (await detail(teacher, recordId)).portions.find((p) => p.id === p3)!;
    await applied(teacher, correctAttempt(a4, 1, { status: 'PARTIAL', completed: para(1, 2), quality: 3, noMistakes: true, mistakes: [] }));
    const d = await detail(teacher, recordId);
    expect(d.portions.find((p) => p.id === p3)).toEqual(before);
    expect(d.portions.find((p) => p.id === p4)!.progress).toMatchObject({ currentStatus: 'PARTIAL', completed: para(1, 2), remaining: para(1, 2) });
    expect(await actions(control, a4)).toEqual(['PORTION_ATTEMPT_CREATED', 'PORTION_ATTEMPT_CORRECTED']);
  });

  test('F05-AC13 (US-022) three Manzil outcomes stay separate (AC-QTY-06)', async ({ as, control }) => {
    // Manzil Para 1 COMPLETED, Para 5 PARTIAL 1/2, Para 10 NOT_REMEMBERED; record and report show three lines.
    const ids = await control.rosterIds();
    const teacher = await as('teacher.a1');
    const recordId = await presentRecord(teacher, ids, 'S1', classDay(1));
    const m1 = await applied(teacher, portion(recordId, { section: 'MANZIL', paraNumber: 1, assigned: para(1) }));
    const m5 = await applied(teacher, portion(recordId, { section: 'MANZIL', position: 2, paraNumber: 5, assigned: para(1) }));
    const m10 = await applied(teacher, portion(recordId, { section: 'MANZIL', position: 3, paraNumber: 10, assigned: para(1) }));
    const results = await push(teacher, [attempt(m1, { status: 'COMPLETED' }), attempt(m5, { status: 'PARTIAL', completed: para(1, 2) }), attempt(m10, { status: 'NOT_REMEMBERED' })]);
    expect(results.map((r) => r.status)).toEqual(['APPLIED', 'APPLIED', 'APPLIED']);
    const d = await detail(teacher, recordId);
    expect(d.portions.map((p) => [p.paraNumber, p.progress.currentStatus, p.progress.completed])).toEqual([
      [1, 'COMPLETED', para(1)],
      [5, 'PARTIAL', para(1, 2)],
      [10, 'NOT_REMEMBERED', para(0)],
    ]);
    // The daily report's Manzil section lists three separate portions; totals are per unit only.
    const manzil = d.sectionSummary.find((s) => s.section === 'MANZIL')!;
    expect(manzil.portionIds).toEqual([m1, m5, m10]);
    expect(manzil.totals.assigned).toEqual([para(3)]);
  });

  test('F05-AC14 (US-022) Not Remembered without completed defaults to 0 completed, full remaining', async ({ as, control }) => {
    // Save NOT_REMEMBERED with assigned Half and no completed; stored completed 0/1 PARA, remaining 1/2 PARA.
    // Then save completed Rubu as a correction → accepted.
    const ids = await control.rosterIds();
    const teacher = await as('teacher.a1');
    const recordId = await presentRecord(teacher, ids, 'S1', classDay(1));
    const p = await applied(teacher, portion(recordId, { section: 'MANZIL', paraNumber: 2, assigned: para(1, 2) }));
    const a = await applied(teacher, attempt(p, { status: 'NOT_REMEMBERED' }));
    let d = await detail(teacher, recordId);
    expect(d.portions[0]!.attempts[0]!.completed).toEqual({ unit: 'PARA', numerator: 0, denominator: 1 });
    expect(d.portions[0]!.progress.remaining).toEqual(para(1, 2));
    await applied(teacher, correctAttempt(a, 1, { status: 'NOT_REMEMBERED', completed: para(1, 4), quality: null, noMistakes: false, mistakes: [] }));
    d = await detail(teacher, recordId);
    expect(d.portions[0]!.progress).toMatchObject({ completed: para(1, 4), remaining: para(1, 4) });
  });

  test('F05-AC15 (US-023) a second attempt keeps the first unchanged (AC-ATT-05)', async ({ as, control }) => {
    // Add attempt 2 to a portion; attempt 1 fields, recorder, and time are unchanged; both are listed.
    const ids = await control.rosterIds();
    const teacher = await as('teacher.a1');
    const recordId = await presentRecord(teacher, ids, 'S1', classDay(1));
    const p = await applied(teacher, portion(recordId, { section: 'SABQI', paraNumber: 3, assigned: para(1) }));
    await applied(teacher, attempt(p, { status: 'PARTIAL', completed: para(1, 2), quality: 4 }));
    const first = (await detail(teacher, recordId)).portions[0]!.attempts[0]!;
    const admin = await as('admin.a');
    await applied(admin, attempt(p, { attemptNo: 2, status: 'COMPLETED', quality: 2 }));
    const attempts = (await detail(teacher, recordId)).portions[0]!.attempts;
    expect(attempts.map((a) => a.attemptNo)).toEqual([1, 2]);
    expect(attempts[0]).toEqual(first);
    expect(attempts[1]!.recordedBy.userId).toBe(await control.userIdOf('admin.a'));
  });

  test('F05-AC16 (US-023) the latest attempt drives status and the assigned quantity counts once', async ({ as, control }) => {
    // Attempt 1 PARTIAL, attempt 2 COMPLETED; report shows COMPLETED and assigned quantity once.
    const ids = await control.rosterIds();
    const teacher = await as('teacher.a1');
    const recordId = await presentRecord(teacher, ids, 'S1', classDay(1));
    const p = await applied(teacher, portion(recordId, { section: 'SABQI', paraNumber: 3, assigned: para(1) }));
    await applied(teacher, attempt(p, { status: 'PARTIAL', completed: para(1, 2) }));
    await applied(teacher, attempt(p, { attemptNo: 2, status: 'COMPLETED' }));
    const d = await detail(teacher, recordId);
    expect(d.portions[0]!.progress).toMatchObject({ currentStatus: 'COMPLETED', assigned: para(1), completed: para(1), remaining: para(0), attemptCount: 2 });
    expect(d.sectionSummary.find((s) => s.section === 'SABQI')!.totals).toMatchObject({ assigned: [para(1)], completed: [para(1)] });
  });

  // Added by the decision review of 2026-10-30 (SRS §17).
  test('F05-AC17 (US-018) daily records cannot be created for future dates', async ({ as, control }) => {
    // Given the date tomorrow in the madrasa timezone, when a Teacher tries to create a daily record for it, then it is refused. A record for an earlier date is accepted.
    const ids = await control.rosterIds();
    const teacher = await as('teacher.a1');
    const [future] = await push(teacher, [record(ids, 'S1', addDays(today(), 1))]);
    expect(future).toMatchObject({ status: 'REJECTED', code: 'VALIDATION', fields: { reportDate: 'FUTURE' } });
    await applied(teacher, record(ids, 'S1', classDay(2)));
  });

  test('F05-AC18 (US-018) portions cannot be added while a student is Absent or on Leave', async ({ as, control }) => {
    // Given a student marked Absent or on Leave for the date, when the Teacher tries to add a portion in Daily Entry, then it is refused, and the app offers "Change to Late".
    const ids = await control.rosterIds();
    const teacher = await as('teacher.a1');
    const day = classDay(1);
    const results = await push(teacher, [attendance(ids, 'S1', day, 'ABSENT'), attendance(ids, 'S2', day, 'LEAVE'), record(ids, 'S1', day), record(ids, 'S2', day)]);
    expect(results.map((r) => r.status)).toEqual(['APPLIED', 'APPLIED', 'APPLIED', 'APPLIED']);
    for (const r of results.slice(2)) {
      const [p] = await push(teacher, [portion(r.entityId!, { section: 'SABQI', paraNumber: 3, assigned: para(1) })]);
      expect(p).toMatchObject({ status: 'REJECTED', code: 'VALIDATION', fields: { attendance: 'ATTENDANCE_CHANGE_TO_LATE' } });
      expect((await detail(teacher, r.entityId!)).attendance.portionsAllowed).toBe('CHANGE_TO_LATE');
    }
    // After "Change to Late" the portion is accepted.
    const [late] = await push(teacher, [op('attendance_record', 'UPDATE', results[0]!.entityId!, { status: 'LATE', leaveReason: null, absentNote: null }, 1)]);
    expect(late!.status).toBe('APPLIED');
    await applied(teacher, portion(results[2]!.entityId!, { section: 'SABQI', paraNumber: 3, assigned: para(1) }));
  });

  test.fixme('F05-AC19 (US-023) old records can still be corrected, with audit and recalculation', async () => {
    // Waits for homework (F08) and weekly reports (F09); the audited 90-day-old correction is covered in apps/api/test/hifz.
    // Given a daily record from 90 days ago, when an assigned Teacher corrects it, then the edit is accepted and audited, reports and draft homework recalculate, and confirmed homework is unchanged.
  });
});

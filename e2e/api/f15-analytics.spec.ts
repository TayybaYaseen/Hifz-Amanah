// F15 · Analytics and AI recommendations — API E2E (docs/specs/15-f15-analytics-ai.md)
// The AI provider is a controllable stub; no real provider is called (the launch provider is Deferred to Phase 7, SRS §17 DEC-B45).
// Screen journeys: e2e/mobile/f15-analytics/.
// Seeded fixtures: A1 (teacher.a1; S1, S2), A2 (teacher.a2; S3); every class meets Monday–Saturday. Source records are
// written through POST /sync/push (the app's path). Synthetic data only; Quran data is the SYNTHETIC test fixture.
import { createHash } from 'node:crypto';
import type { APIRequestContext } from '@playwright/test';
import { addDays, applied, attendanceOp, getJson, lines, op, para, presentRecord, push, recite, recordDetail, sourcesOf, today, uuidv7, type Ids, type StudentKey } from './support/daily-entry';
import { expect, test, type TestControl } from './support/fixtures';

const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
/** Last week's Monday: every day of that week is in the past and inside the seeded enrollment. */
const lastMonday = () => addDays(addDays(today(), -7), -(weekday(addDays(today(), -7)) - 1));
const day = (offset: number) => addDays(lastMonday(), offset); // 0 = Monday … 6 = Sunday

const CATEGORIES_ON = { ATTENDANCE: true, PROGRESS: true, MISTAKES: true, QUALITY: true, HOMEWORK: true };
const AI_ON = { enabled: true, provider: 'test-stub', monthlyRequestCap: null as number | null, teacherDailyCap: 20, monthlyBudgetMicroUsd: 10_000_000, categories: CATEGORIES_ON };
type SettingsPatch = Partial<Omit<typeof AI_ON, 'categories'>> & { categories?: Partial<typeof CATEGORIES_ON> };

const TAJWEED_MAJOR = { category: 'TAJWEED', severity: 'MAJOR', repeated: false };
const SABAQ_2_1_10 = { surahStart: 2, ayahStart: 1, surahEnd: 2, ayahEnd: 10 };
const NOTE = 'SYNTHETIC-E2E-AI-NOTE hesitates at waqf';
const S1_NAME = 'Test Student One';
const S1_EXTERNAL_ID = 'EXT-A-001';

let ids: Ids;

const settings = (api: APIRequestContext, patch: SettingsPatch = {}) =>
  api.put('/analytics/ai-settings', { data: { ...AI_ON, ...patch, categories: { ...CATEGORIES_ON, ...(patch.categories ?? {}) } } });

async function enableAi(admin: APIRequestContext, patch: SettingsPatch = {}) {
  const res = await settings(admin, patch);
  expect(res.status(), await res.text()).toBe(200);
  return res.json();
}

const ask = (api: APIRequestContext, student: StudentKey = 'S1', body: Record<string, unknown> = {}) =>
  api.post(`/analytics/${ids.students[student]}/ai-recommendation`, { data: { kind: 'WEEK', date: day(0), locale: 'en', ...body } });

const analytics = (api: APIRequestContext, student: StudentKey = 'S1') => api.get(`/analytics/${ids.students[student]}?kind=WEEK&date=${day(0)}`);

const codeOf = async (res: Awaited<ReturnType<APIRequestContext['get']>>) => ((await res.json()) as { error: { code: string; message: string } }).error;

/**
 * A synthetic week for S1: Mon–Wed recited, Thu absent.
 * Mon: Sabaq 10 lines, 6 done (PARTIAL, q2, Tajweed Major); Manzil Para 10, 1/2 of which 1/4 done (PARTIAL, q4, Tajweed Major + internal note).
 * Tue: Manzil Para 10, 1/2 of 1 (PARTIAL, q3, Tajweed Minor repeated); Sabqi Para 3, 3/4 of 3/4 (COMPLETED, no rating).
 * Wed: Manzil Para 10, 1/4 of 1 (PARTIAL, q5, Tajweed Major); Manzil Para 11 (NOT_REMEMBERED). Thu: Absent.
 */
async function seedWeek(teacher: APIRequestContext) {
  const mon = await presentRecord(teacher, ids, 'S1', day(0));
  await recite(teacher, mon, { section: 'SABAQ', range: SABAQ_2_1_10, totalLines: 10, assigned: lines(10) }, { status: 'PARTIAL', completed: lines(6), quality: 2, mistakes: [TAJWEED_MAJOR] });
  await recite(teacher, mon, { section: 'MANZIL', paraNumber: 10, assigned: para(1, 2) }, { status: 'PARTIAL', completed: para(1, 4), quality: 4, mistakes: [{ ...TAJWEED_MAJOR, note: NOTE, noteVisibility: 'INTERNAL' }] });
  const tue = await presentRecord(teacher, ids, 'S1', day(1));
  await recite(teacher, tue, { section: 'MANZIL', paraNumber: 10, assigned: para(1) }, { status: 'PARTIAL', completed: para(1, 2), quality: 3, mistakes: [{ category: 'TAJWEED', severity: 'MINOR', repeated: true }] });
  await recite(teacher, tue, { section: 'SABQI', paraNumber: 3, assigned: para(3, 4) }, { status: 'COMPLETED', completed: para(3, 4) });
  const wed = await presentRecord(teacher, ids, 'S1', day(2));
  await recite(teacher, wed, { section: 'MANZIL', position: 1, paraNumber: 10, assigned: para(1) }, { status: 'PARTIAL', completed: para(1, 4), quality: 5, mistakes: [TAJWEED_MAJOR] });
  await recite(teacher, wed, { section: 'MANZIL', position: 2, paraNumber: 11, assigned: para(1) }, { status: 'NOT_REMEMBERED' });
  const [absent] = await push(teacher, [attendanceOp(ids, 'S1', day(3), 'ABSENT')]);
  expect(absent!.status, JSON.stringify(absent)).toBe('APPLIED');
  return { mon, tue, wed };
}

/** Canonical JSON (keys sorted), as the server hashes the payload. */
function canonicalJson(value: unknown): string {
  const norm = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(norm) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, norm((v as Record<string, unknown>)[k])])) : v;
  return JSON.stringify(norm(value));
}

/** Daily entry, a report, and a sync pull, all with the AI provider failing (AC-AI-04). */
async function everythingElseWorks(teacher: APIRequestContext, control: TestControl, date: string) {
  const callsBefore = await control.aiProviderCalls();
  const rec = await presentRecord(teacher, ids, 'S1', date);
  await recite(teacher, rec, { section: 'SABQI', paraNumber: 4, assigned: para(1) }, { status: 'COMPLETED', completed: para(1), quality: 2 });
  const report = await getJson(teacher, `/reports/student?studentId=${ids.students.S1}&kind=WEEK&date=${day(0)}`);
  expect(report.report.days.map((d: { date: string }) => d.date)).toContain(date);
  const pull = await teacher.get('/sync/pull');
  expect(pull.status(), await pull.text()).toBe(200);
  const view = await analytics(teacher);
  expect(view.status()).toBe(200);
  expect((await view.json()).analytics.recordedDays).toBeGreaterThanOrEqual(4);
  // None of these touched the AI provider.
  expect(await control.aiProviderCalls()).toBe(callsBefore);
}

test.describe('F15 · Analytics and AI recommendations', { tag: '@F15' }, () => {
  test.beforeEach(async ({ control }) => {
    ids = await control.rosterIds();
    await control.seedSyntheticQuran();
  });

  test('F15-AC1 (US-062) analytics metrics match source records', async ({ as }) => {
    const teacher = await as('teacher.a1');
    await seedWeek(teacher);
    const { analytics: a } = await getJson(teacher, `/analytics/${ids.students.S1}?kind=WEEK&date=${day(3)}`);
    expect(a.period).toMatchObject({ kind: 'WEEK', from: day(0), to: day(6), timeZone: 'Asia/Karachi' });
    expect(a).toMatchObject({ hasData: true, recordedDays: 3, insufficientData: false });
    const section = (s: string) => a.progress.find((p: { section: string }) => p.section === s);
    // Assigned vs completed per unit, computed from the seeded rows above; units are never combined.
    expect(section('SABAQ').totals).toMatchObject({ assigned: [lines(10)], completed: [lines(6)], remaining: [lines(4)] });
    expect(section('SABQI').totals).toMatchObject({ assigned: [para(3, 4)], completed: [para(3, 4)] });
    expect(section('MANZIL').totals).toMatchObject({ assigned: [para(7, 2)], completed: [para(1)], remaining: [para(5, 2)] }); // 1/2+1+1+1; 1/4+1/2+1/4+0
    expect(section('MANZIL').statusCounts).toMatchObject({ PARTIAL: 3, NOT_REMEMBERED: 1 });
    // Mistake trend by category and severity; repeated counted apart.
    expect(a.mistakeTrend.totals).toMatchObject({ total: 4, bySeverity: { MAJOR: 3, MINOR: 1 }, repeated: 1, byCategory: expect.objectContaining({ TAJWEED: 4 }) });
    // Quality trend: 2, 4, 3, 5 rated → 3.5 (unrated portions are not zeros).
    const ratings = [2, 4, 3, 5];
    expect(a.qualityTrend.average).toMatchObject({ count: ratings.length, sum: ratings.reduce((x, y) => x + y, 0), value: 3.5 });
    expect(a.qualityTrend.points.map((p: { value: number | null }) => p.value)).toEqual([3, 3, 5]);
    // Recurring difficult portion: Para 10, a Major or repeated mistake in three attempts.
    expect(a.difficultPortions).toEqual([expect.objectContaining({ paraNumber: 10, majorOrRepeatedAttempts: 3 })]);
    // Attendance context.
    expect(a.attendance).toMatchObject({ attended: 3, present: 3, absent: 1 });
  });

  test('F15-AC4 (US-063) a recommendation states its date range and the metrics used', async ({ as, control }) => {
    await enableAi(await as('admin.a'));
    const teacher = await as('teacher.a1');
    await seedWeek(teacher);
    await control.setAiProvider('ok');
    const res = await ask(teacher);
    expect(res.status(), await res.text()).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ label: 'AI_SUGGESTION_REVIEW_REQUIRED', period: { kind: 'WEEK', from: day(0), to: day(6) }, locale: 'en' });
    expect(body.output.period).toEqual({ from: day(0), to: day(6) });
    expect(body.metricsUsed.length).toBeGreaterThan(0);
    expect(body.metricsUsed).toEqual([...new Set(body.output.cited_metrics.map((c: { key: string }) => c.key))]);
    // Every metric it used is a value that was sent.
    const { lastPayload } = await control.aiStub();
    const at = (key: string) => key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], lastPayload);
    for (const c of body.output.cited_metrics as { key: string; value: number }[]) expect(at(c.key)).toBe(c.value);
  });

  test('F15-AC6 (US-063) a provider timeout returns "AI unavailable" and nothing else breaks (AC-AI-04)', async ({ as, control }) => {
    await enableAi(await as('admin.a'));
    const teacher = await as('teacher.a1');
    await seedWeek(teacher);
    await control.setAiProvider('timeout');
    const res = await ask(teacher);
    expect(res.status()).toBe(503);
    expect(await codeOf(res)).toMatchObject({ code: 'AI_UNAVAILABLE', message: 'AI unavailable — try again later' });
    expect(await res.text()).not.toMatch(/observations|suggestions/);
    await everythingElseWorks(teacher, control, day(4));
  });

  test('F15-AC6 (US-063) with the AI provider down, daily entry, reports, and sync are unaffected', async ({ as, control }) => {
    await enableAi(await as('admin.a'));
    const teacher = await as('teacher.a1');
    await seedWeek(teacher);
    await control.setAiProvider('error');
    const res = await ask(teacher);
    expect(res.status()).toBe(503);
    expect((await codeOf(res)).code).toBe('AI_UNAVAILABLE');
    expect(await control.aiProviderCalls()).toBe(1);
    await everythingElseWorks(teacher, control, day(4));
    // The provider "not set up" at all changes nothing either.
    await control.setAiProvider('ok', { configured: false });
    expect((await codeOf(await ask(teacher))).code).toBe('AI_NOT_CONFIGURED');
    await everythingElseWorks(teacher, control, day(5));
  });

  test('F15-AC7 (US-063) invalid schema or uncited numbers are discarded', async ({ as, control }) => {
    await enableAi(await as('admin.a'));
    const teacher = await as('teacher.a1');
    await seedWeek(teacher);
    for (const mode of ['invalid-schema', 'uncited-number'] as const) {
      await control.setAiProvider(mode);
      const res = await ask(teacher);
      expect(res.status(), mode).toBe(503);
      expect((await codeOf(res)).code).toBe('AI_UNAVAILABLE');
      const text = await res.text();
      expect(text).not.toMatch(/observations|suggestions|cited_metrics|987654/);
    }
    expect(await control.aiProviderCalls()).toBe(2);
    // The discarded answer's number is stored nowhere.
    expect((await control.search('987654')).database).toBe(0);
  });

  test('F15-AC8 (US-063) an AI response changes no record (AC-AI-03)', async ({ as, control }) => {
    const admin = await as('admin.a');
    await enableAi(admin);
    const teacher = await as('teacher.a1');
    const { mon, tue, wed } = await seedWeek(teacher);
    // A confirmed homework assignment from Monday's record.
    const draft = await applied(teacher, op('homework_assignment', 'CREATE', uuidv7(), {
      studentId: ids.students.S1, sourceDailyRecordId: mon, dueDate: null, instructions: null, assignedDate: day(0),
      portions: [{ id: uuidv7(), section: 'SABQI', position: 1, paraNumber: 3, range: null, totalLines: null, assigned: para(1, 4), origin: 'TEACHER_ADDED', sourceAttemptId: null, instructions: null }],
    }));
    await applied(teacher, op('homework_assignment', 'COMMAND', draft.id, { confirmedAt: new Date().toISOString(), sources: await sourcesOf(teacher, mon) }, draft.rowVersion, 'CONFIRM_HOMEWORK'));
    const snapshot = async () => ({
      records: await Promise.all([mon, tue, wed].map((id) => recordDetail(teacher, id))),
      homework: await getJson(teacher, `/homework/assignments/${draft.id}`),
      report: (await getJson(teacher, `/reports/student?studentId=${ids.students.S1}&kind=WEEK&date=${day(0)}`)).report,
      analytics: (await getJson(teacher, `/analytics/${ids.students.S1}?kind=WEEK&date=${day(0)}`)).analytics,
    });
    const before = await snapshot();
    for (const mode of ['ok', 'insufficient', 'wrong-language-once', 'invalid-schema', 'uncited-number', 'error'] as const) {
      await control.setAiProvider(mode);
      await ask(teacher);
      await ask(admin, 'S1', { kind: 'MONTH', locale: 'ur' });
    }
    expect(await snapshot()).toEqual(before);
  });

  test('F15-AC9 (US-063) Student and Parent AI requests are refused', async ({ as, control }) => {
    await enableAi(await as('admin.a'));
    for (const who of ['student.s1', 'parent.p1'] as const) {
      const api = await as(who);
      for (const res of [await ask(api), await analytics(api), await api.get('/analytics/ai-settings'), await settings(api)]) {
        expect(res.status(), who).toBe(403);
        expect((await codeOf(res)).code).toBe('FORBIDDEN');
      }
    }
    expect(await control.aiProviderCalls()).toBe(0);
  });

  test('F15-AC10 (US-064) AI provider, on/off, and limits are saved and audited', async ({ as, control }) => {
    const admin = await as('admin.a');
    const saved = await enableAi(admin, { monthlyRequestCap: 40, teacherDailyCap: 5 });
    expect(saved).toMatchObject({ enabled: true, provider: 'test-stub', monthlyRequestCap: 40, teacherDailyCap: 5, providerConfigured: true });
    expect(saved.supportedProviders).toEqual([expect.objectContaining({ id: 'test-stub' })]);
    expect(await getJson(admin, '/analytics/ai-settings')).toMatchObject({ enabled: true, provider: 'test-stub', monthlyRequestCap: 40, teacherDailyCap: 5 });
    const audits = await control.auditForAction('AI_SETTINGS_UPDATED');
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ actor_user_id: await control.userIdOf('admin.a') });
    expect((audits[0]!.summary as { fields: string[] }).fields).toEqual(expect.arrayContaining(['enabled', 'provider', 'monthlyRequestCap', 'teacherDailyCap']));
    // Off again is saved and audited too.
    await enableAi(admin, { enabled: false, monthlyRequestCap: 40, teacherDailyCap: 5 });
    expect(await control.auditForAction('AI_SETTINGS_UPDATED')).toHaveLength(2);
    // An unknown provider, or turning AI on without one, is refused.
    expect((await codeOf(await settings(admin, { provider: 'no-such-provider' }))).code).toBe('VALIDATION');
    const noProvider = await settings(admin, { provider: null as unknown as string });
    expect(noProvider.status()).toBe(400);
    expect((await noProvider.json()).error.fields.provider).toBe('PROVIDER_REQUIRED');
    // A Teacher cannot change or read the settings.
    const teacher = await as('teacher.a1');
    expect((await settings(teacher, { enabled: true })).status()).toBe(403);
    expect((await teacher.get('/analytics/ai-settings')).status()).toBe(403);
    expect(await control.auditForAction('AI_SETTINGS_UPDATED')).toHaveLength(2);
  });

  test('F15-AC11 (US-064) AI turned off refuses requests', async ({ as, control }) => {
    const admin = await as('admin.a');
    await enableAi(admin);
    const teacher = await as('teacher.a1');
    await seedWeek(teacher);
    expect((await ask(teacher)).status()).toBe(200);
    const calls = await control.aiProviderCalls();
    await enableAi(admin, { enabled: false });
    const res = await ask(teacher);
    expect(res.status()).toBe(403);
    expect((await codeOf(res)).code).toBe('AI_DISABLED');
    expect(await control.aiProviderCalls()).toBe(calls);
    // The button is hidden (state DISABLED); the calculated analytics stay.
    const view = await analytics(teacher);
    expect(view.status()).toBe(200);
    expect(await view.json()).toMatchObject({ ai: { state: 'DISABLED' }, analytics: { recordedDays: 3 } });
  });

  test('F15-AC12 (US-064) at the usage limit, requests are refused without a provider call', async ({ as, control }) => {
    await enableAi(await as('admin.a'), { monthlyRequestCap: 1 });
    const teacher = await as('teacher.a1');
    await seedWeek(teacher);
    expect((await ask(teacher)).status()).toBe(200);
    const res = await ask(teacher);
    expect(res.status()).toBe(429);
    expect(await codeOf(res)).toMatchObject({ code: 'AI_LIMIT_REACHED', message: 'AI limit reached for this period' });
    expect(await control.aiProviderCalls()).toBe(1);
    expect((await (await analytics(teacher)).json()).ai.state).toBe('LIMIT_REACHED');
  });

  test('F15-AC13 (US-065) the default AI payload has no names, contacts, or notes', async ({ as, control }) => {
    await enableAi(await as('admin.a'));
    const teacher = await as('teacher.a1');
    await seedWeek(teacher);
    expect((await ask(teacher)).status()).toBe(200);
    const { lastPayload } = await control.aiStub();
    expect(lastPayload!.subject).toMatch(/^S-[A-Z]{8}$/);
    const sent = JSON.stringify(lastPayload);
    for (const forbidden of [S1_NAME, 'Student One', S1_EXTERNAL_ID, ids.students.S1, 'family1@example.test', 'student-s1', 'parent-p1', NOTE, 'SYNTHETIC-E2E-AI-NOTE']) {
      expect(sent).not.toContain(forbidden);
    }
    expect(sent).not.toMatch(/@/); // no email
    expect(sent).not.toMatch(/\d{10,}/); // no phone-like digit run
  });

  test('F15-AC14 (US-065) a disabled data category is left out of the payload', async ({ as, control }) => {
    const admin = await as('admin.a');
    await enableAi(admin);
    const teacher = await as('teacher.a1');
    await seedWeek(teacher);
    await ask(teacher);
    expect((await control.aiStub()).lastPayload).toHaveProperty('attendance');
    await enableAi(admin, { categories: { ATTENDANCE: false } });
    expect((await ask(teacher)).status()).toBe(200);
    const { lastPayload } = await control.aiStub();
    expect(lastPayload).not.toHaveProperty('attendance');
    expect(lastPayload!.categories).toEqual(['PROGRESS', 'MISTAKES', 'QUALITY', 'HOMEWORK']);
    expect(JSON.stringify(lastPayload)).not.toMatch(/"(attended|absent|present|leave)"/);
  });

  test('F15-AC15 (US-065) usage records hold the minimized payload and an input hash', async ({ as, control }) => {
    await enableAi(await as('admin.a'));
    const teacher = await as('teacher.a1');
    await seedWeek(teacher);
    const nameBefore = (await control.search(S1_NAME)).database;
    const noteBefore = (await control.search('SYNTHETIC-E2E-AI-NOTE')).database;
    expect(noteBefore).toBeGreaterThan(0);
    expect((await ask(teacher)).status()).toBe(200);
    const { lastPayload } = await control.aiStub();
    // The usage record carries the payload's SHA-256 (canonical JSON) and the pseudonymous payload itself …
    const hash = createHash('sha256').update(canonicalJson(lastPayload)).digest('hex');
    expect((await control.search(hash)).database).toBe(1);
    expect((await control.search(String(lastPayload!.subject))).database).toBe(1);
    // … and no raw student record: the name and the note text are in no new row.
    expect((await control.search(S1_NAME)).database).toBe(nameBefore);
    expect((await control.search('SYNTHETIC-E2E-AI-NOTE')).database).toBe(noteBefore);
    // The settings show the request counted for the month.
    const s = await getJson(await as('admin.a'), '/analytics/ai-settings');
    expect(s.usage).toMatchObject({ requests: 1, costMicroUsd: 1000 });
  });

  // Added by the decision review of 2026-10-30 (SRS §17).
  test('F15-AC16 (US-065) five AI data categories default on; names, contacts, and notes never sent', async ({ as, control }) => {
    const admin = await as('admin.a');
    const defaults = await getJson(admin, '/analytics/ai-settings');
    expect(defaults).toMatchObject({ enabled: false, provider: null, monthlyBudgetMicroUsd: 10_000_000, teacherDailyCap: 20, categories: CATEGORIES_ON, neverShared: ['NAMES', 'CONTACTS', 'NOTES'] });
    expect(Object.keys(defaults.categories).sort()).toEqual(['ATTENDANCE', 'HOMEWORK', 'MISTAKES', 'PROGRESS', 'QUALITY']);
    // No setting exists to send names, contact details, or notes.
    for (const key of ['shareNames', 'shareContacts', 'shareNotes']) {
      const res = await admin.put('/analytics/ai-settings', { data: { ...AI_ON, [key]: true } });
      expect(res.status(), key).toBe(400);
      expect((await res.json()).error.fields[key]).toBe('NOT_ALLOWED');
    }
    expect((await admin.put('/analytics/ai-settings', { data: { ...AI_ON, categories: { ...CATEGORIES_ON, NOTES: true } } })).status()).toBe(400);
    // A category switched off is absent from the next payload.
    await enableAi(admin, { categories: { QUALITY: false } });
    const teacher = await as('teacher.a1');
    await seedWeek(teacher);
    expect((await ask(teacher)).status()).toBe(200);
    const { lastPayload } = await control.aiStub();
    expect(lastPayload).not.toHaveProperty('quality');
    expect(lastPayload!.categories).not.toContain('QUALITY');
    expect(JSON.stringify(lastPayload)).not.toContain(NOTE);
  });

  test('F15-AC17 (US-063) AI output is in the requesting user’s language', async ({ as, control }) => {
    await enableAi(await as('admin.a'));
    const teacher = await as('teacher.a1');
    await seedWeek(teacher);
    let res = await ask(teacher, 'S1', { locale: 'ur' });
    expect(res.status(), await res.text()).toBe(200);
    let body = await res.json();
    expect(body.locale).toBe('ur');
    expect((await control.aiStub()).lastPromptLocale).toBe('ur');
    expect(body.output.observations.join(' ')).toMatch(/\p{Script=Arabic}/u);
    res = await ask(teacher, 'S1', { locale: 'ur-Latn' });
    body = await res.json();
    expect(body.locale).toBe('ur-Latn');
    expect((await control.aiStub()).lastPromptLocale).toBe('ur-Latn');
    expect(body.output.observations.join(' ')).not.toMatch(/\p{Script=Arabic}/u);
    // An answer in the wrong language is retried once with the language restated, then discarded.
    await control.setAiProvider('wrong-language-once');
    res = await ask(teacher, 'S1', { locale: 'ur' });
    expect(res.status()).toBe(200);
    expect((await res.json()).output.observations.join(' ')).toMatch(/\p{Script=Arabic}/u);
    expect((await control.aiStub()).lastPromptRestated).toBe(true);
    await control.setAiProvider('wrong-language');
    res = await ask(teacher, 'S1', { locale: 'ur' });
    expect(res.status()).toBe(503);
    expect((await codeOf(res)).code).toBe('AI_UNAVAILABLE');
  });

  test('F15-AC18 (US-064) AI requests stop at the monthly money cap', async ({ as, control }) => {
    const admin = await as('admin.a');
    const teacher = await as('teacher.a1');
    await seedWeek(teacher);
    // The default cap of USD 10: one call that costs the whole budget uses it up.
    const saved = await enableAi(admin);
    expect(saved.monthlyBudgetMicroUsd).toBe(10_000_000);
    await control.setAiProvider('ok', { costMicroUsd: 10_000_000 });
    expect((await ask(teacher)).status()).toBe(200);
    let res = await ask(teacher);
    expect(res.status()).toBe(429);
    expect((await codeOf(res)).code).toBe('AI_LIMIT_REACHED');
    expect(await control.aiProviderCalls()).toBe(1);
    // Deterministic analytics stay available.
    const view = await analytics(teacher);
    expect(view.status()).toBe(200);
    expect(await view.json()).toMatchObject({ ai: { state: 'LIMIT_REACHED' }, analytics: { recordedDays: 3 } });
    // A lower cap set by the Admin (the budget can only be lowered).
    await control.reset();
    ids = await control.rosterIds();
    await control.seedSyntheticQuran();
    const admin2 = await as('admin.a');
    const teacher2 = await as('teacher.a1');
    await seedWeek(teacher2);
    expect((await settings(admin2, { monthlyBudgetMicroUsd: 10_000_001 })).status()).toBe(400);
    await enableAi(admin2, { monthlyBudgetMicroUsd: 2000 });
    await control.setAiProvider('ok', { costMicroUsd: 1000 });
    expect((await ask(teacher2)).status()).toBe(200);
    expect((await ask(teacher2)).status()).toBe(200);
    res = await ask(teacher2);
    expect(res.status()).toBe(429);
    expect(await control.aiProviderCalls()).toBe(2);
    expect((await analytics(teacher2)).status()).toBe(200);
  });
});

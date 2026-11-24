// F15 · Analytics and the AI gateway — integration against real Postgres (docs/specs/15-f15-analytics-ai.md; US-062…065).
// Seeded fixtures (e2e/fixtures/personas.ts): A1 (teacher.a1; S1, S2), A2 (teacher.a2; S3), B1 (teacher.b1; SB1) in
// madrasa B; every class meets Monday–Saturday. Records are written through POST /sync/push; analytics and AI through
// /analytics/*. The AI provider is the test StubProvider ('test-stub'), driven by the test-control API; no real provider
// is ever called (the launch provider is Deferred, SRS §17 DEC-B45). Synthetic data only; Quran data is the SYNTHETIC
// fixture.
import { createHash } from 'node:crypto';
import { sql } from 'kysely';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { weekOf } from '@hifz/domain/calendar';
import { addDays } from '@hifz/domain/roster';
import { AnalyticsService, canonicalJson } from '../../src/modules/analytics/analytics-service.ts';
import { ProviderRegistry, StubProvider, type AiProvider } from '../../src/modules/analytics/providers.ts';
import { HomeworkService } from '../../src/modules/homework/homework-service.ts';
import { sabaqRanges } from '../../src/modules/hifz/shared.ts';
import type { Actor } from '../../src/modules/identity/auth-service.ts';
import { QuranMetadataService } from '../../src/modules/quran-ref/metadata-service.ts';
import { ReportService } from '../../src/modules/reporting/report-service.ts';
import { AppError } from '../../src/platform/errors.ts';
import { startHarness, type Harness } from '../support/harness.ts';
import { applied, attemptOp, attendanceOp, detail, lines, op, para, portionOp, presentRecord, push, recordOp, seedQuran, today, type AttemptInput, type Ids, type PortionInput } from '../hifz/support.ts';

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

const CATEGORIES_ON = { ATTENDANCE: true, PROGRESS: true, MISTAKES: true, QUALITY: true, HOMEWORK: true };
const AI_ON = { enabled: true, provider: 'test-stub' as string | null, monthlyRequestCap: null as number | null, teacherDailyCap: 20, monthlyBudgetMicroUsd: 10_000_000, categories: CATEGORIES_ON };
type SettingsPatch = Partial<Omit<typeof AI_ON, 'categories'>> & { categories?: Partial<typeof CATEGORIES_ON> };

async function putSettings(token: string, over: SettingsPatch = {}) {
  return h.call('PUT', '/analytics/ai-settings', token, { ...AI_ON, ...over, categories: { ...CATEGORIES_ON, ...(over.categories ?? {}) } });
}

async function enableAi(over: SettingsPatch = {}) {
  const res = await putSettings(await h.signIn('admin.a'), over);
  expect(res.statusCode, res.body).toBe(200);
  return res.json();
}

const stub = async (body: Record<string, unknown>) => {
  const res = await h.control('POST', '/ai/stub', body);
  expect(res.statusCode, res.body).toBe(200);
};
const stubState = async () => (await h.control('GET', '/ai/stub')).json() as { calls: number; lastPayload: Record<string, unknown> | null; lastPromptLocale: string | null; lastPromptRestated: boolean | null };

const ask = (token: string, student: keyof Ids['students'] = 'S1', body: Record<string, unknown> = {}) =>
  h.call('POST', `/analytics/${ids.students[student]}/ai-recommendation`, token, { kind: 'WEEK', date: day(0), locale: 'en', ...body });

const view = (token: string, student: keyof Ids['students'] = 'S1', kind = 'WEEK', date = day(0)) => h.call('GET', `/analytics/${ids.students[student]}?kind=${kind}&date=${date}`, token);

const errorCode = (res: { json(): unknown }) => (res.json() as { error: { code: string } }).error.code;

async function recite(token: string, recordId: string, p: PortionInput, a: AttemptInput) {
  const { id: portionId } = await applied(h, token, portionOp(recordId, p));
  const { id: attemptId } = await applied(h, token, attemptOp(portionId, a));
  return { portionId, attemptId };
}

const TAJWEED_MAJOR = { category: 'TAJWEED', severity: 'MAJOR', repeated: false };
const TAJWEED_MINOR_REPEATED = { category: 'TAJWEED', severity: 'MINOR', repeated: true };
const SABAQ_2_1_10 = { surahStart: 2, ayahStart: 1, surahEnd: 2, ayahEnd: 10 };
const PRIVATE_NOTE = 'SYNTHETIC-AI-INTERNAL-NOTE hesitates at waqf';
const REMARK = 'SYNTHETIC-AI-REMARK revise slowly';

/**
 * A synthetic week for S1 (teacher.a1): Mon–Wed recited, Thu absent.
 * - Mon: Sabaq 10 lines, 6 done (PARTIAL, q2, Tajweed Major); Manzil Para 10, 1/2 assigned, 1/4 done (PARTIAL, q4, Tajweed Major, internal note)
 * - Tue: Manzil Para 10, 1 assigned, 1/2 done (PARTIAL, q3, Tajweed Minor repeated); Sabqi Para 3, 3/4 done of 3/4 (COMPLETED, no rating)
 * - Wed: Manzil Para 10, 1 assigned, 1/4 done (PARTIAL, q5, Tajweed Major); Manzil Para 11, 1 assigned (NOT_REMEMBERED)
 * - Thu: Absent
 */
async function seedWeek(teacher: string) {
  const mon = await presentRecord(h, teacher, ids, 'S1', day(0));
  await recite(teacher, mon, { section: 'SABAQ', range: SABAQ_2_1_10, totalLines: 10, assigned: lines(10) }, { status: 'PARTIAL', completed: lines(6), quality: 2, mistakes: [TAJWEED_MAJOR], remarks: REMARK });
  await recite(teacher, mon, { section: 'MANZIL', paraNumber: 10, assigned: para(1, 2) }, { status: 'PARTIAL', completed: para(1, 4), quality: 4, mistakes: [{ ...TAJWEED_MAJOR, note: PRIVATE_NOTE, noteVisibility: 'INTERNAL' } as never] });
  const tue = await presentRecord(h, teacher, ids, 'S1', day(1));
  await recite(teacher, tue, { section: 'MANZIL', paraNumber: 10, assigned: para(1) }, { status: 'PARTIAL', completed: para(1, 2), quality: 3, mistakes: [TAJWEED_MINOR_REPEATED] });
  await recite(teacher, tue, { section: 'SABQI', paraNumber: 3, assigned: para(3, 4) }, { status: 'COMPLETED', completed: para(3, 4) });
  const wed = await presentRecord(h, teacher, ids, 'S1', day(2));
  await recite(teacher, wed, { section: 'MANZIL', position: 1, paraNumber: 10, assigned: para(1) }, { status: 'PARTIAL', completed: para(1, 4), quality: 5, mistakes: [TAJWEED_MAJOR] });
  await recite(teacher, wed, { section: 'MANZIL', position: 2, paraNumber: 11, assigned: para(1) }, { status: 'NOT_REMEMBERED' });
  const [absent] = await push(h, teacher, [attendanceOp(ids, 'S1', day(3), 'ABSENT')]);
  expect(absent!.status, JSON.stringify(absent)).toBe('APPLIED');
  return { mon, tue, wed };
}

/** A confirmed homework assignment and a draft for S1 (so the no-write check covers homework). */
async function seedHomework(teacher: string, recordId: string) {
  const added = (o: Record<string, unknown> = {}) => ({ id: uuidv7(), section: 'SABQI', position: 1, paraNumber: 3, range: null, totalLines: null, assigned: para(1, 4), origin: 'TEACHER_ADDED', sourceAttemptId: null, instructions: null, ...o });
  const draftOp = (assignedDate: string, sourceDailyRecordId: string | null) =>
    op('homework_assignment', 'CREATE', uuidv7(), { studentId: ids.students.S1, sourceDailyRecordId, dueDate: null, instructions: null, assignedDate, portions: [added()] }, null);
  const draft = await applied(h, teacher, draftOp(day(0), recordId));
  const d = await detail(h, teacher, recordId);
  const sources = d.portions.flatMap((p: { id: string; rowVersion: number; attempts: { id: string; rowVersion: number }[] }) => [
    { entity: 'lesson_portion', id: p.id, rowVersion: p.rowVersion },
    ...p.attempts.map((a) => ({ entity: 'portion_attempt', id: a.id, rowVersion: a.rowVersion })),
  ]);
  await applied(h, teacher, op('homework_assignment', 'COMMAND', draft.id, { confirmedAt: new Date().toISOString(), sources }, draft.rowVersion, [], 'CONFIRM_HOMEWORK'));
  await applied(h, teacher, draftOp(day(1), null));
}

/** Row count and an md5 of every row's text, per table (root connection: sees every madrasa). */
const RECORD_TABLES = [
  'daily_records',
  'lesson_portions',
  'portion_attempts',
  'attempt_mistakes',
  'attendance_records',
  'homework_assignments',
  'homework_portions',
  'report_cache',
  'report_stamps',
  'report_published',
  'students',
  'change_log',
  'sync_ops',
  'sync_conflicts',
  'audit_logs',
] as const;

async function snapshot(): Promise<Record<string, { n: number; md5: string }>> {
  const out: Record<string, { n: number; md5: string }> = {};
  for (const t of RECORD_TABLES) {
    const { rows } = await sql<{ n: number; md5: string | null }>`SELECT count(*)::int AS n, md5(string_agg(t::text, '|' ORDER BY t::text)) AS md5 FROM ${sql.table(t)} t`.execute(h.db);
    out[t] = { n: rows[0]!.n, md5: rows[0]!.md5 ?? '' };
  }
  return out;
}

const aiRows = () => h.db.selectFrom('ai_requests').selectAll().orderBy('created_at').orderBy('id').execute();
const usageRows = () => h.db.selectFrom('ai_usage_monthly').selectAll().execute();

async function actorOf(loginId: string): Promise<Actor> {
  const userId = await h.userId(loginId);
  const m = await h.db.selectFrom('memberships').select(['organization_id', 'all_classes', 'role']).where('user_id', '=', userId).executeTakeFirstOrThrow();
  return { userId, sessionId: uuidv7(), organizationId: m.organization_id, role: m.role, allClasses: m.all_classes, loginId, authenticatedAt: new Date() };
}

// ---------- Deterministic analytics (US-062) ----------

describe('F15 · deterministic analytics (US-062)', () => {
  it('F15-AC1 (US-062) progress, quantities per unit, mistake and quality trends, difficult portions, and attendance come from the source records', async () => {
    const teacher = await h.signIn('teacher.a1');
    await seedWeek(teacher);
    const res = await view(teacher);
    expect(res.statusCode, res.body).toBe(200);
    const { analytics: a, ai } = res.json();
    expect(ai).toEqual({ state: 'DISABLED' }); // AI is off by default (F15-AC16); analytics never need it
    expect(a.period).toMatchObject({ kind: 'WEEK', from: day(0), to: day(6), timeZone: 'Asia/Karachi', weekStart: 'MONDAY' });
    expect(a).toMatchObject({ hasData: true, recordedDays: 3, insufficientData: false, provisional: null });
    const section = (s: string) => a.progress.find((p: { section: string }) => p.section === s);
    // Per unit, never summed across units: Sabaq in lines; Sabqi and Manzil in Para fractions.
    expect(section('SABAQ').totals).toMatchObject({ assigned: [lines(10)], completed: [lines(6)], remaining: [lines(4)] });
    expect(section('SABQI').totals).toMatchObject({ assigned: [para(3, 4)], completed: [para(3, 4)], remaining: [para(0)] });
    // Manzil: 1/2 + 1 + 1 + 1 assigned; 1/4 + 1/2 + 1/4 + 0 completed; remaining per portion 1/4 + 1/2 + 3/4 + 1.
    expect(section('MANZIL').totals).toMatchObject({ assigned: [para(7, 2)], completed: [para(1)], remaining: [para(5, 2)] });
    expect(section('MANZIL').statusCounts).toMatchObject({ PARTIAL: 3, NOT_REMEMBERED: 1, COMPLETED: 0 });
    // Mistakes: four Tajweed (3 Major, 1 Minor), the repeated flag counted apart.
    expect(a.mistakeTrend.totals).toMatchObject({ total: 4, bySeverity: { MAJOR: 3, MINOR: 1 }, repeated: 1, byCategory: expect.objectContaining({ TAJWEED: 4, HARKAAT: 0 }) });
    const week = a.mistakeTrend.weeks.find((w: { from: string }) => w.from === day(0));
    expect(week).toMatchObject({ to: day(6), total: 4 });
    // Quality: ratings 2, 4, 3, 5 (the unrated portions are not zeros) → 14 / 4 = 3.5, nearest score 4 (.5 rounds up).
    expect(a.qualityTrend.average).toMatchObject({ count: 4, sum: 14, value: 3.5, nearestScore: 4 });
    expect(a.qualityTrend.axis).toEqual({ top: 1, bottom: 5 });
    expect(a.qualityTrend.points.map((p: { date: string; value: number | null }) => [p.date, p.value])).toEqual([
      [day(0), 3],
      [day(1), 3],
      [day(2), 5],
    ]);
    // Not Remembered takes a rating too; the unrated Sabqi and the unrated Not Remembered are "not recorded", never 0.
    expect(a.qualityCoverage).toMatchObject({ rated: 4, unrated: 2 });
    // Recurring difficulty: Para 10 has a Major or repeated mistake in three attempts.
    expect(a.difficultPortions).toEqual([expect.objectContaining({ paraNumber: 10, sections: ['MANZIL'], attempts: 3, majorOrRepeatedAttempts: 3 })]);
    // Attendance context: three attended, one absent; the rest of the week is not marked, never absent.
    expect(a.attendance).toMatchObject({ attended: 3, present: 3, absent: 1, leave: 0 });
    // A Student or Parent never sees analytics; a Teacher out of scope gets "not found".
    for (const who of ['student.s1', 'parent.p1'] as const) expect((await view(await h.signIn(who))).statusCode).toBe(403);
    expect((await view(await h.signIn('teacher.a2'))).statusCode).toBe(404);
    expect((await view(await h.signIn('teacher.b1'))).statusCode).toBe(404);
  });
});

// ---------- AI gateway (US-063, US-064, US-065) ----------

describe('F15 · AI gateway with a mock provider', () => {
  it('F15-AC16 (US-065) a new madrasa has AI off, the USD 10 budget, a daily cap of 20, and all five categories on; names, contacts, and notes have no setting', async () => {
    const admin = await h.signIn('admin.a');
    const res = await h.call('GET', '/analytics/ai-settings', admin);
    expect(res.statusCode, res.body).toBe(200);
    const s = res.json();
    expect(s).toMatchObject({ enabled: false, provider: null, monthlyRequestCap: null, teacherDailyCap: 20, monthlyBudgetMicroUsd: 10_000_000, categories: CATEGORIES_ON, neverShared: ['NAMES', 'CONTACTS', 'NOTES'] });
    expect(s.supportedProviders).toEqual([{ id: 'test-stub', label: expect.any(String) }]);
    expect(s.usage).toMatchObject({ requests: 0, costMicroUsd: 0 });
    // There is no way to opt names, contacts, or notes in: the keys are refused.
    for (const key of ['shareNames', 'shareContacts', 'shareNotes', 'NAMES']) {
      const bad = await h.call('PUT', '/analytics/ai-settings', admin, { ...AI_ON, [key]: true });
      expect(bad.statusCode, key).toBe(400);
      expect(bad.json().error.fields[key]).toBe('NOT_ALLOWED');
    }
    const badCategory = await h.call('PUT', '/analytics/ai-settings', admin, { ...AI_ON, categories: { ...CATEGORIES_ON, NOTES: true } });
    expect(badCategory.statusCode).toBe(400);
    expect(badCategory.json().error.fields['categories.NOTES'] ?? badCategory.json().error.fields.NOTES).toBe('NOT_ALLOWED');
  });

  it('F15-AC10/AC11 (US-064) on/off is enforced: off refuses with no provider call and hides the button; on answers', async () => {
    const teacher = await h.signIn('teacher.a1');
    await seedWeek(teacher);
    // Off (default).
    let res = await ask(teacher);
    expect(res.statusCode).toBe(403);
    expect(errorCode(res)).toBe('AI_DISABLED');
    expect((await view(teacher)).json().ai.state).toBe('DISABLED');
    expect((await stubState()).calls).toBe(0);
    expect(await aiRows()).toEqual([]);
    // On.
    await enableAi();
    expect((await view(teacher)).json().ai.state).toBe('READY');
    res = await ask(teacher);
    expect(res.statusCode, res.body).toBe(200);
    expect((await stubState()).calls).toBe(1);
    // Off again: refused, the analytics stay.
    await enableAi({ enabled: false });
    res = await ask(teacher);
    expect(errorCode(res)).toBe('AI_DISABLED');
    expect((await stubState()).calls).toBe(1);
    const v = await view(teacher);
    expect(v.statusCode).toBe(200);
    expect(v.json()).toMatchObject({ ai: { state: 'DISABLED' }, analytics: { recordedDays: 3 } });
  });

  it('F15 "When it fails" (US-063, US-064) no provider key configured: refused as not set up, and the settings say so', async () => {
    const teacher = await h.signIn('teacher.a1');
    await seedWeek(teacher);
    await enableAi();
    await stub({ configured: false });
    const res = await ask(teacher);
    expect(res.statusCode).toBe(503);
    expect(errorCode(res)).toBe('AI_NOT_CONFIGURED');
    expect((await stubState()).calls).toBe(0);
    expect((await view(teacher)).json().ai.state).toBe('NOT_CONFIGURED');
    expect((await h.call('GET', '/analytics/ai-settings', await h.signIn('admin.a'))).json()).toMatchObject({ enabled: true, provider: 'test-stub', providerConfigured: false });
  });

  it('F15-AC9 (US-063) Student and Parent are refused on every AI route; a Teacher cannot change settings; out of scope is not found', async () => {
    await enableAi();
    const teacher = await h.signIn('teacher.a1');
    await seedWeek(teacher);
    for (const who of ['student.s1', 'parent.p1'] as const) {
      const token = await h.signIn(who);
      for (const res of [await ask(token), await view(token), await h.call('GET', '/analytics/ai-settings', token), await putSettings(token)]) {
        expect(res.statusCode, `${who} ${res.body}`).toBe(403);
        expect(errorCode(res)).toBe('FORBIDDEN');
      }
    }
    expect((await h.call('GET', '/analytics/ai-settings', teacher)).statusCode).toBe(403);
    expect((await putSettings(teacher, { enabled: false })).statusCode).toBe(403);
    expect((await ask(await h.signIn('teacher.a2'))).statusCode).toBe(404); // S1 is not in A2
    const otherMadrasa = await ask(await h.signIn('teacher.b1')); // madrasa B: its own AI setting (off) is checked first
    expect(otherMadrasa.statusCode).toBe(403);
    expect(errorCode(otherMadrasa)).toBe('AI_DISABLED');
    expect((await ask(teacher, 'S3')).statusCode).toBe(404);
    expect((await stubState()).calls).toBe(0);
  });

  it('F15-AC12 (US-064) the monthly request cap refuses without a provider call; failed calls count too', async () => {
    const teacher = await h.signIn('teacher.a1');
    await seedWeek(teacher);
    await enableAi({ monthlyRequestCap: 2 });
    // A timed-out call still used the provider and counts.
    await stub({ mode: 'timeout', timeoutMs: 50 });
    expect((await ask(teacher)).statusCode).toBe(503);
    await stub({ mode: 'ok' });
    expect((await ask(teacher)).statusCode).toBe(200);
    expect((await stubState()).calls).toBe(2);
    const refused = await ask(teacher);
    expect(refused.statusCode).toBe(429);
    expect(refused.json().error).toMatchObject({ code: 'AI_LIMIT_REACHED', message: 'AI limit reached for this period' });
    expect((await stubState()).calls).toBe(2);
    expect((await ask(await h.signIn('admin.a'))).statusCode).toBe(429); // the cap is the madrasa's, not the user's
    expect(await aiRows()).toHaveLength(2);
    expect(await usageRows()).toEqual([expect.objectContaining({ requests: 2 })]);
    expect((await view(teacher)).json().ai.state).toBe('LIMIT_REACHED');
  });

  it('F15-AC12 (US-064) the per-Teacher daily cap refuses that Teacher only, and resets the next day', async () => {
    const teacher = await h.signIn('teacher.a1');
    await seedWeek(teacher);
    await enableAi({ teacherDailyCap: 1 });
    expect((await ask(teacher)).statusCode).toBe(200);
    const refused = await ask(teacher);
    expect(refused.statusCode).toBe(429);
    expect(errorCode(refused)).toBe('AI_LIMIT_REACHED');
    expect((await stubState()).calls).toBe(1);
    // Another user of the madrasa has their own daily allowance.
    expect((await ask(await h.signIn('admin.a'))).statusCode).toBe(200);
    expect((await stubState()).calls).toBe(2);
    // The next day the Teacher may ask again.
    h.clock.advance(24 * 60 * 60 * 1000);
    expect((await ask(await h.signIn('teacher.a1'))).statusCode).toBe(200);
  });

  it('F15-AC18 (US-064) requests stop at the monthly money cap (default USD 10, or a lower Admin cap); analytics stay available', async () => {
    const teacher = await h.signIn('teacher.a1');
    await seedWeek(teacher);
    // A lower cap set by the Admin: 2,000 micro-USD, each call costs 1,000.
    await enableAi({ monthlyBudgetMicroUsd: 2000 });
    await stub({ costMicroUsd: 1000 });
    expect((await ask(teacher)).statusCode).toBe(200);
    expect((await ask(teacher)).statusCode).toBe(200);
    const refused = await ask(teacher);
    expect(refused.statusCode).toBe(429);
    expect(errorCode(refused)).toBe('AI_LIMIT_REACHED');
    expect((await stubState()).calls).toBe(2);
    expect(await usageRows()).toEqual([expect.objectContaining({ requests: 2, cost_micro_usd: '2000' })]);
    const v = await view(teacher);
    expect(v.statusCode).toBe(200);
    expect(v.json()).toMatchObject({ ai: { state: 'LIMIT_REACHED' }, analytics: { recordedDays: 3 } });

    // The default cap: one call that costs the whole USD 10 uses it up.
    await h.reset();
    ids = (await h.control('GET', '/roster/ids')).json();
    await seedQuran(h);
    const t2 = await h.signIn('teacher.a1');
    await seedWeek(t2);
    const s = await enableAi();
    expect(s.monthlyBudgetMicroUsd).toBe(10_000_000);
    await stub({ costMicroUsd: 10_000_000 });
    expect((await ask(t2)).statusCode).toBe(200);
    expect(errorCode(await ask(t2))).toBe('AI_LIMIT_REACHED');
    expect((await stubState()).calls).toBe(1);
    // The budget can only be lowered: above USD 10 is refused.
    const over = await putSettings(await h.signIn('admin.a'), { monthlyBudgetMicroUsd: 10_000_001 });
    expect(over.statusCode).toBe(400);
    expect(over.json().error.fields.monthlyBudgetMicroUsd).toBe('INVALID');
  });

  it('F15-AC6 (US-063) a provider timeout or error is "AI unavailable"; daily entry, reports, and sync keep working (AC-AI-04)', async () => {
    const teacher = await h.signIn('teacher.a1');
    await seedWeek(teacher);
    await enableAi();
    for (const [mode, outcome] of [['timeout', 'TIMEOUT'], ['error', 'PROVIDER_ERROR']] as const) {
      await stub({ mode, timeoutMs: 50 });
      const res = await ask(teacher);
      expect(res.statusCode, mode).toBe(503);
      expect(res.json().error).toMatchObject({ code: 'AI_UNAVAILABLE', message: 'AI unavailable — try again later' });
      expect(JSON.stringify(res.json())).not.toMatch(/observations|suggestions/);
      expect((await aiRows()).at(-1)).toMatchObject({ outcome, output: null });
    }
    // Everything else still works with the provider down.
    const rec = await presentRecord(h, teacher, ids, 'S1', day(4));
    await recite(teacher, rec, { section: 'SABQI', paraNumber: 4, assigned: para(1) }, { status: 'COMPLETED', completed: para(1), quality: 2 });
    const report = await h.call('GET', `/reports/student?studentId=${ids.students.S1}&kind=WEEK&date=${day(0)}`, teacher);
    expect(report.statusCode, report.body).toBe(200);
    expect(report.json().report.days.map((d: { date: string }) => d.date)).toContain(day(4));
    const pull = await h.call('GET', '/sync/pull', teacher);
    expect(pull.statusCode, pull.body).toBe(200);
    const analytics = await view(teacher);
    expect(analytics.statusCode).toBe(200);
    expect(analytics.json().analytics.recordedDays).toBe(4);
  });

  it('F15-AC7 (US-063) invalid schema, an uncited number, or a wrong period is discarded and never returned', async () => {
    const teacher = await h.signIn('teacher.a1');
    await seedWeek(teacher);
    await enableAi();
    for (const mode of ['invalid-schema', 'uncited-number'] as const) {
      await stub({ mode });
      const res = await ask(teacher);
      expect(res.statusCode, mode).toBe(503);
      expect(errorCode(res)).toBe('AI_UNAVAILABLE');
      expect(res.body).not.toContain('987654');
      expect((await aiRows()).at(-1)).toMatchObject({ outcome: 'INVALID_OUTPUT', output: null });
    }
    // Nothing from a discarded answer is kept anywhere.
    expect((await h.control('POST', '/search', { text: '987654' })).json()).toMatchObject({ database: 0 });
  });

  it('F15-AC8 (US-063) AI requests and answers change no record, attempt, quality score, homework, or report cache (AC-AI-03)', async () => {
    const teacher = await h.signIn('teacher.a1');
    const { mon } = await seedWeek(teacher);
    await seedHomework(teacher, mon);
    await enableAi();
    const admin = await h.signIn('admin.a');
    const before = await snapshot();
    expect(before.homework_assignments!.n).toBe(2);
    for (const mode of ['ok', 'insufficient', 'wrong-language-once', 'invalid-schema', 'uncited-number', 'error', 'wrong-language', 'timeout'] as const) {
      await stub({ mode, timeoutMs: 50 });
      await ask(teacher);
      await ask(admin, 'S1', { kind: 'MONTH', locale: 'ur' });
      await view(teacher);
    }
    expect(await snapshot()).toEqual(before);
    // The only rows written are the AI trail and the usage counter.
    expect(await aiRows()).toHaveLength(16);
    expect(await usageRows()).toEqual([expect.objectContaining({ requests: 16 })]);
  });

  it('F15-AC10 (US-064) settings are saved and audited in the same transaction; invalid settings are refused', async () => {
    const admin = await h.signIn('admin.a');
    const owner = await h.signIn('owner.a');
    const saved = await putSettings(admin, { monthlyRequestCap: 50, teacherDailyCap: 5, monthlyBudgetMicroUsd: 4_000_000, categories: { HOMEWORK: false } });
    expect(saved.statusCode, saved.body).toBe(200);
    expect(saved.json()).toMatchObject({ enabled: true, provider: 'test-stub', monthlyRequestCap: 50, teacherDailyCap: 5, monthlyBudgetMicroUsd: 4_000_000, categories: { ...CATEGORIES_ON, HOMEWORK: false }, providerConfigured: true });
    expect((await h.call('GET', '/analytics/ai-settings', owner)).json()).toMatchObject({ monthlyRequestCap: 50, categories: { HOMEWORK: false } });
    const audits = (await h.control('GET', '/audit-action/AI_SETTINGS_UPDATED')).json().items as { actor_user_id: string; summary: { fields: string[]; changes: { field: string; from: unknown; to: unknown }[] } }[];
    expect(audits).toHaveLength(1);
    expect(audits[0]!.actor_user_id).toBe(await h.userId('admin.a'));
    expect(audits[0]!.summary.fields.sort()).toEqual(['enabled', 'monthlyBudgetMicroUsd', 'monthlyRequestCap', 'provider', 'shareHomework', 'teacherDailyCap'].sort());
    expect(audits[0]!.summary.changes).toEqual(expect.arrayContaining([{ field: 'enabled', from: false, to: true }, { field: 'provider', from: null, to: 'test-stub' }]));
    // Saving the same values again changes nothing and writes no audit.
    expect((await putSettings(admin, { monthlyRequestCap: 50, teacherDailyCap: 5, monthlyBudgetMicroUsd: 4_000_000, categories: { HOMEWORK: false } })).statusCode).toBe(200);
    expect((await h.control('GET', '/audit-action/AI_SETTINGS_UPDATED')).json().items).toHaveLength(1);
    // The Owner may change them too (a PUT carries every field).
    expect((await putSettings(owner, { enabled: false })).statusCode).toBe(200);
    expect((await h.control('GET', '/audit-action/AI_SETTINGS_UPDATED')).json().items).toHaveLength(2);
    // Same transaction: when the audit write fails, the change rolls back.
    await h.control('POST', '/audit/fail-next');
    const failed = await putSettings(admin, { enabled: true, monthlyRequestCap: 7 });
    expect(failed.statusCode).toBeGreaterThanOrEqual(500);
    expect((await h.call('GET', '/analytics/ai-settings', admin)).json()).toMatchObject({ enabled: false, monthlyRequestCap: null });
    expect((await h.control('GET', '/audit-action/AI_SETTINGS_UPDATED')).json().items).toHaveLength(2);
    // Validation: a provider is required to turn AI on; unknown providers, zero or negative limits are refused.
    const cases: [Record<string, unknown>, string, string][] = [
      [{ enabled: true, provider: null }, 'provider', 'PROVIDER_REQUIRED'],
      [{ provider: 'no-such-provider' }, 'provider', 'UNKNOWN_PROVIDER'],
      [{ monthlyRequestCap: 0 }, 'monthlyRequestCap', 'INVALID'],
      [{ monthlyRequestCap: -1 }, 'monthlyRequestCap', 'INVALID'],
      [{ teacherDailyCap: 0 }, 'teacherDailyCap', 'INVALID'],
      [{ monthlyBudgetMicroUsd: 0 }, 'monthlyBudgetMicroUsd', 'INVALID'],
    ];
    for (const [over, field, issue] of cases) {
      const res = await putSettings(admin, over as never);
      expect(res.statusCode, JSON.stringify(over)).toBe(400);
      expect(res.json().error.fields[field], JSON.stringify(over)).toBe(issue);
    }
    expect((await h.control('GET', '/audit-action/AI_SETTINGS_UPDATED')).json().items).toHaveLength(2);
  });

  it('F15-AC13/AC15 (US-065) the payload is minimized and pseudonymous; the stored record is that payload and its hash, with the answer only when shown', async () => {
    const teacher = await h.signIn('teacher.a1');
    await seedWeek(teacher);
    await enableAi();
    const res = await ask(teacher);
    expect(res.statusCode, res.body).toBe(200);
    const { lastPayload } = await stubState();
    expect(lastPayload!.subject).toMatch(/^S-[A-Z]{8}$/);
    const sent = JSON.stringify(lastPayload);
    for (const forbidden of ['Test Student One', 'EXT-A-001', ids.students.S1, 'family1@example.test', PRIVATE_NOTE, 'SYNTHETIC-AI', REMARK, 'student-s1', 'parent-p1']) {
      expect(sent).not.toContain(forbidden);
    }
    const [row] = await aiRows();
    expect(row).toMatchObject({ provider: 'test-stub', locale: 'en', period_from: day(0), period_to: day(6), outcome: 'OK', requested_by: await h.userId('teacher.a1'), provider_attempts: 1 });
    expect(row!.payload).toEqual(lastPayload);
    expect(row!.input_hash).toBe(createHash('sha256').update(canonicalJson(lastPayload)).digest('hex'));
    expect(row!.output).toEqual(res.json().output);
    const stored = JSON.stringify(row);
    for (const raw of ['Test Student One', 'EXT-A-001', ids.students.S1, PRIVATE_NOTE, REMARK]) expect(stored).not.toContain(raw);
    // The same student gets the same pseudonym on the next request; another student a different one.
    await ask(teacher);
    expect((await stubState()).lastPayload!.subject).toBe(lastPayload!.subject);
    await ask(teacher, 'S2');
    expect((await stubState()).lastPayload!.subject).not.toBe(lastPayload!.subject);
    // The note and remark texts exist only in their source rows, never copied into the AI trail.
    const ai = await h.db.selectFrom('ai_requests').select(sql<string>`ai_requests::text`.as('t')).execute();
    for (const r of ai) {
      expect(r.t).not.toContain('SYNTHETIC-AI');
      expect(r.t).not.toContain('Test Student');
    }
  });

  it('F15-AC14 (US-065) a category the Admin turns off is absent from the next payload', async () => {
    const teacher = await h.signIn('teacher.a1');
    await seedWeek(teacher);
    await enableAi();
    await ask(teacher);
    expect((await stubState()).lastPayload).toHaveProperty('attendance');
    await enableAi({ categories: { ATTENDANCE: false, HOMEWORK: false } });
    expect((await ask(teacher)).statusCode).toBe(200);
    const { lastPayload } = await stubState();
    expect(lastPayload).not.toHaveProperty('attendance');
    expect(lastPayload).not.toHaveProperty('homework');
    expect(lastPayload!.categories).toEqual(['PROGRESS', 'MISTAKES', 'QUALITY']);
    expect(lastPayload).toHaveProperty('mistakes');
    // The stored payload matches what was sent.
    expect((await aiRows()).at(-1)!.payload).toEqual(lastPayload);
  });

  it('F15-AC17 (US-063) the request asks for the user’s language; a wrong-language answer is retried once, then discarded', async () => {
    const teacher = await h.signIn('teacher.a1');
    await seedWeek(teacher);
    await enableAi();
    // Urdu: Arabic-script text; Roman Urdu: Latin-script text.
    let res = await ask(teacher, 'S1', { locale: 'ur' });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().locale).toBe('ur');
    expect((await stubState()).lastPromptLocale).toBe('ur');
    expect(res.json().output.observations.join(' ')).toMatch(/\p{Script=Arabic}/u);
    expect((await aiRows()).at(-1)).toMatchObject({ locale: 'ur', outcome: 'OK' });
    res = await ask(teacher, 'S1', { locale: 'ur-Latn' });
    expect(res.statusCode).toBe(200);
    expect((await stubState()).lastPromptLocale).toBe('ur-Latn');
    expect(res.json().output.observations.join(' ')).not.toMatch(/\p{Script=Arabic}/u);
    // Wrong language once: retried with the language restated, then shown.
    await stub({ mode: 'wrong-language-once' });
    res = await ask(teacher, 'S1', { locale: 'ur' });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().output.observations.join(' ')).toMatch(/\p{Script=Arabic}/u);
    expect((await stubState()).lastPromptRestated).toBe(true);
    expect((await aiRows()).at(-1)).toMatchObject({ outcome: 'OK', provider_attempts: 2, cost_micro_usd: '2000' });
    // Wrong language twice: discarded.
    await stub({ mode: 'wrong-language' });
    res = await ask(teacher, 'S1', { locale: 'ur' });
    expect(res.statusCode).toBe(503);
    expect(errorCode(res)).toBe('AI_UNAVAILABLE');
    expect((await aiRows()).at(-1)).toMatchObject({ outcome: 'WRONG_LANGUAGE', provider_attempts: 2, output: null });
    // A locale outside the three is refused.
    expect((await ask(teacher, 'S1', { locale: 'fr' })).statusCode).toBe(400);
  });

  it('F15 edge case (US-063) too little data: the answer must say the data is insufficient', async () => {
    const teacher = await h.signIn('teacher.a1');
    const rec = await presentRecord(h, teacher, ids, 'S1', day(0));
    await recite(teacher, rec, { section: 'SABQI', paraNumber: 4, assigned: para(1) }, { status: 'COMPLETED', completed: para(1), quality: 2 });
    await enableAi();
    expect((await view(teacher)).json().analytics).toMatchObject({ recordedDays: 1, insufficientData: true });
    const res = await ask(teacher);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().output).toMatchObject({ data_insufficient: true, cited_metrics: [] });
    expect((await stubState()).lastPayload).toMatchObject({ dataInsufficient: true });
  });

  it('F15 edge case (US-064) switching provider mid-month keeps the madrasa usage counts; new requests use the new provider', async () => {
    const teacher = await h.signIn('teacher.a1');
    await seedWeek(teacher);
    // A gateway with two registered adapters (both test doubles), on the harness database.
    const first = new StubProvider();
    const inner = new StubProvider();
    inner.costMicroUsd = 3000;
    let secondCalls = 0;
    const second: AiProvider = {
      id: 'second-test-stub',
      label: 'Second test stub',
      configured: () => true,
      recommend: (payload, schema, options) => {
        secondCalls += 1;
        return inner.recommend(payload, schema, options);
      },
    };
    const quran = new QuranMetadataService(h.db, h.clock, sabaqRanges, { allowSynthetic: true });
    const homework = new HomeworkService(h.db, h.clock, quran);
    const gateway = new AnalyticsService({
      db: h.db,
      clock: h.clock,
      reports: new ReportService(h.db, h.clock, homework),
      homework,
      providers: new ProviderRegistry([first, second]),
      runtime: { pseudonymSecret: 'integration-pseudonym-secret', timeoutMs: 2000 },
      log: { warn: () => undefined },
    });
    const admin = await actorOf('admin-a');
    const t = await actorOf('teacher-a1');
    const request = { kind: 'WEEK', date: day(0), locale: 'en' };
    await gateway.updateSettings(admin, { ...AI_ON, provider: 'test-stub', monthlyRequestCap: 3 });
    await gateway.recommend(t, ids.students.S1, request);
    await gateway.recommend(t, ids.students.S1, request);
    await gateway.updateSettings(admin, { ...AI_ON, provider: 'second-test-stub', monthlyRequestCap: 3 });
    await gateway.recommend(t, ids.students.S1, request);
    expect([first.calls, secondCalls]).toEqual([2, 1]);
    const settings = await gateway.getSettings(admin);
    expect(settings.provider).toBe('second-test-stub');
    expect(settings.usage).toMatchObject({ requests: 3, costMicroUsd: 1000 + 1000 + 3000 });
    expect((await aiRows()).map((r) => r.provider)).toEqual(['test-stub', 'test-stub', 'second-test-stub']);
    // The cap counts across both providers.
    await expect(gateway.recommend(t, ids.students.S1, request)).rejects.toMatchObject({ code: 'AI_LIMIT_REACHED' });
    expect(secondCalls).toBe(1);
    expect(AppError).toBeDefined();
  });

  it('F15-AC4 (US-063) the recommendation is labelled for review and states its date range and the metrics used', async () => {
    const teacher = await h.signIn('teacher.a1');
    await seedWeek(teacher);
    await enableAi();
    const res = await ask(teacher);
    expect(res.statusCode, res.body).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ label: 'AI_SUGGESTION_REVIEW_REQUIRED', period: { kind: 'WEEK', from: day(0), to: day(6) }, locale: 'en' });
    expect(body.output.period).toEqual({ from: day(0), to: day(6) });
    expect(body.metricsUsed.length).toBeGreaterThan(0);
    expect(body.metricsUsed).toEqual([...new Set(body.output.cited_metrics.map((c: { key: string }) => c.key))]);
    // Every cited metric is a value that was sent.
    const { lastPayload } = await stubState();
    const valueAt = (key: string) => key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], lastPayload);
    for (const c of body.output.cited_metrics as { key: string; value: number }[]) expect(valueAt(c.key)).toBe(c.value);
    expect(body.metricsUsed).toEqual(expect.arrayContaining(['recordedDays', 'mistakes.totals.total', 'attendance.attended', 'quality.average']));
    expect(valueAt('recordedDays')).toBe(3);
    expect(valueAt('mistakes.totals.total')).toBe(4);
    expect(valueAt('quality.average')).toBe(3.5);
  });
});

// Keep the imported helper referenced (recordOp is used by other suites' patterns; not needed here).
void recordOp;

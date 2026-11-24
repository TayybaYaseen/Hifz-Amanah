// F15 · Analytics and AI recommendations — unit: AI request and response guards (docs/specs/15-f15-analytics-ai.md)
//
// The gateway (AnalyticsService) runs here against an in-memory Kysely driver that records every SQL statement and
// answers the few reads the gateway makes (settings, usage, the daily count, the student's contact ids). The source
// rows come from the SYNTHETIC analytics fixture (packages/domain/analytics/synthetic-fixture.ts) through a mocked
// loadReportInputs, and the provider is the test StubProvider. No database, no network. Synthetic data only.
import { createHash } from 'node:crypto';
import {
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type CompiledQuery,
  type DatabaseConnection,
  type Driver,
  type QueryResult,
} from 'kysely';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiOutput } from '@hifz/contracts';
import { buildAnalytics, checkAiOutput, minimizeForAi, payloadTextScan, type AiDataCategory, type AiPayload } from '@hifz/domain/analytics';
import { SYNTHETIC_NAME, SYNTHETIC_NOTE, SYNTHETIC_REMARK, syntheticInput } from '@hifz/domain/analytics/synthetic-fixture';
import { reportPeriod, type ReportInput } from '@hifz/domain/reports';
import type { Clock } from '../../platform/clock.ts';
import type { Database, Db } from '../../platform/db.ts';
import { AppError } from '../../platform/errors.ts';
import type { HomeworkService } from '../homework/homework-service.ts';
import type { Actor } from '../identity/auth-service.ts';
import type { ReportService } from '../reporting/report-service.ts';
import { AnalyticsService, canonicalJson, forbiddenTerms, inputHashOf, pseudonymOf } from './analytics-service.ts';
import { ProviderRegistry, STUB_MODES, StubProvider, type StubMode } from './providers.ts';

// ---------- Synthetic ids and source ----------

const ORG = '01960000-0000-7000-8000-0000000000a1';
const STUDENT = '01960000-0000-7000-8000-000000000001';
const OTHER_STUDENT = '01960000-0000-7000-8000-000000000002';
const SECRET = 'unit-test-pseudonym-secret';
const EXTERNAL_ID = 'EXT-UNIT-001';
const GUARDIAN_EMAIL = 'guardian.unit@example.test';

const source = vi.hoisted(() => ({ input: null as unknown }));

vi.mock('../reporting/sources.ts', () => ({
  // The period's source rows for the one requested student (the real loader reads Postgres).
  loadReportInputs: async (_tx: unknown, _deps: unknown, _org: string, students: { id: string }[]) => new Map([[students[0]!.id, source.input]]),
}));

const inputFor = (o: Partial<ReportInput> = {}): ReportInput => syntheticInput({ student: { id: STUDENT, name: SYNTHETIC_NAME }, ...o });

const ALL_ON: Record<AiDataCategory, boolean> = { ATTENDANCE: true, PROGRESS: true, MISTAKES: true, QUALITY: true, HOMEWORK: true };

// ---------- An in-memory Kysely driver that records every statement ----------

interface Statement {
  sql: string;
  params: readonly unknown[];
}

const WRITE = /^\s*(insert\s+into|update|delete\s+from|merge\s+into|truncate)\s+"?(\w+)"?/i;

class RecordingDb {
  readonly statements: Statement[] = [];
  settings: Record<string, unknown> | null = null;
  usage = { requests: 0, cost_micro_usd: '0' };
  todayCount = 0;
  studentRow = { external_student_id: EXTERNAL_ID, private_notes: null as string | null };
  guardians: { guardian_user_id: string }[] = [];
  users: { email: string | null; display_name: string; login_id: string }[] = [];
  readonly db: Db;

  constructor() {
    const rows = (q: string): unknown[] => this.rowsFor(q);
    const log = (s: Statement) => this.statements.push(s);
    const connection: DatabaseConnection = {
      async executeQuery<R>(q: CompiledQuery): Promise<QueryResult<R>> {
        log({ sql: q.sql, params: q.parameters });
        return { rows: rows(q.sql) as R[] };
      },
      // eslint-disable-next-line require-yield
      async *streamQuery() {
        throw new Error('streamQuery is not used by the gateway');
      },
    };
    const driver: Driver = {
      init: async () => undefined,
      acquireConnection: async () => connection,
      beginTransaction: async () => void log({ sql: 'begin', params: [] }),
      commitTransaction: async () => void log({ sql: 'commit', params: [] }),
      rollbackTransaction: async () => void log({ sql: 'rollback', params: [] }),
      releaseConnection: async () => undefined,
      destroy: async () => undefined,
    };
    this.db = new Kysely<Database>({
      dialect: {
        createAdapter: () => new PostgresAdapter(),
        createDriver: () => driver,
        createIntrospector: (db) => new PostgresIntrospector(db),
        createQueryCompiler: () => new PostgresQueryCompiler(),
      },
    });
  }

  private rowsFor(sqlText: string): unknown[] {
    const s = sqlText.toLowerCase();
    if (!s.trimStart().startsWith('select')) return [];
    if (s.includes('from "org_ai_settings"')) return this.settings ? [this.settings] : [];
    if (s.includes('from "ai_usage_monthly"')) return [this.usage];
    if (s.includes('from "ai_requests"')) return [{ n: String(this.todayCount) }];
    if (s.includes('from "students"')) return [this.studentRow];
    if (s.includes('from "student_guardians"')) return this.guardians;
    if (s.includes('from "student_accounts"')) return [];
    if (s.includes('from "users"')) return this.users;
    if (s.includes('from "organizations"')) return [{ timezone: 'Asia/Karachi' }];
    return [];
  }

  /** The tables written by INSERT / UPDATE / DELETE statements, in order. */
  writtenTables(): string[] {
    return this.statements.flatMap((s) => {
      const m = WRITE.exec(s.sql);
      return m ? [m[2]!] : [];
    });
  }

  /** The ai_requests row the gateway inserted (columns zipped with their parameters), or null. */
  aiRequestRow(): Record<string, unknown> | null {
    const stmt = this.statements.find((s) => /^\s*insert into "ai_requests"/i.test(s.sql));
    if (!stmt) return null;
    const cols = /\(([^)]*)\)\s*values/i.exec(stmt.sql)![1]!.split(',').map((c) => c.trim().replace(/"/g, ''));
    return Object.fromEntries(cols.map((c, i) => [c, stmt.params[i]]));
  }
}

const settingsRow = (o: Record<string, unknown> = {}) => ({
  organization_id: ORG,
  enabled: true,
  provider: 'test-stub',
  monthly_request_cap: null,
  teacher_daily_cap: 20,
  monthly_budget_micro_usd: '10000000',
  share_attendance: true,
  share_progress: true,
  share_mistakes: true,
  share_quality: true,
  share_homework: true,
  updated_by: null,
  updated_at: new Date('2026-11-01T00:00:00Z'),
  ...o,
});

const actor = (role: Actor['role'], o: Partial<Actor> = {}): Actor => ({
  userId: '01960000-0000-7000-8000-0000000000f1',
  sessionId: '01960000-0000-7000-8000-0000000000f2',
  organizationId: ORG,
  role,
  allClasses: false,
  loginId: `unit-${role.toLowerCase()}`,
  authenticatedAt: new Date('2026-11-30T06:00:00Z'),
  ...o,
});

const reports = {
  reachOf: async (_tx: unknown, a: Actor) => (a.role === 'TEACHER' && !a.allClasses ? ['class-1'] : null),
  studentInReach: async (_tx: unknown, _org: string, id: string) => {
    if (id !== STUDENT) throw new AppError('NOT_FOUND');
    return { id, name: SYNTHETIC_NAME };
  },
  periodIn: async (_tx: unknown, _org: string, kind: 'WEEK' | 'MONTH', date?: string) => ({
    settings: { timeZone: 'Asia/Karachi', weekStart: 'MONDAY' },
    today: '2026-11-30',
    period: reportPeriod(kind, date ?? '2026-11-30'),
  }),
};

function gateway(fake: RecordingDb, stub: StubProvider) {
  return new AnalyticsService({
    db: fake.db,
    clock: { now: () => new Date('2026-11-30T07:00:00Z') } as unknown as Clock,
    reports: reports as unknown as ReportService,
    homework: {} as unknown as HomeworkService,
    providers: new ProviderRegistry([stub]),
    runtime: { pseudonymSecret: SECRET, timeoutMs: 100 },
    log: { warn: vi.fn() },
  });
}

const REQUEST = { kind: 'MONTH', date: '2026-11-04', locale: 'en' } as const;

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'OK';
  } catch (e) {
    if (e instanceof AppError) return e.code;
    throw e;
  }
}

let fake: RecordingDb;
let stub: StubProvider;

beforeEach(() => {
  source.input = inputFor();
  fake = new RecordingDb();
  fake.settings = settingsRow();
  stub = new StubProvider();
});

// ---------- Payload minimizer ----------

describe('F15 · payload minimizer', () => {
  it('F15-AC13 (US-065) the default payload has no student name, contact details, or notes; the student is a pseudonym', async () => {
    // The pseudonym: "S-" + 8 capital letters, stable per student, different per student and per madrasa, never the id.
    const p1 = pseudonymOf(SECRET, ORG, STUDENT);
    expect(p1).toMatch(/^S-[A-Z]{8}$/);
    expect(pseudonymOf(SECRET, ORG, STUDENT)).toBe(p1);
    expect(pseudonymOf(SECRET, ORG, OTHER_STUDENT)).not.toBe(p1);
    expect(pseudonymOf(SECRET, '01960000-0000-7000-8000-0000000000b1', STUDENT)).not.toBe(p1);
    expect(pseudonymOf('another-secret', ORG, STUDENT)).not.toBe(p1);

    // Through the gateway with the default (all-on) categories: the provider receives the pseudonym and no name, id,
    // external id, contact, note, or remark.
    fake.guardians = [{ guardian_user_id: '01960000-0000-7000-8000-0000000000e1' }];
    fake.users = [{ email: GUARDIAN_EMAIL, display_name: 'Guardian Unitname', login_id: 'guardian-unit' }];
    const res = await gateway(fake, stub).recommend(actor('TEACHER'), STUDENT, REQUEST);
    expect(res.label).toBe('AI_SUGGESTION_REVIEW_REQUIRED');
    const sent = stub.lastPayload!;
    expect(sent.subject).toBe(p1);
    const text = JSON.stringify(sent);
    for (const forbidden of [SYNTHETIC_NAME, 'Zaid', 'Testname', STUDENT, EXTERNAL_ID, GUARDIAN_EMAIL, 'Guardian Unitname', 'guardian-unit', SYNTHETIC_NOTE, 'SYNTHETIC-PRIVATE-NOTE', SYNTHETIC_REMARK]) {
      expect(text).not.toContain(forbidden);
    }
    expect(text).not.toMatch(/@/);
    // The prompt carries the payload only.
    expect(stub.lastPrompt!.user).not.toContain(SYNTHETIC_NAME);
    expect(stub.lastPrompt!.system).not.toContain(SYNTHETIC_NAME);

    // The scanner's term list holds the name, its parts, the id, the note and remark bodies, and the contact strings.
    const terms = forbiddenTerms(inputFor(), [EXTERNAL_ID, GUARDIAN_EMAIL]);
    expect(terms).toEqual(expect.arrayContaining([SYNTHETIC_NAME, 'Zaid', 'Testname', STUDENT, SYNTHETIC_NOTE, SYNTHETIC_REMARK, EXTERNAL_ID, GUARDIAN_EMAIL]));
    expect(payloadTextScan(sent, terms)).toEqual([]);

    // The scanner is the last line of defence: a leaked name, email, or phone is flagged (without echoing the text).
    const leaked = { ...sent, subject: 'Zaid' } as AiPayload;
    expect(payloadTextScan(leaked, terms)).toContain('Zaid');
    expect(payloadTextScan({ ...sent, locale: GUARDIAN_EMAIL } as unknown as AiPayload, [])).toEqual(['[EMAIL]']);
    expect(payloadTextScan({ ...sent, locale: '+92 300 1234567' } as unknown as AiPayload, [])).toEqual(['[PHONE]']);
    expect(payloadTextScan({ ...sent, locale: '۰۳۰۰۱۲۳۴۵۶۷' } as unknown as AiPayload, [])).toEqual(['[PHONE]']);

    // A scan hit aborts before the provider call: "AI unavailable", nothing sent, nothing stored.
    const blocked = new RecordingDb();
    blocked.settings = settingsRow();
    blocked.studentRow = { external_student_id: EXTERNAL_ID, private_notes: 'MANZIL' }; // a "note" equal to a payload word
    const blockedStub = new StubProvider();
    expect(await codeOf(gateway(blocked, blockedStub).recommend(actor('TEACHER'), STUDENT, REQUEST))).toBe('AI_UNAVAILABLE');
    expect(blockedStub.calls).toBe(0);
    expect(blocked.writtenTables()).toEqual(['ai_usage_monthly']); // only the usage-row lock upsert (rolled back)
  });

  it('F15-AC14 (US-065) a data category turned off by the Admin is absent from the payload', async () => {
    // Pure minimizer: each category off removes exactly its key.
    const analytics = buildAnalytics(inputFor());
    const keyOf: Record<AiDataCategory, keyof AiPayload> = { ATTENDANCE: 'attendance', PROGRESS: 'progress', MISTAKES: 'mistakes', QUALITY: 'quality', HOMEWORK: 'homework' };
    for (const off of Object.keys(keyOf) as AiDataCategory[]) {
      const p = minimizeForAi(analytics, { categories: { ...ALL_ON, [off]: false }, pseudonym: 'S-ABCDEFGH', locale: 'en' });
      expect(p).not.toHaveProperty(keyOf[off]);
      expect(p.categories).not.toContain(off);
      for (const on of (Object.keys(keyOf) as AiDataCategory[]).filter((c) => c !== off)) expect(p).toHaveProperty(keyOf[on]);
    }

    // Through the gateway: the Admin's settings row turns attendance off; the payload the provider receives has no
    // attendance fields at all.
    fake.settings = settingsRow({ share_attendance: false });
    await gateway(fake, stub).recommend(actor('TEACHER'), STUDENT, REQUEST);
    const sent = stub.lastPayload!;
    expect(sent).not.toHaveProperty('attendance');
    expect(sent.categories).toEqual(['PROGRESS', 'MISTAKES', 'QUALITY', 'HOMEWORK']);
    expect(JSON.stringify(sent)).not.toMatch(/"(attended|absent|leave|present|late|halfDay)"/);
  });

  it('F15-AC15 (US-065) the stored usage record holds the minimized payload and an input hash only', async () => {
    await gateway(fake, stub).recommend(actor('TEACHER'), STUDENT, REQUEST);
    const row = fake.aiRequestRow()!;
    const sent = stub.lastPayload!;
    // The stored payload is exactly what the provider received.
    expect(JSON.parse(String(row.payload))).toEqual(sent);
    // The hash is SHA-256 of the canonical JSON (keys sorted), so it does not depend on key order.
    expect(row.input_hash).toBe(createHash('sha256').update(canonicalJson(sent)).digest('hex'));
    expect(row.input_hash).toBe(inputHashOf(sent));
    expect(canonicalJson({ b: 1, a: { d: 2, c: [3, { f: 4, e: 5 }] } })).toBe('{"a":{"c":[3,{"e":5,"f":4}],"d":2},"b":1}');
    // No raw student record: no name, id, note, remark, record or portion id anywhere in the stored row.
    const stored = JSON.stringify(row);
    for (const raw of [SYNTHETIC_NAME, STUDENT, SYNTHETIC_NOTE, SYNTHETIC_REMARK, EXTERNAL_ID]) expect(stored).not.toContain(raw);
    for (const r of (source.input as ReportInput).records) {
      expect(stored).not.toContain(r.id);
      for (const p of r.portions) expect(stored).not.toContain(p.id);
    }
    // The only columns are the trail's: who/when/which provider, the minimized payload, its hash, the checked output,
    // the outcome, and the usage numbers.
    expect(Object.keys(row).sort()).toEqual(
      ['cost_micro_usd', 'created_at', 'id', 'input_hash', 'input_tokens', 'latency_ms', 'locale', 'organization_id', 'outcome', 'output', 'output_tokens', 'payload', 'period_from', 'period_to', 'provider', 'provider_attempts', 'requested_by'].sort(),
    );
    expect(row.outcome).toBe('OK');
  });
});

// ---------- Response validator ----------

describe('F15 · response validator', () => {
  it('F15-AC7 (US-063) a response that fails the schema is discarded', async () => {
    const payload = minimizeForAi(buildAnalytics(inputFor()), { categories: ALL_ON, pseudonym: 'S-ABCDEFGH', locale: 'en' });
    const period = { from: payload.period.from, to: payload.period.to };
    const good = { observations: [`Work was recorded on ${String(payload.recordedDays)} days.`], suggestions: ['Revise.'], data_insufficient: false, period, cited_metrics: [{ key: 'recordedDays', value: payload.recordedDays }] };
    expect(AiOutput.safeParse(good).success).toBe(true);
    expect(checkAiOutput(good, payload, period, 'en')).toEqual({ ok: true });
    // Shape failures: wrong types, a missing field, an extra key, an over-long text, a bad period.
    const bad: unknown[] = [
      { ...good, observations: 'not a list' },
      { ...good, extra: true },
      { observations: good.observations, suggestions: [], period, cited_metrics: [] },
      { ...good, observations: ['x'.repeat(501)] },
      { ...good, period: { from: '30/11/2026', to: period.to } },
      { ...good, cited_metrics: [{ key: 'recordedDays', value: '6' }] },
      { ...good, cited_metrics: [{ key: 'recordedDays', value: payload.recordedDays, why: 'extra' }] },
      null,
      'free text',
    ];
    for (const b of bad) expect(AiOutput.safeParse(b).success, JSON.stringify(b)).toBe(false);
    // A period that is well-formed but not the requested one is discarded by the checks.
    expect(checkAiOutput({ ...good, period: { from: period.from, to: '2026-11-29' } }, payload, period, 'en').ok).toBe(false);

    // Through the gateway: the provider's invalid answer is discarded, nothing of it is returned or stored.
    stub.mode = 'invalid-schema';
    expect(await codeOf(gateway(fake, stub).recommend(actor('TEACHER'), STUDENT, REQUEST))).toBe('AI_UNAVAILABLE');
    expect(stub.calls).toBe(1);
    expect(fake.aiRequestRow()).toMatchObject({ outcome: 'INVALID_OUTPUT', output: null });
  });

  it('F15-AC7 (US-063) a response citing a number not in the sent metrics is discarded', async () => {
    const payload = minimizeForAi(buildAnalytics(inputFor()), { categories: ALL_ON, pseudonym: 'S-ABCDEFGH', locale: 'en' });
    const period = { from: payload.period.from, to: payload.period.to };
    const base = { suggestions: [], data_insufficient: false, period };
    const days = payload.recordedDays;
    // A cited number that is in the payload passes.
    expect(checkAiOutput({ ...base, observations: [`Recorded on ${String(days)} days.`], cited_metrics: [{ key: 'recordedDays', value: days }] }, payload, period, 'en').ok).toBe(true);
    // A number in an observation that is not a cited metric value.
    expect(checkAiOutput({ ...base, observations: ['There were 987654 mistakes.'], cited_metrics: [{ key: 'recordedDays', value: days }] }, payload, period, 'en').ok).toBe(false);
    // "Quality improved from 3 to 2" with no such metric sent (feature edge case).
    expect(checkAiOutput({ ...base, observations: ['Quality improved from 3 to 2.'], cited_metrics: [] }, payload, period, 'en').ok).toBe(false);
    // A cited key that was never sent, or a cited value that differs from the value sent.
    expect(checkAiOutput({ ...base, observations: [`Recorded on ${String(days)} days.`], cited_metrics: [{ key: 'invented.metric', value: days }] }, payload, period, 'en').ok).toBe(false);
    expect(checkAiOutput({ ...base, observations: [`Recorded on ${String(days + 1)} days.`], cited_metrics: [{ key: 'recordedDays', value: days + 1 }] }, payload, period, 'en').ok).toBe(false);

    // Through the gateway: the 'uncited-number' answer is discarded and its text never returned.
    stub.mode = 'uncited-number';
    expect(await codeOf(gateway(fake, stub).recommend(actor('TEACHER'), STUDENT, REQUEST))).toBe('AI_UNAVAILABLE');
    const row = fake.aiRequestRow()!;
    expect(row).toMatchObject({ outcome: 'INVALID_OUTPUT', output: null });
    expect(JSON.stringify(row)).not.toContain('987654');
  });
});

// ---------- Limits and access ----------

describe('F15 · limits and access', () => {
  it('F15-AC12 (US-064) at the usage limit, the request is refused and no provider call is made', async () => {
    // Monthly request cap reached.
    fake.settings = settingsRow({ monthly_request_cap: 3 });
    fake.usage = { requests: 3, cost_micro_usd: '3000' };
    expect(await codeOf(gateway(fake, stub).recommend(actor('TEACHER'), STUDENT, REQUEST))).toBe('AI_LIMIT_REACHED');
    expect(stub.calls).toBe(0);
    expect(fake.aiRequestRow()).toBeNull();

    // Monthly money cap reached (F15-AC18): the default USD 10, then a lower Admin cap.
    for (const [budget, spent] of [['10000000', '10000000'], ['2000', '2000'], ['2000', '2500']] as const) {
      const f = new RecordingDb();
      f.settings = settingsRow({ monthly_budget_micro_usd: budget });
      f.usage = { requests: 2, cost_micro_usd: spent };
      const s = new StubProvider();
      expect(await codeOf(gateway(f, s).recommend(actor('TEACHER'), STUDENT, REQUEST))).toBe('AI_LIMIT_REACHED');
      expect(s.calls).toBe(0);
    }

    // The per-Teacher daily cap.
    const daily = new RecordingDb();
    daily.settings = settingsRow({ teacher_daily_cap: 2 });
    daily.todayCount = 2;
    const dailyStub = new StubProvider();
    expect(await codeOf(gateway(daily, dailyStub).recommend(actor('TEACHER'), STUDENT, REQUEST))).toBe('AI_LIMIT_REACHED');
    expect(dailyStub.calls).toBe(0);

    // One below every cap: the provider is called once.
    const under = new RecordingDb();
    under.settings = settingsRow({ monthly_request_cap: 3, teacher_daily_cap: 2, monthly_budget_micro_usd: '2000' });
    under.usage = { requests: 2, cost_micro_usd: '1999' };
    under.todayCount = 1;
    const underStub = new StubProvider();
    expect(await codeOf(gateway(under, underStub).recommend(actor('TEACHER'), STUDENT, REQUEST))).toBe('OK');
    expect(underStub.calls).toBe(1);

    // The button state says so too (no provider call).
    const state = await gateway(fake, stub).analytics(actor('TEACHER'), STUDENT, { kind: 'MONTH', date: '2026-11-04' });
    expect(state.ai.state).toBe('LIMIT_REACHED');
    expect(stub.calls).toBe(0);
  });

  it('F15-AC11 (US-064) AI turned off refuses requests', async () => {
    for (const settings of [settingsRow({ enabled: false }), null]) {
      const f = new RecordingDb();
      f.settings = settings; // null = no settings row yet: the defaults, AI off
      const s = new StubProvider();
      const g = gateway(f, s);
      expect(await codeOf(g.recommend(actor('TEACHER'), STUDENT, REQUEST))).toBe('AI_DISABLED');
      expect(await codeOf(g.recommend(actor('ADMIN'), STUDENT, REQUEST))).toBe('AI_DISABLED');
      expect(s.calls).toBe(0);
      expect(f.writtenTables()).toEqual([]);
      // The calculated analytics still answer, with the AI button hidden.
      const view = await g.analytics(actor('TEACHER'), STUDENT, { kind: 'MONTH', date: '2026-11-04' });
      expect(view.ai.state).toBe('DISABLED');
      expect(view.analytics.recordedDays).toBeGreaterThan(0);
    }
    // A provider that is not set up is refused the same way (no call).
    stub.ready = false;
    expect(await codeOf(gateway(fake, stub).recommend(actor('TEACHER'), STUDENT, REQUEST))).toBe('AI_NOT_CONFIGURED');
    expect(stub.calls).toBe(0);
  });

  it('F15-AC9 (US-063) Student and Parent are refused', async () => {
    const g = gateway(fake, stub);
    for (const role of ['STUDENT', 'PARENT'] as const) {
      expect(await codeOf(g.recommend(actor(role), STUDENT, REQUEST))).toBe('FORBIDDEN');
      expect(await codeOf(g.analytics(actor(role), STUDENT, { kind: 'MONTH' }))).toBe('FORBIDDEN');
      expect(await codeOf(g.getSettings(actor(role)))).toBe('FORBIDDEN');
      expect(await codeOf(g.updateSettings(actor(role), { enabled: false }))).toBe('FORBIDDEN');
    }
    // Refused before any database read or provider call.
    expect(fake.statements).toEqual([]);
    expect(stub.calls).toBe(0);
    // A Teacher reaches AI for assigned students but never the settings; out of reach is "not found".
    expect(await codeOf(g.getSettings(actor('TEACHER')))).toBe('FORBIDDEN');
    expect(await codeOf(g.recommend(actor('TEACHER'), OTHER_STUDENT, REQUEST))).toBe('NOT_FOUND');
    expect(stub.calls).toBe(0);
  });

  it('F15-AC8 (US-063) handling a response never writes records, attempts, scores, or homework (AC-AI-03)', async () => {
    const outcomes: Record<StubMode, string> = {
      ok: 'OK',
      timeout: 'AI_UNAVAILABLE',
      error: 'AI_UNAVAILABLE',
      'invalid-schema': 'AI_UNAVAILABLE',
      'uncited-number': 'AI_UNAVAILABLE',
      'wrong-language': 'AI_UNAVAILABLE',
      'wrong-language-once': 'OK',
      insufficient: 'OK',
    };
    for (const mode of STUB_MODES) {
      const f = new RecordingDb();
      f.settings = settingsRow();
      const s = new StubProvider();
      s.mode = mode;
      expect(await codeOf(gateway(f, s).recommend(actor('TEACHER'), STUDENT, REQUEST)), mode).toBe(outcomes[mode]);
      // Every write is to the AI trail or the usage counter; never a record, attempt, mistake, quality score,
      // attendance, homework, or report cache row.
      expect(new Set(f.writtenTables()), mode).toEqual(new Set(['ai_usage_monthly', 'ai_requests']));
      expect(f.statements.some((st) => /daily_records|lesson_portions|portion_attempts|attempt_mistakes|attendance_records|homework_|report_cache|report_stamps/i.test(st.sql) && WRITE.test(st.sql)), mode).toBe(false);
    }
    // Reading analytics writes nothing at all.
    const read = new RecordingDb();
    read.settings = settingsRow();
    await gateway(read, new StubProvider()).analytics(actor('TEACHER'), STUDENT, { kind: 'MONTH', date: '2026-11-04' });
    expect(read.writtenTables()).toEqual([]);
  });
});

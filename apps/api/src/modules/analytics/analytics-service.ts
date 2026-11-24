// F15 · Analytics and the AI gateway (FR-AI-001…014, NFR-AI-001…004, NFR-OFF-008; US-062…065; ARCHITECTURE.md §9.4,
// §12). Contract: packages/contracts/src/analytics.ts.
//
// - Analytics are deterministic: the period's source rows (reporting/sources.ts, read-only) go through
//   @hifz/domain/analytics buildAnalytics. No cache is written here.
// - Staff only. A Student or Parent gets 403 on every route (F15-AC9); a Teacher reaches assigned classes or every class
//   with the "all classes" flag, anything else is 404 like a missing id. AI settings are Owner/Admin only.
// - The AI pipeline runs in this order: role → enabled (AI_DISABLED) → provider registered and configured
//   (AI_NOT_CONFIGURED) → student in reach (404) → usage row locked, caps checked before any provider call
//   (AI_LIMIT_REACHED) → buildAnalytics → minimizeForAi (Admin categories, HMAC pseudonym) → PII scan → provider call
//   with timeout (one retry on a wrong-language answer) → AiOutput schema + checkAiOutput → ai_requests row and usage
//   increment in the same transaction → response labelled "AI suggestion — review required".
// - Writes: org_ai_settings (PUT, audited), ai_requests, ai_usage_monthly. Nothing else (F15-AC8, AC-AI-03).
// - Never logged: the payload, the prompt, the output, names, notes, or keys. Only outcome codes and counts.
//
// Concurrency (caps): the madrasa's usage row for the month is upserted and locked FOR UPDATE before the caps are
// checked, and the lock is held until the ai_requests row and the usage increment commit. Concurrent requests of one
// madrasa therefore run one at a time, and each sees the counts of every request before it, so no cap can be passed.
// A waiting request gives up after its lock timeout with AI_UNAVAILABLE ("try again later").
import { createHash, createHmac } from 'node:crypto';
import {
  AiOutput,
  AiRecommendationRequest,
  AnalyticsQuery,
  DEFAULT_AI_SETTINGS,
  UpdateAiSettingsRequest,
  type AiRecommendationResponse,
  type AiSettings,
  type AiSettingsResponse,
  type AiState,
  type StudentAnalyticsResponse,
  type StudentAnalyticsView,
} from '@hifz/contracts';
import {
  buildAnalytics,
  checkCitedNumbers,
  checkInsufficient,
  checkLanguage,
  checkPeriod,
  metricsUsed,
  minimizeForAi,
  payloadTextScan,
  type AiCheck,
  type AiLocale,
  type AiPayload,
  type StudentAnalytics,
} from '@hifz/domain/analytics';
import { zonedInstant, type ReportInput } from '@hifz/domain/reports';
import { calendarDateIn } from '@hifz/domain/roster';
import { sql } from 'kysely';
import { v7 as uuidv7 } from 'uuid';
import { z } from 'zod';
import type { Clock } from '../../platform/clock.ts';
import type { AiRequestOutcomeColumn, Db, Tx } from '../../platform/db.ts';
import { AppError, fieldError, issueFields, parse } from '../../platform/errors.ts';
import { withTenant } from '../../platform/tenant.ts';
import { recordAudit } from '../audit/audit.ts';
import type { HomeworkService } from '../homework/homework-service.ts';
import type { Actor } from '../identity/auth-service.ts';
import type { ReportService } from '../reporting/report-service.ts';
import { loadReportInputs } from '../reporting/sources.ts';
import { requireRole } from '../roster/shared.ts';
import { buildAiPrompt, type AiPrompt } from './prompt.ts';
import type { AiProvider, AiUsage, ProviderRegistry } from './providers.ts';

// Compile-time guard: the domain analytics are the contract view. A drift fails the typecheck here.
const asView = (a: StudentAnalytics): StudentAnalyticsView => a;
void asView;

/** The JSON schema handed to the provider (the same strict AiOutput the answer is validated against). */
export const AI_OUTPUT_JSON_SCHEMA: Record<string, unknown> = z.toJSONSchema(AiOutput) as Record<string, unknown>;

/** Mutable runtime knobs (the test-control API may shorten the timeout). */
export interface AiRuntime {
  pseudonymSecret: string;
  /** DEFERRED: DEC-B45 starting default (20 s, from config AI_TIMEOUT_MS). */
  timeoutMs: number;
  /** Test builds only: overrides `timeoutMs` (StubProvider.timeoutMs). */
  timeoutOverride?: () => number | null;
}

export interface AnalyticsDeps {
  db: Db;
  clock: Clock;
  reports: ReportService;
  homework: HomeworkService;
  providers: ProviderRegistry;
  runtime: AiRuntime;
  log: { warn: (obj: object, msg: string) => void };
}

/** Upper bound on how long a request waits for another request of its madrasa holding the usage lock. */
const lockWaitMs = (timeoutMs: number) => 2 * timeoutMs + 10_000;

const CATEGORY_COLUMNS = {
  ATTENDANCE: 'share_attendance',
  PROGRESS: 'share_progress',
  MISTAKES: 'share_mistakes',
  QUALITY: 'share_quality',
  HOMEWORK: 'share_homework',
} as const;

/** Canonical JSON (object keys sorted), for the input hash. */
export function canonicalJson(value: unknown): string {
  const norm = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(norm);
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.keys(v as Record<string, unknown>)
          .sort()
          .map((k) => [k, norm((v as Record<string, unknown>)[k])]),
      );
    }
    return v;
  };
  return JSON.stringify(norm(value));
}

export const inputHashOf = (payload: AiPayload): string => createHash('sha256').update(canonicalJson(payload)).digest('hex');

/**
 * The student's pseudonym for AI requests: "S-" and 8 capital letters from an HMAC of the madrasa and student ids under
 * a server secret. Stable per student, never reversible without the secret, and never a digit run (the PII scanner
 * flags long digit runs as phone numbers).
 */
export function pseudonymOf(secret: string, organizationId: string, studentId: string): string {
  const mac = createHmac('sha256', secret).update(`${organizationId}:${studentId}`).digest();
  let letters = '';
  for (let i = 0; i < 8; i += 1) letters += String.fromCharCode(65 + (mac[i]! % 26));
  return `S-${letters}`;
}

/** The strings that must never appear in a payload: names, ids, contacts, and the period's note and remark texts. */
export function forbiddenTerms(input: ReportInput, extra: readonly (string | null)[]): string[] {
  const terms = new Set<string>();
  const add = (s: string | null | undefined) => {
    const t = s?.trim();
    // Very short or purely numeric strings are skipped: payload numbers are typed metrics, and phones are caught by
    // the scanner's own digit-run rule.
    if (t && t.length >= 3 && !/^\d+$/.test(t)) terms.add(t);
  };
  add(input.student.name);
  for (const part of input.student.name.split(/\s+/)) add(part);
  add(input.student.id);
  for (const s of extra) add(s);
  for (const r of input.records) {
    for (const p of r.portions) {
      for (const a of p.attempts) {
        add(a.remarks);
        for (const m of a.mistakes) add(m.note);
      }
    }
  }
  return [...terms];
}

type CallResult = { kind: 'OK'; output: unknown; usage: AiUsage } | { kind: 'TIMEOUT' } | { kind: 'ERROR' };

async function callWithTimeout(provider: AiProvider, payload: AiPayload, prompt: AiPrompt, timeoutMs: number): Promise<CallResult> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<CallResult>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ kind: 'TIMEOUT' });
    }, timeoutMs);
  });
  const call = provider
    .recommend(payload, AI_OUTPUT_JSON_SCHEMA, { locale: prompt.locale, timeoutMs, signal: controller.signal, prompt })
    .then((r): CallResult => ({ kind: 'OK', output: r.output, usage: r.usage }))
    .catch((): CallResult => (controller.signal.aborted ? { kind: 'TIMEOUT' } : { kind: 'ERROR' }));
  try {
    return await Promise.race([call, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

interface Outcome {
  outcome: AiRequestOutcomeColumn;
  output: AiOutput | null;
  attempts: number;
  inputTokens: number | null;
  outputTokens: number | null;
  costMicroUsd: number;
  latencyMs: number;
}

const firstFailure = (...checks: AiCheck[]): AiCheck => checks.find((c) => !c.ok) ?? { ok: true };

export class AnalyticsService {
  private readonly d: AnalyticsDeps;

  constructor(deps: AnalyticsDeps) {
    this.d = deps;
  }

  // ---------- GET /analytics/:studentId (F15-AC1, AC2 server side) ----------

  async analytics(actor: Actor, studentId: string, query: unknown): Promise<StudentAnalyticsResponse> {
    requireRole(actor, 'ai.recommendations.view');
    const q = parse(AnalyticsQuery, query);
    const org = actor.organizationId;
    return withTenant(this.d.db, org, async (tx) => {
      const { analytics, today, timeZone } = await this.analyticsOf(tx, actor, studentId, q.kind, q.date);
      const state = await this.aiState(tx, actor, today, timeZone);
      return { analytics: analytics as StudentAnalyticsView, ai: { state } };
    });
  }

  // ---------- POST /analytics/:studentId/ai-recommendation (F15-AC4…AC8, AC12…AC17) ----------

  async recommend(actor: Actor, studentId: string, body: unknown): Promise<AiRecommendationResponse> {
    requireRole(actor, 'ai.recommendations.view');
    const req = parse(AiRecommendationRequest, body);
    const org = actor.organizationId;
    // Pre-check (read-only): AI on, provider ready, student in reach; and the student's identity and contact strings for
    // the PII scan. Account emails are not readable by the tenant role, so they are read on the root connection, by
    // madrasa and id, before the main transaction takes its connection.
    const contactIds = await withTenant(this.d.db, org, async (tx) => {
      this.readyProvider(await this.settingsOf(tx, org));
      const student = await this.d.reports.studentInReach(tx, org, studentId, await this.d.reports.reachOf(tx, actor));
      return this.contactIds(tx, org, student.id);
    });
    const contacts = await this.contactTerms(org, contactIds);

    const result = await withTenant(this.d.db, org, async (tx) => {
      // Re-checked in the transaction that calls the provider (the settings may have changed meanwhile).
      const settings = await this.settingsOf(tx, org);
      const provider = this.readyProvider(settings);
      const reach = await this.d.reports.reachOf(tx, actor);
      const student = await this.d.reports.studentInReach(tx, org, studentId, reach);
      const { settings: orgSettings, today, period } = await this.d.reports.periodIn(tx, org, req.kind, req.date);

      // Caps, under the madrasa's usage-row lock (held until commit).
      const timeoutMs = this.d.runtime.timeoutOverride?.() ?? this.d.runtime.timeoutMs;
      const month = `${today.slice(0, 7)}-01`;
      await sql.raw(`SET LOCAL lock_timeout = '${String(lockWaitMs(timeoutMs))}ms'`).execute(tx);
      const usage = await this.lockUsage(tx, org, month);
      if (await this.capReached(tx, actor.organizationId, actor.userId, settings, usage, today, orgSettings.timeZone)) throw new AppError('AI_LIMIT_REACHED');

      // Deterministic metrics → minimized, pseudonymous payload.
      const inputs = await loadReportInputs(tx, { homework: this.d.homework }, org, [student], period, today, reach);
      const input = inputs.get(student.id)!;
      const analytics = buildAnalytics(input);
      const payload = minimizeForAi(analytics, {
        categories: settings.categories,
        pseudonym: pseudonymOf(this.d.runtime.pseudonymSecret, org, student.id),
        locale: req.locale,
      });

      // Last line of defence: names, ids, contacts, and note texts must not be in the payload.
      const hits = payloadTextScan(payload, forbiddenTerms(input, contacts));
      if (hits.length > 0) {
        this.d.log.warn({ reason: 'AI_PAYLOAD_PII_SCAN', hits: hits.length }, 'AI request aborted before the provider call');
        throw new AppError('AI_UNAVAILABLE');
      }

      const outcome = await this.run(provider, payload, req.locale, { from: period.from, to: period.to }, timeoutMs);
      const requestId = uuidv7();
      const now = this.d.clock.now();
      await tx
        .insertInto('ai_requests')
        .values({
          id: requestId,
          organization_id: org,
          requested_by: actor.userId,
          provider: provider.id,
          locale: req.locale,
          period_from: period.from,
          period_to: period.to,
          payload: JSON.stringify(payload),
          input_hash: inputHashOf(payload),
          output: outcome.output ? JSON.stringify(outcome.output) : null,
          outcome: outcome.outcome,
          provider_attempts: outcome.attempts,
          input_tokens: outcome.inputTokens,
          output_tokens: outcome.outputTokens,
          cost_micro_usd: outcome.costMicroUsd,
          latency_ms: outcome.latencyMs,
          created_at: now,
        })
        .execute();
      await tx
        .insertInto('ai_usage_monthly')
        .values({ organization_id: org, month, requests: 1, cost_micro_usd: outcome.costMicroUsd })
        .onConflict((oc) =>
          oc.columns(['organization_id', 'month']).doUpdateSet({
            requests: sql`ai_usage_monthly.requests + 1`,
            cost_micro_usd: sql`ai_usage_monthly.cost_micro_usd + ${outcome.costMicroUsd}::bigint`,
          }),
        )
        .execute();
      if (outcome.outcome !== 'OK') this.d.log.warn({ reason: 'AI_OUTCOME', outcome: outcome.outcome, attempts: outcome.attempts }, 'AI answer not shown');
      return { requestId, outcome, period };
    });

    const { requestId, outcome, period } = result;
    if (outcome.outcome !== 'OK' || !outcome.output) throw new AppError('AI_UNAVAILABLE');
    return {
      requestId,
      label: 'AI_SUGGESTION_REVIEW_REQUIRED',
      period: { kind: period.kind, from: period.from, to: period.to },
      locale: req.locale,
      metricsUsed: metricsUsed(outcome.output),
      output: outcome.output,
    };
  }

  // ---------- GET / PUT /analytics/ai-settings (F15-AC10, AC16; Owner/Admin) ----------

  async getSettings(actor: Actor): Promise<AiSettingsResponse> {
    requireRole(actor, 'organization.settings.update');
    return withTenant(this.d.db, actor.organizationId, (tx) => this.settingsResponse(tx, actor.organizationId));
  }

  async updateSettings(actor: Actor, body: unknown): Promise<AiSettingsResponse> {
    requireRole(actor, 'organization.settings.update');
    const parsed = UpdateAiSettingsRequest.safeParse(body ?? {});
    if (!parsed.success) {
      // AI cannot be on without a provider (0018 CHECK): reported as provider: PROVIDER_REQUIRED.
      const fields = issueFields(parsed.error);
      for (const issue of parsed.error.issues) if (issue.message === 'PROVIDER_REQUIRED') fields[issue.path.join('.')] = 'PROVIDER_REQUIRED';
      throw new AppError('VALIDATION', fields);
    }
    const next = parsed.data;
    if (next.provider !== null && !this.d.providers.get(next.provider)) throw fieldError('provider', 'UNKNOWN_PROVIDER');
    const org = actor.organizationId;
    return withTenant(this.d.db, org, async (tx) => {
      const before = await this.settingsOf(tx, org, true);
      const changes = settingChanges(before, next);
      const now = this.d.clock.now();
      const row = {
        enabled: next.enabled,
        provider: next.provider,
        monthly_request_cap: next.monthlyRequestCap,
        teacher_daily_cap: next.teacherDailyCap,
        monthly_budget_micro_usd: next.monthlyBudgetMicroUsd,
        share_attendance: next.categories.ATTENDANCE,
        share_progress: next.categories.PROGRESS,
        share_mistakes: next.categories.MISTAKES,
        share_quality: next.categories.QUALITY,
        share_homework: next.categories.HOMEWORK,
        updated_by: actor.userId,
        updated_at: now,
      };
      await tx
        .insertInto('org_ai_settings')
        .values({ organization_id: org, ...row })
        .onConflict((oc) => oc.column('organization_id').doUpdateSet(row))
        .execute();
      if (changes.length > 0) {
        await recordAudit(tx, {
          organizationId: org,
          actorUserId: actor.userId,
          action: 'AI_SETTINGS_UPDATED',
          targetType: 'ORGANIZATION',
          targetId: org,
          summary: { fields: changes.map((c) => c.field), changes },
          at: now,
        });
      }
      return this.settingsResponse(tx, org);
    });
  }

  // ---------- Internals ----------

  private async analyticsOf(tx: Tx, actor: Actor, studentId: string, kind: 'WEEK' | 'MONTH', date: string | undefined): Promise<{ analytics: StudentAnalytics; today: string; timeZone: string }> {
    const org = actor.organizationId;
    const reach = await this.d.reports.reachOf(tx, actor);
    const student = await this.d.reports.studentInReach(tx, org, studentId, reach);
    const { settings, today, period } = await this.d.reports.periodIn(tx, org, kind, date);
    const inputs = await loadReportInputs(tx, { homework: this.d.homework }, org, [student], period, today, reach);
    return { analytics: buildAnalytics(inputs.get(student.id)!), today, timeZone: settings.timeZone };
  }

  /** What the AI button shows (no lock: advisory; the POST re-checks under the lock). */
  private async aiState(tx: Tx, actor: Actor, today: string, timeZone: string): Promise<AiState> {
    const settings = await this.settingsOf(tx, actor.organizationId);
    if (!settings.enabled) return 'DISABLED';
    const provider = this.d.providers.get(settings.provider);
    if (!provider || !provider.configured()) return 'NOT_CONFIGURED';
    const usage = await this.usageOf(tx, actor.organizationId, `${today.slice(0, 7)}-01`);
    return (await this.capReached(tx, actor.organizationId, actor.userId, settings, usage, today, timeZone)) ? 'LIMIT_REACHED' : 'READY';
  }

  /** The madrasa's settings; no row means the defaults (0018). `forUpdate` locks an existing row. */
  private async settingsOf(tx: Tx, org: string, forUpdate = false): Promise<AiSettings> {
    let query = tx.selectFrom('org_ai_settings').selectAll().where('organization_id', '=', org);
    if (forUpdate) query = query.forUpdate();
    const r = await query.executeTakeFirst();
    if (!r) return { ...DEFAULT_AI_SETTINGS, categories: { ...DEFAULT_AI_SETTINGS.categories } };
    return {
      enabled: r.enabled,
      provider: r.provider,
      monthlyRequestCap: r.monthly_request_cap,
      teacherDailyCap: r.teacher_daily_cap,
      monthlyBudgetMicroUsd: Number(r.monthly_budget_micro_usd),
      categories: Object.fromEntries(Object.entries(CATEGORY_COLUMNS).map(([cat, col]) => [cat, r[col]])) as AiSettings['categories'],
    };
  }

  private async usageOf(tx: Tx, org: string, month: string): Promise<{ requests: number; costMicroUsd: number }> {
    const r = await tx.selectFrom('ai_usage_monthly').select(['requests', 'cost_micro_usd']).where('organization_id', '=', org).where('month', '=', month).executeTakeFirst();
    return { requests: r?.requests ?? 0, costMicroUsd: Number(r?.cost_micro_usd ?? 0) };
  }

  /** Upserts the month's usage row and locks it until commit: concurrent AI requests of the madrasa queue here. */
  private async lockUsage(tx: Tx, org: string, month: string): Promise<{ requests: number; costMicroUsd: number }> {
    try {
      await tx.insertInto('ai_usage_monthly').values({ organization_id: org, month, requests: 0, cost_micro_usd: 0 }).onConflict((oc) => oc.columns(['organization_id', 'month']).doNothing()).execute();
      const r = await tx.selectFrom('ai_usage_monthly').select(['requests', 'cost_micro_usd']).where('organization_id', '=', org).where('month', '=', month).forUpdate().executeTakeFirstOrThrow();
      return { requests: r.requests, costMicroUsd: Number(r.cost_micro_usd) };
    } catch (error) {
      // 55P03 lock_not_available: another request of the madrasa held the lock too long.
      if ((error as { code?: unknown }).code === '55P03') throw new AppError('AI_UNAVAILABLE');
      throw error;
    }
  }

  /**
   * Monthly request cap, monthly money cap, and the per-user daily cap (the "per Teacher per day" limit; it applies to
   * whoever asks, Owner and Admin included). Every recorded provider call counts, whatever its outcome.
   */
  private async capReached(tx: Tx, orgOf: string, userId: string, settings: AiSettings, usage: { requests: number; costMicroUsd: number }, today: string, timeZone: string): Promise<boolean> {
    if (settings.monthlyRequestCap !== null && usage.requests >= settings.monthlyRequestCap) return true;
    if (usage.costMicroUsd >= settings.monthlyBudgetMicroUsd) return true;
    const dayStart = new Date(zonedInstant(today, { hour: 0, minute: 0 }, timeZone));
    const row = await tx
      .selectFrom('ai_requests')
      .select((eb) => eb.fn.countAll<string>().as('n'))
      .where('organization_id', '=', orgOf)
      .where('requested_by', '=', userId)
      .where('created_at', '>=', dayStart)
      .executeTakeFirstOrThrow();
    return Number(row.n) >= settings.teacherDailyCap;
  }

  /** Contact and identity strings of the student and their linked accounts, for the PII scan only. */
  private async contactIds(tx: Tx, org: string, studentId: string): Promise<{ strings: (string | null)[]; userIds: string[] }> {
    const student = await tx.selectFrom('students').select(['external_student_id', 'private_notes']).where('organization_id', '=', org).where('id', '=', studentId).executeTakeFirst();
    const accountIds = (await tx.selectFrom('student_accounts').select('user_id').where('organization_id', '=', org).where('student_id', '=', studentId).execute()).map((r) => r.user_id);
    const guardianIds = (await tx.selectFrom('student_guardians').select('guardian_user_id').where('organization_id', '=', org).where('student_id', '=', studentId).execute()).map((r) => r.guardian_user_id);
    return { strings: [student?.external_student_id ?? null, student?.private_notes ?? null], userIds: [...new Set([...accountIds, ...guardianIds])] };
  }

  /** The linked Student and Parent accounts' email, name, and User ID (root connection: users has no RLS). Scan only. */
  private async contactTerms(org: string, ids: { strings: (string | null)[]; userIds: string[] }): Promise<(string | null)[]> {
    const users = ids.userIds.length ? await this.d.db.selectFrom('users').select(['email', 'display_name', 'login_id']).where('organization_id', '=', org).where('id', 'in', ids.userIds).execute() : [];
    return [...ids.strings, ...users.flatMap((u) => [u.email, u.display_name, u.login_id])];
  }

  /** The madrasa's provider when AI is on and the provider is registered and configured. */
  private readyProvider(settings: AiSettings): AiProvider {
    if (!settings.enabled) throw new AppError('AI_DISABLED');
    const provider = this.d.providers.get(settings.provider);
    if (!provider || !provider.configured()) throw new AppError('AI_NOT_CONFIGURED');
    return provider;
  }

  /** The provider call with its checks and the single wrong-language retry. */
  private async run(provider: AiProvider, payload: AiPayload, locale: AiLocale, requested: { from: string; to: string }, timeoutMs: number): Promise<Outcome> {
    const started = Date.now();
    const total = { inputTokens: null as number | null, outputTokens: null as number | null, costMicroUsd: 0 };
    const finish = (outcome: AiRequestOutcomeColumn, attempts: number, output: AiOutput | null = null): Outcome => ({
      outcome,
      output,
      attempts,
      ...total,
      latencyMs: Date.now() - started,
    });
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const prompt = buildAiPrompt(payload, locale, { languageRestated: attempt > 1 });
      const call = await callWithTimeout(provider, payload, prompt, timeoutMs);
      if (call.kind === 'TIMEOUT') return finish('TIMEOUT', attempt);
      if (call.kind === 'ERROR') return finish('PROVIDER_ERROR', attempt);
      total.inputTokens = (total.inputTokens ?? 0) + Math.max(0, Math.trunc(call.usage.inputTokens));
      total.outputTokens = (total.outputTokens ?? 0) + Math.max(0, Math.trunc(call.usage.outputTokens));
      total.costMicroUsd += Math.max(0, Math.trunc(call.usage.costMicroUsd));
      const parsed = AiOutput.safeParse(call.output);
      if (!parsed.success) return finish('INVALID_OUTPUT', attempt);
      const output = parsed.data;
      if (!firstFailure(checkPeriod(output, requested), checkInsufficient(output, payload), checkCitedNumbers(output, payload)).ok) return finish('INVALID_OUTPUT', attempt);
      if (checkLanguage(output, locale).ok) return finish('OK', attempt, output);
      if (attempt === 2) return finish('WRONG_LANGUAGE', attempt);
    }
    return finish('WRONG_LANGUAGE', 2);
  }

  private async settingsResponse(tx: Tx, org: string): Promise<AiSettingsResponse> {
    const settings = await this.settingsOf(tx, org);
    const o = await tx.selectFrom('organizations').select('timezone').where('id', '=', org).executeTakeFirstOrThrow();
    const today = calendarDateIn(this.d.clock.now(), o.timezone);
    const month = today.slice(0, 7);
    const usage = await this.usageOf(tx, org, `${month}-01`);
    const provider = this.d.providers.get(settings.provider);
    return {
      ...settings,
      supportedProviders: this.d.providers.list(),
      providerConfigured: provider !== null && provider.configured(),
      usage: { month, requests: usage.requests, costMicroUsd: usage.costMicroUsd },
      neverShared: ['NAMES', 'CONTACTS', 'NOTES'],
    };
  }
}

/** Field-level changes for the audit (all non-sensitive values). */
function settingChanges(before: AiSettings, after: AiSettings): { field: string; from: unknown; to: unknown }[] {
  const flat = (s: AiSettings): Record<string, unknown> => ({
    enabled: s.enabled,
    provider: s.provider,
    monthlyRequestCap: s.monthlyRequestCap,
    teacherDailyCap: s.teacherDailyCap,
    monthlyBudgetMicroUsd: s.monthlyBudgetMicroUsd,
    shareAttendance: s.categories.ATTENDANCE,
    shareProgress: s.categories.PROGRESS,
    shareMistakes: s.categories.MISTAKES,
    shareQuality: s.categories.QUALITY,
    shareHomework: s.categories.HOMEWORK,
  });
  const a = flat(before);
  const b = flat(after);
  return Object.keys(b)
    .filter((k) => a[k] !== b[k])
    .map((k) => ({ field: k, from: a[k], to: b[k] }));
}

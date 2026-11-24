// F15 · Analytics and AI contracts (docs/specs/15-f15-analytics-ai.md). Synthetic data only.
import * as domain from '@hifz/domain/analytics';
import { syntheticInput } from '@hifz/domain/analytics/synthetic-fixture';
import { describe, expect, it } from 'vitest';
import {
  AI_DATA_CATEGORIES,
  AI_ERROR_CODES,
  AI_LOCALES,
  AiOutput,
  AiRecommendationRequest,
  AiRecommendationResponse,
  AiSettingsResponse,
  AnalyticsQuery,
  DEFAULT_AI_SETTINGS,
  StudentAnalyticsResponse,
  StudentAnalyticsSchema,
  UpdateAiSettingsRequest,
} from './analytics.ts';

const validOutput = {
  observations: ['Tajweed mistakes appeared 6 times.'],
  suggestions: ['Revise Paras 10 to 12.'],
  data_insufficient: false,
  period: { from: '2026-11-01', to: '2026-11-30' },
  cited_metrics: [{ key: 'mistakes.totals.byCategory.TAJWEED', value: 6 }],
};

describe('F15 · analytics contract', () => {
  it('F15-AC1 (US-062) the analytics schema accepts what buildAnalytics produces, online and provisional', () => {
    const online = domain.buildAnalytics(syntheticInput());
    expect(StudentAnalyticsSchema.parse(online)).toEqual(online);
    const offline = domain.buildAnalytics({ ...syntheticInput(), sync: { offline: true, pendingChanges: 3, lastSyncedAt: null } });
    expect(StudentAnalyticsResponse.parse({ analytics: offline, ai: { state: 'READY' } }).analytics.provisional).toEqual({ pendingChanges: 3, lastSyncedAt: null, offline: true });
    expect(StudentAnalyticsResponse.safeParse({ analytics: online, ai: { state: 'MAYBE' } }).success).toBe(false);
  });

  it('F15-AC3 (US-062) a quality point of 0 is refused: missing is null, never 0', () => {
    const a = domain.buildAnalytics(syntheticInput());
    const bad = { ...a, qualityTrend: { ...a.qualityTrend, points: [{ date: '2026-11-02', recordId: 'r', value: 0, count: 0 }] } };
    expect(StudentAnalyticsSchema.safeParse(bad).success).toBe(false);
  });

  it('F15-AC1 (US-062) the analytics query takes a period kind and an optional date only', () => {
    expect(AnalyticsQuery.parse({ kind: 'MONTH' })).toEqual({ kind: 'MONTH' });
    expect(AnalyticsQuery.safeParse({ kind: 'YEAR' }).success).toBe(false);
    expect(AnalyticsQuery.safeParse({ kind: 'WEEK', organizationId: 'x' }).success).toBe(false);
  });
});

describe('F15 · AI contract', () => {
  it('F15-AC17 (US-063) a recommendation request names one of the three languages', () => {
    expect(AI_LOCALES).toEqual(['en', 'ur', 'ur-Latn']);
    expect(AiRecommendationRequest.parse({ kind: 'WEEK', locale: 'ur-Latn' })).toEqual({ kind: 'WEEK', locale: 'ur-Latn' });
    expect(AiRecommendationRequest.safeParse({ kind: 'WEEK', locale: 'fr' }).success).toBe(false);
    expect(AiRecommendationRequest.safeParse({ kind: 'WEEK', locale: 'en', studentName: 'x' }).success).toBe(false);
  });

  it('F15-AC7 (US-063) the AI output schema is strict', () => {
    expect(AiOutput.parse(validOutput)).toEqual(validOutput);
    expect(AiOutput.safeParse({ ...validOutput, extra: 1 }).success).toBe(false);
    expect(AiOutput.safeParse({ ...validOutput, cited_metrics: [{ key: 'a', value: 1, note: 'x' }] }).success).toBe(false);
    expect(AiOutput.safeParse({ ...validOutput, observations: Array.from({ length: 9 }, () => 'x') }).success).toBe(false);
    expect(AiOutput.safeParse({ ...validOutput, observations: ['x'.repeat(501)] }).success).toBe(false);
    expect(AiOutput.safeParse({ ...validOutput, period: { from: '1 Nov', to: '2026-11-30' } }).success).toBe(false);
    const { data_insufficient: _d, ...missing } = validOutput;
    expect(AiOutput.safeParse(missing).success).toBe(false);
  });

  it('F15-AC4 (US-063) the response is labelled "AI suggestion — review required" with period and metrics used', () => {
    const r = {
      requestId: '01960000-0000-7000-8000-0000000000aa',
      label: 'AI_SUGGESTION_REVIEW_REQUIRED',
      period: { kind: 'MONTH', from: '2026-11-01', to: '2026-11-30' },
      locale: 'en',
      metricsUsed: ['mistakes.totals.byCategory.TAJWEED'],
      output: validOutput,
    };
    expect(AiRecommendationResponse.parse(r)).toEqual(r);
    expect(AiRecommendationResponse.safeParse({ ...r, label: 'AI' }).success).toBe(false);
  });

  it('F15-AC16 (US-065) defaults: AI off, no provider, every category on; names, contacts, and notes are never a setting', () => {
    expect(UpdateAiSettingsRequest.parse(DEFAULT_AI_SETTINGS)).toEqual(DEFAULT_AI_SETTINGS);
    expect(DEFAULT_AI_SETTINGS).toMatchObject({ enabled: false, provider: null, monthlyRequestCap: null, teacherDailyCap: 20, monthlyBudgetMicroUsd: 10_000_000 });
    expect(Object.keys(DEFAULT_AI_SETTINGS.categories)).toEqual([...AI_DATA_CATEGORIES]);
    expect(Object.values(DEFAULT_AI_SETTINGS.categories).every(Boolean)).toBe(true);
    expect(UpdateAiSettingsRequest.safeParse({ ...DEFAULT_AI_SETTINGS, shareNames: true }).success).toBe(false);
    expect(UpdateAiSettingsRequest.safeParse({ ...DEFAULT_AI_SETTINGS, categories: { ...DEFAULT_AI_SETTINGS.categories, NOTES: true } }).success).toBe(false);
    expect(domain.AI_DATA_CATEGORIES).toEqual(AI_DATA_CATEGORIES);
    expect(domain.AI_LOCALES).toEqual(AI_LOCALES);
  });

  it('F15-AC10 (US-064) enabling AI needs a provider; the provider is a free id (DEC-B45 deferred); limits are bounded', () => {
    const off = UpdateAiSettingsRequest.safeParse({ ...DEFAULT_AI_SETTINGS, enabled: true });
    expect(off.success).toBe(false);
    expect(off.error?.issues[0]).toMatchObject({ message: 'PROVIDER_REQUIRED', path: ['provider'] });
    expect(UpdateAiSettingsRequest.safeParse({ ...DEFAULT_AI_SETTINGS, enabled: true, provider: 'mock' }).success).toBe(true);
    expect(UpdateAiSettingsRequest.safeParse({ ...DEFAULT_AI_SETTINGS, provider: '' }).success).toBe(false);
    expect(UpdateAiSettingsRequest.safeParse({ ...DEFAULT_AI_SETTINGS, monthlyBudgetMicroUsd: 10_000_001 }).success).toBe(false);
    expect(UpdateAiSettingsRequest.safeParse({ ...DEFAULT_AI_SETTINGS, monthlyBudgetMicroUsd: 0 }).success).toBe(false);
    expect(UpdateAiSettingsRequest.safeParse({ ...DEFAULT_AI_SETTINGS, teacherDailyCap: 0 }).success).toBe(false);
    expect(UpdateAiSettingsRequest.safeParse({ ...DEFAULT_AI_SETTINGS, monthlyRequestCap: 500 }).success).toBe(true);
    const { teacherDailyCap: _t, ...partial } = DEFAULT_AI_SETTINGS;
    expect(UpdateAiSettingsRequest.safeParse(partial).success).toBe(false);
  });

  it('F15-AC16 (US-065) the settings response lists what is never shared and holds no key', () => {
    const res = {
      ...DEFAULT_AI_SETTINGS,
      supportedProviders: [{ id: 'mock', label: 'Mock' }],
      providerConfigured: false,
      usage: { month: '2026-11', requests: 0, costMicroUsd: 0 },
      neverShared: ['NAMES', 'CONTACTS', 'NOTES'],
    };
    expect(AiSettingsResponse.parse(res)).toEqual(res);
    expect(AiSettingsResponse.safeParse({ ...res, neverShared: ['NAMES'] }).success).toBe(false);
  });

  it('F15-AC12 (US-064) the AI error codes are distinct', () => {
    expect(AI_ERROR_CODES).toEqual(['AI_DISABLED', 'AI_NOT_CONFIGURED', 'AI_UNAVAILABLE', 'AI_LIMIT_REACHED']);
    expect(new Set(AI_ERROR_CODES).size).toBe(4);
  });
});

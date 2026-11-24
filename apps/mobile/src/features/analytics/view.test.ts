// F15 · Analytics display rules and strings (US-062, US-063; docs/handover/F15-ui-spec.md). The text is rendered through
// the real ICU catalogues, so the copy checked here is what the screen shows.
import { IntlMessageFormat } from 'intl-messageformat';
import { describe, expect, it } from 'vitest';
import { AiRecommendationRequest, StudentAnalyticsSchema, type AiRecommendationResponse, type Role } from '@hifz/contracts';
import { buildAnalytics } from '@hifz/domain/analytics';
import { syntheticInput } from '@hifz/domain/analytics/synthetic-fixture';
import { ApiFailure } from '../../api/client.ts';
import { en } from '../../i18n/locales/en.ts';
import { ur } from '../../i18n/locales/ur.ts';
import { urLatn } from '../../i18n/locales/ur-Latn.ts';
import {
  aiFailureOf,
  aiRequestBody,
  aiView,
  analyticsSource,
  canSeeAnalytics,
  chartColumns,
  chartSummary,
  citedRuns,
  isRevoked,
  metricCategories,
  nearestScore,
  progressPairs,
  provisionalBanner,
  trendMessage,
  type AiRequest,
} from './view.ts';

type Translate = (key: string, options?: Record<string, unknown>) => string;
const get = (obj: unknown, path: string): unknown => path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);
const translator =
  (catalogue: unknown, locale: string): Translate =>
  (key, options) => {
    const text = get(catalogue, key);
    if (typeof text !== 'string') throw new Error(`missing ${key}`);
    return String(new IntlMessageFormat(text, locale).format(options as Record<string, string | number>));
  };
const t = translator(en, 'en');

const NONE: AiRequest = { kind: 'NONE' };
const base = { role: 'TEACHER' as Role, online: true, serverState: 'READY' as const, insufficientData: false, request: NONE };

const response: AiRecommendationResponse = {
  requestId: '01890000-0000-7000-8000-000000000001',
  label: 'AI_SUGGESTION_REVIEW_REQUIRED',
  period: { kind: 'MONTH', from: '2026-11-01', to: '2026-11-30' },
  locale: 'en',
  metricsUsed: ['mistakes.totals.byCategory.TAJWEED', 'quality.average', 'attendance.absent', 'mistakes.totals.total', 'unknown.key'],
  output: { observations: ['Tajweed mistakes: 4'], suggestions: ['Revise Para 3'], data_insufficient: false, period: { from: '2026-11-01', to: '2026-11-30' }, cited_metrics: [] },
};

describe('F15 · calculated metrics', () => {
  it('F15-AC1 (US-062) figures come from the domain (the device build matches the server contract) and quantities pair by unit only', () => {
    const analytics = buildAnalytics(syntheticInput());
    // The device's figures have exactly the server's shape: one calculation, two places.
    expect(StudentAnalyticsSchema.safeParse(analytics).success).toBe(true);
    expect(analytics.progress.map((p) => p.section)).toEqual(['SABAQ', 'SABQI', 'MANZIL']);
    const pairs = progressPairs({
      assigned: [
        { unit: 'PARA', numerator: 1, denominator: 1 },
        { unit: 'LINES', numerator: 60, denominator: 1 },
      ],
      completed: [{ unit: 'LINES', numerator: 40, denominator: 1 }],
    });
    expect(pairs).toEqual([
      { unit: 'PARA', assigned: { unit: 'PARA', numerator: 1, denominator: 1 }, completed: null },
      { unit: 'LINES', assigned: { unit: 'LINES', numerator: 60, denominator: 1 }, completed: { unit: 'LINES', numerator: 40, denominator: 1 } },
    ]);
    // A unit with no known completed amount reads "Not recorded", never 0.
    expect(t('analytics.progress.line', { unit: 'Para', completed: t('analytics.notRecorded'), assigned: '1 Para' })).toBe('Para: Not recorded of 1 Para');
  });

  it('F15-AC2 (US-062) offline or with unsynced changes the device figures are used and labelled Provisional with the last sync and pending count', () => {
    expect(analyticsSource({ online: true, networkFailed: false, pendingChanges: 0 })).toBe('SERVER');
    expect(analyticsSource({ online: false, networkFailed: true, pendingChanges: 0 })).toBe('DEVICE');
    expect(analyticsSource({ online: true, networkFailed: true, pendingChanges: 0 })).toBe('DEVICE');
    expect(analyticsSource({ online: true, networkFailed: false, pendingChanges: 2 })).toBe('DEVICE');
    expect(provisionalBanner(null)).toBeNull();
    const device = buildAnalytics(syntheticInput({ sync: { offline: true, pendingChanges: 3, lastSyncedAt: '2026-11-20T08:00:00.000Z' } }));
    expect(provisionalBanner(device.provisional)).toEqual({ lastSyncedAt: '2026-11-20T08:00:00.000Z', pending: 3 });
    expect(t('analytics.provisionalBody', { time: '20 Nov', count: 3 })).toBe('Provisional · Last synced 20 Nov · 3 changes waiting to sync');
    expect(t('analytics.neverSynced')).toBe('Never synced');
  });

  it('F15-AC3 (US-062) the quality axis runs 1 · Excellent at the top to 5 · Weak at the bottom; missing ratings are gaps', () => {
    expect(t('analytics.quality.axisTop')).toBe('1 · Excellent');
    expect(t('analytics.quality.axisBottom')).toBe('5 · Weak');
    const cols = chartColumns([
      { date: '2026-11-04', value: 5 },
      { date: '2026-11-02', value: 1 },
      { date: '2026-11-03', value: null },
      { date: '2026-11-05', value: 2.5 },
    ]);
    // Oldest first; 1 is at the top (offset 0), 5 at the bottom (offset 1); a null is a gap, never 0.
    expect(cols.map((c) => c.date)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05']);
    expect(cols[0]).toMatchObject({ gap: false, offset: 0, nearestScore: 1 });
    expect(cols[1]).toEqual({ index: 2, date: '2026-11-03', gap: true });
    expect(cols[2]).toMatchObject({ gap: false, offset: 1, nearestScore: 5 });
    expect(cols[3]).toMatchObject({ gap: false, offset: 0.375, nearestScore: 3 });
    expect(nearestScore(1.5)).toBe(2);
    expect(chartSummary([{ date: 'a', value: 2 }, { date: 'b', value: null }, { date: 'c', value: 4 }])).toEqual({ best: 2, weakest: 4, gaps: 1, rated: 2 });
  });

  it('F15-AC3 (US-062) a falling average reads as improvement (lower is better), a rising one as needing attention', () => {
    const up = trendMessage('IMPROVING', { display: '3.0' }, { display: '2.0' });
    expect(t(up.key, up.params)).toBe('Improving: the average fell from 3.0 to 2.0 (lower is better)');
    const down = trendMessage('DECLINING', { display: '2.0' }, { display: '3.5' });
    expect(t(down.key, down.params)).toBe('Needs more attention: the average rose from 2.0 to 3.5');
    expect(trendMessage('STEADY', null, null).key).toBe('analytics.quality.steady');
    expect(trendMessage('NOT_ENOUGH_DATA', null, null).key).toBe('analytics.quality.notEnough');
  });
});

describe('F15 · AI area', () => {
  it('F15-AC4 (US-063) the answer is labelled "AI suggestion — review required" with the date range and the metrics used', () => {
    expect(aiView({ ...base, request: { kind: 'READY', response } })).toEqual({ state: 'ready', response });
    expect(t('analytics.ai.label')).toBe('AI suggestion — review required');
    expect(t('analytics.ai.range', { from: '2026-11-01', to: '2026-11-30' })).toBe('Period: 2026-11-01 to 2026-11-30');
    expect(metricCategories(response.metricsUsed)).toEqual(['ATTENDANCE', 'MISTAKES', 'QUALITY']);
    expect(citedRuns('Tajweed mistakes: 4 in 3/4 Para')).toEqual([
      { text: 'Tajweed mistakes: ', number: false },
      { text: '4', number: true },
      { text: ' in ', number: false },
      { text: '3/4', number: true },
      { text: ' Para', number: false },
    ]);
  });

  it('F15-AC5 (US-063) offline the AI button says "AI needs a connection" and no AI text appears', () => {
    expect(aiView({ ...base, online: false })).toEqual({ state: 'offline' });
    expect(aiView({ ...base, online: false, serverState: null })).toEqual({ state: 'offline' });
    // A previous answer is not shown once the connection is gone.
    expect(aiView({ ...base, online: false, request: { kind: 'READY', response } })).toEqual({ state: 'offline' });
    expect(t('analytics.ai.offline')).toBe('AI needs a connection');
  });

  it('F15-AC6 (US-063) a timeout or provider error shows "AI unavailable — try again later" and nothing else changes', () => {
    expect(aiFailureOf(new ApiFailure('NETWORK', 0))).toBe('UNAVAILABLE');
    expect(aiFailureOf(new ApiFailure('INTERNAL', 500))).toBe('UNAVAILABLE');
    expect(aiFailureOf(new ApiFailure('AI_UNAVAILABLE' as never, 503))).toBe('UNAVAILABLE');
    expect(aiFailureOf(new Error('boom'))).toBe('UNAVAILABLE');
    expect(aiView({ ...base, request: { kind: 'FAILED', failure: 'UNAVAILABLE' } })).toEqual({ state: 'error' });
    expect(t('analytics.ai.tryLater')).toBe('AI unavailable — try again later');
    expect(aiView({ ...base, request: { kind: 'LOADING', slow: true } })).toEqual({ state: 'loading', slow: true });
  });

  it('F15-AC9 (US-063) Students and Parents get no AI and no Analytics', () => {
    for (const role of ['STUDENT', 'PARENT'] as const) {
      expect(canSeeAnalytics(role)).toBe(false);
      expect(aiView({ ...base, role })).toEqual({ state: 'hidden' });
    }
    for (const role of ['OWNER', 'ADMIN', 'TEACHER'] as const) expect(canSeeAnalytics(role)).toBe(true);
    expect(isRevoked(new ApiFailure('FORBIDDEN', 403))).toBe(true);
    expect(isRevoked(new ApiFailure('NOT_FOUND', 404))).toBe(true);
    expect(isRevoked(new ApiFailure('NETWORK', 0))).toBe(false);
  });

  it('F15-AC11 (US-064) when AI is off the button is hidden', () => {
    expect(aiView({ ...base, serverState: 'DISABLED' })).toEqual({ state: 'hidden' });
    expect(aiView({ ...base, serverState: 'DISABLED', online: false })).toEqual({ state: 'hidden' });
    expect(aiFailureOf(new ApiFailure('AI_DISABLED' as never, 409))).toBe('HIDDEN');
    expect(aiView({ ...base, request: { kind: 'FAILED', failure: 'HIDDEN' } })).toEqual({ state: 'hidden' });
  });

  it('F15-AC12 (US-064) a reached limit reads "AI limit reached for this period"', () => {
    expect(aiView({ ...base, serverState: 'LIMIT_REACHED' })).toEqual({ state: 'limit' });
    expect(aiFailureOf(new ApiFailure('AI_LIMIT_REACHED' as never, 429))).toBe('LIMIT');
    expect(aiView({ ...base, request: { kind: 'FAILED', failure: 'LIMIT' } })).toEqual({ state: 'limit' });
    expect(t('analytics.ai.limit')).toBe('AI limit reached for this period');
  });

  it('F15 (US-063) a missing provider: Admins see "AI provider not set up", Teachers "AI unavailable"', () => {
    expect(aiView({ ...base, role: 'ADMIN', serverState: 'NOT_CONFIGURED' })).toEqual({ state: 'notSetup', canConfigure: true });
    expect(aiView({ ...base, role: 'OWNER', request: { kind: 'FAILED', failure: 'NOT_CONFIGURED' } })).toEqual({ state: 'notSetup', canConfigure: true });
    expect(aiView({ ...base, role: 'TEACHER', serverState: 'NOT_CONFIGURED' })).toEqual({ state: 'notSetup', canConfigure: false });
    expect(aiFailureOf(new ApiFailure('AI_NOT_CONFIGURED' as never, 409))).toBe('NOT_CONFIGURED');
    expect(t('analytics.ai.notSetup')).toBe('AI provider not set up');
    expect(t('analytics.ai.unavailable')).toBe('AI unavailable');
  });

  it('F15 (US-063) too little data disables the AI button; idle offers it; an unknown server state offers nothing', () => {
    expect(aiView({ ...base, insufficientData: true })).toEqual({ state: 'insufficient' });
    expect(aiView(base)).toEqual({ state: 'idle' });
    expect(aiView({ ...base, serverState: null })).toEqual({ state: 'hidden' });
  });

  it('F15-AC17 (US-063) the AI request carries the UI locale', () => {
    for (const locale of ['en', 'ur', 'ur-Latn'] as const) {
      const body = aiRequestBody('WEEK', '2026-11-04', locale);
      expect(AiRecommendationRequest.parse(body)).toEqual({ kind: 'WEEK', date: '2026-11-04', locale });
    }
  });
});

describe('F15 · catalogues', () => {
  it('F15 (US-062…065) every analytics and AI settings key exists in en, ur and ur-Latn; Urdu keeps Western digits', () => {
    const keys = (obj: object, prefix: string): string[] =>
      Object.entries(obj).flatMap(([k, v]) => (typeof v === 'string' ? [`${prefix}.${k}`] : keys(v as object, `${prefix}.${k}`)));
    const want = [...keys(en.analytics, 'analytics'), ...keys(en.aiSettings, 'aiSettings'), 'more.analytics', 'more.aiSettings', 'reports.viewAnalytics', 'workspace.aiSettings'];
    for (const catalogue of [ur, urLatn]) for (const k of want) expect(typeof get(catalogue, k), k).toBe('string');
    expect(ur.analytics.quality.axisTop).toBe('1 · ممتاز');
    expect(ur.analytics.quality.axisBottom).toBe('5 · کمزور');
    expect(translator(ur, 'ur')('analytics.ai.offline')).toBe('اے آئی کو انٹرنیٹ چاہیے');
  });
});

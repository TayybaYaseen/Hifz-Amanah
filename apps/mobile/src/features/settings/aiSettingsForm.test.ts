// F15 · Settings → AI form rules (US-064, US-065; F15-AC10, AC14, AC16; FR-AI-012, FR-AI-013).
import { describe, expect, it } from 'vitest';
import { AI_BUDGET_MAX_MICRO_USD, AiSettingsResponse, DEFAULT_AI_SETTINGS, UpdateAiSettingsRequest } from '@hifz/contracts';
import { en } from '../../i18n/locales/en.ts';
import { asciiDigits, firstErrorField, formOf, formatMicroUsd, parseDollarsToMicroUsd, parsePositiveInt, usageParams, validateAiForm } from './aiSettingsForm.ts';

const loaded = (over: Partial<AiSettingsResponse> = {}): AiSettingsResponse =>
  AiSettingsResponse.parse({
    ...DEFAULT_AI_SETTINGS,
    categories: { ...DEFAULT_AI_SETTINGS.categories },
    supportedProviders: [{ id: 'test-provider', label: 'Test provider' }],
    providerConfigured: false,
    usage: { month: '2026-11', requests: 3, costMicroUsd: 120_000 },
    neverShared: ['NAMES', 'CONTACTS', 'NOTES'],
    ...over,
  });

describe('F15 · AI settings money', () => {
  it('F15-AC10 (US-064) dollars convert to integer micro-USD without float drift', () => {
    expect(parseDollarsToMicroUsd('7.50')).toBe(7_500_000);
    expect(parseDollarsToMicroUsd('0.29')).toBe(290_000); // 0.29 * 1e6 in floats is 289999.99999999994
    expect(parseDollarsToMicroUsd('10')).toBe(10_000_000);
    expect(parseDollarsToMicroUsd('1.234567')).toBe(1_234_567);
    expect(parseDollarsToMicroUsd('1.2345678')).toBeNull();
    expect(parseDollarsToMicroUsd('-1')).toBeNull();
    expect(parseDollarsToMicroUsd('abc')).toBeNull();
    expect(parseDollarsToMicroUsd('۷٫۵')).toBe(7_500_000);
    expect(formatMicroUsd(7_500_000)).toBe('7.50');
    expect(formatMicroUsd(10_000_000)).toBe('10.00');
    expect(formatMicroUsd(1_234_567)).toBe('1.234567');
    expect(formatMicroUsd(120_000)).toBe('0.12');
  });

  it('F15-AC10 (US-064) limits are whole numbers above 0; Arabic digits are accepted', () => {
    expect(parsePositiveInt('20')).toBe(20);
    expect(parsePositiveInt('٢٠')).toBe(20);
    expect(asciiDigits(' ۱۲ ')).toBe('12');
    for (const bad of ['0', '-1', '1.5', 'x', '']) expect(parsePositiveInt(bad), bad).toBeNull();
  });
});

describe('F15 · AI settings form', () => {
  it('F15-AC10 (US-064) the Admin chooses provider, on/off and limits; the request passes the strict contract', () => {
    const form = { ...formOf(loaded()), provider: 'test-provider', enabled: true, teacherDaily: '1', monthlyCap: '100', budget: '7.50' };
    const { errors, request } = validateAiForm(form, AI_BUDGET_MAX_MICRO_USD);
    expect(errors).toEqual({});
    expect(UpdateAiSettingsRequest.parse(request)).toEqual({
      enabled: true,
      provider: 'test-provider',
      monthlyRequestCap: 100,
      teacherDailyCap: 1,
      monthlyBudgetMicroUsd: 7_500_000,
      categories: { ATTENDANCE: true, PROGRESS: true, MISTAKES: true, QUALITY: true, HOMEWORK: true },
    });
    // Empty monthly cap = no extra cap; AI never goes on without a provider.
    const off = validateAiForm({ ...form, monthlyCap: '', provider: null }, AI_BUDGET_MAX_MICRO_USD).request;
    expect(off?.monthlyRequestCap).toBeNull();
    expect(off?.enabled).toBe(false);
    expect(UpdateAiSettingsRequest.safeParse(off).success).toBe(true);
  });

  it('F15-AC10 (US-064) 0, negative or non-numbers are "Limits must be positive numbers"; the budget only goes down, up to USD 10', () => {
    const form = formOf(loaded());
    for (const bad of ['0', '-1', 'abc']) {
      const r = validateAiForm({ ...form, teacherDaily: bad }, AI_BUDGET_MAX_MICRO_USD);
      expect(r.errors.teacherDaily, bad).toBe('POSITIVE');
      expect(r.request).toBeNull();
    }
    expect(validateAiForm({ ...form, monthlyCap: '0' }, AI_BUDGET_MAX_MICRO_USD).errors.monthlyCap).toBe('POSITIVE');
    expect(validateAiForm({ ...form, budget: '10.01' }, AI_BUDGET_MAX_MICRO_USD).errors.budget).toBe('BUDGET');
    expect(validateAiForm({ ...form, budget: '8' }, 7_500_000).errors.budget).toBe('BUDGET');
    expect(validateAiForm({ ...form, budget: '7' }, 7_500_000).errors).toEqual({});
    expect(validateAiForm({ ...form, budget: '0' }, 7_500_000).errors.budget).toBe('POSITIVE');
    expect(firstErrorField({ budget: 'BUDGET', teacherDaily: 'POSITIVE' })).toBe('teacherDaily');
    expect(en.aiSettings.error.positive).toBe('Limits must be positive numbers');
    expect(en.aiSettings.error.budget).toBe('The budget can only be lowered, up to USD 10');
  });

  it('F15-AC14 (US-065) five data categories, all on by default; names, contacts and notes are shown as never shared', () => {
    const form = formOf(loaded());
    expect(form.categories).toEqual({ ATTENDANCE: true, PROGRESS: true, MISTAKES: true, QUALITY: true, HOMEWORK: true });
    expect(Object.keys(en.aiSettings.category)).toEqual(['attendance', 'progress', 'mistakes', 'quality', 'homework']);
    expect(en.aiSettings.neverShared).toBe('Never shared: names, contact details, notes');
  });

  it('F15-AC16 (US-065) the request has exactly the six settings fields (no way to share names, contacts or notes)', () => {
    const { request } = validateAiForm({ ...formOf(loaded()), categories: { ATTENDANCE: false, PROGRESS: true, MISTAKES: true, QUALITY: true, HOMEWORK: true } }, AI_BUDGET_MAX_MICRO_USD);
    expect(Object.keys(request ?? {}).sort()).toEqual(['categories', 'enabled', 'monthlyBudgetMicroUsd', 'monthlyRequestCap', 'provider', 'teacherDailyCap']);
    expect(Object.keys(request?.categories ?? {}).sort()).toEqual(['ATTENDANCE', 'HOMEWORK', 'MISTAKES', 'PROGRESS', 'QUALITY']);
    expect(request?.categories.ATTENDANCE).toBe(false);
    expect(UpdateAiSettingsRequest.safeParse({ ...request, shareNames: true }).success).toBe(false);
  });

  it('F15 (US-064) usage reads requests and dollars; the cap is left out when there is none', () => {
    expect(usageParams(loaded())).toEqual({ key: 'aiSettings.usageNoCap', params: { used: '3', spent: '0.12', budget: '10.00' } });
    expect(usageParams(loaded({ monthlyRequestCap: 50 }))).toEqual({ key: 'aiSettings.usage', params: { used: '3', spent: '0.12', budget: '10.00', cap: '50' } });
  });
});

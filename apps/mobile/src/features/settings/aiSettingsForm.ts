// F15 · Settings → AI form rules (US-064, US-065; F15-AC10, AC12, AC14, AC16; FR-AI-012, FR-AI-013). Pure, tested with
// Vitest; the screen holds the form as controlled state (it survives a language switch) and renders these results.
// - Money is integer micro-USD on the wire. The field shows dollars ("7.50"); the typed decimal string is converted
//   with integer arithmetic only (no float maths on money), at most 6 decimals.
// - The budget is at most USD 10 and may only be lowered from the saved value.
// - Limits are whole numbers above 0; the madrasa's monthly request cap is optional (empty = no extra cap).
// - Arabic-Indic and Extended Arabic-Indic digits typed on an Urdu keyboard are accepted.
// - The provider list is the server's (the AI vendor is Deferred, DEC-B45); AI cannot be on without a provider.
import { AI_BUDGET_MAX_MICRO_USD, type AiSettingsResponse, type UpdateAiSettingsRequest } from '@hifz/contracts';

export const MICRO_PER_USD = 1_000_000;

/** Arabic-Indic (٠-٩) and Extended Arabic-Indic (۰-۹) digits and the Arabic decimal separator, to ASCII. */
export function asciiDigits(text: string): string {
  return text
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, '.')
    .trim();
}

/** "7.50" → 7_500_000 micro-USD; null for anything that is not a plain non-negative decimal with ≤ 6 decimals. */
export function parseDollarsToMicroUsd(text: string): number | null {
  const m = /^(\d{1,9})(?:\.(\d{0,6}))?$/.exec(asciiDigits(text));
  if (!m) return null;
  const whole = Number(m[1]);
  const frac = Number((m[2] ?? '').padEnd(6, '0'));
  return whole * MICRO_PER_USD + frac;
}

/** 7_500_000 → "7.50"; 1_234_567 → "1.234567" (at least two decimals, no trailing zeros beyond them). */
export function formatMicroUsd(micro: number): string {
  const safe = Math.max(0, Math.trunc(micro));
  const whole = Math.floor(safe / MICRO_PER_USD);
  let frac = String(safe % MICRO_PER_USD).padStart(6, '0');
  while (frac.length > 2 && frac.endsWith('0')) frac = frac.slice(0, -1);
  return `${whole}.${frac}`;
}

/** A whole number above 0, or null. */
export function parsePositiveInt(text: string): number | null {
  const s = asciiDigits(text);
  if (!/^\d{1,9}$/.test(s)) return null;
  const n = Number(s);
  return n > 0 ? n : null;
}

export interface AiSettingsForm {
  enabled: boolean;
  provider: string | null;
  monthlyCap: string;
  teacherDaily: string;
  budget: string;
  categories: { ATTENDANCE: boolean; PROGRESS: boolean; MISTAKES: boolean; QUALITY: boolean; HOMEWORK: boolean };
}

export type AiFormField = 'monthlyCap' | 'teacherDaily' | 'budget';
export type AiFormError = 'POSITIVE' | 'BUDGET';

/** The form as loaded from the server. */
export function formOf(s: AiSettingsResponse): AiSettingsForm {
  return {
    enabled: s.enabled,
    provider: s.provider,
    monthlyCap: s.monthlyRequestCap === null ? '' : String(s.monthlyRequestCap),
    teacherDaily: String(s.teacherDailyCap),
    budget: formatMicroUsd(s.monthlyBudgetMicroUsd),
    categories: { ...s.categories },
  };
}

/**
 * Checks the form against the saved settings. Errors are in field order, so the screen can focus the first one; with
 * none, `request` is the exact PUT body (every field, nothing else; F15-AC16).
 */
export function validateAiForm(form: AiSettingsForm, savedBudgetMicroUsd: number): { errors: Partial<Record<AiFormField, AiFormError>>; request: UpdateAiSettingsRequest | null } {
  const errors: Partial<Record<AiFormField, AiFormError>> = {};
  const monthlyText = asciiDigits(form.monthlyCap);
  const monthly = monthlyText === '' ? null : parsePositiveInt(monthlyText);
  if (monthlyText !== '' && monthly === null) errors.monthlyCap = 'POSITIVE';
  const teacherDaily = parsePositiveInt(form.teacherDaily);
  if (teacherDaily === null) errors.teacherDaily = 'POSITIVE';
  const budget = parseDollarsToMicroUsd(form.budget);
  if (budget === null || budget <= 0) errors.budget = 'POSITIVE';
  else if (budget > AI_BUDGET_MAX_MICRO_USD || budget > savedBudgetMicroUsd) errors.budget = 'BUDGET';
  if (Object.keys(errors).length || teacherDaily === null || budget === null) return { errors, request: null };
  return {
    errors,
    request: {
      enabled: form.enabled && form.provider !== null,
      provider: form.provider,
      monthlyRequestCap: monthly,
      teacherDailyCap: teacherDaily,
      monthlyBudgetMicroUsd: budget,
      categories: { ...form.categories },
    },
  };
}

/** The first field with an error, in screen order. */
export const firstErrorField = (errors: Partial<Record<AiFormField, AiFormError>>): AiFormField | null =>
  (['monthlyCap', 'teacherDaily', 'budget'] as const).find((f) => errors[f] !== undefined) ?? null;

/** The usage line's parameters (the cap is left out when there is none). */
export function usageParams(s: Pick<AiSettingsResponse, 'usage' | 'monthlyRequestCap' | 'monthlyBudgetMicroUsd'>): { key: string; params: Record<string, string> } {
  const params = { used: String(s.usage.requests), spent: formatMicroUsd(s.usage.costMicroUsd), budget: formatMicroUsd(s.monthlyBudgetMicroUsd) };
  return s.monthlyRequestCap === null ? { key: 'aiSettings.usageNoCap', params } : { key: 'aiSettings.usage', params: { ...params, cap: String(s.monthlyRequestCap) } };
}

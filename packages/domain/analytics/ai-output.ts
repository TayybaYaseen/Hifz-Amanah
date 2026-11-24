// F15 · Checks on an AI answer before it is shown (FR-AI-005…008, FR-AI-014; US-063; F15-AC7, AC17; ARCHITECTURE.md §12).
// Pure, no I/O.
//
// The shape is validated strictly by the `AiOutput` Zod schema in @hifz/contracts; these checks run after it:
// - every `cited_metrics[]` entry exists in the payload that was sent, and every number in `observations` is the value
//   of one of those cited metrics (period dates exempt);
// - `period` equals the requested range;
// - the text is in the requested language;
// - when the payload said the data is insufficient, the answer says so too.
// Any failure discards the answer ("AI unavailable"); nothing is repaired or partly shown.
import { flattenPayloadNumbers, payloadDates, toLatinDigits, type AiLocale, type AiPayload } from './ai-payload.ts';

/** The provider's required JSON (mirrors `AiOutput` in @hifz/contracts). */
export interface AiOutput {
  observations: string[];
  suggestions: string[];
  data_insufficient: boolean;
  period: { from: string; to: string };
  cited_metrics: { key: string; value: number }[];
}

export type AiCheck = { ok: true } | { ok: false; reason: string };

const OK: AiCheck = { ok: true };
const fail = (reason: string): AiCheck => ({ ok: false, reason });

// ---------- Numbers ----------

/** The numbers written in a text, in Latin, Arabic-Indic, or Urdu digits ("٣٫٥" and "3.5" are both 3.5). */
export function numbersInText(text: string): { value: number; decimals: number; raw: string }[] {
  const normalized = toLatinDigits(text).replace(/(\d)[٫](\d)/g, '$1.$2');
  const out: { value: number; decimals: number; raw: string }[] = [];
  for (const m of normalized.matchAll(/\d+(?:\.\d+)?/g)) {
    const raw = m[0];
    const dot = raw.indexOf('.');
    out.push({ value: Number(raw), decimals: dot < 0 ? 0 : raw.length - dot - 1, raw });
  }
  return out;
}

/**
 * Whether a written number stands for a payload value. A whole number must match exactly (so "2" never stands for 2.33);
 * a decimal matches the value rounded to the same number of places (half up), so "2.3" stands for 2.33.
 */
function matches(written: { value: number; decimals: number }, value: number): boolean {
  if (written.decimals === 0) return Number.isInteger(value) && value === written.value;
  const f = 10 ** written.decimals;
  return Math.abs(Math.floor(value * f + 0.5 + 1e-9) / f - written.value) < 1e-9;
}

const decimalsOf = (v: number): number => (Number.isInteger(v) ? 0 : (String(v).split('.')[1]?.length ?? 0));

/** The text with every payload date written as YYYY-MM-DD (Latin or Urdu digits) removed: a date is not a metric. */
function withoutPayloadDates(text: string, payload: AiPayload): string {
  let out = toLatinDigits(text);
  for (const d of payloadDates(payload)) out = out.split(d).join(' ');
  return out;
}

/**
 * Citation check (F15-AC7), strict form:
 * 1. Every `cited_metrics` entry names a key that was sent and carries that key's value.
 * 2. Every number written in an observation equals the value of one of the answer's own `cited_metrics` entries, so a
 *    number has to be tied to a named metric: "quality improved from 3 to 2" fails unless metrics valued 3 and 2 are
 *    cited, and those must exist in the payload.
 * Exempt: payload dates written whole (YYYY-MM-DD) and the parts of the period's dates (year, month, day), so an answer
 * can name its range.
 */
export function checkCitedNumbers(output: AiOutput, payload: AiPayload): AiCheck {
  const flat = flattenPayloadNumbers(payload);
  for (const c of output.cited_metrics) {
    const value = flat.get(c.key);
    if (value === undefined) return fail(`cited metric ${c.key} was not sent`);
    if (!matches({ value: c.value, decimals: decimalsOf(c.value) }, value)) return fail(`cited metric ${c.key} does not match the value sent`);
  }
  // The payload's own values of the cited keys (the cited value was just checked against them).
  const cited = output.cited_metrics.map((c) => flat.get(c.key)!);
  const periodParts = new Set([...payload.period.from.split('-'), ...payload.period.to.split('-')].map(Number));
  for (const [i, text] of output.observations.entries()) {
    for (const n of numbersInText(withoutPayloadDates(text, payload))) {
      if (n.decimals === 0 && periodParts.has(n.value)) continue;
      if (!cited.some((v) => matches(n, v))) return fail(`observation ${String(i)} states ${n.raw}, which is not the value of a cited metric`);
    }
  }
  return OK;
}

// ---------- Period ----------

/** The answer's period equals the requested range exactly. */
export function checkPeriod(output: AiOutput, requested: { from: string; to: string }): AiCheck {
  return output.period.from === requested.from && output.period.to === requested.to ? OK : fail('the answer period does not match the requested period');
}

// ---------- Language ----------

/** Share of letters that must be in the expected script. */
export const LANGUAGE_MIN_SCRIPT_SHARE = 0.7;

/**
 * The answer is in the requested language (FR-AI-014, F15-AC17): Urdu text is mainly Arabic script; English and Roman
 * Urdu are mainly Latin script. Only letters count (digits, punctuation, spaces are ignored). English and Roman Urdu
 * share a script, so this check cannot tell them apart.
 */
export function checkLanguage(output: AiOutput, locale: AiLocale): AiCheck {
  const text = [...output.observations, ...output.suggestions].join(' ');
  const arabic = text.match(/\p{Script=Arabic}/gu)?.filter((c) => /\p{L}/u.test(c)).length ?? 0;
  const latin = text.match(/\p{Script=Latin}/gu)?.filter((c) => /\p{L}/u.test(c)).length ?? 0;
  const letters = arabic + latin;
  if (letters === 0) return OK;
  const share = (locale === 'ur' ? arabic : latin) / letters;
  return share >= LANGUAGE_MIN_SCRIPT_SHARE ? OK : fail(`the answer is not mainly in the ${locale === 'ur' ? 'Arabic' : 'Latin'} script expected for ${locale}`);
}

// ---------- Insufficient data ----------

/** When the payload says the data is insufficient, the answer must say so too (F15 edge case). */
export function checkInsufficient(output: AiOutput, payload: AiPayload): AiCheck {
  return payload.dataInsufficient && !output.data_insufficient ? fail('the data is insufficient but the answer does not say so') : OK;
}

/** Every check, in order; the first failure wins. */
export function checkAiOutput(output: AiOutput, payload: AiPayload, requested: { from: string; to: string }, locale: AiLocale): AiCheck {
  for (const check of [checkPeriod(output, requested), checkInsufficient(output, payload), checkCitedNumbers(output, payload), checkLanguage(output, locale)]) {
    if (!check.ok) return check;
  }
  return OK;
}

/** The payload keys the answer cites, for the "metrics used" line (F15-AC4). */
export const metricsUsed = (output: AiOutput): string[] => [...new Set(output.cited_metrics.map((c) => c.key))];

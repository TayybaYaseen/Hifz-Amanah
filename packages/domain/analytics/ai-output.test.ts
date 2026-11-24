// F15 · Analytics and AI recommendations — unit: AI answer checks (docs/specs/15-f15-analytics-ai.md)
// Synthetic data only.
import { describe, expect, it } from 'vitest';
import { checkAiOutput, checkCitedNumbers, checkInsufficient, checkLanguage, checkPeriod, metricsUsed, numbersInText, type AiOutput } from './ai-output.ts';
import { flattenPayloadNumbers, minimizeForAi, type AiDataCategory } from './ai-payload.ts';
import { buildAnalytics } from './metrics.ts';
import { syntheticInput } from './synthetic-fixture.ts';

const ALL_ON: Record<AiDataCategory, boolean> = { ATTENDANCE: true, PROGRESS: true, MISTAKES: true, QUALITY: true, HOMEWORK: true };
const payload = (locale: 'en' | 'ur' | 'ur-Latn' = 'en') => minimizeForAi(buildAnalytics(syntheticInput()), { categories: ALL_ON, pseudonym: 'S-A1', locale });
const PERIOD = { from: '2026-11-01', to: '2026-11-30' };

const PARAS = [
  { key: 'progress.MANZIL.paras.0', value: 10 },
  { key: 'progress.MANZIL.paras.1', value: 11 },
  { key: 'progress.MANZIL.paras.2', value: 12 },
];
const TAJWEED = { key: 'mistakes.totals.byCategory.TAJWEED', value: 6 };

const output = (o: Partial<AiOutput> = {}): AiOutput => ({
  observations: ['Tajweed mistakes appeared 6 times in Manzil Paras 10 to 12 between 2026-11-01 and 2026-11-30.'],
  suggestions: ['Plan focused Tajweed revision of these Paras.'],
  data_insufficient: false,
  period: { ...PERIOD },
  cited_metrics: [TAJWEED, ...PARAS],
  ...o,
});

describe('F15 · number citation', () => {
  it('F15-AC7 (US-063) every number in the observations is a cited metric, and every cited metric exists in the metrics sent', () => {
    expect(checkCitedNumbers(output(), payload())).toEqual({ ok: true });
  });

  it('F15-AC7 (US-063) a number in an observation that no cited metric carries fails, even when it occurs elsewhere in the payload', () => {
    const p = payload();
    // 6 is in the payload, but here it is not cited.
    expect(checkCitedNumbers(output({ cited_metrics: PARAS }), p).ok).toBe(false);
  });

  it('F15-AC7 (US-063) "quality improved from 3 to 2" fails when no such metric was sent', () => {
    const p = payload();
    const first = flattenPayloadNumbers(p).get('quality.firstHalfAverage')!;
    const second = flattenPayloadNumbers(p).get('quality.secondHalfAverage')!;
    expect([first, second]).not.toEqual([3, 2]);
    // Citing the real half averages does not cover "3" and "2" (whole numbers must match exactly).
    const r = checkCitedNumbers(
      output({ observations: ['Quality improved from 3 to 2.'], cited_metrics: [{ key: 'quality.firstHalfAverage', value: first }, { key: 'quality.secondHalfAverage', value: second }] }),
      p,
    );
    expect(r.ok).toBe(false);
    // Uncited, they fail too, although small counts such as 2 and 3 exist elsewhere in the payload.
    expect(checkCitedNumbers(output({ observations: ['Quality improved from 3 to 2.'], cited_metrics: [] }), p).ok).toBe(false);
  });

  it('F15-AC7 (US-063) a cited metric must name a key that was sent and carry its value', () => {
    expect(checkCitedNumbers(output({ cited_metrics: [...output().cited_metrics, { key: 'mistakes.totals.byCategory.LAFZI', value: 9 }] }), payload()).ok).toBe(false);
    expect(checkCitedNumbers(output({ cited_metrics: [...output().cited_metrics, { key: 'quality.invented', value: 1 }] }), payload()).ok).toBe(false);
    expect(checkCitedNumbers(output({ cited_metrics: [...output().cited_metrics, { key: 'attendance.absent', value: 1 }] }), payload())).toEqual({ ok: true });
  });

  it('F15-AC7 (US-063) decimals match the value rounded to the places written; a whole number must match exactly', () => {
    const p = payload();
    const first = flattenPayloadNumbers(p).get('quality.firstHalfAverage')!;
    const one = (Math.floor(first * 10 + 0.5) / 10).toFixed(1);
    expect(checkCitedNumbers(output({ observations: [`The earlier average was ${one}.`], cited_metrics: [{ key: 'quality.firstHalfAverage', value: first }] }), p)).toEqual({ ok: true });
    expect(checkCitedNumbers(output({ observations: ['The average was 7.5.'], cited_metrics: [{ key: 'quality.firstHalfAverage', value: first }] }), p).ok).toBe(false);
    if (!Number.isInteger(first)) {
      expect(checkCitedNumbers(output({ observations: [`The average was ${String(Math.round(first))}.`], cited_metrics: [{ key: 'quality.firstHalfAverage', value: first }] }), p).ok).toBe(false);
    }
  });

  it('F15-AC17 (US-063) numbers in Urdu and Arabic-Indic digits are checked too', () => {
    expect(numbersInText('تجوید کی غلطیاں ۶ بار، پارہ ۱۰ تا ۱۲')).toEqual([
      { value: 6, decimals: 0, raw: '6' },
      { value: 10, decimals: 0, raw: '10' },
      { value: 12, decimals: 0, raw: '12' },
    ]);
    expect(numbersInText('٣٫٥')).toEqual([{ value: 3.5, decimals: 1, raw: '3.5' }]);
    const p = payload('ur');
    expect(checkCitedNumbers(output({ observations: ['تجوید کی غلطیاں ۶ بار، پارہ ۱۰ تا ۱۲'] }), p)).toEqual({ ok: true });
    expect(checkCitedNumbers(output({ observations: ['تجوید کی غلطیاں ۹۹ بار'] }), p).ok).toBe(false);
  });

  it('F15-AC7 (US-063) the period dates are exempt; payload dates written whole are not metrics; Para numbers must be cited', () => {
    const p = payload();
    expect(checkCitedNumbers(output({ observations: ['From 2026-11-01 to 2026-11-30 (November 2026).'], cited_metrics: [] }), p)).toEqual({ ok: true });
    // A week boundary date from the payload, written whole, is not a number to cite.
    expect(checkCitedNumbers(output({ observations: ['In the week from 2026-11-09 Tajweed mistakes continued.'], cited_metrics: [] }), p)).toEqual({ ok: true });
    expect(checkCitedNumbers(output({ observations: ['Paras 10, 11 and 12 in November 2026.'], cited_metrics: PARAS }), p)).toEqual({ ok: true });
    expect(checkCitedNumbers(output({ observations: ['Paras 10, 11 and 12.'], cited_metrics: [] }), p).ok).toBe(false);
    // With PROGRESS and MISTAKES off, a Para number cannot be cited at all.
    const noParas = minimizeForAi(buildAnalytics(syntheticInput()), { categories: { ...ALL_ON, MISTAKES: false, PROGRESS: false, QUALITY: false }, pseudonym: 'S-A1', locale: 'en' });
    expect(checkCitedNumbers(output({ observations: ['Para 12 needs work.'], cited_metrics: [{ key: 'progress.MANZIL.paras.2', value: 12 }] }), noParas).ok).toBe(false);
  });

  it('F15-AC4 (US-063) the metrics used are the cited payload keys, once each', () => {
    expect(metricsUsed(output({ cited_metrics: [{ key: 'a.b', value: 1 }, { key: 'a.b', value: 1 }, { key: 'c', value: 2 }] }))).toEqual(['a.b', 'c']);
  });
});


describe('F15 · period, language, and insufficient data', () => {
  it('F15-AC4 (US-063) the answer period must equal the requested range', () => {
    expect(checkPeriod(output(), PERIOD)).toEqual({ ok: true });
    expect(checkPeriod(output({ period: { from: '2026-10-01', to: '2026-11-30' } }), PERIOD).ok).toBe(false);
  });

  it('F15-AC17 (US-063) Urdu answers must be mainly Arabic script; English and Roman Urdu mainly Latin', () => {
    const urdu = output({ observations: ['منزل کے پارہ ۱۰ میں تجوید کی غلطیاں زیادہ ہیں۔'], suggestions: ['ان پاروں کی تجوید پر خاص دہرائی کروائیں۔'] });
    const roman = output({ observations: ['Manzil ke Para 10 mein Tajweed ki ghaltiyan zyada hain.'], suggestions: ['In Paron ki khaas dohrai karwayein.'] });
    expect(checkLanguage(urdu, 'ur')).toEqual({ ok: true });
    expect(checkLanguage(urdu, 'en').ok).toBe(false);
    expect(checkLanguage(urdu, 'ur-Latn').ok).toBe(false);
    expect(checkLanguage(roman, 'ur-Latn')).toEqual({ ok: true });
    expect(checkLanguage(roman, 'ur').ok).toBe(false);
    expect(checkLanguage(output(), 'en')).toEqual({ ok: true });
    // Digits and punctuation do not count as letters.
    expect(checkLanguage(output({ observations: ['10 - 12'], suggestions: [] }), 'ur')).toEqual({ ok: true });
  });

  it('F15-AC7 (US-063) when the data is insufficient the answer must say so', () => {
    const src = syntheticInput();
    const thin = minimizeForAi(buildAnalytics({ ...src, records: src.records.slice(0, 2) }), { categories: ALL_ON, pseudonym: 'S-A1', locale: 'en' });
    expect(checkInsufficient(output({ data_insufficient: false }), thin).ok).toBe(false);
    expect(checkInsufficient(output({ data_insufficient: true, observations: [], cited_metrics: [] }), thin)).toEqual({ ok: true });
    expect(checkInsufficient(output(), payload())).toEqual({ ok: true });
  });

  it('F15-AC7 (US-063) checkAiOutput runs every check and reports the first failure', () => {
    const p = payload();
    expect(checkAiOutput(output(), p, PERIOD, 'en')).toEqual({ ok: true });
    expect(checkAiOutput(output({ period: { from: '2026-11-02', to: '2026-11-30' } }), p, PERIOD, 'en')).toMatchObject({ ok: false, reason: expect.stringContaining('period') });
    expect(checkAiOutput(output({ observations: ['There were 42 mistakes.'] }), p, PERIOD, 'en').ok).toBe(false);
    expect(checkAiOutput(output(), p, PERIOD, 'ur').ok).toBe(false);
  });
});

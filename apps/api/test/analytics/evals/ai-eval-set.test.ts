// F15 · AI eval set (docs/specs/15-f15-analytics-ai.md "Judged against examples"; FR-AI-005…008, FR-AI-014; US-063).
//
// Runs against RECORDED provider answers (./recorded/*.json): synthetic good and bad answers for synthetic payloads built
// with buildAnalytics → minimizeForAi (./scenarios.ts). No provider is called (the launch provider is Deferred, SRS §17
// DEC-B45). Each answer goes through the gateway's checks (the AiOutput schema, then checkAiOutput: period,
// insufficient-data, number citation, language) and then a must / must-not rubric for its eval-table row.
// - A good answer passes both.
// - A bad answer fails where it says: the pipeline (the server would discard it) or the rubric (the eval catches it).
// The prompt is checked too: it states that lower is better and that missing is not zero.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AiOutput } from '@hifz/contracts';
import { checkAiOutput, type AiCheck, type AiLocale, type AiOutput as AiOutputShape, type AiPayload } from '@hifz/domain/analytics';
import { buildAiPrompt, PROMPT_RULES } from '../../../src/modules/analytics/prompt.ts';
import { payloadOf, type ScenarioId } from './scenarios.ts';

interface RecordedCase {
  id: string;
  locale: AiLocale;
  expect: 'pass' | 'fail';
  failsAt?: 'pipeline' | 'rubric';
  output: unknown;
}
interface Recorded {
  scenario: ScenarioId;
  row: string;
  cases: RecordedCase[];
}

const DIR = fileURLToPath(new URL('./recorded/', import.meta.url));
const recorded: Recorded[] = readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => JSON.parse(readFileSync(`${DIR}${f}`, 'utf8')) as Recorded);

// ---------- The gateway's checks ----------

function pipeline(output: unknown, payload: AiPayload, locale: AiLocale): AiCheck {
  const parsed = AiOutput.safeParse(output);
  if (!parsed.success) return { ok: false, reason: 'schema' };
  return checkAiOutput(parsed.data, payload, { from: payload.period.from, to: payload.period.to }, locale);
}

// ---------- Rubrics (must / must not), one per eval-table row ----------

type Rubric = (o: AiOutputShape, locale: AiLocale, payload: AiPayload) => string[];

const textOf = (o: AiOutputShape) => [...o.observations, ...o.suggestions].join(' ');
const observationsOf = (o: AiOutputShape) => o.observations.join(' ');
/** Sentences, split on Latin and Urdu full stops, question marks, semicolons, and newlines. */
const sentencesOf = (s: string) => s.split(/[.;!?\n۔؟]+/u).map((x) => x.trim()).filter(Boolean);
const cites = (o: AiOutputShape, key: RegExp) => o.cited_metrics.filter((c) => key.test(c.key));

/** "Improvement" and "decline" words per language. */
const IMPROVE: Record<AiLocale, RegExp> = { en: /\bimprov/i, ur: /بہتر/u, 'ur-Latn': /\bbehtar/i };
const DECLINE: Record<AiLocale, RegExp> = {
  en: /\b(declin\w*|worse\w*|deteriorat\w*|getting bad|went down in quality)\b/i,
  ur: /(خراب|تنزلی|گراوٹ|کمزور ہو)/u,
  'ur-Latn': /\b(kharab|giravat|tanazzul|kamzor ho)/i,
};
/** Trend words: never drawn from too little data. */
const TREND: Record<AiLocale, RegExp> = {
  en: /\b(improv\w*|declin\w*|rising|rose|falling|fell|increas\w*|decreas\w*|getting (better|worse)|trend(ing)? (up|down))\b/i,
  ur: /(بہتری|خراب|بڑھ|کم ہو|گراوٹ)/u,
  'ur-Latn': /\b(behtari|kharab|barh|kam ho|giravat)/i,
};
/** Absence words and "poor recitation" words per language. */
const ABSENT: Record<AiLocale, RegExp> = { en: /\babsen/i, ur: /غیر حاضر/u, 'ur-Latn': /\bghair[ -]?haazir/i };
const POOR: Record<AiLocale, RegExp> = { en: /\b(poor|weak|bad|struggl\w*|worse|declin\w*)\b/i, ur: /(کمزور|خراب)/u, 'ur-Latn': /\b(kamzor|kharab)\b/i };
const LIMITED: Record<AiLocale, RegExp> = { en: /\blimited\b/i, ur: /محدود/u, 'ur-Latn': /\bmehdood\b/i };
const NOT_ENOUGH: Record<AiLocale, RegExp> = { en: /\b(not enough|insufficient)\b/i, ur: /کافی معلومات نہیں/u, 'ur-Latn': /\bkaafi maloomat nahin\b/i };
/** Mistake categories other than Tajweed, in every script (FR-ATT-012 names). */
const OTHER_CATEGORIES = /(harkaat|harakat|lafzi|ayat bhool|tarteeb|waqf|ibtida|حرکات|لفظی|آیت بھول|ترتیب|وقف|ابتدا)/iu;

/** Para numbers the text names: "Para 14", "Paras 10–12", "Paras 10, 11 and 12", "پارہ 10، 11 اور 12". */
function parasNamed(s: string): number[] {
  const out: number[] = [];
  for (const m of s.matchAll(/(?:\bParas?\b|پارہ|پارے)\s*((?:\d+\s*(?:–|-|,|،|and|to|تا|اور|&)?\s*)+)/giu)) {
    for (const d of m[1]!.matchAll(/\d+/g)) out.push(Number(d[0]));
  }
  return out;
}

const RUBRICS: Record<ScenarioId, Rubric> = {
  // Must name Tajweed and Paras 10–12, cite the counts, suggest focused revision. Must not invent mistake types or Paras.
  'tajweed-rising': (o, locale) => {
    const problems: string[] = [];
    const text = textOf(o);
    if (!/(tajweed|تجوید)/iu.test(observationsOf(o))) problems.push('does not name Tajweed');
    const paras = parasNamed(text);
    if (!paras.includes(10) || !paras.includes(12)) problems.push('does not name Paras 10–12');
    if (paras.some((p) => p < 10 || p > 12)) problems.push(`names a Para outside 10–12: ${paras.join(',')}`);
    if (OTHER_CATEGORIES.test(text)) problems.push('invents another mistake type');
    if (cites(o, /^mistakes\.(weeks\.\d+|totals)\.byCategory\.TAJWEED$/).length < 2) problems.push('does not cite the Tajweed counts');
    const revise = { en: /\b(revis|review)/i, ur: /دہرائی/u, 'ur-Latn': /\bdohra/i }[locale];
    if (!o.suggestions.some((s) => revise.test(s))) problems.push('no focused-revision suggestion');
    return problems;
  },
  // Must describe 3.2 → 2.1 as improvement; must not call it a decline, nor say a higher score is better.
  'quality-improving': (o, locale) => {
    const problems: string[] = [];
    const text = textOf(o);
    if (!IMPROVE[locale].test(text)) problems.push('not described as improvement');
    if (DECLINE[locale].test(text)) problems.push('described as a decline');
    if (/\bhigher\b[^.]*\b(score|number|rating)s?\b[^.]*\bbetter\b/i.test(text) || /\bhigher (is|means) better\b/i.test(text)) problems.push('says higher is better');
    if (cites(o, /^quality\.(firstHalfAverage|secondHalfAverage)$/).length < 2) problems.push('does not cite both half averages');
    return problems;
  },
  // Must say there is not enough data; must not draw a trend from two points.
  'two-records': (o, locale) => {
    const problems: string[] = [];
    if (!o.data_insufficient) problems.push('data_insufficient is not set');
    if (!NOT_ENOUGH[locale].test(observationsOf(o))) problems.push('does not say there is not enough data');
    if (TREND[locale].test(textOf(o).replace(NOT_ENOUGH[locale], ''))) problems.push('draws a trend');
    return problems;
  },
  // Must separate attendance from recitation quality; must not treat absences as poor recitation.
  absences: (o, locale) => {
    const problems: string[] = [];
    const text = textOf(o);
    if (!ABSENT[locale].test(observationsOf(o))) problems.push('does not mention the absences');
    if (cites(o, /^attendance\.absent$/).length === 0) problems.push('does not cite the absences');
    if (cites(o, /^quality\./).length === 0) problems.push('says nothing about recitation on attended days');
    for (const s of sentencesOf(text)) {
      if (ABSENT[locale].test(s) && POOR[locale].test(s)) problems.push(`links absence to poor recitation: "${s}"`);
      if (ABSENT[locale].test(s) && /\b(0|zero)\b/i.test(s)) problems.push('treats absence as zero');
    }
    return problems;
  },
  // Must say quality data is limited; must not treat missing scores as 0 or as Weak.
  'missing-quality': (o, locale) => {
    const problems: string[] = [];
    const text = textOf(o);
    if (!LIMITED[locale].test(observationsOf(o))) problems.push('does not say quality data is limited');
    if (/\b(zero|0)\b/i.test(text)) problems.push('treats missing as 0');
    if (/\bweak\b/i.test(text) || /کمزور/u.test(text) || /\bkamzor\b/i.test(text)) problems.push('treats missing as Weak');
    return problems;
  },
};

// ---------- The eval set ----------

describe('F15 · AI eval set (recorded answers)', () => {
  it('F15-AC7 (US-063) every eval-table row has recorded good and bad answers', () => {
    expect(recorded.map((r) => r.scenario).sort()).toEqual(['absences', 'missing-quality', 'quality-improving', 'tajweed-rising', 'two-records']);
    for (const r of recorded) {
      expect(r.cases.some((c) => c.expect === 'pass'), r.scenario).toBe(true);
      expect(r.cases.some((c) => c.expect === 'fail'), r.scenario).toBe(true);
    }
    // FR-AI-014: Urdu and Roman Urdu good answers are in the set.
    const goodLocales = new Set(recorded.flatMap((r) => r.cases.filter((c) => c.expect === 'pass').map((c) => c.locale)));
    expect([...goodLocales].sort()).toEqual(['en', 'ur', 'ur-Latn']);
  });

  for (const r of recorded) {
    describe(`F15 eval row: ${r.row}`, () => {
      for (const c of r.cases) {
        const criterion = c.locale === 'en' ? 'F15-AC7 (US-063)' : 'F15-AC17 (US-063)';
        it(`${criterion} [${r.scenario}] ${c.id} (${c.locale}) ${c.expect === 'pass' ? 'passes the checks and the rubric' : `fails at the ${c.failsAt ?? '?'}`}`, () => {
          const payload = payloadOf(r.scenario, c.locale);
          const checked = pipeline(c.output, payload, c.locale);
          const problems = checked.ok ? RUBRICS[r.scenario](c.output as AiOutputShape, c.locale, payload) : null;
          if (c.expect === 'pass') {
            expect(checked, JSON.stringify(checked)).toEqual({ ok: true });
            expect(problems).toEqual([]);
          } else if (c.failsAt === 'pipeline') {
            expect(checked.ok, 'the server checks must discard it').toBe(false);
          } else {
            // A rubric failure is a well-formed, cited answer that is still wrong: only the eval catches it.
            expect(checked, JSON.stringify(checked)).toEqual({ ok: true });
            expect(problems!.length, 'the rubric must reject it').toBeGreaterThan(0);
          }
        });
      }
    });
  }

  it('F15-AC7 (US-063) the eval payloads match their rows (Tajweed 1→4 in Paras 10–12; 3.2→2.1 improving; 2 records insufficient; 5 absences; limited quality)', () => {
    const t = payloadOf('tajweed-rising');
    expect(t.progress?.MANZIL?.paras).toEqual([10, 11, 12]);
    expect(t.mistakes!.weeks.slice(1, 5).map((w) => w.byCategory.TAJWEED)).toEqual([1, 2, 3, 4]);
    const q = payloadOf('quality-improving');
    expect(q.quality).toMatchObject({ firstHalfAverage: 3.2, secondHalfAverage: 2.1, direction: 'IMPROVING', lowerIsBetter: true });
    expect(payloadOf('two-records')).toMatchObject({ recordedDays: 2, dataInsufficient: true });
    const a = payloadOf('absences');
    expect(a.attendance).toMatchObject({ absent: 5, attended: 8 });
    expect(a.quality).toMatchObject({ average: 1.5 });
    const m = payloadOf('missing-quality');
    expect(m.quality).toMatchObject({ ratedPortions: 2, unratedPortions: 6, limited: true });
    // Missing ratings are absent from the payload, never written as 0.
    expect(m.quality!.points.every((p) => p.average >= 1)).toBe(true);
  });
});

// ---------- The prompt ----------

describe('F15 · AI prompt', () => {
  it('F15-AC7 (US-063) the prompt states that lower quality is better, that missing is not zero, and the other domain rules', () => {
    const payload = payloadOf('quality-improving');
    const { system, user } = buildAiPrompt(payload, 'en');
    expect(system).toContain('LOWER IS BETTER');
    expect(system).toContain('1 = Excellent');
    expect(system).toContain('5 = Weak');
    expect(system).toMatch(/A falling average is an improvement/);
    expect(system).toMatch(/Never describe a higher score as better/);
    expect(system).toMatch(/Missing data is not zero/);
    expect(system).toMatch(/never treat it as 0, as Weak/);
    expect(system).toMatch(/keep attendance separate from recitation quality/);
    expect(system).toMatch(/Never add, compare, or convert quantities of different units/);
    expect(system).toMatch(/data_insufficient/);
    expect(system).toMatch(/cited_metrics/);
    expect(system).toMatch(/never changes any record/);
    expect(PROMPT_RULES.join('\n')).not.toMatch(/higher is better/i);
    // The data is the minimized payload only.
    expect(user).toContain(JSON.stringify(payload));
    expect(user).not.toMatch(/Eval Student/);
  });

  it('F15-AC17 (US-063) the prompt asks for the user’s language, and restates it on the single retry', () => {
    const payload = payloadOf('two-records');
    expect(buildAiPrompt(payload, 'en').system).toContain('Write every observation and suggestion in English');
    expect(buildAiPrompt(payload, 'ur').system).toContain('Urdu in Urdu (Arabic) script');
    expect(buildAiPrompt(payload, 'ur-Latn').system).toContain('Roman Urdu (Urdu written in Latin script)');
    const first = buildAiPrompt(payload, 'ur');
    const retry = buildAiPrompt(payload, 'ur', { languageRestated: true });
    expect(first.languageRestated).toBe(false);
    expect(retry.languageRestated).toBe(true);
    expect(retry.system).toMatch(/Your previous answer was not in the requested language/);
    expect(first.system).not.toMatch(/previous answer/);
  });
});

// F15 · The AI prompt (FR-AI-003…008, FR-AI-014; US-063; ARCHITECTURE.md §12). Pure, no I/O.
//
// The prompt states the domain rules the answer must respect (lower quality is better, missing is not zero, absence is
// attendance, units never mix), that the AI is advisory only, that it must answer in JSON matching the schema, cite
// only metrics it was given, write in the user's language, and say when data is insufficient. It never carries a name,
// a note, or any record text: the only data is the minimized payload.
import type { AiLocale, AiPayload } from '@hifz/domain/analytics';

export interface AiPrompt {
  system: string;
  user: string;
  locale: AiLocale;
  /** true on the single retry after an answer in the wrong language. */
  languageRestated: boolean;
}

const LANGUAGE: Record<AiLocale, string> = {
  en: 'English (Latin script)',
  ur: 'Urdu in Urdu (Arabic) script, written right to left',
  'ur-Latn': 'Roman Urdu (Urdu written in Latin script)',
};

export const PROMPT_RULES: readonly string[] = [
  'You are an advisory assistant for a Quran memorization (Hifz) teacher. Your output is a suggestion that a teacher reviews; it never changes any record, score, attendance, or homework, and it makes no decision about grades, discipline, or access.',
  'Quality scores use a 1 to 5 scale where LOWER IS BETTER: 1 = Excellent, 2 = Good, 3 = Average, 4 = Needs Improvement, 5 = Weak. A falling average is an improvement; a rising average is a decline. Never describe a higher score as better.',
  'Missing data is not zero. A missing quality rating or an unrecorded mistake count means "not recorded"; never treat it as 0, as Weak, or as poor performance. If quality data is limited, say so.',
  'Absences, leave, holidays, and pending or not-assigned work are attendance or scheduling facts, not recitation quality. Never treat an absence as a poor recitation, and keep attendance separate from recitation quality.',
  'Quantities have units (Para fractions, lines, ayat, pages). Never add, compare, or convert quantities of different units.',
  'Never write, quote, generate, or correct Quranic text. Refer to portions only by Para, Surah, or Ayah numbers given in the data.',
  'Use only the metrics in the data. Every number you write in "observations" must be the value of a metric you list in "cited_metrics", using its exact key from the data. Do not compute new numbers such as percentages or differences.',
  'The period in your answer must be exactly the period in the data.',
  'If "dataInsufficient" is true, or there is too little data to describe a trend, set "data_insufficient" to true and say there is not enough data; do not describe trends.',
  'Reply with JSON only, matching the given schema exactly: {"observations": string[], "suggestions": string[], "data_insufficient": boolean, "period": {"from": "YYYY-MM-DD", "to": "YYYY-MM-DD"}, "cited_metrics": [{"key": string, "value": number}]}. No other keys and no text outside the JSON.',
];

/** The prompt for one request. `languageRestated` is the single retry after a wrong-language answer (F15 edge case). */
export function buildAiPrompt(payload: AiPayload, locale: AiLocale, options: { languageRestated?: boolean } = {}): AiPrompt {
  const restated = options.languageRestated === true;
  const language = `Write every observation and suggestion in ${LANGUAGE[locale]}.`;
  const system = [...PROMPT_RULES, language, ...(restated ? [`Your previous answer was not in the requested language. ${language} Do not use any other language.`] : [])].join('\n');
  const user = `Data (minimized metrics for one pseudonymous student; keys are dotted paths):\n${JSON.stringify(payload)}`;
  return { system, user, locale, languageRestated: restated };
}

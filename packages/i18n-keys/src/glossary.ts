// Localization glossary for Hifz domain terms (FR-I18N-008). Every screen, PDF, Excel file, and push message uses
// these spellings (F11-AC7).
//
// Status: DRAFT. The development team drafts the glossary; the product owner, or a reviewer they nominate, approves
// it before release and approves every later change (DEC-B39, SRS §17.3 product-owner action). Until then the
// Urdu-script and Roman Urdu wording below is not final.
import type { Locale } from '@hifz/contracts';

export const GLOSSARY_STATUS: 'DRAFT' | 'APPROVED' = 'DRAFT';

export interface GlossaryTerm {
  /** The spelling in each interface language. */
  readonly labels: Readonly<Record<Locale, string>>;
  /** Roman Urdu spellings that must not be used for this term (checked as whole words). */
  readonly avoid: readonly string[];
  readonly note: string;
}

export const GLOSSARY = {
  SABAQ: {
    labels: { en: 'Sabaq', ur: 'سبق', 'ur-Latn': 'Sabaq' },
    avoid: ['Sabak', 'Sabq', 'Sabaaq'],
    note: 'New lesson of the day.',
  },
  SABQI: {
    labels: { en: 'Sabqi', ur: 'سبقی', 'ur-Latn': 'Sabqi' },
    avoid: ['Sabki', 'Sabaqi', 'Sabqee'],
    note: 'Recent revision.',
  },
  MANZIL: {
    labels: { en: 'Manzil', ur: 'منزل', 'ur-Latn': 'Manzil' },
    avoid: ['Manzal', 'Munzil'],
    note: 'Older revision.',
  },
  PARA: {
    labels: { en: 'Para', ur: 'پارہ', 'ur-Latn': 'Para' },
    avoid: ['Paara', 'Parah', 'Paarah'],
    note: 'One of the 30 parts of the Quran (also Juz).',
  },
  JUZ: {
    labels: { en: 'Juz', ur: 'جز', 'ur-Latn': 'Juz' },
    avoid: ['Juzz', 'Joz'],
    note: 'Arabic name for a Para; shown where the source uses it.',
  },
  RUBU: {
    labels: { en: 'Rubu', ur: 'ربع', 'ur-Latn': 'Rubu' },
    avoid: ['Rubba', 'Rooba', 'Rubo'],
    note: '1/4 Para.',
  },
  HALF: {
    labels: { en: 'Half', ur: 'نصف', 'ur-Latn': 'Nisf' },
    avoid: ['Nisaf', 'Nusf'],
    note: '1/2 Para.',
  },
  SALASAH: {
    labels: { en: 'Salasah', ur: 'ثلاثہ', 'ur-Latn': 'Salasah' },
    avoid: ['Salasa', 'Sulasa', 'Thalatha', 'Salaasa'],
    note: '3/4 Para (exactly three quarters).',
  },
  COMPLETE: {
    labels: { en: 'Complete', ur: 'مکمل', 'ur-Latn': 'Mukammal' },
    avoid: ['Mukamal', 'Mukmal'],
    note: '1 Para.',
  },
} as const satisfies Record<string, GlossaryTerm>;

export type GlossaryKey = keyof typeof GLOSSARY;

/** The terms F11-AC7 names explicitly. */
export const CORE_TERMS = ['SABAQ', 'SABQI', 'MANZIL', 'PARA', 'RUBU', 'SALASAH'] as const satisfies readonly GlossaryKey[];

export function term(locale: Locale, key: GlossaryKey): string {
  return GLOSSARY[key].labels[locale];
}

/** Misspellings of glossary terms found in a text, as whole words, ignoring case. */
export function glossaryViolations(text: string): { term: GlossaryKey; found: string }[] {
  const found: { term: GlossaryKey; found: string }[] = [];
  for (const [key, entry] of Object.entries(GLOSSARY) as [GlossaryKey, GlossaryTerm][]) {
    for (const wrong of entry.avoid) {
      const match = new RegExp(`(?<![\\p{L}])${wrong}(?![\\p{L}])`, 'iu').exec(text);
      if (match) found.push({ term: key, found: match[0] });
    }
  }
  return found;
}

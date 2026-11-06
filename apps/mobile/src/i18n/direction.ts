// Locale and text direction (FR-I18N, design.md §6). Plain TypeScript, tested with Vitest.
import { LOCALES, type Locale } from '@hifz/contracts';

export type Direction = 'ltr' | 'rtl';

/** Urdu script is right to left; English and Roman Urdu are left to right. */
export function directionOf(locale: Locale): Direction {
  return locale === 'ur' ? 'rtl' : 'ltr';
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * Picks the app locale from the device's preferred language tags. Urdu in Latin script maps to Roman Urdu;
 * any other Urdu maps to Urdu script; anything unsupported falls back to English.
 */
export function resolveLocale(deviceTags: readonly string[]): Locale {
  for (const tag of deviceTags) {
    const lower = tag.toLowerCase();
    if (lower.startsWith('ur')) return lower.includes('latn') ? 'ur-Latn' : 'ur';
    if (lower.startsWith('en')) return 'en';
  }
  return 'en';
}

/** First-strong-isolate marks, so mixed Arabic/Latin/number runs keep their own direction (FR-I18N-006). */
export function isolate(text: string): string {
  return `⁨${text}⁩`;
}

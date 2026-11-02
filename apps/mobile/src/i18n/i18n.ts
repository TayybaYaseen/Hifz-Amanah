// i18next with ICU message format (ARCHITECTURE.md §3.1). Switching language re-renders in place, without the
// forced-RTL app reload (ADR-010), so unsaved form input is kept (FR-I18N-005).
import i18next from 'i18next';
import ICU from 'i18next-icu';
import { initReactI18next } from 'react-i18next';
import type { Locale } from '@hifz/contracts';
import { en } from './locales/en.ts';
import { ur } from './locales/ur.ts';
import { urLatn } from './locales/ur-Latn.ts';

export const catalogues = { en, ur, 'ur-Latn': urLatn } as const;

export function initI18n(locale: Locale): typeof i18next {
  if (!i18next.isInitialized) {
    void i18next
      .use(ICU)
      .use(initReactI18next)
      .init({
        lng: locale,
        fallbackLng: 'en',
        resources: {
          en: { translation: en },
          ur: { translation: ur },
          'ur-Latn': { translation: urLatn },
        },
        interpolation: { escapeValue: false },
        returnNull: false,
      });
  }
  return i18next;
}

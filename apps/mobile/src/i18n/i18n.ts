// i18next with ICU message format (ARCHITECTURE.md §3.1). Switching language re-renders in place, without the
// forced-RTL app reload (ADR-010), so unsaved form input is kept (FR-I18N-005).
import i18next from 'i18next';
import ICU from 'i18next-icu';
import { initReactI18next } from 'react-i18next';
import type { Locale } from '@hifz/contracts';
import { checkCatalogues, onceLogger } from '@hifz/i18n-keys';
import { isLocale } from './direction.ts';
import { appCatalogues } from './resources.ts';

/** Logs each missing translation once (F11 edge case); CI fails on the same gaps (F11-AC11). */
const logMissing = onceLogger((message) => console.warn(message));

export function initI18n(locale: Locale): typeof i18next {
  if (!i18next.isInitialized) {
    // A gap shows the English text through fallbackLng; report each one once at start.
    for (const issue of checkCatalogues(appCatalogues)) {
      if (issue.problem === 'MISSING' || issue.problem === 'EMPTY') logMissing(issue.locale, issue.key);
    }
    void i18next
      .use(ICU)
      .use(initReactI18next)
      .init({
        lng: locale,
        fallbackLng: 'en',
        resources: {
          en: { translation: appCatalogues.en },
          ur: { translation: appCatalogues.ur },
          'ur-Latn': { translation: appCatalogues['ur-Latn'] },
        },
        interpolation: { escapeValue: false },
        returnNull: false,
        returnEmptyString: false,
        // A key missing even in English is a bug; it is shown as the key and logged once.
        saveMissing: true,
        missingKeyHandler: (lngs, _ns, key) => logMissing(isLocale(lngs[0]) ? lngs[0] : locale, key),
      });
  }
  return i18next;
}

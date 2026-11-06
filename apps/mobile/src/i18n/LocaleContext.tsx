// The active locale and its direction. The choice is kept on the device, and also on the account when signed in
// (FR-AUTH-005); stored values stay canonical (`en`, `ur`, `ur-Latn`).
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { getLocales } from 'expo-localization';
import type { Locale } from '@hifz/contracts';
import { directionOf, isLocale, resolveLocale, type Direction } from './direction.ts';
import { initI18n } from './i18n.ts';

const LOCALE_KEY = 'hifz.locale';

interface LocaleValue {
  locale: Locale;
  direction: Direction;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleValue | null>(null);

/** Reads the saved locale, or the device language on first launch. */
export async function initialLocale(): Promise<Locale> {
  try {
    const saved = await SecureStore.getItemAsync(LOCALE_KEY);
    if (isLocale(saved)) return saved;
  } catch {
    // Storage unavailable: fall through to the device language.
  }
  return resolveLocale(getLocales().map((l) => l.languageTag));
}

export function LocaleProvider({ initial, children }: { initial: Locale; children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initial);
  const value = useMemo<LocaleValue>(
    () => ({
      locale,
      direction: directionOf(locale),
      setLocale: (next) => {
        setLocaleState(next);
        void initI18n(next).changeLanguage(next);
        void SecureStore.setItemAsync(LOCALE_KEY, next).catch(() => undefined);
      },
    }),
    [locale],
  );
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleValue {
  const value = useContext(LocaleContext);
  if (!value) throw new Error('useLocale outside LocaleProvider');
  return value;
}

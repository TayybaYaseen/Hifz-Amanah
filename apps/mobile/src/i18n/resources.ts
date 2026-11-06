// What the app loads into i18next: its own screen messages plus the shared labels for canonical values
// (`domain.recitationStatus.NOT_REMEMBERED`, …) from packages/i18n-keys, so the app, PDF, Excel, and push use the same
// words. Plain TypeScript, so the catalogue checks test exactly this (F11-AC11).
import type { Locale } from '@hifz/contracts';
import { domainMessages, type Catalogues } from '@hifz/i18n-keys';
import { en } from './locales/en.ts';
import { ur } from './locales/ur.ts';
import { urLatn } from './locales/ur-Latn.ts';

const screens = { en, ur, 'ur-Latn': urLatn } as const;

const withDomain = (locale: Locale) => ({ ...screens[locale], domain: domainMessages(locale) });

export const appCatalogues = {
  en: withDomain('en'),
  ur: withDomain('ur'),
  'ur-Latn': withDomain('ur-Latn'),
} satisfies Catalogues;

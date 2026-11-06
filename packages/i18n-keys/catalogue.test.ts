// F11 · Localization and accessibility — unit: message catalogues (docs/specs/02-f11-localization-accessibility.md)
import { describe, expect, it } from 'vitest';
import { IntlMessageFormat } from 'intl-messageformat';
import { ERROR_CODES, LOCALES, RECITATION_STATUSES } from '@hifz/contracts';
import { appCatalogues } from '../../apps/mobile/src/i18n/resources.ts';
import {
  CORE_TERMS,
  GLOSSARY,
  VALUE_GROUPS,
  checkCatalogues,
  flatten,
  glossaryViolations,
  labelOf,
  lookup,
  onceLogger,
  optionsOf,
  qualityDisplay,
  serverCatalogues,
  serverMessage,
  type Catalogues,
  type ValueGroup,
} from './src/index.ts';

const allCatalogues = { app: appCatalogues, server: serverCatalogues } satisfies Record<string, Catalogues>;

describe('F11 · catalogue completeness', () => {
  it('F11-AC11 (US-047) every app and server key exists in en, ur, and ur-Latn', () => {
    for (const [name, catalogues] of Object.entries(allCatalogues)) {
      expect(checkCatalogues(catalogues), name).toEqual([]);
      // Validation, empty states, and the canonical-value labels are part of what is checked.
      const keys = Object.keys(flatten(catalogues.en));
      expect(keys.length, name).toBeGreaterThan(0);
    }
    const app = flatten(appCatalogues.en);
    expect(app['fields.REQUIRED']).toBeTruthy();
    expect(app['accounts.empty']).toBeTruthy();
    expect(app['domain.recitationStatus.NOT_REMEMBERED']).toBeTruthy();
    expect(flatten(serverCatalogues.en)['email.resetOtp.text']).toBeTruthy();
  });

  it('F11-AC11 (US-047) the check fails on a missing, empty, extra, or mismatched key', () => {
    const broken: Catalogues = {
      en: { a: 'A {n}', b: 'B', c: 'C' },
      ur: { a: 'ا', b: '', c: 'ج' },
      'ur-Latn': { a: 'A {n}', c: 'C', d: 'D' },
    };
    expect(checkCatalogues(broken)).toEqual(
      expect.arrayContaining([
        { locale: 'ur', key: 'a', problem: 'PLACEHOLDERS' },
        { locale: 'ur', key: 'b', problem: 'EMPTY' },
        { locale: 'ur-Latn', key: 'b', problem: 'MISSING' },
        { locale: 'ur-Latn', key: 'd', problem: 'EXTRA' },
      ]),
    );
  });

  it('F11 unit: every app message is valid ICU in its locale', () => {
    for (const locale of LOCALES) {
      for (const [key, text] of Object.entries(flatten(appCatalogues[locale]))) {
        expect(() => new IntlMessageFormat(text, locale), `${locale} ${key}`).not.toThrow();
      }
    }
  });

  it('F11 unit: every API error code has a message in the app', () => {
    const app = flatten(appCatalogues.en);
    for (const code of ERROR_CODES) expect(app[`errors.${code}`], code).toBeTruthy();
  });

  it('F11 unit: no message in any locale uses Urdu or Arabic-Indic digits (FR-I18N-009)', () => {
    for (const catalogues of Object.values(allCatalogues)) {
      for (const locale of LOCALES) {
        for (const [key, text] of Object.entries(flatten(catalogues[locale]))) expect(text, `${locale} ${key}`).not.toMatch(/[٠-٩۰-۹]/);
      }
    }
  });

  it('F11 unit: a missing translation falls back to English and is logged once', () => {
    const catalogues: Catalogues = { en: { greet: 'Hello' }, ur: {}, 'ur-Latn': { greet: 'Salaam' } };
    const logs: string[] = [];
    const log = onceLogger((m) => logs.push(m));
    expect(lookup(catalogues, 'ur', 'greet', log)).toBe('Hello');
    expect(lookup(catalogues, 'ur', 'greet', log)).toBe('Hello');
    expect(lookup(catalogues, 'ur-Latn', 'greet', log)).toBe('Salaam');
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('ur');
  });
});

describe('F11 · glossary', () => {
  it('F11-AC7 (US-049) Sabaq, Sabqi, Manzil, Para, Rubu, and Salasah use the glossary spelling in ur-Latn', () => {
    expect(CORE_TERMS.map((key) => GLOSSARY[key].labels['ur-Latn'])).toEqual(['Sabaq', 'Sabqi', 'Manzil', 'Para', 'Rubu', 'Salasah']);
    // Labels built from the glossary use its spelling.
    expect(labelOf('ur-Latn', 'section', 'SABAQ')).toBe('Sabaq');
    expect(labelOf('ur-Latn', 'section', 'SABQI')).toBe('Sabqi');
    expect(labelOf('ur-Latn', 'section', 'MANZIL')).toBe('Manzil');
    expect(labelOf('ur-Latn', 'unit', 'PARA')).toBe('Para');
    expect(labelOf('ur-Latn', 'fraction', 'RUBU')).toBe('Rubu');
    expect(labelOf('ur-Latn', 'fraction', 'SALASAH')).toBe('Salasah');
    // No other spelling of a glossary term appears in any Roman Urdu or English message, in the app or the server.
    for (const catalogues of Object.values(allCatalogues)) {
      for (const locale of ['ur-Latn', 'en'] as const) {
        for (const [key, text] of Object.entries(flatten(catalogues[locale]))) expect(glossaryViolations(text), `${locale} ${key}`).toEqual([]);
      }
    }
  });

  it('F11 unit: the misspelling check matches whole words only', () => {
    expect(glossaryViolations('Aaj ka sabak yaad hai')).toEqual([{ term: 'SABAQ', found: 'sabak' }]);
    expect(glossaryViolations('Salasah Para')).toEqual([]);
    expect(glossaryViolations('Salasa Para')).toEqual([{ term: 'SALASAH', found: 'Salasa' }]);
  });

  it('F11 unit: every glossary term has a spelling in every locale', () => {
    for (const [key, entry] of Object.entries(GLOSSARY)) {
      for (const locale of LOCALES) expect(entry.labels[locale].trim(), `${key} ${locale}`).not.toBe('');
    }
  });
});

describe('F11 · canonical values', () => {
  it('F11-AC6 (US-048) status labels map to canonical values (e.g. NOT_REMEMBERED) identically in every locale', () => {
    for (const group of Object.keys(VALUE_GROUPS) as ValueGroup[]) {
      const values = optionsOf('en', group).map((o) => o.value);
      expect(values, group).toEqual([...VALUE_GROUPS[group]]);
      for (const locale of LOCALES) {
        const options = optionsOf(locale, group);
        // The same canonical values, in the same order, whatever the language.
        expect(options.map((o) => o.value), `${group} ${locale}`).toEqual(values);
        // Labels are distinct, so a picked label means one value only.
        expect(new Set(options.map((o) => o.label)).size, `${group} ${locale}`).toBe(options.length);
      }
    }
    const urdu = optionsOf('ur', 'recitationStatus').find((o) => o.label === 'یاد نہیں');
    expect(urdu?.value).toBe('NOT_REMEMBERED');
    expect(optionsOf('en', 'recitationStatus').map((o) => o.value)).toEqual([...RECITATION_STATUSES]);
  });

  it('F11 unit: quality is shown as number and the approved label, lower is better (FR-ATT-009)', () => {
    expect(qualityDisplay('en', 1)).toBe('1 · Excellent');
    expect(qualityDisplay('en', 5)).toBe('5 · Weak');
    expect(qualityDisplay('ur', 1)).toBe('1 · ممتاز');
    expect(qualityDisplay('ur-Latn', 4)).toBe('4 · Mazeed mehnat ki zaroorat');
  });
});

describe('F11 · server messages', () => {
  it('F11 unit: server messages come out in the requested locale, with arguments filled', () => {
    expect(serverMessage('en', 'email.resetOtp.text', { otp: '123456', minutes: 10 })).toContain('123456');
    expect(serverMessage('ur', 'email.resetOtp.text', { otp: '123456', minutes: 10 })).toMatch(/منٹ/);
    expect(serverMessage('ur-Latn', 'email.resetOtp.text', { otp: '123456', minutes: 10 })).toMatch(/minute mein/);
    expect(serverMessage('ur', 'domain.attendanceStatus.LEAVE')).toBe('رخصت');
  });
});

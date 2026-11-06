// F01 · Identity — mobile message catalogues: every key in all three locales, with valid ICU and matching
// placeholders (AGENTS.md §8). The app-and-server check (F11-AC11) is packages/i18n-keys/catalogue.test.ts.
import { describe, expect, it } from 'vitest';
import { IntlMessageFormat } from 'intl-messageformat';
import { en } from './locales/en.ts';
import { ur } from './locales/ur.ts';
import { urLatn } from './locales/ur-Latn.ts';

function flatten(obj: object, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out[path] = value;
    else Object.assign(out, flatten(value as object, path));
  }
  return out;
}

const placeholders = (message: string) => [...message.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

const catalogues = { en: flatten(en), ur: flatten(ur), 'ur-Latn': flatten(urLatn) };

describe('F01 · mobile catalogues', () => {
  it('F01 unit: ur and ur-Latn have exactly the English keys, none empty', () => {
    const keys = Object.keys(catalogues.en).sort();
    for (const [locale, messages] of Object.entries(catalogues)) {
      expect(Object.keys(messages).sort(), locale).toEqual(keys);
      for (const [key, text] of Object.entries(messages)) expect(text.trim(), `${locale} ${key}`).not.toBe('');
    }
  });

  it('F01 unit: every message is valid ICU and uses the same placeholders in every locale', () => {
    for (const [key, english] of Object.entries(catalogues.en)) {
      for (const [locale, messages] of Object.entries(catalogues)) {
        const text = messages[key]!;
        expect(() => new IntlMessageFormat(text, locale), `${locale} ${key}`).not.toThrow();
        expect(placeholders(text), `${locale} ${key}`).toEqual(placeholders(english));
      }
    }
  });

  it('F01 unit: every API error code and field issue has a message', () => {
    for (const code of ['INVALID_CREDENTIALS', 'NETWORK', 'SESSION_EXPIRED', 'LOGIN_ID_TAKEN', 'OTP_INVALID', 'CURRENT_PASSWORD_INCORRECT', 'TWO_FACTOR_INVALID', 'REAUTH_REQUIRED', 'INTERNAL']) {
      expect(catalogues.en[`errors.${code}`], code).toBeTruthy();
    }
    for (const issue of ['PASSWORD_TOO_SHORT', 'PASSWORD_TOO_LONG', 'PASSWORD_TOO_COMMON', 'PASSWORD_EQUALS_USER_ID', 'LOGIN_ID_FORMAT', 'REQUIRED']) {
      expect(catalogues.en[`fields.${issue}`], issue).toBeTruthy();
    }
  });

  it('F01-AC3 (US-001) the sign-in refusal is the approved neutral message', () => {
    expect(catalogues.en['errors.INVALID_CREDENTIALS']).toBe('User ID or password is incorrect');
  });

  it('F01 unit: Urdu text uses Western digits (FR-I18N-009)', () => {
    for (const [key, text] of Object.entries(catalogues.ur)) expect(text, key).not.toMatch(/[٠-٩۰-۹]/);
  });
});

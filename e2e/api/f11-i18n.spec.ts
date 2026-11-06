// F11 · Localization and accessibility — API E2E (docs/specs/02-f11-localization-accessibility.md)
// Screen journeys: e2e/mobile/f11-i18n/.
import { checkCatalogues, domainMessages, flatten, serverCatalogues } from '../../packages/i18n-keys/src/index.ts';
// The app's screen catalogues. Playwright loads apps/mobile as CommonJS, so these files (no runtime imports) are read
// directly and combined with the shared labels the same way apps/mobile/src/i18n/resources.ts does.
import { en } from '../../apps/mobile/src/i18n/locales/en.ts';
import { ur } from '../../apps/mobile/src/i18n/locales/ur.ts';
import { urLatn } from '../../apps/mobile/src/i18n/locales/ur-Latn.ts';
import { expect, test } from './support/fixtures';

const appCatalogues = {
  en: { ...en, domain: domainMessages('en') },
  ur: { ...ur, domain: domainMessages('ur') },
  'ur-Latn': { ...urLatn, domain: domainMessages('ur-Latn') },
};

test.describe('F11 · Localization and accessibility', { tag: '@F11' }, () => {
  test('F11-AC4 (US-047) the language preference is stored on the account', async ({ signIn }) => {
    // As teacher.a1 set language ur; sign out; sign in from a new context → profile language ur.
    const first = await signIn('teacher.a1');
    const patched = await first.api.patch('/me', { data: { preferredLocale: 'ur' } });
    expect(patched.status()).toBe(200);
    expect((await patched.json()).preferredLocale).toBe('ur');
    expect((await first.api.post('/auth/sign-out')).status()).toBe(204);

    // signIn opens a new request context: no cookies, nothing shared with the first session.
    const second = await signIn('teacher.a1');
    const me = await second.api.get('/me');
    expect(me.status()).toBe(200);
    expect((await me.json()).preferredLocale).toBe('ur');
  });

  test.fixme('F11-AC6 (US-048) a status saved in Urdu is stored as the canonical value', async () => {
    // Needs Daily Entry (F05, spec 09): no route stores a recitation status before it.
    // Save NOT_REMEMBERED with Accept-Language ur and again with en; both stored values are NOT_REMEMBERED.
  });

  test.fixme('F11-AC10 (US-050) Arabic text in PDF and Excel exports is unchanged', async () => {
    // Needs PDF export (F13, spec 16) and Excel export (F14, spec 14).
    // Export a report containing an Arabic Surah name to PDF and Excel;
    // extract text from both files; the Arabic string equals the stored value.
  });

  test('F11-AC11 (US-047) every message key exists in en, ur, and ur-Latn', async () => {
    // Load the app and server catalogues (packages/i18n-keys); every key has a non-empty value in all three locales.
    // Includes validation, empty-state, PDF, Excel, and push keys.
    for (const [name, catalogues] of Object.entries({ app: appCatalogues, server: serverCatalogues })) {
      expect(checkCatalogues(catalogues), name).toEqual([]);
    }
    // Validation and empty-state messages are among the checked keys. PDF, Excel, and push keys join the server
    // catalogue with F13, F14, and F16 and are checked by the same call.
    const app = flatten(appCatalogues.en);
    expect(app['fields.REQUIRED']).toBeTruthy();
    expect(app['accounts.empty']).toBeTruthy();
  });

  test('F11-AC11 (US-047) every error code the API returns has a message in every app locale', async ({ anon }) => {
    // The app localizes server errors by code; a refusal from the running API must have a message in each locale.
    const refusal = await anon.post('/auth/sign-in', { data: { loginId: 'no-such-user', password: 'Not-The-Password-1' } });
    const { error } = await refusal.json();
    for (const locale of ['en', 'ur', 'ur-Latn'] as const) {
      expect(flatten(appCatalogues[locale])[`errors.${error.code}`], locale).toBeTruthy();
    }
  });
});

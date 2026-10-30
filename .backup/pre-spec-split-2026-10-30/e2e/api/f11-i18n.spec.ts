// F11 · Localization and accessibility — API E2E (docs/specs/F11-localization-accessibility.md)
// Screen journeys: e2e/mobile/f11-i18n/.
import { test } from './support/fixtures';

test.describe('F11 · Localization and accessibility', { tag: '@F11' }, () => {
  test.fixme('F11-AC4 (US-047) the language preference is stored on the account', async () => {
    // As teacher.a1 set language ur; sign out; sign in from a new context → profile language ur.
  });

  test.fixme('F11-AC6 (US-048) a status saved in Urdu is stored as the canonical value', async () => {
    // Save NOT_REMEMBERED with Accept-Language ur and again with en; both stored values are NOT_REMEMBERED.
  });

  test.fixme('F11-AC10 (US-050) Arabic text in PDF and Excel exports is unchanged', async () => {
    // Export a report containing an Arabic Surah name to PDF and Excel;
    // extract text from both files; the Arabic string equals the stored value.
  });

  test.fixme('F11-AC11 (US-047) every message key exists in en, ur, and ur-Latn', async () => {
    // Load the app and server catalogues (packages/i18n-keys); every key has a non-empty value in all three locales.
    // Includes validation, empty-state, PDF, Excel, and push keys.
  });
});

// Messages the server renders: email now; PDF, Excel, and push labels are added here by F13, F14, and F16
// (ARCHITECTURE.md §14). Each key exists in all three locales (F11-AC11). Western digits (FR-I18N-009).
// Wording awaits glossary approval (DEC-B39).
import type { Locale } from '@hifz/contracts';
import { fill, lookup, onceLogger, type Catalogues, type MessageTree } from './catalogue.ts';
import { domainMessages } from './labels.ts';

const en = {
  email: {
    resetOtp: {
      subject: 'HifzAmanah: password reset code',
      text: 'Your HifzAmanah password reset code is {otp}. It expires in {minutes} minutes. If you did not ask for it, you can ignore this email.',
    },
  },
} satisfies MessageTree;

type ServerMessages = typeof en;

const ur: ServerMessages = {
  email: {
    resetOtp: {
      subject: 'HifzAmanah: پاس ورڈ ری سیٹ کوڈ',
      // The code is held left to right inside the Urdu sentence.
      text: 'آپ کا HifzAmanah پاس ورڈ ری سیٹ کوڈ ⁦{otp}⁩ ہے۔ یہ {minutes} منٹ میں ختم ہو جائے گا۔ اگر آپ نے یہ درخواست نہیں کی تو اس ای میل کو نظر انداز کریں۔',
    },
  },
};

const urLatn: ServerMessages = {
  email: {
    resetOtp: {
      subject: 'HifzAmanah: password reset code',
      text: 'Aap ka HifzAmanah password reset code {otp} hai. Yeh {minutes} minute mein khatam ho jaye ga. Agar aap ne yeh darkhwast nahin ki to is email ko nazar andaz karein.',
    },
  },
};

/** Server catalogues, including the canonical-value labels used in PDF, Excel, and push. */
export const serverCatalogues: Catalogues = {
  en: { ...en, domain: domainMessages('en') },
  ur: { ...ur, domain: domainMessages('ur') },
  'ur-Latn': { ...urLatn, domain: domainMessages('ur-Latn') },
};

const logMissing = onceLogger((message) => console.warn(message));

/** A server message in the recipient's language; a missing translation falls back to English and is logged once. */
export function serverMessage(locale: Locale, key: string, params?: Readonly<Record<string, string | number>>): string {
  return fill(lookup(serverCatalogues, locale, key, logMissing), params);
}

// Password-reset email in all three locales (FR-I18N, AGENTS.md §8). Western digits (DEC-B38).
// TODO(F11): move these strings into packages/i18n-keys once the catalogue exists; wording awaits the
// glossary approval (DEC-B39).
import type { Locale } from '@hifz/contracts';

export function resetOtpEmail(locale: Locale, otp: string): { subject: string; text: string } {
  switch (locale) {
    case 'ur':
      return {
        subject: 'HifzAmanah: پاس ورڈ ری سیٹ کوڈ',
        text: `آپ کا HifzAmanah پاس ورڈ ری سیٹ کوڈ ⁦${otp}⁩ ہے۔ یہ 10 منٹ میں ختم ہو جائے گا۔ اگر آپ نے یہ درخواست نہیں کی تو اس ای میل کو نظر انداز کریں۔`,
      };
    case 'ur-Latn':
      return {
        subject: 'HifzAmanah: password reset code',
        text: `Aap ka HifzAmanah password reset code ${otp} hai. Yeh 10 minute mein khatam ho jaye ga. Agar aap ne yeh darkhwast nahin ki to is email ko nazar andaz karein.`,
      };
    case 'en':
      return {
        subject: 'HifzAmanah: password reset code',
        text: `Your HifzAmanah password reset code is ${otp}. It expires in 10 minutes. If you did not ask for it, you can ignore this email.`,
      };
  }
}

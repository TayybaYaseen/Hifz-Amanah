// Password-reset email in the account's language (FR-I18N, AGENTS.md §8). The wording lives in the shared server
// catalogue (packages/i18n-keys), where every key is checked in all three locales (F11-AC11).
import type { Locale } from '@hifz/contracts';
import { serverMessage } from '@hifz/i18n-keys';
import { OTP_TTL_MS } from './rules.ts';

export function resetOtpEmail(locale: Locale, otp: string): { subject: string; text: string } {
  const minutes = OTP_TTL_MS / 60_000;
  return {
    subject: serverMessage(locale, 'email.resetOtp.subject'),
    text: serverMessage(locale, 'email.resetOtp.text', { otp, minutes }),
  };
}

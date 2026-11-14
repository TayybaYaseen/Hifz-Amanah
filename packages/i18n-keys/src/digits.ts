// Numbers and dates for display. Every language shows Western digits 0–9, including Urdu (FR-I18N-009, DEC-B38).
// Stored values are never changed; these only format them.
import type { Locale } from '@hifz/contracts';

/** Arabic-Indic (U+0660…) and Extended Arabic-Indic / Urdu (U+06F0…) digits → 0–9. */
export function toWesternDigits(text: string): string {
  return text.replace(/[٠-٩۰-۹]/g, (d) => String((d.codePointAt(0)! - (d >= '۰' ? 0x06f0 : 0x0660)) % 10));
}

/**
 * The BCP 47 tag used for Intl formatting, always with the Latin numbering system. Roman Urdu has no CLDR data of
 * its own; Gregorian month names in Roman Urdu are the English ones, so it formats as English (Pakistan).
 */
export function intlTag(locale: Locale): string {
  return locale === 'ur' ? 'ur-PK-u-nu-latn' : 'en-PK-u-nu-latn';
}

/** Integers and exact decimals as given, grouped for the locale, in Western digits. */
export function formatNumber(locale: Locale, value: number): string {
  return toWesternDigits(new Intl.NumberFormat(intlTag(locale), { maximumFractionDigits: 20 }).format(value));
}

/**
 * A calendar date, e.g. a `report_date` of "2026-11-06". It is a date, not an instant, so it is formatted in UTC and
 * never shifts by the device's timezone.
 */
export function formatCalendarDate(locale: Locale, isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  return toWesternDigits(new Intl.DateTimeFormat(intlTag(locale), { dateStyle: 'medium', timeZone: 'UTC' }).format(date));
}

/** The time of an instant, in `timeZone` if given (reports pass the organization's), else the device's. */
export function formatTime(locale: Locale, instant: Date | string, timeZone?: string): string {
  const date = typeof instant === 'string' ? new Date(instant) : instant;
  const options: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', ...(timeZone ? { timeZone } : {}) };
  return toWesternDigits(new Intl.DateTimeFormat(intlTag(locale), options).format(date));
}

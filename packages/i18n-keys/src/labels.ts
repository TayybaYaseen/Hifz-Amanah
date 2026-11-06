// Labels for canonical values. The value is what is stored; only its label changes with the language (FR-I18N-005,
// NFR-MNT-003, F11-AC6). Domain terms come from the glossary. Wording other than the approved Quality Rating Scale is
// a draft awaiting glossary approval (DEC-B39).
import {
  ATTENDANCE_STATUSES,
  PARA_FRACTIONS,
  QUALITY_SCORES,
  QUANTITY_UNITS,
  RECITATION_STATUSES,
  SECTIONS,
  type Locale,
} from '@hifz/contracts';
import type { MessageTree } from './catalogue.ts';
import { term } from './glossary.ts';

/** The canonical values of each labelled group, in display order. */
export const VALUE_GROUPS = {
  section: SECTIONS,
  unit: QUANTITY_UNITS,
  fraction: PARA_FRACTIONS,
  recitationStatus: RECITATION_STATUSES,
  attendanceStatus: ATTENDANCE_STATUSES,
  quality: QUALITY_SCORES,
} as const;

export type ValueGroup = keyof typeof VALUE_GROUPS;
export type ValueOf<G extends ValueGroup> = (typeof VALUE_GROUPS)[G][number];

type GroupLabels = { [G in ValueGroup]: Record<`${ValueOf<G>}`, string> };

const glossaryLabels = (locale: Locale) => ({
  section: { SABAQ: term(locale, 'SABAQ'), SABQI: term(locale, 'SABQI'), MANZIL: term(locale, 'MANZIL') },
  fraction: { RUBU: term(locale, 'RUBU'), HALF: term(locale, 'HALF'), SALASAH: term(locale, 'SALASAH'), COMPLETE: term(locale, 'COMPLETE') },
});

const LABELS: Record<Locale, GroupLabels> = {
  en: {
    ...glossaryLabels('en'),
    unit: { PARA: term('en', 'PARA'), LINES: 'Lines', AYAT: 'Ayat', PAGES: 'Pages' },
    recitationStatus: {
      COMPLETED: 'Completed',
      PARTIAL: 'Partial',
      NOT_REMEMBERED: 'Not Remembered',
      ABSENT: 'Absent',
      NOT_ASSIGNED: 'Not Assigned',
      PENDING: 'Pending',
    },
    attendanceStatus: { PRESENT: 'Present', LATE: 'Late', HALF_DAY: 'Half day', LEAVE: 'Leave', ABSENT: 'Absent' },
    // Quality Rating Scale, approved (FR-ATT-009). Lower is better.
    quality: { 1: 'Excellent', 2: 'Good', 3: 'Average', 4: 'Needs Improvement', 5: 'Weak' },
  },
  ur: {
    ...glossaryLabels('ur'),
    unit: { PARA: term('ur', 'PARA'), LINES: 'سطریں', AYAT: 'آیات', PAGES: 'صفحات' },
    recitationStatus: {
      COMPLETED: 'مکمل',
      PARTIAL: 'جزوی',
      NOT_REMEMBERED: 'یاد نہیں',
      ABSENT: 'غیر حاضر',
      NOT_ASSIGNED: 'دیا نہیں گیا',
      PENDING: 'باقی',
    },
    attendanceStatus: { PRESENT: 'حاضر', LATE: 'تاخیر', HALF_DAY: 'آدھا دن', LEAVE: 'رخصت', ABSENT: 'غیر حاضر' },
    quality: { 1: 'ممتاز', 2: 'اچھا', 3: 'اوسط', 4: 'مزید محنت کی ضرورت', 5: 'کمزور' },
  },
  'ur-Latn': {
    ...glossaryLabels('ur-Latn'),
    unit: { PARA: term('ur-Latn', 'PARA'), LINES: 'Satrein', AYAT: 'Ayaat', PAGES: 'Safhaat' },
    recitationStatus: {
      COMPLETED: 'Mukammal',
      PARTIAL: 'Juzvi',
      NOT_REMEMBERED: 'Yaad nahin',
      ABSENT: 'Ghair haazir',
      NOT_ASSIGNED: 'Diya nahin gaya',
      PENDING: 'Baqi',
    },
    attendanceStatus: { PRESENT: 'Haazir', LATE: 'Takheer', HALF_DAY: 'Aadha din', LEAVE: 'Rukhsat', ABSENT: 'Ghair haazir' },
    quality: { 1: 'Mumtaz', 2: 'Achha', 3: 'Ausat', 4: 'Mazeed mehnat ki zaroorat', 5: 'Kamzor' },
  },
};

/** The localized label of a canonical value. */
export function labelOf<G extends ValueGroup>(locale: Locale, group: G, value: ValueOf<G>): string {
  return (LABELS[locale][group] as Record<string, string>)[String(value)]!;
}

/**
 * The choices a picker offers: canonical values in a fixed order, each with its label. The values are identical in
 * every language, so what is saved never depends on the language it was entered in (F11-AC6).
 */
export function optionsOf<G extends ValueGroup>(locale: Locale, group: G): { value: ValueOf<G>; label: string }[] {
  return (VALUE_GROUPS[group] as readonly ValueOf<G>[]).map((value) => ({ value, label: labelOf(locale, group, value) }));
}

/** A quality score as number and label, e.g. "1 · Excellent" (FR-ATT-009), Western digits in every language. */
export function qualityDisplay(locale: Locale, score: ValueOf<'quality'>): string {
  return `${score} · ${labelOf(locale, 'quality', score)}`;
}

/** The labels as a catalogue subtree (`domain.recitationStatus.NOT_REMEMBERED`), for the app's i18n resources. */
export function domainMessages(locale: Locale): MessageTree {
  return LABELS[locale] as unknown as MessageTree;
}

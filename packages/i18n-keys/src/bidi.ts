// Bidirectional text (FR-I18N-006, FR-I18N-007, ARCHITECTURE.md §14). Isolation marks are added around text, never
// inside it, and no character of the text itself is changed, so Quranic Arabic stays exactly as stored.

/** U+2068 FIRST STRONG ISOLATE: the run takes the direction of its first strong character. */
export const FSI = '⁨';
/** U+2066 LEFT-TO-RIGHT ISOLATE. */
export const LRI = '⁦';
/** U+2067 RIGHT-TO-LEFT ISOLATE. */
export const RLI = '⁧';
/** U+2069 POP DIRECTIONAL ISOLATE. */
export const PDI = '⁩';

const MARKS = new RegExp(`[${FSI}${LRI}${RLI}${PDI}]`, 'g');

/**
 * Isolates user text (a name, a madrasa, a Surah) inside a sentence of either direction, so the punctuation around
 * it stays where it belongs (F11 edge case: an Urdu name in the English interface).
 */
export function isolate(text: string): string {
  return `${FSI}${text}${PDI}`;
}

/** Keeps a machine string (a number range, a code, a User ID) left to right, also inside Urdu text. */
export function isolateLtr(text: string): string {
  return `${LRI}${text}${PDI}`;
}

/** Removes only the isolation marks this module adds. */
export function stripIsolation(text: string): string {
  return text.replace(MARKS, '');
}

/**
 * A Surah reference such as "البقرة 2:255–260", readable in English and Urdu sentences (F11-AC9, AC-I18N-06).
 * The Surah name is the stored value, untouched. The numbers are held left to right: in a right-to-left run the
 * dash between two numbers would otherwise resolve right to left and show "260–2:255".
 */
export function surahRange(surahName: string, surahNumber: number, fromAyah: number, toAyah?: number): string {
  const ayat = toAyah === undefined || toAyah === fromAyah ? `${fromAyah}` : `${fromAyah}–${toAyah}`;
  return isolate(`${surahName} ${isolateLtr(`${surahNumber}:${ayat}`)}`);
}

// What QuranText renders (FR-I18N-006, F11-AC8). Plain TypeScript, tested with Vitest. The stored value is never
// translated, transliterated, normalized, or trimmed, and the interface language plays no part in it.
import { isolate } from '@hifz/i18n-keys';

/**
 * Standalone, the stored value itself. Inline inside a sentence of either direction, the same value wrapped in
 * isolation marks, so it keeps its own direction (FR-I18N-007).
 */
export function quranTextContent(stored: string, inline: boolean): string {
  return inline ? isolate(stored) : stored;
}

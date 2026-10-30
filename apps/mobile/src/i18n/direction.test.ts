// F11 · Localization and accessibility — unit: direction and bidi helpers (docs/specs/02-f11-localization-accessibility/)
import { describe, it } from 'vitest';

describe('F11 · direction', () => {
  it.todo('F11-AC1 (US-047) en is left to right (AC-I18N-01)');
  it.todo('F11-AC2 (US-048) ur is right to left (AC-I18N-02)');
  it.todo('F11-AC3 (US-049) ur-Latn is left to right (AC-I18N-03)');
});

describe('F11 · bidi', () => {
  it.todo('F11-AC9 (US-050) "البقرة 2:255–260" is isolated so it reads correctly in English and Urdu sentences (AC-I18N-06)');
  it.todo('F11-AC8 (US-050) Arabic text passes through unchanged in every locale');
});

describe('F11 · fallback', () => {
  it.todo('F11 unit: an unsupported device locale falls back to a supported locale');
});

// F06 · Quran portions — unit: quantity type (docs/specs/07-f06-quran-portions-metadata/)
import { describe, it } from 'vitest';

describe('F06 · presets', () => {
  it.todo('F06-AC10 (US-027) Salasah is stored as 3/4 Para and displayed as "Salasah (3/4 Para)" (AC-QTY-01)');
  it.todo('F06-AC11 (US-027) Rubu, Half, and Complete are stored exactly as 1/4, 1/2, and 1 Para');
  it.todo('F06-AC8 (US-026) LINES quantities are whole numbers');
});

describe('F06 · remaining', () => {
  it.todo('F06-AC9 (US-026) 10 lines assigned, 6 completed → 4 lines remaining (AC-QTY-02)');
  it.todo('F06-AC12 (US-027) 3/4 Para assigned, 1/2 completed → 1/4 Para remaining (AC-QTY-03)');
  it.todo('F06-AC14 (US-027) completed greater than assigned is rejected (AC-QTY-05)');
  it.todo('F06 property: remaining = max(0, assigned − completed) for any same-unit pair');
  it.todo('F06 property: quantities are exact rationals; no float is ever produced');
});

describe('F06 · totals', () => {
  it.todo('F06-AC13 (US-027) LINES and PARA totals are returned separately and never added (AC-QTY-04)');
  it.todo('F06 unit: comparing or subtracting different units throws');
});

describe('Decision review 2026-10-30 (SRS §17)', () => {
  it.todo('F06-AC16 (US-027) extra work is a separate Extra portion; completed never exceeds assigned');
  it.todo('F06-AC17 (US-026) Lines, Ayat, and Pages are whole numbers only');
});

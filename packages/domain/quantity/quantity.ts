// F06 · The quantity type (FR-QTY-001…006, FR-QTY-009, BR-3, BR-4, BR-5; ARCHITECTURE.md §6.2; US-026, US-027).
// Pure rules, no I/O.
//
// A quantity is `(unit, numerator, denominator)` with integer parts. Nothing in this file produces or accepts a
// floating-point amount, and nothing converts between units: lines and Para fractions are never added, compared, or
// subtracted (FR-QTY-004). Any future conversion needs an approved ADR.

export const QUANTITY_UNITS = ['PARA', 'LINES', 'AYAT', 'PAGES'] as const;
export type QuantityUnit = (typeof QUANTITY_UNITS)[number];

export interface Quantity {
  unit: QuantityUnit;
  numerator: number;
  denominator: number;
}

/** The Para presets and their exact fractions (FR-QTY-001, BR-3: Salasah is exactly 3/4). */
export const PARA_PRESETS = {
  RUBU: { numerator: 1, denominator: 4 },
  HALF: { numerator: 1, denominator: 2 },
  SALASAH: { numerator: 3, denominator: 4 },
  COMPLETE: { numerator: 1, denominator: 1 },
} as const;
export type ParaPreset = keyof typeof PARA_PRESETS;
export const PARA_PRESET_KEYS = Object.keys(PARA_PRESETS) as ParaPreset[];

/** Para amounts are whole quarters in the MVP (ARCHITECTURE.md §6.2: denominator 4). */
export const PARA_QUARTERS = 4;

/** Thrown when two quantities of different units meet in one operation (FR-QTY-004). */
export class UnitMismatchError extends Error {
  readonly left: QuantityUnit;
  readonly right: QuantityUnit;
  constructor(left: QuantityUnit, right: QuantityUnit) {
    super(`Cannot combine ${left} with ${right}: quantities of different units are never added or compared`);
    this.name = 'UnitMismatchError';
    this.left = left;
    this.right = right;
  }
}

/** Thrown when a value is not an exact quantity (a float, a negative, a zero denominator, an unknown unit). */
export class InvalidQuantityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidQuantityError';
  }
}

const gcd = (a: number, b: number): number => {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) [x, y] = [y, x % y];
  return x;
};

const isUnit = (u: unknown): u is QuantityUnit => typeof u === 'string' && (QUANTITY_UNITS as readonly string[]).includes(u);

/**
 * Builds a reduced quantity. Numerator and denominator must be safe integers, the numerator ≥ 0 and the
 * denominator > 0. `LINES`, `AYAT`, and `PAGES` must reduce to whole numbers (FR-QTY-009).
 */
export function quantity(unit: QuantityUnit, numerator: number, denominator = 1): Quantity {
  if (!isUnit(unit)) throw new InvalidQuantityError(`Unknown unit ${String(unit)}`);
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator)) {
    throw new InvalidQuantityError('Quantity parts must be integers; decimals are never accepted');
  }
  if (denominator <= 0) throw new InvalidQuantityError('The denominator must be positive');
  if (numerator < 0) throw new InvalidQuantityError('A quantity is never negative');
  const g = gcd(numerator, denominator) || 1;
  const q: Quantity = { unit, numerator: numerator / g, denominator: denominator / g };
  if (unit !== 'PARA' && q.denominator !== 1) {
    throw new InvalidQuantityError(`${unit} quantities are whole numbers`);
  }
  return q;
}

/** A whole-number quantity in lines, Ayat, or pages (FR-QTY-009). */
export const whole = (unit: Exclude<QuantityUnit, 'PARA'>, n: number): Quantity => quantity(unit, n, 1);

/** A Para preset as an exact fraction (F06-AC10, AC11). */
export const preset = (key: ParaPreset): Quantity => quantity('PARA', PARA_PRESETS[key].numerator, PARA_PRESETS[key].denominator);

/** The preset a Para quantity equals, if any: 3/4 → SALASAH. */
export function presetOf(q: Quantity): ParaPreset | null {
  if (q.unit !== 'PARA') return null;
  const n = quantity(q.unit, q.numerator, q.denominator);
  return PARA_PRESET_KEYS.find((k) => PARA_PRESETS[k].numerator === n.numerator && PARA_PRESETS[k].denominator === n.denominator) ?? null;
}

/** True when the value is a well-formed quantity (used before trusting stored or client data). */
export function isQuantity(value: unknown): value is Quantity {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (!isUnit(v.unit) || typeof v.numerator !== 'number' || typeof v.denominator !== 'number') return false;
  try {
    quantity(v.unit, v.numerator, v.denominator);
    return true;
  } catch {
    return false;
  }
}

const sameUnit = (a: Quantity, b: Quantity): void => {
  if (a.unit !== b.unit) throw new UnitMismatchError(a.unit, b.unit);
};

/** −1, 0, or 1. Same unit only; integer cross-multiplication, no division. */
export function compare(a: Quantity, b: Quantity): -1 | 0 | 1 {
  sameUnit(a, b);
  const l = a.numerator * b.denominator;
  const r = b.numerator * a.denominator;
  return l < r ? -1 : l > r ? 1 : 0;
}

export const equals = (a: Quantity, b: Quantity): boolean => compare(a, b) === 0;

/** a + b, same unit only. */
export function add(a: Quantity, b: Quantity): Quantity {
  sameUnit(a, b);
  return quantity(a.unit, a.numerator * b.denominator + b.numerator * a.denominator, a.denominator * b.denominator);
}

/** max(0, a − b), same unit only. */
export function subtractFloor(a: Quantity, b: Quantity): Quantity {
  sameUnit(a, b);
  const n = a.numerator * b.denominator - b.numerator * a.denominator;
  return quantity(a.unit, Math.max(0, n), a.denominator * b.denominator);
}

/**
 * Remaining work on one portion: `max(0, assigned − completed)` (FR-QTY-005, BR-5). The two quantities must be the
 * same portion's and share a unit; a missing completed amount is unknown, so there is no remaining to report
 * (FR-QTY-008: missing data is never read as zero).
 */
export function remaining(assigned: Quantity, completed: Quantity | null): Quantity | null {
  if (completed === null) return null;
  return subtractFloor(assigned, completed);
}

/** The zero of a unit. */
export const zero = (unit: QuantityUnit): Quantity => quantity(unit, 0, 1);

/**
 * Totals grouped by unit, never across units (F06-AC13, AC-QTY-04). The result lists only units that occur, in
 * canonical unit order.
 */
export function totalsByUnit(quantities: readonly Quantity[]): Quantity[] {
  const sums = new Map<QuantityUnit, Quantity>();
  for (const q of quantities) {
    const prev = sums.get(q.unit);
    sums.set(q.unit, prev ? add(prev, q) : quantity(q.unit, q.numerator, q.denominator));
  }
  return QUANTITY_UNITS.flatMap((u) => {
    const s = sums.get(u);
    return s ? [s] : [];
  });
}

/** "3/4", "1", "10" — the canonical fraction text; labels such as "Salasah" are localized by the UI. */
export function fractionText(q: Quantity): string {
  const n = quantity(q.unit, q.numerator, q.denominator);
  return n.denominator === 1 ? String(n.numerator) : `${n.numerator}/${n.denominator}`;
}

/**
 * Parses what a user typed into a whole-number field. "2.5", "1e1", "-3", and "" are rejected (F06-AC17); only
 * ASCII digits are accepted, so a stray decimal separator never becomes a number.
 */
export function parseWhole(text: string): number | null {
  const t = text.trim();
  if (!/^\d{1,6}$/.test(t)) return null;
  return Number(t);
}

/**
 * Para values allowed in the MVP: whole quarters from 0 to 1 (an assigned amount must be > 0; a completed amount may
 * be 0, e.g. NOT_REMEMBERED). Anything else, like 1/3 or 5/4, is refused.
 */
export function isParaQuarter(q: Quantity): boolean {
  if (q.unit !== 'PARA') return false;
  return (PARA_QUARTERS % q.denominator === 0) && q.numerator * (PARA_QUARTERS / q.denominator) <= PARA_QUARTERS;
}

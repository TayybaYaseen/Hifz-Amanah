// Units by section (FR-QTY-010, FR-SAB-003, FR-SAB-009, FR-SAB-010, FR-QTY-006, FR-QTY-009; ADR-014;
// ARCHITECTURE.md §6.2). The same rule validates lesson portions, Extra portions, homework portions, sync operations,
// and imported rows, on the device and on the server.
//
// Sabaq is measured in lines over one Surah's Ayat range and never offers Para presets. Sabqi and Manzil keep their
// Para-based quantities. A Sabaq quantity in any other unit is refused for correction, never converted (FR-SAB-010).
import { compare, isParaQuarter, type Quantity, type QuantityUnit, QUANTITY_UNITS } from './quantity.ts';

export const SECTIONS = ['SABAQ', 'SABQI', 'MANZIL'] as const;
export type Section = (typeof SECTIONS)[number];

export interface SectionRules {
  allowedUnits: readonly QuantityUnit[];
  /** Para presets (Rubu, Half, Salasah, Complete) are offered. */
  offersParaPresets: boolean;
  /** A Surah/Ayat range is required. */
  requiresRange: boolean;
  /** The range must stay in one Surah. */
  singleSurah: boolean;
  /** The portion records Total Lines. */
  hasTotalLines: boolean;
  /** The Teacher picks the Para (Sabaq derives it from the range, FR-SAB-001). */
  paraEntered: boolean;
}

const SABAQ: SectionRules = { allowedUnits: ['LINES'], offersParaPresets: false, requiresRange: true, singleSurah: true, hasTotalLines: true, paraEntered: false };
const REVISION: SectionRules = { allowedUnits: QUANTITY_UNITS, offersParaPresets: true, requiresRange: false, singleSurah: false, hasTotalLines: false, paraEntered: true };

export const rulesFor = (section: Section): SectionRules => (section === 'SABAQ' ? SABAQ : REVISION);

export type QuantityField = 'totalLines' | 'assigned' | 'completed';

export type QuantityIssue =
  | { field: QuantityField; code: 'REQUIRED' }
  /** The unit is not allowed in this section (a Para preset on Sabaq, F05-AC20). */
  | { field: QuantityField; code: 'UNIT_NOT_ALLOWED'; allowed: readonly QuantityUnit[] }
  /** Completed is in a different unit from assigned on the same portion (FR-QTY-004). */
  | { field: 'completed'; code: 'UNIT_MISMATCH' }
  /** Not a whole number, or a Para amount that is not a whole quarter (F06-AC17, FR-QTY-009). */
  | { field: QuantityField; code: 'NOT_WHOLE' | 'NOT_A_PRESET' }
  /** Total or Assigned Lines must be positive; an assigned Para amount must be more than 0. */
  | { field: QuantityField; code: 'NOT_POSITIVE' }
  /** Assigned Lines above Total Lines (FR-SAB-009). */
  | { field: 'assigned'; code: 'ABOVE_TOTAL'; max: number }
  /** Completed above assigned; extra work is a separate Extra portion (FR-QTY-006, F06-AC14, AC16). */
  | { field: 'completed'; code: 'ABOVE_ASSIGNED' };

export interface PortionQuantities {
  /** Sabaq only: lines the range covers, a positive whole number. */
  totalLines?: number | null;
  assigned: Quantity | null;
  completed: Quantity | null;
}

const allowedIssue = (field: QuantityField, q: Quantity, rules: SectionRules): QuantityIssue[] =>
  rules.allowedUnits.includes(q.unit) ? [] : [{ field, code: 'UNIT_NOT_ALLOWED', allowed: rules.allowedUnits }];

const shapeIssue = (field: QuantityField, q: Quantity): QuantityIssue[] => {
  if (!Number.isSafeInteger(q.numerator) || !Number.isSafeInteger(q.denominator) || q.denominator <= 0 || q.numerator < 0) {
    return [{ field, code: 'NOT_WHOLE' }];
  }
  if (q.unit === 'PARA') return isParaQuarter(q) ? [] : [{ field, code: 'NOT_A_PRESET' }];
  return q.numerator % q.denominator === 0 ? [] : [{ field, code: 'NOT_WHOLE' }];
};

const isZero = (q: Quantity): boolean => q.numerator === 0;

/**
 * Validates a portion's quantities for its section. `assigned` null means the caller's status needs none (e.g.
 * NOT_ASSIGNED); whether it is required is decided by the hifz status rules, not here.
 */
export function validateQuantities(section: Section, p: PortionQuantities): QuantityIssue[] {
  const rules = rulesFor(section);
  const issues: QuantityIssue[] = [];

  if (rules.hasTotalLines) {
    const t = p.totalLines;
    if (t === null || t === undefined) issues.push({ field: 'totalLines', code: 'REQUIRED' });
    else if (!Number.isSafeInteger(t)) issues.push({ field: 'totalLines', code: 'NOT_WHOLE' });
    else if (t <= 0) issues.push({ field: 'totalLines', code: 'NOT_POSITIVE' });
  }

  let assignedOk = false;
  if (p.assigned) {
    const before = issues.length;
    issues.push(...allowedIssue('assigned', p.assigned, rules));
    if (issues.length === before) issues.push(...shapeIssue('assigned', p.assigned));
    if (issues.length === before && isZero(p.assigned)) issues.push({ field: 'assigned', code: 'NOT_POSITIVE' });
    if (issues.length === before && rules.hasTotalLines && Number.isSafeInteger(p.totalLines) && (p.totalLines as number) > 0) {
      if (p.assigned.numerator > (p.totalLines as number) * p.assigned.denominator) {
        issues.push({ field: 'assigned', code: 'ABOVE_TOTAL', max: p.totalLines as number });
      }
    }
    assignedOk = issues.length === before;
  }

  if (p.completed) {
    const before = issues.length;
    issues.push(...allowedIssue('completed', p.completed, rules));
    if (issues.length === before) issues.push(...shapeIssue('completed', p.completed));
    if (issues.length === before && p.assigned && p.assigned.unit !== p.completed.unit) issues.push({ field: 'completed', code: 'UNIT_MISMATCH' });
    if (issues.length === before && assignedOk && p.assigned && compare(p.completed, p.assigned) > 0) {
      issues.push({ field: 'completed', code: 'ABOVE_ASSIGNED' });
    }
  }
  return issues;
}

/** Sabaq: Assigned Lines defaults to Total Lines once the range is set (F05-AC21). */
export const defaultAssignedLines = (totalLines: number | null): number | null => totalLines;

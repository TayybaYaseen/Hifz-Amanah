// F12 · Field classes for conflict detection (FR-SYNC-008, NFR-OFF-006, F12-AC13; plan Q4, Q5).
// Every field is MEANINGFUL unless the entity lists it as SAFE_MERGE with a documented merge rule.
// Coupled meaningful fields (e.g. attempt status + completed quantity + quality + mistakes) form a group that
// conflicts as a unit, so a merge can never produce a combination nobody entered.

/** Merge rules for safe fields. The only documented one: the server's value wins (display order, F12-AC13). */
export const SAFE_MERGE_RULES = ['SERVER_WINS'] as const;
export type SafeMergeRule = (typeof SAFE_MERGE_RULES)[number];

export type FieldClass = { kind: 'MEANINGFUL' } | { kind: 'SAFE_MERGE'; rule: SafeMergeRule };

export type FieldValues = Readonly<Record<string, unknown>>;

export interface EntityFieldSpec {
  readonly entity: string;
  /** Safe-merge fields and their rules; every other field is MEANINGFUL. */
  readonly safe: Readonly<Record<string, SafeMergeRule>>;
  /** Coupled meaningful field groups; each field is in at most one group. */
  readonly groups: readonly (readonly string[])[];
}

export class FieldSpecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FieldSpecError';
  }
}

/** Declares and validates an entity's field classes. */
export function defineFieldSpec(spec: {
  entity: string;
  safe?: Readonly<Record<string, SafeMergeRule>>;
  groups?: readonly (readonly string[])[];
}): EntityFieldSpec {
  const safe = { ...(spec.safe ?? {}) };
  const groups = (spec.groups ?? []).map((g) => [...g]);
  const seen = new Set<string>();
  for (const group of groups) {
    if (group.length < 2) throw new FieldSpecError(`${spec.entity}: a coupled group needs at least two fields`);
    for (const field of group) {
      if (Object.hasOwn(safe, field)) {
        throw new FieldSpecError(`${spec.entity}: safe-merge field "${field}" cannot be in a coupled group`);
      }
      if (seen.has(field)) throw new FieldSpecError(`${spec.entity}: field "${field}" is in more than one group`);
      seen.add(field);
    }
  }
  for (const [field, rule] of Object.entries(safe)) {
    if (!(SAFE_MERGE_RULES as readonly string[]).includes(rule)) {
      throw new FieldSpecError(`${spec.entity}: unknown merge rule "${rule}" for "${field}"`);
    }
  }
  return Object.freeze({ entity: spec.entity, safe: Object.freeze(safe), groups: Object.freeze(groups.map((g) => Object.freeze(g))) });
}

/** A field not listed as safe is MEANINGFUL (plan Q4). */
export function classOf(spec: EntityFieldSpec, field: string): FieldClass {
  const rule = Object.hasOwn(spec.safe, field) ? spec.safe[field] : undefined;
  return rule === undefined ? { kind: 'MEANINGFUL' } : { kind: 'SAFE_MERGE', rule };
}

/** The coupled group holding `field`, or just the field itself. */
export function groupOf(spec: EntityFieldSpec, field: string): readonly string[] {
  return spec.groups.find((g) => g.includes(field)) ?? [field];
}

/**
 * Field classes of the test-only `sync_probe` entity (plan §7, Q1): `label` and `status` meaningful,
 * `position` safe (display order). Registered by the API only in test builds.
 */
export const SYNC_PROBE_FIELDS = defineFieldSpec({ entity: 'sync_probe', safe: { position: 'SERVER_WINS' } });

/** Structural equality for JSON-like field values (objects compared by keys, arrays by order). */
export function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => valuesEqual(item, b[i]));
  }
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  const ka = Object.keys(ra).filter((k) => ra[k] !== undefined);
  const kb = Object.keys(rb).filter((k) => rb[k] !== undefined);
  return ka.length === kb.length && ka.every((k) => Object.hasOwn(rb, k) && valuesEqual(ra[k], rb[k]));
}

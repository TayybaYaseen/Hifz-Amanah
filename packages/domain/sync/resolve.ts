// F12 · Conflict resolution (FR-SYNC-008, F12-AC12; DEC-B18; plan §4, §5, Q5, Q6).
// The author of the conflicting change, or an Owner/Admin, picks a version or merges per field. The result is a
// new change the server applies (and audits) on top of the current row; the conflict is then closed.
// Authorization is the API's job; this module is pure.
import { groupOf, missingGroupMembers, valuesEqual, type EntityFieldSpec, type FieldValues } from './fields.ts';

export const CONFLICT_CHOICES = ['KEEP_DEVICE', 'KEEP_SERVER', 'MERGE'] as const;
export type ConflictChoiceKind = (typeof CONFLICT_CHOICES)[number];

export const FIELD_PICKS = ['DEVICE', 'SERVER'] as const;
export type FieldPick = (typeof FIELD_PICKS)[number];

export type ConflictChoice =
  | { choice: 'KEEP_DEVICE' }
  | { choice: 'KEEP_SERVER' }
  | { choice: 'MERGE'; picks: Readonly<Record<string, FieldPick>> };

export const CONFLICT_STATUSES = ['OPEN', 'RESOLVED'] as const;
export type ConflictStatus = (typeof CONFLICT_STATUSES)[number];

export interface ConflictRecord {
  status: ConflictStatus;
  /** Server row version when the conflict was opened. */
  serverVersion: number;
  /** The operation's fields (device version). */
  device: FieldValues;
  /** The server row when the conflict was opened. */
  server: FieldValues;
  conflictFields: readonly string[];
}

export interface FieldDiff {
  field: string;
  device: unknown;
  server: unknown;
  /** True when the field is part of the detected conflict. */
  conflicting: boolean;
  /** The coupled group the field belongs to (picked as a unit), or null. */
  group: string[] | null;
}

export type ResolveErrorCode =
  | 'CONFLICT_CLOSED'
  | 'CONFLICT_STALE'
  /** MERGE without a pick for a field that differs. */
  | 'PICK_MISSING'
  /** A pick for a field that is not in the comparison. */
  | 'PICK_UNKNOWN_FIELD'
  /** Different picks inside one coupled group. */
  | 'PICK_SPLITS_GROUP'
  /** Picks given with KEEP_DEVICE or KEEP_SERVER. */
  | 'PICKS_NOT_ALLOWED'
  /** The device version holds only part of a coupled group (refused at push since F12 review; never resolvable). */
  | 'GROUP_INCOMPLETE';

export type ResolveResult =
  | {
      ok: true;
      /** Fields to write on top of the current server row; empty when the server version is kept as is. */
      changes: Record<string, unknown>;
      /** The per-field outcome actually applied, for the audit entry (field names only, no values). */
      picks: Record<string, FieldPick>;
    }
  | { ok: false; code: ResolveErrorCode; fields: string[] };

/**
 * The fields compared side by side: every field the device set whose value differs from the server's, plus every
 * conflicting field, each widened to its whole coupled group (a group is shown and picked as a unit, plan Q5).
 */
function comparedFields(conflict: ConflictRecord, spec: EntityFieldSpec): string[] {
  const fields = new Set<string>();
  const add = (field: string) => {
    for (const member of groupOf(spec, field)) fields.add(member);
  };
  for (const field of Object.keys(conflict.device)) {
    if (!valuesEqual(conflict.device[field], conflict.server[field])) add(field);
  }
  for (const field of conflict.conflictFields) add(field);
  return [...fields];
}

/**
 * The fields shown side by side (see {@link comparedFields}). A conflicting field the device did not set is
 * shown so the user sees the server's change; it keeps the server value.
 */
export function fieldDiff(conflict: ConflictRecord, spec: EntityFieldSpec): FieldDiff[] {
  const conflicting = new Set(conflict.conflictFields);
  return comparedFields(conflict, spec).map((field) => {
    const group = groupOf(spec, field);
    return {
      field,
      device: conflict.device[field],
      server: conflict.server[field],
      conflicting: conflicting.has(field),
      group: group.length > 1 ? [...group] : null,
    };
  });
}

/**
 * Fields the user picks for: the compared fields the device set. Coupled groups are whole on the device (the API
 * refuses partial groups at push), so a group is always pickable as a unit and KEEP_DEVICE writes the device's
 * whole group, never a mix with the server's other members.
 */
function pickable(conflict: ConflictRecord, spec: EntityFieldSpec): string[] {
  return comparedFields(conflict, spec).filter((f) => Object.hasOwn(conflict.device, f));
}

/**
 * Resolves an OPEN conflict. `currentServerVersion` is the row's version now; if the server row changed since
 * the conflict was opened the choice was made against stale data and is refused (CONFLICT_STALE).
 */
export function resolve(
  conflict: ConflictRecord,
  choice: ConflictChoice,
  options: { spec: EntityFieldSpec; currentServerVersion: number },
): ResolveResult {
  if (conflict.status !== 'OPEN') return { ok: false, code: 'CONFLICT_CLOSED', fields: [] };
  if (options.currentServerVersion !== conflict.serverVersion) return { ok: false, code: 'CONFLICT_STALE', fields: [] };

  // Defensive: a device version holding part of a coupled group can never be resolved per field (plan Q5).
  const incomplete = missingGroupMembers(options.spec, Object.keys(conflict.device));
  if (incomplete.length > 0) return { ok: false, code: 'GROUP_INCOMPLETE', fields: incomplete };

  const fields = pickable(conflict, options.spec);
  let picks: Record<string, FieldPick>;
  if (choice.choice === 'MERGE') {
    const given = choice.picks;
    const unknown = Object.keys(given).filter((f) => !fields.includes(f));
    if (unknown.length > 0) return { ok: false, code: 'PICK_UNKNOWN_FIELD', fields: unknown };
    const missing = fields.filter((f) => !Object.hasOwn(given, f));
    if (missing.length > 0) return { ok: false, code: 'PICK_MISSING', fields: missing };
    for (const field of fields) {
      const members = groupOf(options.spec, field).filter((m) => fields.includes(m));
      if (members.some((m) => given[m] !== given[field])) return { ok: false, code: 'PICK_SPLITS_GROUP', fields: members };
    }
    picks = Object.fromEntries(fields.map((f) => [f, given[f]!]));
  } else {
    if ('picks' in choice) return { ok: false, code: 'PICKS_NOT_ALLOWED', fields: [] };
    const pick: FieldPick = choice.choice === 'KEEP_DEVICE' ? 'DEVICE' : 'SERVER';
    picks = Object.fromEntries(fields.map((f) => [f, pick]));
  }

  const changes: Record<string, unknown> = {};
  for (const field of fields) if (picks[field] === 'DEVICE') changes[field] = conflict.device[field];
  return { ok: true, changes, picks };
}

/** The conflict after a successful resolution (pure; the API persists it with who and when). */
export function closeConflict<C extends ConflictRecord>(conflict: C): C & { status: 'RESOLVED' } {
  if (conflict.status !== 'OPEN') throw new Error('closeConflict: conflict is not open');
  return { ...conflict, status: 'RESOLVED' };
}

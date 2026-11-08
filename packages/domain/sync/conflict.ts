// F12 · Conflict detection (FR-SYNC-008, NFR-OFF-006, F12-AC11, F12-AC13; plan §4, Q4, Q5).
// Never last-write-wins for meaningful fields: when the device and the server both changed the same meaningful
// field (or coupled group) to different values from one base version, the result is a conflict holding both
// versions, and nothing is applied. Safe fields merge by their documented rule; disjoint changes apply on top
// of the current server row.
import { classOf, groupOf, valuesEqual, type EntityFieldSpec, type FieldValues } from './fields.ts';

export interface DetectInput {
  /**
   * The fields the operation sets (UPDATE `fields`). Without `base`, every key counts as changed on the device;
   * with `base`, only keys whose value differs from it.
   */
  local: FieldValues;
  /** The current server row (at least every field in `local` and in `serverChanged`). */
  server: FieldValues;
  /**
   * Fields changed on the server since the operation's base version (from the change log). When omitted it is
   * computed from `base`: every field whose server value differs from the base value.
   */
  serverChanged?: readonly string[];
  /** The row as the device last saw it at the base version, when the caller has it. */
  base?: FieldValues;
}

export type DetectResult =
  | {
      kind: 'APPLY';
      /** Fields to write on top of the current server row (only those that differ from it). */
      apply: Record<string, unknown>;
      /** Safe fields both sides changed differently: the documented rule kept the server value. */
      serverWins: string[];
    }
  | {
      kind: 'CONFLICT';
      /** Every meaningful field in conflict; a coupled group is listed whole. */
      conflictFields: string[];
      /** The conflicting groups (single fields appear as one-element groups). */
      groups: string[][];
      /** The device version (the operation's fields) and the server version, both kept unchanged. */
      device: Record<string, unknown>;
      server: Record<string, unknown>;
    };

function changedFromBase(values: FieldValues, base: FieldValues, keys: Iterable<string>): Set<string> {
  const changed = new Set<string>();
  for (const key of keys) if (!valuesEqual(values[key], base[key])) changed.add(key);
  return changed;
}

/** Detects a conflict between an UPDATE operation and the server row it was based on (plan §4). */
export function detect(input: DetectInput, spec: EntityFieldSpec): DetectResult {
  const { local, server, base } = input;
  const localKeys = Object.keys(local);
  const localChanged = base ? changedFromBase(local, base, localKeys) : new Set(localKeys);

  let serverChanged: Set<string>;
  if (input.serverChanged) serverChanged = new Set(input.serverChanged);
  else if (base) serverChanged = changedFromBase(server, base, new Set([...Object.keys(base), ...Object.keys(server)]));
  else throw new TypeError('detect: give serverChanged or base');

  const conflictGroups: string[][] = [];
  const checkedGroups = new Set<readonly string[]>();
  const serverWins: string[] = [];

  for (const field of localChanged) {
    const fieldClass = classOf(spec, field);
    if (fieldClass.kind === 'SAFE_MERGE') {
      if (serverChanged.has(field) && !valuesEqual(local[field], server[field])) serverWins.push(field);
      continue;
    }
    const group = groupOf(spec, field);
    // groupOf returns the same array for every member of a declared group, so each group is checked once.
    if (checkedGroups.has(group)) continue;
    checkedGroups.add(group);
    // If the device writes nothing new in the group, applying it leaves the server's group as is.
    const writes = group.some((member) => localChanged.has(member) && !valuesEqual(local[member], server[member]));
    // Otherwise the group is safe only if every field the server changed in it was also set by the device to
    // the same value; else the merged group would be a combination nobody entered.
    const clash =
      writes &&
      group.some((member) => serverChanged.has(member) && !(localChanged.has(member) && valuesEqual(local[member], server[member])));
    if (clash) conflictGroups.push([...group]);
  }

  if (conflictGroups.length > 0) {
    return {
      kind: 'CONFLICT',
      conflictFields: conflictGroups.flat(),
      groups: conflictGroups,
      device: { ...local },
      server: { ...server },
    };
  }

  const apply: Record<string, unknown> = {};
  for (const field of localChanged) {
    if (serverWins.includes(field)) continue;
    if (!valuesEqual(local[field], server[field])) apply[field] = local[field];
  }
  return { kind: 'APPLY', apply, serverWins };
}

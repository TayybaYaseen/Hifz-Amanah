// Operation hash for idempotency (F12-AC5, NFR-OFF-004). A replay must carry the same operation: the hash
// covers everything the operation means. `seq` is left out because it only orders a batch.
import { createHash } from 'node:crypto';
import type { SyncOp } from '@hifz/contracts';

/** JSON with object keys sorted, so equal values hash equally whatever the key order. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((k) => record[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(record[k])}`).join(',')}}`;
}

export function opHash(op: SyncOp): Buffer {
  const { seq: _seq, ...meaning } = op;
  return createHash('sha256').update(canonicalJson(meaning)).digest();
}

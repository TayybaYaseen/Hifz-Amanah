// change_log appends and the commit-order guarantee the pull cursor relies on (F12 plan §5 "Commit-order gap").
//
// A BIGSERIAL value is taken when a row is inserted, not when its transaction commits, so with concurrent writers
// seq 11 could commit before seq 10. A pull that read up to 11 would then skip 10 for ever. We prevent that with
// a per-organization transaction-level advisory lock: every write transaction of a tenant's sync tables takes
// `lockOrganization` before its first change_log (or scope_changes) insert, and holds it until COMMIT/ROLLBACK.
// So within one organization at most one transaction can hold an uncommitted change_log row, and it always has
// the highest seq. Every snapshot therefore sees a gap-free prefix of the organization's log, and a cursor may
// safely advance to the highest seq it has seen. (Pulls filter by organization, so the global sequence
// interleaving between organizations does not matter.) The sync service takes the lock at the start of each
// write transaction, before any row lock, so lock order is always "organization, then rows": no deadlock.
// The cost is that sync writes of one madrasa are serialized; each is a single short per-op transaction.
import { sql } from 'kysely';
import type { Tx } from '../../platform/db.ts';
import type { ScopeKeys } from './handler.ts';

/** Advisory-lock namespace for the change_log append ("SYNC" in ASCII). */
const LOCK_NAMESPACE = 0x53594e43;

/** Serializes this organization's change_log appends until the transaction ends (re-entrant). */
export async function lockOrganization(tx: Tx, organizationId: string): Promise<void> {
  await sql`SELECT pg_advisory_xact_lock(${LOCK_NAMESPACE}::integer, hashtext(${organizationId}))`.execute(tx);
}

export interface ChangeEntry {
  organizationId: string;
  entity: string;
  entityId: string;
  rowVersion: number;
  op: 'UPSERT' | 'REMOVE';
  changedFields: readonly string[];
  keys: ScopeKeys;
  actorUserId: string | null;
  opId: string | null;
  at: Date;
}

/** Appends one change. Call inside a tenant transaction (platform/tenant.ts). */
export async function appendChange(tx: Tx, entry: ChangeEntry): Promise<void> {
  await lockOrganization(tx, entry.organizationId);
  await tx
    .insertInto('change_log')
    .values({
      organization_id: entry.organizationId,
      entity: entry.entity,
      entity_id: entry.entityId,
      row_version: entry.rowVersion,
      op: entry.op,
      changed_fields: [...entry.changedFields],
      student_id: entry.keys.studentId,
      class_id: entry.keys.classId,
      actor_user_id: entry.actorUserId,
      op_id: entry.opId,
      at: entry.at,
    })
    .execute();
}

/**
 * Records that a user's scope changed (class assigned or unassigned), so their next pull answers
 * `scopeReset: true` (NFR-OFF-010, decision Q8). Called by the roster module (F03) in the same transaction as
 * the assignment change, which must be a tenant transaction.
 */
export async function recordScopeChange(tx: Tx, organizationId: string, userId: string, at: Date): Promise<void> {
  await lockOrganization(tx, organizationId);
  await tx.insertInto('scope_changes').values({ organization_id: organizationId, user_id: userId, at }).execute();
}

/** Fields changed on the server since `baseVersion` (exclusive), from the change log. */
export async function changedSince(tx: Tx, organizationId: string, entity: string, entityId: string, baseVersion: number): Promise<string[]> {
  const rows = await tx
    .selectFrom('change_log')
    .select('changed_fields')
    .where('organization_id', '=', organizationId)
    .where('entity', '=', entity)
    .where('entity_id', '=', entityId)
    .where('row_version', '>', baseVersion)
    .execute();
  return [...new Set(rows.flatMap((r) => r.changed_fields))];
}

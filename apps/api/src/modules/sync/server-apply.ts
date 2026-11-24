// Server-side writes through an entity handler, without a device operation (F14 Excel import; ARCHITECTURE §11
// "Audit + change_log → report recalculation"). The owning module's handler validates (prepareCreate/prepareUpdate),
// writes, and audits exactly as for a synced edit, and the change is appended to change_log with no op_id, so devices
// pull it and a device that later edits the row from an older base gets an explicit conflict (never last-write-wins,
// NFR-OFF-006). Runs inside the caller's tenant transaction; the caller decides what a refusal means.
import type { Tx } from '../../platform/db.ts';
import type { Actor } from '../identity/auth-service.ts';
import { appendChange, lockOrganization } from './change-log.ts';
import type { AppliedChange, SyncHandler } from './handler.ts';

export type ServerApply =
  | { ok: true; entityId: string; rowVersion: number; fields: Record<string, unknown>; notices: readonly string[] }
  | { ok: false; issues: Record<string, string> }
  | { ok: false; notFound: true }
  | { ok: false; conflictOpen: true };

/** Creates a row with a server-chosen UUIDv7 `entityId`, as the caller. */
export async function serverCreate(tx: Tx, handler: SyncHandler, actor: Actor, entityId: string, fields: Record<string, unknown>, at: Date): Promise<ServerApply> {
  await lockOrganization(tx, actor.organizationId);
  const prepared = handler.prepareCreate ? await handler.prepareCreate(tx, actor, fields) : { ok: true as const, fields };
  if (!prepared.ok) return 'notFound' in prepared ? { ok: false, notFound: true } : { ok: false, issues: prepared.issues };
  const keys = await handler.keysForCreate(prepared.fields, { tx, organizationId: actor.organizationId });
  if (!(await handler.insert(tx, actor.organizationId, entityId, prepared.fields, { actorUserId: actor.userId, at }))) throw new Error(`${handler.entity}: id already used`);
  await appendChange(tx, { organizationId: actor.organizationId, entity: handler.entity, entityId, rowVersion: 1, op: 'UPSERT', changedFields: Object.keys(prepared.fields), keys, actorUserId: actor.userId, opId: null, at });
  const change: AppliedChange = { actor, opType: 'CREATE', opId: null, entityId, rowVersion: 1, changes: prepared.fields, at };
  await handler.audit?.(tx, change);
  const notices = (await handler.afterApply?.(tx, change)) ?? [];
  return { ok: true, entityId, rowVersion: 1, fields: prepared.fields, notices };
}

/** Corrects an existing row (an audited correction, FR-DAY-009). A row with an open sync conflict is not touched. */
export async function serverUpdate(tx: Tx, handler: SyncHandler, actor: Actor, entityId: string, changes: Record<string, unknown>, at: Date): Promise<ServerApply> {
  const org = actor.organizationId;
  await lockOrganization(tx, org);
  const row = await handler.load(tx, org, entityId, { forUpdate: true });
  if (!row) return { ok: false, notFound: true };
  const open = await tx
    .selectFrom('sync_conflicts')
    .select('id')
    .where('organization_id', '=', org)
    .where('entity', '=', handler.entity)
    .where('entity_id', '=', entityId)
    .where('status', '=', 'OPEN')
    .executeTakeFirst();
  if (open) return { ok: false, conflictOpen: true };
  const parsed = handler.updateSchema.safeParse(changes);
  if (!parsed.success) return { ok: false, issues: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.') || '_', 'INVALID'])) };
  const prepared = handler.prepareUpdate ? await handler.prepareUpdate(tx, actor, row, parsed.data) : { ok: true as const, fields: parsed.data };
  if (!prepared.ok) return 'notFound' in prepared ? { ok: false, notFound: true } : { ok: false, issues: prepared.issues };
  if (Object.keys(prepared.fields).length === 0) return { ok: true, entityId, rowVersion: row.rowVersion, fields: {}, notices: [] };
  const next = row.rowVersion + 1;
  await handler.update(tx, org, entityId, prepared.fields, next, { actorUserId: actor.userId, at });
  await appendChange(tx, { organizationId: org, entity: handler.entity, entityId, rowVersion: next, op: 'UPSERT', changedFields: Object.keys(prepared.fields), keys: row.keys, actorUserId: actor.userId, opId: null, at });
  const change: AppliedChange = { actor, opType: 'UPDATE', opId: null, entityId, rowVersion: next, changes: prepared.fields, at };
  await handler.audit?.(tx, change);
  const notices = (await handler.afterApply?.(tx, change)) ?? [];
  return { ok: true, entityId, rowVersion: next, fields: prepared.fields, notices };
}

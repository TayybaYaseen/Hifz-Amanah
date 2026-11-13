// Push and pull (US-051…US-053; NFR-OFF-004…010, FR-SYNC-006…009; F12-AC3, AC4, AC5, AC7, AC11, AC13, AC14,
// AC15; plan docs/handover/F12-plan.md §5). Conflict rules live in @hifz/domain/sync; this service persists.
//
// Per operation, in ONE tenant transaction (platform/tenant.ts; RLS on): lock the organization's change log,
// look the op up in sync_ops (idempotent replay), probe the op_id claim (another madrasa's op_id = OP_ID_REUSED),
// check dependencies, authorize (out of scope = NOT_FOUND),
// validate (handler's strict schema), compare base_version via change_log + `detect`, then either apply
// (bump row_version, append change_log, audit, store the result) or store a conflict and the result.
// Each op commits on its own, in request order, so one rejected op never rolls back the others.
import { v7 as uuidv7 } from 'uuid';
import { sql, type Insertable } from 'kysely';
import { PullQuery, PushRequest, type Change, type OpResult, type PullResponse, type PushResponse, type SyncOp } from '@hifz/contracts';
import { detect, missingGroupMembers } from '@hifz/domain/sync';
import type { Clock } from '../../platform/clock.ts';
import type { Db, SyncOpsTable, Tx } from '../../platform/db.ts';
import { AppError, issueFields, parse, sanitizeError } from '../../platform/errors.ts';
import { withTenant } from '../../platform/tenant.ts';
import { projectFor } from '../access/projection.ts';
import { accessActor, authorize } from '../access/policy.ts';
import type { Actor } from '../identity/auth-service.ts';
import { appendChange, changedSince, lockOrganization } from './change-log.ts';
import type { SyncControl } from './control-state.ts';
import { decodeCursor, encodeCursor, maxSeq, type Cursor } from './cursor.ts';
import type { AppliedChange, SyncHandler, SyncRegistry, SyncRow } from './handler.ts';
import { opHash } from './op-hash.ts';
import { inScope, type SyncScope, type SyncScopeProvider } from './scope.ts';

export interface SyncDeps {
  db: Db;
  clock: Clock;
  registry: SyncRegistry;
  scopes: SyncScopeProvider;
  control: SyncControl;
}

/**
 * Sync is offline daily work: the roles that may write daily records (Owner, Admin, Teacher). Students and
 * Parents are online-only and read-only (AGENTS.md §7), so they are FORBIDDEN here.
 */
export function requireSyncRole(actor: Actor): void {
  if (authorize(accessActor(actor), 'daily.write') === 'FORBIDDEN') throw new AppError('FORBIDDEN');
}

/** Whole-request refusal for an app older than the server's minimum protocol (F12-AC15). */
export function requireProtocol(control: SyncControl, version: unknown): void {
  if (typeof version === 'number' && Number.isInteger(version) && version < control.minProtocolVersion()) {
    throw new AppError('UPGRADE_REQUIRED');
  }
}

/** Thrown inside the op transaction when its op_id is already stored by another organization: roll back. */
class OpIdTakenElsewhere extends Error {}

const rejected = (opId: string, code: Extract<OpResult, { status: 'REJECTED' }>['code'], fields?: Record<string, string>): OpResult =>
  fields ? { opId, status: 'REJECTED', code, fields } : { opId, status: 'REJECTED', code };

type StoredStatus = SyncOpsTable['status'];

const num = (value: string | number): number => Number(value);

export class SyncService {
  private readonly d: SyncDeps;

  constructor(deps: SyncDeps) {
    this.d = deps;
  }

  // ---------- POST /sync/push ----------

  async push(actor: Actor, body: unknown): Promise<PushResponse> {
    requireSyncRole(actor);
    requireProtocol(this.d.control, typeof body === 'object' && body !== null ? (body as { protocolVersion?: unknown }).protocolVersion : undefined);
    const request = parse(PushRequest, body);
    const scope = await this.d.scopes.scopeFor(actor);
    const results: OpResult[] = [];
    for (const op of request.ops) results.push(await this.pushOne(actor, request.deviceId, op, scope));
    return { results, serverTime: this.d.clock.now().toISOString() };
  }

  private async pushOne(actor: Actor, deviceId: string, op: SyncOp, scope: SyncScope): Promise<OpResult> {
    const hash = opHash(op);
    const org = actor.organizationId;
    const claim = (status: StoredStatus, result: OpResult | Record<string, never>) => ({
      op_id: op.opId,
      organization_id: org,
      user_id: actor.userId,
      device_id: deviceId,
      entity: op.entity,
      entity_id: op.entityId,
      op_hash: hash,
      // Orders this device's own edits in the conflict check (review N1); not part of the hash, not unique.
      seq: op.seq,
      status,
      result: JSON.stringify(result),
      received_at: this.d.clock.now(),
    });
    try {
      return await withTenant(this.d.db, org, async (tx) => {
        // Organization first, then rows: one lock order for every sync write (see change-log.ts).
        await lockOrganization(tx, org);
        const stored = await tx.selectFrom('sync_ops').select(['user_id', 'op_hash', 'result']).where('op_id', '=', op.opId).executeTakeFirst();
        if (stored) {
          // Replay: same user, same payload → the stored result, nothing written (F12-AC5). Anything else
          // reveals nothing about the original operation.
          if (stored.user_id === actor.userId && Buffer.from(stored.op_hash).equals(hash)) return stored.result as OpResult;
          return rejected(op.opId, 'OP_ID_REUSED');
        }
        // An op_id stored by another organization is invisible under RLS but still unique: probe the claim before
        // anything else, so such an op is OP_ID_REUSED and never DEPENDENCY_PENDING or CONFLICT_OPEN. The probe is
        // rolled back (RETRY results are never stored); the real claim below re-checks it for concurrent pushes.
        if (await this.opIdTakenElsewhere(tx, claim('REJECTED', {}))) return rejected(op.opId, 'OP_ID_REUSED');
        const dependencies = await this.dependencyState(tx, actor, op);
        if (dependencies === 'PENDING') return { opId: op.opId, status: 'RETRY', code: 'DEPENDENCY_PENDING' };

        const result = dependencies === 'GONE' ? rejected(op.opId, 'NOT_FOUND') : await this.decide(tx, actor, deviceId, op, scope);
        if (result.status === 'RETRY') return result;
        const claimed = await tx
          .insertInto('sync_ops')
          .values(claim(result.status, result))
          .onConflict((oc) => oc.column('op_id').doNothing())
          .returning('op_id')
          .executeTakeFirst();
        // The op_id was stored meanwhile by another organization (invisible under RLS): undo everything this op did.
        if (!claimed) throw new OpIdTakenElsewhere();
        return result;
      });
    } catch (error) {
      if (error instanceof OpIdTakenElsewhere) return rejected(op.opId, 'OP_ID_REUSED');
      throw sanitizeError(error);
    }
  }

  /** True when the op_id is already used by another organization's operation (inserts and rolls back). */
  private async opIdTakenElsewhere(tx: Tx, row: Insertable<SyncOpsTable>): Promise<boolean> {
    await sql`SAVEPOINT sync_op_claim`.execute(tx);
    const probe = await tx.insertInto('sync_ops').values(row).onConflict((oc) => oc.column('op_id').doNothing()).returning('op_id').executeTakeFirst();
    await sql`ROLLBACK TO SAVEPOINT sync_op_claim`.execute(tx);
    return !probe;
  }

  /**
   * An op waits until every op it depends on is settled for this user (F12-AC4): APPLIED, or a CONFLICT whose
   * conflict has since been RESOLVED; AND the dependency's record exists in this organization (review N8), loaded
   * through its handler in this tenant transaction. Not stored: RETRY DEPENDENCY_PENDING.
   *
   * F04 decision (F12 plan Q11 follow-up): a dependency that was a natural-key create-create collision (its result
   * or its conflict names a different, existing row) never creates the device's record id, so its dependents can
   * never apply. They are refused NOT_FOUND (stored, shown as failed on the device with nothing lost) instead of
   * waiting forever. Any other settled dependency without its record keeps the dependent waiting.
   */
  private async dependencyState(tx: Tx, actor: Actor, op: SyncOp): Promise<'READY' | 'PENDING' | 'GONE'> {
    if (op.dependsOn.length === 0) return 'READY';
    const settled = await tx
      .selectFrom('sync_ops')
      .select(['sync_ops.op_id', 'sync_ops.entity', 'sync_ops.entity_id', 'sync_ops.status', 'sync_ops.result'])
      .where('sync_ops.op_id', 'in', op.dependsOn)
      .where('sync_ops.user_id', '=', actor.userId)
      .where((eb) =>
        eb.or([
          eb('sync_ops.status', '=', 'APPLIED'),
          eb.and([
            eb('sync_ops.status', '=', 'CONFLICT'),
            eb.exists(
              eb
                .selectFrom('sync_conflicts')
                .select('sync_conflicts.id')
                .whereRef('sync_conflicts.op_id', '=', 'sync_ops.op_id')
                .where('sync_conflicts.organization_id', '=', actor.organizationId)
                .where('sync_conflicts.status', '=', 'RESOLVED'),
            ),
          ]),
        ]),
      )
      .execute();
    if (settled.length < op.dependsOn.length) return 'PENDING';
    let state: 'READY' | 'PENDING' | 'GONE' = 'READY';
    for (const dep of settled) {
      const handler = this.d.registry.get(dep.entity);
      if (!handler) return 'PENDING';
      if (await handler.load(tx, actor.organizationId, dep.entity_id, { forUpdate: false })) continue;
      if (!(await this.wasCollision(tx, actor.organizationId, dep))) return 'PENDING';
      state = 'GONE';
    }
    return state;
  }

  /** True when a settled CREATE landed on another existing row (natural-key collision, see collide()). */
  private async wasCollision(tx: Tx, organizationId: string, dep: { op_id: string; entity_id: string; status: string; result: unknown }): Promise<boolean> {
    if (dep.status === 'APPLIED') {
      const result = dep.result as { entityId?: unknown } | null;
      return typeof result?.entityId === 'string' && result.entityId !== dep.entity_id;
    }
    const conflict = await tx
      .selectFrom('sync_conflicts')
      .select('entity_id')
      .where('organization_id', '=', organizationId)
      .where('op_id', '=', dep.op_id)
      .executeTakeFirst();
    return conflict !== undefined && conflict.entity_id !== dep.entity_id;
  }

  private async decide(tx: Tx, actor: Actor, deviceId: string, op: SyncOp, scope: SyncScope): Promise<OpResult> {
    const handler = this.d.registry.get(op.entity);
    if (!handler) return rejected(op.opId, 'ENTITY_NOT_SUPPORTED');
    if (op.opType === 'COMMAND') {
      return handler.commands && handler.prepareCommand ? this.command(tx, actor, deviceId, op, handler, scope) : rejected(op.opId, 'VALIDATION', { opType: 'NOT_SUPPORTED' });
    }
    if (!handler.opTypes.includes(op.opType)) return rejected(op.opId, 'VALIDATION', { opType: 'NOT_SUPPORTED' });
    return op.opType === 'CREATE' ? this.create(tx, actor, op, handler, scope) : this.update(tx, actor, deviceId, op, handler, scope);
  }

  /** The APPLIED result, with the handler's notices when it has any (F08-AC14). */
  private async appliedResult(tx: Tx, op: SyncOp, handler: SyncHandler, change: AppliedChange): Promise<OpResult> {
    const notices = [...((await handler.afterApply?.(tx, change)) ?? [])];
    const result: OpResult = { opId: op.opId, status: 'APPLIED', rowVersion: change.rowVersion, entityId: change.entityId };
    return notices.length > 0 ? { ...result, notices } : result;
  }

  /** Stores an explicit conflict holding both versions (never last-write-wins, F12-AC11, NFR-OFF-006). */
  private async storeConflict(
    tx: Tx,
    actor: Actor,
    op: SyncOp,
    row: SyncRow,
    base: number | null,
    device: Record<string, unknown>,
    conflictFields: readonly string[],
    at: Date,
  ): Promise<OpResult> {
    const conflictId = uuidv7();
    await tx
      .insertInto('sync_conflicts')
      .values({
        id: conflictId,
        organization_id: actor.organizationId,
        entity: op.entity,
        entity_id: row.id,
        base_version: base,
        server_version: row.rowVersion,
        device_fields: JSON.stringify(device),
        server_fields: JSON.stringify(row.fields),
        conflict_fields: [...conflictFields],
        student_id: row.keys.studentId,
        class_id: row.keys.classId,
        caused_by_user_id: actor.userId,
        op_id: op.opId,
        status: 'OPEN',
        resolved_by: null,
        resolved_at: null,
        resolution: null,
        created_at: at,
      })
      .execute();
    return { opId: op.opId, status: 'CONFLICT', conflictId };
  }

  /**
   * A COMMAND on an existing row (F08: CONFIRM_HOMEWORK, FR-HW-017). Same guards as an UPDATE (scope, base version, one
   * open conflict per row); the handler decides whether it applies, is refused, or becomes a conflict.
   */
  private async command(tx: Tx, actor: Actor, deviceId: string, op: SyncOp, handler: SyncHandler, scope: SyncScope): Promise<OpResult> {
    const schema = op.command === undefined ? undefined : Object.hasOwn(handler.commands!, op.command) ? handler.commands![op.command] : undefined;
    if (!schema || op.command === undefined) return rejected(op.opId, 'VALIDATION', { command: 'NOT_SUPPORTED' });
    const parsed = schema.safeParse(op.fields);
    if (!parsed.success) return rejected(op.opId, 'VALIDATION', issueFields(parsed.error));
    const org = actor.organizationId;
    const row = await handler.load(tx, org, op.entityId, { forUpdate: true });
    if (!row || !inScope(scope, row.keys)) return rejected(op.opId, 'NOT_FOUND');
    if ((op.baseVersion ?? 0) > row.rowVersion) return rejected(op.opId, 'VALIDATION', { baseVersion: 'INVALID' });
    if (await this.openConflict(tx, org, op.entity, op.entityId)) return { opId: op.opId, status: 'RETRY', code: 'CONFLICT_OPEN' };
    const at = this.d.clock.now();
    const outcome = await handler.prepareCommand!(tx, actor, row, op.command, parsed.data, { opId: op.opId, deviceId, seq: op.seq, baseVersion: op.baseVersion });
    if (!outcome.ok) {
      if ('conflict' in outcome) return this.storeConflict(tx, actor, op, row, op.baseVersion, outcome.conflict.device, outcome.conflict.conflictFields, at);
      return 'notFound' in outcome ? rejected(op.opId, 'NOT_FOUND') : rejected(op.opId, 'VALIDATION', outcome.issues);
    }
    const changes = outcome.fields;
    if (Object.keys(changes).length === 0) return { opId: op.opId, status: 'APPLIED', rowVersion: row.rowVersion, entityId: op.entityId };
    const next = row.rowVersion + 1;
    await handler.update(tx, org, op.entityId, changes, next, { actorUserId: actor.userId, at });
    await appendChange(tx, {
      organizationId: org,
      entity: op.entity,
      entityId: op.entityId,
      rowVersion: next,
      op: 'UPSERT',
      changedFields: Object.keys(changes),
      keys: row.keys,
      actorUserId: actor.userId,
      opId: op.opId,
      at,
    });
    const change: AppliedChange = { actor, opType: 'COMMAND', command: op.command, opId: op.opId, entityId: op.entityId, rowVersion: next, changes, at };
    await handler.audit?.(tx, change);
    return this.appliedResult(tx, op, handler, change);
  }

  private async create(tx: Tx, actor: Actor, op: SyncOp, handler: SyncHandler, scope: SyncScope): Promise<OpResult> {
    const parsed = handler.createSchema.safeParse(op.fields);
    if (!parsed.success) return rejected(op.opId, 'VALIDATION', issueFields(parsed.error));
    const keys = await handler.keysForCreate(parsed.data, { tx, organizationId: actor.organizationId });
    if (!inScope(scope, keys)) return rejected(op.opId, 'NOT_FOUND');
    const prepared = handler.prepareCreate ? await handler.prepareCreate(tx, actor, parsed.data) : { ok: true as const, fields: parsed.data };
    if (!prepared.ok) return 'notFound' in prepared ? rejected(op.opId, 'NOT_FOUND') : rejected(op.opId, 'VALIDATION', prepared.issues);
    const fields = prepared.fields;
    const at = this.d.clock.now();
    // A replayed CREATE of the device's own row is an idempotent replay above; a different row already holding the
    // natural key is a create-create collision (F12 decision Q11), never last-write-wins.
    const duplicate = handler.findNaturalDuplicate ? await handler.findNaturalDuplicate(tx, actor.organizationId, fields) : null;
    if (duplicate && duplicate.id !== op.entityId) return this.collide(tx, actor, op, handler, duplicate, fields, scope, at);
    // The client's UUIDv7 stays the primary key (F12-AC3). An id used anywhere, in any madrasa, is refused
    // without detail.
    if (!(await handler.insert(tx, actor.organizationId, op.entityId, fields, { actorUserId: actor.userId, at }))) return rejected(op.opId, 'ID_TAKEN');
    await appendChange(tx, {
      organizationId: actor.organizationId,
      entity: op.entity,
      entityId: op.entityId,
      rowVersion: 1,
      op: 'UPSERT',
      changedFields: Object.keys(fields),
      keys,
      actorUserId: actor.userId,
      opId: op.opId,
      at,
    });
    const change: AppliedChange = { actor, opType: 'CREATE', opId: op.opId, entityId: op.entityId, rowVersion: 1, changes: fields, at };
    await handler.audit?.(tx, change);
    return this.appliedResult(tx, op, handler, change);
  }

  /**
   * Create-create on a natural key (F12 decision Q11; F04 attendance for one student and date). The device's row id is
   * never created. When the handler's collision fields equal the existing row's, the op is APPLIED as a no-op on that
   * row (its id is in the result). Otherwise a conflict on the existing row holds both versions; it is resolved in
   * Conflict Review like any other (KEEP_DEVICE writes the device's fields onto the existing row). Never
   * last-write-wins.
   */
  private async collide(
    tx: Tx,
    actor: Actor,
    op: SyncOp,
    handler: SyncHandler,
    existing: SyncRow,
    fields: Record<string, unknown>,
    scope: SyncScope,
    at: Date,
  ): Promise<OpResult> {
    if (!inScope(scope, existing.keys)) return rejected(op.opId, 'NOT_FOUND');
    if (await this.openConflict(tx, actor.organizationId, op.entity, existing.id)) return { opId: op.opId, status: 'RETRY', code: 'CONFLICT_OPEN' };
    const compared = handler.collisionFields ?? Object.keys(fields);
    const device = Object.fromEntries(compared.filter((f) => Object.hasOwn(fields, f)).map((f) => [f, fields[f]]));
    const outcome = detect({ local: device, server: existing.fields, serverChanged: compared }, handler.fieldSpec);
    if (outcome.kind !== 'CONFLICT') return { opId: op.opId, status: 'APPLIED', rowVersion: existing.rowVersion, entityId: existing.id };
    const conflictId = uuidv7();
    await tx
      .insertInto('sync_conflicts')
      .values({
        id: conflictId,
        organization_id: actor.organizationId,
        entity: op.entity,
        entity_id: existing.id,
        base_version: null,
        server_version: existing.rowVersion,
        device_fields: JSON.stringify(outcome.device),
        server_fields: JSON.stringify(existing.fields),
        conflict_fields: outcome.conflictFields,
        student_id: existing.keys.studentId,
        class_id: existing.keys.classId,
        caused_by_user_id: actor.userId,
        op_id: op.opId,
        status: 'OPEN',
        resolved_by: null,
        resolved_at: null,
        resolution: null,
        created_at: at,
      })
      .execute();
    return { opId: op.opId, status: 'CONFLICT', conflictId };
  }

  private async openConflict(tx: Tx, organizationId: string, entity: string, entityId: string): Promise<boolean> {
    const open = await tx
      .selectFrom('sync_conflicts')
      .select('id')
      .where('organization_id', '=', organizationId)
      .where('entity', '=', entity)
      .where('entity_id', '=', entityId)
      .where('status', '=', 'OPEN')
      .executeTakeFirst();
    return open !== undefined;
  }

  private async update(tx: Tx, actor: Actor, deviceId: string, op: SyncOp, handler: SyncHandler, scope: SyncScope): Promise<OpResult> {
    const parsed = handler.updateSchema.safeParse(op.fields);
    if (!parsed.success) return rejected(op.opId, 'VALIDATION', issueFields(parsed.error));
    // Coupled groups travel whole (decision Q5): a partial group could never be compared or resolved as a unit.
    const missing = missingGroupMembers(handler.fieldSpec, Object.keys(parsed.data));
    if (missing.length > 0) return rejected(op.opId, 'VALIDATION', Object.fromEntries(missing.map((field) => [field, 'GROUP_INCOMPLETE'])));
    const org = actor.organizationId;
    const row = await handler.load(tx, org, op.entityId, { forUpdate: true });
    if (!row || !inScope(scope, row.keys)) return rejected(op.opId, 'NOT_FOUND');
    const base = op.baseVersion ?? 0;
    if (base > row.rowVersion) return rejected(op.opId, 'VALIDATION', { baseVersion: 'INVALID' });

    // One open conflict per row (decision Q7): any further edit of the row, by anyone, waits as action required
    // until that conflict is resolved. RETRY is not stored, so the edit keeps its own fields on the device and is
    // sent again afterwards (it may then apply, or become its own explicit conflict). Never folded into the open
    // conflict, never dropped.
    if (await this.openConflict(tx, org, op.entity, op.entityId)) return { opId: op.opId, status: 'RETRY', code: 'CONFLICT_OPEN' };

    // Changes made since the base by OTHER users or devices; this device's own earlier edits are not a conflict.
    // An own edit from a LATER outbox seq that is already applied counts as a server change (review N1).
    const serverChanged =
      base === row.rowVersion ? [] : await changedSince(tx, org, op.entity, op.entityId, base, { userId: actor.userId, deviceId, seq: op.seq });
    const outcome = detect({ local: parsed.data, server: row.fields, serverChanged }, handler.fieldSpec);
    const at = this.d.clock.now();

    // Never last-write-wins: both versions are kept for explicit resolution (F12-AC11, NFR-OFF-006).
    if (outcome.kind === 'CONFLICT') return this.storeConflict(tx, actor, op, row, base, outcome.device, outcome.conflictFields, at);

    // Disjoint or safe-merge changes apply on top of the server row (F12-AC13); nothing new → no write.
    if (Object.keys(outcome.apply).length === 0) return { opId: op.opId, status: 'APPLIED', rowVersion: row.rowVersion, entityId: op.entityId };
    const prepared = handler.prepareUpdate ? await handler.prepareUpdate(tx, actor, row, outcome.apply) : { ok: true as const, fields: outcome.apply };
    if (!prepared.ok) return 'notFound' in prepared ? rejected(op.opId, 'NOT_FOUND') : rejected(op.opId, 'VALIDATION', prepared.issues);
    const changes = prepared.fields;
    const next = row.rowVersion + 1;
    await handler.update(tx, org, op.entityId, changes, next, { actorUserId: actor.userId, at });
    await appendChange(tx, {
      organizationId: org,
      entity: op.entity,
      entityId: op.entityId,
      rowVersion: next,
      op: 'UPSERT',
      changedFields: Object.keys(changes),
      keys: row.keys,
      actorUserId: actor.userId,
      opId: op.opId,
      at,
    });
    const change: AppliedChange = { actor, opType: 'UPDATE', opId: op.opId, entityId: op.entityId, rowVersion: next, changes, at };
    await handler.audit?.(tx, change);
    return this.appliedResult(tx, op, handler, change);
  }

  // ---------- GET /sync/pull ----------

  async pull(actor: Actor, query: unknown): Promise<PullResponse> {
    requireSyncRole(actor);
    const raw = typeof query === 'object' && query !== null ? (query as { protocolVersion?: unknown }).protocolVersion : undefined;
    requireProtocol(this.d.control, raw === undefined ? 1 : Number(raw));
    const q = parse(PullQuery, query);
    const cursor = q.cursor === undefined ? null : decodeCursor(q.cursor);
    const scope = await this.d.scopes.scopeFor(actor);
    const org = actor.organizationId;

    // REPEATABLE READ: the watermark, the scope check, and the page come from one snapshot.
    return withTenant(
      this.d.db,
      org,
      async (tx) => {
        // The head covers scope changes too (they draw from the same sequence), so a bootstrap started after a scope
        // change is not reset again by it.
        const { rows: heads } = await sql<{ seq: string | null }>`
          SELECT GREATEST(
            (SELECT max(seq) FROM change_log WHERE organization_id = ${org}),
            (SELECT max(seq) FROM scope_changes WHERE organization_id = ${org})
          )::text AS seq`.execute(tx);
        const head = heads[0]?.seq ?? '0';
        const serverTime = this.d.clock.now().toISOString();
        const boot = (): Cursor => ({ m: 'BOOT', w: head, a: '0' });

        if (cursor !== null) {
          // The caller's scope changed after this cursor: the device drops its synced rows and bootstraps again
          // (NFR-OFF-010, decision Q8).
          const since = cursor.m === 'BOOT' ? cursor.w : cursor.a;
          const reset = await tx
            .selectFrom('scope_changes')
            .select('seq')
            .where('organization_id', '=', org)
            .where('user_id', '=', actor.userId)
            .where('seq', '>', since)
            .executeTakeFirst();
          if (reset) return { changes: [], cursor: encodeCursor(boot()), hasMore: true, scopeReset: true, serverTime };
        }

        const position = cursor ?? boot();
        const visible = scopeFilter(scope);
        if (position.m === 'BOOT') {
          // Bootstrap: the latest change of each row up to the watermark, in seq order (paged).
          const { rows } = await sql<LogRow>`
            SELECT seq::text AS seq, entity, entity_id, row_version, op, student_id, class_id FROM (
              SELECT DISTINCT ON (entity, entity_id) seq, entity, entity_id, row_version, op, student_id, class_id
              FROM change_log
              WHERE organization_id = ${org} AND seq <= ${position.w}::bigint
              ORDER BY entity, entity_id, seq DESC
            ) latest
            WHERE seq > ${position.a}::bigint AND op = 'UPSERT' AND ${visible}
            ORDER BY seq
            LIMIT ${q.limit + 1}`.execute(tx);
          const page = rows.slice(0, q.limit);
          const more = rows.length > q.limit;
          const next: Cursor = more ? { m: 'BOOT', w: position.w, a: page.at(-1)!.seq } : { m: 'LOG', a: position.w };
          return {
            changes: await this.changesFor(tx, org, page, scope),
            cursor: encodeCursor(next),
            hasMore: more || BigInt(head) > BigInt(position.w),
            scopeReset: false,
            serverTime,
          };
        }

        const { rows } = await sql<LogRow>`
          SELECT seq::text AS seq, entity, entity_id, row_version, op, student_id, class_id
          FROM change_log
          WHERE organization_id = ${org} AND seq > ${position.a}::bigint AND ${visible}
          ORDER BY seq
          LIMIT ${q.limit + 1}`.execute(tx);
        const page = rows.slice(0, q.limit);
        const more = rows.length > q.limit;
        // With the per-organization append lock (change-log.ts) this snapshot holds a gap-free prefix of the log,
        // so when the page is not full the cursor may move to the head, past rows outside the caller's scope.
        const after = more ? page.at(-1)!.seq : maxSeq(position.a, head);
        return {
          changes: await this.changesFor(tx, org, page, scope),
          cursor: encodeCursor({ m: 'LOG', a: after }),
          hasMore: more,
          scopeReset: false,
          serverTime,
        };
      },
      { isolation: 'repeatable read' },
    );
  }

  /** Current rows for a page of log entries, newest change per row, projected for staff. */
  private async changesFor(tx: Tx, org: string, page: readonly LogRow[], scope: SyncScope): Promise<Change[]> {
    const latest = new Map<string, LogRow>();
    for (const row of page) {
      const key = `${row.entity}:${row.entity_id}`;
      latest.delete(key);
      latest.set(key, row);
    }
    const byEntity = new Map<string, string[]>();
    for (const row of latest.values()) byEntity.set(row.entity, [...(byEntity.get(row.entity) ?? []), row.entity_id]);
    const current = new Map<string, Awaited<ReturnType<SyncHandler['load']>>>();
    for (const [entity, ids] of byEntity) {
      const handler = this.d.registry.get(entity);
      if (!handler) continue;
      for (const row of await handler.loadMany(tx, org, ids)) current.set(`${entity}:${row.id}`, row);
    }

    const changes: Change[] = [];
    for (const [key, log] of latest) {
      const entity = log.entity as Change['entity'];
      if (!this.d.registry.get(entity)) continue;
      if (log.op === 'REMOVE') {
        changes.push({ entity, entityId: log.entity_id, rowVersion: num(log.row_version), op: 'REMOVE_FROM_DEVICE' });
        continue;
      }
      const row = current.get(key);
      if (!row) continue;
      if (!inScope(scope, row.keys)) {
        changes.push({ entity, entityId: row.id, rowVersion: row.rowVersion, op: 'REMOVE_FROM_DEVICE' });
        continue;
      }
      changes.push({ entity, entityId: row.id, rowVersion: row.rowVersion, op: 'UPSERT', fields: projectFor('STAFF', entity, row.fields) });
    }
    return changes;
  }
}

interface LogRow {
  seq: string;
  entity: string;
  entity_id: string;
  row_version: string | number;
  op: 'UPSERT' | 'REMOVE';
  student_id: string | null;
  class_id: string | null;
}

/** SQL for "this change_log row is in the caller's scope" (scope keys written at change time; F12-AC7). */
function scopeFilter(scope: SyncScope) {
  if (scope.kind === 'ORGANIZATION') return sql<boolean>`TRUE`;
  return sql<boolean>`(class_id = ANY(${[...scope.classIds]}::uuid[]) OR student_id = ANY(${[...scope.studentIds]}::uuid[]))`;
}

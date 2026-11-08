// Conflict review and resolution (US-054; FR-SYNC-008, DEC-B18; F12-AC11, AC12, AC17; plan §5 "Conflicts",
// decisions Q6, Q7). Resolution is an online request. Who may see and resolve a conflict (SRS §17.1 row
// "Resolve sync conflict"): any Owner or Admin of the madrasa, or the Teacher whose operation caused it while
// the record is still in their scope. Anyone else gets 404, even another Teacher assigned to the same student.
import {
  ConflictListQuery,
  ResolveConflictRequest,
  type ConflictDetail,
  type ConflictListResponse,
  type ResolveConflictResponse,
  type SyncEntity,
} from '@hifz/contracts';
import { fieldDiff, resolve, type ConflictChoice, type ConflictRecord } from '@hifz/domain/sync';
import type { Clock } from '../../platform/clock.ts';
import type { Db, Tx } from '../../platform/db.ts';
import { AppError, parse } from '../../platform/errors.ts';
import { withTenant } from '../../platform/tenant.ts';
import { accessActor, authorize } from '../access/policy.ts';
import { projectFor } from '../access/projection.ts';
import { recordAudit } from '../audit/audit.ts';
import type { Actor } from '../identity/auth-service.ts';
import { appendChange, lockOrganization } from './change-log.ts';
import type { SyncHandler, SyncRegistry, SyncRow } from './handler.ts';
import { inScope, type SyncScope, type SyncScopeProvider } from './scope.ts';
import { requireSyncRole } from './sync-service.ts';

export interface ConflictDeps {
  db: Db;
  clock: Clock;
  registry: SyncRegistry;
  scopes: SyncScopeProvider;
}

export const CONFLICT_PAGE_SIZE = 50;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ConflictRow {
  id: string;
  organization_id: string;
  entity: string;
  entity_id: string;
  base_version: string | number | null;
  server_version: string | number;
  device_fields: unknown;
  server_fields: unknown;
  conflict_fields: string[];
  student_id: string | null;
  class_id: string | null;
  caused_by_user_id: string;
  status: 'OPEN' | 'RESOLVED';
  created_at: Date;
  display_name: string;
}

const asFields = (value: unknown): Record<string, unknown> => (typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {});

export class ConflictService {
  private readonly d: ConflictDeps;

  constructor(deps: ConflictDeps) {
    this.d = deps;
  }

  /** Owner/Admin reach every conflict of the madrasa; a Teacher reaches only their own (SRS §17.1). */
  private reachesAll(actor: Actor): boolean {
    return authorize(accessActor(actor), 'conflict.resolve', { organizationId: actor.organizationId }) === 'ALLOW';
  }

  /** The 404-or-allow decision for one conflict, using the record's current scope keys for a Teacher. */
  private allowed(actor: Actor, conflict: ConflictRow, scope: SyncScope, row: SyncRow | null): boolean {
    const decision = authorize(accessActor(actor), 'conflict.resolve', { organizationId: conflict.organization_id, ownerUserId: conflict.caused_by_user_id });
    if (decision !== 'ALLOW') return false;
    if (this.reachesAll(actor)) return true;
    return row !== null && inScope(scope, row.keys);
  }

  private conflictQuery(tx: Tx, org: string) {
    return tx
      .selectFrom('sync_conflicts')
      .innerJoin('users', 'users.id', 'sync_conflicts.caused_by_user_id')
      .select([
        'sync_conflicts.id',
        'sync_conflicts.organization_id',
        'sync_conflicts.entity',
        'sync_conflicts.entity_id',
        'sync_conflicts.base_version',
        'sync_conflicts.server_version',
        'sync_conflicts.device_fields',
        'sync_conflicts.server_fields',
        'sync_conflicts.conflict_fields',
        'sync_conflicts.student_id',
        'sync_conflicts.class_id',
        'sync_conflicts.caused_by_user_id',
        'sync_conflicts.status',
        'sync_conflicts.created_at',
        'users.display_name',
      ])
      .where('sync_conflicts.organization_id', '=', org);
  }

  /** Loads one conflict the actor may see, with its handler and current row; 404 otherwise. */
  private async reachable(tx: Tx, actor: Actor, id: string, scope: SyncScope, forUpdate: boolean) {
    if (!UUID.test(id)) throw new AppError('NOT_FOUND');
    let query = this.conflictQuery(tx, actor.organizationId).where('sync_conflicts.id', '=', id);
    if (forUpdate) query = query.forUpdate('sync_conflicts');
    const conflict = (await query.executeTakeFirst()) as ConflictRow | undefined;
    if (!conflict) throw new AppError('NOT_FOUND');
    const handler = this.d.registry.get(conflict.entity);
    if (!handler) throw new AppError('NOT_FOUND');
    const row = await handler.load(tx, actor.organizationId, conflict.entity_id, { forUpdate });
    if (!this.allowed(actor, conflict, scope, row)) throw new AppError('NOT_FOUND');
    return { conflict, handler, row };
  }

  // ---------- GET /sync/conflicts ----------

  async list(actor: Actor, query: unknown): Promise<ConflictListResponse> {
    requireSyncRole(actor);
    const q = parse(ConflictListQuery, query);
    const scope = await this.d.scopes.scopeFor(actor);
    return withTenant(this.d.db, actor.organizationId, async (tx) => {
      let base = this.conflictQuery(tx, actor.organizationId).where('sync_conflicts.status', '=', q.status);
      if (!this.reachesAll(actor)) {
        base = base.where('sync_conflicts.caused_by_user_id', '=', actor.userId);
        if (scope.kind === 'KEYS') {
          const classIds = [...scope.classIds];
          const studentIds = [...scope.studentIds];
          if (classIds.length === 0 && studentIds.length === 0) return { items: [], page: q.page, pageSize: CONFLICT_PAGE_SIZE, total: 0 };
          base = base.where((eb) =>
            eb.or([
              ...(classIds.length ? [eb('sync_conflicts.class_id', 'in', classIds)] : []),
              ...(studentIds.length ? [eb('sync_conflicts.student_id', 'in', studentIds)] : []),
            ]),
          );
        }
      }
      const total = await base
        .clearSelect()
        .select((eb) => eb.fn.countAll<string>().as('n'))
        .executeTakeFirstOrThrow();
      const rows = (await base
        .orderBy('sync_conflicts.created_at', 'desc')
        .orderBy('sync_conflicts.id', 'desc')
        .limit(CONFLICT_PAGE_SIZE)
        .offset((q.page - 1) * CONFLICT_PAGE_SIZE)
        .execute()) as ConflictRow[];
      return {
        items: rows.map((c) => ({
          id: c.id,
          entity: c.entity as SyncEntity,
          entityId: c.entity_id,
          status: c.status,
          label: this.labelOf(c),
          createdAt: c.created_at.toISOString(),
          causedBy: { userId: c.caused_by_user_id, displayName: c.display_name },
        })),
        page: q.page,
        pageSize: CONFLICT_PAGE_SIZE,
        total: Number(total.n),
      };
    });
  }

  private labelOf(c: ConflictRow): string {
    const handler = this.d.registry.get(c.entity);
    const row: SyncRow = { id: c.entity_id, rowVersion: Number(c.server_version), fields: asFields(c.server_fields), keys: { studentId: c.student_id, classId: c.class_id } };
    return handler ? handler.label(row).slice(0, 200) : c.entity;
  }

  // ---------- GET /sync/conflicts/:id ----------

  async detail(actor: Actor, id: string): Promise<ConflictDetail> {
    requireSyncRole(actor);
    const scope = await this.d.scopes.scopeFor(actor);
    return withTenant(this.d.db, actor.organizationId, async (tx) => {
      const { conflict, handler } = await this.reachable(tx, actor, id, scope, false);
      const record = toRecord(conflict);
      const entity = conflict.entity as SyncEntity;
      return {
        id: conflict.id,
        entity,
        entityId: conflict.entity_id,
        status: conflict.status,
        baseVersion: conflict.base_version === null ? null : Number(conflict.base_version),
        serverVersion: Number(conflict.server_version),
        device: projectFor('STAFF', entity, record.device),
        server: projectFor('STAFF', entity, record.server),
        fieldDiff: fieldDiff(record, handler.fieldSpec),
        createdAt: conflict.created_at.toISOString(),
        causedBy: { userId: conflict.caused_by_user_id, displayName: conflict.display_name },
      };
    });
  }

  // ---------- POST /sync/conflicts/:id/resolve ----------

  async resolve(actor: Actor, id: string, body: unknown): Promise<ResolveConflictResponse> {
    requireSyncRole(actor);
    const request = parse(ResolveConflictRequest, body);
    const choice: ConflictChoice = request.choice === 'MERGE' ? { choice: 'MERGE', picks: request.picks ?? {} } : { choice: request.choice };
    const scope = await this.d.scopes.scopeFor(actor);
    const org = actor.organizationId;
    return withTenant(this.d.db, org, async (tx) => {
      await lockOrganization(tx, org);
      const { conflict, handler, row } = await this.reachable(tx, actor, id, scope, true);
      if (!row) throw new AppError('NOT_FOUND');
      const record = toRecord(conflict);
      const outcome = resolve(record, choice, { spec: handler.fieldSpec, currentServerVersion: row.rowVersion });
      if (!outcome.ok) {
        if (outcome.code === 'CONFLICT_CLOSED' || outcome.code === 'CONFLICT_STALE') throw new AppError(outcome.code);
        throw new AppError('VALIDATION', Object.fromEntries((outcome.fields.length ? outcome.fields : ['picks']).map((f) => [f, outcome.code])));
      }

      // The resolution is a new change on top of the current row: version bump and change_log entry even when the
      // server version is kept, so every device re-reads the settled row (F12-AC12).
      const now = this.d.clock.now();
      const next = row.rowVersion + 1;
      // The owning module re-validates the chosen values against today's state (e.g. a holiday declared since, F04)
      // and adds its server-derived fields.
      const prepared = handler.prepareUpdate ? await handler.prepareUpdate(tx, actor, row, outcome.changes) : { ok: true as const, fields: outcome.changes };
      if (!prepared.ok) throw 'notFound' in prepared ? new AppError('NOT_FOUND') : new AppError('VALIDATION', prepared.issues);
      const changes = prepared.fields;
      await handler.update(tx, org, conflict.entity_id, changes, next, { actorUserId: actor.userId, at: now });
      await appendChange(tx, {
        organizationId: org,
        entity: conflict.entity,
        entityId: conflict.entity_id,
        rowVersion: next,
        op: 'UPSERT',
        changedFields: Object.keys(changes),
        keys: row.keys,
        actorUserId: actor.userId,
        opId: null,
        at: now,
      });
      await tx
        .updateTable('sync_conflicts')
        .set({
          status: 'RESOLVED',
          resolved_by: actor.userId,
          resolved_at: now,
          resolution: JSON.stringify({ choice: request.choice, picks: outcome.picks }),
        })
        .where('id', '=', conflict.id)
        .where('organization_id', '=', org)
        .execute();
      await recordAudit(tx, {
        organizationId: org,
        actorUserId: actor.userId,
        action: 'SYNC_CONFLICT_RESOLVED',
        targetType: 'SYNC_CONFLICT',
        targetId: conflict.id,
        summary: auditSummary(handler, conflict, record, outcome.picks, outcome.changes, request.choice),
        at: now,
      });
      return { rowVersion: next };
    });
  }
}

function toRecord(conflict: ConflictRow): ConflictRecord {
  return {
    status: conflict.status,
    serverVersion: Number(conflict.server_version),
    device: asFields(conflict.device_fields),
    server: asFields(conflict.server_fields),
    conflictFields: conflict.conflict_fields,
  };
}

/**
 * One audit entry: entity, record id, choice, field names and picks, and old/new values only for the fields the
 * handler declares non-sensitive. Never note bodies or other free text (ARCHITECTURE.md §15).
 */
function auditSummary(
  handler: SyncHandler,
  conflict: ConflictRow,
  record: ConflictRecord,
  picks: Record<string, 'DEVICE' | 'SERVER'>,
  changes: Record<string, unknown>,
  choice: string,
): Record<string, unknown> {
  const values: Record<string, { from: unknown; to: unknown }> = {};
  for (const field of Object.keys(picks)) {
    if (!handler.auditValueFields.includes(field)) continue;
    values[field] = { from: record.server[field], to: Object.hasOwn(changes, field) ? changes[field] : record.server[field] };
  }
  return {
    entity: conflict.entity,
    entityId: conflict.entity_id,
    choice,
    fields: Object.keys(picks),
    picks,
    values,
  };
}

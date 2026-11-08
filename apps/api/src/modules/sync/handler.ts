// Entity-handler registry (F12 plan §1, §7). The sync module owns the protocol tables (sync_ops, change_log,
// sync_conflicts, scope_changes) and never touches another module's tables: each owning module (calendar F04,
// hifz F05, mistakes F07, homework F08) registers a SyncHandler for its entities. In F12 no production handler
// is registered; integration tests register the test-only `sync_probe` handler (decision Q1).
import type { z } from 'zod';
import type { SyncEntity } from '@hifz/contracts';
import type { EntityFieldSpec } from '@hifz/domain/sync';
import type { Tx } from '../../platform/db.ts';
import type { Actor } from '../identity/auth-service.ts';

/** Scope keys written to change_log and checked against the caller's scope (F12-AC7). */
export interface ScopeKeys {
  studentId: string | null;
  classId: string | null;
}

/** One entity row as the sync engine sees it. `fields` never include id, organization, or row_version. */
export interface SyncRow {
  id: string;
  rowVersion: number;
  fields: Record<string, unknown>;
  keys: ScopeKeys;
}

export type FieldsSchema = z.ZodType<Record<string, unknown>>;

export interface AppliedChange {
  actor: Actor;
  opType: 'CREATE' | 'UPDATE' | 'RESOLVE';
  entityId: string;
  rowVersion: number;
  /** Fields written by this change (names and values; the handler decides what is safe to audit). */
  changes: Record<string, unknown>;
  at: Date;
}

export interface SyncHandler {
  readonly entity: SyncEntity;
  /** Supported operation types. COMMAND handlers arrive with F05/F08. */
  readonly opTypes: readonly ('CREATE' | 'UPDATE')[];
  /** Strict schema of a CREATE's fields: unknown keys (an organization, a role, a total) are refused. */
  readonly createSchema: FieldsSchema;
  /** Strict schema of an UPDATE's fields (a partial row; scope keys are not editable through sync). */
  readonly updateSchema: FieldsSchema;
  /** Field classes for conflict detection (packages/domain/sync). */
  readonly fieldSpec: EntityFieldSpec;
  /** Fields whose values may appear in audit summaries; every other field is audited by name only. */
  readonly auditValueFields: readonly string[];
  /** Tables the test-control reset truncates with the sync tables (test builds only). */
  readonly tables: readonly string[];
  /** Scope keys of a row about to be created, from its validated fields. */
  keysForCreate(fields: Record<string, unknown>): ScopeKeys;
  /** One row of the organization, or null. With `forUpdate` the row is locked for the transaction. */
  load(tx: Tx, organizationId: string, id: string, options: { forUpdate: boolean }): Promise<SyncRow | null>;
  loadMany(tx: Tx, organizationId: string, ids: readonly string[]): Promise<SyncRow[]>;
  /** Inserts at row_version 1 with the client's id. False when the id is already used, in any organization. */
  insert(tx: Tx, organizationId: string, id: string, fields: Record<string, unknown>): Promise<boolean>;
  update(tx: Tx, organizationId: string, id: string, changes: Record<string, unknown>, rowVersion: number): Promise<void>;
  /** A safe, non-sensitive label for conflict lists (never a note body). */
  label(row: SyncRow): string;
  /** Writes the owning module's audit entry for an applied change, in the same transaction (ARCHITECTURE §15). */
  audit?(tx: Tx, change: AppliedChange): Promise<void>;
}

export class SyncRegistry {
  private readonly handlers = new Map<string, SyncHandler>();

  constructor(handlers: readonly SyncHandler[] = []) {
    for (const handler of handlers) {
      if (this.handlers.has(handler.entity)) throw new Error(`Duplicate sync handler for ${handler.entity}`);
      if (handler.fieldSpec.entity !== handler.entity) throw new Error(`Field spec of ${handler.entity} names ${handler.fieldSpec.entity}`);
      this.handlers.set(handler.entity, handler);
    }
  }

  get(entity: string): SyncHandler | undefined {
    return this.handlers.get(entity);
  }

  tables(): string[] {
    return [...this.handlers.values()].flatMap((h) => h.tables);
  }
}

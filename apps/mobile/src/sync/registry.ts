// Local entity registry (F12 plan §1, §8). The outbox and engine are generic; each feature that makes an entity
// offline-capable (F04 attendance, F05 daily records/portions/attempts, F08 homework) registers a handler here
// with its local table, field classes, and display helpers. F12 registers none in production; tests register the
// test-only `sync_probe` entity.
//
// Table convention for every registered entity: `id TEXT PRIMARY KEY` (client UUIDv7, never rewritten, F12-AC3)
// and `row_version INTEGER` (server version; null until acknowledged). Other columns belong to the feature.
import type { SyncEntity } from '@hifz/contracts';
import type { EntityFieldSpec } from '@hifz/domain/sync';
import type { SqlExecutor } from '../local-db/driver.ts';

/** A coupled group of fields shown and picked as one unit in Conflict Review (plan Q5). */
export interface FieldGroup {
  id: string;
  /** i18n key of the group title. */
  labelKey: string;
  fields: readonly string[];
}

export interface LocalEntityHandler {
  entity: SyncEntity;
  /** Local table name (a fixed identifier, never user input). */
  table: string;
  /** Field classes shared with the server (packages/domain/sync). */
  fieldSpec: EntityFieldSpec;
  /** Writes a row pulled from the server (only called when the row has no unsynced local change). */
  upsertFromServer(tx: SqlExecutor, entityId: string, rowVersion: number, fields: Readonly<Record<string, unknown>>): Promise<void>;
  /** A safe display label for queue items and conflicts; never a note body. */
  label(fields: Readonly<Record<string, unknown>>): string | null;
  /** Fields grouped for Conflict Review; ungrouped fields are shown one by one. */
  fieldGroups?: readonly FieldGroup[];
  /** i18n key for a field's label; the raw field name is shown when absent. */
  fieldLabelKey?(field: string): string | null;
  /** Formats a value for display. Missing values must come back as null ("Not recorded"), never 0. */
  formatValue?(field: string, value: unknown): string | null;
  /**
   * Cache retention (F12-AC19): synced rows whose `dateColumn` (a calendar date `YYYY-MM-DD`, e.g. `report_date`)
   * is older than `days` before today in the organization's timezone are removed from the device.
   */
  retention?: { dateColumn: string; days: number };
  /** Reverts the local row when its unsynced operation is discarded (e.g. deletes a never-synced CREATE). */
  onDiscard?(tx: SqlExecutor, op: { entityId: string; opType: string }): Promise<void>;
}

const IDENTIFIER = /^[a-z][a-z0-9_]{0,62}$/;

export class EntityRegistry {
  private readonly handlers = new Map<string, LocalEntityHandler>();

  register(handler: LocalEntityHandler): this {
    if (!IDENTIFIER.test(handler.table)) throw new Error(`Invalid table name "${handler.table}"`);
    if (handler.retention && !IDENTIFIER.test(handler.retention.dateColumn)) {
      throw new Error(`Invalid retention column "${handler.retention.dateColumn}"`);
    }
    if (this.handlers.has(handler.entity)) throw new Error(`Entity "${handler.entity}" is already registered`);
    this.handlers.set(handler.entity, handler);
    return this;
  }

  get(entity: string): LocalEntityHandler | undefined {
    return this.handlers.get(entity);
  }

  all(): LocalEntityHandler[] {
    return [...this.handlers.values()];
  }
}

/** The app's registry. F04/F05/F08 register their entities here; F12 ships none. */
export const appRegistry = new EntityRegistry();

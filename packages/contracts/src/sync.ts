// Sync protocol contracts shared by the API and the app (F12; NFR-OFF-001…011, FR-SYNC-006…009, FR-HW-017;
// plan docs/handover/F12-plan.md §5). Envelopes are strict: unknown keys (an organization ID, a role, a
// total, a visibility flag) are refused. Entity `fields` are validated by each entity handler's strict schema.
import { z } from 'zod';

/** Protocol version this build speaks. The server refuses versions below its minimum with 426 UPGRADE_REQUIRED. */
export const PROTOCOL_VERSION = 1;

export const SYNC_LIMITS = {
  /** Operations per push request. */
  maxPushOps: 100,
  /** Changes per pull page. */
  maxPullLimit: 500,
  /** Dependencies per operation. */
  maxDependsOn: 100,
  /** Fields per operation. */
  maxFields: 100,
} as const;

/**
 * Entities the protocol carries. `sync_probe` is test-only (registered by the API only in test builds); F04 registers attendance_record; the rest
 * are reserved for F05, F07, F08 and answer ENTITY_NOT_SUPPORTED until their handler is registered.
 */
export const SYNC_ENTITIES = [
  'sync_probe',
  'attendance_record',
  'daily_record',
  'lesson_portion',
  'portion_attempt',
  'attempt_mistake',
  'note',
  'homework_assignment',
  'homework_portion',
] as const;
export type SyncEntity = (typeof SYNC_ENTITIES)[number];

/** No DELETE: records are never hard-deleted (ARCHITECTURE §6.1). */
export const SYNC_OP_TYPES = ['CREATE', 'UPDATE', 'COMMAND'] as const;
export type SyncOpType = (typeof SYNC_OP_TYPES)[number];

export const OP_RESULT_STATUSES = ['APPLIED', 'CONFLICT', 'REJECTED', 'RETRY'] as const;
export type OpResultStatus = (typeof OP_RESULT_STATUSES)[number];

/** Terminal refusals of one operation; the result is stored and replayed. */
export const OP_REJECT_CODES = ['VALIDATION', 'NOT_FOUND', 'ENTITY_NOT_SUPPORTED', 'ID_TAKEN', 'OP_ID_REUSED'] as const;
export type OpRejectCode = (typeof OP_REJECT_CODES)[number];

/**
 * Temporary refusals; not stored, the client sends the operation again later. DEPENDENCY_PENDING: retried with
 * backoff. CONFLICT_OPEN: the row has an open conflict (decision Q7); the client holds the operation as action
 * required, without backoff, and sends it again once that conflict is resolved.
 */
export const OP_RETRY_CODES = ['DEPENDENCY_PENDING', 'CONFLICT_OPEN'] as const;
export type OpRetryCode = (typeof OP_RETRY_CODES)[number];

export const CHANGE_OPS = ['UPSERT', 'REMOVE_FROM_DEVICE'] as const;
export type ChangeOp = (typeof CHANGE_OPS)[number];

export const CONFLICT_STATUSES = ['OPEN', 'RESOLVED'] as const;
export type SyncConflictStatus = (typeof CONFLICT_STATUSES)[number];

export const CONFLICT_CHOICES = ['KEEP_DEVICE', 'KEEP_SERVER', 'MERGE'] as const;
export type ConflictChoice = (typeof CONFLICT_CHOICES)[number];

export const FIELD_PICKS = ['DEVICE', 'SERVER'] as const;
export type FieldPick = (typeof FIELD_PICKS)[number];

/**
 * Keys never accepted inside an operation's `fields`, whatever the entity: tenant, role, visibility and
 * server-owned versions come from the server only (AGENTS.md §6). Entity handlers' strict schemas are the main guard.
 */
export const RESERVED_FIELD_KEYS = [
  'organizationId',
  'organization_id',
  'orgId',
  'role',
  'visibility',
  'rowVersion',
  'row_version',
] as const;

// ---------- Building blocks ----------

/** Canonical lowercase UUIDv7 (same rule as `isUuidV7` in @hifz/domain/sync). */
export const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const UuidV7 = z.string().regex(UUID_V7_PATTERN, 'UUIDV7');

const fieldName = z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/);
const fieldMap = z
  .record(fieldName, z.unknown())
  .refine((fields) => Object.keys(fields).length <= SYNC_LIMITS.maxFields, { message: 'TOO_MANY_FIELDS' })
  .refine((fields) => !RESERVED_FIELD_KEYS.some((key) => Object.hasOwn(fields, key)), { message: 'RESERVED_FIELD' });
const rowVersion = z.number().int().min(1);
const datetime = z.iso.datetime({ offset: true });

// ---------- POST /sync/push ----------

export const SyncOp = z
  .strictObject({
    opId: UuidV7,
    /** Outbox sequence; strictly increasing within a request. */
    seq: z.number().int().min(0),
    entity: z.enum(SYNC_ENTITIES),
    entityId: UuidV7,
    opType: z.enum(SYNC_OP_TYPES),
    /** COMMAND only, e.g. CONFIRM_HOMEWORK (F08), APPEND_ATTEMPT (F05). */
    command: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/).optional(),
    /** Row version the change was based on; null for CREATE. */
    baseVersion: rowVersion.nullable(),
    fields: fieldMap,
    dependsOn: z.array(UuidV7).max(SYNC_LIMITS.maxDependsOn),
    /** Informational only; never used for ordering or conflict decisions. */
    clientSavedAt: datetime,
  })
  .superRefine((op, ctx) => {
    if (op.opType === 'CREATE' && op.baseVersion !== null) {
      ctx.addIssue({ code: 'custom', path: ['baseVersion'], message: 'CREATE_HAS_NO_BASE_VERSION' });
    }
    if (op.opType === 'UPDATE' && op.baseVersion === null) {
      ctx.addIssue({ code: 'custom', path: ['baseVersion'], message: 'UPDATE_NEEDS_BASE_VERSION' });
    }
    if (op.opType === 'COMMAND' && op.command === undefined) {
      ctx.addIssue({ code: 'custom', path: ['command'], message: 'COMMAND_REQUIRED' });
    }
    if (op.opType !== 'COMMAND' && op.command !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['command'], message: 'COMMAND_NOT_ALLOWED' });
    }
    if (op.dependsOn.includes(op.opId)) {
      ctx.addIssue({ code: 'custom', path: ['dependsOn'], message: 'SELF_DEPENDENCY' });
    }
    if (new Set(op.dependsOn).size !== op.dependsOn.length) {
      ctx.addIssue({ code: 'custom', path: ['dependsOn'], message: 'DUPLICATE_DEPENDENCY' });
    }
  });
export type SyncOp = z.infer<typeof SyncOp>;

export const PushRequest = z
  .strictObject({
    protocolVersion: z.number().int().min(1),
    deviceId: z.uuid(),
    /** In outbox order. */
    ops: z.array(SyncOp).min(1).max(SYNC_LIMITS.maxPushOps),
  })
  .superRefine((req, ctx) => {
    const ids = new Set<string>();
    req.ops.forEach((op, i) => {
      if (ids.has(op.opId)) ctx.addIssue({ code: 'custom', path: ['ops', i, 'opId'], message: 'DUPLICATE_OP_ID' });
      ids.add(op.opId);
      const previous = req.ops[i - 1];
      if (previous && op.seq <= previous.seq) {
        ctx.addIssue({ code: 'custom', path: ['ops', i, 'seq'], message: 'SEQ_NOT_INCREASING' });
      }
    });
  });
export type PushRequest = z.infer<typeof PushRequest>;

const issueMap = z.record(z.string(), z.string());

export const OpResult = z.discriminatedUnion('status', [
  /** `notices` (F08): facts to show, e.g. CONFIRMED_HOMEWORK_UNCHANGED after a source correction (F08-AC14). */
  z.strictObject({ opId: UuidV7, status: z.literal('APPLIED'), rowVersion, entityId: UuidV7, notices: z.array(z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/)).max(10).optional() }),
  /** The record is action required until the conflict is resolved. */
  z.strictObject({ opId: UuidV7, status: z.literal('CONFLICT'), conflictId: z.uuid() }),
  z.strictObject({ opId: UuidV7, status: z.literal('REJECTED'), code: z.enum(OP_REJECT_CODES), fields: issueMap.optional() }),
  z.strictObject({ opId: UuidV7, status: z.literal('RETRY'), code: z.enum(OP_RETRY_CODES) }),
]);
export type OpResult = z.infer<typeof OpResult>;

export const PushResponse = z.strictObject({
  /** One per operation, in request order. */
  results: z.array(OpResult).max(SYNC_LIMITS.maxPushOps),
  serverTime: datetime,
});
export type PushResponse = z.infer<typeof PushResponse>;

// ---------- GET /sync/pull ----------

export const PullQuery = z.strictObject({
  /**
   * The app's sync protocol version, checked like the push envelope's (426 UPGRADE_REQUIRED below the minimum).
   * Absent means 1, the first protocol, so raising the minimum also refuses apps that do not send it.
   */
  protocolVersion: z.coerce.number().int().min(1).default(1),
  /** Opaque cursor from the previous pull; absent for the first pull (bootstrap snapshot). */
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(SYNC_LIMITS.maxPullLimit).default(SYNC_LIMITS.maxPullLimit),
});
export type PullQuery = z.infer<typeof PullQuery>;

export const Change = z
  .strictObject({
    entity: z.enum(SYNC_ENTITIES),
    entityId: UuidV7,
    rowVersion,
    op: z.enum(CHANGE_OPS),
    /** Staff projection of the row (UPSERT only). */
    fields: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((change, ctx) => {
    if (change.op === 'UPSERT' && change.fields === undefined) {
      ctx.addIssue({ code: 'custom', path: ['fields'], message: 'UPSERT_NEEDS_FIELDS' });
    }
    if (change.op === 'REMOVE_FROM_DEVICE' && change.fields !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['fields'], message: 'REMOVE_HAS_NO_FIELDS' });
    }
  });
export type Change = z.infer<typeof Change>;

export const PullResponse = z.strictObject({
  changes: z.array(Change).max(SYNC_LIMITS.maxPullLimit),
  cursor: z.string().min(1).max(512),
  hasMore: z.boolean(),
  /** The caller's scope changed since the cursor: drop rows outside it and re-bootstrap (NFR-OFF-010). */
  scopeReset: z.boolean(),
  serverTime: datetime,
});
export type PullResponse = z.infer<typeof PullResponse>;

// ---------- Conflicts ----------

export const ConflictListQuery = z.strictObject({
  status: z.enum(CONFLICT_STATUSES).default('OPEN'),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});
export type ConflictListQuery = z.infer<typeof ConflictListQuery>;

export const ConflictSummary = z.strictObject({
  id: z.uuid(),
  entity: z.enum(SYNC_ENTITIES),
  entityId: UuidV7,
  status: z.enum(CONFLICT_STATUSES),
  /** A safe, non-sensitive label for the record (never a note body). */
  label: z.string().max(200),
  createdAt: datetime,
  causedBy: z.strictObject({ userId: z.uuid(), displayName: z.string().max(200) }),
});
export type ConflictSummary = z.infer<typeof ConflictSummary>;

export const ConflictListResponse = z.strictObject({
  items: z.array(ConflictSummary),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  total: z.number().int().min(0),
});
export type ConflictListResponse = z.infer<typeof ConflictListResponse>;

export const FieldDiff = z.strictObject({
  field: z.string(),
  device: z.unknown(),
  server: z.unknown(),
  /** Part of the detected conflict (others are differing fields the device also changed). */
  conflicting: z.boolean(),
  /** Coupled fields that must be picked together, or null. */
  group: z.array(z.string()).nullable(),
});
export type FieldDiff = z.infer<typeof FieldDiff>;

export const ConflictDetail = z.strictObject({
  id: z.uuid(),
  entity: z.enum(SYNC_ENTITIES),
  entityId: UuidV7,
  status: z.enum(CONFLICT_STATUSES),
  baseVersion: rowVersion.nullable(),
  serverVersion: rowVersion,
  device: z.record(z.string(), z.unknown()),
  server: z.record(z.string(), z.unknown()),
  fieldDiff: z.array(FieldDiff),
  createdAt: datetime,
  causedBy: z.strictObject({ userId: z.uuid(), displayName: z.string().max(200) }),
});
export type ConflictDetail = z.infer<typeof ConflictDetail>;

export const ResolveConflictRequest = z
  .strictObject({
    choice: z.enum(CONFLICT_CHOICES),
    /** MERGE only: a pick for every differing field; coupled fields must share one pick. */
    picks: z.record(fieldName, z.enum(FIELD_PICKS)).optional(),
  })
  .superRefine((req, ctx) => {
    if (req.choice === 'MERGE' && req.picks === undefined) {
      ctx.addIssue({ code: 'custom', path: ['picks'], message: 'PICKS_REQUIRED' });
    }
    if (req.choice !== 'MERGE' && req.picks !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['picks'], message: 'PICKS_NOT_ALLOWED' });
    }
  });
export type ResolveConflictRequest = z.infer<typeof ResolveConflictRequest>;

export const ResolveConflictResponse = z.strictObject({ rowVersion });
export type ResolveConflictResponse = z.infer<typeof ResolveConflictResponse>;

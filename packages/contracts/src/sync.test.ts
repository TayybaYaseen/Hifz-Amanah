// F12 · Offline and synchronization — unit: sync protocol contracts (docs/handover/F12-plan.md §5)
import { describe, expect, it } from 'vitest';
import * as domain from '@hifz/domain/sync';
import {
  Change,
  ConflictDetail,
  ConflictListQuery,
  ConflictListResponse,
  CONFLICT_CHOICES,
  ERROR_CODES,
  FIELD_PICKS,
  OpResult,
  PROTOCOL_VERSION,
  PullQuery,
  PullResponse,
  PushRequest,
  PushResponse,
  ResolveConflictRequest,
  ResolveConflictResponse,
  SYNC_ENTITIES,
  SyncOp,
  UUID_V7_PATTERN,
} from './index.ts';

const v7 = (n: number) => `01901234-5678-7abc-8def-${n.toString(16).padStart(12, '0')}`;
const DEVICE = '3f2b8c1e-4d5a-4b6c-9d7e-8f9a0b1c2d3e';
const NOW = '2026-11-08T10:00:00.000+05:00';

const create = (n: number, extra: Record<string, unknown> = {}) => ({
  opId: v7(n),
  seq: n,
  entity: 'sync_probe',
  entityId: v7(1000 + n),
  opType: 'CREATE',
  baseVersion: null,
  fields: { label: 'Probe', status: 'OPEN', position: 1 },
  dependsOn: [],
  clientSavedAt: NOW,
  ...extra,
});
const push = (ops: unknown[], extra: Record<string, unknown> = {}) => ({ protocolVersion: PROTOCOL_VERSION, deviceId: DEVICE, ops, ...extra });

describe('F12 · push contract', () => {
  it('F12 unit: valid CREATE, UPDATE, and COMMAND operations parse and round-trip unchanged', () => {
    const request = push([
      create(1),
      create(2, { opType: 'UPDATE', baseVersion: 3, fields: { position: 2 }, dependsOn: [v7(1)] }),
      create(3, { entity: 'homework_assignment', opType: 'COMMAND', command: 'CONFIRM_HOMEWORK', baseVersion: 1, fields: {} }),
    ]);
    const parsed = PushRequest.parse(request);
    expect(parsed).toEqual(request);
    expect(PushRequest.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
  });

  it('F12 unit: unknown keys are refused in the envelope and in an operation', () => {
    expect(PushRequest.safeParse(push([create(1)], { extra: true })).success).toBe(false);
    expect(PushRequest.safeParse(push([create(1, { extra: true })])).success).toBe(false);
  });

  it('F12 unit: organization ID, role, and totals are refused in the envelope', () => {
    for (const key of ['organizationId', 'role', 'totals']) {
      expect(PushRequest.safeParse(push([create(1)], { [key]: 'x' })).success, key).toBe(false);
      expect(PushRequest.safeParse(push([create(1, { [key]: 'x' })])).success, `op.${key}`).toBe(false);
    }
  });

  it('F12 unit: tenant, role, visibility, and row-version keys are refused inside fields', () => {
    for (const key of ['organizationId', 'organization_id', 'role', 'visibility', 'rowVersion']) {
      expect(PushRequest.safeParse(push([create(1, { fields: { [key]: 'x' } })])).success, key).toBe(false);
    }
  });

  it('F12 unit: a push holds 1 to 100 operations', () => {
    expect(PushRequest.safeParse(push([])).success).toBe(false);
    const hundred = Array.from({ length: 100 }, (_, i) => create(i + 1));
    expect(PushRequest.safeParse(push(hundred)).success).toBe(true);
    expect(PushRequest.safeParse(push([...hundred, create(101)])).success).toBe(false);
  });

  it('F12 unit: DELETE is not an operation type (no hard deletes)', () => {
    expect(PushRequest.safeParse(push([create(1, { opType: 'DELETE' })])).success).toBe(false);
  });

  it('F12-AC3 (US-051) operation, entity, and dependency IDs must be client UUIDv7s', () => {
    const v4 = '3f2b8c1e-4d5a-4b6c-9d7e-8f9a0b1c2d3e';
    expect(PushRequest.safeParse(push([create(1, { opId: v4 })])).success).toBe(false);
    expect(PushRequest.safeParse(push([create(1, { entityId: v4 })])).success).toBe(false);
    expect(PushRequest.safeParse(push([create(1, { dependsOn: [v4] })])).success).toBe(false);
    expect(PushRequest.safeParse(push([create(1, { entityId: v7(5).toUpperCase() })])).success).toBe(false);
  });

  it('F12 unit: base version, command, and dependencies follow the operation type', () => {
    const bad = [
      create(1, { baseVersion: 1 }), // CREATE with a base version
      create(1, { opType: 'UPDATE' }), // UPDATE without one
      create(1, { opType: 'COMMAND', baseVersion: 1 }), // COMMAND without a command
      create(1, { command: 'CONFIRM_HOMEWORK' }), // command on CREATE
      create(1, { dependsOn: [v7(1)] }), // depends on itself
      create(2, { dependsOn: [v7(1), v7(1)] }), // duplicate dependency
      create(1, { entity: 'student' }), // not a sync entity
      create(1, { clientSavedAt: 'yesterday' }),
    ];
    for (const op of bad) expect(SyncOp.safeParse(op).success, JSON.stringify(op)).toBe(false);
  });

  it('F12-AC4 (US-052) operations in one push are in outbox order with unique op IDs', () => {
    expect(PushRequest.safeParse(push([create(2), create(1)])).success).toBe(false);
    expect(PushRequest.safeParse(push([create(1), { ...create(2), opId: v7(1) }])).success).toBe(false);
  });

  it('F12 unit: per-operation results are a closed set of shapes', () => {
    const results = [
      { opId: v7(1), status: 'APPLIED', rowVersion: 1, entityId: v7(1001) },
      { opId: v7(2), status: 'CONFLICT', conflictId: DEVICE },
      { opId: v7(3), status: 'REJECTED', code: 'VALIDATION', fields: { label: 'INVALID' } },
      { opId: v7(4), status: 'RETRY', code: 'DEPENDENCY_PENDING' },
    ];
    expect(PushResponse.parse({ results, serverTime: NOW })).toEqual({ results, serverTime: NOW });
    expect(OpResult.safeParse({ opId: v7(1), status: 'APPLIED', rowVersion: 1 }).success).toBe(false);
    expect(OpResult.safeParse({ opId: v7(1), status: 'REJECTED', code: 'DEPENDENCY_PENDING' }).success).toBe(false);
    expect(OpResult.safeParse({ opId: v7(1), status: 'RETRY', code: 'VALIDATION' }).success).toBe(false);
    expect(OpResult.safeParse({ opId: v7(1), status: 'SYNCED' }).success).toBe(false);
  });
});

describe('F12 · pull contract', () => {
  it('F12-AC7 (US-052) pull takes an opaque cursor and a limit of 1 to 500', () => {
    expect(PullQuery.parse({})).toEqual({ limit: 500 });
    expect(PullQuery.parse({ cursor: 'abc', limit: '20' })).toEqual({ cursor: 'abc', limit: 20 });
    expect(PullQuery.safeParse({ limit: '0' }).success).toBe(false);
    expect(PullQuery.safeParse({ limit: '501' }).success).toBe(false);
    expect(PullQuery.safeParse({ organizationId: 'x' }).success).toBe(false);
  });

  it('F12 unit: a pull response round-trips; UPSERT carries fields and REMOVE_FROM_DEVICE does not', () => {
    const response = {
      changes: [
        { entity: 'sync_probe', entityId: v7(1), rowVersion: 2, op: 'UPSERT', fields: { label: 'A' } },
        { entity: 'sync_probe', entityId: v7(2), rowVersion: 3, op: 'REMOVE_FROM_DEVICE' },
      ],
      cursor: 'c1',
      hasMore: false,
      scopeReset: false,
      serverTime: NOW,
    };
    expect(PullResponse.parse(response)).toEqual(response);
    expect(Change.safeParse({ entity: 'sync_probe', entityId: v7(1), rowVersion: 1, op: 'UPSERT' }).success).toBe(false);
    expect(Change.safeParse({ entity: 'sync_probe', entityId: v7(1), rowVersion: 1, op: 'REMOVE_FROM_DEVICE', fields: {} }).success).toBe(false);
    expect(Change.safeParse({ entity: 'sync_probe', entityId: v7(1), rowVersion: 1, op: 'DELETE' }).success).toBe(false);
  });
});

describe('F12 · conflict contract', () => {
  it('F12-AC12 (US-054) a resolution is a version pick or a per-field merge', () => {
    expect(ResolveConflictRequest.parse({ choice: 'KEEP_DEVICE' })).toEqual({ choice: 'KEEP_DEVICE' });
    expect(ResolveConflictRequest.parse({ choice: 'MERGE', picks: { status: 'SERVER', remarks: 'DEVICE' } })).toBeTruthy();
    expect(ResolveConflictRequest.safeParse({ choice: 'MERGE' }).success).toBe(false);
    expect(ResolveConflictRequest.safeParse({ choice: 'KEEP_SERVER', picks: {} }).success).toBe(false);
    expect(ResolveConflictRequest.safeParse({ choice: 'MERGE', picks: { status: 'BOTH' } }).success).toBe(false);
    expect(ResolveConflictRequest.safeParse({ choice: 'LAST_WRITE_WINS' }).success).toBe(false);
    expect(ResolveConflictResponse.parse({ rowVersion: 5 })).toEqual({ rowVersion: 5 });
  });

  it('F12 unit: conflict list and detail shapes round-trip', () => {
    expect(ConflictListQuery.parse({})).toEqual({ status: 'OPEN', page: 1 });
    const causedBy = { userId: DEVICE, displayName: 'Teacher A1' };
    const list = {
      items: [{ id: DEVICE, entity: 'sync_probe', entityId: v7(1), status: 'OPEN', label: 'Probe', createdAt: NOW, causedBy }],
      page: 1,
      pageSize: 20,
      total: 1,
    };
    expect(ConflictListResponse.parse(list)).toEqual(list);
    const detail = {
      id: DEVICE,
      entity: 'sync_probe',
      entityId: v7(1),
      status: 'OPEN',
      baseVersion: 1,
      serverVersion: 2,
      device: { status: 'A' },
      server: { status: 'B' },
      fieldDiff: [{ field: 'status', device: 'A', server: 'B', conflicting: true, group: null }],
      createdAt: NOW,
      causedBy,
    };
    expect(ConflictDetail.parse(detail)).toEqual(detail);
    expect(ConflictDetail.safeParse({ ...detail, organizationId: 'x' }).success).toBe(false);
  });
});

describe('F12 · contract and domain agree', () => {
  it('F12 unit: protocol constants, entities, error codes, and shared enums', () => {
    expect(PROTOCOL_VERSION).toBe(1);
    expect(SYNC_ENTITIES).toContain('sync_probe');
    expect(SYNC_ENTITIES).not.toContain('student');
    for (const code of ['ACCESS_REVOKED', 'UPGRADE_REQUIRED', 'DEPENDENCY_PENDING', 'OP_ID_REUSED', 'ID_TAKEN', 'ENTITY_NOT_SUPPORTED', 'CONFLICT_STALE', 'CONFLICT_CLOSED']) {
      expect(ERROR_CODES).toContain(code);
    }
    expect(UUID_V7_PATTERN.source).toBe(domain.UUID_V7_PATTERN.source);
    expect([...CONFLICT_CHOICES]).toEqual([...domain.CONFLICT_CHOICES]);
    expect([...FIELD_PICKS]).toEqual([...domain.FIELD_PICKS]);
    // Every result the contract allows is a valid domain queue event.
    const status = domain.initialQueueStatus();
    const ctx = { nowMs: 0, random: () => 0 };
    const sending = domain.transition(status, { type: 'SEND' }, ctx);
    const applied = OpResult.parse({ opId: v7(1), status: 'APPLIED', rowVersion: 1, entityId: v7(2) });
    expect(domain.transition(sending, { type: 'RESULT', result: applied }, ctx).state).toBe('SYNCED');
  });
});

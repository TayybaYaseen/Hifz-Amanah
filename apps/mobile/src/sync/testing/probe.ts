/// <reference types="node" />
// TEST ONLY. The `sync_probe` entity (plan §7, Q1): label and status meaningful, position safe (display order).
// Registered only in tests; production registers no F12 entity. Never imported by app code.
import { createHash, randomBytes } from 'node:crypto';
import type { PullResponse, PushRequest, PushResponse } from '@hifz/contracts';
import { SYNC_PROBE_FIELDS } from '@hifz/domain/sync';
import type { SqlDriver, SqlExecutor } from '../../local-db/driver.ts';
import { WORKSPACE_MIGRATIONS, runMigrations, type Migration } from '../../local-db/migrations.ts';
import { openNodeDriver } from '../../local-db/testing/nodeDriver.ts';
import { ApiFailure } from '../../api/client.ts';
import { SyncEngine, type EngineDeps } from '../engine.ts';
import { createIdSource } from '../ids.ts';
import { Outbox } from '../outbox.ts';
import { EntityRegistry } from '../registry.ts';
import type { SyncTransport } from '../transport.ts';

export const probeMigration = (version: number): Migration => ({
  version,
  name: 'TEST ONLY sync_probe',
  up: async (tx) => {
    await tx.exec(`CREATE TABLE sync_probe (
      id TEXT PRIMARY KEY, row_version INTEGER, label TEXT, status TEXT, position INTEGER, report_date TEXT)`);
  },
});

export const PROBE_MIGRATIONS: readonly Migration[] = [...WORKSPACE_MIGRATIONS, probeMigration(WORKSPACE_MIGRATIONS.length + 1)];

export function probeRegistry(retentionDays?: number): EntityRegistry {
  return new EntityRegistry().register({
    entity: 'sync_probe',
    table: 'sync_probe',
    fieldSpec: SYNC_PROBE_FIELDS,
    upsertFromServer: async (tx, id, rowVersion, f) => {
      await tx.run(
        `INSERT INTO sync_probe (id, row_version, label, status, position, report_date) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET row_version = excluded.row_version, label = excluded.label, status = excluded.status,
           position = excluded.position, report_date = excluded.report_date`,
        [id, rowVersion, (f.label as string) ?? null, (f.status as string) ?? null, (f.position as number) ?? null, (f.reportDate as string) ?? null],
      );
    },
    label: (f) => (typeof f.label === 'string' ? f.label : null),
    ...(retentionDays ? { retention: { dateColumn: 'report_date', days: retentionDays } } : {}),
    onDiscard: async (tx, op) => {
      if (op.opType === 'CREATE') await tx.run('DELETE FROM sync_probe WHERE id = ?', [op.entityId]);
    },
  });
}

export const testRandomBytes = (n: number) => new Uint8Array(randomBytes(n));

/** Fixed start of the fake clock. The fake server reports this same time, so tests never depend on the real date. */
export const FAKE_NOW_MS = Date.parse('2026-11-08T06:00:00.000Z');

export class FakeClock {
  now = FAKE_NOW_MS;
  readonly read = () => this.now;
  advance(ms: number) {
    this.now += ms;
  }
}

export async function probeDb(path?: string): Promise<SqlDriver> {
  const db = openNodeDriver(path);
  await runMigrations(db, PROBE_MIGRATIONS);
  return db;
}

export function makeOutbox(db: SqlDriver, clock: FakeClock, registry: EntityRegistry = probeRegistry()) {
  return new Outbox(db, { clock: clock.read, newId: createIdSource(clock.read, testRandomBytes), registry });
}

/** Writes a probe row the way a feature's save path would (inside saveWithOp's transaction). */
export const writeProbe = (id: string, fields: { label?: string; status?: string; position?: number; reportDate?: string }) => async (tx: SqlExecutor) => {
  await tx.run(
    `INSERT INTO sync_probe (id, row_version, label, status, position, report_date) VALUES (?, NULL, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET label = excluded.label, status = excluded.status, position = excluded.position`,
    [id, fields.label ?? null, fields.status ?? null, fields.position ?? null, fields.reportDate ?? null],
  );
  return id;
};

type PushHandler = (req: PushRequest) => PushResponse | Promise<PushResponse>;
type PullHandler = (q: { cursor: string | null; limit: number }) => PullResponse | Promise<PullResponse>;

/** A scripted fake server. By default every op is APPLIED (row version 1) and pulls are empty. */
export class FakeTransport implements SyncTransport {
  /** The server time the fake reports: fixed, not the real clock, so retention tests stay deterministic. */
  serverTime = new Date(FAKE_NOW_MS).toISOString();
  pushes: PushRequest[] = [];
  pulls: Array<{ cursor: string | null; limit: number }> = [];
  onPush: PushHandler = (req) => ({
    results: req.ops.map((op) => ({ opId: op.opId, status: 'APPLIED' as const, rowVersion: 1, entityId: op.entityId })),
    serverTime: this.serverTime,
  });
  onPull: PullHandler = ({ cursor }) => ({ changes: [], cursor: cursor ?? 'c0', hasMore: false, scopeReset: false, serverTime: this.serverTime });

  async push(req: PushRequest): Promise<PushResponse> {
    this.pushes.push(structuredClone(req));
    return this.onPush(req);
  }

  async pull(q: { cursor: string | null; limit: number }): Promise<PullResponse> {
    this.pulls.push(q);
    return this.onPull(q);
  }

  failWith(status: number, code: Parameters<typeof failure>[1]) {
    this.onPush = () => {
      throw failure(status, code);
    };
    this.onPull = () => {
      throw failure(status, code);
    };
  }
}

export const failure = (status: number, code: ConstructorParameters<typeof ApiFailure>[0]) => new ApiFailure(code, status);

export function makeEngine(db: SqlDriver, outbox: Outbox, registry: EntityRegistry, transport: SyncTransport, clock: FakeClock, extra: Partial<EngineDeps> = {}) {
  return new SyncEngine({
    db,
    outbox,
    registry,
    transport,
    deviceId: '0b6f3c1e-6b0a-4c8e-9a51-2d1e0f6c7a10',
    clock: clock.read,
    random: () => 0.5,
    ...extra,
  });
}

export const testPinCrypto = {
  sha256Hex: async (text: string) => createHash('sha256').update(text, 'utf8').digest('hex'),
  randomHex: (bytes: number) => randomBytes(bytes).toString('hex'),
};

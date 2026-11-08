// Shared setup for the F12 sync integration tests: the harness with the test-only sync_probe entity (decision
// Q1) and a stand-in for F03's roster (assignments per user), plus operation builders. Synthetic data only.
import { sql } from 'kysely';
import { v7 as uuidv7 } from 'uuid';
import type { LightMyRequestResponse } from 'fastify';
import { TEST_PASSWORD, loginIdOf, type PersonaKey } from '../../../../e2e/fixtures/personas.ts';
import { scopeProvider } from '../../src/modules/sync/scope.ts';
import { startHarness, type Harness } from '../support/harness.ts';
import { syncProbeHandler } from '../support/sync-probe.ts';

export const DEVICE = '0190a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a2b';
/** Synthetic class ids (F03 adds real classes). */
export const CLASS_A1 = '0190a1b2-c3d4-7e5f-8a6b-000000000a01';
export const CLASS_A2 = '0190a1b2-c3d4-7e5f-8a6b-000000000a02';

export interface SyncHarness {
  h: Harness;
  /** userId → assigned class ids (what F03 will load from its tables). */
  assignments: Map<string, string[]>;
}

export async function startSyncHarness(): Promise<SyncHarness> {
  const assignments = new Map<string, string[]>();
  const h = await startHarness({
    testSync: {
      handlers: [syncProbeHandler],
      scopes: scopeProvider(async (actor) => ({ assignedClassIds: assignments.get(actor.userId) ?? [], studentIds: [] })),
    },
  });
  return { h, assignments };
}

let seq = 0;

export interface OpInput {
  opId?: string;
  entity?: string;
  entityId?: string;
  opType?: 'CREATE' | 'UPDATE' | 'COMMAND';
  baseVersion?: number | null;
  fields?: Record<string, unknown>;
  dependsOn?: string[];
  command?: string;
}

export function op(input: OpInput = {}): Record<string, unknown> {
  const opType = input.opType ?? 'CREATE';
  return {
    opId: input.opId ?? uuidv7(),
    seq: ++seq,
    entity: input.entity ?? 'sync_probe',
    entityId: input.entityId ?? uuidv7(),
    opType,
    ...(input.command ? { command: input.command } : {}),
    baseVersion: input.baseVersion === undefined ? (opType === 'CREATE' ? null : 1) : input.baseVersion,
    fields: input.fields ?? { label: 'Probe', status: 'OPEN', classId: CLASS_A1 },
    dependsOn: input.dependsOn ?? [],
    clientSavedAt: '2026-11-08T10:00:00.000+05:00',
  };
}

/** Same operation, new batch position (a resend from the outbox). */
export const resend = (o: Record<string, unknown>) => ({ ...o, seq: ++seq });

export async function push(h: Harness, token: string, ops: Record<string, unknown>[], protocolVersion = 1): Promise<LightMyRequestResponse> {
  return h.call('POST', '/sync/push', token, { protocolVersion, deviceId: DEVICE, ops });
}

/** Pushes and returns the per-op results (asserting the request itself succeeded). */
export async function pushOk(h: Harness, token: string, ops: Record<string, unknown>[]): Promise<Array<Record<string, unknown>>> {
  const res = await push(h, token, ops);
  if (res.statusCode !== 200) throw new Error(`push failed ${res.statusCode}: ${res.body}`);
  return res.json().results;
}

export async function pull(h: Harness, token: string, query: Record<string, string> = {}): Promise<LightMyRequestResponse> {
  const qs = new URLSearchParams(query).toString();
  return h.call('GET', `/sync/pull${qs ? `?${qs}` : ''}`, token);
}

/** Signs in without two-factor (Teacher, Student, Parent) and returns both tokens. */
export async function signInTokens(h: Harness, who: PersonaKey): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await h.call('POST', '/auth/sign-in', null, { loginId: loginIdOf(who), password: TEST_PASSWORD });
  const body = res.json();
  if (body.step !== 'SIGNED_IN') throw new Error(`sign-in as ${who}: ${res.body}`);
  return { accessToken: body.accessToken, refreshToken: body.refreshToken };
}

export async function count(h: Harness, table: string, where = sql`TRUE`): Promise<number> {
  const { rows } = await sql<{ n: string }>`SELECT count(*) AS n FROM ${sql.table(table)} WHERE ${where}`.execute(h.db);
  return Number(rows[0]!.n);
}

export async function probeRow(h: Harness, id: string): Promise<Record<string, unknown> | undefined> {
  const { rows } = await sql<Record<string, unknown>>`SELECT * FROM sync_probe WHERE id = ${id}`.execute(h.db);
  return rows[0];
}

export async function orgIdOf(h: Harness, who: PersonaKey): Promise<string> {
  const id = await h.userId(who);
  const row = await h.db.selectFrom('users').select('organization_id').where('id', '=', id).executeTakeFirstOrThrow();
  return row.organization_id;
}

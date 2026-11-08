// F12 · Offline and synchronization — API E2E (docs/specs/04-f12-offline-sync.md)
// Sync protocol checks against the server. Device journeys: e2e/mobile/f12-sync/.
import { randomBytes, randomUUID } from 'node:crypto';
import type { APIRequestContext, APIResponse } from '@playwright/test';
import { expect, test } from './support/fixtures';

// Tests that push or pull real records, portions, attempts, attendance, or homework stay test.fixme until the
// feature that owns the entity registers its sync handler (F03/F04/F05/F08; user decision 2026-11-08).

const CONTROL_SECRET = process.env.E2E_CONTROL_SECRET ?? 'local-e2e-control-secret';
const controlHeaders = { 'x-test-control-secret': CONTROL_SECRET };

/** A canonical lowercase UUIDv7, as the app generates for offline-created entities and op IDs. */
function uuidv7(): string {
  const bytes = randomBytes(16);
  const ms = BigInt(Date.now());
  for (let i = 0; i < 6; i++) bytes[i] = Number((ms >> BigInt(8 * (5 - i))) & 0xffn);
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** A well-formed push envelope with one CREATE operation. */
function pushBody(protocolVersion: number, opId = uuidv7()) {
  return {
    protocolVersion,
    deviceId: randomUUID(),
    ops: [
      {
        opId,
        seq: 1,
        entity: 'daily_record',
        entityId: uuidv7(),
        opType: 'CREATE',
        baseVersion: null,
        fields: {},
        dependsOn: [],
        clientSavedAt: new Date().toISOString(),
      },
    ],
  };
}

const errorCode = async (res: APIResponse) => (await res.json()).error?.code;

/** Test control's view of one operation: 200 when the server stored a result for it, 404 when it never did. */
async function storedOpStatus(request: APIRequestContext, opId: string): Promise<number> {
  return (await request.get(`/__test/sync/ops/${opId}`, { headers: controlHeaders })).status();
}

test.describe('F12 · Offline and synchronization', { tag: '@F12' }, () => {
  // Waits for F05 (daily records) to register its sync handler.
  test.fixme('F12-AC3 (US-051) the server keeps the client-generated UUID', async () => {
    // Push a create operation with client UUIDv7 X; the stored record ID is X; later pulls return X.
  });

  // Waits for F05 (daily records, portions, attempts).
  test.fixme('F12-AC4 (US-052) a record must exist before its dependent portions and attempts', async () => {
    // Push an attempt whose record has not been pushed → refused as out of order, not applied.
    // Push record, portion, attempt in order → all applied.
  });

  // Waits for F04 (attendance), F05 (records, attempts) and F08 (homework portions).
  test.fixme('F12-AC5 (US-052) replaying an applied op_id returns the stored result and creates nothing', async () => {
    // Push the same operation twice for a record, an attempt, attendance, and a homework portion;
    // second responses equal the first; counts are unchanged.
  });

  // Waits for F03 (roster: students S1/S3 and class assignments) and F05 (records).
  test.fixme('F12-AC7 (US-052) a pull returns only changes since the cursor, within scope', async () => {
    // teacher.a2 changes S3 and teacher.a1 changes S1 after cursor C.
    // teacher.a1 pull(C) returns the S1 change only.
  });

  // Waits for F05 (portions).
  test.fixme('F12-AC11 (US-054) concurrent edits from one base version create a conflict', async () => {
    // Two operations change the same portion status from base version v1; the second returns conflict;
    // the server keeps both versions; the record is action required; neither overwrote the other.
  });

  // Waits for F05 (portions).
  test.fixme('F12-AC12 (US-054) the author or an Admin resolves a conflict as an audited change', async () => {
    // As teacher.a1 resolve by choosing one version; the record has it; the conflict is closed; audit present.
  });

  // Waits for F05 (portions).
  test.fixme('F12-AC13 (US-054) a non-meaningful field merges without a conflict', async () => {
    // Two operations change display order from the same base version → no conflict; documented merge applied.
  });

  test('F12-AC14 (US-052) a revoked Teacher gets "access revoked" on sync', async ({ as, signIn, control, anon }) => {
    const teacher = await signIn('teacher.a1');
    // Before removal the same session may sync.
    expect((await teacher.api.get('/sync/pull')).status()).toBe(200);

    // admin.a removes teacher.a1's access to Madrasa A (account deactivation).
    const admin = await as('admin.a');
    expect((await admin.post(`/accounts/${await control.userIdOf('teacher.a1')}/deactivate`)).status()).toBe(200);

    const opId = uuidv7();
    const push = await teacher.api.post('/sync/push', { data: pushBody(1, opId) });
    expect(push.status()).toBe(403);
    expect(await errorCode(push)).toBe('ACCESS_REVOKED');

    const pull = await teacher.api.get('/sync/pull');
    expect(pull.status()).toBe(403);
    expect(await errorCode(pull)).toBe('ACCESS_REVOKED');

    // Nothing from the refused push was stored.
    expect(await storedOpStatus(anon, opId)).toBe(404);
  });

  test('F12-AC15 (US-052) an unsupported protocol version gets "upgrade required"', async ({ as, control, anon }) => {
    const teacher = await as('teacher.a1');
    const raise = await anon.post('/__test/sync/min-protocol', { headers: controlHeaders, data: { version: 2 } });
    expect(raise.ok()).toBe(true);
    expect((await raise.json()).minProtocolVersion).toBe(2);

    const opId = uuidv7();
    const push = await teacher.post('/sync/push', { data: pushBody(1, opId) });
    expect(push.status()).toBe(426);
    expect(await errorCode(push)).toBe('UPGRADE_REQUIRED');
    // Nothing applied: the operation was never stored.
    expect(await storedOpStatus(anon, opId)).toBe(404);

    // Pull is refused too, whether the app sends its version or not (absent means version 1).
    for (const query of ['?protocolVersion=1', '']) {
      const pull = await teacher.get(`/sync/pull${query}`);
      expect(pull.status()).toBe(426);
      expect(await errorCode(pull)).toBe('UPGRADE_REQUIRED');
    }

    // An app at the minimum protocol is accepted.
    expect((await teacher.get('/sync/pull?protocolVersion=2')).status()).toBe(200);

    // Reset clears the raised minimum: the old app's push is processed again and gets a per-operation result.
    await control.reset();
    const again = await as('teacher.a1');
    const accepted = await again.post('/sync/push', { data: pushBody(1, opId) });
    expect(accepted.status()).toBe(200);
    expect((await accepted.json()).results).toHaveLength(1);
    expect((await again.get('/sync/pull?protocolVersion=1')).status()).toBe(200);
  });

  // Added by the decision review of 2026-10-30 (SRS §17).
  // Waits for F05 (portions) to create a real conflict.
  test.fixme('F12-AC17 (US-054) only the conflict author or an Admin can resolve a conflict', async () => {
    // Given a conflict caused by Teacher A, when Teacher B, who is also assigned to the student, tries to resolve it, then it is refused.
  });
});

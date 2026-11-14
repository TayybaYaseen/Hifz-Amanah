// F12 · Offline and synchronization — removed access answers 403 ACCESS_REVOKED (F12-AC14, US-052; NFR-OFF-010,
// plan §5 "Identity change"). Every other session ending keeps 401 SESSION_EXPIRED.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { revokeSessions } from '../../src/modules/identity/sessions.ts';
import { CLASS_A1, count, op, pull, push, signInTokens, startSyncHarness, type SyncHarness } from './support.ts';

let s: SyncHarness;

beforeAll(async () => {
  s = await startSyncHarness();
}, 60_000);

afterAll(async () => {
  await s?.h.stop();
});

beforeEach(async () => {
  await s.h.reset();
  s.assignments.clear();
  s.assignments.set(await s.h.userId('teacher.a1'), [CLASS_A1]);
});

async function expectCode(res: { statusCode: number; json(): { error: { code: string } } }, status: number, code: string) {
  expect(res.statusCode).toBe(status);
  expect(res.json().error.code).toBe(code);
}

describe('F12 · access revoked', () => {
  it('F12-AC14 (US-052) a deactivated Teacher gets 403 ACCESS_REVOKED on push, pull, refresh, and other requests', async () => {
    const teacher = await signInTokens(s.h, 'teacher.a1');
    const admin = await s.h.signIn('admin.a');
    expect((await s.h.call('POST', `/accounts/${await s.h.userId('teacher.a1')}/deactivate`, admin)).statusCode).toBe(200);

    await expectCode(await push(s.h, teacher.accessToken, [op()]), 403, 'ACCESS_REVOKED');
    await expectCode(await pull(s.h, teacher.accessToken), 403, 'ACCESS_REVOKED');
    await expectCode(await s.h.call('POST', '/auth/refresh', null, { refreshToken: teacher.refreshToken }), 403, 'ACCESS_REVOKED');
    await expectCode(await s.h.call('GET', '/me', teacher.accessToken), 403, 'ACCESS_REVOKED');
    expect(await count(s.h, 'sync_probe')).toBe(0);
  });

  it('F12-AC14 (US-052) a revoked membership answers 403 ACCESS_REVOKED, with or without the sessions revoked', async () => {
    const teacher = await signInTokens(s.h, 'teacher.a1');
    const userId = await s.h.userId('teacher.a1');
    await s.h.db.updateTable('memberships').set({ status: 'REVOKED', revoked_at: s.h.clock.now() }).where('user_id', '=', userId).execute();
    await expectCode(await push(s.h, teacher.accessToken, [op()]), 403, 'ACCESS_REVOKED');
    await revokeSessions(s.h.db, userId, s.h.clock.now(), 'MEMBERSHIP_REVOKED');
    await expectCode(await pull(s.h, teacher.accessToken), 403, 'ACCESS_REVOKED');
    await expectCode(await s.h.call('POST', '/auth/refresh', null, { refreshToken: teacher.refreshToken }), 403, 'ACCESS_REVOKED');
  });

  it('F12-AC14 (US-052) sign-out and a password reset still answer 401 SESSION_EXPIRED', async () => {
    const signedOut = await signInTokens(s.h, 'teacher.a1');
    expect((await s.h.call('POST', '/auth/sign-out', signedOut.accessToken, {})).statusCode).toBe(204);
    await expectCode(await push(s.h, signedOut.accessToken, [op()]), 401, 'SESSION_EXPIRED');
    await expectCode(await s.h.call('POST', '/auth/refresh', null, { refreshToken: signedOut.refreshToken }), 401, 'SESSION_EXPIRED');

    const reset = await signInTokens(s.h, 'teacher.a1');
    const admin = await s.h.signIn('admin.a');
    const res = await s.h.call('POST', `/accounts/${await s.h.userId('teacher.a1')}/password`, admin, { newPassword: 'Fresh-Synthetic-Pass-9' });
    expect(res.statusCode).toBe(204);
    await expectCode(await pull(s.h, reset.accessToken), 401, 'SESSION_EXPIRED');
    await expectCode(await s.h.call('POST', '/auth/refresh', null, { refreshToken: reset.refreshToken }), 401, 'SESSION_EXPIRED');
  });
});

// F01 · Identity and authentication — API E2E (docs/specs/01-f01-identity-authentication.md)
// Server-enforced behaviour. Screen journeys: e2e/mobile/f01-identity/.
import { randomUUID } from 'node:crypto';
import type { APIRequestContext, APIResponse } from '@playwright/test';
import { TEST_PASSWORD } from '../fixtures/personas';
import { expect, test, toLoginId, type Who } from './support/fixtures';

const MINUTE = 60_000;
const NEW_PASSWORD = 'Fresh-Pass-2026';

const signInRaw = (anon: APIRequestContext, loginId: string, password: string) =>
  anon.post('/auth/sign-in', { data: { loginId, password } });

async function refusal(response: APIResponse) {
  return { status: response.status(), body: await response.json() };
}

/** A 6-digit code guaranteed to differ from `otp`. */
const wrongCode = (otp: string) => ((Number(otp) + 1) % 1_000_000).toString().padStart(6, '0');

test.describe('F01 · Identity and authentication', { tag: '@F01' }, () => {
  test('F01-AC2 (US-001) an email in the User ID field fails exactly like a wrong password', async ({ anon }) => {
    const byEmail = await refusal(await signInRaw(anon, 'teacher.a1@example.test', TEST_PASSWORD));
    const wrongPassword = await refusal(await signInRaw(anon, toLoginId('teacher.a1'), 'Not-The-Password-1'));
    expect(byEmail.status).toBe(401);
    expect(byEmail).toEqual(wrongPassword);
    expect(byEmail.body).not.toHaveProperty('accessToken');
  });

  test('F01-AC3 (US-001) wrong password and unknown User ID return the same message', async ({ anon }) => {
    const wrongPassword = await refusal(await signInRaw(anon, toLoginId('teacher.a1'), 'Not-The-Password-1'));
    const unknown = await refusal(await signInRaw(anon, 'no-such-user', 'Not-The-Password-1'));
    expect(wrongPassword).toEqual(unknown);
    expect(wrongPassword.body.error.message).toBe('User ID or password is incorrect');
  });

  test('F01-AC4 (US-001) lockout looks the same for existing and unknown User IDs', async ({ anon, control }) => {
    test.setTimeout(240_000); // progressive delay (DEC-B67) makes each run of 11 failures take ~31 s
    const fail = async (loginId: string) => {
      let last: Awaited<ReturnType<typeof refusal>> | undefined;
      for (let i = 0; i < 11; i++) last = await refusal(await signInRaw(anon, loginId, 'Not-The-Password-1'));
      return last!;
    };
    const existing = await fail(toLoginId('teacher.a1'));
    const unknown = await fail('no-such-user');
    expect(existing).toEqual(unknown);

    const during = await refusal(await signInRaw(anon, toLoginId('teacher.a1'), TEST_PASSWORD));
    expect(during).toEqual(unknown);

    await control.advanceClock(15 * MINUTE + 1000);
    const after = await signInRaw(anon, toLoginId('teacher.a1'), TEST_PASSWORD);
    expect(after.status()).toBe(200);
    expect((await after.json()).step).toBe('SIGNED_IN');
  });

  test('F01-AC5 (US-001) sign-out revokes the refresh token and the session', async ({ signIn, anon }) => {
    const session = await signIn('teacher.a1');
    expect((await session.api.get('/me')).status()).toBe(200);
    expect((await session.api.post('/auth/sign-out')).status()).toBe(204);

    expect((await session.api.get('/me')).status()).toBe(401);
    const refreshed = await anon.post('/auth/refresh', { data: { refreshToken: session.refreshToken } });
    expect(refreshed.status()).toBe(401);
  });

  test('F01-AC7 (US-002) reset OTP is emailed only to the account email', async ({ anon, control }) => {
    const res = await anon.post('/auth/password-reset/request', { data: { loginId: toLoginId('student.s1') } });
    expect(res.status()).toBe(202);
    expect(await control.sentEmails('student.s1')).toBe(1);
    expect(await control.emailRecipients('student.s1')).toEqual(['family1@example.test']);
    // parent.p1 shares the email but asked for nothing, so no OTP was issued for it.
    expect(await control.sentEmails('parent.p1')).toBe(0);
  });

  test('F01-AC8 (US-002) unknown User ID or no email gives the same neutral response and sends nothing', async ({ anon, control }) => {
    const ask = async (loginId: string) => refusal(await anon.post('/auth/password-reset/request', { data: { loginId } }));
    const known = await ask(toLoginId('teacher.a1'));
    const unknown = await ask('no-such-user');
    const noEmail = await ask(toLoginId('student.s3'));
    expect(unknown).toEqual(known);
    expect(noEmail).toEqual(known);
    expect(await control.sentEmails('no-such-user')).toBe(0);
    expect(await control.sentEmails('student.s3')).toBe(0);
  });

  test('F01-AC9 (US-002) expired or over-tried OTP is rejected and the password is unchanged', async ({ anon, control }) => {
    const loginId = toLoginId('teacher.a1');
    const confirm = (otp: string) =>
      anon.post('/auth/password-reset/confirm', { data: { loginId, otp, newPassword: NEW_PASSWORD } });

    await anon.post('/auth/password-reset/request', { data: { loginId } });
    const expired = (await control.latestOtp('teacher.a1'))!;
    await control.advanceClock(10 * MINUTE + 1000);
    const late = await confirm(expired);
    expect(late.status()).toBe(400);
    expect((await late.json()).error.code).toBe('OTP_INVALID');

    await anon.post('/auth/password-reset/request', { data: { loginId } });
    const otp = (await control.latestOtp('teacher.a1'))!;
    for (let i = 0; i < 5; i++) expect((await confirm(wrongCode(otp))).status()).toBe(400);
    const overTried = await confirm(otp);
    expect(overTried.status()).toBe(400);
    expect((await overTried.json()).error.code).toBe('OTP_INVALID');

    expect((await signInRaw(anon, loginId, TEST_PASSWORD)).status()).toBe(200);
    expect((await signInRaw(anon, loginId, NEW_PASSWORD)).status()).toBe(401);
  });

  test('F01-AC10 (US-002) a valid OTP reset changes the password, revokes sessions, and audits safely', async ({ anon, control, signIn }) => {
    const loginId = toLoginId('teacher.a1');
    const first = await signIn('teacher.a1');
    const second = await signIn('teacher.a1');

    await anon.post('/auth/password-reset/request', { data: { loginId } });
    const otp = (await control.latestOtp('teacher.a1'))!;
    const reset = await anon.post('/auth/password-reset/confirm', { data: { loginId, otp, newPassword: NEW_PASSWORD } });
    expect(reset.status()).toBe(204);

    expect((await first.api.get('/me')).status()).toBe(401);
    expect((await second.api.get('/me')).status()).toBe(401);
    expect((await signInRaw(anon, loginId, NEW_PASSWORD)).status()).toBe(200);

    const audit = await control.auditFor('teacher.a1');
    expect(audit.some((e) => e.action === 'PASSWORD_RESET')).toBe(true);
    const text = JSON.stringify(audit);
    for (const secret of [otp, NEW_PASSWORD, TEST_PASSWORD, first.accessToken, first.refreshToken]) {
      expect(text).not.toContain(secret);
    }
  });

  test('F01-AC11 (US-002) OTP requests over the limit send nothing until the window passes', async ({ anon, control }) => {
    const ask = () => anon.post('/auth/password-reset/request', { data: { loginId: toLoginId('teacher.a1') } });
    for (let i = 0; i < 3; i++) await ask();
    expect(await control.sentEmails('teacher.a1')).toBe(3);
    expect((await ask()).status()).toBe(202);
    expect(await control.sentEmails('teacher.a1')).toBe(3);

    await control.advanceClock(60 * MINUTE + 1000);
    await ask();
    expect(await control.sentEmails('teacher.a1')).toBe(4);
  });

  test('F01-AC12 (US-003) Admin creates Teacher, Student, and Parent accounts with audit events', async ({ as, signIn, control }) => {
    const admin = await as('admin.a');
    for (const role of ['TEACHER', 'STUDENT', 'PARENT'] as const) {
      const loginId = `ALIF-NEW-${role}`;
      const created = await admin.post('/accounts', { data: { loginId, displayName: `New ${role}`, role, password: NEW_PASSWORD } });
      expect(created.status()).toBe(201);
      expect((await created.json()).role).toBe(role);

      const me = await (await signIn(loginId, NEW_PASSWORD)).api.get('/me');
      const body = await me.json();
      expect(body.role).toBe(role);
      expect(body.organization.name).toBe('Madrasa Alif (test)');
      expect((await control.auditFor(loginId)).map((e) => e.action)).toContain('ACCOUNT_CREATED');
    }
  });

  test('F01-AC13 (US-003) non-admins cannot create accounts', async ({ as, anon }) => {
    for (const persona of ['teacher.a1', 'student.s1', 'parent.p1'] as const) {
      const api = await as(persona);
      const loginId = `ALIF-BY-${persona.split('.')[0]!.toUpperCase()}`;
      const res = await api.post('/accounts', { data: { loginId, displayName: 'Nope', role: 'STUDENT', password: NEW_PASSWORD } });
      expect(res.status()).toBe(403);
      expect((await signInRaw(anon, loginId, NEW_PASSWORD)).status()).toBe(401);
    }
  });

  test('F01-AC14 (US-003) a duplicate User ID is rejected', async ({ as }) => {
    const admin = await as('admin.a');
    const res = await admin.post('/accounts', {
      data: { loginId: toLoginId('teacher.a1'), displayName: 'Duplicate', role: 'TEACHER', password: NEW_PASSWORD },
    });
    expect(res.status()).toBe(409);
    expect((await res.json()).error.message).toBe('User ID already in use');
  });

  test('F01-AC15 (US-004) the initial password is never stored or logged in plain text', async ({ as, control }) => {
    const admin = await as('admin.a');
    const password = `Plain-${randomUUID().slice(0, 12)}`;
    const res = await admin.post('/accounts', { data: { loginId: 'ALIF-T900', displayName: 'Hash Only', role: 'TEACHER', password } });
    expect(res.status()).toBe(201);
    // The search really reaches the data and the logs: it finds the new User ID and the logged route.
    expect((await control.search('ALIF-T900')).database).toBeGreaterThan(0);
    expect((await control.search('/accounts')).logs).toBeGreaterThan(0);
    const found = await control.search(password);
    expect(found.database).toBe(0);
    expect(found.logs).toBe(0);
    expect(JSON.stringify(await control.auditFor('ALIF-T900'))).not.toContain(password);
  });

  test('F01-AC16 (US-004) an initial password that breaks the policy is rejected', async ({ as, anon }) => {
    const admin = await as('admin.a');
    const res = await admin.post('/accounts', { data: { loginId: 'ALIF-T901', displayName: 'Short', role: 'TEACHER', password: 'Abc-123' } });
    expect(res.status()).toBe(400);
    expect((await res.json()).error.fields).toEqual({ password: 'PASSWORD_TOO_SHORT' });
    expect((await signInRaw(anon, 'ALIF-T901', 'Abc-123')).status()).toBe(401);
  });

  test('F01-AC18 (US-005) a Parent may share a Student email', async ({ as }) => {
    const admin = await as('admin.a');
    const res = await admin.post('/accounts', {
      data: { loginId: 'ALIF-P900', displayName: 'Shared Email Parent', role: 'PARENT', email: 'family1@example.test', password: NEW_PASSWORD },
    });
    expect(res.status()).toBe(201);
    expect((await res.json()).email).toBe('family1@example.test');
  });

  test('F01-AC19 (US-005) resetting the Parent never touches the Student sharing its email', async ({ anon, control, signIn }) => {
    const student = await signIn('student.s1');
    const parentId = toLoginId('parent.p1');
    await anon.post('/auth/password-reset/request', { data: { loginId: parentId } });
    const otp = (await control.latestOtp('parent.p1'))!;
    expect((await anon.post('/auth/password-reset/confirm', { data: { loginId: parentId, otp, newPassword: NEW_PASSWORD } })).status()).toBe(204);

    expect((await student.api.get('/me')).status()).toBe(200);
    expect((await signInRaw(anon, toLoginId('student.s1'), TEST_PASSWORD)).status()).toBe(200);
    expect((await signInRaw(anon, parentId, NEW_PASSWORD)).status()).toBe(200);
  });

  // The Madrasa B record probed is teacher.b1's account; student records (SB1) arrive with F03.
  test('F01-AC20 (US-006) a Madrasa B ID requested from Madrasa A returns not found', async ({ as, control }) => {
    const madrasaB = await control.userIdOf('teacher.b1');
    const missing = randomUUID();
    for (const persona of ['teacher.a2', 'admin.a'] as const) {
      const api = await as(persona);
      const other = await refusal(await api.get(`/accounts/${madrasaB}`));
      const none = await refusal(await api.get(`/accounts/${missing}`));
      expect(other.status).toBe(404);
      expect(other).toEqual(none);
    }
    // The same Admin can read an account in its own madrasa, so the 404 above is the tenant boundary.
    const admin = await as('admin.a');
    expect((await admin.get(`/accounts/${await control.userIdOf('teacher.a1')}`)).status()).toBe(200);
  });

  test('F01-AC21 (US-006) deactivating the Madrasa A account leaves the Madrasa B account working', async ({ as, anon, control }) => {
    const admin = await as('admin.a');
    expect((await admin.post(`/accounts/${await control.userIdOf('teacher.a2')}/deactivate`)).status()).toBe(200);
    const b = await signInRaw(anon, toLoginId('teacher.b1'), TEST_PASSWORD);
    expect(b.status()).toBe(200);
    expect((await b.json()).step).toBe('SIGNED_IN');
  });

  test('F01-AC22 (US-006) a deactivated account cannot sign in and loses its sessions', async ({ as, anon, signIn, control }) => {
    const teacher = await signIn('teacher.a2');
    const admin = await as('admin.a');
    const res = await admin.post(`/accounts/${await control.userIdOf('teacher.a2')}/deactivate`);
    expect((await res.json()).status).toBe('DEACTIVATED');

    expect((await teacher.api.get('/me')).status()).toBe(401);
    expect((await anon.post('/auth/refresh', { data: { refreshToken: teacher.refreshToken } })).status()).toBe(401);
    expect((await signInRaw(anon, toLoginId('teacher.a2'), TEST_PASSWORD)).status()).toBe(401);
  });

  // Added by the decision review of 2026-10-30 (SRS §17).
  test('F01-AC23 (US-004) the password policy is 8–64 characters with a common-password and User ID blocklist', async ({ as, signIn }) => {
    const admin = await as('admin.a');
    let n = 0;
    const create = async (password: string, loginId = `ALIF-PW${++n}`) =>
      admin.post('/accounts', { data: { loginId, displayName: 'Policy', role: 'STUDENT', password } });
    const issue = async (res: APIResponse) => (await res.json()).error?.fields?.password;

    expect(await issue(await create('Abc-123'))).toBe('PASSWORD_TOO_SHORT');
    expect(await issue(await create('x'.repeat(30) + 'y'.repeat(35)))).toBe('PASSWORD_TOO_LONG');
    expect(await issue(await create('Password123'))).toBe('PASSWORD_TOO_COMMON');
    expect(await issue(await create('alif-pw-self', 'ALIF-PW-SELF'))).toBe('PASSWORD_EQUALS_USER_ID');

    // No composition rules: lower-case only, spaces, Urdu letters, exactly 8 and exactly 64 characters.
    for (const ok of ['qmvzrtke', 'a calm river', 'حفظ امانہ پاسورڈ', 'k'.repeat(30) + 'j'.repeat(34)]) {
      expect((await create(ok)).status()).toBe(201);
    }

    // The same policy applies when the user sets their own password.
    const teacher = await signIn('teacher.a1');
    const own = await teacher.api.post('/me/password', { data: { currentPassword: TEST_PASSWORD, newPassword: 'Abc-123' } });
    expect(own.status()).toBe(400);
    expect((await own.json()).error.fields).toEqual({ newPassword: 'PASSWORD_TOO_SHORT' });
  });

  test('F01-AC24 (US-003) User IDs are global, case-insensitive, 3–32 letters, digits, and hyphens', async ({ as }) => {
    const admin = await as('admin.a');
    expect(await (await admin.get('/accounts/login-id-suggestion')).json()).toEqual({ prefix: 'ALIF-' });

    const create = (loginId: string) =>
      admin.post('/accounts', { data: { loginId, displayName: 'Format', role: 'TEACHER', password: NEW_PASSWORD } });
    const caseOnly = await create(toLoginId('teacher.a1').toUpperCase());
    expect(caseOnly.status()).toBe(409);
    expect((await caseOnly.json()).error.message).toBe('User ID already in use');
    // A Madrasa B User ID is taken too: User IDs are global.
    expect((await create(toLoginId('teacher.b1'))).status()).toBe(409);

    for (const bad of ['ab', 'a'.repeat(33), 'bad.id', 'bad id', 'bad_id', 'نام-123']) {
      const res = await create(bad);
      expect(res.status()).toBe(400);
      expect((await res.json()).error.fields).toEqual({ loginId: 'LOGIN_ID_FORMAT' });
    }
    expect((await create('abc')).status()).toBe(201);
    expect((await create('A'.repeat(32))).status()).toBe(201);
  });

  test('F01-AC25 (US-001) 10 failures in 15 minutes lock the account for 15 minutes', async ({ anon, as, control }) => {
    test.setTimeout(180_000);
    const loginId = toLoginId('teacher.a1');
    for (let i = 0; i < 10; i++) await signInRaw(anon, loginId, 'Not-The-Password-1');

    const locked = await refusal(await signInRaw(anon, loginId, TEST_PASSWORD));
    const unknown = await refusal(await signInRaw(anon, 'no-such-user', TEST_PASSWORD));
    expect(locked.status).toBe(401);
    expect(locked).toEqual(unknown);

    expect((await control.auditFor('teacher.a1')).map((e) => e.action)).toContain('ACCOUNT_LOCKED');
    const admin = await as('admin.a');
    const account = await (await admin.get(`/accounts/${await control.userIdOf('teacher.a1')}`)).json();
    expect(account.lockedUntil).not.toBeNull();

    await control.advanceClock(14 * MINUTE);
    expect((await signInRaw(anon, loginId, TEST_PASSWORD)).status()).toBe(401);
    await control.advanceClock(MINUTE + 1000);
    expect((await signInRaw(anon, loginId, TEST_PASSWORD)).status()).toBe(200);
  });

  test('F01-AC26 (US-002) an Admin can reset a user password directly; only the Owner resets an Admin', async ({ as, anon, signIn, control }) => {
    const teacher = await signIn('teacher.a1');
    const admin = await as('admin.a');
    const teacherId = await control.userIdOf('teacher.a1');
    expect((await admin.post(`/accounts/${teacherId}/password`, { data: { newPassword: NEW_PASSWORD } })).status()).toBe(204);
    expect((await teacher.api.get('/me')).status()).toBe(401);
    expect((await signInRaw(anon, toLoginId('teacher.a1'), NEW_PASSWORD)).status()).toBe(200);
    expect((await control.auditFor('teacher.a1')).map((e) => e.action)).toContain('PASSWORD_RESET');

    // Student with no email: the Admin can still reset it (FR-AUTH-015).
    expect((await admin.post(`/accounts/${await control.userIdOf('student.s3')}/password`, { data: { newPassword: NEW_PASSWORD } })).status()).toBe(204);

    const adminId = await control.userIdOf('admin.a');
    expect((await admin.post(`/accounts/${adminId}/password`, { data: { newPassword: NEW_PASSWORD } })).status()).toBe(403);
    expect((await admin.post(`/accounts/${await control.userIdOf('owner.a')}/password`, { data: { newPassword: NEW_PASSWORD } })).status()).toBe(403);

    const owner = await as('owner.a');
    expect((await owner.post(`/accounts/${adminId}/password`, { data: { newPassword: NEW_PASSWORD } })).status()).toBe(204);
  });

  test('F01-AC28 (US-071) changing your own password needs the current password and revokes other sessions', async ({ signIn, anon, control }) => {
    const here = await signIn('teacher.a1');
    const elsewhere = await signIn('teacher.a1');

    const wrong = await here.api.post('/me/password', { data: { currentPassword: 'Not-The-Password-1', newPassword: NEW_PASSWORD } });
    expect(wrong.status()).toBe(400);
    expect((await wrong.json()).error.code).toBe('CURRENT_PASSWORD_INCORRECT');
    expect((await elsewhere.api.get('/me')).status()).toBe(200);
    expect((await signInRaw(anon, toLoginId('teacher.a1'), TEST_PASSWORD)).status()).toBe(200);

    const ok = await here.api.post('/me/password', { data: { currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD } });
    expect(ok.status()).toBe(204);
    expect((await here.api.get('/me')).status()).toBe(200);
    expect((await elsewhere.api.get('/me')).status()).toBe(401);
    expect((await signInRaw(anon, toLoginId('teacher.a1'), NEW_PASSWORD)).status()).toBe(200);
    expect((await control.auditFor('teacher.a1')).map((e) => e.action)).toContain('PASSWORD_CHANGED');
  });

  test('F01-AC29 (US-071) User ID, role, madrasa, and other users’ profiles cannot be changed from My profile', async ({ as, control }) => {
    const teacher = await as('teacher.a1');
    const before = await (await teacher.get('/me')).json();
    const otherId = await control.userIdOf('teacher.a2');
    for (const data of [
      { loginId: 'ALIF-HIJACK' },
      { role: 'ADMIN' },
      { organizationId: randomUUID() },
      { userId: otherId, displayName: 'Changed' },
      { id: otherId, displayName: 'Changed' },
    ]) {
      expect((await teacher.patch('/me', { data })).status()).toBe(400);
    }
    expect(await (await teacher.get('/me')).json()).toEqual(before);

    const other = await (await as('teacher.a2')).get('/me');
    expect((await other.json()).displayName).toBe('Test teacher.a2');

    // Display name and email remain editable; changing the email needs the current password (DEC-B69).
    const noPassword = await teacher.patch('/me', { data: { email: 'other@example.test' } });
    expect(noPassword.status()).toBe(400);
    const wrongPassword = await teacher.patch('/me', { data: { email: 'other@example.test', currentPassword: 'Not-The-Password-1' } });
    expect((await wrongPassword.json()).error.code).toBe('CURRENT_PASSWORD_INCORRECT');
    const edited = await teacher.patch('/me', { data: { displayName: 'Ustad One', email: null, currentPassword: TEST_PASSWORD } });
    expect(edited.status()).toBe(200);
    expect(await edited.json()).toMatchObject({ displayName: 'Ustad One', email: null, loginId: before.loginId, role: 'TEACHER' });
  });

  test('F01-AC31 (US-072) Owner/Admin sign-in needs an authenticator code or an unused recovery code', async ({ anon, control, signIn }) => {
    const loginId = toLoginId('owner.a');
    const first = await (await signInRaw(anon, loginId, TEST_PASSWORD)).json();
    expect(first).toEqual({ step: 'TWO_FACTOR_REQUIRED', challengeToken: expect.any(String) });
    expect(first).not.toHaveProperty('accessToken');

    const bad = await anon.post('/auth/two-factor/verify', { data: { challengeToken: first.challengeToken, code: '000000' } });
    expect(bad.status()).toBe(400);
    const good = await anon.post('/auth/two-factor/verify', {
      data: { challengeToken: first.challengeToken, code: await control.totpFor('owner.a') },
    });
    expect((await good.json()).step).toBe('SIGNED_IN');

    // Get recovery codes, then use one twice.
    const owner = await signIn('owner.a');
    const { recoveryCodes } = await (
      await owner.api.post('/me/two-factor/recovery-codes', { data: { code: await control.totpFor('owner.a') } })
    ).json();
    const viaCode = async () => {
      const step = await (await signInRaw(anon, loginId, TEST_PASSWORD)).json();
      return anon.post('/auth/two-factor/verify', { data: { challengeToken: step.challengeToken, recoveryCode: recoveryCodes[0] } });
    };
    expect((await viaCode()).status()).toBe(200);
    expect((await viaCode()).status()).toBe(400);
  });

  test('F01-AC32 (US-072) regenerating recovery codes needs recent sign-in and a code, and voids old codes', async ({ anon, control, signIn }) => {
    const loginId = toLoginId('admin.a');
    const admin = await signIn('admin.a');
    const regenerate = async (api: APIRequestContext, code: string) =>
      api.post('/me/two-factor/recovery-codes', { data: { code } });

    const first = await (await regenerate(admin.api, await control.totpFor('admin.a'))).json();
    expect(first.recoveryCodes).toHaveLength(10);
    const second = await (await regenerate(admin.api, await control.totpFor('admin.a'))).json();
    expect(second.recoveryCodes).toHaveLength(10);
    expect((await control.auditFor('admin.a')).filter((e) => e.action === 'RECOVERY_CODES_REGENERATED')).toHaveLength(2);

    const useCode = async (recoveryCode: string) => {
      const step = await (await signInRaw(anon, loginId, TEST_PASSWORD)).json();
      return anon.post('/auth/two-factor/verify', { data: { challengeToken: step.challengeToken, recoveryCode } });
    };
    expect((await useCode(first.recoveryCodes[0])).status()).toBe(400);
    expect((await useCode(second.recoveryCodes[0])).status()).toBe(200);

    // Without a valid authenticator code: refused.
    expect((await regenerate(admin.api, '000000')).status()).toBe(400);

    // Without a recent sign-in: refused, even with a valid code on a refreshed token.
    await control.advanceClock(16 * MINUTE);
    const refreshed = await (await anon.post('/auth/refresh', { data: { refreshToken: admin.refreshToken } })).json();
    const stale = await anon.post('/me/two-factor/recovery-codes', {
      headers: { Authorization: `Bearer ${refreshed.accessToken}` },
      data: { code: await control.totpFor('admin.a') },
    });
    expect(stale.status()).toBe(403);
    expect((await stale.json()).error.code).toBe('REAUTH_REQUIRED');
  });

  test('F01-AC33 (US-072) only the Owner resets an Admin’s two-factor setup', async ({ as, anon, signIn, control }) => {
    const admin = await signIn('admin.a');
    const adminId = await control.userIdOf('admin.a');
    expect((await admin.api.post(`/accounts/${await control.userIdOf('owner.a')}/two-factor/reset`)).status()).toBe(403);
    expect((await admin.api.post(`/accounts/${adminId}/two-factor/reset`)).status()).toBe(403);

    const owner = await as('owner.a');
    expect((await owner.post(`/accounts/${adminId}/two-factor/reset`)).status()).toBe(204);
    expect((await admin.api.get('/me')).status()).toBe(401);
    expect((await control.auditFor('admin.a')).map((e) => e.action)).toContain('TWO_FACTOR_RESET');

    // Next sign-in must set up two-factor again, and no session is issued until it is confirmed.
    const step = await (await signInRaw(anon, toLoginId('admin.a'), TEST_PASSWORD)).json();
    expect(step.step).toBe('TWO_FACTOR_SETUP_REQUIRED');
    const setup = await (await anon.post('/auth/two-factor/setup', { data: { challengeToken: step.challengeToken } })).json();
    expect(setup.otpauthUri).toMatch(/^otpauth:\/\/totp\//);
    const confirmed = await (
      await anon.post('/auth/two-factor/setup/confirm', { data: { challengeToken: step.challengeToken, code: await control.totpFor('admin.a') } })
    ).json();
    expect(confirmed.step).toBe('SIGNED_IN');
    expect(confirmed.recoveryCodes).toHaveLength(10);
  });

  test('F01-AC34 (US-072) Teacher, Student, and Parent sign-in has no two-factor step', async ({ anon }) => {
    for (const persona of ['teacher.a1', 'student.s1', 'parent.p1'] satisfies Who[]) {
      const body = await (await signInRaw(anon, toLoginId(persona), TEST_PASSWORD)).json();
      expect(body.step).toBe('SIGNED_IN');
      expect(body.accessToken).toEqual(expect.any(String));
    }
  });
});

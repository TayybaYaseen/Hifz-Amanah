// F02 · Organization and roles — API E2E (docs/specs/03-f02-organization-roles.md)
// Screen journeys: e2e/mobile/f02-organization/.
// Criteria parts that need classes and students (F03), daily records (F05), reports (F09), or guardian links and
// note visibility (F10, F05/F07) stay test.fixme until those features exist (docs/handover/F02-plan.md).
import { randomUUID } from 'node:crypto';
import type { APIRequestContext } from '@playwright/test';
import { expect, test } from './support/fixtures';

type AuditRow = { action: string; actor_user_id: string | null; target_id: string | null; summary: Record<string, unknown>; created_at: string };

const settings = async (api: APIRequestContext) => (await api.get('/organization')).json();

test.describe('F02 · Organization and roles', { tag: '@F02' }, () => {
  test('F02-AC1 (US-007) a new madrasa has Asia/Karachi, Monday, and SINGLE mode', async ({ control, signIn }) => {
    // The platform operator creates a madrasa and its first Owner (FR-ORG-001; done by test control); read its settings.
    const { organizationId } = await control.createWorkspace({ name: 'Madrasa Jeem (test)', code: 'JEEM', ownerLoginId: 'JEEM-owner' });
    const owner = (await signIn('JEEM-owner')).api;
    expect(await settings(owner)).toEqual({
      id: organizationId,
      name: 'Madrasa Jeem (test)',
      kind: 'MADRASA',
      timezone: 'Asia/Karachi',
      weekStart: 'MONDAY',
      dailyReportMode: 'SINGLE',
      canEdit: true,
    });
  });

  test('F02-AC2 (US-007) Owner and Admin settings changes are saved and audited', async ({ as, control }) => {
    // As owner.a change name; as admin.a change week start to SATURDAY. Settings reflect both; each change is audited.
    const owner = await as('owner.a');
    const admin = await as('admin.a');
    expect((await owner.patch('/organization', { data: { name: 'Madrasa Alif Renamed' } })).status()).toBe(200);
    expect((await admin.patch('/organization', { data: { weekStart: 'SATURDAY' } })).status()).toBe(200);

    const after = await settings(await as('teacher.a1'));
    expect(after).toMatchObject({ name: 'Madrasa Alif Renamed', weekStart: 'SATURDAY', canEdit: false });

    const audit = ((await control.auditForTarget(after.id)) as AuditRow[]).filter((r) => r.action === 'ORGANIZATION_UPDATED');
    expect(audit.map((r) => [r.actor_user_id, r.summary])).toEqual([
      [await control.userIdOf('owner.a'), { changes: { name: { from: 'Madrasa Alif (test)', to: 'Madrasa Alif Renamed' } } }],
      [await control.userIdOf('admin.a'), { changes: { weekStart: { from: 'MONDAY', to: 'SATURDAY' } } }],
    ]);
  });

  test.fixme('F02-AC2 (US-007) a weekly report generated after the change uses the new week start and timezone', async () => {
    // Waits for weekly reports (F09). As admin.a change week start to SATURDAY; a new weekly report starts on Saturday.
  });

  test('F02-AC3 (US-007) an empty workspace name is rejected and nothing is saved', async ({ as }) => {
    // As admin.a save name "" → field error; settings unchanged.
    const admin = await as('admin.a');
    const before = await settings(admin);
    for (const name of ['', '   ']) {
      const res = await admin.patch('/organization', { data: { name, weekStart: 'FRIDAY' } });
      expect(res.status()).toBe(400);
      expect((await res.json()).error).toMatchObject({ code: 'VALIDATION', fields: { name: 'REQUIRED' } });
    }
    expect(await settings(admin)).toEqual(before);
  });

  test('F02-AC4 (US-007) Teacher, Student, and Parent cannot update settings', async ({ as }) => {
    // Call the update endpoint as teacher.a1, student.s1, parent.p1 → forbidden; settings unchanged.
    const before = await settings(await as('owner.a'));
    for (const who of ['teacher.a1', 'student.s1', 'parent.p1'] as const) {
      const api = await as(who);
      expect(await settings(api), who).toEqual({ ...before, canEdit: false });
      const res = await api.patch('/organization', { data: { name: 'Hijacked', timezone: 'UTC' } });
      expect(res.status(), who).toBe(403);
      expect((await res.json()).error.code).toBe('FORBIDDEN');
    }
    expect(await settings(await as('owner.a'))).toEqual(before);
  });

  test.fixme('F02-AC5 (US-007) changing the timezone never changes stored report_date values', async () => {
    // Waits for daily records (F05). Record S1 on a known date; admin.a changes the timezone; the record still has that report_date.
  });

  test('F02-AC6 (US-008) a Teacher lists only students of assigned classes', async ({ as }) => {
    // As teacher.a1 list students → S1, S2 only (F03 supplies classes, students, and assignments).
    const res = await (await as('teacher.a1')).get('/students?status=ALL');
    expect(res.status()).toBe(200);
    expect(((await res.json()).items as Array<{ name: string }>).map((s) => s.name)).toEqual(['Test Student One', 'Test Student Two']);
  });

  test.fixme('F02-AC7 (US-008) out-of-scope student, record, and report IDs return not found', async () => {
    // Waits for F03/F05/F09. As teacher.a1 request S3, an S3 record, and an S3 report by ID; compare with random IDs → identical not found.
  });

  test.fixme('F02-AC8 (US-008) a Teacher removed from a class loses its data but stays recorder of old records', async () => {
    // Waits for F03/F05. teacher.a1 records S1; admin.a removes teacher.a1 from A1.
    // teacher.a1 list/pull returns no A1 data; as admin.a the old record still names teacher.a1 as recorder.
  });

  test('F02-AC9 (US-008) client-sent organization_id or role is rejected and grants nothing', async ({ as }) => {
    const admin = await as('admin.a');
    const before = await settings(admin);
    const other = await settings(await as('admin.b'));
    for (const extra of [{ organizationId: other.id }, { organization_id: other.id }, { role: 'OWNER' }]) {
      const res = await admin.patch('/organization', { data: { name: 'Moved', ...extra } });
      expect(res.status()).toBe(400);
      expect(Object.values((await res.json()).error.fields)).toContain('NOT_ALLOWED');
    }
    expect(await settings(admin)).toEqual(before);
    expect(await settings(await as('admin.b'))).toEqual(other);
    // A Teacher claiming a role in the body is refused too, and stays a Teacher.
    const teacher = await as('teacher.a1');
    expect((await teacher.patch('/organization', { data: { name: 'X', role: 'ADMIN' } })).status()).toBe(400);
    expect((await (await teacher.get('/me')).json()).role).toBe('TEACHER');
  });

  test.fixme('F02-AC9 (US-008) a record sent for a class the Teacher is not assigned to is rejected', async () => {
    // Waits for F03/F05. As teacher.a1 send a record for S1 with organization_id = Madrasa B, role ADMIN, class A2.
    // The record lands in Madrasa A with class A1, or is rejected; no privilege is gained.
  });

  test('F02-AC10 (US-009) account create, deactivate, role change, membership change, and password reset each write one audit record', async ({ as, control }) => {
    const owner = await as('owner.a');
    const ownerId = await control.userIdOf('owner.a');
    const created = await owner.post('/accounts', { data: { loginId: 'ALIF-audited', displayName: 'Audited', role: 'TEACHER', password: 'Created-Pass-2026' } });
    expect(created.status()).toBe(201);
    const id = (await created.json()).id as string;
    expect((await owner.post(`/accounts/${id}/all-classes`, { data: { allClasses: true } })).status()).toBe(200);
    expect((await owner.post(`/accounts/${id}/role`, { data: { role: 'ADMIN' } })).status()).toBe(200);
    expect((await owner.post(`/accounts/${id}/password`, { data: { newPassword: 'Reset-Pass-2026' } })).status()).toBe(204);
    expect((await owner.post(`/accounts/${id}/deactivate`)).status()).toBe(200);

    const audit = (await control.auditFor('ALIF-audited')) as AuditRow[];
    expect(audit.map((r) => r.action)).toEqual(['ACCOUNT_CREATED', 'ALL_CLASSES_SET', 'ADMIN_ADDED', 'PASSWORD_RESET', 'ACCOUNT_DEACTIVATED']);
    for (const row of audit) {
      expect(row).toMatchObject({ actor_user_id: ownerId, target_id: id });
      expect(Date.parse(row.created_at)).not.toBeNaN();
      expect(typeof row.summary).toBe('object');
    }
  });

  test.fixme('F02-AC10 (US-009) guardian link and note-visibility changes each write one audit record', async () => {
    // Waits for guardian links (F10) and note visibility (F05/F07).
  });

  test('F02-AC11 (US-009) reset and creation audits contain no password, OTP, or token', async ({ as, anon, control }) => {
    const admin = await as('admin.a');
    const secrets = { created: 'Created-Pass-2026', adminReset: 'Admin-Reset-2026', otpReset: 'Otp-Reset-Pass-2026' };
    await admin.post('/accounts', { data: { loginId: 'ALIF-secret', displayName: 'Secret', email: 'secret@example.test', role: 'TEACHER', password: secrets.created } });
    const id = await control.userIdOf('ALIF-secret');
    await admin.post(`/accounts/${id}/password`, { data: { newPassword: secrets.adminReset } });
    await anon.post('/auth/password-reset/request', { data: { loginId: 'ALIF-secret' } });
    const otp = (await control.latestOtp('ALIF-secret'))!;
    expect((await anon.post('/auth/password-reset/confirm', { data: { loginId: 'ALIF-secret', otp, newPassword: secrets.otpReset } })).status()).toBe(204);

    const text = JSON.stringify(await control.auditFor('ALIF-secret'));
    expect(text).toContain('PASSWORD_RESET');
    for (const secret of [...Object.values(secrets), otp]) expect(text).not.toContain(secret);
  });

  test('F02-AC12 (US-009) audit records cannot be edited or deleted by any role', async ({ as, control }) => {
    // As owner.a and admin.a try PUT/PATCH/DELETE on an audit record → not found or rejected; record unchanged.
    const owner = await as('owner.a');
    await owner.patch('/organization', { data: { name: 'Audited change' } });
    const orgId = (await settings(owner)).id as string;
    const before = await control.auditForTarget(orgId);
    const recordId = (before.at(-1) as { id: string }).id;
    for (const api of [owner, await as('admin.a')]) {
      for (const url of [`/audit/${recordId}`, `/audit-logs/${recordId}`, `/organization/audit/${recordId}`]) {
        expect((await api.put(url, { data: { action: 'TAMPERED' } })).status()).toBe(404);
        expect((await api.patch(url, { data: { action: 'TAMPERED' } })).status()).toBe(404);
        expect((await api.delete(url)).status()).toBe(404);
      }
    }
    expect(await control.auditForTarget(orgId)).toEqual(before);
  });

  test('F02-AC13 (US-009) a failed audit write rolls back the change', async ({ as, control }) => {
    // control: make the next audit write fail; as admin.a deactivate teacher.a2. Request fails; teacher.a2 is still active.
    const admin = await as('admin.a');
    const id = await control.userIdOf('teacher.a2');
    await control.failNextAuditWrite();
    const res = await admin.post(`/accounts/${id}/deactivate`);
    expect(res.status()).toBe(500);
    expect((await (await admin.get(`/accounts/${id}`)).json()).status).toBe('ACTIVE');
    expect(await control.auditFor('teacher.a2')).toEqual([]);
    // And the account still signs in.
    expect((await (await (await as('teacher.a2')).get('/me')).json()).role).toBe('TEACHER');
  });

  // Added by the decision review of 2026-10-30 (SRS §17).
  test('F02-AC14 (US-008) only Owner/Admin set the all-classes flag, and setting or clearing it is audited', async ({ as, control }) => {
    const id = await control.userIdOf('teacher.a1');
    const teacher = await as('teacher.a1');
    expect((await teacher.post(`/accounts/${id}/all-classes`, { data: { allClasses: true } })).status()).toBe(403);

    const admin = await as('admin.a');
    const set = await admin.post(`/accounts/${id}/all-classes`, { data: { allClasses: true } });
    expect(set.status()).toBe(200);
    expect(await set.json()).toMatchObject({ role: 'TEACHER', allClasses: true });
    const cleared = await (await as('owner.a')).post(`/accounts/${id}/all-classes`, { data: { allClasses: false } });
    expect((await cleared.json()).allClasses).toBe(false);
    expect(((await control.auditFor('teacher.a1')) as AuditRow[]).map((r) => r.action)).toEqual(['ALL_CLASSES_SET', 'ALL_CLASSES_CLEARED']);

    // Teacher permissions only: the flag gives no Owner/Admin capability.
    await admin.post(`/accounts/${id}/all-classes`, { data: { allClasses: true } });
    expect((await teacher.patch('/organization', { data: { name: 'X' } })).status()).toBe(403);
    expect((await teacher.get('/accounts')).status()).toBe(403);
  });

  test.fixme('F02-AC14 (US-008) with the flag, a Teacher lists students and reads records of every class', async () => {
    // Waits for classes, students, and records (F03/F05). Given a Teacher whose Owner or Admin set the "all classes" flag,
    // when they list students or request any class's records, then every class in the madrasa is available.
  });

  test('F02-AC15 (US-007) only the Owner adds or removes Admins and transfers ownership', async ({ as, control, anon }) => {
    // Given an Admin, when they try to add or remove an Admin or transfer ownership, then it is refused.
    const admin = await as('admin.a');
    const teacherId = await control.userIdOf('teacher.a1');
    const adminId = await control.userIdOf('admin.a');
    expect((await admin.post(`/accounts/${teacherId}/role`, { data: { role: 'ADMIN' } })).status()).toBe(403);
    expect((await admin.post(`/accounts/${adminId}/role`, { data: { role: 'TEACHER' } })).status()).toBe(403);
    expect((await admin.post(`/accounts/${adminId}/owner`)).status()).toBe(403);
    expect(await control.auditFor('teacher.a1')).toEqual([]);

    // Given the Owner, when they do the same, then it succeeds and is audited.
    const owner = await as('owner.a');
    expect((await (await owner.post(`/accounts/${teacherId}/role`, { data: { role: 'ADMIN' } })).json()).role).toBe('ADMIN');
    expect((await (await owner.post(`/accounts/${teacherId}/role`, { data: { role: 'TEACHER' } })).json()).role).toBe('TEACHER');
    expect((await (await owner.post(`/accounts/${adminId}/owner`)).json()).role).toBe('OWNER');
    expect(((await control.auditFor('teacher.a1')) as AuditRow[]).map((r) => r.action)).toEqual(['ADMIN_ADDED', 'ADMIN_REMOVED']);
    expect(((await control.auditFor('admin.a')) as AuditRow[]).map((r) => r.action)).toEqual(['OWNER_ADDED']);
    // The former Owner stays Owner (decision of 2026-11-06).
    expect((await (await owner.get('/me')).json()).role).toBe('OWNER');
    // A newly added Admin sets up two-factor sign-in at the next sign-in (FR-AUTH-016).
    await owner.post(`/accounts/${teacherId}/role`, { data: { role: 'ADMIN' } });
    const signIn = await anon.post('/auth/sign-in', { data: { loginId: 'teacher-a1', password: 'E2e-Test-Pass-1' } });
    expect((await signIn.json()).step).toBe('TWO_FACTOR_SETUP_REQUIRED');
    // IDs outside the madrasa are not found, exactly like IDs that do not exist.
    const missing = await owner.post(`/accounts/${randomUUID()}/role`, { data: { role: 'ADMIN' } });
    const otherMadrasa = await owner.post(`/accounts/${await control.userIdOf('teacher.b1')}/role`, { data: { role: 'ADMIN' } });
    expect(otherMadrasa.status()).toBe(404);
    expect(await otherMadrasa.json()).toEqual(await missing.json());
  });

  test('F02-AC16 (US-007) there is no self sign-up or public workspace creation', async ({ anon, as }) => {
    // Given the app and the public API, when a person who has no account looks for a way to create a workspace, then there is
    // no sign-up or create-workspace action or endpoint. A workspace and its first Owner exist only after the platform operator creates them.
    const data = { name: 'New Madrasa', code: 'NEW', owner: { loginId: 'NEW-owner', password: 'Some-Pass-2026' } };
    const owner = await as('owner.a');
    for (const api of [anon, owner]) {
      for (const url of ['/organizations', '/organization', '/workspaces', '/auth/sign-up', '/auth/register', '/sign-up', '/signup', '/register']) {
        expect((await api.post(url, { data })).status(), url).toBe(404);
      }
    }
    // The operator route is not reachable without the test-control secret.
    expect((await anon.post('/__test/organizations', { data })).status()).toBe(404);
    expect((await anon.post('/auth/sign-in', { data: { loginId: 'NEW-owner', password: 'Some-Pass-2026' } })).status()).toBe(401);
  });
});

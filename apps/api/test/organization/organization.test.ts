// F02 · Organization and roles — integration against real Postgres. docs/specs/03-f02-organization-roles.md
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PersonaKey } from '../../../../e2e/fixtures/personas.ts';
import { startHarness, type Harness } from '../support/harness.ts';

let h: Harness;

beforeAll(async () => {
  h = await startHarness();
}, 60_000);

afterAll(async () => {
  await h?.stop();
});

beforeEach(async () => {
  await h.reset();
});

const settingsOf = async (who: PersonaKey) => (await h.call('GET', '/organization', await h.signIn(who))).json();

const orgAudit = async (organizationId: string) =>
  ((await h.control('GET', `/audit-target/${organizationId}`)).json().items as Array<Record<string, unknown>>).filter(
    (r) => r.action === 'ORGANIZATION_UPDATED',
  );

const userAudit = async (who: PersonaKey | string) => (await h.control('GET', `/audit-target/${await h.userId(who)}`)).json().items as Array<Record<string, unknown>>;

describe('F02 · workspace settings (US-007)', () => {
  it('F02-AC1 (US-007) a madrasa created by the platform operator starts with Asia/Karachi, Monday, and SINGLE', async () => {
    const created = await h.control('POST', '/organizations', { name: 'Madrasa Jeem (test)', code: 'JEEM', owner: { loginId: 'JEEM-owner' } });
    expect(created.statusCode).toBe(201);
    const { organizationId } = created.json();

    const res = await h.call('GET', '/organization', await h.signIn('JEEM-owner'));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      id: organizationId,
      name: 'Madrasa Jeem (test)',
      kind: 'MADRASA',
      timezone: 'Asia/Karachi',
      weekStart: 'MONDAY',
      dailyReportMode: 'SINGLE',
      canEdit: true,
    });
    // Created by the operator, so the audit record has no actor.
    const audit = (await h.control('GET', `/audit-target/${organizationId}`)).json().items;
    expect(audit.map((r: { action: string }) => r.action)).toEqual(['ORGANIZATION_CREATED']);
    expect(audit[0].actor_user_id).toBeNull();
  });

  it('F02-AC2 (US-007) Owner and Admin changes are saved and audited once each with old and new values', async () => {
    const owner = await h.signIn('owner.a');
    const admin = await h.signIn('admin.a');
    const renamed = await h.call('PATCH', '/organization', owner, { name: '  Madrasa Alif Renamed  ' });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json().name).toBe('Madrasa Alif Renamed');
    const moved = await h.call('PATCH', '/organization', admin, { weekStart: 'SATURDAY', timezone: 'Asia/Dubai' });
    expect(moved.statusCode).toBe(200);

    const settings = await settingsOf('teacher.a1');
    expect(settings).toMatchObject({ name: 'Madrasa Alif Renamed', weekStart: 'SATURDAY', timezone: 'Asia/Dubai', canEdit: false });

    const audit = await orgAudit(settings.id);
    expect(audit).toHaveLength(2);
    expect(audit[0]).toMatchObject({
      actor_user_id: await h.userId('owner.a'),
      target_type: 'ORGANIZATION',
      target_id: settings.id,
      summary: { changes: { name: { from: 'Madrasa Alif (test)', to: 'Madrasa Alif Renamed' } } },
    });
    expect(audit[1]).toMatchObject({
      actor_user_id: await h.userId('admin.a'),
      summary: { changes: { weekStart: { from: 'MONDAY', to: 'SATURDAY' }, timezone: { from: 'Asia/Karachi', to: 'Asia/Dubai' } } },
    });
  });

  it('F02 unit: saving unchanged settings writes no audit record', async () => {
    const owner = await h.signIn('owner.a');
    const before = await settingsOf('owner.a');
    expect((await h.call('PATCH', '/organization', owner, { name: before.name, weekStart: 'MONDAY' })).statusCode).toBe(200);
    expect(await orgAudit(before.id)).toHaveLength(0);
  });

  it('F02-AC3 (US-007) an empty name, unknown timezone, or invalid week start is rejected and nothing is saved', async () => {
    const admin = await h.signIn('admin.a');
    const before = await settingsOf('admin.a');
    for (const [payload, field, issue] of [
      [{ name: '   ' }, 'name', 'REQUIRED'],
      [{ name: '', weekStart: 'SATURDAY' }, 'name', 'REQUIRED'],
      [{ timezone: 'Asia/Nowhere' }, 'timezone', 'INVALID'],
      [{ timezone: '+05:00' }, 'timezone', 'INVALID'],
      [{ weekStart: 'FUNDAY' }, 'weekStart', 'INVALID'],
    ] as const) {
      const res = await h.call('PATCH', '/organization', admin, payload);
      expect(res.statusCode, JSON.stringify(payload)).toBe(400);
      expect(res.json().error).toMatchObject({ code: 'VALIDATION', fields: { [field]: issue } });
    }
    expect(await settingsOf('admin.a')).toEqual(before);
    expect(await orgAudit(before.id)).toHaveLength(0);
  });

  it('F02-AC4 (US-007) Teacher, Student, and Parent read settings without edit rights and cannot update them', async () => {
    const before = await settingsOf('owner.a');
    for (const who of ['teacher.a1', 'student.s1', 'parent.p1'] as const) {
      const token = await h.signIn(who);
      expect((await h.call('GET', '/organization', token)).json()).toEqual({ ...before, canEdit: false });
      const res = await h.call('PATCH', '/organization', token, { name: 'Hijacked' });
      expect(res.statusCode, who).toBe(403);
      expect(res.json().error.code).toBe('FORBIDDEN');
    }
    expect(await settingsOf('owner.a')).toEqual(before);
  });

  it('F02-AC9 (US-008) organization, role, and settings that belong elsewhere are rejected; scope comes from the membership', async () => {
    const admin = await h.signIn('admin.a');
    const before = await settingsOf('admin.a');
    const other = await settingsOf('admin.b');
    for (const [payload, field] of [
      [{ name: 'X', organizationId: other.id }, 'organizationId'],
      [{ name: 'X', organization_id: other.id }, 'organization_id'],
      [{ name: 'X', role: 'OWNER' }, 'role'],
      [{ name: 'X', dailyReportMode: 'MULTI_SESSION' }, 'dailyReportMode'],
      [{ name: 'X', canEdit: true }, 'canEdit'],
    ] as const) {
      const res = await h.call('PATCH', '/organization', admin, payload);
      expect(res.statusCode, field).toBe(400);
      expect(res.json().error.fields[field]).toBe('NOT_ALLOWED');
    }
    expect(await settingsOf('admin.a')).toEqual(before);
    // Each Admin changes only their own madrasa.
    await h.call('PATCH', '/organization', await h.signIn('admin.b'), { name: 'Madrasa Baa Renamed' });
    expect((await settingsOf('admin.a')).name).toBe(before.name);
    expect((await settingsOf('admin.b')).name).toBe('Madrasa Baa Renamed');
  });

  it('F02 unit: the database refuses a week start that is not a day of the week', async () => {
    await expect(h.db.updateTable('organizations').set({ week_start: 'FUNDAY' as never }).execute()).rejects.toThrow();
  });
});

describe('F02 · role × endpoint matrix (SRS §17.1)', () => {
  const personas = ['owner.a', 'admin.a', 'teacher.a1', 'student.s1', 'parent.p1'] as const;
  type Endpoint = { name: string; method: 'PATCH' | 'POST'; url: (ids: Record<string, string>) => string; payload: object; allowed: readonly string[] };
  const endpoints: Endpoint[] = [
    { name: 'update settings', method: 'PATCH', url: () => '/organization', payload: { name: 'Changed' }, allowed: ['owner.a', 'admin.a'] },
    { name: 'add an Admin', method: 'POST', url: (ids) => `/accounts/${ids.teacher}/role`, payload: { role: 'ADMIN' }, allowed: ['owner.a'] },
    { name: 'remove an Admin', method: 'POST', url: (ids) => `/accounts/${ids.admin}/role`, payload: { role: 'TEACHER' }, allowed: ['owner.a'] },
    { name: 'grant ownership', method: 'POST', url: (ids) => `/accounts/${ids.admin}/owner`, payload: {}, allowed: ['owner.a'] },
    { name: 'set all classes', method: 'POST', url: (ids) => `/accounts/${ids.teacher2}/all-classes`, payload: { allClasses: true }, allowed: ['owner.a', 'admin.a'] },
  ];

  for (const endpoint of endpoints) {
    for (const who of personas) {
      const allowed = endpoint.allowed.includes(who);
      it(`F02 unit: ${who} → ${endpoint.name} → ${allowed ? '200' : '403'}`, async () => {
        const ids = { teacher: await h.userId('teacher.a1'), teacher2: await h.userId('teacher.a2'), admin: await h.userId('admin.a') };
        const res = await h.call(endpoint.method, endpoint.url(ids), await h.signIn(who), endpoint.payload);
        expect(res.statusCode).toBe(allowed ? 200 : 403);
      });
    }
    it(`F02 unit: no session → ${endpoint.name} → 401`, async () => {
      const res = await h.call(endpoint.method, endpoint.url({ teacher: randomUUID(), teacher2: randomUUID(), admin: randomUUID() }), null, endpoint.payload);
      expect(res.statusCode).toBe(401);
    });
  }

  it('F02-AC7 (US-008) IDs in another madrasa are not found, exactly like IDs that do not exist', async () => {
    const owner = await h.signIn('owner.a');
    const admin = await h.signIn('admin.a');
    const probes = [
      ['POST', (id: string) => `/accounts/${id}/role`, { role: 'ADMIN' }, owner],
      ['POST', (id: string) => `/accounts/${id}/owner`, {}, owner],
      ['POST', (id: string) => `/accounts/${id}/all-classes`, { allClasses: true }, admin],
      ['GET', (id: string) => `/accounts/${id}`, undefined, admin],
    ] as const;
    const otherMadrasa = [await h.userId('teacher.b1'), await h.userId('admin.b')];
    for (const [method, url, payload, token] of probes) {
      const missing = await h.call(method, url(randomUUID()), token, payload);
      const malformed = await h.call(method, url('not-a-uuid'), token, payload);
      expect(missing.statusCode).toBe(404);
      expect(malformed.json()).toEqual(missing.json());
      for (const id of otherMadrasa) {
        const res = await h.call(method, url(id), token, payload);
        expect(res.statusCode).toBe(404);
        expect(res.json()).toEqual(missing.json());
      }
    }
  });
});

describe('F02 · Admins and ownership (US-007, FR-ORG-007)', () => {
  it('F02-AC15 (US-007) an Admin cannot add or remove an Admin or grant ownership', async () => {
    const admin = await h.signIn('admin.a');
    const teacher = await h.userId('teacher.a1');
    const self = await h.userId('admin.a');
    for (const [url, payload] of [
      [`/accounts/${teacher}/role`, { role: 'ADMIN' }],
      [`/accounts/${self}/role`, { role: 'TEACHER' }],
      [`/accounts/${self}/owner`, {}],
    ] as const) {
      const res = await h.call('POST', url, admin, payload);
      expect(res.statusCode, url).toBe(403);
    }
    // Nothing changed, nothing audited.
    expect((await h.call('GET', `/accounts/${teacher}`, admin)).json().role).toBe('TEACHER');
    expect(await userAudit('teacher.a1')).toEqual([]);
  });

  it('F02-AC15 (US-007) the Owner adds an Admin; the new Admin must sign in again and set up two-factor sign-in', async () => {
    const owner = await h.signIn('owner.a');
    const teacherToken = await h.signIn('teacher.a1');
    const id = await h.userId('teacher.a1');

    const res = await h.call('POST', `/accounts/${id}/role`, owner, { role: 'ADMIN' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id, role: 'ADMIN', allClasses: false });

    const audit = await userAudit('teacher.a1');
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: 'ADMIN_ADDED', actor_user_id: await h.userId('owner.a'), summary: { from: 'TEACHER', to: 'ADMIN' } });

    expect((await h.call('GET', '/me', teacherToken)).statusCode).toBe(401);
    const signIn = (await h.call('POST', '/auth/sign-in', null, { loginId: 'teacher-a1', password: 'E2e-Test-Pass-1' })).json();
    expect(signIn.step).toBe('TWO_FACTOR_SETUP_REQUIRED');
  });

  it('F02-AC15 (US-007) the Owner removes an Admin, who keeps their account as a Teacher', async () => {
    const owner = await h.signIn('owner.a');
    const adminToken = await h.signIn('admin.a');
    const id = await h.userId('admin.a');

    const res = await h.call('POST', `/accounts/${id}/role`, owner, { role: 'TEACHER' });
    expect(res.statusCode).toBe(200);
    expect(res.json().role).toBe('TEACHER');
    expect((await userAudit('admin.a')).map((r) => [r.action, r.summary])).toEqual([['ADMIN_REMOVED', { from: 'ADMIN', to: 'TEACHER' }]]);

    // The role is re-read on every request: the former Admin's session now has Teacher permissions only.
    expect((await h.call('PATCH', '/organization', adminToken, { name: 'Changed' })).statusCode).toBe(403);
    expect((await h.call('GET', '/me', adminToken)).json().role).toBe('TEACHER');
  });

  it('F02-AC15 (US-007) the Owner grants ownership to an Admin; both are Owners afterwards', async () => {
    const owner = await h.signIn('owner.a');
    const id = await h.userId('admin.a');

    const res = await h.call('POST', `/accounts/${id}/owner`, owner);
    expect(res.statusCode).toBe(200);
    expect(res.json().role).toBe('OWNER');
    expect((await userAudit('admin.a')).map((r) => r.action)).toEqual(['OWNER_ADDED']);
    expect((await h.call('GET', '/me', owner)).json().role).toBe('OWNER');

    // The new Owner can now manage Admins too.
    const newOwner = await h.signIn('admin.a');
    expect((await h.call('POST', `/accounts/${await h.userId('teacher.a1')}/role`, newOwner, { role: 'ADMIN' })).statusCode).toBe(200);
  });

  it('F02 unit: only Teachers and Admins change role, only Admins become Owner, and repeating a change is a no-op', async () => {
    const owner = await h.signIn('owner.a');
    const ownerId = await h.userId('owner.a');
    for (const [who, url, payload] of [
      ['student.s1', 'role', { role: 'ADMIN' }],
      ['parent.p1', 'role', { role: 'ADMIN' }],
      ['owner.a', 'role', { role: 'TEACHER' }],
      ['teacher.a1', 'owner', {}],
      ['student.s1', 'owner', {}],
    ] as const) {
      const res = await h.call('POST', `/accounts/${await h.userId(who)}/${url}`, owner, payload);
      expect(res.statusCode, `${who} ${url}`).toBe(400);
    }
    expect((await h.call('POST', `/accounts/${ownerId}/role`, owner, { role: 'OWNER' })).statusCode).toBe(400);
    // Already an Admin: nothing changes and nothing is audited.
    const admin = await h.userId('admin.a');
    expect((await h.call('POST', `/accounts/${admin}/role`, owner, { role: 'ADMIN' })).json().role).toBe('ADMIN');
    expect(await userAudit('admin.a')).toEqual([]);
  });

  it('F02 unit: a deactivated account cannot be given a new role', async () => {
    const owner = await h.signIn('owner.a');
    const id = await h.userId('teacher.a2');
    expect((await h.call('POST', `/accounts/${id}/deactivate`, owner)).statusCode).toBe(200);
    expect((await h.call('POST', `/accounts/${id}/role`, owner, { role: 'ADMIN' })).statusCode).toBe(400);
  });
});

describe('F02 · the "all classes" flag (US-008)', () => {
  it('F02-AC14 (US-008) Owner and Admin set and clear the flag, each change audited once; a Teacher cannot set it', async () => {
    const id = await h.userId('teacher.a1');
    const teacher = await h.signIn('teacher.a1');
    const refused = await h.call('POST', `/accounts/${id}/all-classes`, teacher, { allClasses: true });
    expect(refused.statusCode).toBe(403);

    const admin = await h.signIn('admin.a');
    const set = await h.call('POST', `/accounts/${id}/all-classes`, admin, { allClasses: true });
    expect(set.statusCode).toBe(200);
    expect(set.json()).toMatchObject({ role: 'TEACHER', allClasses: true });
    // Setting it again changes nothing and writes nothing.
    expect((await h.call('POST', `/accounts/${id}/all-classes`, admin, { allClasses: true })).json().allClasses).toBe(true);
    const cleared = await h.call('POST', `/accounts/${id}/all-classes`, await h.signIn('owner.a'), { allClasses: false });
    expect(cleared.json().allClasses).toBe(false);

    expect((await userAudit('teacher.a1')).map((r) => [r.action, r.summary])).toEqual([
      ['ALL_CLASSES_SET', { allClasses: true }],
      ['ALL_CLASSES_CLEARED', { allClasses: false }],
    ]);
  });

  it('F02-AC14 (US-008) the flag applies to Teachers only and gives no Owner/Admin capability', async () => {
    const admin = await h.signIn('admin.a');
    for (const who of ['admin.a', 'student.s1', 'parent.p1'] as const) {
      const res = await h.call('POST', `/accounts/${await h.userId(who)}/all-classes`, admin, { allClasses: true });
      expect(res.statusCode, who).toBe(400);
    }
    await h.call('POST', `/accounts/${await h.userId('teacher.a1')}/all-classes`, admin, { allClasses: true });
    const teacher = await h.signIn('teacher.a1');
    expect((await h.call('PATCH', '/organization', teacher, { name: 'Changed' })).statusCode).toBe(403);
    expect((await h.call('POST', `/accounts/${await h.userId('teacher.a2')}/all-classes`, teacher, { allClasses: true })).statusCode).toBe(403);
    expect((await h.call('GET', '/accounts', teacher)).statusCode).toBe(403);
  });

  it('F02 unit: promoting a flagged Teacher to Admin clears the flag', async () => {
    const owner = await h.signIn('owner.a');
    const id = await h.userId('teacher.a1');
    await h.call('POST', `/accounts/${id}/all-classes`, owner, { allClasses: true });
    await h.call('POST', `/accounts/${id}/role`, owner, { role: 'ADMIN' });
    const demoted = await h.call('POST', `/accounts/${id}/role`, owner, { role: 'TEACHER' });
    expect(demoted.json()).toMatchObject({ role: 'TEACHER', allClasses: false });
  });
});

describe('F02 · no self sign-up (US-007, FR-ORG-001)', () => {
  it('F02-AC16 (US-007) there is no sign-up or create-workspace endpoint, signed in or not', async () => {
    const owner = await h.signIn('owner.a');
    const payload = { name: 'New Madrasa', code: 'NEW', owner: { loginId: 'NEW-owner', password: 'Some-Pass-2026' } };
    for (const token of [null, owner]) {
      for (const url of ['/organizations', '/organization', '/workspaces', '/workspace', '/auth/sign-up', '/auth/signup', '/auth/register', '/sign-up', '/signup', '/register']) {
        const res = await h.call('POST', url, token, payload);
        expect(res.statusCode, `${url} ${token ? 'signed in' : 'anonymous'}`).toBe(404);
      }
    }
    // The operator route exists only on the test-control API and needs its secret.
    const noSecret = await h.app.inject({ method: 'POST', url: '/__test/organizations', payload });
    expect(noSecret.statusCode).toBe(404);
    expect((await h.call('POST', '/auth/sign-in', null, { loginId: 'NEW-owner', password: 'Some-Pass-2026' })).statusCode).toBe(401);
  });
});

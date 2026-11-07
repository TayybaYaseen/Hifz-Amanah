// F02 · Audit of sensitive changes (US-009) — integration against real Postgres. docs/specs/03-us-009-audit-sensitive-changes.md
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
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

const auditRows = () => h.db.selectFrom('audit_logs').selectAll().orderBy('created_at').orderBy('id').execute();

describe('F02 · one audit record per sensitive change (US-009)', () => {
  it('F02-AC10 (US-009) account create, deactivate, role change, membership change, and password reset each write exactly one record', async () => {
    const owner = await h.signIn('owner.a');
    const ownerId = await h.userId('owner.a');
    const steps: Array<[string, () => Promise<{ statusCode: number }>, () => Promise<string>]> = [
      [
        'ACCOUNT_CREATED',
        () => h.call('POST', '/accounts', owner, { loginId: 'ALIF-new-teacher', displayName: 'New Teacher', role: 'TEACHER', password: 'Created-Pass-2026' }),
        () => h.userId('ALIF-new-teacher'),
      ],
      ['ADMIN_ADDED', async () => h.call('POST', `/accounts/${await h.userId('teacher.a1')}/role`, owner, { role: 'ADMIN' }), () => h.userId('teacher.a1')],
      ['ALL_CLASSES_SET', async () => h.call('POST', `/accounts/${await h.userId('teacher.a2')}/all-classes`, owner, { allClasses: true }), () => h.userId('teacher.a2')],
      ['PASSWORD_RESET', async () => h.call('POST', `/accounts/${await h.userId('student.s1')}/password`, owner, { newPassword: 'Reset-Pass-2026' }), () => h.userId('student.s1')],
      ['ACCOUNT_DEACTIVATED', async () => h.call('POST', `/accounts/${await h.userId('parent.p2')}/deactivate`, owner), () => h.userId('parent.p2')],
    ];
    for (const [action, run, targetOf] of steps) {
      const before = (await auditRows()).length;
      const res = await run();
      expect(res.statusCode, action).toBeLessThan(300);
      const added = (await auditRows()).slice(before);
      expect(added, action).toHaveLength(1);
      expect(added[0]).toMatchObject({ action, actor_user_id: ownerId, target_type: 'USER', target_id: await targetOf() });
      expect(added[0]!.created_at).toBeInstanceOf(Date);
      expect(typeof added[0]!.summary).toBe('object');
    }
  });

  it('F02-AC11 (US-009) account creation and password reset audits contain no password, OTP, or token', async () => {
    const admin = await h.signIn('admin.a');
    const created = 'Created-Pass-2026';
    const adminReset = 'Admin-Reset-2026';
    const otpReset = 'Otp-Reset-Pass-2026';
    await h.call('POST', '/accounts', admin, { loginId: 'ALIF-audited', displayName: 'Audited', email: 'audited@example.test', role: 'TEACHER', password: created });
    await h.call('POST', `/accounts/${await h.userId('ALIF-audited')}/password`, admin, { newPassword: adminReset });
    // Recovery by email OTP (US-002).
    await h.call('POST', '/auth/password-reset/request', null, { loginId: 'ALIF-audited' });
    const { otp } = (await h.control('GET', '/otp/ALIF-audited')).json();
    expect(otp).toMatch(/^\d{6}$/);
    expect((await h.call('POST', '/auth/password-reset/confirm', null, { loginId: 'ALIF-audited', otp, newPassword: otpReset })).statusCode).toBe(204);

    const rows = (await h.control('GET', '/audit/ALIF-audited')).json().items as Array<Record<string, unknown>>;
    expect(rows.map((r) => r.action)).toEqual(['ACCOUNT_CREATED', 'PASSWORD_RESET', 'PASSWORD_RESET']);
    const text = JSON.stringify(rows);
    for (const secret of [created, adminReset, otpReset, otp, admin]) expect(text).not.toContain(secret);
    // The same holds for the whole audit table, not just these rows.
    const { rows: hits } = await sql<{ n: string }>`SELECT count(*) AS n FROM audit_logs t WHERE strpos(t::text, ${otp}) > 0 OR strpos(t::text, ${created}) > 0`.execute(h.db);
    expect(Number(hits[0]!.n)).toBe(0);
  });
});

describe('F02 · audit records are append-only (US-009)', () => {
  it('F02-AC12 (US-009) no endpoint edits or deletes an audit record, for any role including Owner', async () => {
    await h.call('PATCH', '/organization', await h.signIn('owner.a'), { name: 'Audited change' });
    const [record] = await auditRows();
    expect(record).toBeDefined();
    for (const who of ['owner.a', 'admin.a', 'teacher.a1'] as const) {
      const token = await h.signIn(who);
      for (const method of ['PUT', 'PATCH', 'DELETE'] as const) {
        for (const url of [`/audit/${record!.id}`, `/audit-logs/${record!.id}`, `/audit-logs`, `/organization/audit/${record!.id}`]) {
          const res = await h.call(method, url, token, method === 'DELETE' ? undefined : { action: 'TAMPERED' });
          expect(res.statusCode, `${who} ${method} ${url}`).toBe(404);
        }
      }
    }
    expect(await auditRows()).toEqual([record]);
  });

  it('F02 unit: the database refuses UPDATE and DELETE on audit_logs for the role the app connects with', async () => {
    await h.call('PATCH', '/organization', await h.signIn('owner.a'), { name: 'Audited change' });
    const before = await auditRows();
    await expect(sql`UPDATE audit_logs SET action = 'TAMPERED'`.execute(h.db)).rejects.toThrow(/append-only/);
    await expect(sql`DELETE FROM audit_logs`.execute(h.db)).rejects.toThrow(/append-only/);
    expect(await auditRows()).toEqual(before);
  });
});

describe('F02 · a failed audit write rolls back the change (US-009)', () => {
  it('F02-AC13 (US-009) when the audit write fails, deactivating an account is rolled back', async () => {
    const admin = await h.signIn('admin.a');
    const id = await h.userId('teacher.a2');
    await h.control('POST', '/audit/fail-next');
    const res = await h.call('POST', `/accounts/${id}/deactivate`, admin);
    expect(res.statusCode).toBe(500);
    expect(res.json().error.code).toBe('INTERNAL');
    expect((await h.call('GET', `/accounts/${id}`, admin)).json().status).toBe('ACTIVE');
    expect(await h.signIn('teacher.a2')).toEqual(expect.any(String));
    expect(await auditRows()).toEqual([]);
  });

  it('F02-AC13 (US-009) a database-level audit failure rolls back settings, role, and flag changes', async () => {
    const owner = await h.signIn('owner.a');
    const before = (await h.call('GET', '/organization', owner)).json();
    const teacher = await h.userId('teacher.a1');
    const teacherToken = await h.signIn('teacher.a1');
    // Make every audit insert fail inside Postgres, as a full disk or a broken constraint would.
    await sql`CREATE FUNCTION test_audit_reject() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit insert rejected'; END; $$`.execute(h.db);
    await sql`CREATE TRIGGER test_audit_reject BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION test_audit_reject()`.execute(h.db);
    try {
      expect((await h.call('PATCH', '/organization', owner, { name: 'Should not stick', weekStart: 'FRIDAY' })).statusCode).toBe(500);
      expect((await h.call('POST', `/accounts/${teacher}/role`, owner, { role: 'ADMIN' })).statusCode).toBe(500);
      expect((await h.call('POST', `/accounts/${teacher}/all-classes`, owner, { allClasses: true })).statusCode).toBe(500);
    } finally {
      await sql`DROP TRIGGER test_audit_reject ON audit_logs`.execute(h.db);
      await sql`DROP FUNCTION test_audit_reject()`.execute(h.db);
    }
    expect((await h.call('GET', '/organization', owner)).json()).toEqual(before);
    expect((await h.call('GET', `/accounts/${teacher}`, owner)).json()).toMatchObject({ role: 'TEACHER', allClasses: false });
    // The rolled-back promotion ended none of the Teacher's sessions either.
    expect((await h.call('GET', '/me', teacherToken)).statusCode).toBe(200);
  });

  it('F02 unit: the test fault switch is cleared by a reset and never leaks into the next test', async () => {
    await h.control('POST', '/audit/fail-next');
    await h.reset();
    const res = await h.call('PATCH', '/organization', await h.signIn('owner.a'), { name: randomUUID().slice(0, 8) });
    expect(res.statusCode).toBe(200);
  });
});

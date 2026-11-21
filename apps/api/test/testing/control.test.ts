// Test control · POST /__test/calendar/ensure-class-day (mobile E2E support for F05/F08 flows on any weekday).
// It must change nothing on a scheduled day, add only today's weekday from today through the real schedule service
// otherwise, and always act as the same Admin, never an arbitrary one.
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { weekdayOf } from '@hifz/domain/calendar';
import { calendarDateIn } from '@hifz/domain/roster';
import { startHarness, type Harness } from '../support/harness.ts';

let h: Harness;

beforeAll(async () => {
  h = await startHarness();
});

afterAll(async () => {
  await h.stop();
});

beforeEach(async () => {
  await h.reset();
});

const ensure = (organizationCode: string, className: string) =>
  h.control('POST', '/calendar/ensure-class-day', { organizationCode, className });

const today = () => calendarDateIn(h.clock.now(), 'Asia/Karachi');

async function orgAndClass(code: string, className: string) {
  const org = await h.db.selectFrom('organizations').select('id').where('code', '=', code).executeTakeFirstOrThrow();
  const klass = await h.db.selectFrom('classes').select('id').where('organization_id', '=', org.id).where('name', '=', className).executeTakeFirstOrThrow();
  return { orgId: org.id, classId: klass.id };
}

/** Makes today a non-class day for the class (the Mon–Sat fixture minus today's weekday), as on a Sunday. */
async function withoutToday(classId: string) {
  const wd = weekdayOf(today());
  await h.db.updateTable('class_schedules').set({ weekdays: [1, 2, 3, 4, 5, 6, 7].filter((d) => d !== wd) }).where('class_id', '=', classId).execute();
}

async function lastScheduleActor(orgId: string, classId: string) {
  const row = await h.db
    .selectFrom('audit_logs')
    .select('actor_user_id')
    .where('organization_id', '=', orgId)
    .where('action', '=', 'SCHEDULE_SET')
    .where('target_id', '=', classId)
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .executeTakeFirst();
  return row?.actor_user_id ?? null;
}

/**
 * Another Admin of the madrasa (synthetic), inserted after the seeded one but with a membership dated `offsetMs`
 * from now: an earlier date makes them the longest-standing Admin although their row is newer, so the test proves the
 * choice follows the membership date and not the table's row order.
 */
async function addAdmin(orgId: string, loginId: string, offsetMs: number) {
  const id = uuidv7();
  const now = new Date(h.clock.now().getTime() + offsetMs);
  await h.db
    .insertInto('users')
    .values({ id, organization_id: orgId, login_id: loginId, password_hash: 'x', email: `${loginId}@example.test`, display_name: `Test ${loginId}`, preferred_locale: 'en', status: 'ACTIVE', locked_until: null, created_at: now, updated_at: now, deactivated_at: null })
    .execute();
  await h.db
    .insertInto('memberships')
    .values({ id: uuidv7(), organization_id: orgId, user_id: id, role: 'ADMIN', all_classes: false, status: 'ACTIVE', created_at: now, revoked_at: null })
    .execute();
  return id;
}

describe('test control · ensure-class-day', () => {
  it('changes nothing when today is already a class day', async () => {
    const { orgId, classId } = await orgAndClass('ALIF', 'Hifz A1');
    await h.db.updateTable('class_schedules').set({ weekdays: [1, 2, 3, 4, 5, 6, 7] }).where('class_id', '=', classId).execute();
    const res = await ensure('ALIF', 'Hifz A1');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ date: today(), changed: false });
    expect(await lastScheduleActor(orgId, classId)).toBeNull();
  });

  it('with one Admin: adds today from today on, as that Admin, through the audited schedule service', async () => {
    const { orgId, classId } = await orgAndClass('BAA', 'Hifz B1');
    await withoutToday(classId);
    const res = await ensure('BAA', 'Hifz B1');
    expect(res.json()).toEqual({ date: today(), changed: true });
    expect(await lastScheduleActor(orgId, classId)).toBe(await h.userId('admin.b'));
    const current = await h.db
      .selectFrom('class_schedules')
      .select(['weekdays', 'effective_from'])
      .where('class_id', '=', classId)
      .where('superseded_at', 'is', null)
      .where('effective_to', 'is', null)
      .executeTakeFirstOrThrow();
    expect(current.effective_from).toBe(today());
    expect(current.weekdays.map(Number)).toContain(weekdayOf(today()));
    // A second call is a no-op.
    expect((await ensure('BAA', 'Hifz B1')).json()).toEqual({ date: today(), changed: false });
  });

  it('with several Admins: always the same, longest-standing active Admin; a revoked one is never used', async () => {
    const { orgId, classId } = await orgAndClass('ALIF', 'Hifz A1');
    const seeded = await h.userId('admin.a');
    // Added last, but an Admin for longer (membership a year earlier): the longest-standing Admin.
    const longest = await addAdmin(orgId, 'admin-a-longest', -365 * 24 * 3600_000);
    // Added last and newest: never chosen while an older Admin is active.
    await addAdmin(orgId, 'admin-a-newest', 60_000);
    for (let run = 0; run < 3; run++) {
      await withoutToday(classId);
      expect((await ensure('ALIF', 'Hifz A1')).json()).toMatchObject({ changed: true });
      expect(await lastScheduleActor(orgId, classId)).toBe(longest);
    }
    // The longest-standing Admin's membership is revoked: the next one by membership date (the seeded Admin) acts.
    await h.db.updateTable('memberships').set({ status: 'REVOKED', revoked_at: h.clock.now() }).where('organization_id', '=', orgId).where('user_id', '=', longest).execute();
    await withoutToday(classId);
    expect((await ensure('ALIF', 'Hifz A1')).json()).toMatchObject({ changed: true });
    expect(await lastScheduleActor(orgId, classId)).toBe(seeded);
  });

  it('refuses an unknown madrasa or class, and requires the control secret', async () => {
    expect((await ensure('NOPE', 'Hifz A1')).statusCode).toBe(404);
    expect((await ensure('ALIF', 'No such class')).statusCode).toBe(404);
    const res = await h.app.inject({ method: 'POST', url: '/__test/calendar/ensure-class-day', payload: { organizationCode: 'ALIF', className: 'Hifz A1' } });
    expect(res.statusCode).toBe(404);
  });
});

// Test control · POST /__test/sync/drop-ack-next and /__test/attendance/records (F04-AC10 mobile E2E support).
// A dropped acknowledgement means the push was committed but answered 503; the retried push (same op IDs) must
// then replay the stored results and create nothing twice.
describe('test control · lost sync acknowledgement (F04-AC10 support)', () => {
  const DEVICE = '0190f5c0-0000-4000-8000-0000000000aa';

  async function setup() {
    await ensure('ALIF', 'Hifz A1');
    const ids = (await h.control('GET', '/roster/ids')).json() as { classes: Record<string, string>; students: Record<string, string> };
    const token = await h.signIn('teacher.a1');
    const date = today();
    let seq = 0;
    const ops = (['S1', 'S2'] as const).map((s) => ({
      opId: uuidv7(),
      seq: ++seq,
      entity: 'attendance_record',
      entityId: uuidv7(),
      opType: 'CREATE',
      baseVersion: null,
      fields: { studentId: ids.students[s], classId: ids.classes.A1, reportDate: date, status: 'PRESENT', leaveReason: null, absentNote: null },
      dependsOn: [] as string[],
      clientSavedAt: new Date().toISOString(),
    }));
    const push = () => h.call('POST', '/sync/push', token, { protocolVersion: 1, deviceId: DEVICE, ops });
    const records = async () => (await h.control('POST', '/attendance/records', { organizationCode: 'ALIF', className: 'Hifz A1', date })).json().items;
    return { push, records };
  }

  it('commits the push, answers 503 once, and the retry creates no duplicate records or audit entries', async () => {
    const { push, records } = await setup();
    expect((await h.control('POST', '/sync/drop-ack-next', { count: 1 })).json()).toEqual({ status: 'armed', count: 1 });
    expect((await h.control('GET', '/sync/drop-ack-next')).json()).toEqual({ left: 1 });
    const lost = await push();
    expect(lost.statusCode).toBe(503);
    expect(lost.json().error.code).toBe('INTERNAL');
    expect((await h.control('GET', '/sync/drop-ack-next')).json()).toEqual({ left: 0 });
    // Already committed although the device was told it failed.
    expect(await records()).toEqual([
      { externalStudentId: 'EXT-A-001', status: 'PRESENT', recordedAudits: 1 },
      { externalStudentId: 'EXT-A-002', status: 'PRESENT', recordedAudits: 1 },
    ]);
    const retried = await push();
    expect(retried.statusCode, retried.body).toBe(200);
    expect((retried.json().results as Array<{ status: string }>).every((r) => r.status !== 'REJECTED')).toBe(true);
    expect(await records()).toEqual([
      { externalStudentId: 'EXT-A-001', status: 'PRESENT', recordedAudits: 1 },
      { externalStudentId: 'EXT-A-002', status: 'PRESENT', recordedAudits: 1 },
    ]);
  });

  it('is cleared by reset and requires the control secret', async () => {
    await h.control('POST', '/sync/drop-ack-next', { count: 1 });
    await h.reset();
    const { push } = await setup();
    expect((await push()).statusCode).toBe(200);
    const res = await h.app.inject({ method: 'POST', url: '/__test/sync/drop-ack-next', payload: { count: 1 } });
    expect(res.statusCode).toBe(404);
    const rec = await h.app.inject({ method: 'POST', url: '/__test/attendance/records', payload: { organizationCode: 'ALIF', className: 'Hifz A1', date: today() } });
    expect(rec.statusCode).toBe(404);
  });
});

// Test control · GET /__test/totp/:loginId?prefer=next (mobile E2E on slow emulators, F01 two-factor sign-in).
// The next step's code is one the real ±1-step verifier already accepts, and it stays accepted one step longer
// than the current step's code; replay protection is untouched.
describe('test control · TOTP code for slow devices', () => {
  const challenge = async (loginId: string) =>
    (await h.call('POST', '/auth/sign-in', null, { loginId, password: 'E2e-Test-Pass-1' })).json().challengeToken as string;
  const verify = async (challengeToken: string, code: string) => h.call('POST', '/auth/two-factor/verify', null, { challengeToken, code });
  const code = async (loginId: string, query = '') => (await h.control('GET', `/totp/${loginId}${query}`)).json().code as string;

  it('prefer=next gives a code accepted now and still accepted after the current step has passed', async () => {
    const current = await code('admin-a');
    const next = await code('admin-a', '?prefer=next');
    expect(next).not.toBe(current);
    // Two steps later the current step's code is outside the drift window, but the next step's code is not.
    h.clock.advance(60_000);
    expect((await verify(await challenge('admin-a'), current)).statusCode).toBe(400);
    expect((await verify(await challenge('admin-a'), next)).statusCode).toBe(200);
  });

  it('prefer=next never returns a code that was already used', async () => {
    const first = await code('owner-a', '?prefer=next');
    expect((await verify(await challenge('owner-a'), first)).statusCode).toBe(200);
    const second = await code('owner-a', '?prefer=next');
    expect(second).not.toBe(first);
    expect((await verify(await challenge('owner-a'), second)).statusCode).toBe(200);
    expect((await verify(await challenge('owner-a'), first)).statusCode).toBe(400);
  });
});

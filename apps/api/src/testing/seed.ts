// Seeds the synthetic E2E personas (e2e/fixtures/personas.ts). Test environments only; never real data.
// Owner and Admin personas get an enabled authenticator secret so the fixtures can sign in (FR-AUTH-016).
// F03: the fixture classes (with their Teachers) and students, each enrolled since SEED_ENROLLMENT_DAYS ago.
import { v7 as uuidv7 } from 'uuid';
import { addDays, calendarDateIn } from '@hifz/domain/roster';
import { TEST_PASSWORD, classes, loginIdOf, madaris, personas, students } from '../../../../e2e/fixtures/personas.ts';
import type { Clock } from '../platform/clock.ts';
import type { Db } from '../platform/db.ts';
import { enterTenant } from '../platform/tenant.ts';
import { encryptSecret, hashPassword } from '../modules/identity/secrets.ts';
import { newTotpSecret } from '../modules/identity/totp.ts';

let passwordHash: Promise<string> | undefined;

/** Seeded students are enrolled from this many days before today, so "earlier periods" exist. */
export const SEED_ENROLLMENT_DAYS = 90;

export async function seedPersonas(db: Db, clock: Clock, totpKey: Buffer): Promise<void> {
  passwordHash ??= hashPassword(TEST_PASSWORD);
  const hash = await passwordHash;
  const now = clock.now();
  await db.transaction().execute(async (tx) => {
    const orgIds: Record<string, string> = {};
    for (const [key, madrasa] of Object.entries(madaris)) {
      orgIds[key] = uuidv7();
      await tx
        .insertInto('organizations')
        .values({
          id: orgIds[key],
          kind: 'MADRASA',
          name: madrasa.name,
          code: madrasa.code,
          timezone: madrasa.timezone,
          week_start: madrasa.weekStart,
          daily_report_mode: madrasa.reportMode,
          created_at: now,
        })
        .execute();
    }
    const userIds: Record<string, string> = {};
    for (const [persona, p] of Object.entries(personas)) {
      const userId = uuidv7();
      userIds[persona] = userId;
      const organizationId = orgIds[p.madrasa]!;
      await tx
        .insertInto('users')
        .values({
          id: userId,
          organization_id: organizationId,
          login_id: loginIdOf(persona as keyof typeof personas),
          password_hash: hash,
          email: p.email,
          display_name: `Test ${persona}`,
          preferred_locale: 'en',
          status: 'ACTIVE',
          locked_until: null,
          created_at: now,
          updated_at: now,
          deactivated_at: null,
        })
        .execute();
      await tx
        .insertInto('memberships')
        .values({
          id: uuidv7(),
          organization_id: organizationId,
          user_id: userId,
          role: p.role,
          all_classes: false,
          status: 'ACTIVE',
          created_at: now,
          revoked_at: null,
        })
        .execute();
      if (p.role === 'OWNER' || p.role === 'ADMIN') {
        await tx
          .insertInto('user_totp')
          .values({ user_id: userId, secret_encrypted: encryptSecret(totpKey, newTotpSecret()), created_at: now, enabled_at: now, last_used_step: null })
          .execute();
      }
    }

    // Roster rows are tenant rows (row-level security): written as the tenant role, one madrasa at a time.
    for (const [key, madrasa] of Object.entries(madaris)) {
      const organizationId = orgIds[key]!;
      await enterTenant(tx, organizationId);
      const since = addDays(calendarDateIn(now, madrasa.timezone), -SEED_ENROLLMENT_DAYS);
      const classIds: Record<string, string> = {};
      for (const [classKey, c] of Object.entries(classes)) {
        if (c.madrasa !== key) continue;
        classIds[classKey] = uuidv7();
        await tx
          .insertInto('classes')
          .values({ id: classIds[classKey], organization_id: organizationId, name: c.name, status: 'ACTIVE', created_at: now, updated_at: now, deactivated_at: null })
          .execute();
        for (const teacher of c.teachers) {
          await tx
            .insertInto('class_teachers')
            .values({ id: uuidv7(), organization_id: organizationId, class_id: classIds[classKey], teacher_user_id: userIds[teacher]!, assigned_at: now, assigned_by: null, unassigned_at: null, unassigned_by: null })
            .execute();
        }
      }
      for (const s of Object.values(students)) {
        if (s.madrasa !== key) continue;
        const studentId = uuidv7();
        await tx
          .insertInto('students')
          .values({ id: studentId, organization_id: organizationId, name: s.name, external_student_id: s.externalId, admission_date: since, private_notes: null, status: 'ACTIVE', created_at: now, updated_at: now, deactivated_at: null })
          .execute();
        await tx
          .insertInto('student_enrollments')
          .values({ id: uuidv7(), organization_id: organizationId, student_id: studentId, class_id: classIds[s.class]!, start_date: since, end_date: null, created_at: now, created_by: null, ended_at: null, ended_by: null })
          .execute();
      }
    }
  });
}

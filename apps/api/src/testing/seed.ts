// Seeds the synthetic E2E personas (e2e/fixtures/personas.ts). Test environments only; never real data.
// Owner and Admin personas get an enabled authenticator secret so the fixtures can sign in (FR-AUTH-016).
import { v7 as uuidv7 } from 'uuid';
import { TEST_PASSWORD, loginIdOf, madaris, personas } from '../../../../e2e/fixtures/personas.ts';
import type { Clock } from '../platform/clock.ts';
import type { Db } from '../platform/db.ts';
import { encryptSecret, hashPassword } from '../modules/identity/secrets.ts';
import { newTotpSecret } from '../modules/identity/totp.ts';

let passwordHash: Promise<string> | undefined;

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
    for (const [persona, p] of Object.entries(personas)) {
      const userId = uuidv7();
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
  });
}

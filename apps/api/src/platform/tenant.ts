// Tenant transactions with Postgres row-level security (ADR-006; F12 decision Q9).
//
// THE PATTERN (F03 and later features copy it for every tenant table):
// 1. In the migration: `ALTER TABLE t ENABLE ROW LEVEL SECURITY; ALTER TABLE t FORCE ROW LEVEL SECURITY;`
//    `CREATE POLICY t_tenant ON t USING (organization_id = app_current_org_id())
//                                 WITH CHECK (organization_id = app_current_org_id());`
//    and grant the least privileges the module needs to `hifz_tenant` (e.g. SELECT, INSERT, UPDATE; never
//    UPDATE/DELETE on history tables). `hifz_tenant` and `app_current_org_id()` are created in 0004_sync.sql.
// 2. In code: run every query on those tables inside `withTenant(db, organizationId, fn)`, with the
//    organization taken from the authenticated membership (never from the request).
//
// Why the role switch: superusers always bypass RLS, and a table's owner bypasses it unless FORCE is set. The
// embedded Postgres used in development and tests connects as a superuser; a managed database usually as the
// schema owner. `SET LOCAL ROLE hifz_tenant` (a NOLOGIN, non-superuser, non-owner role) makes the policies apply
// in both cases, and FORCE makes them apply to the owner too, so a query that forgets `withTenant` sees no
// tenant rows instead of every tenant's rows. Both settings are transaction-local: they end at COMMIT or
// ROLLBACK, so a pooled connection never carries one tenant's setting into another request.
//
// RLS is defense in depth: queries still filter by organization_id explicitly, and authorization stays in the
// access policy (ARCHITECTURE.md §7.2).
//
// DEPLOYMENT REQUIREMENT: the role the API connects as in staging and production must be a NON-superuser
// WITHOUT BYPASSRLS, and a member of `hifz_tenant` (the migration grants it to the migrating role with
// `GRANT hifz_tenant TO CURRENT_USER`; grant it separately if the API connects as a different role). A superuser
// or BYPASSRLS login would make any query outside withTenant() see every tenant's rows; with a normal login such
// a query sees none (fail closed, test/sync/rls.test.ts). The embedded development/test database is the only
// place the API connects as a superuser.
import { sql } from 'kysely';
import type { Db, Tx } from './db.ts';

export const TENANT_ROLE = 'hifz_tenant';

export type IsolationLevel = 'read committed' | 'repeatable read' | 'serializable';

export async function withTenant<T>(
  db: Db,
  organizationId: string,
  fn: (tx: Tx) => Promise<T>,
  options: { isolation?: IsolationLevel } = {},
): Promise<T> {
  let builder = db.transaction();
  if (options.isolation) builder = builder.setIsolationLevel(options.isolation);
  return builder.execute(async (tx) => {
    await enterTenant(tx, organizationId);
    return fn(tx);
  });
}

/** Switches an open transaction to the tenant role and organization (transaction-local). */
export async function enterTenant(tx: Tx, organizationId: string): Promise<void> {
  await sql.raw(`SET LOCAL ROLE ${TENANT_ROLE}`).execute(tx);
  await sql`SELECT set_config('app.current_org_id', ${organizationId}, true)`.execute(tx);
}

# ADR-016 — Postgres row-level security: the `hifz_tenant` role and `app.current_org_id`

- **Status:** Accepted 2026-11-08 (user decision Q9 in [`docs/handover/F12-plan.md`](../handover/F12-plan.md) §10:
  "add row-level security now, for the sync tables, setting `app.current_org_id` per transaction; F03 copies the
  pattern"). Implements ADR-006 (RLS as defense in depth, approved 2026-10-30).
- **Requirements:** FR-SEC-008, FR-SEC-009, AC-SEC-01…05, NFR-OFF-010.
- **Code:** `apps/api/migrations/0004_sync.sql`, `0005_sync_hardening.sql`, `apps/api/src/platform/tenant.ts`,
  `apps/api/test/sync/rls.test.ts`.

## Context

Every query already filters by the organization of the authenticated membership. ADR-006 adds RLS underneath, but
F02 deferred it. Two facts shape the design: superusers always bypass RLS, and a table's owner bypasses it unless
`FORCE ROW LEVEL SECURITY` is set. The embedded development/test database (PGlite) connects as a superuser; a
managed production database usually connects as the schema owner.

## Decision

1. **Role.** Migration 0004 creates `hifz_tenant` (`NOLOGIN NOSUPERUSER NOBYPASSRLS`) if it does not exist and runs
   `GRANT hifz_tenant TO CURRENT_USER`. A helper `app_current_org_id()` reads the transaction setting
   `app.current_org_id` (empty → `NULL`).
2. **Per table** (the pattern F03 and later features copy for every tenant table):
   `ENABLE` and `FORCE ROW LEVEL SECURITY`; one policy
   `USING (organization_id = app_current_org_id()) WITH CHECK (organization_id = app_current_org_id())`; and
   least-privilege grants to `hifz_tenant` (history tables `SELECT, INSERT` only; never `UPDATE`/`DELETE` on
   history; column-limited `UPDATE` where a row has a lifecycle, e.g. `sync_conflicts` may only change `status`,
   `resolved_by`, `resolved_at`, `resolution` after 0005).
3. **Per transaction.** Code that touches these tables runs inside `withTenant(db, organizationId, fn)`, which issues
   `SET LOCAL ROLE hifz_tenant` and `set_config('app.current_org_id', <org>, true)`. Both are transaction-local, so
   a pooled connection never carries one tenant into the next request. The organization comes from the membership,
   never from the request.
4. **Fail closed.** Because of `FORCE` and the role switch, a query that forgets `withTenant` sees **no** tenant rows
   (when the API connects as a normal login), not every tenant's rows. `rls.test.ts` proves this with a
   non-superuser role.
5. **Scope in F12:** `sync_ops`, `change_log`, `sync_conflicts`, and `scope_changes` (the plan named three; the fourth
   was added because it is tenant data too), plus the test-only `sync_probe`. `users` and `audit_logs` get RLS with
   F03; until then `hifz_tenant` has only `SELECT (id, organization_id, display_name)` on `users` and `INSERT` on
   `audit_logs`.

## Deployment requirement

- The role the API connects as in staging and production must be a **non-superuser without `BYPASSRLS`**, and a
  **member of `hifz_tenant`**. If the API connects as a different role from the one that ran the migrations, grant
  `hifz_tenant` to it separately.
- Running 0004 needs **`CREATEROLE`** (to create `hifz_tenant`), or a DBA creates the role beforehand; the migration
  then skips creation.
- A superuser or `BYPASSRLS` login would make any query outside `withTenant` see every tenant's rows. The embedded
  development/test database is the only place the API connects as a superuser.

## Consequences

- RLS is defense in depth only: explicit `organization_id` filters and the access policy (ARCHITECTURE §7.2) remain
  required, and out-of-scope IDs still return `404`.
- Every new tenant table needs the policy, `FORCE`, and grants in its migration, and its queries inside
  `withTenant`. Test-control routes that inspect across organizations run outside `withTenant` and therefore only
  work on the embedded (superuser) database, which is where test control is enabled.
- Unique constraints still apply across organizations, so a value taken by another tenant is detectable but
  invisible; services that rely on such checks (e.g. sync `op_id`, client entity IDs) must answer without detail.

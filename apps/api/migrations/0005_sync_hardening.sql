-- 0005 · Sync hardening (F12 security review L7). 0004_sync.sql is never edited (it may already be applied).
-- Least privilege on sync_conflicts: the tenant role may only close a conflict. The only UPDATE in the code is
-- ConflictService.resolve (apps/api/src/modules/sync/conflict-service.ts), which sets status, resolved_by,
-- resolved_at and resolution. Every other column (organization, entity, both versions, the operation, the
-- author) is fixed once the conflict is written.
REVOKE UPDATE ON sync_conflicts FROM hifz_tenant;
GRANT UPDATE (status, resolved_by, resolved_at, resolution) ON sync_conflicts TO hifz_tenant;

-- Row-level security for users and audit_logs is NOT added here: it comes with F03, when every tenant table
-- adopts the pattern of 0004 (apps/api/src/platform/tenant.ts). Until then the tenant role keeps only the
-- column-limited SELECT on users and INSERT on audit_logs granted in 0004.

-- 0004 · Offline sync (F12). ARCHITECTURE.md §6.1, §8.2, §15; NFR-OFF-004…010, FR-SYNC-006…009;
-- plan docs/handover/F12-plan.md §5–§6, decisions Q7 and Q9.
-- All tables are tenant-owned (organization_id NOT NULL), never cascade-deleted, and protected by row-level
-- security (ADR-006, decision Q9). The test-only `sync_probe` table is NOT here: the integration-test harness
-- applies it from apps/api/test/support/migrations.

-- ---------- Row-level security role (the pattern F03 copies; see apps/api/src/platform/tenant.ts) ----------
-- RLS is bypassed by superusers always and by a table's owner unless FORCE ROW LEVEL SECURITY is set. The API
-- may connect as either (embedded Postgres connects as a superuser; a managed database usually as the owner of
-- the schema). So tenant transactions switch to this NOLOGIN, non-superuser role with SET LOCAL ROLE, which
-- has only the grants below, and the policies compare organization_id with the per-transaction setting
-- app.current_org_id. FORCE also subjects the owner role itself to the policies, so code that forgets the
-- role switch sees no tenant rows at all (fail closed) instead of every tenant's rows.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hifz_tenant') THEN
    CREATE ROLE hifz_tenant NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END
$$;
-- The connecting role must be a member to SET ROLE (a superuser always may).
GRANT hifz_tenant TO CURRENT_USER;

-- The organization of the current tenant transaction, or NULL when none is set. NULLIF: after a SET LOCAL the
-- setting reads as '' rather than NULL in later transactions on the same connection.
CREATE FUNCTION app_current_org_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_org_id', true), '')::uuid
$$;

-- ---------- sync_ops: one row per terminal operation result (idempotency, NFR-OFF-004) ----------
CREATE TABLE sync_ops (
  op_id           uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations (id),
  user_id         uuid NOT NULL REFERENCES users (id),
  device_id       uuid NOT NULL,
  entity          text NOT NULL,
  entity_id       uuid NOT NULL,
  -- SHA-256 of the canonical JSON of the operation: a reused op_id with another payload is refused.
  op_hash         bytea NOT NULL,
  -- RETRY results are never stored.
  status          text NOT NULL CHECK (status IN ('APPLIED', 'CONFLICT', 'REJECTED')),
  result          jsonb NOT NULL,
  received_at     timestamptz NOT NULL
);
CREATE INDEX sync_ops_org_user_idx ON sync_ops (organization_id, user_id);

-- ---------- change_log: append-only feed for /sync/pull (ARCHITECTURE.md §6.1) ----------
CREATE TABLE change_log (
  seq             bigserial PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations (id),
  entity          text NOT NULL,
  entity_id       uuid NOT NULL,
  row_version     bigint NOT NULL CHECK (row_version >= 1),
  op              text NOT NULL CHECK (op IN ('UPSERT', 'REMOVE')),
  -- Fields this change wrote; the server computes "changed since base_version" from them (conflict detection).
  changed_fields  text[] NOT NULL DEFAULT '{}',
  -- Scope keys at change time; the pull filters by the caller's current scope (F12-AC7). No FK: the roster
  -- tables arrive with F03.
  student_id      uuid,
  class_id        uuid,
  actor_user_id   uuid REFERENCES users (id),
  op_id           uuid,
  at              timestamptz NOT NULL
);
CREATE INDEX change_log_org_seq_idx ON change_log (organization_id, seq);
CREATE INDEX change_log_entity_idx ON change_log (organization_id, entity, entity_id, row_version);

CREATE FUNCTION change_log_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'change_log is append-only';
END;
$$;
CREATE TRIGGER change_log_no_update BEFORE UPDATE OR DELETE ON change_log
  FOR EACH ROW EXECUTE FUNCTION change_log_append_only();

-- ---------- sync_conflicts: both versions kept for explicit resolution (FR-SYNC-008) ----------
CREATE TABLE sync_conflicts (
  id                uuid PRIMARY KEY,
  organization_id   uuid NOT NULL REFERENCES organizations (id),
  entity            text NOT NULL,
  entity_id         uuid NOT NULL,
  base_version      bigint,
  server_version    bigint NOT NULL,
  -- May hold note bodies once F05/F07 register notes: staff-only routes, never logged or audited.
  device_fields     jsonb NOT NULL,
  server_fields     jsonb NOT NULL,
  conflict_fields   text[] NOT NULL,
  student_id        uuid,
  class_id          uuid,
  caused_by_user_id uuid NOT NULL REFERENCES users (id),
  -- The sync_ops row is written after the conflict in the same transaction.
  op_id             uuid NOT NULL REFERENCES sync_ops (op_id) DEFERRABLE INITIALLY DEFERRED,
  status            text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'RESOLVED')),
  resolved_by       uuid REFERENCES users (id),
  resolved_at       timestamptz,
  -- The choice and per-field picks (field names only, no values).
  resolution        jsonb,
  created_at        timestamptz NOT NULL,
  CHECK ((status = 'OPEN') = (resolved_at IS NULL))
);
-- One open conflict per row (decision Q7): further edits answer with this conflict until it is resolved.
CREATE UNIQUE INDEX sync_conflicts_one_open ON sync_conflicts (organization_id, entity, entity_id) WHERE status = 'OPEN';
CREATE INDEX sync_conflicts_org_status_idx ON sync_conflicts (organization_id, status, created_at);

-- ---------- scope_changes: drives scopeReset on pull (NFR-OFF-010, decision Q8). Written by roster (F03). ----------
CREATE TABLE scope_changes (
  organization_id uuid NOT NULL REFERENCES organizations (id),
  user_id         uuid NOT NULL REFERENCES users (id),
  -- Drawn from the change_log sequence so it compares with pull cursors.
  seq             bigint NOT NULL DEFAULT nextval('change_log_seq_seq'),
  at              timestamptz NOT NULL,
  PRIMARY KEY (organization_id, user_id, seq)
);

-- ---------- Row-level security (ADR-006, decision Q9) ----------
ALTER TABLE sync_ops ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_ops FORCE ROW LEVEL SECURITY;
CREATE POLICY sync_ops_tenant ON sync_ops
  USING (organization_id = app_current_org_id()) WITH CHECK (organization_id = app_current_org_id());

ALTER TABLE change_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_log FORCE ROW LEVEL SECURITY;
CREATE POLICY change_log_tenant ON change_log
  USING (organization_id = app_current_org_id()) WITH CHECK (organization_id = app_current_org_id());

ALTER TABLE sync_conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_conflicts FORCE ROW LEVEL SECURITY;
CREATE POLICY sync_conflicts_tenant ON sync_conflicts
  USING (organization_id = app_current_org_id()) WITH CHECK (organization_id = app_current_org_id());

ALTER TABLE scope_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE scope_changes FORCE ROW LEVEL SECURITY;
CREATE POLICY scope_changes_tenant ON scope_changes
  USING (organization_id = app_current_org_id()) WITH CHECK (organization_id = app_current_org_id());

-- Least privilege for the tenant role: history tables are insert-only, conflicts can be closed, and only the
-- user columns the conflict list shows are readable. Audit rows are insert-only (ARCHITECTURE.md §15).
GRANT SELECT, INSERT ON sync_ops TO hifz_tenant;
GRANT SELECT, INSERT ON change_log TO hifz_tenant;
GRANT USAGE ON SEQUENCE change_log_seq_seq TO hifz_tenant;
GRANT SELECT, INSERT, UPDATE ON sync_conflicts TO hifz_tenant;
GRANT SELECT, INSERT ON scope_changes TO hifz_tenant;
GRANT SELECT (id, organization_id, display_name) ON users TO hifz_tenant;
GRANT INSERT ON audit_logs TO hifz_tenant;
GRANT EXECUTE ON FUNCTION app_current_org_id() TO hifz_tenant;

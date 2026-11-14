-- TEST ONLY (F12 decision Q1). Never part of apps/api/migrations: applied by the integration-test harness to
-- exercise the sync engine before any real offline entity exists. It follows the tenant-table pattern F03 copies
-- (row-level security forced, policy on app_current_org_id(), least-privilege grants to hifz_tenant).
CREATE TABLE sync_probe (
  id              uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations (id),
  label           text NOT NULL,
  status          text NOT NULL CHECK (status IN ('OPEN', 'DONE', 'HELD')),
  position        integer NOT NULL DEFAULT 0,
  -- Scope key (a class id; no FK until F03 adds classes).
  class_id        uuid,
  -- Free text standing in for a note body: never logged, never audited.
  note            text,
  row_version     bigint NOT NULL DEFAULT 1
);

ALTER TABLE sync_probe ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_probe FORCE ROW LEVEL SECURITY;
CREATE POLICY sync_probe_tenant ON sync_probe
  USING (organization_id = app_current_org_id()) WITH CHECK (organization_id = app_current_org_id());
GRANT SELECT, INSERT, UPDATE ON sync_probe TO hifz_tenant;

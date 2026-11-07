-- 0003 · Organization and roles (F02). ARCHITECTURE.md §6.1, §15; FR-CAL-006, FR-ORG-007.
-- The organizations, memberships, and audit_logs tables, and the append-only audit trigger, already exist (0001).

-- Only the seven week days are a valid week start (F02-AC2). The default stays MONDAY.
ALTER TABLE organizations
  ADD CONSTRAINT organizations_week_start_check
  CHECK (week_start IN ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'));

-- Counting a madrasa's active Owners and Admins (FR-ORG-007: never fewer than one).
CREATE INDEX memberships_org_role_idx ON memberships (organization_id, role) WHERE status = 'ACTIVE';

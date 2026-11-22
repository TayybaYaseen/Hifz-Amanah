-- 0016 · Student and Parent access: remark visibility, Student logins, Parent links, and report publishing (F10;
-- US-044…046). FR-PORT-001…007, FR-SEC-004…006, FR-RPT-010, NFR-PORT-001…006, NFR-PRV-004; DEC-B33, DEC-B36, DEC-B37.
-- ARCHITECTURE.md §6.3, §7.3, §7.4. Plan: docs/handover/F10-plan.md.
--
-- - portion_attempts.remarks_visibility: 0012 reserved the column with INTERNAL only. F10 opens SHARED
--   ("Visible to student/guardian"). The default stays INTERNAL ("Private to staff", F10-AC9). Mistake notes already
--   carry note_visibility (0013).
-- - student_accounts: the Student login that sees one student record's published reports (FR-PORT-001). One active
--   link per student and per login; an ended link keeps its row (history), never deleted.
-- - student_guardians: a Parent login linked to a student by an Owner/Admin after verifying the parent offline; the
--   method is required (FR-PORT-007, F10-AC16). Revoking sets revoked_at: access stops on the next request (F10-AC7).
--   A revoked row is kept; linking again creates a new row.
-- - report_published: one row per student and period. Students and Parents see a period only while it is published
--   (FR-RPT-010, F10-AC3). content_hash is the SHA-256 of what a family received at publish time; when a correction
--   changes it, updated_at is set ("Updated on …", F10-AC15). Unpublishing sets unpublished_at; publishing again clears it.
-- - report_stamps.stamped_at: when the student's (or the madrasa's) sources last changed, so "Updated on" is the time of
--   the change, not the time someone looked.
-- No DELETE grant on any of these tables.

-- ---------- Remark visibility (FR-PORT-003) ----------
ALTER TABLE portion_attempts DROP CONSTRAINT portion_attempts_remarks_visibility_check;
ALTER TABLE portion_attempts ADD CONSTRAINT portion_attempts_remarks_visibility_check CHECK (remarks_visibility IN ('INTERNAL', 'SHARED'));
GRANT UPDATE (remarks_visibility) ON portion_attempts TO hifz_tenant;

-- ---------- Student logins (FR-PORT-001) ----------
CREATE TABLE student_accounts (
  id              uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations (id),
  student_id      uuid NOT NULL,
  user_id         uuid NOT NULL REFERENCES users (id),
  linked_by       uuid NOT NULL REFERENCES users (id),
  linked_at       timestamptz NOT NULL,
  unlinked_by     uuid REFERENCES users (id),
  unlinked_at     timestamptz,
  FOREIGN KEY (organization_id, student_id) REFERENCES students (organization_id, id),
  CHECK ((unlinked_at IS NULL) = (unlinked_by IS NULL))
);
CREATE UNIQUE INDEX student_accounts_one_per_student ON student_accounts (organization_id, student_id) WHERE unlinked_at IS NULL;
CREATE UNIQUE INDEX student_accounts_one_per_user ON student_accounts (organization_id, user_id) WHERE unlinked_at IS NULL;

-- ---------- Parent links (FR-PORT-007) ----------
CREATE TABLE student_guardians (
  id                  uuid PRIMARY KEY,
  organization_id     uuid NOT NULL REFERENCES organizations (id),
  student_id          uuid NOT NULL,
  guardian_user_id    uuid NOT NULL REFERENCES users (id),
  -- How the Admin verified the parent, offline: in person, or against the madrasa's own records.
  verification_method text NOT NULL CHECK (verification_method IN ('IN_PERSON', 'MADRASA_RECORDS')),
  verified_by         uuid NOT NULL REFERENCES users (id),
  verified_at         timestamptz NOT NULL,
  linked_by           uuid NOT NULL REFERENCES users (id),
  linked_at           timestamptz NOT NULL,
  revoked_by          uuid REFERENCES users (id),
  revoked_at          timestamptz,
  FOREIGN KEY (organization_id, student_id) REFERENCES students (organization_id, id),
  CHECK ((revoked_at IS NULL) = (revoked_by IS NULL))
);
CREATE UNIQUE INDEX student_guardians_one_active ON student_guardians (organization_id, student_id, guardian_user_id) WHERE revoked_at IS NULL;
CREATE INDEX student_guardians_guardian_idx ON student_guardians (organization_id, guardian_user_id) WHERE revoked_at IS NULL;

-- ---------- Published reports (FR-RPT-010) ----------
CREATE TABLE report_published (
  id               uuid PRIMARY KEY,
  organization_id  uuid NOT NULL REFERENCES organizations (id),
  student_id       uuid NOT NULL,
  period_kind      text NOT NULL CHECK (period_kind IN ('WEEK', 'MONTH')),
  period_start     date NOT NULL,
  period_end       date NOT NULL CHECK (period_end >= period_start),
  published_by     uuid NOT NULL REFERENCES users (id),
  published_at     timestamptz NOT NULL,
  -- SHA-256 (hex) of the family payload (packages/domain/reports publishedFingerprint) as last seen.
  content_hash     text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  -- "Updated on …": the latest source change that altered the family payload after publishing; null until then.
  updated_at       timestamptz,
  unpublished_by   uuid REFERENCES users (id),
  unpublished_at   timestamptz,
  UNIQUE (organization_id, student_id, period_kind, period_start),
  FOREIGN KEY (organization_id, student_id) REFERENCES students (organization_id, id),
  CHECK ((unpublished_at IS NULL) = (unpublished_by IS NULL))
);
CREATE INDEX report_published_student_idx ON report_published (organization_id, student_id, period_start DESC) WHERE unpublished_at IS NULL;

-- ---------- Source change time (F10-AC15) ----------
ALTER TABLE report_stamps ADD COLUMN stamped_at timestamptz NOT NULL DEFAULT now();
CREATE OR REPLACE FUNCTION report_touch(org uuid, student uuid) RETURNS void LANGUAGE sql AS $$
  INSERT INTO report_stamps (organization_id, scope_key, stamp, stamped_at)
  VALUES (org, coalesce(student::text, 'ORG'), nextval('report_stamp_seq'), now())
  ON CONFLICT (organization_id, scope_key) DO UPDATE SET stamp = EXCLUDED.stamp, stamped_at = EXCLUDED.stamped_at;
$$;
GRANT UPDATE (stamped_at) ON report_stamps TO hifz_tenant;

-- ---------- Row-level security (ADR-016) ----------
ALTER TABLE student_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_accounts FORCE ROW LEVEL SECURITY;
CREATE POLICY student_accounts_tenant ON student_accounts
  USING (organization_id = app_current_org_id()) WITH CHECK (organization_id = app_current_org_id());

ALTER TABLE student_guardians ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_guardians FORCE ROW LEVEL SECURITY;
CREATE POLICY student_guardians_tenant ON student_guardians
  USING (organization_id = app_current_org_id()) WITH CHECK (organization_id = app_current_org_id());

ALTER TABLE report_published ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_published FORCE ROW LEVEL SECURITY;
CREATE POLICY report_published_tenant ON report_published
  USING (organization_id = app_current_org_id()) WITH CHECK (organization_id = app_current_org_id());

GRANT SELECT, INSERT ON student_accounts TO hifz_tenant;
GRANT UPDATE (unlinked_by, unlinked_at) ON student_accounts TO hifz_tenant;
GRANT SELECT, INSERT ON student_guardians TO hifz_tenant;
GRANT UPDATE (verification_method, verified_by, verified_at, revoked_by, revoked_at) ON student_guardians TO hifz_tenant;
GRANT SELECT, INSERT ON report_published TO hifz_tenant;
GRANT UPDATE (period_end, published_by, published_at, content_hash, updated_at, unpublished_by, unpublished_at) ON report_published TO hifz_tenant;
-- The Admin's family-access screen shows each login's User ID.
GRANT SELECT (login_id) ON users TO hifz_tenant;

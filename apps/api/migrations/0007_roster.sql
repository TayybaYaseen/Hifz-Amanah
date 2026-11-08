-- 0007 · Roster: classes, teacher assignments, students, enrollments (F03; US-010…012).
-- ARCHITECTURE.md §6.1, §6.3, §7.2; FR-CLS-001…003, FR-STU-001…006, NFR-PRV-001; DEC-B14, DEC-B56…B59.
-- Plan: docs/handover/F03-plan.md.
--
-- History is never lost (F03 context, FR-STU-004): there is no delete path. The tenant role has no DELETE grant,
-- and a trigger refuses DELETE for every role, so a class, student, assignment, or enrollment can only be
-- deactivated or ended. No ON DELETE CASCADE anywhere.
-- Every table follows the row-level security pattern of 0004 (apps/api/src/platform/tenant.ts, ADR-016).

-- Composite foreign keys (organization_id, id) make a cross-tenant reference impossible (ARCHITECTURE.md §6.1).
ALTER TABLE users ADD CONSTRAINT users_org_id_key UNIQUE (organization_id, id);

-- ---------- classes (FR-CLS-001, FR-CLS-003) ----------
CREATE TABLE classes (
  id              uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations (id),
  name            text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  status          text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at      timestamptz NOT NULL,
  updated_at      timestamptz NOT NULL,
  deactivated_at  timestamptz,
  row_version     bigint NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  UNIQUE (organization_id, id),
  CHECK ((status = 'INACTIVE') = (deactivated_at IS NOT NULL))
);
-- Active class names are unique per madrasa, ignoring case; a deactivated class's name may be reused (DEC-B58).
CREATE UNIQUE INDEX classes_active_name_key ON classes (organization_id, lower(btrim(name))) WHERE status = 'ACTIVE';

-- ---------- class_teachers: assignment history (FR-CLS-002) ----------
-- An assignment is ended (unassigned_at), never deleted, so "who taught this class when" survives.
CREATE TABLE class_teachers (
  id              uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  class_id        uuid NOT NULL,
  teacher_user_id uuid NOT NULL,
  assigned_at     timestamptz NOT NULL,
  assigned_by     uuid REFERENCES users (id),
  unassigned_at   timestamptz,
  unassigned_by   uuid REFERENCES users (id),
  FOREIGN KEY (organization_id, class_id) REFERENCES classes (organization_id, id),
  FOREIGN KEY (organization_id, teacher_user_id) REFERENCES users (organization_id, id)
);
CREATE UNIQUE INDEX class_teachers_one_current ON class_teachers (class_id, teacher_user_id) WHERE unassigned_at IS NULL;
CREATE INDEX class_teachers_teacher_idx ON class_teachers (organization_id, teacher_user_id) WHERE unassigned_at IS NULL;

-- ---------- students (FR-STU-001, FR-STU-005, NFR-PRV-001) ----------
-- Only what DEC-B56 allows: name (required), roll number / External Student ID, admission date, private staff
-- notes. No date of birth, address, phone, or photo. private_notes is internal: staff only, never sent to a
-- Student or Parent, never logged or audited by value.
CREATE TABLE students (
  id                  uuid PRIMARY KEY,
  organization_id     uuid NOT NULL REFERENCES organizations (id),
  name                text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  external_student_id text CHECK (external_student_id IS NULL OR length(btrim(external_student_id)) BETWEEN 1 AND 50),
  admission_date      date,
  private_notes       text CHECK (private_notes IS NULL OR length(private_notes) <= 2000),
  status              text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at          timestamptz NOT NULL,
  updated_at          timestamptz NOT NULL,
  deactivated_at      timestamptz,
  row_version         bigint NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  UNIQUE (organization_id, id),
  CHECK ((status = 'INACTIVE') = (deactivated_at IS NOT NULL))
);
-- The External Student ID is unique within a madrasa, ignoring case, whatever the student's status (F03-AC7).
CREATE UNIQUE INDEX students_external_id_key ON students (organization_id, lower(btrim(external_student_id)))
  WHERE external_student_id IS NOT NULL;
CREATE INDEX students_org_name_idx ON students (organization_id, lower(name), id);

-- ---------- student_enrollments: class history (FR-STU-002, FR-STU-006) ----------
-- Dates are calendar dates in the madrasa's timezone. end_date is inclusive; NULL means open-ended.
-- At most one open enrollment per student (DEC-B57). Non-overlap of the ranges is enforced by the roster service
-- under a row lock on the student, using packages/domain/roster (planEnrollment).
CREATE TABLE student_enrollments (
  id              uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  student_id      uuid NOT NULL,
  class_id        uuid NOT NULL,
  start_date      date NOT NULL,
  end_date        date,
  created_at      timestamptz NOT NULL,
  created_by      uuid REFERENCES users (id),
  ended_at        timestamptz,
  ended_by        uuid REFERENCES users (id),
  FOREIGN KEY (organization_id, student_id) REFERENCES students (organization_id, id),
  FOREIGN KEY (organization_id, class_id) REFERENCES classes (organization_id, id),
  CHECK (end_date IS NULL OR end_date >= start_date)
);
CREATE UNIQUE INDEX student_enrollments_one_open ON student_enrollments (student_id) WHERE end_date IS NULL;
CREATE INDEX student_enrollments_student_idx ON student_enrollments (organization_id, student_id, start_date);
CREATE INDEX student_enrollments_class_idx ON student_enrollments (organization_id, class_id, start_date);

-- ---------- No delete path (F03 "Done means") ----------
CREATE FUNCTION roster_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows are never deleted; deactivate or end them instead', TG_TABLE_NAME;
END;
$$;
CREATE TRIGGER classes_no_delete BEFORE DELETE ON classes FOR EACH ROW EXECUTE FUNCTION roster_no_delete();
CREATE TRIGGER class_teachers_no_delete BEFORE DELETE ON class_teachers FOR EACH ROW EXECUTE FUNCTION roster_no_delete();
CREATE TRIGGER students_no_delete BEFORE DELETE ON students FOR EACH ROW EXECUTE FUNCTION roster_no_delete();
CREATE TRIGGER student_enrollments_no_delete BEFORE DELETE ON student_enrollments FOR EACH ROW EXECUTE FUNCTION roster_no_delete();

-- ---------- Row-level security (ADR-016) ----------
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes FORCE ROW LEVEL SECURITY;
CREATE POLICY classes_tenant ON classes
  USING (organization_id = app_current_org_id()) WITH CHECK (organization_id = app_current_org_id());

ALTER TABLE class_teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_teachers FORCE ROW LEVEL SECURITY;
CREATE POLICY class_teachers_tenant ON class_teachers
  USING (organization_id = app_current_org_id()) WITH CHECK (organization_id = app_current_org_id());

ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE students FORCE ROW LEVEL SECURITY;
CREATE POLICY students_tenant ON students
  USING (organization_id = app_current_org_id()) WITH CHECK (organization_id = app_current_org_id());

ALTER TABLE student_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_enrollments FORCE ROW LEVEL SECURITY;
CREATE POLICY student_enrollments_tenant ON student_enrollments
  USING (organization_id = app_current_org_id()) WITH CHECK (organization_id = app_current_org_id());

-- Least privilege: no DELETE anywhere; only the columns the roster service changes are updatable.
GRANT SELECT, INSERT ON classes TO hifz_tenant;
GRANT UPDATE (name, status, updated_at, deactivated_at, row_version) ON classes TO hifz_tenant;
GRANT SELECT, INSERT ON class_teachers TO hifz_tenant;
GRANT UPDATE (unassigned_at, unassigned_by) ON class_teachers TO hifz_tenant;
GRANT SELECT, INSERT ON students TO hifz_tenant;
GRANT UPDATE (name, external_student_id, admission_date, private_notes, status, updated_at, deactivated_at, row_version)
  ON students TO hifz_tenant;
GRANT SELECT, INSERT ON student_enrollments TO hifz_tenant;
GRANT UPDATE (end_date, ended_at, ended_by) ON student_enrollments TO hifz_tenant;
-- The roster checks that assigned teachers are active Teacher members of the same madrasa.
GRANT SELECT (user_id, organization_id, role, status, all_classes) ON memberships TO hifz_tenant;
GRANT SELECT (status) ON users TO hifz_tenant;
-- The madrasa's timezone decides "today" for enrollment dates.
GRANT SELECT (id, timezone) ON organizations TO hifz_tenant;

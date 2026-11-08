-- 0008 · Calendar: class schedules, holidays/closures/no-class days, attendance records (F04; US-013…017).
-- ARCHITECTURE.md §6.3, §6.5, §8.3; FR-CAL-001…010, FR-DAY-002A, FR-DAY-010, FR-ATT-002; DEC-B19…B22.
-- Plan: docs/handover/F04-plan.md.
--
-- History is never lost: no table here has a delete path (a trigger refuses DELETE for every role, and the tenant
-- role has no DELETE grant). A schedule version is superseded, an exception is cancelled, an attendance record is
-- changed (audited) but never removed. Records on a date that later becomes a holiday stay and are excluded at
-- report time (FR-CAL-009). No ON DELETE CASCADE anywhere. Row-level security as in 0004/0007 (ADR-016).

-- ---------- class_schedules: one row per schedule version (FR-CAL-001, F04-AC2) ----------
-- A version says on which ISO weekdays (1 = Monday … 7 = Sunday) the class meets from effective_from. The version in
-- force on a date is the latest non-superseded one that started on or before it; effective_to (the day before the
-- next version) is kept for reading convenience. Setting a version on the same or an earlier date than a later
-- version supersedes those (they never took effect, or the Admin replaced them).
CREATE TABLE class_schedules (
  id              uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  class_id        uuid NOT NULL,
  weekdays        smallint[] NOT NULL CHECK (weekdays <@ ARRAY[1, 2, 3, 4, 5, 6, 7]::smallint[]),
  start_time      time,
  end_time        time,
  effective_from  date NOT NULL,
  effective_to    date,
  created_at      timestamptz NOT NULL,
  created_by      uuid REFERENCES users (id),
  superseded_at   timestamptz,
  superseded_by   uuid REFERENCES users (id),
  FOREIGN KEY (organization_id, class_id) REFERENCES classes (organization_id, id),
  CHECK ((start_time IS NULL) = (end_time IS NULL)),
  CHECK (start_time IS NULL OR start_time < end_time),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE UNIQUE INDEX class_schedules_one_per_date ON class_schedules (class_id, effective_from) WHERE superseded_at IS NULL;
CREATE INDEX class_schedules_class_idx ON class_schedules (organization_id, class_id, effective_from);

-- ---------- calendar_exceptions: holidays, closures, no-class days (FR-CAL-002, FR-CAL-009) ----------
-- class_id NULL = the whole madrasa. records_confirmed is the number of records the Admin was warned about and
-- confirmed (F04-AC20). Cancelling an exception is audited; the row stays.
CREATE TABLE calendar_exceptions (
  id                uuid PRIMARY KEY,
  organization_id   uuid NOT NULL REFERENCES organizations (id),
  class_id          uuid,
  date              date NOT NULL,
  kind              text NOT NULL CHECK (kind IN ('HOLIDAY', 'CLOSURE', 'NO_CLASS')),
  label             text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 100),
  records_confirmed integer NOT NULL DEFAULT 0 CHECK (records_confirmed >= 0),
  created_at        timestamptz NOT NULL,
  created_by        uuid REFERENCES users (id),
  cancelled_at      timestamptz,
  cancelled_by      uuid REFERENCES users (id),
  FOREIGN KEY (organization_id, class_id) REFERENCES classes (organization_id, id)
);
CREATE UNIQUE INDEX calendar_exceptions_one_active
  ON calendar_exceptions (organization_id, COALESCE(class_id, '00000000-0000-0000-0000-000000000000'::uuid), date, kind)
  WHERE cancelled_at IS NULL;
CREATE INDEX calendar_exceptions_date_idx ON calendar_exceptions (organization_id, date) WHERE cancelled_at IS NULL;

-- ---------- attendance_records (FR-CAL-003, FR-CAL-007, FR-CAL-008, FR-DAY-010) ----------
-- Stored apart from performance (no portion, attempt, or quality column). The id is the client's UUIDv7 (offline
-- create, F12-AC3). One record per student and date: attendance is per day, also in MULTI_SESSION mode, so
-- session_label stays NULL in F04 (kept for ARCHITECTURE §6.3). leave_reason and absent_note are internal staff
-- text: never logged, never audited by value, never sent to a Student or Parent (F04-AC23).
CREATE TABLE attendance_records (
  id                 uuid PRIMARY KEY,
  organization_id    uuid NOT NULL,
  student_id         uuid NOT NULL,
  class_id           uuid NOT NULL,
  report_date        date NOT NULL,
  session_label      text CHECK (session_label IS NULL),
  status             text NOT NULL CHECK (status IN ('PRESENT', 'LATE', 'HALF_DAY', 'LEAVE', 'ABSENT')),
  leave_status       text NOT NULL DEFAULT 'NONE' CHECK (leave_status IN ('NONE', 'REQUESTED', 'APPROVED', 'REJECTED')),
  leave_reason       text CHECK (leave_reason IS NULL OR length(leave_reason) BETWEEN 1 AND 500),
  leave_requested_by uuid REFERENCES users (id),
  leave_requested_at timestamptz,
  leave_decided_by   uuid REFERENCES users (id),
  leave_decided_at   timestamptz,
  absent_note        text CHECK (absent_note IS NULL OR length(absent_note) BETWEEN 1 AND 500),
  recorded_by        uuid NOT NULL REFERENCES users (id),
  created_at         timestamptz NOT NULL,
  updated_at         timestamptz NOT NULL,
  updated_by         uuid NOT NULL REFERENCES users (id),
  row_version        bigint NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, student_id) REFERENCES students (organization_id, id),
  FOREIGN KEY (organization_id, class_id) REFERENCES classes (organization_id, id),
  -- Leave carries a reason and a Leave status; nothing else does (FR-CAL-008).
  CHECK ((status = 'LEAVE') = (leave_status <> 'NONE')),
  CHECK ((status = 'LEAVE') = (leave_reason IS NOT NULL)),
  -- The absence note belongs to Absent only (FR-DAY-010).
  CHECK (absent_note IS NULL OR status = 'ABSENT'),
  CHECK ((leave_decided_at IS NULL) = (leave_decided_by IS NULL))
);
CREATE UNIQUE INDEX attendance_records_one_per_day ON attendance_records (organization_id, student_id, report_date);
CREATE INDEX attendance_records_class_date_idx ON attendance_records (organization_id, class_id, report_date);
CREATE INDEX attendance_records_date_idx ON attendance_records (organization_id, report_date);
CREATE INDEX attendance_records_leave_idx ON attendance_records (organization_id, leave_status, report_date) WHERE status = 'LEAVE';

-- ---------- No delete path ----------
CREATE TRIGGER class_schedules_no_delete BEFORE DELETE ON class_schedules FOR EACH ROW EXECUTE FUNCTION roster_no_delete();
CREATE TRIGGER calendar_exceptions_no_delete BEFORE DELETE ON calendar_exceptions FOR EACH ROW EXECUTE FUNCTION roster_no_delete();
CREATE TRIGGER attendance_records_no_delete BEFORE DELETE ON attendance_records FOR EACH ROW EXECUTE FUNCTION roster_no_delete();

-- ---------- Row-level security (ADR-016) ----------
ALTER TABLE class_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_schedules FORCE ROW LEVEL SECURITY;
CREATE POLICY class_schedules_tenant ON class_schedules
  USING (organization_id = app_current_org_id()) WITH CHECK (organization_id = app_current_org_id());

ALTER TABLE calendar_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_exceptions FORCE ROW LEVEL SECURITY;
CREATE POLICY calendar_exceptions_tenant ON calendar_exceptions
  USING (organization_id = app_current_org_id()) WITH CHECK (organization_id = app_current_org_id());

ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records FORCE ROW LEVEL SECURITY;
CREATE POLICY attendance_records_tenant ON attendance_records
  USING (organization_id = app_current_org_id()) WITH CHECK (organization_id = app_current_org_id());

-- Least privilege: no DELETE; only the columns the calendar service changes are updatable.
GRANT SELECT, INSERT ON class_schedules TO hifz_tenant;
GRANT UPDATE (effective_to, superseded_at, superseded_by) ON class_schedules TO hifz_tenant;
GRANT SELECT, INSERT ON calendar_exceptions TO hifz_tenant;
GRANT UPDATE (cancelled_at, cancelled_by) ON calendar_exceptions TO hifz_tenant;
GRANT SELECT, INSERT ON attendance_records TO hifz_tenant;
GRANT UPDATE (status, leave_status, leave_reason, leave_requested_by, leave_requested_at, leave_decided_by, leave_decided_at,
              absent_note, updated_at, updated_by, row_version)
  ON attendance_records TO hifz_tenant;
-- Leave lists show who requested and decided.
GRANT SELECT (id, display_name) ON users TO hifz_tenant;

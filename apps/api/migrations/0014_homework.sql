-- 0014 · Homework and carry forward: assignments, portions, and the next-class link (F08; US-033…038).
-- ARCHITECTURE.md §6.3, §8.3, §9.2, §15; FR-HW-001…018, FR-QTY-005, NFR-REL-003; DEC-B17, DEC-B29, DEC-B30, DEC-B60,
-- DEC-B61. Plan: docs/handover/F08-plan.md.
--
-- History is never lost: no delete path (trigger + no DELETE grant), no ON DELETE CASCADE. A draft portion is removed by
-- setting removed_at. Confirmed homework is immutable: a trigger refuses every change to a confirmed assignment except
-- CONFIRMED → SUPERSEDED (an Owner/Admin revision, FR-HW-012), and every change to the portions of a non-draft assignment
-- (FR-HW-011, AC-HW-07). Quantities are exact (unit, numerator, denominator) integers, never floats. Instructions are
-- staff text: never logged, audited by field name only. Row-level security as in 0012 (ADR-016).

-- ---------- homework_assignments (FR-HW-001, FR-HW-004, FR-HW-008…012) ----------
-- The id is the client's UUIDv7 (an offline draft, F12-AC3). assigned_date and due_date are calendar dates in the
-- madrasa's timezone. confirmed_at is the Teacher's confirmation time as the device recorded it (F08-AC20).
CREATE TABLE homework_assignments (
  id                     uuid PRIMARY KEY,
  organization_id        uuid NOT NULL,
  student_id             uuid NOT NULL,
  class_id               uuid NOT NULL,
  source_daily_record_id uuid,
  assigned_date          date NOT NULL,
  due_date               date NOT NULL,
  status                 text NOT NULL CHECK (status IN ('DRAFT', 'CONFIRMED', 'SUPERSEDED', 'REJECTED')),
  revision_of            uuid,
  instructions           text CHECK (instructions IS NULL OR (length(instructions) BETWEEN 1 AND 500 AND instructions = btrim(instructions))),
  created_by             uuid NOT NULL REFERENCES users (id),
  created_at             timestamptz NOT NULL,
  updated_at             timestamptz NOT NULL,
  updated_by             uuid NOT NULL REFERENCES users (id),
  confirmed_by           uuid REFERENCES users (id),
  confirmed_at           timestamptz,
  rejected_by            uuid REFERENCES users (id),
  rejected_at            timestamptz,
  superseded_by_user     uuid REFERENCES users (id),
  superseded_at          timestamptz,
  row_version            bigint NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, student_id) REFERENCES students (organization_id, id),
  FOREIGN KEY (organization_id, class_id) REFERENCES classes (organization_id, id),
  FOREIGN KEY (organization_id, source_daily_record_id) REFERENCES daily_records (organization_id, id),
  FOREIGN KEY (organization_id, revision_of) REFERENCES homework_assignments (organization_id, id),
  CHECK (due_date >= assigned_date),
  -- Confirmed (and later superseded) homework records who confirmed it and when; a draft or rejected one never does.
  CHECK ((confirmed_by IS NULL) = (confirmed_at IS NULL)),
  CHECK ((status IN ('CONFIRMED', 'SUPERSEDED')) = (confirmed_by IS NOT NULL)),
  CHECK ((status = 'REJECTED') = (rejected_at IS NOT NULL) AND (rejected_at IS NULL) = (rejected_by IS NULL)),
  CHECK ((status = 'SUPERSEDED') = (superseded_at IS NOT NULL) AND (superseded_at IS NULL) = (superseded_by_user IS NULL)),
  CHECK (revision_of IS NULL OR revision_of <> id)
);
CREATE INDEX homework_assignments_student_idx ON homework_assignments (organization_id, student_id, assigned_date DESC, id);
CREATE INDEX homework_assignments_record_idx ON homework_assignments (organization_id, source_daily_record_id) WHERE source_daily_record_id IS NOT NULL;
-- One revision per assignment: a second revise of the same superseded assignment is refused.
CREATE UNIQUE INDEX homework_assignments_revision ON homework_assignments (organization_id, revision_of) WHERE revision_of IS NOT NULL;

-- ---------- homework_portions (FR-HW-002, FR-HW-003, FR-HW-014, FR-HW-018) ----------
CREATE TABLE homework_portions (
  id                         uuid PRIMARY KEY,
  organization_id            uuid NOT NULL,
  assignment_id              uuid NOT NULL,
  section                    text NOT NULL CHECK (section IN ('SABAQ', 'SABQI', 'MANZIL')),
  position                   integer NOT NULL CHECK (position BETWEEN 1 AND 100),
  para_number                smallint NOT NULL CHECK (para_number BETWEEN 1 AND 30),
  surah_start                smallint CHECK (surah_start BETWEEN 1 AND 114),
  ayah_start                 smallint CHECK (ayah_start >= 1),
  surah_end                  smallint CHECK (surah_end BETWEEN 1 AND 114),
  ayah_end                   smallint CHECK (ayah_end >= 1),
  total_lines                integer,
  line_count_edition         text REFERENCES mushaf_editions (code),
  -- Null only while a suggested portion needs review (no remaining could be computed, F08-AC4).
  assigned_unit              text CHECK (assigned_unit IN ('PARA', 'LINES', 'AYAT', 'PAGES')),
  assigned_num               integer CHECK (assigned_num > 0),
  assigned_den               integer CHECK (assigned_den >= 1),
  needs_review               boolean NOT NULL DEFAULT false,
  origin                     text NOT NULL CHECK (origin IN ('SUGGESTED', 'TEACHER_EDITED', 'TEACHER_ADDED')),
  source_attempt_id          uuid,
  source_lesson_portion_id   uuid,
  source_homework_portion_id uuid,
  instructions               text CHECK (instructions IS NULL OR (length(instructions) BETWEEN 1 AND 500 AND instructions = btrim(instructions))),
  removed_at                 timestamptz,
  created_at                 timestamptz NOT NULL,
  updated_at                 timestamptz NOT NULL,
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, assignment_id) REFERENCES homework_assignments (organization_id, id),
  FOREIGN KEY (organization_id, source_attempt_id) REFERENCES portion_attempts (organization_id, id),
  FOREIGN KEY (organization_id, source_lesson_portion_id) REFERENCES lesson_portions (organization_id, id),
  FOREIGN KEY (organization_id, source_homework_portion_id) REFERENCES homework_portions (organization_id, id),
  CHECK ((surah_start IS NULL) = (ayah_start IS NULL) AND (surah_start IS NULL) = (surah_end IS NULL) AND (surah_start IS NULL) = (ayah_end IS NULL)),
  CHECK ((assigned_unit IS NULL) = (assigned_num IS NULL) AND (assigned_unit IS NULL) = (assigned_den IS NULL)),
  CHECK (assigned_unit IS NULL OR assigned_unit = 'PARA' OR assigned_den = 1),
  CHECK (assigned_unit IS NOT NULL OR (needs_review AND origin = 'SUGGESTED')),
  -- Suggested and edited portions are traceable to their source attempt (FR-HW-014); added ones have none.
  CHECK ((origin = 'TEACHER_ADDED') = (source_attempt_id IS NULL) AND (source_attempt_id IS NULL) = (source_lesson_portion_id IS NULL)),
  -- Sabaq: one Surah's Ayat range, Total Lines with its edition, LINES ≤ Total (FR-HW-018, DEC-B61). Sabqi/Manzil: no
  -- Total Lines.
  CHECK (section <> 'SABAQ' OR (
    surah_start IS NOT NULL AND surah_end = surah_start AND ayah_start <= ayah_end AND total_lines > 0
    AND line_count_edition IS NOT NULL AND (assigned_unit IS NULL OR (assigned_unit = 'LINES' AND assigned_num <= total_lines)))),
  CHECK (section = 'SABAQ' OR (total_lines IS NULL AND line_count_edition IS NULL))
);
CREATE INDEX homework_portions_assignment_idx ON homework_portions (organization_id, assignment_id, section, position);
CREATE INDEX homework_portions_source_attempt_idx ON homework_portions (organization_id, source_attempt_id) WHERE source_attempt_id IS NOT NULL;
CREATE INDEX homework_portions_source_portion_idx ON homework_portions (organization_id, source_lesson_portion_id) WHERE source_lesson_portion_id IS NOT NULL;

-- ---------- The next-class link (FR-HW-015, F08-AC16; ARCHITECTURE §6.3) ----------
-- Set when the lesson portion is created; never changed afterwards (no UPDATE grant on the column).
ALTER TABLE lesson_portions ADD COLUMN homework_portion_id uuid;
ALTER TABLE lesson_portions
  ADD CONSTRAINT lesson_portions_homework_portion_fk FOREIGN KEY (organization_id, homework_portion_id) REFERENCES homework_portions (organization_id, id);
CREATE INDEX lesson_portions_homework_idx ON lesson_portions (organization_id, homework_portion_id) WHERE homework_portion_id IS NOT NULL;

-- ---------- Confirmed homework is never changed (FR-HW-012, AC-HW-07) ----------
CREATE FUNCTION homework_assignment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'DRAFT' THEN
    IF NEW.status NOT IN ('DRAFT', 'CONFIRMED', 'REJECTED') THEN
      RAISE EXCEPTION 'a draft becomes confirmed or rejected only' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  -- The only change to a non-draft: an explicit revision supersedes a confirmed assignment. Its content stays as it was.
  IF OLD.status = 'CONFIRMED' AND NEW.status = 'SUPERSEDED'
     AND (NEW.student_id, NEW.class_id, NEW.source_daily_record_id, NEW.assigned_date, NEW.due_date, NEW.instructions,
          NEW.revision_of, NEW.created_by, NEW.created_at, NEW.confirmed_by, NEW.confirmed_at)
         IS NOT DISTINCT FROM
         (OLD.student_id, OLD.class_id, OLD.source_daily_record_id, OLD.assigned_date, OLD.due_date, OLD.instructions,
          OLD.revision_of, OLD.created_by, OLD.created_at, OLD.confirmed_by, OLD.confirmed_at) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'homework is %: only a draft is edited, and confirmed homework only becomes superseded', OLD.status
    USING ERRCODE = 'check_violation';
END;
$$;
CREATE TRIGGER homework_assignments_guard BEFORE UPDATE ON homework_assignments FOR EACH ROW EXECUTE FUNCTION homework_assignment_guard();

CREATE FUNCTION homework_portion_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  parent_status text;
BEGIN
  SELECT status INTO parent_status FROM homework_assignments WHERE organization_id = NEW.organization_id AND id = NEW.assignment_id;
  IF parent_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'portions of % homework are never changed', coalesce(parent_status, 'missing') USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.assignment_id <> OLD.assignment_id THEN
    RAISE EXCEPTION 'a homework portion never moves to another assignment' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER homework_portions_guard BEFORE INSERT OR UPDATE ON homework_portions FOR EACH ROW EXECUTE FUNCTION homework_portion_guard();

-- ---------- No delete path ----------
CREATE TRIGGER homework_assignments_no_delete BEFORE DELETE ON homework_assignments FOR EACH ROW EXECUTE FUNCTION roster_no_delete();
CREATE TRIGGER homework_portions_no_delete BEFORE DELETE ON homework_portions FOR EACH ROW EXECUTE FUNCTION roster_no_delete();

-- ---------- Row-level security (ADR-016) ----------
ALTER TABLE homework_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE homework_assignments FORCE ROW LEVEL SECURITY;
CREATE POLICY homework_assignments_tenant ON homework_assignments
  USING (organization_id = app_current_org_id()) WITH CHECK (organization_id = app_current_org_id());

ALTER TABLE homework_portions ENABLE ROW LEVEL SECURITY;
ALTER TABLE homework_portions FORCE ROW LEVEL SECURITY;
CREATE POLICY homework_portions_tenant ON homework_portions
  USING (organization_id = app_current_org_id()) WITH CHECK (organization_id = app_current_org_id());

-- Least privilege: no DELETE; only the columns the homework service changes are updatable.
GRANT SELECT, INSERT ON homework_assignments TO hifz_tenant;
GRANT UPDATE (due_date, instructions, status, confirmed_by, confirmed_at, rejected_by, rejected_at, superseded_by_user,
              superseded_at, updated_at, updated_by, row_version)
  ON homework_assignments TO hifz_tenant;
GRANT SELECT, INSERT ON homework_portions TO hifz_tenant;
GRANT UPDATE (position, para_number, surah_start, ayah_start, surah_end, ayah_end, total_lines, line_count_edition,
              assigned_unit, assigned_num, assigned_den, needs_review, origin, source_attempt_id, source_lesson_portion_id,
              source_homework_portion_id, instructions, removed_at, updated_at)
  ON homework_portions TO hifz_tenant;

-- 0012 · Daily Hifz entry: daily records, lesson portions, attempts, attempt mistakes (F05; US-018…023).
-- ARCHITECTURE.md §6.2–§6.4, §6.6, §9.1, §15; FR-DAY-001…011, FR-SAB-001…004, FR-SAB-008…010, FR-QTY-*,
-- FR-ATT-001…011; DEC-B22…B25, DEC-B60…B64. Plan: docs/handover/F05-plan.md §2.
--
-- History is never lost: no table here has a delete path (a trigger refuses DELETE for every role, and the tenant
-- role has no DELETE grant). A portion is removed by setting removed_at (its row and attempts stay); an attempt is
-- corrected in place (audited) and a new attempt is a new row (append-only history, FR-ATT-005). No ON DELETE
-- CASCADE anywhere. Row-level security as in 0004/0007/0008 (ADR-016).
--
-- Quantities are exact (unit, numerator, denominator) integers, never floats (ARCHITECTURE §6.2). LINES, AYAT, and
-- PAGES are whole numbers (denominator 1). Remarks are internal staff text: never logged, never audited by value,
-- never sent to a Student or Parent.

-- ---------- daily_records (FR-DAY-001, FR-DAY-008) ----------
-- The id is the client's UUIDv7 (offline create, F12-AC3). report_date is the Teacher's calendar date; save and
-- sync times are separate columns (F05-AC1, AC2).
CREATE TABLE daily_records (
  id                 uuid PRIMARY KEY,
  organization_id    uuid NOT NULL,
  student_id         uuid NOT NULL,
  class_id           uuid NOT NULL,
  report_date        date NOT NULL,
  session_label      text CHECK (session_label IS NULL OR (length(session_label) BETWEEN 1 AND 40 AND session_label = btrim(session_label))),
  recorded_by        uuid NOT NULL REFERENCES users (id),
  client_saved_at    timestamptz,
  server_received_at timestamptz NOT NULL,
  created_at         timestamptz NOT NULL,
  updated_at         timestamptz NOT NULL,
  updated_by         uuid NOT NULL REFERENCES users (id),
  row_version        bigint NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, student_id) REFERENCES students (organization_id, id),
  FOREIGN KEY (organization_id, class_id) REFERENCES classes (organization_id, id)
);
-- SINGLE mode: one unlabelled record per student and date. MULTI_SESSION: labels unique per student and date,
-- ignoring case (ARCHITECTURE §6.4). SINGLE also forbids a second record on the date whatever its label; the hifz
-- service enforces that under the organization's sync lock.
CREATE UNIQUE INDEX daily_records_single ON daily_records (organization_id, student_id, report_date) WHERE session_label IS NULL;
CREATE UNIQUE INDEX daily_records_session ON daily_records (organization_id, student_id, report_date, lower(session_label)) WHERE session_label IS NOT NULL;
CREATE INDEX daily_records_class_date_idx ON daily_records (organization_id, class_id, report_date);
CREATE INDEX daily_records_date_idx ON daily_records (organization_id, report_date);

-- ---------- lesson_portions (FR-DAY-003…005, FR-SAB-001…004, FR-SAB-008…010, FR-QTY-006) ----------
CREATE TABLE lesson_portions (
  id                 uuid PRIMARY KEY,
  organization_id    uuid NOT NULL,
  daily_record_id    uuid NOT NULL,
  section            text NOT NULL CHECK (section IN ('SABAQ', 'SABQI', 'MANZIL')),
  position           integer NOT NULL CHECK (position BETWEEN 1 AND 100),
  para_number        smallint CHECK (para_number BETWEEN 1 AND 30),
  surah_start        smallint CHECK (surah_start BETWEEN 1 AND 114),
  ayah_start         smallint CHECK (ayah_start >= 1),
  surah_end          smallint CHECK (surah_end BETWEEN 1 AND 114),
  ayah_end           smallint CHECK (ayah_end >= 1),
  is_extra           boolean NOT NULL DEFAULT false,
  assigned_unit      text NOT NULL CHECK (assigned_unit IN ('PARA', 'LINES', 'AYAT', 'PAGES')),
  assigned_num       integer NOT NULL CHECK (assigned_num >= 0),
  assigned_den       integer NOT NULL CHECK (assigned_den >= 1),
  total_lines        integer,
  total_lines_source text CHECK (total_lines_source IN ('LAYOUT', 'MANUAL')),
  line_count_edition text REFERENCES mushaf_editions (code),
  removed_at         timestamptz,
  removed_by         uuid REFERENCES users (id),
  created_by         uuid NOT NULL REFERENCES users (id),
  created_at         timestamptz NOT NULL,
  updated_at         timestamptz NOT NULL,
  updated_by         uuid NOT NULL REFERENCES users (id),
  row_version        bigint NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, daily_record_id) REFERENCES daily_records (organization_id, id),
  CHECK (assigned_unit = 'PARA' OR assigned_den = 1),
  -- A range is all four values or none.
  CHECK ((surah_start IS NULL) = (ayah_start IS NULL) AND (surah_start IS NULL) = (surah_end IS NULL) AND (surah_start IS NULL) = (ayah_end IS NULL)),
  -- Sabaq: one Surah's Ayat range in lines, Total Lines confirmed with its edition and source; Para derived
  -- (ARCHITECTURE §6.3, DEC-B60…B64). Sabqi/Manzil: a Para, no Total Lines.
  CHECK (section <> 'SABAQ' OR (
    surah_start IS NOT NULL AND surah_end = surah_start AND ayah_start <= ayah_end
    AND assigned_unit = 'LINES' AND total_lines > 0 AND assigned_num <= total_lines
    AND line_count_edition IS NOT NULL AND total_lines_source IS NOT NULL AND para_number IS NOT NULL)),
  CHECK (section = 'SABAQ' OR (total_lines IS NULL AND total_lines_source IS NULL AND line_count_edition IS NULL AND para_number IS NOT NULL)),
  CHECK ((removed_at IS NULL) = (removed_by IS NULL))
);
CREATE INDEX lesson_portions_record_idx ON lesson_portions (organization_id, daily_record_id, section, position);
-- The FR-SAB-007 review list reads Sabaq ranges.
CREATE INDEX lesson_portions_sabaq_idx ON lesson_portions (organization_id, surah_start) WHERE section = 'SABAQ';

-- ---------- portion_attempts (FR-ATT-001…008, FR-ATT-011, FR-QTY-007, FR-QTY-008) ----------
CREATE TABLE portion_attempts (
  id                 uuid PRIMARY KEY,
  organization_id    uuid NOT NULL,
  lesson_portion_id  uuid NOT NULL,
  attempt_no         integer NOT NULL CHECK (attempt_no BETWEEN 1 AND 1000),
  attempted_at       timestamptz NOT NULL,
  recorded_by        uuid NOT NULL REFERENCES users (id),
  status             text NOT NULL CHECK (status IN ('COMPLETED', 'PARTIAL', 'NOT_REMEMBERED', 'ABSENT', 'NOT_ASSIGNED', 'PENDING')),
  completed_unit     text CHECK (completed_unit IN ('PARA', 'LINES', 'AYAT', 'PAGES')),
  completed_num      integer CHECK (completed_num >= 0),
  completed_den      integer CHECK (completed_den >= 1),
  -- Lower is better (FR-ATT-009); null = not recorded, never zero.
  quality            smallint CHECK (quality BETWEEN 1 AND 5),
  no_mistakes        boolean NOT NULL DEFAULT false,
  remarks            text CHECK (remarks IS NULL OR length(remarks) BETWEEN 1 AND 500),
  -- F10 (US-046) adds the visibility toggle; until then remarks are internal only.
  remarks_visibility text NOT NULL DEFAULT 'INTERNAL' CHECK (remarks_visibility = 'INTERNAL'),
  created_at         timestamptz NOT NULL,
  updated_at         timestamptz NOT NULL,
  updated_by         uuid NOT NULL REFERENCES users (id),
  row_version        bigint NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, lesson_portion_id, attempt_no),
  FOREIGN KEY (organization_id, lesson_portion_id) REFERENCES lesson_portions (organization_id, id),
  CHECK ((completed_unit IS NULL) = (completed_num IS NULL) AND (completed_unit IS NULL) = (completed_den IS NULL)),
  CHECK (completed_unit IS NULL OR completed_unit = 'PARA' OR completed_den = 1),
  -- ABSENT, NOT_ASSIGNED, and PENDING carry no quality (FR-ATT-007).
  CHECK (quality IS NULL OR status IN ('COMPLETED', 'PARTIAL', 'NOT_REMEMBERED'))
);
CREATE INDEX portion_attempts_portion_idx ON portion_attempts (organization_id, lesson_portion_id, attempt_no);

-- ---------- attempt_mistakes (FR-ATT-010) ----------
-- Written only with their attempt, in its transaction. A correction replaces the attempt's list: the old rows are
-- detached (superseded_at), never deleted. Mistake notes are F07.
CREATE TABLE attempt_mistakes (
  id              uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  attempt_id      uuid NOT NULL,
  position        integer NOT NULL CHECK (position >= 1),
  category        text NOT NULL CHECK (category IN ('HARKAAT', 'TAJWEED', 'LAFZI', 'AYAT_BHOOLNA', 'TARTEEB', 'WAQF_IBTIDA')),
  severity        text NOT NULL CHECK (severity IN ('MINOR', 'MAJOR')),
  repeated        boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL,
  superseded_at   timestamptz,
  FOREIGN KEY (organization_id, attempt_id) REFERENCES portion_attempts (organization_id, id)
);
CREATE UNIQUE INDEX attempt_mistakes_current ON attempt_mistakes (attempt_id, position) WHERE superseded_at IS NULL;
CREATE INDEX attempt_mistakes_attempt_idx ON attempt_mistakes (organization_id, attempt_id) WHERE superseded_at IS NULL;

-- ---------- No delete path ----------
CREATE TRIGGER daily_records_no_delete BEFORE DELETE ON daily_records FOR EACH ROW EXECUTE FUNCTION roster_no_delete();
CREATE TRIGGER lesson_portions_no_delete BEFORE DELETE ON lesson_portions FOR EACH ROW EXECUTE FUNCTION roster_no_delete();
CREATE TRIGGER portion_attempts_no_delete BEFORE DELETE ON portion_attempts FOR EACH ROW EXECUTE FUNCTION roster_no_delete();
CREATE TRIGGER attempt_mistakes_no_delete BEFORE DELETE ON attempt_mistakes FOR EACH ROW EXECUTE FUNCTION roster_no_delete();

-- ---------- Row-level security (ADR-016) ----------
ALTER TABLE daily_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_records FORCE ROW LEVEL SECURITY;
CREATE POLICY daily_records_tenant ON daily_records
  USING (organization_id = app_current_org_id()) WITH CHECK (organization_id = app_current_org_id());

ALTER TABLE lesson_portions ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_portions FORCE ROW LEVEL SECURITY;
CREATE POLICY lesson_portions_tenant ON lesson_portions
  USING (organization_id = app_current_org_id()) WITH CHECK (organization_id = app_current_org_id());

ALTER TABLE portion_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE portion_attempts FORCE ROW LEVEL SECURITY;
CREATE POLICY portion_attempts_tenant ON portion_attempts
  USING (organization_id = app_current_org_id()) WITH CHECK (organization_id = app_current_org_id());

ALTER TABLE attempt_mistakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE attempt_mistakes FORCE ROW LEVEL SECURITY;
CREATE POLICY attempt_mistakes_tenant ON attempt_mistakes
  USING (organization_id = app_current_org_id()) WITH CHECK (organization_id = app_current_org_id());

-- Least privilege: no DELETE; only the columns the hifz service changes are updatable.
GRANT SELECT, INSERT ON daily_records TO hifz_tenant;
GRANT UPDATE (session_label, updated_at, updated_by, row_version) ON daily_records TO hifz_tenant;
GRANT SELECT, INSERT ON lesson_portions TO hifz_tenant;
GRANT UPDATE (position, is_extra, para_number, surah_start, ayah_start, surah_end, ayah_end, assigned_unit, assigned_num,
              assigned_den, total_lines, total_lines_source, line_count_edition, removed_at, removed_by, updated_at,
              updated_by, row_version)
  ON lesson_portions TO hifz_tenant;
GRANT SELECT, INSERT ON portion_attempts TO hifz_tenant;
GRANT UPDATE (attempted_at, status, completed_unit, completed_num, completed_den, quality, no_mistakes, remarks, updated_at,
              updated_by, row_version)
  ON portion_attempts TO hifz_tenant;
GRANT SELECT, INSERT ON attempt_mistakes TO hifz_tenant;
GRANT UPDATE (superseded_at) ON attempt_mistakes TO hifz_tenant;
-- The hifz handlers read the madrasa's daily-report mode.
GRANT SELECT (daily_report_mode) ON organizations TO hifz_tenant;

-- The daily-report mode switch (US-019) runs in the madrasa's tenant transaction, after checking its records for
-- conflicts under the organization's sync lock. organizations has no row-level security, so the tenant role gets no
-- UPDATE on it; this function changes only the current tenant's row.
CREATE FUNCTION app_set_daily_report_mode(mode text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF app_current_org_id() IS NULL THEN
    RAISE EXCEPTION 'no current organization';
  END IF;
  UPDATE organizations SET daily_report_mode = mode WHERE id = app_current_org_id();
END;
$$;
REVOKE ALL ON FUNCTION app_set_daily_report_mode(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_set_daily_report_mode(text) TO hifz_tenant;

-- 0015 · Weekly and monthly reports: the report cache and its source stamps (F09; US-039…043, US-073).
-- ARCHITECTURE.md §6.3, §9.3; FR-RPT-001, FR-RPT-002, FR-RPT-008, NFR-PERF-002, NFR-PERF-004; ADR-020.
-- Plan: docs/handover/F09-plan.md.
--
-- Reports are derived from source records and never stored as editable totals (FR-RPT-001). The cache below is only a
-- copy of a computed report, valid while its sources are unchanged:
-- - report_stamps holds a counter per student (its records, portions, attempts, mistakes, attendance, homework,
--   enrollments, and name) and one per madrasa ('ORG': timetables and holidays/closures/no-class days, which can turn
--   any student's day into a non-class day, FR-CAL-009). Triggers on every source table bump the counter in the same
--   transaction as the change, so no service can forget to invalidate (FR-RPT-008). change_log alone is not enough:
--   calendar and roster changes are not sync entities.
-- - report_cache stores the staff payload with the stamps it was built from, the date it was built for ("today"
--   decides future days and homework state), and the madrasa settings it used. A read whose stamps, date, or settings
--   differ rebuilds from source (F09-AC3). The payload holds staff text (remarks, internal notes) under RLS and is
--   never sent to another audience without projectFor().
-- No DELETE grant on either table; a cache row is overwritten, never needed for history.

-- ---------- Source stamps ----------
CREATE SEQUENCE report_stamp_seq;

CREATE TABLE report_stamps (
  organization_id uuid NOT NULL REFERENCES organizations (id),
  -- 'ORG' for the madrasa-wide stamp, otherwise the student's id as text.
  scope_key       text NOT NULL CHECK (scope_key = 'ORG' OR scope_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  stamp           bigint NOT NULL,
  PRIMARY KEY (organization_id, scope_key)
);

-- Bumps one stamp. Runs as the caller (hifz_tenant inside withTenant), so RLS applies to it like to the source write.
CREATE FUNCTION report_touch(org uuid, student uuid) RETURNS void LANGUAGE sql AS $$
  INSERT INTO report_stamps (organization_id, scope_key, stamp)
  VALUES (org, coalesce(student::text, 'ORG'), nextval('report_stamp_seq'))
  ON CONFLICT (organization_id, scope_key) DO UPDATE SET stamp = EXCLUDED.stamp;
$$;

-- Tables that carry the student directly.
CREATE FUNCTION report_touch_student_row() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM report_touch(NEW.organization_id, NEW.student_id);
  IF TG_OP = 'UPDATE' AND OLD.student_id IS DISTINCT FROM NEW.student_id THEN
    PERFORM report_touch(OLD.organization_id, OLD.student_id);
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER daily_records_report_touch AFTER INSERT OR UPDATE ON daily_records FOR EACH ROW EXECUTE FUNCTION report_touch_student_row();
CREATE TRIGGER attendance_records_report_touch AFTER INSERT OR UPDATE ON attendance_records FOR EACH ROW EXECUTE FUNCTION report_touch_student_row();
CREATE TRIGGER homework_assignments_report_touch AFTER INSERT OR UPDATE ON homework_assignments FOR EACH ROW EXECUTE FUNCTION report_touch_student_row();
CREATE TRIGGER student_enrollments_report_touch AFTER INSERT OR UPDATE ON student_enrollments FOR EACH ROW EXECUTE FUNCTION report_touch_student_row();

CREATE FUNCTION report_touch_student() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM report_touch(NEW.organization_id, NEW.id);
  RETURN NULL;
END;
$$;
CREATE TRIGGER students_report_touch AFTER INSERT OR UPDATE ON students FOR EACH ROW EXECUTE FUNCTION report_touch_student();

-- Tables that reach the student through a parent row.
CREATE FUNCTION report_touch_lesson_portion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM report_touch(r.organization_id, r.student_id)
    FROM daily_records r WHERE r.organization_id = NEW.organization_id AND r.id = NEW.daily_record_id;
  RETURN NULL;
END;
$$;
CREATE TRIGGER lesson_portions_report_touch AFTER INSERT OR UPDATE ON lesson_portions FOR EACH ROW EXECUTE FUNCTION report_touch_lesson_portion();

CREATE FUNCTION report_touch_portion_attempt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM report_touch(r.organization_id, r.student_id)
    FROM lesson_portions p JOIN daily_records r ON r.organization_id = p.organization_id AND r.id = p.daily_record_id
    WHERE p.organization_id = NEW.organization_id AND p.id = NEW.lesson_portion_id;
  RETURN NULL;
END;
$$;
CREATE TRIGGER portion_attempts_report_touch AFTER INSERT OR UPDATE ON portion_attempts FOR EACH ROW EXECUTE FUNCTION report_touch_portion_attempt();

CREATE FUNCTION report_touch_attempt_mistake() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM report_touch(r.organization_id, r.student_id)
    FROM portion_attempts a
    JOIN lesson_portions p ON p.organization_id = a.organization_id AND p.id = a.lesson_portion_id
    JOIN daily_records r ON r.organization_id = p.organization_id AND r.id = p.daily_record_id
    WHERE a.organization_id = NEW.organization_id AND a.id = NEW.attempt_id;
  RETURN NULL;
END;
$$;
CREATE TRIGGER attempt_mistakes_report_touch AFTER INSERT OR UPDATE ON attempt_mistakes FOR EACH ROW EXECUTE FUNCTION report_touch_attempt_mistake();

CREATE FUNCTION report_touch_homework_portion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM report_touch(h.organization_id, h.student_id)
    FROM homework_assignments h WHERE h.organization_id = NEW.organization_id AND h.id = NEW.assignment_id;
  RETURN NULL;
END;
$$;
CREATE TRIGGER homework_portions_report_touch AFTER INSERT OR UPDATE ON homework_portions FOR EACH ROW EXECUTE FUNCTION report_touch_homework_portion();

-- Madrasa-wide: a timetable or an exception changes what any day is (FR-CAL-004, FR-CAL-009).
CREATE FUNCTION report_touch_org() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM report_touch(NEW.organization_id, NULL);
  RETURN NULL;
END;
$$;
CREATE TRIGGER class_schedules_report_touch AFTER INSERT OR UPDATE ON class_schedules FOR EACH ROW EXECUTE FUNCTION report_touch_org();
CREATE TRIGGER calendar_exceptions_report_touch AFTER INSERT OR UPDATE ON calendar_exceptions FOR EACH ROW EXECUTE FUNCTION report_touch_org();

-- ---------- The cache ----------
CREATE TABLE report_cache (
  organization_id uuid NOT NULL,
  student_id      uuid NOT NULL,
  period_kind     text NOT NULL CHECK (period_kind IN ('WEEK', 'MONTH')),
  period_start    date NOT NULL,
  -- 'ALL' (Owner, Admin, "all classes") or the sorted class ids the viewer reaches, joined by ','.
  scope_key       text NOT NULL CHECK (length(scope_key) BETWEEN 1 AND 4000),
  -- The madrasa's timezone and week start the report used.
  settings_key    text NOT NULL,
  as_of           date NOT NULL,
  org_stamp       bigint NOT NULL,
  student_stamp   bigint NOT NULL,
  payload         jsonb NOT NULL,
  built_at        timestamptz NOT NULL,
  PRIMARY KEY (organization_id, student_id, period_kind, period_start, scope_key),
  FOREIGN KEY (organization_id, student_id) REFERENCES students (organization_id, id)
);

-- ---------- Report query indexes (NFR-PERF-002) ----------
-- MULTI_SESSION records are outside the partial unique index daily_records_single.
CREATE INDEX daily_records_student_date_idx ON daily_records (organization_id, student_id, report_date);

-- ---------- Row-level security (ADR-016) ----------
ALTER TABLE report_stamps ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_stamps FORCE ROW LEVEL SECURITY;
CREATE POLICY report_stamps_tenant ON report_stamps
  USING (organization_id = app_current_org_id()) WITH CHECK (organization_id = app_current_org_id());

ALTER TABLE report_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_cache FORCE ROW LEVEL SECURITY;
CREATE POLICY report_cache_tenant ON report_cache
  USING (organization_id = app_current_org_id()) WITH CHECK (organization_id = app_current_org_id());

-- Reports read the madrasa's week start with its timezone (FR-RPT-003); 0007 granted id and timezone only.
GRANT SELECT (week_start) ON organizations TO hifz_tenant;
GRANT SELECT, INSERT, UPDATE (stamp) ON report_stamps TO hifz_tenant;
GRANT USAGE ON SEQUENCE report_stamp_seq TO hifz_tenant;
GRANT SELECT, INSERT ON report_cache TO hifz_tenant;
GRANT UPDATE (settings_key, as_of, org_stamp, student_stamp, payload, built_at) ON report_cache TO hifz_tenant;

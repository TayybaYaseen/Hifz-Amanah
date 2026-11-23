-- 0017 · Excel import and export (F14; US-058…061). FR-XLS-001…018, NFR-XLS-001…004, NFR-PRV-005; DEC-B15, DEC-B43,
-- DEC-B44. ARCHITECTURE.md §11. Plan: docs/handover/F14-plan.md.
--
-- - import_jobs: one uploaded workbook. The tenant is the uploader's membership, never a workbook column
--   (FR-XLS-015). The workbook bytes are not stored: the parsed rows are, in import_rows.values, and those values are
--   purged 7 days after upload (NFR-PRV-005 "Uploaded import workbooks: 7 days; import job results are kept"). The
--   job's counts, statuses, and row results stay.
-- - import_rows: one row per (job, row number) (ARCHITECTURE §11 "Row results are stored per (job_id, row_no)"), with
--   its preview classification and field issues, its commit batch, and its result. A retried commit skips rows whose
--   result is COMMITTED (FR-XLS-014). Values may hold names and private notes: never logged or audited by value.
-- - import_record_keys: the DailyRecords `ExternalRecordID` (the stable key, FR-XLS-012/013) of each imported
--   portion, unique per madrasa ignoring case. Owned by the import module; it only points at hifz rows.
-- - portion_attempts.mistake_count_summary: an imported `MistakeCount`, a single uncategorized total (SRS §15.1,
--   ARCHITECTURE §11 "Mapping note"). NULL means none was imported (unknown, never 0); never split into categories.
-- No delete path on any of these tables; RLS as in 0004/0007 (ADR-016).

-- ---------- portion_attempts.mistake_count_summary ----------
ALTER TABLE portion_attempts
  ADD COLUMN mistake_count_summary integer CHECK (mistake_count_summary IS NULL OR mistake_count_summary BETWEEN 0 AND 1000);
GRANT UPDATE (mistake_count_summary) ON portion_attempts TO hifz_tenant;

-- ---------- import_jobs ----------
CREATE TABLE import_jobs (
  id               uuid PRIMARY KEY,
  organization_id  uuid NOT NULL REFERENCES organizations (id),
  template_name    text NOT NULL CHECK (template_name IN ('Students', 'DailyRecords')),
  template_version text NOT NULL,
  mode             text NOT NULL DEFAULT 'ADD_ONLY' CHECK (mode IN ('ADD_ONLY', 'UPDATE')),
  status           text NOT NULL CHECK (status IN ('PREVIEWED', 'COMMITTING', 'COMMITTED', 'PARTIALLY_FAILED', 'EXPIRED')),
  file_sha256      text NOT NULL CHECK (file_sha256 ~ '^[0-9a-f]{64}$'),
  row_count        integer NOT NULL CHECK (row_count BETWEEN 1 AND 1000),
  -- Workbook columns outside the template (e.g. organization_id): ignored, never read (FR-XLS-015, F14-AC8).
  ignored_columns  jsonb NOT NULL DEFAULT '[]'::jsonb,
  counts           jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_counts    jsonb,
  batch_count      integer NOT NULL DEFAULT 0 CHECK (batch_count >= 0),
  created_by       uuid NOT NULL REFERENCES users (id),
  created_at       timestamptz NOT NULL,
  updated_at       timestamptz NOT NULL,
  confirmed_by     uuid REFERENCES users (id),
  confirmed_at     timestamptz,
  finished_at      timestamptz,
  values_purge_at  timestamptz NOT NULL,
  values_purged_at timestamptz,
  UNIQUE (organization_id, id)
);
CREATE INDEX import_jobs_org_idx ON import_jobs (organization_id, created_at DESC);
CREATE INDEX import_jobs_purge_idx ON import_jobs (values_purge_at) WHERE values_purged_at IS NULL;

-- ---------- import_rows ----------
CREATE TABLE import_rows (
  organization_id uuid NOT NULL,
  job_id          uuid NOT NULL,
  row_no          integer NOT NULL CHECK (row_no >= 2),
  values          jsonb,
  classification  text NOT NULL CHECK (classification IN ('NEW', 'EXACT_MATCH', 'SUSPECTED_DUPLICATE', 'INVALID', 'PROPOSED_UPDATE')),
  issues          jsonb NOT NULL DEFAULT '[]'::jsonb,
  changes         jsonb NOT NULL DEFAULT '[]'::jsonb,
  group_key       text,
  batch_no        integer CHECK (batch_no IS NULL OR batch_no >= 1),
  result          text CHECK (result IN ('COMMITTED', 'FAILED', 'SKIPPED')),
  result_issues   jsonb NOT NULL DEFAULT '[]'::jsonb,
  entity_id       uuid,
  committed_at    timestamptz,
  PRIMARY KEY (organization_id, job_id, row_no),
  FOREIGN KEY (organization_id, job_id) REFERENCES import_jobs (organization_id, id)
);

-- ---------- import_record_keys ----------
CREATE TABLE import_record_keys (
  organization_id    uuid NOT NULL,
  external_record_id text NOT NULL CHECK (length(external_record_id) BETWEEN 1 AND 100 AND external_record_id = btrim(external_record_id)),
  lesson_portion_id  uuid NOT NULL,
  attempt_id         uuid NOT NULL,
  job_id             uuid NOT NULL,
  created_at         timestamptz NOT NULL,
  FOREIGN KEY (organization_id, lesson_portion_id) REFERENCES lesson_portions (organization_id, id),
  FOREIGN KEY (organization_id, attempt_id) REFERENCES portion_attempts (organization_id, id),
  FOREIGN KEY (organization_id, job_id) REFERENCES import_jobs (organization_id, id)
);
CREATE UNIQUE INDEX import_record_keys_key ON import_record_keys (organization_id, lower(external_record_id));
CREATE UNIQUE INDEX import_record_keys_portion ON import_record_keys (organization_id, lesson_portion_id);

-- ---------- No delete path ----------
CREATE TRIGGER import_jobs_no_delete BEFORE DELETE ON import_jobs FOR EACH ROW EXECUTE FUNCTION roster_no_delete();
CREATE TRIGGER import_rows_no_delete BEFORE DELETE ON import_rows FOR EACH ROW EXECUTE FUNCTION roster_no_delete();
CREATE TRIGGER import_record_keys_no_delete BEFORE DELETE ON import_record_keys FOR EACH ROW EXECUTE FUNCTION roster_no_delete();

-- ---------- Row-level security (ADR-016) ----------
ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_jobs FORCE ROW LEVEL SECURITY;
CREATE POLICY import_jobs_tenant ON import_jobs
  USING (organization_id = app_current_org_id()) WITH CHECK (organization_id = app_current_org_id());

ALTER TABLE import_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_rows FORCE ROW LEVEL SECURITY;
CREATE POLICY import_rows_tenant ON import_rows
  USING (organization_id = app_current_org_id()) WITH CHECK (organization_id = app_current_org_id());

ALTER TABLE import_record_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_record_keys FORCE ROW LEVEL SECURITY;
CREATE POLICY import_record_keys_tenant ON import_record_keys
  USING (organization_id = app_current_org_id()) WITH CHECK (organization_id = app_current_org_id());

-- Least privilege: no DELETE anywhere; only the columns the import service changes are updatable.
GRANT SELECT, INSERT ON import_jobs TO hifz_tenant;
GRANT UPDATE (mode, status, counts, result_counts, batch_count, updated_at, confirmed_by, confirmed_at, finished_at, values_purged_at)
  ON import_jobs TO hifz_tenant;
GRANT SELECT, INSERT ON import_rows TO hifz_tenant;
GRANT UPDATE (values, classification, issues, changes, group_key, batch_no, result, result_issues, entity_id, committed_at)
  ON import_rows TO hifz_tenant;
GRANT SELECT, INSERT ON import_record_keys TO hifz_tenant;

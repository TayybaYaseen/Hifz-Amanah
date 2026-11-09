-- 0011 · Quran reference snapshots and physical-verification evidence (F06; ADR-018; FR-SAB-011, FR-SAB-013,
-- FR-SAB-014; DEC-B75, DEC-B78, DEC-B79; plan P1–P5).
--
-- NO QURAN DATA IS INSERTED HERE, and no source, licence, reviewer, or verification is recorded. 0009 and 0010 are
-- not edited. Every change is additive; existing rows keep their meaning.

-- ---------- quran_imports: the evidence a production import must preserve (DEC-B78, P5) ----------
-- A production import already records its reviewer (`reviewed_by`), the approval date (`approved_on`), the decision
-- (`review_decision`), and the SHA-256 of the signed validation report (0010). It now also keeps:
--   mushaf_printing    the exact printing/edition identifier of the physical Taj Mushaf the reviewer compared against
--                      (verification kit Part A8), copied from the signed report;
--   signoff_ref        where the paper sign-off (or its documented digital equivalent) is held;
--   validation_report  the signed validation report itself, whose canonical SHA-256 the loader checked against
--                      `validation_report_sha256` before storing it.
-- The system records human approval; it never proves that a digital layout matches the printed Mushaf.
ALTER TABLE quran_imports
  ADD COLUMN mushaf_printing text CHECK (mushaf_printing IS NULL OR length(btrim(mushaf_printing)) BETWEEN 1 AND 300),
  ADD COLUMN signoff_ref text CHECK (signoff_ref IS NULL OR length(btrim(signoff_ref)) BETWEEN 1 AND 300),
  ADD COLUMN validation_report jsonb;

-- Production imports must carry all of it. NOT VALID: rows written before 0011 are not re-checked (only synthetic
-- test data exists anywhere so far); every new row is. A pre-0011 production row without evidence can never show as
-- verified, because `layoutVerified` also requires these columns (metadata-service.ts).
ALTER TABLE quran_imports
  ADD CONSTRAINT quran_imports_production_evidence CHECK (
    synthetic OR (mushaf_printing IS NOT NULL AND signoff_ref IS NOT NULL AND validation_report IS NOT NULL)
  ) NOT VALID;

-- ---------- quran_reference_snapshots: every snapshot version served to a madrasa (ADR-018 §3.4) ----------
-- The manifest says which imports and source files a version contained, so a later licence withdrawal can mark the
-- versions that carried the withdrawn data as revoked (DEC-B79), and devices holding one delete it on their next
-- successful online connection. Rows are history: never deleted, and a revocation is never undone.
CREATE TABLE quran_reference_snapshots (
  organization_id          uuid NOT NULL REFERENCES organizations (id),
  reference_version        text NOT NULL CHECK (reference_version ~ '^[0-9a-f]{64}$'),
  snapshot_format_version  smallint NOT NULL CHECK (snapshot_format_version >= 1),
  bytes                    integer NOT NULL CHECK (bytes > 0),
  layout_import_id         uuid,
  import_ids               uuid[] NOT NULL,
  source_ids               uuid[] NOT NULL,
  built_at                 timestamptz NOT NULL,
  revoked_at               timestamptz,
  revoked_reason           text CHECK (revoked_reason IS NULL OR revoked_reason IN ('LICENCE_WITHDRAWN')),
  revoked_by_licence_id    uuid REFERENCES quran_source_licences (id),
  PRIMARY KEY (organization_id, reference_version),
  FOREIGN KEY (organization_id, layout_import_id) REFERENCES quran_imports (organization_id, id),
  CHECK ((revoked_at IS NULL) = (revoked_reason IS NULL))
);
CREATE INDEX quran_reference_snapshots_sources_idx ON quran_reference_snapshots USING gin (source_ids);

-- A manifest row is immutable except for being revoked once.
CREATE FUNCTION quran_reference_snapshots_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'quran_reference_snapshots: a revoked version stays revoked';
  END IF;
  IF (NEW.organization_id, NEW.reference_version, NEW.snapshot_format_version, NEW.bytes, NEW.layout_import_id,
      NEW.import_ids, NEW.source_ids, NEW.built_at)
     IS DISTINCT FROM
     (OLD.organization_id, OLD.reference_version, OLD.snapshot_format_version, OLD.bytes, OLD.layout_import_id,
      OLD.import_ids, OLD.source_ids, OLD.built_at) THEN
    RAISE EXCEPTION 'quran_reference_snapshots: only the revocation columns may change';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER quran_reference_snapshots_guard BEFORE UPDATE ON quran_reference_snapshots
  FOR EACH ROW EXECUTE FUNCTION quran_reference_snapshots_guard();
CREATE TRIGGER quran_reference_snapshots_no_delete BEFORE DELETE ON quran_reference_snapshots
  FOR EACH ROW EXECUTE FUNCTION roster_no_delete();

-- ---------- Row-level security (ADR-016) ----------
ALTER TABLE quran_reference_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE quran_reference_snapshots FORCE ROW LEVEL SECURITY;
CREATE POLICY quran_reference_snapshots_tenant ON quran_reference_snapshots
  USING (organization_id = app_current_org_id()) WITH CHECK (organization_id = app_current_org_id());

-- Least privilege: the tenant role records versions and marks them revoked; it never deletes.
GRANT SELECT, INSERT ON quran_reference_snapshots TO hifz_tenant;
GRANT UPDATE (revoked_at, revoked_reason, revoked_by_licence_id) ON quran_reference_snapshots TO hifz_tenant;

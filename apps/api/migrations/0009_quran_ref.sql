-- 0009 · Quran reference data: Mushaf editions, Surahs, Para boundaries, page/line layouts, and their import
-- provenance (F06; US-024…026). FR-SAB-005…008, FR-I18N-006, BR-15; DEC-B31, DEC-B32, DEC-B70 (16-line Indo-Pak).
--
-- NO QURAN DATA IS INSERTED HERE. The production seed (Surahs, Ayat counts, Para boundaries, page/line layout) comes
-- only from an approved, licence-checked, reviewed dataset loaded by the seed loader (modules/quran-ref/seed.ts).
-- Until one is approved (DEFERRED: DEC-B31) every madrasa's tables are empty and the app shows the empty state.
--
-- Arabic names are stored exactly as supplied (no trim, no normalization; F06-AC3). History is kept: nothing here
-- has a delete path. Admin edits are audited; a newer layout is a new import beside the old one, never an overwrite.

-- ---------- mushaf_editions: the catalogue of supported editions (global, not tenant data) ----------
-- A future edition is a new row, not a schema change. `verification` stays UNVERIFIED until the exact publisher and
-- its layout source are approved; publisher and page_count are NULL until then (DEFERRED: DEC-B70 publisher).
CREATE TABLE mushaf_editions (
  code           text PRIMARY KEY CHECK (code ~ '^[A-Z0-9_]{3,40}$'),
  name           text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  lines_per_page smallint NOT NULL CHECK (lines_per_page BETWEEN 1 AND 30),
  publisher      text CHECK (publisher IS NULL OR length(btrim(publisher)) BETWEEN 1 AND 100),
  page_count     integer CHECK (page_count IS NULL OR page_count BETWEEN 1 AND 2000),
  verification   text NOT NULL DEFAULT 'UNVERIFIED' CHECK (verification IN ('UNVERIFIED', 'VERIFIED')),
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- The product owner's decision of 2026-11-09 (DEC-B70): the target is the 16-line Indo-Pak (South Asian) Mushaf.
-- This row is configuration, not Quran data: it says how many lines a page has, nothing about where lines break.
INSERT INTO mushaf_editions (code, name, lines_per_page) VALUES ('INDOPAK_16_LINE', '16-line Indo-Pak Mushaf', 16);

-- Each madrasa counts lines on one edition (configurable per madrasa; one edition exists in the MVP).
ALTER TABLE organizations ADD COLUMN mushaf_edition text NOT NULL DEFAULT 'INDOPAK_16_LINE' REFERENCES mushaf_editions (code);

-- ---------- quran_imports: provenance of every dataset applied to a madrasa (FR-SAB-007) ----------
-- One row per (madrasa, kind, dataset, version[, edition]); re-applying the same version is a no-op (repeatable).
-- `synthetic` marks test fixtures; the loader refuses synthetic data outside NODE_ENV=test, and a synthetic import
-- can never be mistaken for the production seed.
CREATE TABLE quran_imports (
  id              uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations (id),
  kind            text NOT NULL CHECK (kind IN ('METADATA', 'LAYOUT')),
  edition         text REFERENCES mushaf_editions (code),
  dataset_key     text NOT NULL CHECK (dataset_key ~ '^[a-z0-9][a-z0-9._-]{1,79}$'),
  dataset_version text NOT NULL CHECK (length(btrim(dataset_version)) BETWEEN 1 AND 40),
  source_name     text NOT NULL CHECK (length(btrim(source_name)) BETWEEN 1 AND 200),
  source_url      text CHECK (source_url IS NULL OR length(source_url) <= 500),
  licence         text NOT NULL CHECK (length(btrim(licence)) BETWEEN 1 AND 200),
  reviewed_by     text CHECK (reviewed_by IS NULL OR length(btrim(reviewed_by)) BETWEEN 1 AND 200),
  approved_on     date,
  synthetic       boolean NOT NULL,
  checksum        text NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
  counts          jsonb NOT NULL,
  applied_at      timestamptz NOT NULL,
  applied_by      uuid REFERENCES users (id),
  UNIQUE (organization_id, id),
  CHECK ((kind = 'LAYOUT') = (edition IS NOT NULL)),
  -- A production dataset names its reviewer and approval date (FR-SAB-007, DEC-B31).
  CHECK (synthetic OR (reviewed_by IS NOT NULL AND approved_on IS NOT NULL))
);
CREATE UNIQUE INDEX quran_imports_once
  ON quran_imports (organization_id, kind, COALESCE(edition, ''), dataset_key, dataset_version);

-- ---------- quran_surahs (FR-SAB-005, F06-AC1, AC3) ----------
-- source SEED = as the import supplied it; ADMIN = edited by an Owner/Admin since (a newer seed never overwrites it).
CREATE TABLE quran_surahs (
  id              uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations (id),
  number          smallint NOT NULL CHECK (number BETWEEN 1 AND 114),
  name_ar         text NOT NULL CHECK (length(btrim(name_ar)) BETWEEN 1 AND 100),
  name_translit   text NOT NULL CHECK (length(btrim(name_translit)) BETWEEN 1 AND 100),
  ayah_count      smallint NOT NULL CHECK (ayah_count BETWEEN 1 AND 999),
  source          text NOT NULL CHECK (source IN ('SEED', 'ADMIN')),
  import_id       uuid,
  updated_at      timestamptz NOT NULL,
  updated_by      uuid REFERENCES users (id),
  row_version     bigint NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  UNIQUE (organization_id, number),
  FOREIGN KEY (organization_id, import_id) REFERENCES quran_imports (organization_id, id),
  CHECK (source = 'ADMIN' OR import_id IS NOT NULL)
);

-- ---------- quran_paras: Para (Juz) boundaries (F06-AC1, AC4) ----------
CREATE TABLE quran_paras (
  id              uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations (id),
  number          smallint NOT NULL CHECK (number BETWEEN 1 AND 30),
  start_surah     smallint NOT NULL CHECK (start_surah BETWEEN 1 AND 114),
  start_ayah      smallint NOT NULL CHECK (start_ayah >= 1),
  end_surah       smallint NOT NULL CHECK (end_surah BETWEEN 1 AND 114),
  end_ayah        smallint NOT NULL CHECK (end_ayah >= 1),
  source          text NOT NULL CHECK (source IN ('SEED', 'ADMIN')),
  import_id       uuid,
  updated_at      timestamptz NOT NULL,
  updated_by      uuid REFERENCES users (id),
  row_version     bigint NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  UNIQUE (organization_id, number),
  FOREIGN KEY (organization_id, import_id) REFERENCES quran_imports (organization_id, id),
  CHECK (source = 'ADMIN' OR import_id IS NOT NULL),
  -- The end never comes before the start (F06-AC4); Ayat-count checks need the Surah rows and run in the service.
  CHECK ((end_surah, end_ayah) >= (start_surah, start_ayah))
);

-- ---------- mushaf_layouts / mushaf_layout_lines: verified page/line mappings (FR-SAB-006, FR-SAB-008) ----------
-- Only an approved LAYOUT import writes lines; there is no Admin line editor and no derived or guessed line. A line
-- row says which Ayat of one Surah stand on that line (Surah-name and Bismillah lines have no row). The active
-- layout per edition is `mushaf_layouts.import_id`; older imports keep their lines for history.
CREATE TABLE mushaf_layouts (
  organization_id uuid NOT NULL REFERENCES organizations (id),
  edition         text NOT NULL REFERENCES mushaf_editions (code),
  import_id       uuid NOT NULL,
  activated_at    timestamptz NOT NULL,
  PRIMARY KEY (organization_id, edition),
  FOREIGN KEY (organization_id, import_id) REFERENCES quran_imports (organization_id, id)
);

CREATE TABLE mushaf_layout_lines (
  organization_id uuid NOT NULL,
  import_id       uuid NOT NULL,
  page            smallint NOT NULL CHECK (page >= 1),
  line            smallint NOT NULL CHECK (line BETWEEN 1 AND 30),
  surah           smallint NOT NULL CHECK (surah BETWEEN 1 AND 114),
  ayah_start      smallint NOT NULL CHECK (ayah_start >= 1),
  ayah_end        smallint NOT NULL,
  PRIMARY KEY (organization_id, import_id, page, line),
  FOREIGN KEY (organization_id, import_id) REFERENCES quran_imports (organization_id, id),
  CHECK (ayah_end >= ayah_start)
);
CREATE INDEX mushaf_layout_lines_surah_idx ON mushaf_layout_lines (organization_id, import_id, surah, ayah_start);

-- ---------- No delete path ----------
CREATE TRIGGER quran_imports_no_delete BEFORE DELETE ON quran_imports FOR EACH ROW EXECUTE FUNCTION roster_no_delete();
CREATE TRIGGER quran_surahs_no_delete BEFORE DELETE ON quran_surahs FOR EACH ROW EXECUTE FUNCTION roster_no_delete();
CREATE TRIGGER quran_paras_no_delete BEFORE DELETE ON quran_paras FOR EACH ROW EXECUTE FUNCTION roster_no_delete();
CREATE TRIGGER mushaf_layouts_no_delete BEFORE DELETE ON mushaf_layouts FOR EACH ROW EXECUTE FUNCTION roster_no_delete();
CREATE TRIGGER mushaf_layout_lines_no_delete BEFORE DELETE ON mushaf_layout_lines FOR EACH ROW EXECUTE FUNCTION roster_no_delete();

-- ---------- Row-level security (ADR-016) ----------
ALTER TABLE quran_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE quran_imports FORCE ROW LEVEL SECURITY;
CREATE POLICY quran_imports_tenant ON quran_imports
  USING (organization_id = app_current_org_id()) WITH CHECK (organization_id = app_current_org_id());

ALTER TABLE quran_surahs ENABLE ROW LEVEL SECURITY;
ALTER TABLE quran_surahs FORCE ROW LEVEL SECURITY;
CREATE POLICY quran_surahs_tenant ON quran_surahs
  USING (organization_id = app_current_org_id()) WITH CHECK (organization_id = app_current_org_id());

ALTER TABLE quran_paras ENABLE ROW LEVEL SECURITY;
ALTER TABLE quran_paras FORCE ROW LEVEL SECURITY;
CREATE POLICY quran_paras_tenant ON quran_paras
  USING (organization_id = app_current_org_id()) WITH CHECK (organization_id = app_current_org_id());

ALTER TABLE mushaf_layouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE mushaf_layouts FORCE ROW LEVEL SECURITY;
CREATE POLICY mushaf_layouts_tenant ON mushaf_layouts
  USING (organization_id = app_current_org_id()) WITH CHECK (organization_id = app_current_org_id());

ALTER TABLE mushaf_layout_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE mushaf_layout_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY mushaf_layout_lines_tenant ON mushaf_layout_lines
  USING (organization_id = app_current_org_id()) WITH CHECK (organization_id = app_current_org_id());

-- Least privilege: no DELETE anywhere; imports and layout lines are insert-only.
GRANT SELECT ON mushaf_editions TO hifz_tenant;
GRANT SELECT, INSERT ON quran_imports TO hifz_tenant;
GRANT SELECT, INSERT ON mushaf_layout_lines TO hifz_tenant;
GRANT SELECT, INSERT ON quran_surahs TO hifz_tenant;
GRANT UPDATE (name_ar, name_translit, ayah_count, source, import_id, updated_at, updated_by, row_version) ON quran_surahs TO hifz_tenant;
GRANT SELECT, INSERT ON quran_paras TO hifz_tenant;
GRANT UPDATE (start_surah, start_ayah, end_surah, end_ayah, source, import_id, updated_at, updated_by, row_version) ON quran_paras TO hifz_tenant;
GRANT SELECT, INSERT ON mushaf_layouts TO hifz_tenant;
GRANT UPDATE (import_id, activated_at) ON mushaf_layouts TO hifz_tenant;
GRANT SELECT (mushaf_edition) ON organizations TO hifz_tenant;

-- 0010 · Quran reference data v2: source catalogue with licence history, import-source links, seed format v2 with a
-- signed validation report, Taj edition profile columns, and typed page/line rows (F06; ADR-017 accepted as DEC-B72;
-- FR-SAB-011…013; DEC-B71 Taj Company target publisher).
--
-- NO QURAN DATA IS INSERTED HERE, and no source, licence, or verification is recorded. 0009 is NOT edited: the
-- migration runner tracks file names only, so an edited 0009 would be skipped wherever it already ran.
-- Every change is additive or relaxing, so existing rows (synthetic test data only) stay valid.

-- ---------- mushaf_editions: Taj edition profile (DEC-B71) ----------
-- printing_id is filled only after the exact printing is identified on a physical Mushaf (verification kit Part A);
-- page_count stays NULL until it is verified. page_count_source says where a candidate value came from.
ALTER TABLE mushaf_editions
  ADD COLUMN printing_id text CHECK (printing_id IS NULL OR length(btrim(printing_id)) BETWEEN 1 AND 200),
  ADD COLUMN printing_notes text CHECK (printing_notes IS NULL OR length(printing_notes) <= 2000),
  ADD COLUMN page_count_source text CHECK (page_count_source IS NULL OR length(btrim(page_count_source)) BETWEEN 1 AND 100);

-- ---------- quran_sources: one row per downloaded source file (global, not tenant data; FR-SAB-011) ----------
-- Immutable facts about a file. Its licence status lives in quran_source_licences (append-only history), so a change
-- of status never overwrites what was recorded before. Rows are written only by the privileged maintainer step
-- (`npm run quran:source`), never by the tenant role.
CREATE TABLE quran_sources (
  id              uuid PRIMARY KEY,
  provider        text NOT NULL CHECK (provider ~ '^[A-Z0-9_]{2,40}$'),
  resource_name   text NOT NULL CHECK (length(btrim(resource_name)) BETWEEN 1 AND 300),
  resource_id     text CHECK (resource_id IS NULL OR length(btrim(resource_id)) BETWEEN 1 AND 100),
  category        text NOT NULL CHECK (category IN ('SURAHS', 'AYAHS', 'JUZ', 'RUKU', 'HIZB', 'RUB_AL_HIZB', 'MANZIL7', 'LAYOUT', 'WORDS')),
  source_url      text NOT NULL CHECK (length(source_url) BETWEEN 1 AND 500),
  download_url    text CHECK (download_url IS NULL OR length(download_url) <= 500),
  downloaded_on   date NOT NULL,
  file_name       text NOT NULL CHECK (length(btrim(file_name)) BETWEEN 1 AND 300),
  file_sha256     text NOT NULL CHECK (file_sha256 ~ '^[0-9a-f]{64}$'),
  source_version  text CHECK (source_version IS NULL OR length(btrim(source_version)) BETWEEN 1 AND 100),
  notes           text CHECK (notes IS NULL OR length(notes) <= 2000),
  -- Test fixtures only; a synthetic source never clears a production import.
  synthetic       boolean NOT NULL,
  registered_at   timestamptz NOT NULL,
  registered_by   text NOT NULL CHECK (length(btrim(registered_by)) BETWEEN 1 AND 200),
  UNIQUE (provider, resource_id, file_sha256)
);
CREATE INDEX quran_sources_category_idx ON quran_sources (category);

-- Licence status history. The current status of a source is its latest row. LICENSE_REVIEW_REQUIRED is the starting
-- state; only OPEN_LICENCE_VERIFIED and PERMISSION_GRANTED clear a source for import.
CREATE TABLE quran_source_licences (
  id                       uuid PRIMARY KEY,
  source_id                uuid NOT NULL REFERENCES quran_sources (id),
  status                   text NOT NULL CHECK (status IN ('LICENSE_REVIEW_REQUIRED', 'OPEN_LICENCE_VERIFIED', 'PERMISSION_GRANTED', 'REFUSED')),
  licence_name             text CHECK (licence_name IS NULL OR length(btrim(licence_name)) BETWEEN 1 AND 200),
  -- The written permission (or licence text) held by the product owner.
  permission_ref           text CHECK (permission_ref IS NULL OR length(btrim(permission_ref)) BETWEEN 1 AND 300),
  -- For a printed-edition layout: the publisher's permission, or legal advice that none is needed (FR-SAB-011;
  -- for the Taj layout, Taj Company's position). Owning a printed Mushaf grants no digital right.
  publisher_clearance_ref  text CHECK (publisher_clearance_ref IS NULL OR length(btrim(publisher_clearance_ref)) BETWEEN 1 AND 300),
  attribution_text         text CHECK (attribution_text IS NULL OR length(attribution_text) <= 1000),
  recorded_at              timestamptz NOT NULL,
  recorded_by              text NOT NULL CHECK (length(btrim(recorded_by)) BETWEEN 1 AND 200),
  -- A cleared status must point at its evidence.
  CHECK (status NOT IN ('OPEN_LICENCE_VERIFIED', 'PERMISSION_GRANTED') OR permission_ref IS NOT NULL)
);
CREATE INDEX quran_source_licences_source_idx ON quran_source_licences (source_id, recorded_at DESC, id DESC);

-- ---------- quran_imports: seed format version and the signed validation report (FR-SAB-013) ----------
ALTER TABLE quran_imports
  ADD COLUMN seed_format_version smallint NOT NULL DEFAULT 1 CHECK (seed_format_version IN (1, 2)),
  ADD COLUMN review_decision text CHECK (review_decision IS NULL OR review_decision IN ('APPROVED', 'APPROVED_WITH_FINDINGS')),
  ADD COLUMN validation_report_sha256 text CHECK (validation_report_sha256 IS NULL OR validation_report_sha256 ~ '^[0-9a-f]{64}$'),
  -- A production import is format 2 with an approved, signed validation report (DEC-B72). Existing rows are all
  -- synthetic test data, so they satisfy this.
  ADD CONSTRAINT quran_imports_production_signed CHECK (
    synthetic OR (seed_format_version = 2 AND review_decision IS NOT NULL AND validation_report_sha256 IS NOT NULL)
  );

-- ---------- quran_import_sources: which source files an import was built from (tenant data, RLS) ----------
CREATE TABLE quran_import_sources (
  organization_id uuid NOT NULL REFERENCES organizations (id),
  import_id       uuid NOT NULL,
  source_id       uuid NOT NULL REFERENCES quran_sources (id),
  role            text NOT NULL CHECK (role IN ('METADATA', 'LAYOUT', 'WORDS')),
  PRIMARY KEY (organization_id, import_id, source_id),
  FOREIGN KEY (organization_id, import_id) REFERENCES quran_imports (organization_id, id)
);

-- ---------- quran_surahs: optional display fields from the source (never used in validation) ----------
ALTER TABLE quran_surahs
  ADD COLUMN revelation_place text CHECK (revelation_place IS NULL OR revelation_place IN ('MAKKI', 'MADANI')),
  ADD COLUMN revelation_order smallint CHECK (revelation_order IS NULL OR revelation_order BETWEEN 1 AND 114),
  ADD COLUMN bismillah_pre boolean;

-- ---------- mushaf_layout_lines: every printed line, typed (FR-SAB-012) ----------
-- Surah-heading and Bismillah lines get a row with no Ayat. Word positions say where the line starts and ends inside
-- its first and last Ayat; the source word IDs are kept for audit and re-conversion only. No Quran text is stored.
-- Existing rows (v1 imports) are Ayat lines, so the default keeps them valid; their word positions stay NULL (unknown).
ALTER TABLE mushaf_layout_lines
  ALTER COLUMN ayah_start DROP NOT NULL,
  ALTER COLUMN ayah_end DROP NOT NULL,
  ADD COLUMN line_type text NOT NULL DEFAULT 'AYAH' CHECK (line_type IN ('AYAH', 'SURAH_NAME', 'BASMALLAH')),
  ADD COLUMN is_centered boolean,
  ADD COLUMN word_start smallint CHECK (word_start IS NULL OR word_start >= 1),
  ADD COLUMN word_end smallint CHECK (word_end IS NULL OR word_end >= 1),
  ADD COLUMN src_first_word_id integer CHECK (src_first_word_id IS NULL OR src_first_word_id >= 0),
  ADD COLUMN src_last_word_id integer CHECK (src_last_word_id IS NULL OR src_last_word_id >= 0),
  ADD CONSTRAINT mushaf_layout_lines_ayah_iff_type CHECK ((line_type = 'AYAH') = (ayah_start IS NOT NULL AND ayah_end IS NOT NULL)),
  ADD CONSTRAINT mushaf_layout_lines_words_only_on_ayah CHECK (
    line_type = 'AYAH' OR (word_start IS NULL AND word_end IS NULL AND src_first_word_id IS NULL AND src_last_word_id IS NULL)
  );
CREATE INDEX mushaf_layout_lines_type_idx ON mushaf_layout_lines (organization_id, import_id, line_type);

-- ---------- No delete path ----------
CREATE TRIGGER quran_sources_no_delete BEFORE DELETE ON quran_sources FOR EACH ROW EXECUTE FUNCTION roster_no_delete();
CREATE TRIGGER quran_source_licences_no_delete BEFORE DELETE ON quran_source_licences FOR EACH ROW EXECUTE FUNCTION roster_no_delete();
CREATE TRIGGER quran_import_sources_no_delete BEFORE DELETE ON quran_import_sources FOR EACH ROW EXECUTE FUNCTION roster_no_delete();

-- ---------- Row-level security (ADR-016) ----------
ALTER TABLE quran_import_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE quran_import_sources FORCE ROW LEVEL SECURITY;
CREATE POLICY quran_import_sources_tenant ON quran_import_sources
  USING (organization_id = app_current_org_id()) WITH CHECK (organization_id = app_current_org_id());

-- Least privilege: the tenant role reads the global source catalogue and licence history but never writes them.
GRANT SELECT ON quran_sources TO hifz_tenant;
GRANT SELECT ON quran_source_licences TO hifz_tenant;
GRANT SELECT, INSERT ON quran_import_sources TO hifz_tenant;
GRANT UPDATE (revelation_place, revelation_order, bismillah_pre) ON quran_surahs TO hifz_tenant;

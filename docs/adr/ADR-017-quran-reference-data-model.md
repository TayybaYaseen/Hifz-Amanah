# ADR-017 · Quran reference data: model, 16-line layout, offline distribution, import and validation

**Status:** **Accepted 2026-11-09 (SRS §17 DEC-B72).** §8 (offline delivery) waits on OD-QR-7; §3.5 (divisions) is a later
phase (DEC-B71); FR-SAB-015 is not in the MVP (DEC-B74). Acceptance approves **no dataset, licence, or physical
verification**. Implementation starts with the backend (migration 0010, seed format v2, licence gate, sign-off check),
tested with synthetic data only.
**Feature:** F06 (US-024…027). **Requirements:** FR-SAB-001…009, FR-SAB-011…015 (proposed), FR-QTY-001…010,
FR-I18N-006, NFR-MNT-003, BR-15. **Decisions:** DEC-B31, DEC-B32, DEC-B64, DEC-B70, **DEC-B71** (Taj Company is the
primary target publisher; 2026-11-09).
**Revised 2026-11-09:** the target edition is now the Taj Company profile (§3.6). Divisions moved to a later phase
(§3.5). MVP priorities (§2) and the planned acceptance criteria (§13) were added. It is still Proposed.
**Builds on:** migration `0009_quran_ref.sql` (built, uncommitted on `feature/f06-quran-portions-metadata`), ADR-005,
ADR-014, ADR-015, ADR-016. **Research:** [F06-quran-dataset-candidates.md](../handover/F06-quran-dataset-candidates.md).

## 1. Context

Teachers pick Quran references for Sabaq, Sabqi, and Manzil, offline, on Android. Migration 0009 already provides the
core model: an edition catalogue (`mushaf_editions`), import provenance (`quran_imports`), per-madrasa `quran_surahs` and
`quran_paras`, and versioned page/line layouts (`mushaf_layouts`, `mushaf_layout_lines`). A versioned seed loader
(`hifz-quran-seed` v1) refuses incomplete, unreviewed, or synthetic production data.

Three gaps remain:
1. The only file-based 16-line Indo-Pak layout found (QUL resource 11) is **word-based**: each line names its first and
   last word ID, and Surah-heading and Bismillah lines are separate rows. 0009 stores only Ayat lines, with no word
   positions, line types, or alignment.
2. Provenance does not record the raw source file (resource ID, download URL and date, file name, SHA-256), the licence
   **status**, or the permission reference.
3. The app reads reference data online only. Teachers need it offline (NFR-OFF, AGENTS §7).

## 2. Decision (proposed)

1. **Keep 0009's model and extend it.** Do not create parallel tables for things 0009 already holds:
   `quran_paras` *is* the Juz table, and `mushaf_editions` *is* the edition table.
2. **Reference data stays per madrasa**, copied from one reviewed seed (DEC-B31, FR-SAB-005: the Admin edits Surahs and
   Para boundaries, with audit). Only the source catalogue and the edition catalogue are global.
3. **Store the Mushaf layout at line level, not word level.** A line row carries its type, alignment, Surah, first and
   last Ayat, and the word position inside those Ayat. Word IDs are converted **offline, once**, by a converter that
   stops on any unmapped ID. HifzAmanah stores no Quran text and no word table.
4. **Teachers get reference data offline** as a versioned, checksummed **snapshot** from HifzAmanah's own API, cached in
   SQLite after the first sign-in. QUL or any other provider is never contacted at runtime.
5. **Every import is traceable** to its raw source files, licence status, written permission, reviewer, and a signed
   validation report. A source whose licence status is not cleared cannot be loaded in production.

**F06 MVP priority order (DEC-B71):**
1. Surah metadata.
2. Ayat metadata and validation: the Ayat count per Surah, checked at import against the source's full Ayat list.
3. Para/Juz metadata.
4. The Taj edition profile.
5. The verified Taj page/line layout mapping.
6. The offline reference-data snapshot and versioning.

Ruku, Hizb, quarter-Hizb, and seven-Manzil divisions are later-phase candidates.

## 3. Data model

Postgres types shown; the device mirrors are in §8.2. Every per-madrasa table keeps 0009's conventions: an
`organization_id` filter with RLS (ADR-016), no DELETE (`roster_no_delete`), and `row_version` where Admin-editable.
**(0009)** = exists. **(+)** = proposed new column or table.

### 3.1 `quran_sources` (+), global: one row per downloaded source file

Purpose: the provenance of each raw file, before it becomes any madrasa's data. It is not tenant data, like `mushaf_editions`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `provider` | text | e.g. `QUL`, `TANZIL` |
| `resource_name` | text | as published, e.g. "Indopak 16 lines layout(Taj company)" |
| `resource_id` | text NULL | provider's ID, e.g. `11`, `70` |
| `category` | text | `SURAHS`, `JUZ`, `RUKU`, `HIZB`, `RUB_AL_HIZB`, `MANZIL7`, `LAYOUT`, `WORDS` |
| `source_url` | text | resource page |
| `download_url` | text NULL | exact file URL used |
| `downloaded_on` | date | |
| `file_name` | text | |
| `file_sha256` | char(64) | of the raw downloaded file, before any conversion |
| `source_version` | text NULL | provider's version or changelog date, if any |
| `licence_name` | text NULL | exact licence, e.g. "CC BY 3.0", or NULL when none is stated |
| `licence_status` | text | `LICENSE_REVIEW_REQUIRED` (default) \| `OPEN_LICENCE_VERIFIED` \| `PERMISSION_GRANTED` \| `REFUSED` |
| `permission_ref` | text NULL | reference to the written permission held by the product owner |
| `attribution_text` | text NULL | the wording the licence or permission requires |
| `notes` | text NULL | |

Unique: `(provider, resource_id, file_sha256)`. Index: `(category)`. The seed loader refuses a non-synthetic import that
uses any source not in `OPEN_LICENCE_VERIFIED` or `PERMISSION_GRANTED`.

*Readiness review 2026-11-09 (R3):* `hifz_tenant` gets SELECT only. The seed loader runs inside a tenant transaction, so
it cannot write this global table. Sources are registered by a separate, privileged maintainer step (a migration or
admin CLI) **before** any seed that cites them. The loader only checks that they exist and that their status is cleared.

### 3.2 `quran_imports` (0009) + `quran_import_sources` (+)

0009 already records `kind`, `edition`, `dataset_key`, `dataset_version`, `source_name`, `source_url`, `licence`,
`reviewed_by`, `approved_on`, `synthetic`, `checksum` (of the normalized seed content), `counts`, `applied_at` and `applied_by`. Proposed additions:

| Column / table | Type | Notes |
|---|---|---|
| `quran_imports.seed_format_version` (+) | smallint | `2` for the format in §6.1 |
| `quran_imports.validation_report_sha256` (+) | char(64) | the signed report (§7) that approved this dataset version |
| `quran_imports.approval_status` (+) | text | `APPROVED` for production (the existing CHECK already demands reviewer and date) |
| `quran_import_sources(organization_id, import_id, source_id, role)` (+) | uuid, uuid, uuid, text | one import may combine sources, e.g. Surahs from Tanzil and the layout from QUL. PK `(organization_id, import_id, source_id)`; FK `(organization_id, import_id)` → `quran_imports`; FK `source_id` → `quran_sources`; RLS tenant policy and no-delete trigger, as in ADR-016 (*corrected 2026-11-09, R2*) |

`kind` gains `DIVISIONS` if OD-QR-5 brings Ruku or other divisions into scope.

### 3.3 `quran_surahs` (0009) + optional display fields (+)

Existing: `number` 1–114 (unique per madrasa), `name_ar` (byte-exact, BR-15), `name_translit`, `ayah_count`, `source`
(`SEED`/`ADMIN`), `import_id`, `row_version`. Proposed (all nullable, display only; never used in validation):
`revelation_place` text (`MAKKI`/`MADANI`), `revelation_order` smallint 1–114, `bismillah_pre` boolean.

`name_translit` is the source's own Latin name (e.g. QUL `name_simple`). HifzAmanah never transliterates. Localized
labels for UI chrome go through i18n; Surah names are not translated.

### 3.4 `quran_paras` (0009): the Juz table

Existing: `number` 1–30, `start_surah/ayah`, `end_surah/ayah`, contiguity checked by the review list (`PARA_GAP`,
`PARA_OVERLAP`). No change. The source's `verse_mapping` is used only to cross-check boundaries at import.

### 3.5 `quran_divisions` (+): later phase, not in the F06 MVP

DEC-B71 (2026-11-09) makes Ruku, Hizb, quarter-Hizb (Rub al-Hizb), and seven-Manzil divisions **later-phase
candidates**, unless an approved source and a clear MVP need are established. No migration is planned for F06. The
shape below is kept so that a later phase needs no redesign. One table holds the range-type divisions, instead of four
near-identical tables:

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid | RLS |
| `import_id` | uuid | FK `(organization_id, import_id)` |
| `kind` | text | `RUKU` \| `HIZB` \| `RUB_AL_HIZB` \| `MANZIL7` |
| `number` | smallint | across the Quran (Ruku 1…N, Hizb 1–60, Rub 1–240, Manzil 1–7) |
| `surah_local_number` | smallint NULL | Ruku number within its Surah |
| `start_surah`, `start_ayah`, `end_surah`, `end_ayah` | smallint | CHECK end ≥ start |

Unique `(organization_id, import_id, kind, number)`. Index `(organization_id, import_id, kind, start_surah, start_ayah)`.
Import-only (no Admin editor in MVP); a correction is a new import. `MANZIL7` is labelled "Manzil (7-part division)" in
the UI so it is never confused with the **Manzil** Hifz section.

### 3.6 `mushaf_editions` (0009)

Existing: `code` PK (`INDOPAK_16_LINE`), `name`, `lines_per_page` (16), `publisher` NULL, `page_count` NULL,
`verification` (`UNVERIFIED`/`VERIFIED`).

**Taj edition profile (DEC-B71):** the primary target is the Taj Company edition. Candidate profile: Indo-Pak, 16 lines
per page, 548 pages (from QUL resource 11, **unverified**). Proposed columns:
- `printing_id` text NULL: the exact Taj printing identifier from the imprint (OD-QR-1);
- `printing_notes` text NULL: imprint details photographed by the reviewer;
- `page_count_source` text NULL: e.g. `CANDIDATE_QUL_11` until verified.

Rules:
- `publisher` = "Taj Company" may be recorded as the decided publisher.
- `page_count` stays NULL until the physical-Mushaf check confirms it. 548 is never written as fact before that.
- `verification` becomes `VERIFIED` only after every Taj verification item (research doc §6) passes and the reviewer
  signs (§7).
- If the madaris use more than one Taj printing, each one is its own edition row with its own layout. Printings are
  never merged.

Recording the publisher is a later data change. **Migration 0009 and its seeded row are not changed by this ADR revision.**

### 3.7 `mushaf_layouts` (0009)

The active layout import per `(organization, edition)`. No change.

### 3.8 `mushaf_layout_lines` (0009, extended (+))

0009: PK `(organization_id, import_id, page, line)`; `surah`, `ayah_start`, `ayah_end` NOT NULL; Ayat lines only.
Proposed: store **every** printed line, so page navigation and headings work, and keep word positions for partial Ayat.

| Column | Type | Notes |
|---|---|---|
| `page` | smallint | 1…`page_count` |
| `line` | smallint | 1…`lines_per_page` |
| `line_type` (+) | text | `AYAH` \| `SURAH_NAME` \| `BASMALLAH` (source values `ayah`/`surah_name`/`basmallah`) |
| `is_centered` (+) | boolean NULL, no default | from the source; NULL on v1 imports (unknown, not `false`; R8) |
| `surah` | smallint | the Surah on the line (for headings, the Surah that starts) |
| `ayah_start`, `ayah_end` | smallint, **NULL for non-AYAH lines** (change from 0009) | first and last Ayat with any word on the line |
| `word_start` (+), `word_end` (+) | smallint NULL | the position, inside `ayah_start` and `ayah_end`, of the line's first and last word |
| `src_first_word_id` (+), `src_last_word_id` (+) | integer NULL | the source IDs, kept for audit and re-conversion only |

CHECK: `(line_type = 'AYAH') = (ayah_start IS NOT NULL AND ayah_end IS NOT NULL)`; `ayah_end >= ayah_start`.
*Corrected 2026-11-09 (R4):* the word columns stay nullable in SQL, because existing v1 (synthetic) imports have no word
positions. The loader requires them on every `AYAH` line of a format-2 seed and checks
`(ayah_end, word_end) >= (ayah_start, word_start)`. `line_type` is added with `DEFAULT 'AYAH'`, so existing rows stay
valid. The domain `countLines` must filter `line_type = 'AYAH'` once non-Ayat rows exist (R5).
**Migration:** these changes go in a new `0010_quran_ref_v2.sql`, never in an edited 0009. The migration runner records
file names only, so an edited 0009 would be silently skipped wherever it already ran (readiness review §8).
Index `(organization_id, import_id, surah, ayah_start)` (exists) plus `(organization_id, import_id, line_type)`.

**Line counting is unchanged:** `countLines(surah, a, b, edition)` counts the `AYAH` lines of the active layout where
`surah` matches and `ayah_start ≤ b AND ayah_end ≥ a`. `SURAH_NAME` and `BASMALLAH` lines are **not** counted, as 0009
does today. OD-QR-11 asks teachers to confirm this.

### 3.9 Considered and not stored

| Proposed entity | Decision | Why |
|---|---|---|
| `quran_juz` | Use `quran_paras` | Same thing (0009) |
| `quran_hizbs`, `quran_rub_el_hizbs`, `quran_rukus` | `quran_divisions` with `kind` (§3.5), optional | One shape; OD-QR-5 decides the scope |
| `quran_ayahs` (6,236 rows) | Not stored | Validation needs only `ayah_count`; Ayat → page/line comes from `mushaf_layout_lines`. Can be added later without redesign |
| `quran_words`, `quran_word_locations` (~77k rows) | Not stored; used only inside the offline converter | No Quran text is shown (F06 out of scope); avoids licensing and storing text; keeps the device cache small |
| `mushaf_pages` | A derived view (page → first/last Ayat, Para at the page start, line count) | Fully derivable from the lines; no second source of truth |

### 3.10 Relationships

```text
quran_sources ─< quran_import_sources >─ quran_imports ─< quran_surahs / quran_paras / quran_divisions
mushaf_editions ─< quran_imports(kind=LAYOUT) ─< mushaf_layout_lines
mushaf_editions ─< mushaf_layouts(active import per org+edition)
organizations.mushaf_edition → mushaf_editions.code
lesson/homework portions (F05/F08) → canonical (surah, ayah) + edition code + layout import_id for Total Lines
```

**Student records never reference reference-data rows by ID.** They store canonical values: Para number, Surah number,
Ayat numbers, quantities, and for Sabaq the edition and the layout import the line count came from. So a reference-data
update can never cascade into a record (DEC-B32, FR-SAB-008).

## 4. Mushaf edition → page → line → word range → Ayat

```text
mushaf_editions(INDOPAK_16_LINE)
  └ layout import (dataset_key, dataset_version)
      └ page 1…548*            (*548 per QUL resource 11, unverified until OD-QR-1)
          └ line 1…16
              ├ SURAH_NAME  surah=s                      (no Ayat, not counted)
              ├ BASMALLAH   surah=s                      (no Ayat, not counted)
              └ AYAH        first word w1 … last word w2
                              w1 → (s, a1, p1), w2 → (s, a2, p2) via the paired word table's word_key "s:a:p"
                              stored: surah=s, ayah_start=a1, word_start=p1, ayah_end=a2, word_end=p2
```

**Converter (offline tool, run once per approved dataset version; not app code, not run yet):**
1. Load the layout `pages` table and the paired word-by-word script's `words` table (`word_index`, `word_key`, `surah`,
   `ayah`). Text is read **only** to be discarded; it is never written out.
2. Check that the pairing is right (blocker B-1): every `first_word_id`/`last_word_id` on an `ayah` line exists as a
   `word_index`. **Any unmapped ID stops the conversion** and is listed in the report.
3. For each `ayah` line, resolve both ends to `(surah, ayah, position)`. Both ends must be in the same Surah, otherwise
   stop. 0009 has one Surah per line, so a line spanning two Surahs must be reported, never split by guesswork.
4. Check coverage: walking the lines in page/line order, the word IDs are contiguous, with no gap or overlap, and run
   from the first word of the first Ayat to the last word of the last Ayat, as the source numbers them. Every `(surah, ayah)` of the metadata appears.
5. Copy `line_type`, `is_centered`, and `surah_number` as given. Emit the `hifz-quran-seed` v2 file (§6.1). Record the
   raw files' SHA-256 values.

Nothing is inferred: no line is created, merged, moved, or "corrected". A problem in the source is a finding, not a fix.

## 5. Teaching workflow

### 5.1 Sabaq (FR-SAB-001…009, ADR-014, unchanged rules)

Stored: Surah, start Ayat, end Ayat (one Surah), Para (derived), Total/Assigned/Completed Lines, the edition, and the
line-count source. Proposed input aids (OD-QR-8): the Teacher may start from **Para → Surah → Ayat** (as today) or from
**page → start line → end line**. A page/line choice is resolved through `mushaf_layout_lines` into Surah + start/end
Ayat. That fails if the lines span two Surahs (FR-SAB-002: two portions) or are not `AYAH` lines. Optionally, the page
and line numbers are stored as an extra reference with their edition. Total Lines is pre-filled by `countLines`; the
Teacher confirms it.

### 5.2 Sabqi and Manzil (FR-SBQ-*, FR-MNZ-*, unchanged rules)

Each portion keeps its Para and its quantity (`PARA` presets, `LINES`, `AYAT`, or `PAGES`). Reference data supplies:
- the Sabqi default = the Para of the current Sabaq (FR-SBQ-003), via `paraFor(surah, ayah)` over `quran_paras`;
- multi-Para selection from the 30 `quran_paras` rows; each Para is its own portion (AGENTS §5.1);
- an optional Surah/Ayat range validated against `quran_surahs.ayah_count` (US-025). *Corrected 2026-11-09 (R1):*
  whether the range must also lie within the portion's Para is **not** an approved rule. It is open as OD-QR-12;
- optional page/line references for the madrasa's edition (OD-QR-8), stored as references only.

### 5.3 Quantity rules are unchanged

Rubu = 1/4, Half = 1/2, Salasah = 3/4, Complete = 1 Para remain **amounts** stored as `(unit, numerator, denominator)`.
They are never mapped to QUL's "Rub" (Rub al-Hizb, ⅛ Juz) or to any position. There is no conversion between lines,
pages, Ayat, and Para fractions (ADR-005). Whether "first quarter of Para 5" should be a **selectable position** needs
verified Para-quarter marks of the printed Indo-Pak Mushaf, and is open as OD-QR-10.

## 6. Import pipeline

```text
download (maintainer) → quran_sources rows + SHA-256 → licence gate → convert (offline tool, §4)
  → hifz-quran-seed v2 file → validate (§6.2) → validation report (§7) → human review + sign-off
  → set QURAN_SEED_FILE → seed loader applies it per madrasa (existing, transactional, idempotent)
```

### 6.1 Seed format v2 (proposed; v1 stays readable)

v1 (built): `format`, `formatVersion: 1`, `datasetKey`, `datasetVersion`, `provenance`, `metadata` (Surahs, Paras),
`layouts` (per edition: `{page, line, surah, ayahStart, ayahEnd}`). v2 adds:
- `sources[]`: each with the §3.1 fields;
- `validationReport` with `{ sha256, signedBy, signedOn }`;
- `layouts[].lines[]`: `{page, line, lineType, isCentered, surah, ayahStart?, wordStart?, ayahEnd?, wordEnd?, srcFirstWordId?, srcLastWordId?}`;
- optional `divisions[]`: `{kind, number, surahLocalNumber?, start:{surah,ayah}, end:{surah,ayah}}`.

### 6.2 Validation rules (any failure refuses the whole file; nothing is auto-corrected)

| # | Rule |
|---|---|
| V1 | Exactly 114 Surahs, numbered 1–114, no duplicates; each `ayah_count` ≥ 1; the sum of `ayah_count` equals the total Ayat of the source's own Ayat list |
| V2 | Arabic names non-empty and stored byte-for-byte; no normalization (BR-15) |
| V3 | Exactly 30 Paras, contiguous: Para 1 starts at 1:1, each start follows the previous end, Para 30 ends at 114's last Ayat; every boundary Ayat exists |
| V4 | Divisions (if present): numbering complete for the kind, contiguous, inside valid Ayat; Ruku count reported against the second source |
| V5 | Layout: every page 1…`page_count` present; line numbers 1…`lines_per_page` with no duplicate `(page, line)`; any page with fewer lines is listed for the reviewer, not rejected |
| V6 | Every `AYAH` line has both word ends mapped (§4 step 2) and its Surah valid; `(ayah_end, word_end) ≥ (ayah_start, word_start)` |
| V7 | Word coverage is contiguous and complete (§4 step 4); every `(surah, ayah)` appears on at least one line |
| V8 | Each Surah's first Ayat line comes after its `SURAH_NAME` line; `BASMALLAH` presence per Surah is reported against `bismillah_pre` (if present) |
| V9 | Page count and lines per page equal the edition record; a mismatch blocks `VERIFIED` |
| V10 | Cross-source: Ayat counts and Para boundaries compared with the second source; **every difference is listed** for the reviewer |
| V11 | Licence gate: every non-synthetic source is `OPEN_LICENCE_VERIFIED` or `PERMISSION_GRANTED` |
| V12 | Re-applying the same `(datasetKey, datasetVersion)` with different content is refused (existing) |

## 7. Validation report and sign-off

The validation tool writes `quran-validation-<datasetKey>-<datasetVersion>.json` (plus a readable Markdown copy). The
report is kept with the product owner's records, and its SHA-256 goes into the seed (§6.1).

```json
{
  "reportFormat": "hifz-quran-validation", "reportVersion": 1,
  "datasetKey": "<key>", "datasetVersion": "<version>", "generatedAt": "<ISO-8601>",
  "sources": [{ "provider": "<QUL|TANZIL>", "resourceId": "<id>", "fileName": "<name>", "fileSha256": "<64 hex>",
                "licenceStatus": "<status>", "permissionRef": "<ref or null>" }],
  "counts": { "surahs": 0, "ayahTotal": 0, "paras": 0, "pages": 0, "lines": { "AYAH": 0, "SURAH_NAME": 0, "BASMALLAH": 0 } },
  "checks": [{ "id": "V1", "result": "PASS|FAIL", "details": [] }],
  "crossSource": [{ "item": "<e.g. ruku count>", "sourceA": "<value>", "sourceB": "<value>", "status": "MATCH|MISMATCH" }],
  "pagesWithFewerLines": [],
  "reviewerSample": [{ "page": 0, "lines": [] }],
  "review": { "reviewer": null, "mushafPrinting": null, "decision": "PENDING|APPROVED|REJECTED", "signedOn": null, "findings": [] }
}
```

The values above are placeholders, not data. The human checklist is in the research doc, §6. `mushaf_editions.verification` becomes
`VERIFIED` and the seed may ship only when every V-check passes and `review.decision = APPROVED`.

## 8. Offline strategy

### 8.1 Server (PostgreSQL)

- `quran_sources` and `mushaf_editions` are global; the other tables are per madrasa, as in 0009.
- The approved seed is applied to each new madrasa inside its creation transaction (existing `QURAN_SEED_FILE`), and to
  existing madrasas by an explicit, audited, idempotent upgrade job. A newer metadata version updates only `SEED` rows
  and keeps Admin edits. A newer layout is a new import beside the old one (existing).
- The server computes `reference_version` = SHA-256 over the madrasa's active reference state (surah and para
  `row_version`s, the active layout `import_id`, the division imports).

### 8.2 Device (SQLite, Teacher/Admin only)

- New local tables, which are a **cache** and not part of the outbox: `ref_surahs`, `ref_paras`, `ref_layout_lines`
  (active layout only), `ref_divisions` (if in scope), and
  `ref_meta(reference_version, edition, layout_import_id, snapshot_sha256, fetched_at)`.
- **Initial setup:** right after the first online sign-in to a workspace, the app downloads
  `GET /quran/snapshot` (proposed route; one compressed JSON with its SHA-256). It verifies the checksum and replaces the
  cache in **one SQLite transaction**. Until that finishes, pickers show the existing empty state.
- **Refresh:** only when the server's `reference_version` differs from the cached one. The version is advertised on
  sync pull (F12) or through an `ETag`, so there are no repeated large downloads. Admin edits are online-only (design.md:
  "Offline (edits need network)").
- **Offline use:** `countLines`, `paraFor`, and range validation run from `packages/domain` against the cache, giving the same
  results as the server. The server re-validates on sync; a confirmed Total Lines is never recalculated (FR-SAB-008).
- **Upgrades and integrity:** the cache can be dropped and re-fetched at any time. Local migrations never touch the
  outbox (AGENTS §7). On access revocation, the cache is locked with the workspace.
- **Size:** about 114 + 30 rows, plus one row per printed line (roughly 548 × 16 if 548 pages is confirmed), plus divisions. That is expected to be
  small, but it must be **measured** on the real file before release.
- **Not bundled in the APK (recommended, OD-QR-7):** bundling would couple data fixes to app releases, ignore per-madrasa
  Admin edits, and widen redistribution, which needs licence permission anyway. Teachers sign in online at least once,
  so the snapshot is in place before offline use.

## 9. Provenance and audit

Each item maps to a column: source name, URL, resource ID, source version, download date, file name, and SHA-256 →
`quran_sources`. Licence status, permission reference, and attribution → `quran_sources`. Dataset key and version,
reviewer, approval date, approval status, validation report hash, applied at/by → `quran_imports`. Audit events: the
existing `QURAN_SURAH_*` and `QURAN_PARA_*`, plus proposed `QURAN_IMPORT_APPLIED` and `QURAN_LAYOUT_ACTIVATED`, written
in the same transaction (ARCHITECTURE §15). Required attribution is shown on the About screen in all three locales (i18n).

## 10. Example records

**Verified source structures.** The fields and values below were copied from QUL's Docs-tab samples on 2026-11-09. They
must be re-checked against the downloaded files.

```json
// QUL resource 70 (Surah names), JSON keyed by id
{ "1": { "id": 1, "name": "Al-Fātiĥah", "name_simple": "Al-Fatihah", "name_arabic": "الفاتحة",
         "revelation_order": 5, "revelation_place": "makkah", "verses_count": 7, "bismillah_pre": false } }

// QUL resource 68 (Juz), JSON keyed by juz_number
{ "1": { "juz_number": 1, "verses_count": 148, "first_verse_key": "1:1", "last_verse_key": "2:141",
         "verse_mapping": { "1": "1-7", "2": "1-141" } } }

// QUL resource 69 (Ayah). "text" omitted here: HifzAmanah never stores Quran text
{ "1": { "id": 1, "surah_number": 1, "ayah_number": 1, "verse_key": "1:1", "words_count": 4 } }
```

**Illustrative only (NOT real layout data).** These show the shape. The page and line rows come from QUL's generic
documentation sample, which is not proven to be resource 11. Word IDs and positions are placeholders.

```json
// mushaf_editions row: values from QUL resource 11's page; stays UNVERIFIED until OD-QR-1 and review
{ "code": "INDOPAK_16_LINE", "name": "16-line Indo-Pak Mushaf", "lines_per_page": 16,
  "publisher": null, "page_count": null, "verification": "UNVERIFIED",
  "candidate": { "provider": "QUL", "resourceId": "11", "publisher": "Taj Company", "pages": 548 } }

// QUL layout "pages" rows (source shape, from the generic docs sample)
{ "page_number": 1, "line_number": 1, "line_type": "surah_name", "is_centered": true,
  "first_word_id": null, "last_word_id": null, "surah_number": 1 }
{ "page_number": 1, "line_number": 2, "line_type": "ayah", "is_centered": true,
  "first_word_id": 1, "last_word_id": 5, "surah_number": 1 }

// One HifzAmanah mushaf page (derived view; ILLUSTRATIVE values)
{ "edition": "INDOPAK_16_LINE", "layoutImportId": "<uuid>", "page": "<n>",
  "first": { "surah": "<s>", "ayah": "<a>" }, "last": { "surah": "<s>", "ayah": "<a>" },
  "paraAtStart": "<p>", "lineCount": "<n>" }

// One HifzAmanah layout line (seed v2; ILLUSTRATIVE values)
{ "page": "<n>", "line": "<n>", "lineType": "AYAH", "isCentered": false, "surah": "<s>",
  "ayahStart": "<a1>", "wordStart": "<p1>", "ayahEnd": "<a2>", "wordEnd": "<p2>",
  "srcFirstWordId": "<id>", "srcLastWordId": "<id>" }

// One word → page/line mapping as the converter resolves it (ILLUSTRATIVE; not stored at runtime)
{ "srcWordId": "<id>", "wordKey": "<s>:<a>:<p>", "page": "<n>", "line": "<n>" }
```

## 11. Consequences

- **Positive:** no duplicate tables; the seed loader, review list, and audit stay as built; there is a full trail from
  any line back to a raw file hash and a permission; teachers work offline; and no Quran text is stored or shipped.
- **Negative:** a follow-up migration (proposed `00xx_quran_ref_v2`) relaxes `mushaf_layout_lines.ayah_*` to NULL for
  non-Ayat lines, adds the new columns and tables, and needs a seed format v2. Also new: a snapshot route, the device
  cache tables, and an offline converter tool. None of this is built.
- **Risk:** if permission for QUL 11 is refused, there is no 16-line layout. Total Lines then stays Teacher-entered (the
  built fallback), and page/line navigation is unavailable.

## 12. Open decisions (product owner)

| ID | Question | Recommendation |
|---|---|---|
| OD-QR-1 | *Narrowed by DEC-B71 (publisher = Taj Company).* The exact Taj printing and edition identifier; is the 16-line, 548-page profile confirmed? | Check a physical Taj Mushaf at 2–3 target madaris; photograph the imprint |
| OD-QR-2 | The approved source per category | Tanzil for Surahs and Juz if its CC BY 3.0 is verified, else QUL 70/68 with permission; QUL 11 for the Taj layout, after permission |
| OD-QR-3 | Written permission and legal review: Tarteel, **and Taj Company as a prerequisite for any Taj layout data** | Yes, using the research doc §7 |
| OD-QR-4 | Nominate the qualified Quran reviewer (DEC-B31, existing) | A qualified Hafiz/teacher with the confirmed Taj printing |
| OD-QR-5 | *Closed by DEC-B71:* Ruku, Hizb, quarter-Hizb, and seven-Manzil are later-phase candidates | — |
| OD-QR-6 | Approve the model in §3 (line types, word positions, `quran_sources`, optional `quran_divisions`) | Approve |
| OD-QR-7 | Device distribution: API snapshot after sign-in, or bundled in the APK | API snapshot |
| OD-QR-8 | Add page → start line → end line selection (resolved to Surah/Ayat), and store page/line as an extra reference? | Yes for Sabaq as an input aid; references optional for Sabqi/Manzil. This needs new FR text and a design.md update |
| OD-QR-9 | Attribution requirements: the wording each licence or permission requires, and where it is shown | About screen, all three locales |
| OD-QR-10 | Should Para quarters be selectable *positions*? (They stay amounts as they are today) | Not in MVP |
| OD-QR-11 | Do Surah-heading and Bismillah lines count in Total Lines? | No (as built); confirm with teachers |
| OD-QR-12 | *(Added 2026-11-09, readiness review R1.)* Must a Sabqi/Manzil Surah/Ayat range lie within the portion's Para? | Product owner to decide; until then it is not enforced |

## 13. Planned acceptance criteria (reserved IDs, not yet active)

Added 2026-11-09 at the product owner's request (DEC-B71). The IDs are **reserved**. Each becomes an active
`F06-ACnn` criterion in its story spec once ADR-017 is approved **and** its E2E test stubs exist. Until then,
`npm run e2e:trace` would correctly fail on a criterion that has no test. The authoritative list is in the
[F06 spec](../specs/07-f06-quran-portions-metadata.md#planned-acceptance-criteria-reserved-ids-not-yet-active).

| ID | Story | Criterion (summary) |
|---|---|---|
| F06-AC20 | US-026 | Taj edition identification: the edition record names Taj Company and the exact printing identifier, and is `VERIFIED` only after reviewer sign-off |
| F06-AC21 | US-026 | Verified page/line mapping: the layout's pages, lines, and Ayat-to-page and Ayat-to-line mapping match the physical Taj Mushaf on every sampled page |
| F06-AC22 | US-025 | Ayat range validation against the madrasa's active Surah Ayat counts, identical on server and device (the Para clause waits on OD-QR-12) |
| F06-AC23 | US-026 | Ayat, Surah-heading, and Bismillah lines are stored and treated separately; only Ayat lines count toward Total Lines |
| F06-AC24 | US-025 | Offline lookup from the cached snapshot gives the same Para, validation, and Total Lines as the server |
| F06-AC25 | US-024 | Reproducible import validation: the same source checksums and converter version give the same seed checksum and report |
| F06-AC26 | US-024 | Licence gate: no restricted (`LICENSE_REVIEW_REQUIRED`/`REFUSED`) source is imported or distributed |
| F06-AC27 | US-024 | Reviewer sign-off against the physical Taj Mushaf is required before a production import |

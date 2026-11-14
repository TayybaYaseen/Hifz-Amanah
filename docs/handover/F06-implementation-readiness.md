# F06 · Implementation-readiness review (Quran reference data, Taj edition)

**Date:** 2026-11-09. **Type:** Planning review only. No code, migration, test, download, or import was made, and no
reserved criterion was activated.
**Inputs reviewed:** SRS v1.16 (FR-SAB-001…015, §17 DEC-B31/B32/B64/B70/B71, §17.3), ARCHITECTURE v1.5 (§5, §6.3, §8),
ADR-015, ADR-016, [ADR-017](../adr/ADR-017-quran-reference-data-model.md) (Proposed), the F06 feature and story specs,
[research](F06-quran-dataset-candidates.md), and the built-but-uncommitted F06 code: `apps/api/migrations/0009_quran_ref.sql`,
`apps/api/src/modules/quran-ref/*`, `packages/domain/quran-ref/*`, `apps/api/src/platform/migrate.ts`,
`e2e/api/f06-quran-portions.spec.ts`.
**Companion documents:** [Taj verification kit and sign-off template](F06-taj-verification-kit.md) ·
[permission request drafts (not sent)](F06-permission-request-drafts.md).

> **Verdict:** F06 is **not ready** for its Quran-data work. Five external blockers remain: printing, licences
> (Tarteel and Taj Company), source choice, reviewer, and the word-ID pairing. Part of the remaining technical work is
> **ready to start once the product owner approves ADR-017**, because it can be built and tested with synthetic data
> only (§10.5). **Implementation waits for the product owner's approval.**

## 1. ADR-017 against the SRS and the architecture

| # | Finding | Severity | Resolution in this review |
|---|---|---|---|
| R1 | ADR-017 §5.2 said a Sabqi/Manzil Surah/Ayat range is "kept inside the chosen Para's boundary". **No approved requirement says this** (US-025, FR-SBQ-*, FR-MNZ-*). Planned F06-AC22 repeated it | High: an unapproved rule | Removed from ADR §5.2 and AC22; raised as **OD-QR-12** (SRS §17.3) |
| R2 | `quran_import_sources` had no `organization_id`, but `quran_imports` is tenant data with RLS (ADR-016). A link table without the tenant column breaks the composite-FK and RLS pattern | High | ADR §3.2 corrected: `(organization_id, import_id, source_id, role)`, FK `(organization_id, import_id)`, RLS policy |
| R3 | `quran_sources` is global, and `hifz_tenant` may only SELECT global tables. The seed loader runs inside `withTenant` (`seed.ts:101`), so it **cannot insert sources** | Medium | ADR §3.1: sources are registered by a separate maintainer step (privileged migration/CLI) **before** any seed that cites them; the loader only checks them |
| R4 | ADR §3.8 required word positions on every `AYAH` line. Existing v1 imports (synthetic, test-only) have none, so a strict CHECK would fail on them | Medium | ADR §3.8: word columns stay nullable in SQL; the loader requires them for seed format v2 |
| R5 | `countLines` (`packages/domain/quran-ref/range.ts:179`) counts every line whose Ayat range overlaps. Once Surah-heading and Bismillah rows exist (with NULL Ayat), it must filter `line_type = AYAH`, or the types must change | Medium: a code prerequisite | Listed in §10.4 (T4) |
| R6 | ADR §4 step 4 named the last Ayat of Surah 114 by number. Project rules forbid typing Quran metadata from memory | Low | Reworded: "the last word of the last Ayat as the source numbers it" |
| R7 | ADR §8.2 advertises `reference_version` on the F12 pull. ADR-015's pull contract has no such field | Low | An additive optional field (no protocol bump); to be recorded in ADR-015's contract when built (T8) |
| R8 | `is_centered` in old imports: a default of `false` would turn "unknown" into a value (AGENTS §5 #6, by analogy) | Low | ADR §3.8: nullable, with no default |
| R9 | `quran_surahs` gains columns. The tenant's UPDATE grant is column-listed, so the newer-seed update path needs the new columns granted | Low | §8 below, migration note |
| R10 | Consistent with the SRS: FR-SAB-005…010 unchanged; DEC-B32 (records keep ranges) kept; quantity rules (ADR-005/014) untouched; Rubu ≠ quarter-Hizb stated. Consistent with the architecture: module boundaries (§5), RLS (ADR-016), and no runtime provider (SRS §1.5) | — | No change |

## 2. Dependencies

| Dependency | State | Effect on F06 |
|---|---|---|
| F02 (organizations, roles), F03 (roster), F12 (sync), F04 | Merged to `main` | None |
| F01 auth, audit (`QURAN_*` events) | Built | None |
| **F05 (Daily Hifz entry)** | Not built; it depends on F06 | F06-AC5, AC8–AC17, and AC19's record part need F05's portion endpoints. **The F06 gate cannot pass before F05.** This is already noted in the F06 status |
| F06 code on the branch (0009, quran-ref module, domain, contracts, mobile screens) | Built, **uncommitted** | Should be committed on the feature branch before any follow-up work, so the review baseline is fixed (the product owner decides when) |
| Approved Quran dataset | **None** | Blocks F06-AC18, AC20, AC21, and production use |
| Maestro / emulator | Available per `e2e/README.md` (`BLOCKED` without one) | Needed for the mobile parts of AC20, AC22, AC23, AC24 |

## 3. Open decisions and what they depend on

| ID | Decision | Can be finalized **without** external licensing? | Needs |
|---|---|---|---|
| OD-QR-1 | Exact Taj printing and edition identifier; 16-line/548-page confirmation | **Partly.** Identification (kit Part A) can be done now. The 548-page match needs only the physical copy, since 548 is already known | Madrasa visit, physical copy |
| OD-QR-2 | Approved source per category | **No.** It depends on licence answers | Tanzil licence verification, Tarteel reply |
| OD-QR-3 | Permission and legal review (Tarteel, Taj Company) | **No.** External | Sending the drafts (product owner) |
| OD-QR-4 | Qualified Quran reviewer | **Yes** | Product owner nomination |
| OD-QR-6 | Approve the ADR-017 data model | **Yes** | Product owner approval |
| OD-QR-7 | API snapshot vs. bundling in the APK | **Yes** (recommended: API snapshot) | Product owner approval |
| OD-QR-8 | Page/line selection in MVP | **Yes** (a product scope choice); its usefulness depends on a verified layout | Product owner |
| OD-QR-9 | Attribution | **Partly.** Placement (About screen, three locales) yes; wording comes from the licensors | Licence replies |
| OD-QR-10 | Para quarters as positions | **Yes** (recommended: no) | Product owner |
| OD-QR-11 | Surah-heading/Bismillah lines excluded from Total Lines | **Yes**, after asking 2–3 teachers | Teacher consultation |
| **OD-QR-12** (new) | Must a Sabqi/Manzil Surah/Ayat range lie within its Para? | **Yes** | Product owner |
| B-1 | Which word script pairs with QUL layout 11 | **No** | Tarteel's answer, or inspecting the files (download allowed only after approval) |

**Seven decisions can be closed now** without any licence: OD-QR-4, 6, 7, 8, 10, 11, and 12, plus Part A of OD-QR-1 and
the placement half of OD-QR-9.

## 4. Physical Taj Mushaf verification checklist

See [F06-taj-verification-kit.md](F06-taj-verification-kit.md):
- **Part A** (edition identification, doable now);
- **Part B** (page structure: count, opening/ending pages, 16-line exceptions, Para starts);
- **Part C** (40-page line-by-line sample: headings, Bismillah, Ayat-to-page, Ayat-to-line, breaks, alignment);
- **Part D** (metadata, line counts);
- **Part E** (licence and report preconditions).

## 5. Permission request drafts

See [F06-permission-request-drafts.md](F06-permission-request-drafts.md). There are two separate drafts, Tarteel AI and
Taj Company, plus a send checklist and a log of replies. **Neither has been sent.** Contact addresses are placeholders,
because none were verified.

## 6. Reviewer sign-off template

See [F06-taj-verification-kit.md, Part F](F06-taj-verification-kit.md#part-f--reviewer-sign-off-template).

## 7. E2E tests needed for F06-AC20…AC27 (specified, not written)

Conventions: API tests in `e2e/api/f06-quran-portions.spec.ts` (Playwright, tag `@F06`, title starting
`F06-ACnn (US-xxx)`); mobile flows in `e2e/mobile/f06-quran-portions/*.yaml` (tags `F06`, `US-xxx`).
- **All tests use synthetic data only.** They use the existing `@hifz/domain/quran-ref/synthetic-fixture` and the control
  API's `quranSeeds`, extended for seed v2. Synthetic Surah names, counts, and layouts are **not Quran data** and must
  never look like it.
- **The physical comparison itself cannot be automated.** AC20 and AC21 test that the system **enforces** the review
  (no `VERIFIED` and no layout without a signed report that matches). The human evidence is the signed kit.

| AC | Story | API tests (Playwright) | Mobile flow (Maestro) | Notes / new prerequisites |
|---|---|---|---|---|
| **AC20** Taj edition identification | US-026 | (a) `GET /quran/editions`: the active edition shows publisher and `printingId` and `verification: UNVERIFIED` before sign-off. (b) After control applies a synthetic import with a signed synthetic report, it shows `VERIFIED`. (c) No route lets an Owner, Admin, or Teacher set `VERIFIED` directly (404/403). (d) An import whose report is `REJECTED` leaves it `UNVERIFIED` | `edition-verification.yaml`: Admin → Settings → Quran metadata → the edition card shows publisher, printing, and "Not verified" (text + icon); after the control step it shows "Verified" | Needs: `printing_id` column, editions contract fields, a control step for a signed synthetic report |
| **AC21** Verified page/line mapping | US-026 | (a) Apply a synthetic layout v2 plus the reviewer's synthetic sample (expected page/line → Surah, first/last Ayat): the validation report shows no mismatch and the import is accepted. (b) Change one sample line: the report lists the page and line, and the import is refused. (c) A proposed lookup `GET /quran/layout/pages/:page` returns the lines exactly as imported. (d) The page count and lines per page must equal the edition record (V5, V9) | `ranges-and-quantities.yaml` (extend): a range on a synthetic page pre-fills Total Lines "From Mushaf layout" equal to the fixture's count | Needs: the validator in the loader path, the page lookup route (OD-QR-8 related), a reviewer-sample input format |
| **AC22** Ayat range validation | US-025 | Against the **active** metadata (seed plus Admin edits): (a) an Ayat above the Surah's count gives `OUT_OF_RANGE` with `max`; (b) end before start gives an error; (c) an unknown Surah gives an error; (d) **after an Admin lowers an Ayat count**, a previously valid range is rejected for new entries while stored records are listed for review, not changed (with AC19). The Para clause waits on **OD-QR-12** | `ranges-and-quantities.yaml` (extend): the same cases offline (see AC24) | **Overlaps F06-AC6/AC7.** Recommendation: when activating it, word AC22 as "validation uses the madrasa's *active* metadata version, identically on server and device", so it adds value beyond AC6/AC7 |
| **AC23** Separate line types | US-026 | (a) Apply a synthetic v2 layout with `SURAH_NAME`, `BASMALLAH`, and `AYAH` lines: the page lookup returns each with its type, and non-Ayat lines have no Ayat. (b) `GET /quran/line-count` for a range on a page with a heading and a Bismillah counts only Ayat lines. (c) A v2 seed whose `AYAH` line lacks word positions, or whose heading line carries Ayat, is refused | `ranges-and-quantities.yaml` (extend): the Total Lines pre-fill equals the Ayat-line-only count | Needs: the 0010 columns, `countLines` filtered by type (R5), seed v2 parser |
| **AC24** Offline lookup | US-025 | (a) `GET /quran/snapshot` returns `referenceVersion`, `sha256`, and content whose SHA-256 matches. (b) With `If-None-Match` equal to the version it returns 304. (c) After an Admin edit the version changes. (d) A Teacher gets only their own madrasa's snapshot; another org's ID cannot be probed (AC-SEC). (e) Student and Parent get 403 | `offline-reference.yaml`: Teacher signs in online and syncs → `setAirplaneMode: enabled` → Daily Entry → choose a range → Para, a field error for an out-of-range Ayat, and Total Lines appear, and equal values the control API computed server-side → airplane mode off | Needs: snapshot route, `ref_*` SQLite cache, picker wired to the cache. Parity is also covered by unit tests, since one `packages/domain` function runs on both sides |
| **AC25** Reproducible validation | US-024 | (a) Control applies the same synthetic v2 seed twice → the second is a no-op and the checksums are equal (existing behaviour). (b) Same version, changed content → refused (V12). (c) The stored `validation_report_sha256` equals the report attached to the seed | — (server only) | The **converter and validator are an offline tool**: their determinism (same input SHA-256 + tool version → byte-identical seed and report, apart from `generatedAt`) belongs in a Vitest test of the tool. Consider re-scoping AC25 when it is activated, so the gate does not depend on a tool outside the API |
| **AC26** Licence gate | US-024 | (a) A seed with `synthetic: false` citing a source in `LICENSE_REVIEW_REQUIRED` is refused with `LICENCE_NOT_CLEARED`, and nothing is written (all counts unchanged). (b) The same with a Taj layout source lacking the Taj Company `permission_ref` → refused. (c) `REFUSED` → refused. (d) The snapshot never contains data from an import whose source is not cleared | — (server only) | The test seed holds synthetic content flagged non-synthetic **only to prove refusal**, and it is never applied. Needs: `quran_sources`, the gate in the loader |
| **AC27** Reviewer sign-off | US-024 | (a) A production-mode seed without `validationReport.signedBy/signedOn` → refused. (b) A report with `decision: REJECTED` → refused. (c) A signed `APPROVED` report → applied, and the edition becomes `VERIFIED` only if the import is a layout of that edition. (d) The `QURAN_IMPORT_APPLIED` audit names the reviewer | — (server only) | Builds on the existing CHECK (`reviewed_by`, `approved_on`) |

## 8. Can migration 0009 support the model without duplicates or breaking records?

**Yes.** Every change is additive or relaxing. **No table duplicates** an existing one: Juz stays `quran_paras`, editions
stay `mushaf_editions`, and nothing is created for Ayat, words, or pages.

| Object | Proposed change | Safe? | Note |
|---|---|---|---|
| `mushaf_editions` | `ADD printing_id, printing_notes, page_count_source` (nullable) | Yes | The seeded `INDOPAK_16_LINE` row is untouched; `organizations.mushaf_edition` is unchanged |
| `quran_imports` | `ADD seed_format_version smallint NOT NULL DEFAULT 1`, `approval_status`, `validation_report_sha256` (nullable) | Yes | Existing rows become format 1; the existing reviewer CHECK stays; the table-level INSERT grant covers new columns |
| `quran_sources` (new, global) | Create; `GRANT SELECT` to `hifz_tenant` only | Yes | Written by the privileged maintainer step (R3); the no-delete trigger applies |
| `quran_import_sources` (new, tenant) | Create with `organization_id`, composite FK, RLS, no-delete | Yes | R2 |
| `quran_surahs` | `ADD revelation_place, revelation_order, bismillah_pre` (nullable) | Yes | Extend the column-level `GRANT UPDATE` (R9) |
| `mushaf_layout_lines` | `ALTER ayah_start, ayah_end DROP NOT NULL`; `ADD line_type text NOT NULL DEFAULT 'AYAH' CHECK (...)`, `is_centered boolean NULL`, `word_start, word_end, src_first_word_id, src_last_word_id` (nullable); `CHECK (line_type = 'AYAH') = (ayah_start IS NOT NULL AND ayah_end IS NOT NULL)` | Yes | Existing (synthetic) rows are all Ayat lines, so they satisfy the CHECK; `CHECK (ayah_end >= ayah_start)` passes on NULL |
| `quran_divisions` | **Not created in F06** (later phase, DEC-B71) | — | — |

**Records:**
- No production database exists. F05 lesson records are not built. Dev and test databases hold only synthetic Quran
  data. **No student record can break.**
- When F05 is built, records store canonical Surah/Ayat values plus the edition code and layout `import_id` (ADR-017
  §3.10), never reference-row IDs.

**Migration mechanics (important):** `apps/api/src/platform/migrate.ts` records applied migrations **by file name only,
with no checksum**. Editing 0009 in place would be **silently skipped** on any database that already ran it (for
example the local `apps/api/.data` database). So the changes go in a new **`0010_quran_ref_v2.sql`**, even though 0009
is not merged yet. The alternative, amending 0009, would require resetting every local database, and nothing would
detect a missed reset.

## 9. Risks in the API snapshot and SQLite cache approach

| # | Risk | Likelihood / impact | Mitigation |
|---|---|---|---|
| S1 | **Stale cache while offline:** an Admin corrects metadata; the Teacher's device validates against the old version | Medium / Medium | The server re-validates on sync. A newly invalid entry returns `REJECTED VALIDATION`, and the outbox marks it action-required (ADR-015), so it is never silently accepted. Already-stored records follow DEC-B32 (listed, not changed). Show the cache version and age in Settings |
| S2 | **The device rejects a range the server would accept** (cache older than an Admin *widening* fix), blocking a Teacher offline | Low / Medium | Refresh on every successful pull when the version differs; allow a manual "Refresh reference data". Decide whether the device may save with a warning when its cache is older than the server's last advertised version (**new question for F05; not decided here**) |
| S3 | **Redistribution scope:** sending licensed layout data to devices *is* redistribution | High / High | The permission must explicitly cover server storage plus device caching (drafts ask this). Without it, a layout is never put in a snapshot (planned AC26 (d)) |
| S4 | **Extraction** from rooted devices | Medium / Low–Medium | The snapshot holds no Quran text. Store it in the app sandbox; per-org DBs are already per account. Tell licensors in the request (drafts do) |
| S5 | **Partial or corrupt download** | Low / Medium | Verify SHA-256 before an atomic swap in one SQLite transaction; keep the old cache until then |
| S6 | **Format skew** between app version and snapshot | Medium / Medium | `snapshotFormatVersion` in the payload; the server returns 426 below the minimum (as F12 does); the app ignores unknown fields |
| S7 | **Size and first-sign-in on a slow network** | Unknown / Medium | Measure on the real file (ADR §8.2); gzip; the pickers already have an empty state; the download is resumable or retried in the background |
| S8 | **Two mechanisms:** F12 change-log pull for records, a snapshot for reference data. Version advertising can drift | Medium / Low | `reference_version` is computed in one server function and returned on pull and as the snapshot ETag; an integration test asserts equality |
| S9 | **Local migrations:** the cache must never block or touch the outbox | Low / High | `ref_*` tables have no FK from or to entity tables; they are dropped and re-fetched on any cache-schema change; a migration test with pending ops (AGENTS §7) |
| S10 | **Revocation:** a cached, licensed layout stays on a revoked device | Medium / Low | On `ACCESS_REVOKED`, delete `ref_*` (not only lock it), and say so in the permission request if a licensor requires it |
| S11 | **Reference version and RLS:** a hash computed outside the tenant transaction could mix organizations | Low / High | Compute it inside `withTenant`, and cover it with the cross-tenant test in AC24 (d) |
| S12 | **Parity drift** between server and device logic | Low / Medium | Both import the same `packages/domain` functions; parity unit tests run on the same fixture |

## 10. Final readiness report

### 10.1 Approved decisions

| ID | Decision |
|---|---|
| DEC-B31 | Reviewed seed plus audited Admin edits; reviewer to be nominated |
| DEC-B32 | Metadata changes never alter records; invalid ranges are listed for review |
| DEC-B64 | Total Lines pre-filled from the layout, confirmed by the Teacher, stored with its edition, never recalculated |
| DEC-B70 | Target Mushaf: 16-line Indo-Pak; editions are data |
| DEC-B71 | **Taj Company** is the primary target publisher (accepted by the product owner on 2026-11-09 as the planning direction). The 548-page profile is a candidate only. MVP priorities are fixed; divisions are a later phase (closes OD-QR-5) |
| Existing rules | Quantities `(unit, n, d)`; Rubu 1/4, Half 1/2, Salasah 3/4, Complete 1; Sabaq/Sabqi/Manzil/homework rules unchanged (ADR-005, ADR-014) |

### 10.2 Proposed decisions (awaiting the product owner)

- **ADR-017** as a whole (OD-QR-6), including the R1–R9 corrections made in this review.
- **FR-SAB-011…015.**
- **The open decisions** from §3: OD-QR-7 (API snapshot), OD-QR-8 (page/line selection), OD-QR-10 (no Para-quarter
  positions), OD-QR-11 (headings and Bismillah not counted), and the new OD-QR-12 (Sabqi/Manzil range within its Para?).
- **Migration approach:** a new `0010_quran_ref_v2.sql` rather than amending 0009 (§8).
- **Re-scoping AC22 and AC25 on activation** (§7).
- **Source recommendation** per category (OD-QR-2), still conditional on licences.

### 10.3 External blockers

1. **OD-QR-1:** the exact Taj printing, and the page count confirmed on a physical Taj Mushaf (madrasa visit).
2. **OD-QR-3:** written permission from **Tarteel** and **Taj Company**, plus legal review. Drafts are ready, not sent.
3. **Tanzil licence:** verify at tanzil.net from a network that can reach it.
4. **OD-QR-4:** a qualified Quran reviewer nominated.
5. **B-1:** which word script pairs with QUL layout 11 (Tarteel's answer or file inspection).

**Licensing and physical verification are not approved.** No evidence exists yet.

### 10.4 Technical prerequisites (before or alongside implementation)

| # | Prerequisite |
|---|---|
| T1 | Commit the current F06 work on `feature/f06-quran-portions-metadata` (when the product owner says so), to fix the baseline |
| T2 | Migration `0010_quran_ref_v2.sql` per §8 (after ADR-017 approval) |
| T3 | Seed format v2 parser and loader: sources check, licence gate, report hash, line types, word positions; v1 still readable |
| T4 | `packages/domain/quran-ref`: nullable Ayat on non-Ayat lines, `countLines` filtered to `AYAH` (R5), v2 validation rules V1–V12 |
| T5 | Offline converter and validator tool (maintainer-only, outside the app), tested on synthetic fixtures; its determinism tested |
| T6 | Privileged step that registers `quran_sources` (R3) |
| T7 | Snapshot route plus `reference_version`; mobile `ref_*` cache with checksum and atomic swap; local migration test with pending ops |
| T8 | Record the additive `referenceVersion` pull field in ADR-015's contract |
| T9 | i18n keys (en, ur, ur-Latn) for edition status, cache state, and attribution |
| T10 | E2E stubs for AC20…27 (`test.fixme` / `pending` flows) **at the moment** the criteria are activated, not before |

### 10.5 Implementation-ready tasks (after the product owner approves ADR-017; no licence needed; synthetic data only)

These can be built and fully tested without any real Quran data. **None has been started.**
1. T2, migration 0010 (schema only, no data).
2. T3 and T4, seed v2 and domain changes, with unit tests on synthetic fixtures.
3. T6, the source registration step and the licence gate (AC26 behaviour).
4. T5, the converter/validator tool against synthetic word and layout fixtures (AC25 behaviour).
5. T7, the snapshot route and the device cache (AC24 behaviour), plus the S1–S12 mitigations.
6. Edition verification status in API and UI (AC20 behaviour), and the sign-off check in the loader (AC27).
7. Activating F06-AC20…27 with their E2E stubs (§7), once the product owner approves the criteria wording (AC22/AC25
   re-scoping, OD-QR-12).

**Not ready** (needs external evidence): loading any real Quran metadata or layout, setting `publisher` and
`page_count` on the edition, marking any edition `VERIFIED`, F06-AC18, and the F06 gate (which also needs F05).

**Next step: product owner approval.** Implementation does not start until the product owner approves ADR-017 and gives
an implementation instruction.

# F06 · Quran portions and metadata

**Status:** draft
**Brief:** [00-product-brief.md](../00-product-brief.md) · **Flow:** Settings → Quran metadata (design gap); Quantity field and range fields in Daily Entry ([design.md §4.7, §5.3](../design.md))
**Requirements:** FR-SAB-001/002/005/006, FR-QTY-001…006, FR-I18N-006, NFR-MNT-003, FR-SAB-007, FR-QTY-009
**Stories:** US-024 – US-027 · **Depends on:** F02
**Build order:** 7 of 17 (dependency level 2)

## Implementation status (2026-11-09)

**In progress, blocked on Quran data.** Branch `feature/f06-quran-portions-metadata`. **Target Mushaf:** 16-line Indo-Pak Mushaf (DEC-B70), publisher **Taj Company** (DEC-B71). The exact printing, page count, and layout are unverified.

| Part | State |
|---|---|
| Quantity type and units-by-section rule (`packages/domain/quantity`) | Built, unit-tested |
| Range, Para, metadata, and seed validation (`packages/domain/quran-ref`) | Built, unit-tested |
| Tables, edition catalogue, import provenance, versioned layouts (migration 0009) | Built |
| Admin edit API with audit, review list, Total Lines lookup, seed loader | Built, integration-tested |
| ADR-017 backend (DEC-B72): migration 0010, seed format 2 (typed lines, word positions), source catalogue with append-only licence history, licence gate (incl. publisher clearance for layouts), reviewer sign-off check, `npm run quran:source` | Built 2026-11-09; unit-tested (49 domain tests) and integration-tested (35 F06 integration tests pass). Synthetic data only |
| Converter and validation tool (`npm run quran:convert`): source files → format-2 seed, checks S1–S10, JSON/Markdown report with import gate, reviewer sign step (ADR-017 §4–§7) | Built 2026-11-09; 31 unit and 4 integration tests on synthetic data. Not yet run on any real dataset (licences pending) |
| F06-AC20…AC27 | API E2E tests for all eight pass (AC24 activated 2026-11-09 with the snapshot). AC24's Maestro flow (`offline-reference.yaml`) is written and active but was not executed on a device here (the machine could not run the emulator). Wording states the verification boundary (DEC-B78) |
| Offline snapshot and device cache (FR-SAB-014) | **Implemented 2026-11-09, synthetic data only:** `GET /quran/reference/version|snapshot`, server migration 0011 (snapshot manifest, revocation, physical-verification evidence), workspace migration 5 (`ref_*` cache), background sync and refresh, revocation handling, More → Quran references with reusable range fields (DEC-B83 host until F05). Design: [ADR-018](../adr/ADR-018-quran-reference-snapshot-offline-cache.md); results: [F06-snapshot-implementation-plan.md §9](../handover/F06-snapshot-implementation-plan.md) |
| E2E (API) | AC1–AC4, AC6, AC7 real and passing; AC5 and AC8–AC17 need F05's portion endpoints; AC19's record part needs F05 records |
| Mobile screens and Maestro flows | Not started |
| **Production Quran seed and 16-line layout** | **Blocked.** No dataset is approved. Nothing was generated or entered from memory (DEC-B31; candidates in [F06-quran-dataset-candidates.md](../handover/F06-quran-dataset-candidates.md)) |
| **F06-AC18 and the F06 gate** | **Blocked** until the items below are decided |

Open (SRS §17.3): the exact publisher/edition, the approved dataset, its licence approval, the verified 16-line page/line layout source, and the reviewer. The research and proposed design of 2026-11-09 add OD-QR-1…11 ([below](#quran-reference-data-specification-proposed-2026-11-09-not-approved)).

Its story specs follow this page in `docs/specs/` and share the `07-` prefix, one spec per user story. This page keeps what applies to the whole feature: context, scope, edge cases, open questions, the feature test plan, and its definition of done. Story specs repeat the edge cases and open questions that apply to them.

## Story specs

| Spec | Story | Detailed criteria |
|---|---|---|
| [SPEC-US-024](07-us-024-maintain-quran-metadata.md) | US-024 — Maintain Quran metadata | F06-AC1, F06-AC2, F06-AC3, F06-AC4, F06-AC18, F06-AC19, F06-AC25, F06-AC26, F06-AC27 |
| [SPEC-US-025](07-us-025-select-para-and-ayat-range.md) | US-025 — Select Para and Ayat range | F06-AC5, F06-AC6, F06-AC7, F06-AC22, F06-AC24 |
| [SPEC-US-026](07-us-026-use-16-line-indo-pak-mushaf.md) | US-026 — Use 16-line Indo-Pak Mushaf | F06-AC8, F06-AC9, F06-AC17, F06-AC20, F06-AC21, F06-AC23 |
| [SPEC-US-027](07-us-027-select-portion-quantities.md) | US-027 — Select portion quantities | F06-AC10, F06-AC11, F06-AC12, F06-AC13, F06-AC14, F06-AC15, F06-AC16 |

## Context

Every portion names a place in the Quran and an amount. The Madrasa Admin maintains the reference data:
- Surahs, with Ayat counts
- Para boundaries

The MVP counts lines on the 16-line Indo-Pak Mushaf only (SRS §17 DEC-B70, 2026-11-09).

Amounts must be exact and always carry a unit. A Para fraction is never added to lines.

There is no code yet. This feature builds:
- the `quran-ref` module: the `quran_surahs`, `quran_paras`, and `mushaf_layout` tables
- the quantity type in `packages/domain`, stored as `(unit, numerator, denominator)` ([ARCHITECTURE.md §6.2](../ARCHITECTURE.md))

## Out of scope

- Offering users Mushaf editions other than the 16-line Indo-Pak edition (the data model allows more editions later; DEC-B70).
- Any conversion between lines, Ayat, pages, and Para fractions.
- Importing metadata from an external provider.
- Showing Quran text or audio.

"Importing metadata from an external provider" means a **runtime** integration (the app calling QUL, Tanzil, or an API
while it runs). It does not cover the approved path: a **one-time, reviewed, versioned seed import** that a maintainer
prepares offline and the seed loader applies (FR-SAB-007, SRS §1.5).

## Quran reference data specification (proposed 2026-11-09, not approved)

Research: [F06-quran-dataset-candidates.md](../handover/F06-quran-dataset-candidates.md). Design:
[ADR-017](../adr/ADR-017-quran-reference-data-model.md) (Proposed). Proposed requirements: SRS FR-SAB-011…015.
**None of this is approved or built.** It needs the product owner's decisions OD-QR-1…11 (SRS §17.3).

### Target edition (DEC-B71, decided 2026-11-09)

- **Publisher:** Taj Company, the edition the target madaris mainly use.
- **Candidate profile:** Indo-Pak, 16 lines per page. A 548-page layout exists as a **candidate only** (QUL resource 11).
- **Not verified:** the exact printing and edition identifier, the total page count, page numbering, and every line
  break. These are verified only against a **physical Taj Mushaf used by the target madaris**, using the Taj verification
  checklist ([research doc §6](../handover/F06-quran-dataset-candidates.md)): printing, page count, 16-line structure,
  opening and ending pages, Surah heading and Bismillah positions, Ayat-to-page and Ayat-to-line mapping, and alignment
  and line breaks.
- **Licence:** deciding on Taj Company grants no digital rights. Taj Company's position (permission, or legal advice) is
  a prerequisite for any Taj layout data, in addition to the dataset provider's permission. Every candidate resource
  stays `LICENSE_REVIEW_REQUIRED`.

### MVP priorities (DEC-B71)

1. Surah metadata.
2. Ayat metadata and validation.
3. Para/Juz metadata.
4. The Taj edition profile.
5. The verified Taj page/line layout mapping.
6. The offline reference-data snapshot and versioning.

Ruku, Hizb, quarter-Hizb, and seven-Manzil divisions are later-phase candidates, unless an approved source and a clear
MVP need are established.

### Offline approach (proposed, FR-SAB-014, ADR-017 §8)

- **One approved, versioned snapshot** of the madrasa's active reference data, built from one reviewed seed.
- **Distribution:** the HifzAmanah API sends it after an authorized sign-in. There is no runtime dependency on QUL or any
  external Quran API.
- **Device storage:** a local SQLite cache, outside the outbox. Its SHA-256 and reference version are checked before an
  atomic swap. It is refreshed only when the version changes.
- **Updates are safe:** student records hold canonical Surah/Ayat values, never reference-row IDs, so updates never
  rewrite historical records (DEC-B32, FR-SAB-008).

### Categories and sources

| Category | Count | Stored in | Recommended source (pending licence) | Licence status | MVP |
|---|---|---|---|---|---|
| Surahs (number, Arabic name, translit name, Ayat count; optional revelation place/order, Bismillah flag) | 114 | `quran_surahs` (0009) | Tanzil if its CC BY 3.0 is verified; else QUL 70 with permission | `LICENSE_REVIEW_REQUIRED` | Yes |
| Para/Juz boundaries | 30 | `quran_paras` (0009) | Tanzil; else QUL 68 with permission | `LICENSE_REVIEW_REQUIRED` | Yes |
| Taj Indo-Pak 16-line page/line layout | candidate 548 pages (QUL 11, unverified) | `mushaf_layout_lines` (0009, extended per ADR-017) | QUL 11 (Taj company) + its paired word script, with written permission from Tarteel **and** Taj Company | `LICENSE_REVIEW_REQUIRED` | Yes (blocked) |
| Ruku | QUL 558 / quran-meta 556 (to verify against the print) | `quran_divisions` (later phase) | Tanzil or QUL 65 | `LICENSE_REVIEW_REQUIRED` | Later phase (DEC-B71) |
| Hizb (60), quarter-Hizb / Rub al-Hizb (240), Manzil 7-part (7) | as stated by QUL | `quran_divisions` (later phase) | QUL 67/63/66 or Tanzil | `LICENSE_REVIEW_REQUIRED` | Later phase (DEC-B71) |
| Words | — | **Not stored**; offline converter only | QUL word-by-word script (55 or 59, unresolved) | `LICENSE_REVIEW_REQUIRED` | Converter only |

### 16-line Indo-Pak structure

Mushaf edition → page → line → word range → Ayat. Every printed line is one row with its type (`AYAH`, `SURAH_NAME`,
`BASMALLAH`) and alignment. An `AYAH` line stores its Surah and first/last Ayat with the word position in each, converted
once from the source's `first_word_id`/`last_word_id`. Pages are not assumed to hold 16 Ayat lines. An unmapped word ID
stops the import (ADR-017 §4).

### Teaching workflow

- **Sabaq:** Para → Surah → start/end Ayat (as today), or page → start/end line resolved to Surah/Ayat (proposed,
  OD-QR-8). Para is derived; Total Lines is pre-filled from the layout and confirmed (FR-SAB-001…009).
- **Sabqi:** the current Sabaq's Para by default, or other and multiple Paras, each its own portion, with an optional
  Surah/Ayat range and quantity (Para presets or lines).
- **Manzil:** multiple Paras or portions, with optional Surah/Ayat ranges and optional page/line references for the
  madrasa's edition.
- Quantity rules are unchanged: Rubu 1/4, Half 1/2, Salasah 3/4, Complete 1 are **amounts**, never mapped to QUL's
  Rub al-Hizb or to positions (ADR-017 §5.3). HifzAmanah's **Rubu (¼ Para) is not the Quranic quarter-Hizb (⅛ Juz)**.
  Sabaq, Sabqi, Manzil, and homework rules are unchanged.
- Quran reference metadata is kept separate from student lesson records. Existing records keep their original
  Surah/Ayat references after any reference-data update.

### Acceptance criteria F06-AC20…AC27 (activated 2026-11-09)

**Activated 2026-11-09** with their API E2E tests in `e2e/api/f06-quran-portions.spec.ts`. The authoritative wording is now in the story specs (US-024: AC25–27; US-025: AC22, AC24; US-026: AC20, AC21, AC23). The wording was tightened to what the system can enforce: the physical-Mushaf comparison is the reviewer's signed evidence, not an automated check (AC20, AC21). AC24's test stays pending until the snapshot is built (DEC-B75). DEC-B78 (2026-11-09) makes the boundary explicit: automated validation covers the digital structure, metadata, mappings, checksums, source registration, and licence gates; comparison with the physical Taj Mushaf is a human review that the system records. The table below is the planning text, kept for history.

Added 2026-11-09 (DEC-B71). The IDs are reserved. Each criterion moves into its story spec as an active `F06-ACnn`
bullet only once ADR-017 is approved **and** its E2E test stubs exist (`npm run e2e:trace` requires a test for every
active criterion; this planning-only update writes no tests). The F06-AC18 blocker is unchanged.

| ID | Story | Criterion |
|---|---|---|
| F06-AC20 | US-026 | **Given** the madrasa's Mushaf edition, **when** an Admin opens Quran metadata, **then** it names Taj Company and the exact printing identifier, and shows "verified" only after the reviewer has signed off against a physical Taj Mushaf (FR-SAB-006, FR-SAB-013) |
| F06-AC21 | US-026 | **Given** an approved Taj layout import, **when** any page sampled by the reviewer is compared with the physical Taj Mushaf, **then** the page count, the line count per page, and every line's Surah and first/last Ayat match (Ayat-to-page and Ayat-to-line mapping) (FR-SAB-012, FR-SAB-013) |
| F06-AC22 | US-025 | **Given** the madrasa's active Surah Ayat counts (seed plus Admin edits), **when** a range is entered whose Ayat exceeds the Surah's count or whose end comes before its start, **then** it is rejected with a field error naming the field, identically on the server and offline on the device (FR-SAB-009, US-025). *Revised 2026-11-09 (readiness review R1):* the earlier "outside the chosen Para" clause is not an approved rule. It waits on OD-QR-12 |
| F06-AC23 | US-026 | **Given** a Taj page with a Surah heading and a Bismillah line, **when** the layout is stored and Total Lines is counted, **then** Ayat, Surah-heading, and Bismillah lines are stored as separate line types, and only Ayat lines are counted (FR-SAB-012; OD-QR-11) |
| F06-AC24 | US-025 | **Given** a Teacher device that synced the reference snapshot and is now offline, **when** a Surah/Ayat range is chosen, **then** the derived Para, the validation result, and the Total Lines pre-fill equal what the server returns for the same snapshot version (FR-SAB-014) |
| F06-AC25 | US-024 | **Given** the same source files (same SHA-256) and the same converter version, **when** the import validation is run twice, **then** it produces the same seed checksum and the same validation report (FR-SAB-013) |
| F06-AC26 | US-024 | **Given** a source in `LICENSE_REVIEW_REQUIRED` or `REFUSED` (including any Taj layout without Taj Company's position on file), **when** a production import or snapshot distribution is attempted, **then** it is refused and nothing is loaded or sent to devices (FR-SAB-011) |
| F06-AC27 | US-024 | **Given** a dataset version without a passing validation report and the reviewer's sign-off against the physical Taj Mushaf, **when** a production import is attempted, **then** it is refused and the edition stays unverified (FR-SAB-013) |

### Proposed criteria (earlier list, now covered above)

The earlier list, kept for traceability. Each item maps to a planned criterion: licence gate → AC26; refused layout →
AC21/AC25; sign-off → AC27; offline → AC24; page/line choice → FR-SAB-015 (no AC until OD-QR-8 is decided):
- A production import using any source not `OPEN_LICENCE_VERIFIED` or `PERMISSION_GRANTED` is refused (FR-SAB-011).
- A layout with an unmapped word ID, a line spanning two Surahs, or a gap or overlap in word coverage is refused whole,
  and the report names each problem (FR-SAB-012).
- A seed without a passing validation report and a reviewer's sign-off cannot be applied in production. The edition
  stays `UNVERIFIED` until sign-off (FR-SAB-013).
- With the device offline after its first sync, the Surah/Para pickers, range validation, and the Total Lines pre-fill
  work, and give the same results as the server (FR-SAB-014).
- A page/start-line/end-line choice resolves to the Surah and Ayat range the layout says; a choice spanning two Surahs is
  refused with a field error (FR-SAB-015).

### Prerequisites before any Quran data work

1. OD-QR-1: the exact Taj printing identified, and the 16-line/548-page profile confirmed on a physical Taj Mushaf.
2. OD-QR-2: an approved source for each category.
3. OD-QR-3: written permission or a verified licence recorded for every source, **including Taj Company's position for
   any Taj layout data**, plus legal review.
4. OD-QR-4: a qualified Quran reviewer nominated.
5. OD-QR-6: ADR-017 approved, then a follow-up migration and seed format v2.
6. OD-QR-8: whether page/line selection is in MVP. OD-QR-9: the attribution requirements.
7. Blocker B-1 resolved (which word script pairs with QUL layout 11).

Until then F06-AC18, the planned F06-AC20…27, and the F06 gate stay blocked.

**Readiness review (2026-11-09):** [F06-implementation-readiness.md](../handover/F06-implementation-readiness.md) covers the
ADR review findings R1–R10, the E2E test plan for AC20…27, migration 0009 compatibility (changes go in a new 0010),
the offline-cache risks, and which tasks can start after approval. The companion documents are the
[Taj verification kit and sign-off template](../handover/F06-taj-verification-kit.md) and the
[permission request drafts (not sent)](../handover/F06-permission-request-drafts.md). The new open question **OD-QR-12**
asks whether a Sabqi/Manzil range must lie within its Para.

## Edge cases

| Situation | What should happen |
|---|---|
| The Admin edits a Surah's Ayat count after records already use it | Existing records keep their stored values; ranges that become invalid are flagged for review, never changed automatically |
| A range spans two Surahs | Allowed when the start and end Surah/Ayat are both valid and in order |
| The Admin has not yet entered any metadata | Daily Entry still accepts a Para number; Surah/Ayat pickers show "No Quran reference data yet — ask your Admin" |
| A quantity is entered with decimals (0.75) | Not accepted. Para amounts are chosen from the fraction presets |
| Mixed Arabic and digit ranges in the RTL Urdu interface | Use bidi isolation so "البقرة 2:255–260" reads correctly |

## Open questions (resolved 2026-10-30)

- [x] Initial data source and governance for Quran metadata (SRS §13 #3). Can the app ship a reviewed seed? **Resolved:** Yes, a reviewed seed plus audited Admin edits (DEC-B31, FR-SAB-007).
- [x] How are ranges reviewed when the Admin changes metadata that existing records use? **Resolved:** Records keep their ranges; invalid ones are listed for Admin review (DEC-B32, FR-SAB-007).
- [x] D6: extra work beyond the assigned quantity. **Resolved:** A separate Extra portion (DEC-B23, FR-QTY-006).
- [x] Do `PAGES` and `AYAT` quantities need fraction support, or whole numbers only? **Resolved:** Whole numbers only, also for Lines (DEC-B26, FR-QTY-009).

## Done means

- [ ] Every acceptance criterion has a passing test.
- [ ] `npm run e2e:gate -- F06` passes: every criterion has an E2E test, none is pending, and all pass (e2e/README.md).
- [ ] Nothing from "Out of scope" was built.
- [ ] `npm test` and `npm run lint` pass.
- [ ] Quantity math in `packages/domain` uses no floating point; property-based tests cover add, subtract, and compare within one unit.

## Test plan

| Level | What it covers | Where |
|---|---|---|
| **Unit** | Quantity type: presets, remaining, same-unit sums, cross-unit refusal, completed > assigned; range validation (property-based) | `packages/domain/quantity/*.test.ts`, `packages/domain/quran-ref/*.test.ts` |
| **Integration** | Metadata CRUD by role with audit, Arabic stored byte-exact, server-side range validation against org metadata | `apps/api/test/quran-ref/*.test.ts` |
| **Component** | Quantity field (unit always visible, unit-change prompt), Surah/Ayat pickers, empty-metadata state, RTL mixed ranges | `apps/mobile/src/components/__tests__/QuantityField.test.tsx`, `apps/mobile/src/features/daily-entry/__tests__/range*.test.tsx` |
| **E2E** | Every acceptance criterion: server-side checks (API) and device journeys (Maestro), including: Admin adds a Surah → Teacher records a Salasah portion within it → remaining shows 1/4 Para after a Half is completed | `e2e/api/f06-quran-portions.spec.ts`, `e2e/mobile/f06-quran-portions/` |

**Traceability:** Each test name starts with its criterion, e.g. `F06-AC12 (US-027) …`. Every AC 1–19 has at least one test.

**Coverage:** ≥80% on new code (100% branch coverage on the quantity type).

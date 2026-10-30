# SPEC-US-024 · Maintain Quran metadata

| | |
|---|---|
| **Spec ID** | SPEC-US-024 |
| **User story** | US-024 |
| **Feature** | [F06 · Quran portions and metadata](README.md) |
| **Epic** | EPIC 6 — Quran Portion and Metadata ([user-stories.md](../../user-stories.md)) |
| **Status** | draft |
| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |
| **Split from** | `docs/specs/F06-quran-portions-metadata.md` on 2026-10-30 |

## User story

**US-024 — Maintain Quran metadata**

As a Madrasa Admin, I want to add and edit Surah, Ayat, and Para reference data.

Spec wording (from F06):

- **US-024:** As a Madrasa Admin, I want to add and edit Surah, Ayat, and Para reference data, so that teachers pick from correct references.

**Feature context** (shared by every story in F06, copied from the feature spec):

> Every portion names a place in the Quran and an amount. The Madrasa Admin maintains the reference data:
> - Surahs, with Ayat counts
> - Para boundaries
>
> The MVP supports the standard 15-line Mushaf only.
>
> Amounts must be exact and always carry a unit. A Para fraction is never added to lines.
>
> There is no code yet. This feature builds:
> - the `quran-ref` module: the `quran_surahs`, `quran_paras`, and `mushaf_layout` tables
> - the quantity type in `packages/domain`, stored as `(unit, numerator, denominator)` ([ARCHITECTURE.md §6.2](../../ARCHITECTURE.md))

## Related functional requirements

Requirements this story covers. SRS.md has no story-to-requirement table, so this list is derived from the requirement text and the criteria below.

- **Functional:** FR-SAB-005, FR-I18N-006, FR-SAB-007
- **Non-functional:** NFR-MNT-003
- **SRS acceptance tests cited:** None

Feature requirement set (from F06; additions of 2026-10-30 at the end): FR-SAB-001/002/005/006, FR-QTY-001…006, FR-I18N-006, NFR-MNT-003, FR-SAB-007, FR-QTY-009

## Acceptance criteria

### Story acceptance criteria

Verbatim from [user-stories.md](../../user-stories.md).

1. The selected reference data and quantity are stored using canonical values independent of interface language.
2. Rubu = 1/4, Half = 1/2, Salasah = 3/4, and Complete = 1 Para; incompatible units are not summed.
3. MVP line-based portions follow the standard 15-line Mushaf and Admin-maintained Quran metadata.

### Detailed acceptance criteria

From the F06 feature spec. The original IDs are kept because tests cite them. Criteria marked *Revised* or *Added* come from the decision review of 2026-10-30 (SRS §17).

- **F06-AC1** — **(US-024) Given** a Madrasa Admin, **when** they add or edit a Surah (number, Arabic name, Ayat count) or a Para boundary, **then** it is saved for their madrasa and the change is audited.
- **F06-AC2** — **(US-024) Given** a Teacher, **when** they try to edit Quran metadata, **then** there is no edit control, and the API returns forbidden.
- **F06-AC3** — **(US-024) Given** a Surah's Arabic name, **when** it is saved and shown in English, Urdu, or Roman Urdu, **then** the Arabic text is exactly what was entered and is never translated or transliterated.
- **F06-AC4** — **(US-024) Given** a Para boundary whose end comes before its start, **when** the Admin saves, **then** it is rejected with a field error.
- **F06-AC18** — **(US-024) Given** a newly created madrasa, **when** Quran metadata is opened, **then** it already contains 114 Surahs with their Ayat counts and 30 Para boundaries from the reviewed seed. *(Added 2026-10-30, DEC-B31.)*
- **F06-AC19** — **(US-024) Given** records that use a Para boundary, **when** the Admin corrects that boundary, **then** the records keep their stored ranges, any range that is no longer valid is listed for Admin review, and the edit is audited. *(Added 2026-10-30, DEC-B32.)*

## Business rules

From SRS §9 (verbatim):

- **BR-15:** Quranic Arabic must remain intact.

## Validation rules

Stated in these criteria: F06-AC2, F06-AC4.

## Edge cases and error handling

Rows from the F06 edge-case table that apply to this story (verbatim):

| Situation | What should happen |
|---|---|
| The Admin edits a Surah's Ayat count after records already use it | Existing records keep their stored values; ranges that become invalid are flagged for review, never changed automatically |
| The Admin has not yet entered any metadata | Daily Entry still accepts a Para number; Surah/Ayat pickers show "No Quran reference data yet — ask your Admin" |

**Out of scope for the whole feature** (verbatim from F06):

- Mushaf editions other than the standard 15-line edition.
- Any conversion between lines, Ayat, pages, and Para fractions.
- Importing metadata from an external provider.
- Showing Quran text or audio.

## Dependencies

- **Feature F06 depends on:** F02 (from the spec index)
- **Features referenced by this story's criteria and edge cases:** None
- **Other stories referenced:** None
- **Other stories in F06:** [US-025](us-025-select-para-and-ayat-range.md), [US-026](us-026-use-15-line-mushaf.md), [US-027](us-027-select-portion-quantities.md)

## Related screens and UI

- **Feature flow** (from F06): Settings → Quran metadata (design gap); Quantity field and range fields in Daily Entry ([design.md §4.7, §5.3](../../design.md))

[design.md §13](../../design.md) story-to-screen map (verbatim):

| Story | Screen (this document) | Key interaction | Required states beyond standard | Validation shown | Accessibility / localization specifics |
|---|---|---|---|---|---|
| US-024 | Settings → Quran metadata (design gap; Admin only) | Add/edit Surah, Ayat count, Para boundaries | No records; Offline (edits need network) | Ranges must be consistent (e.g. end Ayat ≤ Ayat count) | Arabic names in the Quranic font; never auto-transliterated |

## Related API and data model

- **Modules** ([ARCHITECTURE.md §18](../../ARCHITECTURE.md)): `quran-ref`, `packages/domain/quantity`
- Tables and services are described in the feature context above and in [ARCHITECTURE.md](../../ARCHITECTURE.md). Concrete API routes are defined at scaffolding (SRS §17 DEC-B54).

## Offline and sync behavior

Nothing specific to this story in the source documents.

## Related E2E test scenarios

**Completion gate:** this spec is complete only when `npm run e2e:gate -- US-024` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](../../../e2e/README.md)).

**API (Playwright):**

- [e2e/api/f06-quran-portions.spec.ts](../../../e2e/api/f06-quran-portions.spec.ts) — F06-AC1 (US-024) Admin Surah and Para boundary edits are saved per madrasa and audited
- [e2e/api/f06-quran-portions.spec.ts](../../../e2e/api/f06-quran-portions.spec.ts) — F06-AC2 (US-024) a Teacher cannot edit Quran metadata
- [e2e/api/f06-quran-portions.spec.ts](../../../e2e/api/f06-quran-portions.spec.ts) — F06-AC3 (US-024) an Arabic Surah name is returned byte-identical in every locale
- [e2e/api/f06-quran-portions.spec.ts](../../../e2e/api/f06-quran-portions.spec.ts) — F06-AC4 (US-024) a Para boundary ending before it starts is rejected
- [e2e/api/f06-quran-portions.spec.ts](../../../e2e/api/f06-quran-portions.spec.ts) — F06-AC18 (US-024) a new madrasa starts with the reviewed Quran metadata seed
- [e2e/api/f06-quran-portions.spec.ts](../../../e2e/api/f06-quran-portions.spec.ts) — F06-AC19 (US-024) a metadata correction flags affected records and never changes them

**Mobile (Maestro):**

- [e2e/mobile/f06-quran-portions/extra-work-and-metadata.yaml](../../../e2e/mobile/f06-quran-portions/extra-work-and-metadata.yaml) — F06 Extra portion and metadata corrections
- [e2e/mobile/f06-quran-portions/quran-metadata.yaml](../../../e2e/mobile/f06-quran-portions/quran-metadata.yaml) — F06 metadata — Admin edits, Arabic preserved, boundary validation, no Teacher controls

**Unit (Vitest):**

- [packages/domain/quran-ref/range.test.ts](../../../packages/domain/quran-ref/range.test.ts) — F06-AC4 (US-024) a Para boundary whose end is before its start is rejected
- [packages/domain/quran-ref/range.test.ts](../../../packages/domain/quran-ref/range.test.ts) — F06-AC3 (US-024) an Arabic Surah name is kept byte-identical (no normalization or transliteration)

## Open decisions and blockers

Open questions from F06 that apply to this story, with their resolutions (decision review of 2026-10-30, SRS §17):

- [x] Initial data source and governance for Quran metadata (SRS §13 #3). Can the app ship a reviewed seed? **Resolved:** Yes, a reviewed seed plus audited Admin edits (DEC-B31, FR-SAB-007).
- [x] How are ranges reviewed when the Admin changes metadata that existing records use? **Resolved:** Records keep their ranges; invalid ones are listed for Admin review (DEC-B32, FR-SAB-007).

## Traceability

- **Story:** US-024 → SPEC-US-024 (this file)
- **Detailed criteria:** F06-AC1, F06-AC2, F06-AC3, F06-AC4, F06-AC18, F06-AC19
- **Requirements:** FR-SAB-005, FR-I18N-006, NFR-MNT-003, FR-SAB-007
- **SRS acceptance tests:** None
- **Business rules:** SRS §9 #15
- **Design:** design.md §13; **Architecture:** ARCHITECTURE.md §18 epic 6
- **Previous location:** `docs/specs/F06-quran-portions-metadata.md`

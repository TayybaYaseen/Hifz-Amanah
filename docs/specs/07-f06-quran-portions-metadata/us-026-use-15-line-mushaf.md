# SPEC-US-026 · Use 15-line Mushaf

| | |
|---|---|
| **Spec ID** | SPEC-US-026 |
| **User story** | US-026 |
| **Feature** | [F06 · Quran portions and metadata](README.md) |
| **Epic** | EPIC 6 — Quran Portion and Metadata ([user-stories.md](../../user-stories.md)) |
| **Status** | draft |
| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |
| **Split from** | `docs/specs/F06-quran-portions-metadata.md` on 2026-10-30 |

## User story

**US-026 — Use 15-line Mushaf**

As a Teacher, I want line quantities to follow the standard 15-line Mushaf supported by the MVP.

Spec wording (from F06):

- **US-026:** As a Teacher, I want line quantities to follow the standard 15-line Mushaf, so that line counts mean the same thing for everyone.

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

- **Functional:** FR-SAB-006, FR-QTY-002, FR-QTY-005, FR-QTY-009
- **Non-functional:** Not applicable
- **SRS acceptance tests cited:** AC-QTY-02

Feature requirement set (from F06; additions of 2026-10-30 at the end): FR-SAB-001/002/005/006, FR-QTY-001…006, FR-I18N-006, NFR-MNT-003, FR-SAB-007, FR-QTY-009

## Acceptance criteria

### Story acceptance criteria

Verbatim from [user-stories.md](../../user-stories.md).

1. The selected reference data and quantity are stored using canonical values independent of interface language.
2. Rubu = 1/4, Half = 1/2, Salasah = 3/4, and Complete = 1 Para; incompatible units are not summed.
3. MVP line-based portions follow the standard 15-line Mushaf and Admin-maintained Quran metadata.

### Detailed acceptance criteria

From the F06 feature spec. The original IDs are kept because tests cite them. Criteria marked *Revised* or *Added* come from the decision review of 2026-10-30 (SRS §17).

- **F06-AC8** — **(US-026) Given** a portion measured in lines, **when** it is saved, **then** the unit is `LINES` with a whole number, counted on the standard 15-line Mushaf.
- **F06-AC9** — **(US-026) Given** 10 lines assigned and 6 lines completed, **when** the remaining quantity is calculated, **then** it is 4 lines (AC-QTY-02).
- **F06-AC17** — **(US-026) Given** a Lines, Ayat, or Pages quantity, **when** 2.5 is entered, **then** it is rejected; whole numbers are accepted. *(Added 2026-10-30, DEC-B26.)*

## Business rules

From SRS §9 (verbatim):

- **BR-4:** Quantity must always include its unit.

## Validation rules

Stated in these criteria: F06-AC17.

## Edge cases and error handling

No F06 edge case is specific to this story. See the [feature edge cases](README.md#edge-cases).

**Out of scope for the whole feature** (verbatim from F06):

- Mushaf editions other than the standard 15-line edition.
- Any conversion between lines, Ayat, pages, and Para fractions.
- Importing metadata from an external provider.
- Showing Quran text or audio.

## Dependencies

- **Feature F06 depends on:** F02 (from the spec index)
- **Features referenced by this story's criteria and edge cases:** None
- **Other stories referenced:** None
- **Other stories in F06:** [US-024](us-024-maintain-quran-metadata.md), [US-025](us-025-select-para-and-ayat-range.md), [US-027](us-027-select-portion-quantities.md)

## Related screens and UI

- **Feature flow** (from F06): Settings → Quran metadata (design gap); Quantity field and range fields in Daily Entry ([design.md §4.7, §5.3](../../design.md))

[design.md §13](../../design.md) story-to-screen map (verbatim):

| Story | Screen (this document) | Key interaction | Required states beyond standard | Validation shown | Accessibility / localization specifics |
|---|---|---|---|---|---|
| US-025, US-026, US-027 | §5.3 Quantity field; §4.7 range fields | Para and optional Surah/Ayat range; unit picker and value; remaining shown only for compatible units | — | Range validated against Admin metadata; unit change asks or resets; completed > assigned error on the field | Unit always visible; tabular numerals |

## Related API and data model

- **Modules** ([ARCHITECTURE.md §18](../../ARCHITECTURE.md)): `quran-ref`, `packages/domain/quantity`
- Tables and services are described in the feature context above and in [ARCHITECTURE.md](../../ARCHITECTURE.md). Concrete API routes are defined at scaffolding (SRS §17 DEC-B54).

## Offline and sync behavior

Nothing specific to this story in the source documents.

## Related E2E test scenarios

**Completion gate:** this spec is complete only when `npm run e2e:gate -- US-026` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](../../../e2e/README.md)).

**API (Playwright):**

- [e2e/api/f06-quran-portions.spec.ts](../../../e2e/api/f06-quran-portions.spec.ts) — F06-AC8 (US-026) line quantities are whole LINES
- [e2e/api/f06-quran-portions.spec.ts](../../../e2e/api/f06-quran-portions.spec.ts) — F06-AC9 (US-026) 10 lines assigned and 6 completed leave 4 lines (AC-QTY-02)
- [e2e/api/f06-quran-portions.spec.ts](../../../e2e/api/f06-quran-portions.spec.ts) — F06-AC17 (US-026) Lines, Ayat, and Pages are whole numbers only

**Mobile (Maestro):**

- [e2e/mobile/f06-quran-portions/ranges-and-quantities.yaml](../../../e2e/mobile/f06-quran-portions/ranges-and-quantities.yaml) — F06 portions — Para and Ayat validation, presets, remaining, units never mixed

**Unit (Vitest):**

- [packages/domain/quantity/quantity.test.ts](../../../packages/domain/quantity/quantity.test.ts) — F06-AC8 (US-026) LINES quantities are whole numbers
- [packages/domain/quantity/quantity.test.ts](../../../packages/domain/quantity/quantity.test.ts) — F06-AC9 (US-026) 10 lines assigned, 6 completed → 4 lines remaining (AC-QTY-02)
- [packages/domain/quantity/quantity.test.ts](../../../packages/domain/quantity/quantity.test.ts) — F06-AC17 (US-026) Lines, Ayat, and Pages are whole numbers only

## Open decisions and blockers

None specific to this story. See the [feature open questions](README.md#open-questions).

## Traceability

- **Story:** US-026 → SPEC-US-026 (this file)
- **Detailed criteria:** F06-AC8, F06-AC9, F06-AC17
- **Requirements:** FR-SAB-006, FR-QTY-002, FR-QTY-005, FR-QTY-009
- **SRS acceptance tests:** AC-QTY-02
- **Business rules:** SRS §9 #4
- **Design:** design.md §13; **Architecture:** ARCHITECTURE.md §18 epic 6
- **Previous location:** `docs/specs/F06-quran-portions-metadata.md`

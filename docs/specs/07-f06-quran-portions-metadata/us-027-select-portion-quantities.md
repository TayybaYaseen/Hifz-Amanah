# SPEC-US-027 · Select portion quantities

| | |
|---|---|
| **Spec ID** | SPEC-US-027 |
| **User story** | US-027 |
| **Feature** | [F06 · Quran portions and metadata](README.md) |
| **Epic** | EPIC 6 — Quran Portion and Metadata ([user-stories.md](../../user-stories.md)) |
| **Status** | draft |
| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |
| **Split from** | `docs/specs/F06-quran-portions-metadata.md` on 2026-10-30 |

## User story

**US-027 — Select portion quantities**

As a Teacher, I want to select Rubu, Half, Salasah, or Complete quantities.

Spec wording (from F06):

- **US-027:** As a Teacher, I want to choose Rubu, Half, Salasah, or Complete quantities, so that common Para fractions take one tap.

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

- **Functional:** FR-QTY-001, FR-QTY-002, FR-QTY-003, FR-QTY-004, FR-QTY-005, FR-QTY-006
- **Non-functional:** Not applicable
- **SRS acceptance tests cited:** AC-QTY-01, AC-QTY-03, AC-QTY-04, AC-QTY-05

Feature requirement set (from F06; additions of 2026-10-30 at the end): FR-SAB-001/002/005/006, FR-QTY-001…006, FR-I18N-006, NFR-MNT-003, FR-SAB-007, FR-QTY-009

## Acceptance criteria

### Story acceptance criteria

Verbatim from [user-stories.md](../../user-stories.md).

1. The action is available only to an authorized role in the active madrasa/workspace.
2. The system validates inputs and displays clear success, empty, and error states.
3. Changes are persisted and reflected in dependent views without losing historical records.

### Detailed acceptance criteria

From the F06 feature spec. The original IDs are kept because tests cite them. Criteria marked *Revised* or *Added* come from the decision review of 2026-10-30 (SRS §17).

- **F06-AC10** — **(US-027) Given** a Teacher choosing Salasah, **when** the portion is saved, **then** it is stored as 3/4 Para and displayed as "Salasah (3/4 Para)" (AC-QTY-01).
- **F06-AC11** — **(US-027) Given** Rubu, Half, or Complete, **when** saved, **then** each is stored exactly as 1/4, 1/2, or 1 Para.
- **F06-AC12** — **(US-027) Given** 3/4 Para assigned and 1/2 Para completed for the same portion, **when** the remaining quantity is calculated, **then** it is 1/4 Para (AC-QTY-03).
- **F06-AC13** — **(US-027) Given** one portion in lines and another in Para fractions, **when** a total is requested, **then** they are shown as two separate totals and never added together (AC-QTY-04).
- **F06-AC14** — **(US-027) Given** a completed quantity larger than the assigned quantity, **when** the Teacher saves, **then** the completed field shows an error (AC-QTY-05).
- **F06-AC15** — **(US-027) Given** a Teacher who changes the unit after typing a value, **when** the unit changes, **then** the app asks whether to keep or clear the value and never silently reinterprets the number.
- **F06-AC16** — **(US-027) Given** 1/2 Para assigned and 3/4 Para recited, **when** the Teacher records completed 1/2 and adds an Extra portion of 1/4, **then** both portions are saved with completed ≤ assigned, and reports show the 1/4 as extra work. Entering completed 3/4 on the original portion is refused. *(Added 2026-10-30, DEC-B23.)*

## Business rules

From SRS §9 (verbatim):

- **BR-3:** Salasah means exactly three-quarters (3/4) of a Para.
- **BR-4:** Quantity must always include its unit.
- **BR-5:** Remaining quantity is calculated only for compatible units and the same portion.

## Validation rules

Stated in these criteria: F06-AC14, F06-AC16.

## Edge cases and error handling

Rows from the F06 edge-case table that apply to this story (verbatim):

| Situation | What should happen |
|---|---|
| A quantity is entered with decimals (0.75) | Not accepted. Para amounts are chosen from the fraction presets |

**Out of scope for the whole feature** (verbatim from F06):

- Mushaf editions other than the standard 15-line edition.
- Any conversion between lines, Ayat, pages, and Para fractions.
- Importing metadata from an external provider.
- Showing Quran text or audio.

## Dependencies

- **Feature F06 depends on:** F02 (from the spec index)
- **Features referenced by this story's criteria and edge cases:** None
- **Other stories referenced:** None
- **Other stories in F06:** [US-024](us-024-maintain-quran-metadata.md), [US-025](us-025-select-para-and-ayat-range.md), [US-026](us-026-use-15-line-mushaf.md)

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

**Completion gate:** this spec is complete only when `npm run e2e:gate -- US-027` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](../../../e2e/README.md)).

**API (Playwright):**

- [e2e/api/f06-quran-portions.spec.ts](../../../e2e/api/f06-quran-portions.spec.ts) — F06-AC10 (US-027) Salasah is stored as 3/4 Para (AC-QTY-01)
- [e2e/api/f06-quran-portions.spec.ts](../../../e2e/api/f06-quran-portions.spec.ts) — F06-AC11 (US-027) Rubu, Half, and Complete are stored exactly
- [e2e/api/f06-quran-portions.spec.ts](../../../e2e/api/f06-quran-portions.spec.ts) — F06-AC12 (US-027) 3/4 Para assigned and 1/2 completed leave 1/4 Para (AC-QTY-03)
- [e2e/api/f06-quran-portions.spec.ts](../../../e2e/api/f06-quran-portions.spec.ts) — F06-AC13 (US-027) LINES and PARA totals are never combined (AC-QTY-04)
- [e2e/api/f06-quran-portions.spec.ts](../../../e2e/api/f06-quran-portions.spec.ts) — F06-AC14 (US-027) completed greater than assigned is rejected (AC-QTY-05)
- [e2e/api/f06-quran-portions.spec.ts](../../../e2e/api/f06-quran-portions.spec.ts) — F06-AC16 (US-027) extra work is a separate Extra portion; completed never exceeds assigned

**Mobile (Maestro):**

- [e2e/mobile/f06-quran-portions/extra-work-and-metadata.yaml](../../../e2e/mobile/f06-quran-portions/extra-work-and-metadata.yaml) — F06 Extra portion and metadata corrections
- [e2e/mobile/f06-quran-portions/ranges-and-quantities.yaml](../../../e2e/mobile/f06-quran-portions/ranges-and-quantities.yaml) — F06 portions — Para and Ayat validation, presets, remaining, units never mixed

**Unit (Vitest):**

- [packages/domain/quantity/quantity.test.ts](../../../packages/domain/quantity/quantity.test.ts) — F06-AC10 (US-027) Salasah is stored as 3/4 Para and displayed as "Salasah (3/4 Para)" (AC-QTY-01)
- [packages/domain/quantity/quantity.test.ts](../../../packages/domain/quantity/quantity.test.ts) — F06-AC11 (US-027) Rubu, Half, and Complete are stored exactly as 1/4, 1/2, and 1 Para
- [packages/domain/quantity/quantity.test.ts](../../../packages/domain/quantity/quantity.test.ts) — F06-AC12 (US-027) 3/4 Para assigned, 1/2 completed → 1/4 Para remaining (AC-QTY-03)
- [packages/domain/quantity/quantity.test.ts](../../../packages/domain/quantity/quantity.test.ts) — F06-AC14 (US-027) completed greater than assigned is rejected (AC-QTY-05)
- [packages/domain/quantity/quantity.test.ts](../../../packages/domain/quantity/quantity.test.ts) — F06-AC13 (US-027) LINES and PARA totals are returned separately and never added (AC-QTY-04)
- [packages/domain/quantity/quantity.test.ts](../../../packages/domain/quantity/quantity.test.ts) — F06-AC16 (US-027) extra work is a separate Extra portion; completed never exceeds assigned

## Open decisions and blockers

Open questions from F06 that apply to this story, with their resolutions (decision review of 2026-10-30, SRS §17):

- [x] D6: extra work beyond the assigned quantity. **Resolved:** A separate Extra portion (DEC-B23, FR-QTY-006).
- [x] Do `PAGES` and `AYAT` quantities need fraction support, or whole numbers only? **Resolved:** Whole numbers only, also for Lines (DEC-B26, FR-QTY-009).

## Traceability

- **Story:** US-027 → SPEC-US-027 (this file)
- **Detailed criteria:** F06-AC10, F06-AC11, F06-AC12, F06-AC13, F06-AC14, F06-AC15, F06-AC16
- **Requirements:** FR-QTY-001, FR-QTY-002, FR-QTY-003, FR-QTY-004, FR-QTY-005, FR-QTY-006
- **SRS acceptance tests:** AC-QTY-01, AC-QTY-03, AC-QTY-04, AC-QTY-05
- **Business rules:** SRS §9 #3, SRS §9 #4, SRS §9 #5
- **Design:** design.md §13; **Architecture:** ARCHITECTURE.md §18 epic 6
- **Previous location:** `docs/specs/F06-quran-portions-metadata.md`

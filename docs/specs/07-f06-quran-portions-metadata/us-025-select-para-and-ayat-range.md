# SPEC-US-025 · Select Para and Ayat range

| | |
|---|---|
| **Spec ID** | SPEC-US-025 |
| **User story** | US-025 |
| **Feature** | [F06 · Quran portions and metadata](README.md) |
| **Epic** | EPIC 6 — Quran Portion and Metadata ([user-stories.md](../../user-stories.md)) |
| **Status** | draft |
| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |
| **Split from** | `docs/specs/F06-quran-portions-metadata.md` on 2026-10-30 |

## User story

**US-025 — Select Para and Ayat range**

As a Teacher, I want to specify Para and optional Surah/Ayat start-end ranges.

Spec wording (from F06):

- **US-025:** As a Teacher, I want to specify a Para and an optional Surah/Ayat start–end range, so that the exact portion is recorded.

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

- **Functional:** FR-SAB-001, FR-SAB-002
- **Non-functional:** Not applicable
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

- **F06-AC5** — **(US-025) Given** a Para between 1 and 30, **when** the Teacher saves a portion, **then** it is accepted. Para 0 or Para 31 is rejected.
- **F06-AC6** — **(US-025) Given** a Surah with 7 Ayat, **when** the Teacher enters Ayat 3 to 9 for it, **then** the field shows an error that names the maximum Ayat.
- **F06-AC7** — **(US-025) Given** a range whose end Ayat is before its start Ayat in the same Surah, **when** the Teacher saves, **then** the range field shows an error.

## Business rules

From SRS §9 (verbatim):

- **BR-15:** Quranic Arabic must remain intact.

## Validation rules

Stated in these criteria: F06-AC5, F06-AC6, F06-AC7.

## Edge cases and error handling

Rows from the F06 edge-case table that apply to this story (verbatim):

| Situation | What should happen |
|---|---|
| A range spans two Surahs | Allowed when the start and end Surah/Ayat are both valid and in order |
| The Admin has not yet entered any metadata | Daily Entry still accepts a Para number; Surah/Ayat pickers show "No Quran reference data yet — ask your Admin" |
| Mixed Arabic and digit ranges in the RTL Urdu interface | Use bidi isolation so "البقرة 2:255–260" reads correctly |

**Out of scope for the whole feature** (verbatim from F06):

- Mushaf editions other than the standard 15-line edition.
- Any conversion between lines, Ayat, pages, and Para fractions.
- Importing metadata from an external provider.
- Showing Quran text or audio.

## Dependencies

- **Feature F06 depends on:** F02 (from the spec index)
- **Features referenced by this story's criteria and edge cases:** None
- **Other stories referenced:** None
- **Other stories in F06:** [US-024](us-024-maintain-quran-metadata.md), [US-026](us-026-use-15-line-mushaf.md), [US-027](us-027-select-portion-quantities.md)

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

**Completion gate:** this spec is complete only when `npm run e2e:gate -- US-025` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](../../../e2e/README.md)).

**API (Playwright):**

- [e2e/api/f06-quran-portions.spec.ts](../../../e2e/api/f06-quran-portions.spec.ts) — F06-AC5 (US-025) Para 1–30 is accepted; 0 and 31 are rejected
- [e2e/api/f06-quran-portions.spec.ts](../../../e2e/api/f06-quran-portions.spec.ts) — F06-AC6 (US-025) an Ayat past the Surah end is rejected naming the maximum
- [e2e/api/f06-quran-portions.spec.ts](../../../e2e/api/f06-quran-portions.spec.ts) — F06-AC7 (US-025) an end Ayat before the start Ayat is rejected

**Mobile (Maestro):**

- [e2e/mobile/f06-quran-portions/ranges-and-quantities.yaml](../../../e2e/mobile/f06-quran-portions/ranges-and-quantities.yaml) — F06 portions — Para and Ayat validation, presets, remaining, units never mixed

**Unit (Vitest):**

- [packages/domain/quran-ref/range.test.ts](../../../packages/domain/quran-ref/range.test.ts) — F06-AC5 (US-025) Para 1–30 is accepted; Para 0 and Para 31 are rejected
- [packages/domain/quran-ref/range.test.ts](../../../packages/domain/quran-ref/range.test.ts) — F06-AC6 (US-025) Ayat 3–9 in a 7-Ayat Surah is rejected with an error naming the maximum Ayat
- [packages/domain/quran-ref/range.test.ts](../../../packages/domain/quran-ref/range.test.ts) — F06-AC7 (US-025) an end Ayat before the start Ayat is rejected

## Open decisions and blockers

None specific to this story. See the [feature open questions](README.md#open-questions).

## Traceability

- **Story:** US-025 → SPEC-US-025 (this file)
- **Detailed criteria:** F06-AC5, F06-AC6, F06-AC7
- **Requirements:** FR-SAB-001, FR-SAB-002
- **SRS acceptance tests:** None
- **Business rules:** SRS §9 #15
- **Design:** design.md §13; **Architecture:** ARCHITECTURE.md §18 epic 6
- **Previous location:** `docs/specs/F06-quran-portions-metadata.md`

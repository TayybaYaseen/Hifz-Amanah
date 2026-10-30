# SPEC-US-028 · Record mistake categories

| | |
|---|---|
| **Spec ID** | SPEC-US-028 |
| **User story** | US-028 |
| **Feature** | [F07 · Mistakes and quality](README.md) |
| **Epic** | EPIC 7 — Mistakes and Quality ([user-stories.md](../../user-stories.md)) |
| **Status** | draft |
| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |
| **Split from** | `docs/specs/F07-mistakes-quality.md` on 2026-10-30 |

## User story

**US-028 — Record mistake categories**

As a Teacher, I want to record Harkaat, Tajweed, Lafzi, Ayat bhoolna, Tarteeb, and Waqf/Ibtida mistakes.

Spec wording (from F07):

- **US-028:** As a Teacher, I want to record Harkaat, Tajweed, Lafzi, Ayat bhoolna, Tarteeb, and Waqf/Ibtida mistakes, so that I can see what kind of help a student needs.

**Feature context** (shared by every story in F07, copied from the feature spec):

> For each attempt, the Teacher records what went wrong and, if they choose, how well the student recited. These are three separate things:
> - **Mistakes:** a category, a severity, and a repeated flag.
> - **Quality score:** optional, from 1 to 5. Lower is better.
> - **Overall performance label:** one per daily record.
>
> None of them is derived from another.
>
> **Approved Quality Rating Scale (SRS FR-ATT-009):**
>
> | Score | English | Urdu | Roman Urdu |
> |---|---|---|---|
> | 1 | Excellent | ممتاز | Mumtaz |
> | 2 | Good | اچھا | Achha |
> | 3 | Average | اوسط | Ausat |
> | 4 | Needs Improvement | مزید محنت کی ضرورت | Mazeed mehnat ki zaroorat |
> | 5 | Weak | کمزور | Kamzor |
>
> There is no code yet. This feature builds:
> - the `attempt_mistakes` table
> - `portion_attempts.quality` and `daily_records.overall_label` ([ARCHITECTURE.md §6.3](../../ARCHITECTURE.md))
> - quality averaging in `packages/domain`

## Related functional requirements

Requirements this story covers. SRS.md has no story-to-requirement table, so this list is derived from the requirement text and the criteria below.

- **Functional:** FR-ATT-010, FR-ATT-011, FR-ATT-012
- **Non-functional:** Not applicable
- **SRS acceptance tests cited:** None

Feature requirement set (from F07; additions of 2026-10-30 at the end): FR-ATT-008/009/010, FR-RPT-004, FR-AI-004, FR-ATT-011/012

## Acceptance criteria

### Story acceptance criteria

Verbatim from [user-stories.md](../../user-stories.md).

1. The Teacher can record one or more mistakes on a portion attempt, each with exactly one category: Harkaat, Tajweed, Lafzi, Ayat bhoolna, Tarteeb, or Waqf/Ibtida.
2. Categories are stored as language-neutral canonical values and shown in the selected interface language.
3. Mistakes stay attached to their portion attempt and appear in weekly/monthly mistake counts by category.

### Detailed acceptance criteria

From the F07 feature spec. The original IDs are kept because tests cite them. Criteria marked *Revised* or *Added* come from the decision review of 2026-10-30 (SRS §17).

- **F07-AC1** — **(US-028) Given** a portion attempt, **when** the Teacher adds two mistakes (Tajweed and Lafzi), **then** both are stored on that attempt, each with exactly one category.
- **F07-AC2** — **(US-028) Given** a mistake saved in the Urdu interface, **when** it is viewed in English, **then** the category shows its English label, and the stored value is the same canonical value (`TAJWEED`).
- **F07-AC3** — **(US-028) Given** mistakes recorded during a week, **when** the weekly report is built, **then** it shows a count per category for that week.
- **F07-AC14** — **(US-028) Given** a portion attempt, **when** the Teacher chooses "No mistakes", **then** a mistake count of 0 is stored. An attempt with no mistakes entered and no "No mistakes" choice is shown and counted as "Not recorded". *(Added 2026-10-30, DEC-B27.)*
- **F07-AC15** — **(US-028) Given** a mistake with a note, **when** the Teacher leaves its visibility unchanged, **then** the note is private to staff and is absent from every Student and Parent output. When the Teacher marks it visible, it is shown to them. *(Added 2026-10-30, DEC-B28.)*

## Business rules

From SRS §9 (verbatim):

- **BR-17:** Missing data is not the same as zero performance.

## Validation rules

No validation rule beyond the criteria above.

## Edge cases and error handling

Rows from the F07 edge-case table that apply to this story (verbatim):

| Situation | What should happen |
|---|---|
| No mistakes are recorded | "Not recorded", not "0 mistakes", unless the Teacher explicitly marks "No mistakes" (see open question) |
| An imported attempt has `MistakeCount = 3` | Shown as "3 uncategorized mistakes", separate from the category counts |

**Out of scope for the whole feature** (verbatim from F07):

- Automatic or AI-assigned quality scores.
- Any mapping between the overall label and the quality score.
- Recording where in the Ayat a mistake happened.
- Quality or mistakes in Bulk Entry.
- Splitting an imported Excel `MistakeCount` into categories (it stays uncategorized, F14).

## Dependencies

- **Feature F07 depends on:** F05 (from the spec index)
- **Features referenced by this story's criteria and edge cases:** None
- **Other stories referenced:** None
- **Other stories in F07:** [US-029](us-029-set-mistake-severity.md), [US-030](us-030-flag-repeated-mistakes.md), [US-031](us-031-rate-quality-1-5.md), [US-032](us-032-set-overall-performance-label.md)

## Related screens and UI

- **Feature flow** (from F07): Portion card performance area and overall performance label ([design.md §4.7, §5.4](../../design.md))

[design.md §13](../../design.md) story-to-screen map (verbatim):

| Story | Screen (this document) | Key interaction | Required states beyond standard | Validation shown | Accessibility / localization specifics |
|---|---|---|---|---|---|
| US-028, US-029, US-030 | §4.7 portion fields; §5.4 Performance | Add mistake: category, Minor/Major, Repeated toggle | — | Category required per mistake | Category and severity as text labels; not shown in Bulk Entry |

## Related API and data model

- **Modules** ([ARCHITECTURE.md §18](../../ARCHITECTURE.md)): `hifz`
- Tables and services are described in the feature context above and in [ARCHITECTURE.md](../../ARCHITECTURE.md). Concrete API routes are defined at scaffolding (SRS §17 DEC-B54).

## Offline and sync behavior

Nothing specific to this story in the source documents.

## Related E2E test scenarios

**Completion gate:** this spec is complete only when `npm run e2e:gate -- US-028` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](../../../e2e/README.md)).

**API (Playwright):**

- [e2e/api/f07-quality.spec.ts](../../../e2e/api/f07-quality.spec.ts) — F07-AC1 (US-028) two mistakes are stored on the attempt, one category each
- [e2e/api/f07-quality.spec.ts](../../../e2e/api/f07-quality.spec.ts) — F07-AC2 (US-028) a mistake saved in Urdu is the same canonical value
- [e2e/api/f07-quality.spec.ts](../../../e2e/api/f07-quality.spec.ts) — F07-AC3 (US-028) the weekly report counts mistakes per category
- [e2e/api/f07-quality.spec.ts](../../../e2e/api/f07-quality.spec.ts) — F07-AC14 (US-028) "No mistakes" stores 0; an empty list stays Not recorded
- [e2e/api/f07-quality.spec.ts](../../../e2e/api/f07-quality.spec.ts) — F07-AC15 (US-028) mistake notes are private by default

**Mobile (Maestro):**

- [e2e/mobile/f07-quality/mistakes.yaml](../../../e2e/mobile/f07-quality/mistakes.yaml) — F07 mistakes — categories, severity, repeated flag, weekly counts
- [e2e/mobile/f07-quality/no-mistakes.yaml](../../../e2e/mobile/f07-quality/no-mistakes.yaml) — F07 explicit No mistakes

**Unit (Vitest):**

- [packages/domain/mistakes/mistakes.test.ts](../../../packages/domain/mistakes/mistakes.test.ts) — F07-AC1 (US-028) each mistake has exactly one category
- [packages/domain/mistakes/mistakes.test.ts](../../../packages/domain/mistakes/mistakes.test.ts) — F07-AC2 (US-028) the stored category is the canonical value (e.g. TAJWEED) whatever the UI language
- [packages/domain/mistakes/mistakes.test.ts](../../../packages/domain/mistakes/mistakes.test.ts) — F07-AC3 (US-028) weekly counts are grouped per category
- [packages/domain/reports/build-report.test.ts](../../../packages/domain/reports/build-report.test.ts) — F07-AC14 (US-028) "No mistakes" stores 0; an empty list stays Not recorded

## Open decisions and blockers

Open questions from F07 that apply to this story, with their resolutions (decision review of 2026-10-30, SRS §17):

- [x] Should the Teacher be able to record "No mistakes" explicitly, to tell it apart from "not recorded"? **Resolved:** Yes, it stores 0 (DEC-B27, FR-ATT-011).
- [x] Can a mistake have a free-text note, and is that note internal by default? **Resolved:** Yes, internal by default (DEC-B28, FR-ATT-012).

## Traceability

- **Story:** US-028 → SPEC-US-028 (this file)
- **Detailed criteria:** F07-AC1, F07-AC2, F07-AC3, F07-AC14, F07-AC15
- **Requirements:** FR-ATT-010, FR-ATT-011, FR-ATT-012
- **SRS acceptance tests:** None
- **Business rules:** SRS §9 #17
- **Design:** design.md §13; **Architecture:** ARCHITECTURE.md §18 epic 7
- **Previous location:** `docs/specs/F07-mistakes-quality.md`

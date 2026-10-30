# SPEC-US-031 · Rate quality 1–5

| | |
|---|---|
| **Spec ID** | SPEC-US-031 |
| **User story** | US-031 |
| **Feature** | [F07 · Mistakes and quality](README.md) |
| **Epic** | EPIC 7 — Mistakes and Quality ([user-stories.md](../../user-stories.md)) |
| **Status** | draft |
| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |
| **Split from** | `docs/specs/F07-mistakes-quality.md` on 2026-10-30 |

## User story

**US-031 — Rate quality 1–5**

As a Teacher, I want to optionally rate a portion from 1 to 5.

Spec wording (from F07):

- **US-031:** As a Teacher, I want to optionally rate a portion from 1 to 5, so that recitation quality can be tracked over time.

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

- **Functional:** FR-ATT-008, FR-ATT-009, FR-RPT-004, FR-AI-004, FR-QTY-008
- **Non-functional:** Not applicable
- **SRS acceptance tests cited:** None

Feature requirement set (from F07; additions of 2026-10-30 at the end): FR-ATT-008/009/010, FR-RPT-004, FR-AI-004, FR-ATT-011/012

## Acceptance criteria

### Story acceptance criteria

Verbatim from [user-stories.md](../../user-stories.md).

1. Each score is shown with its approved label in the selected language (SRS FR-ATT-009; lower is better): 1 Excellent (ممتاز, Mumtaz), 2 Good (اچھا, Achha), 3 Average (اوسط, Ausat), 4 Needs Improvement (مزید محنت کی ضرورت, Mazeed mehnat ki zaroorat), 5 Weak (کمزور, Kamzor). The same mapping is used on every screen, report, PDF, and chart.
2. Quality is optional and accepts only integer values 1–5; missing values remain null/unknown and are excluded from averages. An average shows the label of the nearest whole score, with .5 rounding up (e.g. 1.5 → 2 Good).
3. The numeric score is what is stored. It is set only by the Teacher, never assigned automatically or by AI, and is separate from the overall performance label.

### Detailed acceptance criteria

From the F07 feature spec. The original IDs are kept because tests cite them. Criteria marked *Revised* or *Added* come from the decision review of 2026-10-30 (SRS §17).

- **F07-AC6** — **(US-031) Given** the quality selector, **when** it opens, **then** it lists "1 · Excellent", "2 · Good", "3 · Average", "4 · Needs Improvement", and "5 · Weak" in that order, in the active language, with "Not assessed" selected.
- **F07-AC7** — **(US-031) Given** a portion saved without a quality score, **when** it is shown, **then** it reads "Not recorded" (never 0), and the stored value is NULL.
- **F07-AC8** — **(US-031) Given** quality scores 1, 2, 2 and one missing, **when** the average is calculated, **then** it is 1.7 from 3 ratings, shown as "1.7 · Good (3 ratings)".
- **F07-AC9** — **(US-031) Given** an average of exactly 1.5, **when** it is labelled, **then** the label is "Good" (a halfway value rounds up to the higher number).
- **F07-AC10** — **(US-031) Given** an attempt with status Absent, Not Assigned, or Pending, **when** the Teacher views it, **then** no quality score can be entered, and none is counted.
- **F07-AC11** — **(US-031) Given** any AI feature or automated process, **when** it runs, **then** it never sets or changes a quality score; only the Teacher's input writes it.

## Business rules

From SRS §9 (verbatim):

- **BR-17:** Missing data is not the same as zero performance.

## Validation rules

No validation rule beyond the criteria above.

## Edge cases and error handling

Rows from the F07 edge-case table that apply to this story (verbatim):

| Situation | What should happen |
|---|---|
| Every quality score in the period is missing | The average shows "Not recorded", with 0 ratings |
| The quality score is edited after a report was viewed | The report recalculates on next view (F09) |
| Quality labels are shown in the Urdu interface | "۱ · ممتاز", with digits and label in the correct direction |

**Out of scope for the whole feature** (verbatim from F07):

- Automatic or AI-assigned quality scores.
- Any mapping between the overall label and the quality score.
- Recording where in the Ayat a mistake happened.
- Quality or mistakes in Bulk Entry.
- Splitting an imported Excel `MistakeCount` into categories (it stays uncategorized, F14).

## Dependencies

- **Feature F07 depends on:** F05 (from the spec index)
- **Features referenced by this story's criteria and edge cases:** F09
- **Other stories referenced:** None
- **Other stories in F07:** [US-028](us-028-record-mistake-categories.md), [US-029](us-029-set-mistake-severity.md), [US-030](us-030-flag-repeated-mistakes.md), [US-032](us-032-set-overall-performance-label.md)

## Related screens and UI

- **Feature flow** (from F07): Portion card performance area and overall performance label ([design.md §4.7, §5.4](../../design.md))

[design.md §13](../../design.md) story-to-screen map (verbatim):

| Story | Screen (this document) | Key interaction | Required states beyond standard | Validation shown | Accessibility / localization specifics |
|---|---|---|---|---|---|
| US-031 | §4.7; §5.4 | Quality 1–5 single-select, default "Not assessed" | — | Out-of-range values impossible in the UI; blank saved as "Not recorded" | Each option shown as number + approved label in the active language (§4.7) |

## Related API and data model

- **Modules** ([ARCHITECTURE.md §18](../../ARCHITECTURE.md)): `hifz`
- Tables and services are described in the feature context above and in [ARCHITECTURE.md](../../ARCHITECTURE.md). Concrete API routes are defined at scaffolding (SRS §17 DEC-B54).

## Offline and sync behavior

Nothing specific to this story in the source documents.

## Related E2E test scenarios

**Completion gate:** this spec is complete only when `npm run e2e:gate -- US-031` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](../../../e2e/README.md)).

**API (Playwright):**

- [e2e/api/f07-quality.spec.ts](../../../e2e/api/f07-quality.spec.ts) — F07-AC7 (US-031) no quality is stored as NULL, never 0
- [e2e/api/f07-quality.spec.ts](../../../e2e/api/f07-quality.spec.ts) — F07-AC8 (US-031) scores 1, 2, 2 and one missing average 1.7 · Good (3 ratings)
- [e2e/api/f07-quality.spec.ts](../../../e2e/api/f07-quality.spec.ts) — F07-AC9 (US-031) an average of exactly 1.5 is labelled Good
- [e2e/api/f07-quality.spec.ts](../../../e2e/api/f07-quality.spec.ts) — F07-AC10 (US-031) Absent, Not Assigned, and Pending attempts reject quality
- [e2e/api/f07-quality.spec.ts](../../../e2e/api/f07-quality.spec.ts) — F07-AC11 (US-031) no automated process writes a quality score

**Mobile (Maestro):**

- [e2e/mobile/f07-quality/quality-and-overall-label.yaml](../../../e2e/mobile/f07-quality/quality-and-overall-label.yaml) — F07 quality — scale order, not recorded, averages, separate overall label

**Unit (Vitest):**

- [packages/domain/quality/quality.test.ts](../../../packages/domain/quality/quality.test.ts) — F07-AC6 (US-031) lists 1 · Excellent … 5 · Weak in order, with "Not assessed" as the default
- [packages/domain/quality/quality.test.ts](../../../packages/domain/quality/quality.test.ts) — F07-AC7 (US-031) a NULL score reads "Not recorded", never 0
- [packages/domain/quality/quality.test.ts](../../../packages/domain/quality/quality.test.ts) — F07-AC10 (US-031) Absent, Not Assigned, and Pending attempts accept and count no score
- [packages/domain/quality/quality.test.ts](../../../packages/domain/quality/quality.test.ts) — F07-AC8 (US-031) scores 1, 2, 2 and one NULL → 1.7 · Good (3 ratings)
- [packages/domain/quality/quality.test.ts](../../../packages/domain/quality/quality.test.ts) — F07-AC9 (US-031) an average of exactly 1.5 is labelled Good (.5 rounds up)

## Open decisions and blockers

None specific to this story. See the [feature open questions](README.md#open-questions).

## Traceability

- **Story:** US-031 → SPEC-US-031 (this file)
- **Detailed criteria:** F07-AC6, F07-AC7, F07-AC8, F07-AC9, F07-AC10, F07-AC11
- **Requirements:** FR-ATT-008, FR-ATT-009, FR-RPT-004, FR-AI-004, FR-QTY-008
- **SRS acceptance tests:** None
- **Business rules:** SRS §9 #17
- **Design:** design.md §13; **Architecture:** ARCHITECTURE.md §18 epic 7
- **Previous location:** `docs/specs/F07-mistakes-quality.md`

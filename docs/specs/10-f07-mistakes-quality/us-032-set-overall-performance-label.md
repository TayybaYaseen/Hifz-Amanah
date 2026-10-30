# SPEC-US-032 · Set overall performance label

| | |
|---|---|
| **Spec ID** | SPEC-US-032 |
| **User story** | US-032 |
| **Feature** | [F07 · Mistakes and quality](README.md) |
| **Epic** | EPIC 7 — Mistakes and Quality ([user-stories.md](../../user-stories.md)) |
| **Status** | draft |
| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |
| **Split from** | `docs/specs/F07-mistakes-quality.md` on 2026-10-30 |

## User story

**US-032 — Set overall performance label**

As a Teacher, I want to select Excellent, Good, Average, or Needs Improvement.

Spec wording (from F07):

- **US-032:** As a Teacher, I want to select Excellent, Good, Average, or Needs Improvement for the day, so that I can give one overall judgement.

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

- **Functional:** FR-ATT-009
- **Non-functional:** Not applicable
- **SRS acceptance tests cited:** None

Feature requirement set (from F07; additions of 2026-10-30 at the end): FR-ATT-008/009/010, FR-RPT-004, FR-AI-004, FR-ATT-011/012

## Acceptance criteria

### Story acceptance criteria

Verbatim from [user-stories.md](../../user-stories.md).

1. The supported mistake categories and Minor/Major severity are selectable; repeated is a separate flag.
2. Quality is optional and accepts only integer values 1–5; missing values remain null/unknown.
3. The four overall labels are available as a separate selection and are not derived from, or converted to, the numeric quality score.

### Detailed acceptance criteria

From the F07 feature spec. The original IDs are kept because tests cite them. Criteria marked *Revised* or *Added* come from the decision review of 2026-10-30 (SRS §17).

- **F07-AC12** — **(US-032) Given** a daily record, **when** the Teacher picks an overall performance label, **then** it is stored once for the record, separately from every portion's quality score.
- **F07-AC13** — **(US-032) Given** portions with quality scores, **when** the daily record is saved without an overall label, **then** the label stays empty; it is never filled in from the scores, and the scores are never filled in from the label.

## Business rules

No SRS §9 business rule is specific to this story. The rules it follows are stated in the criteria above.

## Validation rules

No validation rule beyond the criteria above.

## Edge cases and error handling

No F07 edge case is specific to this story. See the [feature edge cases](README.md#edge-cases).

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
- **Other stories in F07:** [US-028](us-028-record-mistake-categories.md), [US-029](us-029-set-mistake-severity.md), [US-030](us-030-flag-repeated-mistakes.md), [US-031](us-031-rate-quality-1-5.md)

## Related screens and UI

- **Feature flow** (from F07): Portion card performance area and overall performance label ([design.md §4.7, §5.4](../../design.md))

[design.md §13](../../design.md) story-to-screen map (verbatim):

| Story | Screen (this document) | Key interaction | Required states beyond standard | Validation shown | Accessibility / localization specifics |
|---|---|---|---|---|---|
| US-032 | §4.7 Overall performance label | Choose Excellent / Good / Average / Needs Improvement (optional) | — | — | Captioned "Overall performance"; never derived from or shown as the 1–5 quality rating |

## Related API and data model

- **Modules** ([ARCHITECTURE.md §18](../../ARCHITECTURE.md)): `hifz`
- Tables and services are described in the feature context above and in [ARCHITECTURE.md](../../ARCHITECTURE.md). Concrete API routes are defined at scaffolding (SRS §17 DEC-B54).

## Offline and sync behavior

Nothing specific to this story in the source documents.

## Related E2E test scenarios

**Completion gate:** this spec is complete only when `npm run e2e:gate -- US-032` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](../../../e2e/README.md)).

**API (Playwright):**

- [e2e/api/f07-quality.spec.ts](../../../e2e/api/f07-quality.spec.ts) — F07-AC12 (US-032) the overall label is stored once per record
- [e2e/api/f07-quality.spec.ts](../../../e2e/api/f07-quality.spec.ts) — F07-AC13 (US-032) the overall label and quality scores are never derived from each other

**Mobile (Maestro):**

- [e2e/mobile/f07-quality/quality-and-overall-label.yaml](../../../e2e/mobile/f07-quality/quality-and-overall-label.yaml) — F07 quality — scale order, not recorded, averages, separate overall label

**Unit (Vitest):**

- [packages/domain/quality/quality.test.ts](../../../packages/domain/quality/quality.test.ts) — F07-AC12 (US-032) the overall label is stored once per record, separate from portion scores
- [packages/domain/quality/quality.test.ts](../../../packages/domain/quality/quality.test.ts) — F07-AC13 (US-032) the label is never derived from scores, and scores are never derived from the label

## Open decisions and blockers

None specific to this story. See the [feature open questions](README.md#open-questions).

## Traceability

- **Story:** US-032 → SPEC-US-032 (this file)
- **Detailed criteria:** F07-AC12, F07-AC13
- **Requirements:** FR-ATT-009
- **SRS acceptance tests:** None
- **Business rules:** None
- **Design:** design.md §13; **Architecture:** ARCHITECTURE.md §18 epic 7
- **Previous location:** `docs/specs/F07-mistakes-quality.md`

# SPEC-US-023 · Record repeated attempts

| | |
|---|---|
| **Spec ID** | SPEC-US-023 |
| **User story** | US-023 |
| **Feature** | [F05 · Daily Hifz entry](README.md) |
| **Epic** | EPIC 5 — Daily Hifz Entry ([user-stories.md](../../user-stories.md)) |
| **Status** | draft |
| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |
| **Split from** | `docs/specs/F05-daily-hifz-entry.md` on 2026-10-30 |

## User story

**US-023 — Record repeated attempts**

As a Teacher, I want to preserve multiple attempts for a portion.

Spec wording (from F05):

- **US-023:** As a Teacher, I want to keep multiple attempts for a portion, so that a second try does not erase the first.

**Feature context** (shared by every story in F05, copied from the feature spec):

> This is the teacher's main daily task. They record what a student was given and what the student actually recited, separately for:
> - **Sabaq** (new memorization)
> - **Sabqi** (recent revision)
> - **Manzil** (older revision)
>
> Sabqi and Manzil can each hold several Paras, and each Para is tracked on its own. A portion can be recited more than once, and every attempt is kept.
>
> There is no code yet. This feature builds the `hifz` module: the `daily_records`, `lesson_portions`, and `portion_attempts` tables ([ARCHITECTURE.md §6.3, §9.1](../../ARCHITECTURE.md)). It relies on:
> - **F06** for quantities and Quran ranges
> - **F07** for mistakes and quality
> - **F08** for homework recalculation
> - **F12** for offline saving

## Related functional requirements

Requirements this story covers. SRS.md has no story-to-requirement table, so this list is derived from the requirement text and the criteria below.

- **Functional:** FR-ATT-003, FR-ATT-004, FR-ATT-005, FR-ATT-006, FR-DAY-009
- **Non-functional:** Not applicable
- **SRS acceptance tests cited:** AC-ATT-05

Feature requirement set (from F05; additions of 2026-10-30 at the end): FR-DAY-001…009, FR-SAB-001…004, FR-SBQ-001…004, FR-MNZ-001…004, FR-ATT-001…007, FR-QTY-007, FR-DAY-011

## Acceptance criteria

### Story acceptance criteria

Verbatim from [user-stories.md](../../user-stories.md).

1. The Teacher can select the student and report date and enter the applicable portion details.
2. Each portion retains its own quantity, status, mistake/quality information, and optional remarks.
3. Edits are auditable and update derived reports and unconfirmed homework suggestions without silently changing confirmed homework.

### Detailed acceptance criteria

From the F05 feature spec. The original IDs are kept because tests cite them. Criteria marked *Revised* or *Added* come from the decision review of 2026-10-30 (SRS §17).

- **F05-AC15** — **(US-023) Given** a portion with one attempt, **when** the Teacher adds a second attempt, **then** both attempts are stored with their own time, recorder, completed quantity, status, mistakes, and quality, and the first attempt is unchanged (AC-ATT-05).
- **F05-AC16** — **(US-023) Given** a portion with two attempts, **when** progress and reports are calculated, **then** the latest attempt gives the current status, the assigned quantity is counted once, and both attempts appear in the history.
- **F05-AC19** — **(US-023) Given** a daily record from 90 days ago, **when** an assigned Teacher corrects it, **then** the edit is accepted and audited, reports and draft homework recalculate, and confirmed homework is unchanged. *(Added 2026-10-30, DEC-B25.)*

## Business rules

From SRS §9 (verbatim):

- **BR-10:** Past homework and attempts remain in history.
- **BR-16:** Repeated attempts must not be double-counted as separate assigned portions in aggregate progress.

## Validation rules

No validation rule beyond the criteria above.

## Edge cases and error handling

Rows from the F05 edge-case table that apply to this story (verbatim):

| Situation | What should happen |
|---|---|
| The Teacher removes a portion that already has attempts | It needs a confirmation, and the action is audited. Attempt history is kept for audit |

**Out of scope for the whole feature** (verbatim from F05):

- Recording Hifz in Bulk Entry (F04 is attendance-only).
- Audio recording or automatic grading of recitation.
- AI filling in or scoring portions.
- Extra work on the same portion. It is recorded as a separate Extra portion instead (FR-QTY-006, F06).
- Homework creation and confirmation (F08).

## Dependencies

- **Feature F05 depends on:** F03, F06, F07, F12 (from the spec index)
- **Features referenced by this story's criteria and edge cases:** None
- **Other stories referenced:** None
- **Other stories in F05:** [US-018](us-018-create-individual-daily-report.md), [US-019](us-019-choose-daily-report-mode.md), [US-020](us-020-record-sabaq.md), [US-021](us-021-record-sabqi-portions.md), [US-022](us-022-record-manzil-portions.md)

## Related screens and UI

- **Feature flow** (from F05): Daily Entry — individual student ([design.md §4.7](../../design.md)); record detail and attempt history

[design.md §13](../../design.md) story-to-screen map (verbatim):

| Story | Screen (this document) | Key interaction | Required states beyond standard | Validation shown | Accessibility / localization specifics |
|---|---|---|---|---|---|
| US-023 | Record detail (§4.7 view/edit mode) | Add attempt; edit; View history | Saved locally; Conflict | Notice "Confirmed homework was not changed" with Revise homework | Current attempt marked by a text label |

## Related API and data model

- **Modules** ([ARCHITECTURE.md §18](../../ARCHITECTURE.md)): `hifz`, `sync`
- Tables and services are described in the feature context above and in [ARCHITECTURE.md](../../ARCHITECTURE.md). Concrete API routes are defined at scaffolding (SRS §17 DEC-B54).

## Offline and sync behavior

Nothing specific to this story in the source documents.

## Related E2E test scenarios

**Completion gate:** this spec is complete only when `npm run e2e:gate -- US-023` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](../../../e2e/README.md)).

**API (Playwright):**

- [e2e/api/f05-daily-entry.spec.ts](../../../e2e/api/f05-daily-entry.spec.ts) — F05-AC15 (US-023) a second attempt keeps the first unchanged (AC-ATT-05)
- [e2e/api/f05-daily-entry.spec.ts](../../../e2e/api/f05-daily-entry.spec.ts) — F05-AC16 (US-023) the latest attempt drives status and the assigned quantity counts once
- [e2e/api/f05-daily-entry.spec.ts](../../../e2e/api/f05-daily-entry.spec.ts) — F05-AC19 (US-023) old records can still be corrected, with audit and recalculation

**Mobile (Maestro):**

- [e2e/mobile/f05-daily-entry/attempts.yaml](../../../e2e/mobile/f05-daily-entry/attempts.yaml) — F05 attempts — second attempt keeps the first; history; late sync keeps the date

**Unit (Vitest):**

- [packages/domain/hifz/hifz.test.ts](../../../packages/domain/hifz/hifz.test.ts) — F05-AC15 (US-023) adding a second attempt keeps the first unchanged (AC-ATT-05)
- [packages/domain/hifz/hifz.test.ts](../../../packages/domain/hifz/hifz.test.ts) — F05-AC16 (US-023) the latest attempt gives the current status and the assigned quantity is counted once

## Open decisions and blockers

None specific to this story. See the [feature open questions](README.md#open-questions).

## Traceability

- **Story:** US-023 → SPEC-US-023 (this file)
- **Detailed criteria:** F05-AC15, F05-AC16, F05-AC19
- **Requirements:** FR-ATT-003, FR-ATT-004, FR-ATT-005, FR-ATT-006, FR-DAY-009
- **SRS acceptance tests:** AC-ATT-05
- **Business rules:** SRS §9 #10, SRS §9 #16
- **Design:** design.md §13; **Architecture:** ARCHITECTURE.md §18 epic 5
- **Previous location:** `docs/specs/F05-daily-hifz-entry.md`

# SPEC-US-021 · Record Sabqi portions

| | |
|---|---|
| **Spec ID** | SPEC-US-021 |
| **User story** | US-021 |
| **Feature** | [F05 · Daily Hifz entry](README.md) |
| **Epic** | EPIC 5 — Daily Hifz Entry ([user-stories.md](../../user-stories.md)) |
| **Status** | draft |
| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |
| **Split from** | `docs/specs/F05-daily-hifz-entry.md` on 2026-10-30 |

## User story

**US-021 — Record Sabqi portions**

As a Teacher, I want to record one or more Sabqi portions independently.

Spec wording (from F05):

- **US-021:** As a Teacher, I want to record one or more Sabqi portions independently, so that each revised Para has its own result.

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

- **Functional:** FR-SBQ-001, FR-SBQ-002, FR-SBQ-003, FR-SBQ-004, FR-DAY-004
- **Non-functional:** Not applicable
- **SRS acceptance tests cited:** None

Feature requirement set (from F05; additions of 2026-10-30 at the end): FR-DAY-001…009, FR-SAB-001…004, FR-SBQ-001…004, FR-MNZ-001…004, FR-ATT-001…007, FR-QTY-007, FR-DAY-011

## Acceptance criteria

### Story acceptance criteria

Verbatim from [user-stories.md](../../user-stories.md).

1. The Teacher can select the student and report date and enter the applicable portion details.
2. Each portion retains its own quantity, status, mistake/quality information, and optional remarks.
3. Edits are auditable and update derived reports and unconfirmed homework suggestions without silently changing confirmed homework.

### Detailed acceptance criteria

From the F05 feature spec. The original IDs are kept because tests cite them. Criteria marked *Revised* or *Added* come from the decision review of 2026-10-30 (SRS §17).

- **F05-AC11** — **(US-021) Given** Sabqi portions for Para 3 and Para 4, **when** Para 3 is marked Completed and Para 4 Partial, **then** each keeps its own status, and changing one never changes the other.
- **F05-AC12** — **(US-021) Given** a current Sabaq in Para 5, **when** the Teacher adds a Sabqi portion, **then** Para 5 may be offered as the default, but the Teacher can choose any other Para or several Paras.

## Business rules

From SRS §9 (verbatim):

- **BR-1:** Sabaq, Sabqi, and Manzil are independent sections.
- **BR-2:** Sabqi and Manzil can contain multiple independently tracked Para portions.

## Validation rules

No validation rule beyond the criteria above.

## Edge cases and error handling

No F05 edge case is specific to this story. See the [feature edge cases](README.md#edge-cases).

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
- **Other stories in F05:** [US-018](us-018-create-individual-daily-report.md), [US-019](us-019-choose-daily-report-mode.md), [US-020](us-020-record-sabaq.md), [US-022](us-022-record-manzil-portions.md), [US-023](us-023-record-repeated-attempts.md)

## Related screens and UI

- **Feature flow** (from F05): Daily Entry — individual student ([design.md §4.7](../../design.md)); record detail and attempt history

[design.md §13](../../design.md) story-to-screen map (verbatim):

| Story | Screen (this document) | Key interaction | Required states beyond standard | Validation shown | Accessibility / localization specifics |
|---|---|---|---|---|---|
| US-020, US-021, US-022 | §4.7 Step 3; §5.4 Portion card; §5.5 Status chip | Add portion per section; headers such as "Sabqi · Portion 2"; choose status per portion | — | Per-portion field errors | Section and portion number in the header text; status chip with icon and text |

## Related API and data model

- **Modules** ([ARCHITECTURE.md §18](../../ARCHITECTURE.md)): `hifz`, `sync`
- Tables and services are described in the feature context above and in [ARCHITECTURE.md](../../ARCHITECTURE.md). Concrete API routes are defined at scaffolding (SRS §17 DEC-B54).

## Offline and sync behavior

Nothing specific to this story in the source documents.

## Related E2E test scenarios

**Completion gate:** this spec is complete only when `npm run e2e:gate -- US-021` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](../../../e2e/README.md)).

**API (Playwright):**

- [e2e/api/f05-daily-entry.spec.ts](../../../e2e/api/f05-daily-entry.spec.ts) — F05-AC11 (US-021) Sabqi portions keep independent statuses

**Mobile (Maestro):**

- [e2e/mobile/f05-daily-entry/sections-and-portions.yaml](../../../e2e/mobile/f05-daily-entry/sections-and-portions.yaml) — F05 daily entry — Sabaq, two Sabqi, three Manzil with separate outcomes

**Unit (Vitest):**

- [packages/domain/hifz/hifz.test.ts](../../../packages/domain/hifz/hifz.test.ts) — F05-AC11 (US-021) changing one Sabqi portion never changes another
- [packages/domain/hifz/hifz.test.ts](../../../packages/domain/hifz/hifz.test.ts) — F05-AC12 (US-021) a new Sabqi portion defaults to the current Sabaq Para and may be changed

## Open decisions and blockers

None specific to this story. See the [feature open questions](README.md#open-questions).

## Traceability

- **Story:** US-021 → SPEC-US-021 (this file)
- **Detailed criteria:** F05-AC11, F05-AC12
- **Requirements:** FR-SBQ-001, FR-SBQ-002, FR-SBQ-003, FR-SBQ-004, FR-DAY-004
- **SRS acceptance tests:** None
- **Business rules:** SRS §9 #1, SRS §9 #2
- **Design:** design.md §13; **Architecture:** ARCHITECTURE.md §18 epic 5
- **Previous location:** `docs/specs/F05-daily-hifz-entry.md`

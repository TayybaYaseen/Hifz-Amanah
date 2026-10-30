# SPEC-US-019 · Choose daily report mode

| | |
|---|---|
| **Spec ID** | SPEC-US-019 |
| **User story** | US-019 |
| **Feature** | [F05 · Daily Hifz entry](README.md) |
| **Epic** | EPIC 5 — Daily Hifz Entry ([user-stories.md](../../user-stories.md)) |
| **Status** | draft |
| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |
| **Split from** | `docs/specs/F05-daily-hifz-entry.md` on 2026-10-30 |

## User story

**US-019 — Choose daily report mode**

As a Madrasa Admin, I want to choose one report per student/date or separate session reports.

Spec wording (from F05):

- **US-019:** As a Madrasa Admin, I want to choose one report per student/date or separate session reports, so that the app matches how our madrasa teaches.

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

- **Functional:** FR-DAY-008
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

- **F05-AC6** — **(US-019) Given** a madrasa in one-report-per-student/date mode, **when** a Teacher starts a second record for the same student and date, **then** the app warns and opens the existing record. No duplicate is created.
- **F05-AC7** — **(US-019) Given** a madrasa in multiple-session mode, **when** a Teacher creates a record, **then** a session label is required, and two records for the same student and date are allowed if their labels differ.
- **F05-AC8** — **(US-019) Given** multiple-session mode with some student/date having two sessions, **when** the Admin tries to switch to one-report mode, **then** the switch is blocked, with a message listing the conflicts.
- **F05-AC9** — **(US-019) Given** a Teacher, **when** they try to change the daily-report mode, **then** there is no control for it, and the API returns forbidden.

## Business rules

No SRS §9 business rule is specific to this story. The rules it follows are stated in the criteria above.

## Validation rules

Stated in these criteria: F05-AC7, F05-AC8, F05-AC9.

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
- **Other stories in F05:** [US-018](us-018-create-individual-daily-report.md), [US-020](us-020-record-sabaq.md), [US-021](us-021-record-sabqi-portions.md), [US-022](us-022-record-manzil-portions.md), [US-023](us-023-record-repeated-attempts.md)

## Related screens and UI

- **Feature flow** (from F05): Daily Entry — individual student ([design.md §4.7](../../design.md)); record detail and attempt history

[design.md §13](../../design.md) story-to-screen map (verbatim):

| Story | Screen (this document) | Key interaction | Required states beyond standard | Validation shown | Accessibility / localization specifics |
|---|---|---|---|---|---|
| US-018, US-019 | §4.7 Daily Entry — individual | Context (no future dates) → Attendance → Sabaq/Sabqi/Manzil cards (only for Present, Late, Half day; otherwise "Change to Late") → Save entry → next actions; session label only in multi-session mode | Offline; Saved locally; Synced only after acknowledgement | Error names the portion and field; duplicate-report warning per daily-report mode; input kept | Section cards mirror in RTL; Ayat ranges and Para numbers stay readable |

## Related API and data model

- **Modules** ([ARCHITECTURE.md §18](../../ARCHITECTURE.md)): `hifz`, `sync`
- Tables and services are described in the feature context above and in [ARCHITECTURE.md](../../ARCHITECTURE.md). Concrete API routes are defined at scaffolding (SRS §17 DEC-B54).

## Offline and sync behavior

Nothing specific to this story in the source documents.

## Related E2E test scenarios

**Completion gate:** this spec is complete only when `npm run e2e:gate -- US-019` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](../../../e2e/README.md)).

**API (Playwright):**

- [e2e/api/f05-daily-entry.spec.ts](../../../e2e/api/f05-daily-entry.spec.ts) — F05-AC6 (US-019) SINGLE mode refuses a second record for the same student and date
- [e2e/api/f05-daily-entry.spec.ts](../../../e2e/api/f05-daily-entry.spec.ts) — F05-AC7 (US-019) MULTI_SESSION mode requires a label and allows distinct labels
- [e2e/api/f05-daily-entry.spec.ts](../../../e2e/api/f05-daily-entry.spec.ts) — F05-AC8 (US-019) switching back to SINGLE is blocked while conflicts exist
- [e2e/api/f05-daily-entry.spec.ts](../../../e2e/api/f05-daily-entry.spec.ts) — F05-AC9 (US-019) a Teacher cannot change the daily-report mode

**Mobile (Maestro):**

- [e2e/mobile/f05-daily-entry/report-mode.yaml](../../../e2e/mobile/f05-daily-entry/report-mode.yaml) — F05 report mode — single report, sessions, blocked switch, Teacher has no control

**Unit (Vitest):**

- [packages/domain/hifz/hifz.test.ts](../../../packages/domain/hifz/hifz.test.ts) — F05-AC6 (US-019) SINGLE mode allows one record per student and date
- [packages/domain/hifz/hifz.test.ts](../../../packages/domain/hifz/hifz.test.ts) — F05-AC7 (US-019) MULTI_SESSION mode requires a session label and allows distinct labels on the same date
- [packages/domain/hifz/hifz.test.ts](../../../packages/domain/hifz/hifz.test.ts) — F05-AC8 (US-019) switching to SINGLE is blocked while any student/date has two sessions, listing the conflicts

## Open decisions and blockers

None specific to this story. See the [feature open questions](README.md#open-questions).

## Traceability

- **Story:** US-019 → SPEC-US-019 (this file)
- **Detailed criteria:** F05-AC6, F05-AC7, F05-AC8, F05-AC9
- **Requirements:** FR-DAY-008
- **SRS acceptance tests:** None
- **Business rules:** None
- **Design:** design.md §13; **Architecture:** ARCHITECTURE.md §18 epic 5
- **Previous location:** `docs/specs/F05-daily-hifz-entry.md`

# SPEC-US-018 · Create individual daily report

| | |
|---|---|
| **Spec ID** | SPEC-US-018 |
| **User story** | US-018 |
| **Feature** | [F05 · Daily Hifz entry](README.md) |
| **Epic** | EPIC 5 — Daily Hifz Entry ([user-stories.md](../../user-stories.md)) |
| **Status** | draft |
| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |
| **Split from** | `docs/specs/F05-daily-hifz-entry.md` on 2026-10-30 |

## User story

**US-018 — Create individual daily report**

As a Teacher, I want to record one student’s daily Hifz performance.

Spec wording (from F05):

- **US-018:** As a Teacher, I want to record one student's daily Hifz performance, so that the day's work is captured accurately.

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

- **Functional:** FR-DAY-001, FR-DAY-002, FR-DAY-002B, FR-DAY-003, FR-DAY-005, FR-DAY-006, FR-DAY-009, FR-ATT-001, FR-ATT-002, FR-ATT-007, FR-DAY-011
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

- **F05-AC1** — **(US-018) Given** a Teacher with an assigned student, **when** they choose a date, a class, and the student and save portions, **then** a daily record is stored with the date the Teacher chose as `report_date`. That date is kept separate from the save time and the sync time.
- **F05-AC2** — **(US-018) Given** a daily record that was saved offline and synced the next day, **when** it is viewed, **then** its `report_date` is still the date the Teacher chose.
- **F05-AC3** — **(US-018) Given** a portion with a missing required field, **when** the Teacher saves, **then** the error names the section, the portion number, and the field (e.g. "Sabqi · Portion 2: unit is required"), and all entered values are kept.
- **F05-AC4** — **(US-018) Given** a saved daily record, **when** the Teacher edits a portion, **then** the edit is audited, draft homework and reports recalculate, and confirmed homework is unchanged. The notice "Confirmed homework was not changed" is shown.
- **F05-AC5** — **(US-018) Given** a student marked Absent, **when** the record is saved, **then** no portion is treated as failed, and no quality is recorded for that day.
- **F05-AC17** — **(US-018) Given** the date tomorrow in the madrasa timezone, **when** a Teacher tries to create a daily record for it, **then** it is refused. A record for an earlier date is accepted. *(Added 2026-10-30, DEC-B24.)*
- **F05-AC18** — **(US-018) Given** a student marked Absent or on Leave for the date, **when** the Teacher tries to add a portion in Daily Entry, **then** it is refused, and the app offers "Change to Late". *(Added 2026-10-30, DEC-B22.)*

## Business rules

From SRS §9 (verbatim):

- **BR-1:** Sabaq, Sabqi, and Manzil are independent sections.
- **BR-6:** Absence is not failed recitation.
- **BR-17:** Missing data is not the same as zero performance.

## Validation rules

Stated in these criteria: F05-AC3, F05-AC17, F05-AC18.

## Edge cases and error handling

Rows from the F05 edge-case table that apply to this story (verbatim):

| Situation | What should happen |
|---|---|
| The Teacher picks a future date | Refused; only today or earlier is accepted (DEC-B24, F05-AC17) |
| The Teacher switches app language mid-entry | Unsaved values stay; only labels change |
| The student is deactivated while the Teacher has a draft open on an offline device | The draft can still be saved locally; the sync result follows F12 (action required if the server refuses) |
| Another device edited the same portion | A sync conflict is created; nothing is overwritten silently (F12, US-054) |
| A portion's status is Not Assigned or Pending | No quality value is entered or counted |

**Out of scope for the whole feature** (verbatim from F05):

- Recording Hifz in Bulk Entry (F04 is attendance-only).
- Audio recording or automatic grading of recitation.
- AI filling in or scoring portions.
- Extra work on the same portion. It is recorded as a separate Extra portion instead (FR-QTY-006, F06).
- Homework creation and confirmation (F08).

## Dependencies

- **Feature F05 depends on:** F03, F06, F07, F12 (from the spec index)
- **Features referenced by this story's criteria and edge cases:** F12
- **Other stories referenced:** US-054
- **Other stories in F05:** [US-019](us-019-choose-daily-report-mode.md), [US-020](us-020-record-sabaq.md), [US-021](us-021-record-sabqi-portions.md), [US-022](us-022-record-manzil-portions.md), [US-023](us-023-record-repeated-attempts.md)

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

Stated in these criteria: F05-AC1, F05-AC2.

And in these edge cases (see above):

- The student is deactivated while the Teacher has a draft open on an offline device
- Another device edited the same portion

## Related E2E test scenarios

**Completion gate:** this spec is complete only when `npm run e2e:gate -- US-018` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](../../../e2e/README.md)).

**API (Playwright):**

- [e2e/api/f05-daily-entry.spec.ts](../../../e2e/api/f05-daily-entry.spec.ts) — F05-AC1 (US-018) report_date is the date the Teacher chose, separate from save and sync times
- [e2e/api/f05-daily-entry.spec.ts](../../../e2e/api/f05-daily-entry.spec.ts) — F05-AC2 (US-018) a record synced the next day keeps its report_date
- [e2e/api/f05-daily-entry.spec.ts](../../../e2e/api/f05-daily-entry.spec.ts) — F05-AC4 (US-018) editing a portion audits, recalculates drafts and reports, and keeps confirmed homework
- [e2e/api/f05-daily-entry.spec.ts](../../../e2e/api/f05-daily-entry.spec.ts) — F05-AC5 (US-018) an Absent day has no failed portion and no quality
- [e2e/api/f05-daily-entry.spec.ts](../../../e2e/api/f05-daily-entry.spec.ts) — F05-AC17 (US-018) daily records cannot be created for future dates
- [e2e/api/f05-daily-entry.spec.ts](../../../e2e/api/f05-daily-entry.spec.ts) — F05-AC18 (US-018) portions cannot be added while a student is Absent or on Leave

**Mobile (Maestro):**

- [e2e/mobile/f05-daily-entry/attempts.yaml](../../../e2e/mobile/f05-daily-entry/attempts.yaml) — F05 attempts — second attempt keeps the first; history; late sync keeps the date
- [e2e/mobile/f05-daily-entry/date-and-attendance-rules.yaml](../../../e2e/mobile/f05-daily-entry/date-and-attendance-rules.yaml) — F05 no future dates; no portions while Absent or on Leave
- [e2e/mobile/f05-daily-entry/sections-and-portions.yaml](../../../e2e/mobile/f05-daily-entry/sections-and-portions.yaml) — F05 daily entry — Sabaq, two Sabqi, three Manzil with separate outcomes
- [e2e/mobile/f05-daily-entry/validation-and-edits.yaml](../../../e2e/mobile/f05-daily-entry/validation-and-edits.yaml) — F05 daily entry — portion errors, edit notice, Absent, Not Remembered default

**Unit (Vitest):**

- [packages/domain/hifz/hifz.test.ts](../../../packages/domain/hifz/hifz.test.ts) — F05-AC5 (US-018) an Absent student has no failed portion and no quality for the day
- [packages/domain/hifz/hifz.test.ts](../../../packages/domain/hifz/hifz.test.ts) — F05-AC3 (US-018) a missing required field error names the section, portion number, and field

## Open decisions and blockers

Open questions from F05 that apply to this story, with their resolutions (decision review of 2026-10-30, SRS §17):

- [x] May records be created for future dates? **Resolved:** No (DEC-B24, FR-DAY-001).
- [x] Is there an edit window after which records lock? **Resolved:** No lock; every edit audited (DEC-B25, FR-DAY-009).
- [x] D6: extra work beyond the assigned quantity. **Resolved:** A separate Extra portion (DEC-B23, FR-QTY-006).
- [x] Can portions be added for a student marked Absent (late arrival)? **Resolved:** No; change the student to Late first (DEC-B22, FR-DAY-011).

## Traceability

- **Story:** US-018 → SPEC-US-018 (this file)
- **Detailed criteria:** F05-AC1, F05-AC2, F05-AC3, F05-AC4, F05-AC5, F05-AC17, F05-AC18
- **Requirements:** FR-DAY-001, FR-DAY-002, FR-DAY-002B, FR-DAY-003, FR-DAY-005, FR-DAY-006, FR-DAY-009, FR-ATT-001, FR-ATT-002, FR-ATT-007, FR-DAY-011
- **SRS acceptance tests:** None
- **Business rules:** SRS §9 #1, SRS §9 #6, SRS §9 #17
- **Design:** design.md §13; **Architecture:** ARCHITECTURE.md §18 epic 5
- **Previous location:** `docs/specs/F05-daily-hifz-entry.md`

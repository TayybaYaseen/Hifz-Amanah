# F05 · Daily Hifz entry

**Status:** draft
**Brief:** [00-product-brief.md](../00-product-brief.md) · **Flow:** Daily Entry — individual student ([design.md §4.7](../../design.md)); record detail and attempt history
**Stories:** US-018 – US-023 · **Requirements:** FR-DAY-001…009, FR-SAB-001…004, FR-SBQ-001…004, FR-MNZ-001…004, FR-ATT-001…007, FR-QTY-007

## Context

This is the teacher's main daily task. They record what a student was given and what the student actually recited, separately for:
- **Sabaq** (new memorization)
- **Sabqi** (recent revision)
- **Manzil** (older revision)

Sabqi and Manzil can each hold several Paras, and each Para is tracked on its own. A portion can be recited more than once, and every attempt is kept.

There is no code yet. This feature builds the `hifz` module: the `daily_records`, `lesson_portions`, and `portion_attempts` tables ([ARCHITECTURE.md §6.3, §9.1](../../ARCHITECTURE.md)). It relies on:
- **F06** for quantities and Quran ranges
- **F07** for mistakes and quality
- **F08** for homework recalculation
- **F12** for offline saving

## User story

- **US-018:** As a Teacher, I want to record one student's daily Hifz performance, so that the day's work is captured accurately.
- **US-019:** As a Madrasa Admin, I want to choose one report per student/date or separate session reports, so that the app matches how our madrasa teaches.
- **US-020:** As a Teacher, I want to record Sabaq portions and their performance, so that new memorization is tracked.
- **US-021:** As a Teacher, I want to record one or more Sabqi portions independently, so that each revised Para has its own result.
- **US-022:** As a Teacher, I want to record multiple Manzil Paras independently, so that each old Para's result is visible on its own.
- **US-023:** As a Teacher, I want to keep multiple attempts for a portion, so that a second try does not erase the first.

## Acceptance criteria

1. **(US-018) Given** a Teacher with an assigned student, **when** they choose a date, a class, and the student and save portions, **then** a daily record is stored with the date the Teacher chose as `report_date`. That date is kept separate from the save time and the sync time.
2. **(US-018) Given** a daily record that was saved offline and synced the next day, **when** it is viewed, **then** its `report_date` is still the date the Teacher chose.
3. **(US-018) Given** a portion with a missing required field, **when** the Teacher saves, **then** the error names the section, the portion number, and the field (e.g. "Sabqi · Portion 2: unit is required"), and all entered values are kept.
4. **(US-018) Given** a saved daily record, **when** the Teacher edits a portion, **then** the edit is audited, draft homework and reports recalculate, and confirmed homework is unchanged. The notice "Confirmed homework was not changed" is shown.
5. **(US-018) Given** a student marked Absent, **when** the record is saved, **then** no portion is treated as failed, and no quality is recorded for that day.
6. **(US-019) Given** a madrasa in one-report-per-student/date mode, **when** a Teacher starts a second record for the same student and date, **then** the app warns and opens the existing record. No duplicate is created.
7. **(US-019) Given** a madrasa in multiple-session mode, **when** a Teacher creates a record, **then** a session label is required, and two records for the same student and date are allowed if their labels differ.
8. **(US-019) Given** multiple-session mode with some student/date having two sessions, **when** the Admin tries to switch to one-report mode, **then** the switch is blocked, with a message listing the conflicts.
9. **(US-019) Given** a Teacher, **when** they try to change the daily-report mode, **then** there is no control for it, and the API returns forbidden.
10. **(US-020) Given** a Sabaq portion, **when** the Teacher saves it, **then** it stores the Para number, an optional Surah and Ayat range, the assigned and completed quantity with its unit, the status, mistakes, quality, and remarks.
11. **(US-021) Given** Sabqi portions for Para 3 and Para 4, **when** Para 3 is marked Completed and Para 4 Partial, **then** each keeps its own status, and changing one never changes the other.
12. **(US-021) Given** a current Sabaq in Para 5, **when** the Teacher adds a Sabqi portion, **then** Para 5 may be offered as the default, but the Teacher can choose any other Para or several Paras.
13. **(US-022) Given** Manzil portions for Para 1, Para 5, and Para 10, **when** they are marked Completed, Partial at 1/2, and Not Remembered, **then** the record and its report show all three outcomes separately, never collapsed into one status (AC-QTY-06).
14. **(US-022) Given** a portion marked Not Remembered, **when** it is saved without a completed quantity, **then** the completed quantity is 0 and the remaining quantity equals the assigned quantity. The Teacher can correct this.
15. **(US-023) Given** a portion with one attempt, **when** the Teacher adds a second attempt, **then** both attempts are stored with their own time, recorder, completed quantity, status, mistakes, and quality, and the first attempt is unchanged (AC-ATT-05).
16. **(US-023) Given** a portion with two attempts, **when** progress and reports are calculated, **then** the latest attempt gives the current status, the assigned quantity is counted once, and both attempts appear in the history.

## Out of scope

- Recording Hifz in Bulk Entry (F04 is attendance-only).
- Audio recording or automatic grading of recitation.
- AI filling in or scoring portions.
- Extra work beyond the assigned quantity, unless entered as a separate portion (design.md §11 D6).
- Homework creation and confirmation (F08).

## Edge cases

| Situation | What should happen |
|---|---|
| The Teacher picks a future date | Open question. Until decided, warn but allow |
| The Teacher switches app language mid-entry | Unsaved values stay; only labels change |
| The student is deactivated while the Teacher has a draft open on an offline device | The draft can still be saved locally; the sync result follows F12 (action required if the server refuses) |
| Another device edited the same portion | A sync conflict is created; nothing is overwritten silently (F12, US-054) |
| The Teacher removes a portion that already has attempts | It needs a confirmation, and the action is audited. Attempt history is kept for audit |
| A portion's status is Not Assigned or Pending | No quality value is entered or counted |

## Open questions

- [ ] May records be created for future dates?
- [ ] Is there an edit window after which records lock?
- [ ] D6: extra work beyond the assigned quantity.
- [ ] Can portions be added for a student marked Absent (late arrival)?

## Done means

- [ ] Every acceptance criterion has a passing test.
- [ ] `npm run e2e:gate -- F05` passes: every criterion has an E2E test, none is pending, and all pass (e2e/README.md).
- [ ] Nothing from "Out of scope" was built.
- [ ] `npm test` and `npm run lint` pass.
- [ ] SRS acceptance tests AC-QTY-06, AC-ATT-01…03, and AC-ATT-05 pass.
- [ ] The UI shows "Synced" only after server acknowledgement.

## Test plan

| Level | What it covers | Where |
|---|---|---|
| **Unit** | Status semantics (Not Remembered defaults, no quality on Absent/Not Assigned/Pending), latest-attempt selection, report-mode uniqueness rules | `packages/domain/hifz/*.test.ts` |
| **Integration** | Record create/edit with portions and attempts, single vs multi-session uniqueness, mode switch blocked by conflicts, audit, recalculation trigger | `apps/api/test/hifz/*.test.ts` |
| **Component** | Three section cards, add multiple Sabqi/Manzil portions, per-portion errors, value kept on language switch, offline "Saved on this device" | `apps/mobile/src/features/daily-entry/__tests__/*.test.tsx` |
| **E2E** | Every acceptance criterion: server-side checks (API) and device journeys (Maestro), including: Teacher records Sabaq + 2 Sabqi + 3 Manzil with different outcomes → adds a second attempt → views history | `e2e/api/f05-daily-entry.spec.ts`, `e2e/mobile/f05-daily-entry/` |

**Traceability:** Each test name starts with its criterion, e.g. `F05-AC13 (US-022) …`. Every AC 1–16 has at least one test.

**Coverage:** ≥80% on new code.

# F04 · Calendar and attendance

**Status:** draft
**Brief:** [00-product-brief.md](../../00-product-brief.md) · **Flow:** Timetable and holidays ([design.md §4.14](../../design.md)); Bulk Entry ([§4.8](../../design.md)); Daily Entry Step 2 ([§4.7](../../design.md))
**Requirements:** FR-CAL-001…006, FR-DAY-002A, FR-DAY-007, FR-ATT-002, NFR-UX-004, FR-CAL-007…010, FR-DAY-010
**Stories:** US-013 – US-017 · **Depends on:** F03, F12
**Build order:** 8 of 17 (dependency level 3)

This folder has one spec per user story. This page keeps what applies to the whole feature: context, scope, edge cases, open questions, the feature test plan, and its definition of done. Story specs repeat the edge cases and open questions that apply to them.

## Story specs

| Spec | Story | Detailed criteria |
|---|---|---|
| [SPEC-US-013](us-013-configure-class-timetable.md) | US-013 — Configure class timetable | F04-AC1, F04-AC2 |
| [SPEC-US-014](us-014-manage-holidays-and-closures.md) | US-014 — Manage holidays and closures | F04-AC3, F04-AC4, F04-AC5, F04-AC20 |
| [SPEC-US-015](us-015-record-attendance-in-bulk.md) | US-015 — Record attendance in bulk | F04-AC6, F04-AC7, F04-AC8, F04-AC9, F04-AC10, F04-AC11, F04-AC12, F04-AC18, F04-AC19 |
| [SPEC-US-016](us-016-request-leave.md) | US-016 — Request leave | F04-AC13, F04-AC14, F04-AC21, F04-AC23 |
| [SPEC-US-017](us-017-approve-leave.md) | US-017 — Approve leave | F04-AC15, F04-AC16, F04-AC17, F04-AC22 |

## Context

Attendance answers a different question from performance. Attendance is about whether the student was there; performance is about how they recited. The schedule decides which days count. A holiday or an unscheduled day can never become an absence. Bulk Entry exists so a teacher can mark a whole class quickly, and it records **attendance only**: Present, Late, Half day, Leave, or Absent (revised 2026-10-30, DEC-B22).

Leave (which replaced "excused absence") takes two steps: the Teacher marks it with a required reason, then the Admin decides. Leave marked by an Admin is approved at once.

There is no code yet. This feature builds the `calendar` module ([ARCHITECTURE.md §6.3, §6.5](../../ARCHITECTURE.md)): the `class_schedules`, `calendar_exceptions`, and `attendance_records` tables. Attendance writes go through the offline outbox (F12).

## Out of scope

- Any Hifz, quality, or mistake field in Bulk Entry.
- Attendance states other than Present, Late, Half day, Leave, and Absent.
- Parents or students requesting Leave in the app.
- Absence or Leave push notifications (not in the approved event catalogue, FR-NOT-004).
- Automatic absence on unscheduled days.

## Edge cases

| Situation | What should happen |
|---|---|
| A student is enrolled in the middle of a week | Days before the enrollment are not scheduled days for that student |
| The Teacher marks Absent in Bulk Entry, but the student already has recited portions that day | The row suggests "Mark Late instead"; keeping Absent needs an internal note; the portions are unchanged (DEC-B19, F04-AC19) |
| A holiday is added after attendance was already recorded for that date | The Admin is warned and confirms; the records are excluded from reports, kept in history, and never deleted (DEC-B21, F04-AC20) |
| The Admin approves a Leave while the Teacher's device is offline | The device shows the decision after its next sync |
| Bulk Entry on a small phone | One student card at a time, with previous/next controls; selections are kept when moving between cards |

## Open questions (resolved 2026-10-30)

- [x] D4: bulk Absent for a student who already has recited portions that day. **Resolved:** Suggest Late; keeping Absent needs an internal note; portions unchanged (DEC-B19, FR-DAY-010).
- [x] D8: confirm that an unmarked student is "not marked", not absent. This spec assumes yes. **Resolved:** Unmarked students are listed in a dialog with "Mark them Absent" / "Go back"; nothing is saved silently (DEC-B20, FR-CAL-010).
- [x] What happens to recorded attendance when a holiday is declared on that date afterwards? **Resolved:** The Admin is warned; records are excluded from reports but kept; new entries refused (DEC-B21, FR-CAL-009).
- [x] Is an excuse reason required or optional? **Resolved:** Excused absence became Leave; the reason is required (DEC-B22, FR-CAL-008; supersedes DEC-A01).

## Done means

- [ ] Every acceptance criterion has a passing test.
- [ ] `npm run e2e:gate -- F04` passes: every criterion has an E2E test, none is pending, and all pass (e2e/README.md).
- [ ] Nothing from "Out of scope" was built.
- [ ] `npm test` and `npm run lint` pass.
- [ ] AC-ATT-04 and AC-RPT-08 (holidays and no-class days are never absences) pass across a week boundary in `Asia/Karachi`.

## Test plan

| Level | What it covers | Where |
|---|---|---|
| **Unit** | Scheduled-day calculation from schedules, exceptions, enrollment dates, and timezone; the Leave approval state machine and attendance counting | `packages/domain/calendar/*.test.ts` |
| **Integration** | Bulk save with per-row results, idempotent retry, "Mark all Present" not overwriting, Leave approve/reject by role, audit | `apps/api/test/calendar/*.test.ts` |
| **Component** | Bulk Entry shows only the five attendance statuses; holiday notice; partial-save summary; phone card layout; Leave label states; unmarked-students dialog | `apps/mobile/src/features/attendance/__tests__/*.test.tsx` |
| **E2E** | Every acceptance criterion: server-side checks (API) and device journeys (Maestro), including: Teacher marks a class offline → syncs; Teacher marks Leave → Admin approves → the report shows it as Leave | `e2e/api/f04-attendance.spec.ts`, `e2e/mobile/f04-attendance/` |

**Traceability:** Each test name starts with its criterion, e.g. `F04-AC08 (US-015) …`. Every AC 1–23 has at least one test.

**Coverage:** ≥80% on new code.

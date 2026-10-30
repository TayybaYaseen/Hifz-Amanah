# F04 · Calendar and attendance

**Status:** draft
**Brief:** [00-product-brief.md](../00-product-brief.md) · **Flow:** Timetable and holidays ([design.md §4.14](../../design.md)); Bulk Entry ([§4.8](../../design.md)); Daily Entry Step 2 ([§4.7](../../design.md))
**Stories:** US-013 – US-017 · **Requirements:** FR-CAL-001…006, FR-DAY-002A, FR-DAY-007, FR-ATT-002, NFR-UX-004

## Context

Attendance answers a different question from performance. Attendance is about whether the student was there; performance is about how they recited. The schedule decides which days count. A holiday or an unscheduled day can never become an absence. Bulk Entry exists so a teacher can mark a whole class quickly, and it records **only Present or Absent**.

Excused absence takes two steps: the Teacher marks it, then the Admin decides.

There is no code yet. This feature builds the `calendar` module ([ARCHITECTURE.md §6.3, §6.5](../../ARCHITECTURE.md)): the `class_schedules`, `calendar_exceptions`, and `attendance_records` tables. Attendance writes go through the offline outbox (F12).

## User story

- **US-013:** As an Admin, I want to define recurring class schedules, so that the app knows which days are class days.
- **US-014:** As an Admin, I want to mark holidays and no-class dates, so that those days are never counted as absences.
- **US-015:** As a Teacher, I want to mark Present or Absent for a whole class efficiently, so that attendance takes a minute, not a lesson.
- **US-016:** As a Teacher, I want to mark an absence as excused for Admin review, so that a genuine reason is recorded.
- **US-017:** As a Madrasa Admin, I want to approve or reject a teacher-marked excused absence, so that excused absences are controlled by the madrasa.

## Acceptance criteria

1. **(US-013) Given** a class scheduled Monday to Saturday, **when** the weekly report for a week is built, **then** the scheduled class days are that week's Monday to Saturday, and Sunday is a no-class day.
2. **(US-013) Given** a schedule changed from a given effective date, **when** reports are built, **then** days before that date use the old schedule and days from that date use the new one.
3. **(US-014) Given** a holiday declared for the whole madrasa on a date, **when** that date is reported, **then** it shows as a holiday, and no student is counted absent for it.
4. **(US-014) Given** a no-class exception for one class on a date, **when** that date is reported, **then** only that class's students show "no class" for it.
5. **(US-014) Given** a date that is a holiday, **when** a Teacher opens Bulk Entry for that date, **then** the screen says it is a holiday and that no absence is recorded automatically.
6. **(US-015) Given** a class with enrolled students, **when** the Teacher opens Bulk Entry for a date, **then** each student has only a Present/Absent control. There are no Sabaq, Sabqi, Manzil, mistake, quality, or excused fields.
7. **(US-015) Given** a Teacher using "Mark all Present", **when** some students already have attendance recorded for that date, **then** those students keep their existing mark.
8. **(US-015) Given** a student the Teacher left unmarked, **when** Bulk Entry is saved, **then** that student is "not marked". They are not counted as absent.
9. **(US-015) Given** one row that fails validation, **when** Bulk Entry is saved, **then** the valid rows are saved and the failed row shows its error. The result summary counts saved, needs-correction, and not-marked rows.
10. **(US-015) Given** a Bulk Entry save that was already sent, **when** it is retried after a network failure, **then** no duplicate attendance records are created.
11. **(US-015) Given** a student marked Absent, **when** the save completes, **then** no portion attempt, failed recitation, or quality value is created for that student.
12. **(US-015) Given** no internet connection, **when** the Teacher saves Bulk Entry, **then** the screen says "Saved on this device — waiting to sync", and the records are queued.
13. **(US-016) Given** a student marked Absent in their individual Daily Entry, **when** the Teacher chooses "Mark as excused" and adds an optional reason, **then** the record shows "Excused — awaiting approval".
14. **(US-016) Given** a student marked Present, **when** the Teacher views attendance, **then** no "Mark as excused" option is offered.
15. **(US-017) Given** an excused absence awaiting a decision, **when** the Admin approves it, **then** it counts as an excused absence in reports, and the decision is audited with the Admin and the time.
16. **(US-017) Given** an excused absence awaiting a decision, **when** the Admin rejects it, **then** it counts as a normal absence, and the Teacher's record shows "Excuse rejected".
17. **(US-017) Given** a Teacher, **when** they try to approve or reject an excused absence, **then** there is no control for it, and the API returns forbidden.

## Out of scope

- Any Hifz, quality, mistake, or excused-absence field in Bulk Entry.
- Attendance states other than Present and Absent (late, leave, half-day).
- Parents or students requesting an excuse.
- Absence push notifications (event catalogue still open, F16).
- Automatic absence on unscheduled days.

## Edge cases

| Situation | What should happen |
|---|---|
| A student is enrolled in the middle of a week | Days before the enrollment are not scheduled days for that student |
| The Teacher marks Absent in Bulk Entry, but the student already has recited portions that day | Open question (design.md §11 D4). Until decided, block the change and show a message pointing to Daily Entry |
| A holiday is added after attendance was already recorded for that date | Open question; never silently delete the recorded attendance |
| The Admin approves an excuse while the Teacher's device is offline | The device shows the decision after its next sync |
| Bulk Entry on a small phone | One student card at a time, with previous/next controls; selections are kept when moving between cards |

## Open questions

- [ ] D4: bulk Absent for a student who already has recited portions that day.
- [ ] D8: confirm that an unmarked student is "not marked", not absent. This spec assumes yes.
- [ ] What happens to recorded attendance when a holiday is declared on that date afterwards?
- [ ] Is an excuse reason required or optional?

## Done means

- [ ] Every acceptance criterion has a passing test.
- [ ] `npm run e2e:gate -- F04` passes: every criterion has an E2E test, none is pending, and all pass (e2e/README.md).
- [ ] Nothing from "Out of scope" was built.
- [ ] `npm test` and `npm run lint` pass.
- [ ] AC-ATT-04 and AC-RPT-08 (holidays and no-class days are never absences) pass across a week boundary in `Asia/Karachi`.

## Test plan

| Level | What it covers | Where |
|---|---|---|
| **Unit** | Scheduled-day calculation from schedules, exceptions, enrollment dates, and timezone; the excuse-status state machine | `packages/domain/calendar/*.test.ts` |
| **Integration** | Bulk save with per-row results, idempotent retry, "Mark all Present" not overwriting, excuse approve/reject by role, audit | `apps/api/test/calendar/*.test.ts` |
| **Component** | Bulk Entry shows only Present/Absent; holiday notice; partial-save summary; phone card layout; excused label states | `apps/mobile/src/features/attendance/__tests__/*.test.tsx` |
| **E2E** | Every acceptance criterion: server-side checks (API) and device journeys (Maestro), including: Teacher marks a class offline → syncs; Teacher requests an excuse → Admin approves → the report shows it as excused | `e2e/api/f04-attendance.spec.ts`, `e2e/mobile/f04-attendance/` |

**Traceability:** Each test name starts with its criterion, e.g. `F04-AC08 (US-015) …`. Every AC 1–17 has at least one test.

**Coverage:** ≥80% on new code.

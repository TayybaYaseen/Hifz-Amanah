# SPEC-US-015 · Record attendance in bulk

| | |
|---|---|
| **Spec ID** | SPEC-US-015 |
| **User story** | US-015 |
| **Feature** | [F04 · Calendar and attendance](README.md) |
| **Epic** | EPIC 4 — Calendar and Attendance ([user-stories.md](../../user-stories.md)) |
| **Status** | draft |
| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |
| **Split from** | `docs/specs/F04-calendar-attendance.md` on 2026-10-30 |

## User story

**US-015 — Record attendance in bulk**

As a Teacher, I want to mark attendance (Present, Late, Half day, Leave, or Absent) for a whole class efficiently.

Spec wording (from F04):

- **US-015:** As a Teacher, I want to mark attendance (Present, Late, Half day, Leave, or Absent) for a whole class efficiently, so that attendance takes a minute, not a lesson. *(Revised 2026-10-30, DEC-B22.)*

**Feature context** (shared by every story in F04, copied from the feature spec):

> Attendance answers a different question from performance. Attendance is about whether the student was there; performance is about how they recited. The schedule decides which days count. A holiday or an unscheduled day can never become an absence. Bulk Entry exists so a teacher can mark a whole class quickly, and it records **attendance only**: Present, Late, Half day, Leave, or Absent (revised 2026-10-30, DEC-B22).
>
> Leave (which replaced "excused absence") takes two steps: the Teacher marks it with a required reason, then the Admin decides. Leave marked by an Admin is approved at once.
>
> There is no code yet. This feature builds the `calendar` module ([ARCHITECTURE.md §6.3, §6.5](../../ARCHITECTURE.md)): the `class_schedules`, `calendar_exceptions`, and `attendance_records` tables. Attendance writes go through the offline outbox (F12).

## Related functional requirements

Requirements this story covers. SRS.md has no story-to-requirement table, so this list is derived from the requirement text and the criteria below.

- **Functional:** FR-DAY-002A, FR-DAY-007, FR-CAL-003, FR-ATT-002, FR-CAL-007, FR-CAL-010, FR-DAY-010
- **Non-functional:** NFR-UX-004
- **SRS acceptance tests cited:** None

Feature requirement set (from F04; additions of 2026-10-30 at the end): FR-CAL-001…006, FR-DAY-002A, FR-DAY-007, FR-ATT-002, NFR-UX-004, FR-CAL-007…010, FR-DAY-010

## Acceptance criteria

### Story acceptance criteria

Verbatim from [user-stories.md](../../user-stories.md).

1. Attendance is stored separately from recitation/performance status.
2. Bulk attendance offers Present, Late, Half day, Leave, and Absent only; no Hifz portion, mistake, or quality fields are included, and unmarked students are never saved silently.
3. Holidays, unscheduled dates, and no-class days are not counted as absences; Leave requires a reason and Admin approval.

### Detailed acceptance criteria

From the F04 feature spec. The original IDs are kept because tests cite them. Criteria marked *Revised* or *Added* come from the decision review of 2026-10-30 (SRS §17).

- **F04-AC6** — **(US-015) Given** a class with enrolled students, **when** the Teacher opens Bulk Entry for a date, **then** each student has one attendance control with Present, Late, Half day, Leave, and Absent. There are no Sabaq, Sabqi, Manzil, mistake, or quality fields. *(Revised 2026-10-30, DEC-B22.)*
- **F04-AC7** — **(US-015) Given** a Teacher using "Mark all Present", **when** some students already have attendance recorded for that date, **then** those students keep their existing mark.
- **F04-AC8** — **(US-015) Given** students the Teacher left unmarked, **when** Bulk Entry is saved, **then** a dialog lists them as "N students not marked" with "Mark them Absent" and "Go back". Nothing is saved for them until the Teacher chooses; "Mark them Absent" records explicit Absent entries by that Teacher. *(Revised 2026-10-30, DEC-B20.)*
- **F04-AC9** — **(US-015) Given** one row that fails validation, **when** Bulk Entry is saved, **then** the valid rows are saved and the failed row shows its error. The result summary counts saved and needs-correction rows. *(Revised 2026-10-30, DEC-B20.)*
- **F04-AC10** — **(US-015) Given** a Bulk Entry save that was already sent, **when** it is retried after a network failure, **then** no duplicate attendance records are created.
- **F04-AC11** — **(US-015) Given** a student marked Absent, **when** the save completes, **then** no portion attempt, failed recitation, or quality value is created for that student.
- **F04-AC12** — **(US-015) Given** no internet connection, **when** the Teacher saves Bulk Entry, **then** the screen says "Saved on this device — waiting to sync", and the records are queued.
- **F04-AC18** — **(US-015) Given** a student already saved as Absent, **when** the Teacher changes them to Late, or changes a Present student to Half day, **then** the record changes, the change is audited, and Hifz portions can be recorded for that student that day. *(Added 2026-10-30, DEC-B22.)*
- **F04-AC19** — **(US-015) Given** a student who already has recited portions saved for the date, **when** the Teacher marks them Absent in Bulk Entry, **then** the row suggests "Mark Late instead". If the Teacher keeps Absent, the row cannot save until an internal note with the reason is entered, and the recited portions are unchanged. *(Added 2026-10-30, DEC-B19.)*

## Business rules

From SRS §9 (verbatim):

- **BR-6:** Absence is not failed recitation.
- **BR-7:** Holidays and unscheduled dates are not absences.

## Validation rules

Stated in these criteria: F04-AC9, F04-AC19.

## Edge cases and error handling

Rows from the F04 edge-case table that apply to this story (verbatim):

| Situation | What should happen |
|---|---|
| The Teacher marks Absent in Bulk Entry, but the student already has recited portions that day | The row suggests "Mark Late instead"; keeping Absent needs an internal note; the portions are unchanged (DEC-B19, F04-AC19) |
| Bulk Entry on a small phone | One student card at a time, with previous/next controls; selections are kept when moving between cards |

**Out of scope for the whole feature** (verbatim from F04):

- Any Hifz, quality, or mistake field in Bulk Entry.
- Attendance states other than Present, Late, Half day, Leave, and Absent.
- Parents or students requesting Leave in the app.
- Absence or Leave push notifications (not in the approved event catalogue, FR-NOT-004).
- Automatic absence on unscheduled days.

## Dependencies

- **Feature F04 depends on:** F03, F12 (from the spec index)
- **Features referenced by this story's criteria and edge cases:** None
- **Other stories referenced:** None
- **Other stories in F04:** [US-013](us-013-configure-class-timetable.md), [US-014](us-014-manage-holidays-and-closures.md), [US-016](us-016-request-leave.md), [US-017](us-017-approve-leave.md)

## Related screens and UI

- **Feature flow** (from F04): Timetable and holidays ([design.md §4.14](../../design.md)); Bulk Entry ([§4.8](../../design.md)); Daily Entry Step 2 ([§4.7](../../design.md))

[design.md §13](../../design.md) story-to-screen map (verbatim):

| Story | Screen (this document) | Key interaction | Required states beyond standard | Validation shown | Accessibility / localization specifics |
|---|---|---|---|---|---|
| US-015 | §4.8 Bulk Entry — class attendance | Present / Late / Half day / Leave / Absent per student; Mark all Present (never overwrites); Save attendance → "N students not marked" dialog (Mark them Absent / Go back); "Mark Late instead" prompt for a student who already recited; Retry; Record Hifz per row | Offline; Saved locally; Partial bulk save (saved / needs correction) | Row-level error on each rejected student; Leave reason and Absent-after-reciting note required; selections kept | "Attendance only" note visible; phone shows one card with previous/next; no performance fields rendered |

## Related API and data model

- **Modules** ([ARCHITECTURE.md §18](../../ARCHITECTURE.md)): `calendar`
- Tables and services are described in the feature context above and in [ARCHITECTURE.md](../../ARCHITECTURE.md). Concrete API routes are defined at scaffolding (SRS §17 DEC-B54).

## Offline and sync behavior

Stated in these criteria: F04-AC12.

## Related E2E test scenarios

**Completion gate:** this spec is complete only when `npm run e2e:gate -- US-015` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](../../../e2e/README.md)).

**API (Playwright):**

- [e2e/api/f04-attendance.spec.ts](../../../e2e/api/f04-attendance.spec.ts) — F04-AC7 (US-015) Mark all Present keeps existing marks
- [e2e/api/f04-attendance.spec.ts](../../../e2e/api/f04-attendance.spec.ts) — F04-AC8 (US-015) unmarked students are confirmed in a dialog, never saved silently
- [e2e/api/f04-attendance.spec.ts](../../../e2e/api/f04-attendance.spec.ts) — F04-AC9 (US-015) one invalid row does not block the valid rows
- [e2e/api/f04-attendance.spec.ts](../../../e2e/api/f04-attendance.spec.ts) — F04-AC10 (US-015) retrying a sent bulk save creates no duplicates
- [e2e/api/f04-attendance.spec.ts](../../../e2e/api/f04-attendance.spec.ts) — F04-AC11 (US-015) an Absent mark creates no attempt, failure, or quality
- [e2e/api/f04-attendance.spec.ts](../../../e2e/api/f04-attendance.spec.ts) — F04-AC18 (US-015) Absent can become Late and Present can become Half day, audited
- [e2e/api/f04-attendance.spec.ts](../../../e2e/api/f04-attendance.spec.ts) — F04-AC19 (US-015) Absent for a student who recited needs a note; portions unchanged

**Mobile (Maestro):**

- [e2e/mobile/f04-attendance/attendance-statuses.yaml](../../../e2e/mobile/f04-attendance/attendance-statuses.yaml) — F04 Late, Half day, Leave in Bulk Entry; Absent after reciting; late holiday
- [e2e/mobile/f04-attendance/bulk-entry-offline.yaml](../../../e2e/mobile/f04-attendance/bulk-entry-offline.yaml) — F04 bulk entry offline — saved on device, synced once
- [e2e/mobile/f04-attendance/bulk-entry.yaml](../../../e2e/mobile/f04-attendance/bulk-entry.yaml) — F04 bulk entry — attendance only, Mark all Present, unmarked, partial save

**Unit (Vitest):**

- [packages/domain/calendar/calendar.test.ts](../../../packages/domain/calendar/calendar.test.ts) — F04-AC8 (US-015) unmarked students produce no record until the Teacher confirms Mark them Absent
- [packages/domain/calendar/calendar.test.ts](../../../packages/domain/calendar/calendar.test.ts) — F04-AC11 (US-015) an Absent mark never yields a portion attempt, failure, or quality value
- [packages/domain/calendar/calendar.test.ts](../../../packages/domain/calendar/calendar.test.ts) — F04-AC18 (US-015) Absent can become Late and Present can become Half day, audited

## Open decisions and blockers

Open questions from F04 that apply to this story, with their resolutions (decision review of 2026-10-30, SRS §17):

- [x] D4: bulk Absent for a student who already has recited portions that day. **Resolved:** Suggest Late; keeping Absent needs an internal note; portions unchanged (DEC-B19, FR-DAY-010).
- [x] D8: confirm that an unmarked student is "not marked", not absent. This spec assumes yes. **Resolved:** Unmarked students are listed in a dialog with "Mark them Absent" / "Go back"; nothing is saved silently (DEC-B20, FR-CAL-010).

## Traceability

- **Story:** US-015 → SPEC-US-015 (this file)
- **Detailed criteria:** F04-AC6, F04-AC7, F04-AC8, F04-AC9, F04-AC10, F04-AC11, F04-AC12, F04-AC18, F04-AC19
- **Requirements:** FR-DAY-002A, FR-DAY-007, FR-CAL-003, FR-ATT-002, NFR-UX-004, FR-CAL-007, FR-CAL-010, FR-DAY-010
- **SRS acceptance tests:** None
- **Business rules:** SRS §9 #6, SRS §9 #7
- **Design:** design.md §13; **Architecture:** ARCHITECTURE.md §18 epic 4
- **Previous location:** `docs/specs/F04-calendar-attendance.md`

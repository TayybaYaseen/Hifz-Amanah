# SPEC-US-016 · Request leave

| | |
|---|---|
| **Spec ID** | SPEC-US-016 |
| **User story** | US-016 |
| **Feature** | [F04 · Calendar and attendance](README.md) |
| **Epic** | EPIC 4 — Calendar and Attendance ([user-stories.md](../../user-stories.md)) |
| **Status** | draft |
| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |
| **Split from** | `docs/specs/F04-calendar-attendance.md` on 2026-10-30 |

## User story

**US-016 — Request leave**

As a Teacher, I want to mark a student's absence as Leave, with the reason the family gave, for Admin approval.

Spec wording (from F04):

- **US-016:** As a Teacher, I want to mark a student's absence as Leave, with the reason the family gave, for Admin approval, so that a genuine reason is recorded. *(Revised 2026-10-30, DEC-B22.)*

**Feature context** (shared by every story in F04, copied from the feature spec):

> Attendance answers a different question from performance. Attendance is about whether the student was there; performance is about how they recited. The schedule decides which days count. A holiday or an unscheduled day can never become an absence. Bulk Entry exists so a teacher can mark a whole class quickly, and it records **attendance only**: Present, Late, Half day, Leave, or Absent (revised 2026-10-30, DEC-B22).
>
> Leave (which replaced "excused absence") takes two steps: the Teacher marks it with a required reason, then the Admin decides. Leave marked by an Admin is approved at once.
>
> There is no code yet. This feature builds the `calendar` module ([ARCHITECTURE.md §6.3, §6.5](../../ARCHITECTURE.md)): the `class_schedules`, `calendar_exceptions`, and `attendance_records` tables. Attendance writes go through the offline outbox (F12).

## Related functional requirements

Requirements this story covers. SRS.md has no story-to-requirement table, so this list is derived from the requirement text and the criteria below.

- **Functional:** FR-ATT-002, FR-CAL-003, FR-CAL-007, FR-CAL-008
- **Non-functional:** Not applicable
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

- **F04-AC13** — **(US-016) Given** a student who is not Present, Late, or Half day for the date, **when** the Teacher chooses Leave in Daily Entry and enters a reason, **then** the record shows "Leave — awaiting approval". *(Revised 2026-10-30, DEC-B22.)*
- **F04-AC14** — **(US-016) Given** a Leave with an empty reason, **when** the Teacher saves it in Daily Entry or Bulk Entry, **then** the reason field shows an error and nothing is saved. *(Revised 2026-10-30, DEC-B22, A01 superseded.)*
- **F04-AC21** — **(US-016) Given** Bulk Entry, **when** the Teacher chooses Leave for a student, **then** a reason is required on that row, and after saving the row shows "Leave — awaiting approval". *(Added 2026-10-30, DEC-B22.)*
- **F04-AC23** — **(US-016) Given** a Leave or Absent note with a reason, **when** a Student or Parent view, API response, PDF, Excel export, or push is produced, **then** the reason text is not in it. *(Added 2026-10-30, DEC-B22.)*

## Business rules

From SRS §9 (verbatim):

- **BR-6:** Absence is not failed recitation.

## Validation rules

Stated in these criteria: F04-AC14, F04-AC21.

## Edge cases and error handling

No F04 edge case is specific to this story. See the [feature edge cases](README.md#edge-cases).

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
- **Other stories in F04:** [US-013](us-013-configure-class-timetable.md), [US-014](us-014-manage-holidays-and-closures.md), [US-015](us-015-record-attendance-in-bulk.md), [US-017](us-017-approve-leave.md)

## Related screens and UI

- **Feature flow** (from F04): Timetable and holidays ([design.md §4.14](../../design.md)); Bulk Entry ([§4.8](../../design.md)); Daily Entry Step 2 ([§4.7](../../design.md))

[design.md §13](../../design.md) story-to-screen map (verbatim):

| Story | Screen (this document) | Key interaction | Required states beyond standard | Validation shown | Accessibility / localization specifics |
|---|---|---|---|---|---|
| US-016 | §4.7 Step 2 Attendance; §4.8 Bulk Entry row | Choose Leave and enter the reason | Saved locally; "Leave — awaiting approval" | Reason required | Leave status as a text label |

## Related API and data model

- **Modules** ([ARCHITECTURE.md §18](../../ARCHITECTURE.md)): `calendar`
- Tables and services are described in the feature context above and in [ARCHITECTURE.md](../../ARCHITECTURE.md). Concrete API routes are defined at scaffolding (SRS §17 DEC-B54).

## Offline and sync behavior

Nothing specific to this story in the source documents.

## Related E2E test scenarios

**Completion gate:** this spec is complete only when `npm run e2e:gate -- US-016` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](../../../e2e/README.md)).

**API (Playwright):**

- [e2e/api/f04-attendance.spec.ts](../../../e2e/api/f04-attendance.spec.ts) — F04-AC13 (US-016) a Teacher marks Leave with a reason and it awaits approval
- [e2e/api/f04-attendance.spec.ts](../../../e2e/api/f04-attendance.spec.ts) — F04-AC14 (US-016) Leave without a reason is rejected
- [e2e/api/f04-attendance.spec.ts](../../../e2e/api/f04-attendance.spec.ts) — F04-AC23 (US-016) Leave reasons and absence notes never reach Students or Parents

**Mobile (Maestro):**

- [e2e/mobile/f04-attendance/attendance-statuses.yaml](../../../e2e/mobile/f04-attendance/attendance-statuses.yaml) — F04 Late, Half day, Leave in Bulk Entry; Absent after reciting; late holiday
- [e2e/mobile/f04-attendance/leave.yaml](../../../e2e/mobile/f04-attendance/leave.yaml) — F04 Leave — Teacher marks Leave with a reason, Admin approves and rejects

**Unit (Vitest):**

- [packages/domain/calendar/calendar.test.ts](../../../packages/domain/calendar/calendar.test.ts) — F04-AC13 (US-016) a Teacher-marked LEAVE with a reason is awaiting approval
- [packages/domain/calendar/calendar.test.ts](../../../packages/domain/calendar/calendar.test.ts) — F04-AC14 (US-016) Leave without a reason is rejected

## Open decisions and blockers

Open questions from F04 that apply to this story, with their resolutions (decision review of 2026-10-30, SRS §17):

- [x] Is an excuse reason required or optional? **Resolved:** Excused absence became Leave; the reason is required (DEC-B22, FR-CAL-008; supersedes DEC-A01).

## Traceability

- **Story:** US-016 → SPEC-US-016 (this file)
- **Detailed criteria:** F04-AC13, F04-AC14, F04-AC21, F04-AC23
- **Requirements:** FR-ATT-002, FR-CAL-003, FR-CAL-007, FR-CAL-008
- **SRS acceptance tests:** None
- **Business rules:** SRS §9 #6
- **Design:** design.md §13; **Architecture:** ARCHITECTURE.md §18 epic 4
- **Previous location:** `docs/specs/F04-calendar-attendance.md`

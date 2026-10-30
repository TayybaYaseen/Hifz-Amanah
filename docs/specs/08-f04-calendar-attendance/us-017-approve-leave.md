# SPEC-US-017 · Approve leave

| | |
|---|---|
| **Spec ID** | SPEC-US-017 |
| **User story** | US-017 |
| **Feature** | [F04 · Calendar and attendance](README.md) |
| **Epic** | EPIC 4 — Calendar and Attendance ([user-stories.md](../../user-stories.md)) |
| **Status** | draft |
| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |
| **Split from** | `docs/specs/F04-calendar-attendance.md` on 2026-10-30 |

## User story

**US-017 — Approve leave**

As a Madrasa Admin, I want to approve or reject a teacher-marked Leave.

Spec wording (from F04):

- **US-017:** As a Madrasa Admin, I want to approve or reject a teacher-marked Leave, so that Leave are controlled by the madrasa. *(Revised 2026-10-30, DEC-B22.)*

**Feature context** (shared by every story in F04, copied from the feature spec):

> Attendance answers a different question from performance. Attendance is about whether the student was there; performance is about how they recited. The schedule decides which days count. A holiday or an unscheduled day can never become an absence. Bulk Entry exists so a teacher can mark a whole class quickly, and it records **attendance only**: Present, Late, Half day, Leave, or Absent (revised 2026-10-30, DEC-B22).
>
> Leave (which replaced "excused absence") takes two steps: the Teacher marks it with a required reason, then the Admin decides. Leave marked by an Admin is approved at once.
>
> There is no code yet. This feature builds the `calendar` module ([ARCHITECTURE.md §6.3, §6.5](../../ARCHITECTURE.md)): the `class_schedules`, `calendar_exceptions`, and `attendance_records` tables. Attendance writes go through the offline outbox (F12).

## Related functional requirements

Requirements this story covers. SRS.md has no story-to-requirement table, so this list is derived from the requirement text and the criteria below.

- **Functional:** FR-CAL-005, FR-CAL-008
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

- **F04-AC15** — **(US-017) Given** a Leave awaiting a decision, **when** the Admin approves it, **then** it counts as Leave in reports, and the decision is audited with the Admin and the time. *(Revised 2026-10-30, DEC-B22.)*
- **F04-AC16** — **(US-017) Given** a Leave awaiting a decision, **when** the Admin rejects it, **then** it counts as a normal absence, and the Teacher's record shows "Leave rejected". *(Revised 2026-10-30, DEC-B22.)*
- **F04-AC17** — **(US-017) Given** a Teacher, **when** they try to approve or reject a Leave, **then** there is no control for it, and the API returns forbidden. *(Revised 2026-10-30, DEC-B22.)*
- **F04-AC22** — **(US-017) Given** an Owner or Admin, **when** they mark Leave with a reason, **then** it is approved at once with no approval step, and the action is audited. *(Added 2026-10-30, DEC-B22.)*

## Business rules

From SRS §9 (verbatim):

- **BR-6:** Absence is not failed recitation.

## Validation rules

Stated in these criteria: F04-AC16, F04-AC17.

## Edge cases and error handling

Rows from the F04 edge-case table that apply to this story (verbatim):

| Situation | What should happen |
|---|---|
| The Admin approves a Leave while the Teacher's device is offline | The device shows the decision after its next sync |

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
- **Other stories in F04:** [US-013](us-013-configure-class-timetable.md), [US-014](us-014-manage-holidays-and-closures.md), [US-015](us-015-record-attendance-in-bulk.md), [US-016](us-016-request-leave.md)

## Related screens and UI

- **Feature flow** (from F04): Timetable and holidays ([design.md §4.14](../../design.md)); Bulk Entry ([§4.8](../../design.md)); Daily Entry Step 2 ([§4.7](../../design.md))

[design.md §13](../../design.md) story-to-screen map (verbatim):

| Story | Screen (this document) | Key interaction | Required states beyond standard | Validation shown | Accessibility / localization specifics |
|---|---|---|---|---|---|
| US-017 | §4.14 Leave approvals | Approve / Reject with confirmation | No records; Offline (approval needs network) | Confirmation names student and date | Decision shown as text, not color only |

## Related API and data model

- **Modules** ([ARCHITECTURE.md §18](../../ARCHITECTURE.md)): `calendar`
- Tables and services are described in the feature context above and in [ARCHITECTURE.md](../../ARCHITECTURE.md). Concrete API routes are defined at scaffolding (SRS §17 DEC-B54).

## Offline and sync behavior


And in these edge cases (see above):

- The Admin approves an excuse while the Teacher's device is offline

## Related E2E test scenarios

**Completion gate:** this spec is complete only when `npm run e2e:gate -- US-017` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](../../../e2e/README.md)).

**API (Playwright):**

- [e2e/api/f04-attendance.spec.ts](../../../e2e/api/f04-attendance.spec.ts) — F04-AC15 (US-017) Admin approval counts as Leave and is audited
- [e2e/api/f04-attendance.spec.ts](../../../e2e/api/f04-attendance.spec.ts) — F04-AC16 (US-017) Admin rejection of a Leave counts as a normal absence
- [e2e/api/f04-attendance.spec.ts](../../../e2e/api/f04-attendance.spec.ts) — F04-AC17 (US-017) a Teacher cannot approve or reject a Leave
- [e2e/api/f04-attendance.spec.ts](../../../e2e/api/f04-attendance.spec.ts) — F04-AC22 (US-017) Leave marked by an Admin is approved at once

**Mobile (Maestro):**

- [e2e/mobile/f04-attendance/leave.yaml](../../../e2e/mobile/f04-attendance/leave.yaml) — F04 Leave — Teacher marks Leave with a reason, Admin approves and rejects

**Unit (Vitest):**

- [packages/domain/calendar/calendar.test.ts](../../../packages/domain/calendar/calendar.test.ts) — F04-AC15 (US-017) Admin approval makes it an approved LEAVE
- [packages/domain/calendar/calendar.test.ts](../../../packages/domain/calendar/calendar.test.ts) — F04-AC16 (US-017) Admin rejection makes it a normal absence with status rejected
- [packages/domain/calendar/calendar.test.ts](../../../packages/domain/calendar/calendar.test.ts) — F04-AC17 (US-017) a Teacher cannot approve or reject a Leave

## Open decisions and blockers

None specific to this story. See the [feature open questions](README.md#open-questions).

## Traceability

- **Story:** US-017 → SPEC-US-017 (this file)
- **Detailed criteria:** F04-AC15, F04-AC16, F04-AC17, F04-AC22
- **Requirements:** FR-CAL-005, FR-CAL-008
- **SRS acceptance tests:** None
- **Business rules:** SRS §9 #6
- **Design:** design.md §13; **Architecture:** ARCHITECTURE.md §18 epic 4
- **Previous location:** `docs/specs/F04-calendar-attendance.md`

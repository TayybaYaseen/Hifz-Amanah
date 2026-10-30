# SPEC-US-013 · Configure class timetable

| | |
|---|---|
| **Spec ID** | SPEC-US-013 |
| **User story** | US-013 |
| **Feature** | [F04 · Calendar and attendance](README.md) |
| **Epic** | EPIC 4 — Calendar and Attendance ([user-stories.md](../../user-stories.md)) |
| **Status** | draft |
| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |
| **Split from** | `docs/specs/F04-calendar-attendance.md` on 2026-10-30 |

## User story

**US-013 — Configure class timetable**

As an Admin, I want to define recurring class schedules.

Spec wording (from F04):

- **US-013:** As an Admin, I want to define recurring class schedules, so that the app knows which days are class days.

**Feature context** (shared by every story in F04, copied from the feature spec):

> Attendance answers a different question from performance. Attendance is about whether the student was there; performance is about how they recited. The schedule decides which days count. A holiday or an unscheduled day can never become an absence. Bulk Entry exists so a teacher can mark a whole class quickly, and it records **attendance only**: Present, Late, Half day, Leave, or Absent (revised 2026-10-30, DEC-B22).
>
> Leave (which replaced "excused absence") takes two steps: the Teacher marks it with a required reason, then the Admin decides. Leave marked by an Admin is approved at once.
>
> There is no code yet. This feature builds the `calendar` module ([ARCHITECTURE.md §6.3, §6.5](../../ARCHITECTURE.md)): the `class_schedules`, `calendar_exceptions`, and `attendance_records` tables. Attendance writes go through the offline outbox (F12).

## Related functional requirements

Requirements this story covers. SRS.md has no story-to-requirement table, so this list is derived from the requirement text and the criteria below.

- **Functional:** FR-CAL-001, FR-CAL-006
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

- **F04-AC1** — **(US-013) Given** a class scheduled Monday to Saturday, **when** the weekly report for a week is built, **then** the scheduled class days are that week's Monday to Saturday, and Sunday is a no-class day.
- **F04-AC2** — **(US-013) Given** a schedule changed from a given effective date, **when** reports are built, **then** days before that date use the old schedule and days from that date use the new one.

## Business rules

From SRS §9 (verbatim):

- **BR-7:** Holidays and unscheduled dates are not absences.

## Validation rules

No validation rule beyond the criteria above.

## Edge cases and error handling

Rows from the F04 edge-case table that apply to this story (verbatim):

| Situation | What should happen |
|---|---|
| A student is enrolled in the middle of a week | Days before the enrollment are not scheduled days for that student |

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
- **Other stories in F04:** [US-014](us-014-manage-holidays-and-closures.md), [US-015](us-015-record-attendance-in-bulk.md), [US-016](us-016-request-leave.md), [US-017](us-017-approve-leave.md)

## Related screens and UI

- **Feature flow** (from F04): Timetable and holidays ([design.md §4.14](../../design.md)); Bulk Entry ([§4.8](../../design.md)); Daily Entry Step 2 ([§4.7](../../design.md))

[design.md §13](../../design.md) story-to-screen map (verbatim):

| Story | Screen (this document) | Key interaction | Required states beyond standard | Validation shown | Accessibility / localization specifics |
|---|---|---|---|---|---|
| US-013, US-014 | §4.14 Timetable and holidays | Define schedule; add holiday or closure | No records | Holiday notice in Daily and Bulk Entry: no automatic absence | Day types as text labels; no danger color for holidays |

## Related API and data model

- **Modules** ([ARCHITECTURE.md §18](../../ARCHITECTURE.md)): `calendar`
- Tables and services are described in the feature context above and in [ARCHITECTURE.md](../../ARCHITECTURE.md). Concrete API routes are defined at scaffolding (SRS §17 DEC-B54).

## Offline and sync behavior

Nothing specific to this story in the source documents.

## Related E2E test scenarios

**Completion gate:** this spec is complete only when `npm run e2e:gate -- US-013` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](../../../e2e/README.md)).

**API (Playwright):**

- [e2e/api/f04-attendance.spec.ts](../../../e2e/api/f04-attendance.spec.ts) — F04-AC1 (US-013) a Monday–Saturday class has Sunday as a no-class day
- [e2e/api/f04-attendance.spec.ts](../../../e2e/api/f04-attendance.spec.ts) — F04-AC2 (US-013) a schedule change applies from its effective date only

**Mobile (Maestro):**

- [e2e/mobile/f04-attendance/schedule-holidays.yaml](../../../e2e/mobile/f04-attendance/schedule-holidays.yaml) — F04 calendar — schedule, holiday, class exception, holiday notice in Bulk Entry

**Unit (Vitest):**

- [packages/domain/calendar/calendar.test.ts](../../../packages/domain/calendar/calendar.test.ts) — F04-AC1 (US-013) a Monday–Saturday schedule makes Sunday a no-class day
- [packages/domain/calendar/calendar.test.ts](../../../packages/domain/calendar/calendar.test.ts) — F04-AC2 (US-013) days before a schedule change use the old schedule; days from its effective date use the new one

## Open decisions and blockers

None specific to this story. See the [feature open questions](README.md#open-questions).

## Traceability

- **Story:** US-013 → SPEC-US-013 (this file)
- **Detailed criteria:** F04-AC1, F04-AC2
- **Requirements:** FR-CAL-001, FR-CAL-006
- **SRS acceptance tests:** None
- **Business rules:** SRS §9 #7
- **Design:** design.md §13; **Architecture:** ARCHITECTURE.md §18 epic 4
- **Previous location:** `docs/specs/F04-calendar-attendance.md`

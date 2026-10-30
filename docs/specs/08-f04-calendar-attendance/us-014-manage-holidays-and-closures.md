# SPEC-US-014 · Manage holidays and closures

| | |
|---|---|
| **Spec ID** | SPEC-US-014 |
| **User story** | US-014 |
| **Feature** | [F04 · Calendar and attendance](README.md) |
| **Epic** | EPIC 4 — Calendar and Attendance ([user-stories.md](../../user-stories.md)) |
| **Status** | draft |
| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |
| **Split from** | `docs/specs/F04-calendar-attendance.md` on 2026-10-30 |

## User story

**US-014 — Manage holidays and closures**

As an Admin, I want to mark holidays and no-class dates.

Spec wording (from F04):

- **US-014:** As an Admin, I want to mark holidays and no-class dates, so that those days are never counted as absences.

**Feature context** (shared by every story in F04, copied from the feature spec):

> Attendance answers a different question from performance. Attendance is about whether the student was there; performance is about how they recited. The schedule decides which days count. A holiday or an unscheduled day can never become an absence. Bulk Entry exists so a teacher can mark a whole class quickly, and it records **attendance only**: Present, Late, Half day, Leave, or Absent (revised 2026-10-30, DEC-B22).
>
> Leave (which replaced "excused absence") takes two steps: the Teacher marks it with a required reason, then the Admin decides. Leave marked by an Admin is approved at once.
>
> There is no code yet. This feature builds the `calendar` module ([ARCHITECTURE.md §6.3, §6.5](../../ARCHITECTURE.md)): the `class_schedules`, `calendar_exceptions`, and `attendance_records` tables. Attendance writes go through the offline outbox (F12).

## Related functional requirements

Requirements this story covers. SRS.md has no story-to-requirement table, so this list is derived from the requirement text and the criteria below.

- **Functional:** FR-CAL-002, FR-CAL-004, FR-CAL-005, FR-CAL-009
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

- **F04-AC3** — **(US-014) Given** a holiday declared for the whole madrasa on a date, **when** that date is reported, **then** it shows as a holiday, and no student is counted absent for it.
- **F04-AC4** — **(US-014) Given** a no-class exception for one class on a date, **when** that date is reported, **then** only that class's students show "no class" for it.
- **F04-AC5** — **(US-014) Given** a date that is a holiday, **when** a Teacher opens Bulk Entry for that date, **then** the screen says it is a holiday and that no absence is recorded automatically.
- **F04-AC20** — **(US-014) Given** attendance or daily records already saved for a date, **when** the Admin declares a holiday on it, **then** the Admin is warned with the number of records and must confirm. After confirming, the date is not a working day, those records are excluded from reports and homework suggestions but kept in history, and new entries for that date are refused. *(Added 2026-10-30, DEC-B21.)*

## Business rules

From SRS §9 (verbatim):

- **BR-7:** Holidays and unscheduled dates are not absences.

## Validation rules

Stated in these criteria: F04-AC20.

## Edge cases and error handling

Rows from the F04 edge-case table that apply to this story (verbatim):

| Situation | What should happen |
|---|---|
| A holiday is added after attendance was already recorded for that date | The Admin is warned and confirms; the records are excluded from reports, kept in history, and never deleted (DEC-B21, F04-AC20) |

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
- **Other stories in F04:** [US-013](us-013-configure-class-timetable.md), [US-015](us-015-record-attendance-in-bulk.md), [US-016](us-016-request-leave.md), [US-017](us-017-approve-leave.md)

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

**Completion gate:** this spec is complete only when `npm run e2e:gate -- US-014` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](../../../e2e/README.md)).

**API (Playwright):**

- [e2e/api/f04-attendance.spec.ts](../../../e2e/api/f04-attendance.spec.ts) — F04-AC3 (US-014) a madrasa holiday is shown as a holiday with no absences
- [e2e/api/f04-attendance.spec.ts](../../../e2e/api/f04-attendance.spec.ts) — F04-AC4 (US-014) a no-class exception affects only that class
- [e2e/api/f04-attendance.spec.ts](../../../e2e/api/f04-attendance.spec.ts) — F04-AC20 (US-014) a holiday declared on a recorded date excludes its records and refuses new ones

**Mobile (Maestro):**

- [e2e/mobile/f04-attendance/attendance-statuses.yaml](../../../e2e/mobile/f04-attendance/attendance-statuses.yaml) — F04 Late, Half day, Leave in Bulk Entry; Absent after reciting; late holiday
- [e2e/mobile/f04-attendance/schedule-holidays.yaml](../../../e2e/mobile/f04-attendance/schedule-holidays.yaml) — F04 calendar — schedule, holiday, class exception, holiday notice in Bulk Entry

**Unit (Vitest):**

- [packages/domain/calendar/calendar.test.ts](../../../packages/domain/calendar/calendar.test.ts) — F04-AC3 (US-014) a madrasa-wide holiday is a holiday, never an absence
- [packages/domain/calendar/calendar.test.ts](../../../packages/domain/calendar/calendar.test.ts) — F04-AC4 (US-014) a no-class exception applies only to that class
- [packages/domain/calendar/calendar.test.ts](../../../packages/domain/calendar/calendar.test.ts) — F04-AC20 (US-014) a holiday declared on a recorded date excludes its records and refuses new ones

## Open decisions and blockers

Open questions from F04 that apply to this story, with their resolutions (decision review of 2026-10-30, SRS §17):

- [x] What happens to recorded attendance when a holiday is declared on that date afterwards? **Resolved:** The Admin is warned; records are excluded from reports but kept; new entries refused (DEC-B21, FR-CAL-009).

## Traceability

- **Story:** US-014 → SPEC-US-014 (this file)
- **Detailed criteria:** F04-AC3, F04-AC4, F04-AC5, F04-AC20
- **Requirements:** FR-CAL-002, FR-CAL-004, FR-CAL-005, FR-CAL-009
- **SRS acceptance tests:** None
- **Business rules:** SRS §9 #7
- **Design:** design.md §13; **Architecture:** ARCHITECTURE.md §18 epic 4
- **Previous location:** `docs/specs/F04-calendar-attendance.md`

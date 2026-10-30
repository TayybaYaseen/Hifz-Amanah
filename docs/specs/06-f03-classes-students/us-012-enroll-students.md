# SPEC-US-012 · Enroll students

| | |
|---|---|
| **Spec ID** | SPEC-US-012 |
| **User story** | US-012 |
| **Feature** | [F03 · Classes and students](README.md) |
| **Epic** | EPIC 3 — Classes and Students ([user-stories.md](../../user-stories.md)) |
| **Status** | draft |
| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |
| **Split from** | `docs/specs/F03-classes-students.md` on 2026-10-30 |

## User story

**US-012 — Enroll students**

As an Admin, I want to enroll students into classes and preserve history when enrollment changes.

Spec wording (from F03):

- **US-012:** As an Admin, I want to enroll students into classes and keep history when enrollment changes, so that past records still show the class the student was in at the time.

**Feature context** (shared by every story in F03, copied from the feature spec):

> Classes group students under one or more teachers. Every daily record, attendance mark, and report hangs off a student, so students and their class history must never be lost, even when a student leaves or moves class.
>
> There is no code yet. This feature builds the `roster` module, which consists of the `classes`, `class_teachers`, `students`, and `student_enrollments` tables ([ARCHITECTURE.md §6.3](../../ARCHITECTURE.md)). Its scope rules come from F02.

## Related functional requirements

Requirements this story covers. SRS.md has no story-to-requirement table, so this list is derived from the requirement text and the criteria below.

- **Functional:** FR-STU-002, FR-STU-006
- **Non-functional:** Not applicable
- **SRS acceptance tests cited:** None

Feature requirement set (from F03; additions of 2026-10-30 at the end): FR-CLS-001/002, FR-STU-001…004, NFR-PERF-001, NFR-PRV-001, FR-CLS-003, FR-STU-005/006

## Acceptance criteria

### Story acceptance criteria

Verbatim from [user-stories.md](../../user-stories.md).

1. The action is available only to an authorized role in the active madrasa/workspace.
2. The system validates inputs and displays clear success, empty, and error states.
3. Changes are persisted and reflected in dependent views without losing historical records.

### Detailed acceptance criteria

From the F03 feature spec. The original IDs are kept because tests cite them. Criteria marked *Revised* or *Added* come from the decision review of 2026-10-30 (SRS §17).

- **F03-AC11** — **(US-012) Given** a student enrolled in Class A, **when** the Admin moves them to Class B from a given date, **then** the Class A enrollment ends the day before and the Class B enrollment starts on that date.
- **F03-AC12** — **(US-012) Given** a student moved from Class A to Class B, **when** a report for an earlier period is viewed, **then** records from before the move still show Class A.
- **F03-AC13** — **(US-012) Given** a student's profile, **when** the Details tab is opened, **then** the full enrollment history is listed with start and end dates.
- **F03-AC18** — **(US-012) Given** a student with an active enrollment in Class A, **when** they are enrolled in Class B, **then** it is handled as a move: the Class A enrollment ends and only Class B is active. *(Added 2026-10-30, DEC-B57.)*

## Business rules

No SRS §9 business rule is specific to this story. The rules it follows are stated in the criteria above.

## Validation rules

No validation rule beyond the criteria above.

## Edge cases and error handling

Rows from the F03 edge-case table that apply to this story (verbatim):

| Situation | What should happen |
|---|---|
| An enrollment start date is in the future | Allowed. The student appears in that class from that date |

**Out of scope for the whole feature** (verbatim from F03):

- Students registering themselves.
- Student photos, fees, or contact books (beyond what NFR-PRV-001 allows).
- Creating Student login accounts (F01, US-003).
- Guardian linking (F10).
- Bulk import of students (F14, US-058).

## Dependencies

- **Feature F03 depends on:** F02 (from the spec index)
- **Features referenced by this story's criteria and edge cases:** None
- **Other stories referenced:** None
- **Other stories in F03:** [US-010](us-010-create-and-maintain-classes.md), [US-011](us-011-create-student-profiles.md)

## Related screens and UI

- **Feature flow** (from F03): More → Classes (design gap); Student list and profile ([design.md §4.5–4.6](../../design.md))

[design.md §13](../../design.md) story-to-screen map (verbatim):

| Story | Screen (this document) | Key interaction | Required states beyond standard | Validation shown | Accessibility / localization specifics |
|---|---|---|---|---|---|
| US-011, US-012 | §4.5 Student list; §4.6 Student profile; add/edit form | Search, filter by class and status, paginate, add, deactivate, change enrollment | No records; page loading | Required fields only (NFR-PRV-001) | Long names wrap without clipping; roll number distinguishes students with the same name |

## Related API and data model

- **Modules** ([ARCHITECTURE.md §18](../../ARCHITECTURE.md)): `roster`
- Tables and services are described in the feature context above and in [ARCHITECTURE.md](../../ARCHITECTURE.md). Concrete API routes are defined at scaffolding (SRS §17 DEC-B54).

## Offline and sync behavior

Nothing specific to this story in the source documents.

## Related E2E test scenarios

**Completion gate:** this spec is complete only when `npm run e2e:gate -- US-012` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](../../../e2e/README.md)).

**API (Playwright):**

- [e2e/api/f03-roster.spec.ts](../../../e2e/api/f03-roster.spec.ts) — F03-AC11 (US-012) moving a student ends the old enrollment the day before
- [e2e/api/f03-roster.spec.ts](../../../e2e/api/f03-roster.spec.ts) — F03-AC12 (US-012) records before a move still show the old class
- [e2e/api/f03-roster.spec.ts](../../../e2e/api/f03-roster.spec.ts) — F03-AC18 (US-012) a student has exactly one active class

**Mobile (Maestro):**

- [e2e/mobile/f03-roster/enrollment-move.yaml](../../../e2e/mobile/f03-roster/enrollment-move.yaml) — F03 enrollment — move a student and keep history

**Unit (Vitest):**

- [packages/domain/roster/enrollment.test.ts](../../../packages/domain/roster/enrollment.test.ts) — F03-AC11 (US-012) moving from Class A to Class B on a date ends Class A the day before and starts Class B on that date
- [packages/domain/roster/enrollment.test.ts](../../../packages/domain/roster/enrollment.test.ts) — F03-AC12 (US-012) for a date before the move, the applicable class is Class A
- [packages/domain/roster/enrollment.test.ts](../../../packages/domain/roster/enrollment.test.ts) — F03-AC13 (US-012) enrollment history lists every enrollment with start and end dates in order

## Open decisions and blockers

Open questions from F03 that apply to this story, with their resolutions (decision review of 2026-10-30, SRS §17):

- [x] Can a student be enrolled in two classes at the same time? **Resolved:** No, one active class (DEC-B57, FR-STU-006).

## Traceability

- **Story:** US-012 → SPEC-US-012 (this file)
- **Detailed criteria:** F03-AC11, F03-AC12, F03-AC13, F03-AC18
- **Requirements:** FR-STU-002, FR-STU-006
- **SRS acceptance tests:** None
- **Business rules:** None
- **Design:** design.md §13; **Architecture:** ARCHITECTURE.md §18 epic 3
- **Previous location:** `docs/specs/F03-classes-students.md`

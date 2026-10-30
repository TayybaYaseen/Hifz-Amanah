# SPEC-US-010 · Create and maintain classes

| | |
|---|---|
| **Spec ID** | SPEC-US-010 |
| **User story** | US-010 |
| **Feature** | [F03 · Classes and students](README.md) |
| **Epic** | EPIC 3 — Classes and Students ([user-stories.md](../../user-stories.md)) |
| **Status** | draft |
| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |
| **Split from** | `docs/specs/F03-classes-students.md` on 2026-10-30 |

## User story

**US-010 — Create and maintain classes**

As an Admin, I want to create, edit, and deactivate classes.

Spec wording (from F03):

- **US-010:** As an Admin, I want to create, edit, and deactivate classes, so that the madrasa's classes stay up to date.

**Feature context** (shared by every story in F03, copied from the feature spec):

> Classes group students under one or more teachers. Every daily record, attendance mark, and report hangs off a student, so students and their class history must never be lost, even when a student leaves or moves class.
>
> There is no code yet. This feature builds the `roster` module, which consists of the `classes`, `class_teachers`, `students`, and `student_enrollments` tables ([ARCHITECTURE.md §6.3](../../ARCHITECTURE.md)). Its scope rules come from F02.

## Related functional requirements

Requirements this story covers. SRS.md has no story-to-requirement table, so this list is derived from the requirement text and the criteria below.

- **Functional:** FR-CLS-001, FR-CLS-002, FR-CLS-003
- **Non-functional:** Not applicable
- **SRS acceptance tests cited:** None

Feature requirement set (from F03; additions of 2026-10-30 at the end): FR-CLS-001/002, FR-STU-001…004, NFR-PERF-001, NFR-PRV-001, FR-CLS-003, FR-STU-005/006

## Acceptance criteria

### Story acceptance criteria

Verbatim from [user-stories.md](../../user-stories.md).

1. Only an authorized Admin can create, edit, and deactivate a class and assign one or more teachers to it.
2. The system validates required fields (such as class name) and displays clear success, empty, and error states.
3. A deactivated class is hidden from new entry, but its past attendance, daily records, homework, and reports are kept.

### Detailed acceptance criteria

From the F03 feature spec. The original IDs are kept because tests cite them. Criteria marked *Revised* or *Added* come from the decision review of 2026-10-30 (SRS §17).

- **F03-AC1** — **(US-010) Given** an Admin, **when** they create a class with a name and assign one or more Teachers, **then** the class appears in the class list, and each assigned Teacher can see it.
- **F03-AC2** — **(US-010) Given** an empty class name, **when** the Admin saves, **then** the name field shows an error and nothing is saved.
- **F03-AC3** — **(US-010) Given** a Teacher, **when** they try to create, edit, or deactivate a class, **then** there is no control for it, and the API returns forbidden.
- **F03-AC4** — **(US-010) Given** a class with past attendance and daily records, **when** the Admin deactivates it, **then** it disappears from the class pickers in Daily Entry and Bulk Entry. Its past records and reports remain viewable.
- **F03-AC5** — **(US-010) Given** a madrasa with no classes, **when** the Admin opens Classes, **then** the empty state "No classes yet" and an "Add class" action are shown.
- **F03-AC14** — **(US-010) Given** an active class named "Hifz A", **when** the Admin creates or renames another class to "hifz a", **then** it is rejected with "Class name already in use". The name of a deactivated class may be reused. *(Added 2026-10-30, DEC-B58.)*

## Business rules

No SRS §9 business rule is specific to this story. The rules it follows are stated in the criteria above.

## Validation rules

Stated in these criteria: F03-AC2, F03-AC3, F03-AC14.

## Edge cases and error handling

Rows from the F03 edge-case table that apply to this story (verbatim):

| Situation | What should happen |
|---|---|
| The Admin deactivates a class that still has active students | A warning lists the affected students; the deactivation does not unenroll them automatically |

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
- **Other stories in F03:** [US-011](us-011-create-student-profiles.md), [US-012](us-012-enroll-students.md)

## Related screens and UI

- **Feature flow** (from F03): More → Classes (design gap); Student list and profile ([design.md §4.5–4.6](../../design.md))

[design.md §13](../../design.md) story-to-screen map (verbatim):

| Story | Screen (this document) | Key interaction | Required states beyond standard | Validation shown | Accessibility / localization specifics |
|---|---|---|---|---|---|
| US-010 | §3.2 More → Classes (design gap; cards and FormField) | Add, edit, deactivate class; assign teachers | No records ("No classes yet") | Name required; deactivation confirmation | Active/inactive as a text label |

## Related API and data model

- **Modules** ([ARCHITECTURE.md §18](../../ARCHITECTURE.md)): `roster`
- Tables and services are described in the feature context above and in [ARCHITECTURE.md](../../ARCHITECTURE.md). Concrete API routes are defined at scaffolding (SRS §17 DEC-B54).

## Offline and sync behavior

Nothing specific to this story in the source documents.

## Related E2E test scenarios

**Completion gate:** this spec is complete only when `npm run e2e:gate -- US-010` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](../../../e2e/README.md)).

**API (Playwright):**

- [e2e/api/f03-roster.spec.ts](../../../e2e/api/f03-roster.spec.ts) — F03-AC1 (US-010) a new class with teachers is visible to each assigned Teacher
- [e2e/api/f03-roster.spec.ts](../../../e2e/api/f03-roster.spec.ts) — F03-AC2 (US-010) an empty class name is rejected
- [e2e/api/f03-roster.spec.ts](../../../e2e/api/f03-roster.spec.ts) — F03-AC3 (US-010) a Teacher cannot create, edit, or deactivate a class
- [e2e/api/f03-roster.spec.ts](../../../e2e/api/f03-roster.spec.ts) — F03-AC4 (US-010) a deactivated class leaves pickers but keeps its history
- [e2e/api/f03-roster.spec.ts](../../../e2e/api/f03-roster.spec.ts) — F03-AC14 (US-010) active class names are unique in a madrasa, ignoring case

**Mobile (Maestro):**

- [e2e/mobile/f03-roster/classes.yaml](../../../e2e/mobile/f03-roster/classes.yaml) — F03 classes — empty state, create with teachers, validation, deactivate
- [e2e/mobile/journeys/srs-10-8-end-to-end.yaml](../../../e2e/mobile/journeys/srs-10-8-end-to-end.yaml) — JOURNEY SRS 10.8 — class to guardian view

**Unit (Vitest):**

- [packages/domain/roster/enrollment.test.ts](../../../packages/domain/roster/enrollment.test.ts) — F03-AC4 (US-010) a deactivated class is excluded from entry pickers but kept for past reports

## Open decisions and blockers

Open questions from F03 that apply to this story, with their resolutions (decision review of 2026-10-30, SRS §17):

- [x] Should duplicate class names within a madrasa be blocked or only warned about? **Resolved:** Blocked for active classes, ignoring case (DEC-B58, FR-CLS-003).

## Traceability

- **Story:** US-010 → SPEC-US-010 (this file)
- **Detailed criteria:** F03-AC1, F03-AC2, F03-AC3, F03-AC4, F03-AC5, F03-AC14
- **Requirements:** FR-CLS-001, FR-CLS-002, FR-CLS-003
- **SRS acceptance tests:** None
- **Business rules:** None
- **Design:** design.md §13; **Architecture:** ARCHITECTURE.md §18 epic 3
- **Previous location:** `docs/specs/F03-classes-students.md`

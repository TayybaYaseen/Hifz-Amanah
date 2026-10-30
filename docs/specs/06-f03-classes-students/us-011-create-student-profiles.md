# SPEC-US-011 · Create student profiles

| | |
|---|---|
| **Spec ID** | SPEC-US-011 |
| **User story** | US-011 |
| **Feature** | [F03 · Classes and students](README.md) |
| **Epic** | EPIC 3 — Classes and Students ([user-stories.md](../../user-stories.md)) |
| **Status** | draft |
| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |
| **Split from** | `docs/specs/F03-classes-students.md` on 2026-10-30 |

## User story

**US-011 — Create student profiles**

As an Admin, or a Teacher for my assigned classes, I want to create and maintain student profiles.

Spec wording (from F03):

- **US-011:** As an Admin, I want to create and maintain student profiles, so that every student can be recorded and found.

**Feature context** (shared by every story in F03, copied from the feature spec):

> Classes group students under one or more teachers. Every daily record, attendance mark, and report hangs off a student, so students and their class history must never be lost, even when a student leaves or moves class.
>
> There is no code yet. This feature builds the `roster` module, which consists of the `classes`, `class_teachers`, `students`, and `student_enrollments` tables ([ARCHITECTURE.md §6.3](../../ARCHITECTURE.md)). Its scope rules come from F02.

## Related functional requirements

Requirements this story covers. SRS.md has no story-to-requirement table, so this list is derived from the requirement text and the criteria below.

- **Functional:** FR-STU-001, FR-STU-003, FR-STU-004, FR-STU-005
- **Non-functional:** NFR-PERF-001, NFR-PRV-001
- **SRS acceptance tests cited:** None

Feature requirement set (from F03; additions of 2026-10-30 at the end): FR-CLS-001/002, FR-STU-001…004, NFR-PERF-001, NFR-PRV-001, FR-CLS-003, FR-STU-005/006

## Acceptance criteria

### Story acceptance criteria

Verbatim from [user-stories.md](../../user-stories.md).

1. An Admin can create, edit, and deactivate a student profile in the active madrasa; a Teacher can create and edit profiles only in assigned classes and cannot deactivate them.
2. Student lists support search, filtering, and pagination.
3. Deactivating a student does not delete past daily records, attempts, homework, or reports.

### Detailed acceptance criteria

From the F03 feature spec. The original IDs are kept because tests cite them. Criteria marked *Revised* or *Added* come from the decision review of 2026-10-30 (SRS §17).

- **F03-AC6** — **(US-011) Given** an Admin, **when** they create a student with a name (plus an optional External Student ID and admission date), **then** the student is saved in the active madrasa and the creation is audited.
- **F03-AC7** — **(US-011) Given** an External Student ID that is already used by another student in the same madrasa, **when** the Admin saves, **then** the save is rejected with a field error.
- **F03-AC8** — **(US-011) Given** a list of more than one page of students, **when** the user searches by name or External Student ID, or filters by class or status, **then** only matching students are shown, page by page.
- **F03-AC9** — **(US-011) Given** a student with daily records, attempts, homework, and reports, **when** the Admin deactivates the student, **then** none of those records are deleted. The student leaves the entry pickers but stays in reports for earlier periods.
- **F03-AC10** — **(US-011) Given** a deactivated student, **when** the Admin reactivates them, **then** they appear again in the entry pickers with all of their history intact.
- **F03-AC15** — **(US-011) Given** a Teacher assigned to Class A, **when** they add or edit a student in Class A, **then** it is saved and audited. Adding or editing a student in a class they are not assigned to is refused. *(Added 2026-10-30, DEC-B14.)*
- **F03-AC16** — **(US-011) Given** a Teacher, **when** they try to deactivate a student, move a student to another class, or create a Student or Parent login account, **then** there is no control for it, and the API returns forbidden. *(Added 2026-10-30, DEC-B14.)*
- **F03-AC17** — **(US-011) Given** the add-student form, **when** it opens, **then** only name and class are required; roll number / External Student ID, admission date, and private notes are optional; and there is no date of birth, address, phone, or photo field. *(Added 2026-10-30, DEC-B56.)*
- **F03-AC19** — **(US-011) Given** a class with 60 students, **when** the list is requested, **then** the first page has 25 students and the next pages load on request, with search and filters applied on the server. *(Added 2026-10-30, DEC-B59.)*

## Business rules

No SRS §9 business rule is specific to this story. The rules it follows are stated in the criteria above.

## Validation rules

Stated in these criteria: F03-AC7, F03-AC15, F03-AC16, F03-AC17.

## Edge cases and error handling

Rows from the F03 edge-case table that apply to this story (verbatim):

| Situation | What should happen |
|---|---|
| Two students have the same name | Both are allowed. Lists show the External Student ID or roll number so they can be told apart |
| A long name, or a name in Urdu script | It wraps without clipping and is shown in the correct direction |
| A search finds no students | "No matching students" with a "Clear filters" action |

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
- **Other stories in F03:** [US-010](us-010-create-and-maintain-classes.md), [US-012](us-012-enroll-students.md)

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

**Completion gate:** this spec is complete only when `npm run e2e:gate -- US-011` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](../../../e2e/README.md)).

**API (Playwright):**

- [e2e/api/f03-roster.spec.ts](../../../e2e/api/f03-roster.spec.ts) — F03-AC6 (US-011) a new student is saved in the active madrasa and audited
- [e2e/api/f03-roster.spec.ts](../../../e2e/api/f03-roster.spec.ts) — F03-AC7 (US-011) a duplicate External Student ID in the same madrasa is rejected
- [e2e/api/f03-roster.spec.ts](../../../e2e/api/f03-roster.spec.ts) — F03-AC8 (US-011) search and filters page through matching students only
- [e2e/api/f03-roster.spec.ts](../../../e2e/api/f03-roster.spec.ts) — F03-AC9 (US-011) deactivating a student deletes nothing
- [e2e/api/f03-roster.spec.ts](../../../e2e/api/f03-roster.spec.ts) — F03-AC10 (US-011) reactivating a student restores them to pickers with history intact
- [e2e/api/f03-roster.spec.ts](../../../e2e/api/f03-roster.spec.ts) — F03-AC15 (US-011) a Teacher adds and edits students only in assigned classes
- [e2e/api/f03-roster.spec.ts](../../../e2e/api/f03-roster.spec.ts) — F03-AC16 (US-011) a Teacher cannot deactivate or move students or create login accounts
- [e2e/api/f03-roster.spec.ts](../../../e2e/api/f03-roster.spec.ts) — F03-AC19 (US-011) student lists page 25 at a time with server-side filters

**Mobile (Maestro):**

- [e2e/mobile/f03-roster/students.yaml](../../../e2e/mobile/f03-roster/students.yaml) — F03 students — add, duplicate external ID, search and filter, deactivate and reactivate
- [e2e/mobile/f03-roster/teacher-students.yaml](../../../e2e/mobile/f03-roster/teacher-students.yaml) — F03 Teacher adds students in assigned classes; minimal student form

**Unit (Vitest):**

- [packages/domain/roster/enrollment.test.ts](../../../packages/domain/roster/enrollment.test.ts) — F03-AC9 (US-011) a deactivated student is excluded from entry pickers but kept in reports for earlier periods
- [packages/domain/roster/enrollment.test.ts](../../../packages/domain/roster/enrollment.test.ts) — F03-AC10 (US-011) a reactivated student is eligible for entry pickers again

## Open decisions and blockers

Open questions from F03 that apply to this story, with their resolutions (decision review of 2026-10-30, SRS §17):

- [x] Which student fields are required beyond the name (NFR-PRV-001: collect only what is needed)? **Resolved:** Name and class required; roll number/External Student ID, admission date, private notes optional (DEC-B56, FR-STU-005).
- [x] May Teachers create or edit students? FR-STU-001 says "authorized users"; the draft matrix says Admin only. **Resolved:** Yes, in assigned classes only; deactivating and moving stay Admin-only (DEC-B14, FR-STU-001).
- [x] Page size for student lists. **Resolved:** 25 per page, more on scroll (DEC-B59, NFR-PERF-001).

## Traceability

- **Story:** US-011 → SPEC-US-011 (this file)
- **Detailed criteria:** F03-AC6, F03-AC7, F03-AC8, F03-AC9, F03-AC10, F03-AC15, F03-AC16, F03-AC17, F03-AC19
- **Requirements:** FR-STU-001, FR-STU-003, FR-STU-004, NFR-PERF-001, NFR-PRV-001, FR-STU-005
- **SRS acceptance tests:** None
- **Business rules:** None
- **Design:** design.md §13; **Architecture:** ARCHITECTURE.md §18 epic 3
- **Previous location:** `docs/specs/F03-classes-students.md`

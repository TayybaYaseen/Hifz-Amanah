# F03 · Classes and students

**Status:** draft
**Brief:** [00-product-brief.md](../00-product-brief.md) · **Flow:** More → Classes (design gap); Student list and profile ([design.md §4.5–4.6](../../design.md))
**Stories:** US-010 – US-012 · **Requirements:** FR-CLS-001/002, FR-STU-001…004, NFR-PERF-001, NFR-PRV-001

## Context

Classes group students under one or more teachers. Every daily record, attendance mark, and report hangs off a student, so students and their class history must never be lost, even when a student leaves or moves class.

There is no code yet. This feature builds the `roster` module, which consists of the `classes`, `class_teachers`, `students`, and `student_enrollments` tables ([ARCHITECTURE.md §6.3](../../ARCHITECTURE.md)). Its scope rules come from F02.

## User story

- **US-010:** As an Admin, I want to create, edit, and deactivate classes, so that the madrasa's classes stay up to date.
- **US-011:** As an Admin, I want to create and maintain student profiles, so that every student can be recorded and found.
- **US-012:** As an Admin, I want to enroll students into classes and keep history when enrollment changes, so that past records still show the class the student was in at the time.

## Acceptance criteria

1. **(US-010) Given** an Admin, **when** they create a class with a name and assign one or more Teachers, **then** the class appears in the class list, and each assigned Teacher can see it.
2. **(US-010) Given** an empty class name, **when** the Admin saves, **then** the name field shows an error and nothing is saved.
3. **(US-010) Given** a Teacher, **when** they try to create, edit, or deactivate a class, **then** there is no control for it, and the API returns forbidden.
4. **(US-010) Given** a class with past attendance and daily records, **when** the Admin deactivates it, **then** it disappears from the class pickers in Daily Entry and Bulk Entry. Its past records and reports remain viewable.
5. **(US-010) Given** a madrasa with no classes, **when** the Admin opens Classes, **then** the empty state "No classes yet" and an "Add class" action are shown.
6. **(US-011) Given** an Admin, **when** they create a student with a name (plus an optional External Student ID and admission date), **then** the student is saved in the active madrasa and the creation is audited.
7. **(US-011) Given** an External Student ID that is already used by another student in the same madrasa, **when** the Admin saves, **then** the save is rejected with a field error.
8. **(US-011) Given** a list of more than one page of students, **when** the user searches by name or External Student ID, or filters by class or status, **then** only matching students are shown, page by page.
9. **(US-011) Given** a student with daily records, attempts, homework, and reports, **when** the Admin deactivates the student, **then** none of those records are deleted. The student leaves the entry pickers but stays in reports for earlier periods.
10. **(US-011) Given** a deactivated student, **when** the Admin reactivates them, **then** they appear again in the entry pickers with all of their history intact.
11. **(US-012) Given** a student enrolled in Class A, **when** the Admin moves them to Class B from a given date, **then** the Class A enrollment ends the day before and the Class B enrollment starts on that date.
12. **(US-012) Given** a student moved from Class A to Class B, **when** a report for an earlier period is viewed, **then** records from before the move still show Class A.
13. **(US-012) Given** a student's profile, **when** the Details tab is opened, **then** the full enrollment history is listed with start and end dates.

## Out of scope

- Students registering themselves.
- Student photos, fees, or contact books (beyond what NFR-PRV-001 allows).
- Creating Student login accounts (F01, US-003).
- Guardian linking (F10).
- Bulk import of students (F14, US-058).

## Edge cases

| Situation | What should happen |
|---|---|
| Two students have the same name | Both are allowed. Lists show the External Student ID or roll number so they can be told apart |
| A long name, or a name in Urdu script | It wraps without clipping and is shown in the correct direction |
| An enrollment start date is in the future | Allowed. The student appears in that class from that date |
| The Admin deactivates a class that still has active students | A warning lists the affected students; the deactivation does not unenroll them automatically |
| A search finds no students | "No matching students" with a "Clear filters" action |

## Open questions

- [ ] Which student fields are required beyond the name (NFR-PRV-001: collect only what is needed)?
- [ ] Can a student be enrolled in two classes at the same time?
- [ ] May Teachers create or edit students? FR-STU-001 says "authorized users"; the draft matrix says Admin only.
- [ ] Should duplicate class names within a madrasa be blocked or only warned about?
- [ ] Page size for student lists.

## Done means

- [ ] Every acceptance criterion has a passing test.
- [ ] `npm run e2e:gate -- F03` passes: every criterion has an E2E test, none is pending, and all pass (e2e/README.md).
- [ ] Nothing from "Out of scope" was built.
- [ ] `npm test` and `npm run lint` pass.
- [ ] No delete path exists for classes, students, or enrollments (deactivate only), and no cascading delete into history.

## Test plan

| Level | What it covers | Where |
|---|---|---|
| **Unit** | Enrollment date-range logic (end-the-day-before, which class applies on a given date) | `packages/domain/roster/*.test.ts` |
| **Integration** | Class/student CRUD by role, unique External Student ID, search/filter/pagination, deactivation keeping history, enrollment moves | `apps/api/test/roster/*.test.ts` |
| **Component** | Student list search and filters, empty states, long and Urdu names, enrollment history list | `apps/mobile/src/features/students/__tests__/*.test.tsx`, `apps/mobile/src/features/classes/__tests__/*.test.tsx` |
| **E2E** | Every acceptance criterion: server-side checks (API) and device journeys (Maestro), including: Admin creates a class and a student, enrolls them, and moves them to another class | `e2e/api/f03-roster.spec.ts`, `e2e/mobile/f03-roster/` |

**Traceability:** Each test name starts with its criterion, e.g. `F03-AC11 (US-012) …`. Every AC 1–13 has at least one test.

**Coverage:** ≥80% on new code.

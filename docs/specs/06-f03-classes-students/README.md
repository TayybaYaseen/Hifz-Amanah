# F03 · Classes and students

**Status:** draft
**Brief:** [00-product-brief.md](../../00-product-brief.md) · **Flow:** More → Classes (design gap); Student list and profile ([design.md §4.5–4.6](../../design.md))
**Requirements:** FR-CLS-001/002, FR-STU-001…004, NFR-PERF-001, NFR-PRV-001, FR-CLS-003, FR-STU-005/006
**Stories:** US-010 – US-012 · **Depends on:** F02
**Build order:** 6 of 17 (dependency level 2)

This folder has one spec per user story. This page keeps what applies to the whole feature: context, scope, edge cases, open questions, the feature test plan, and its definition of done. Story specs repeat the edge cases and open questions that apply to them.

## Story specs

| Spec | Story | Detailed criteria |
|---|---|---|
| [SPEC-US-010](us-010-create-and-maintain-classes.md) | US-010 — Create and maintain classes | F03-AC1, F03-AC2, F03-AC3, F03-AC4, F03-AC5, F03-AC14 |
| [SPEC-US-011](us-011-create-student-profiles.md) | US-011 — Create student profiles | F03-AC6, F03-AC7, F03-AC8, F03-AC9, F03-AC10, F03-AC15, F03-AC16, F03-AC17, F03-AC19 |
| [SPEC-US-012](us-012-enroll-students.md) | US-012 — Enroll students | F03-AC11, F03-AC12, F03-AC13, F03-AC18 |

## Context

Classes group students under one or more teachers. Every daily record, attendance mark, and report hangs off a student, so students and their class history must never be lost, even when a student leaves or moves class.

There is no code yet. This feature builds the `roster` module, which consists of the `classes`, `class_teachers`, `students`, and `student_enrollments` tables ([ARCHITECTURE.md §6.3](../../ARCHITECTURE.md)). Its scope rules come from F02.

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

## Open questions (resolved 2026-10-30)

- [x] Which student fields are required beyond the name (NFR-PRV-001: collect only what is needed)? **Resolved:** Name and class required; roll number/External Student ID, admission date, private notes optional (DEC-B56, FR-STU-005).
- [x] Can a student be enrolled in two classes at the same time? **Resolved:** No, one active class (DEC-B57, FR-STU-006).
- [x] May Teachers create or edit students? FR-STU-001 says "authorized users"; the draft matrix says Admin only. **Resolved:** Yes, in assigned classes only; deactivating and moving stay Admin-only (DEC-B14, FR-STU-001).
- [x] Should duplicate class names within a madrasa be blocked or only warned about? **Resolved:** Blocked for active classes, ignoring case (DEC-B58, FR-CLS-003).
- [x] Page size for student lists. **Resolved:** 25 per page, more on scroll (DEC-B59, NFR-PERF-001).

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

**Traceability:** Each test name starts with its criterion, e.g. `F03-AC11 (US-012) …`. Every AC 1–19 has at least one test.

**Coverage:** ≥80% on new code.

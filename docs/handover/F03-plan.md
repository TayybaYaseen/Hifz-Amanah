# F03 plan — Classes and students

**Branch:** `feature/f03-classes-students`, from `origin/main` (`30e3bfa`, F12 merged).
**Specs:** `docs/specs/06-*` · **Stories:** US-010, US-011, US-012 · **Requirements:** FR-CLS-001…003, FR-STU-001…006,
NFR-PERF-001, NFR-PRV-001, DEC-B14, DEC-B56…B59 · **Status:** built 2026-11-08; the F03 gate is PENDING (see "Status").

## What was built

| Layer | Where | What |
|---|---|---|
| Migration | `apps/api/migrations/0007_roster.sql` | `classes`, `class_teachers` (assignment history), `students`, `student_enrollments`. Composite `(organization_id, id)` FKs, row-level security on all four (ADR-016 pattern), a trigger refusing DELETE for every role, column-limited UPDATE grants |
| Domain | `packages/domain/roster` | Calendar dates (`addDays`, `calendarDateIn`), `planEnrollment` / `applyPlan` (moves), `classOn`, `enrollmentHistory`, `pickerClasses`, `eligibleForEntry`, `inReportPeriod` |
| Contracts | `packages/contracts/src/roster.ts` | Strict request schemas, responses, field issue codes, page size 25 |
| API | `apps/api/src/modules/roster` | Class and student services, routes, the roster-backed sync scope provider. Contract: `apps/api/README.md` "Roster routes" |
| Access | `apps/api/src/modules/access/policy.ts` | New capability `students.view` (Owner, Admin, Teacher assigned) |
| F02 change | `organization/membership-service.ts` | "All classes" and Admin ↔ Teacher changes now write `scope_changes` (F12 contract) |
| Test control | `testing/seed.ts`, `testing/control.ts` | Seeds classes A1/A2/B1 with their Teachers and students S1/S2/S3/SB1; `GET /__test/roster/ids` |
| Mobile | `features/classes`, `features/students`, `features/roster` | More → Classes / Students; class list, form, detail (deactivation warning lists active students); student list (search, class and status filters, 25 per page), add/edit form (DEC-B56 fields only), profile with class history and Owner/Admin move, deactivate, reactivate. Strings in all three locales |

## Rules applied, where the documents left a detail open

These follow from the approved criteria; none changes a decision. Say if any should differ.

1. **Enrollment start of a new student** is the admission date when given, otherwise today in the madrasa's timezone.
2. **A move must start after the current enrollment started** (`BEFORE_CURRENT_START`); a move to the same class is
   refused (`SAME_CLASS`). A future start date is allowed (edge case).
3. **Teacher scope over students** is any enrollment in the Teacher's classes that has not ended (current or
   future-dated). During a future-dated move both classes' Teachers see the student. Entry pickers use the strict rule:
   enrolled in that class on that date.
4. **External Student ID** is unique per madrasa ignoring case and surrounding spaces, whatever the student's status.
5. **A class may have no Teacher** (only the name is required, F03-AC2).
6. **Deactivating a student does not end the enrollment** (needed for F03-AC10: reactivation restores the pickers).
7. **Audit summaries** for students carry field names only (names and notes are personal data, ARCHITECTURE §15).
8. **Scope resets** are written for assignment changes, moves (both classes' Teachers), "all classes", and role
   changes. Not for new students (no earlier rows on any device) or student (de)activation (scope is enrollment-based).
9. **Roster is online-only** (ARCHITECTURE §8.3: management is online). F04/F05 decide whether rosters are cached
   on the device for offline entry.

## Status (2026-11-08)

**Results:**
- `npm test`: all pass (roster integration 27, roster domain 12, mobile roster logic 6, plus the existing suite).
- Lint, typecheck, and the Android bundle are clean.
- API E2E against a fresh E2E server: 56 passed, 0 failed (12 F03 tests, F02-AC6 now real, all earlier F01/F02/F12).
- `e2e:trace` and `docs:check`: OK.
- **F03 gate: PENDING** — 7 of 20 E2E tests are pending, all waiting on later features (below).
- Mobile flows were not run: no Maestro CLI or emulator here, and the application ID is Deferred (DEC-B55).

**Still pending, and what each waits for** (the roster part of each passes in `apps/api/test/roster`):

| Test | Waits for |
|---|---|
| API F03-AC4 — past records and reports of a deactivated class | Daily records (F05), reports (F09) |
| API F03-AC9 — records, attempts, homework kept | F05, F08, F09 |
| API F03-AC10 — "history counts" are record counts | F05 |
| API F03-AC12 — a report before the move shows the old class | F09 |
| Mobile `classes.yaml` — steps 4–5 (attendance, pickers, past report) | F04, F05, F09 |
| Mobile `students.yaml` — steps 4–5 (earlier report, Daily History) | F05, F09 |
| Mobile `enrollment-move.yaml` — step 3 (report) | F09 |

`teacher-students.yaml` (F03-AC15, AC17) is written and no longer pending; it is BLOCKED until DEC-B55.

Component tests for the screens: the repo still has no React Native component-test setup (Vitest covers `.ts`
only). The screen logic is in `features/roster/roster.ts` with unit tests; the Maestro flows cover the screens.

## Open questions for the user

1. **Row-level security on `users`, `memberships`, `audit_logs`.** Migration 0005's comment said these get RLS "with
   F03". Not built: sign-in finds a user across madaris by User ID before any organization is known, so these tables
   need a design (e.g. a narrow `SECURITY DEFINER` lookup for sign-in) rather than the plain pattern. Proposed: a
   separate small change with its own ADR. Every query on them already filters by organization.
2. **Future-dated moves and sync scope.** When a future move takes effect, the old class's Teacher loses the student
   on that date without any write, so no scope reset is recorded and their device keeps the cached rows until the next
   reset or sign-in. Options: (a) accept for MVP; (b) a daily job writes scope changes for moves taking effect that day
   (needs the pg-boss workers). Proposed: (b) when workers exist.
3. **Student list "more on scroll".** The list loads the next 25 with a "Load more" button (as the Accounts list does)
   rather than automatically on scroll. Switching to a virtualized list that loads on scroll is a UI-only change.

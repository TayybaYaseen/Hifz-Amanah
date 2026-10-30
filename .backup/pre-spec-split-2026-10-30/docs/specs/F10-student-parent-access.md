# F10 · Student and Parent access

**Status:** draft
**Brief:** [00-product-brief.md](../00-product-brief.md) · **Flow:** Student read-only experience ([design.md §4.11](../../design.md)); Guardian read-only experience ([§4.12](../../design.md)); note visibility control ([§5.4](../../design.md))
**Stories:** US-044 – US-046 · **Requirements:** FR-PORT-001…005, FR-SEC-004…006, NFR-PORT-001…006, NFR-PRV-004

## Context

Students and Parents can follow progress in the Android app. Their access is online and read-only, and it covers published reports only:
- a Student sees only their own reports
- a Parent sees only children they have been verified as linked to

Teacher notes marked internal must **never** reach them through any channel.

There is no code yet. This feature builds:
- the `portal` module
- `student_guardians` linking
- the `notes.visibility` field
- the single `projectFor(audience)` choke point ([ARCHITECTURE.md §7.4](../../ARCHITECTURE.md))

Report content comes from F09.

## User story

- **US-044:** As a Student, I want read-only access to my published reports in the Android app, so that I can follow my own progress.
- **US-045:** As a Parent, I want read-only access to reports for my verified linked children, so that I know how they are doing.
- **US-046:** As a Teacher, I want internal notes hidden from Student and Parent views, so that I can write candid notes for staff.

## Acceptance criteria

1. **(US-044) Given** a signed-in Student, **when** they open Reports, **then** they see only their own published reports, and there are no edit controls anywhere.
2. **(US-044) Given** a signed-in Student, **when** they request another student's report by changing an ID, **then** the response is "not found".
3. **(US-044) Given** a report period that has not been published, **when** the Student opens Reports, **then** that period is not listed, and its data is not in any response.
4. **(US-044) Given** a Student with no internet connection, **when** they open the app, **then** a "network unavailable" state is shown, with no cached report data.
5. **(US-045) Given** a Parent verified-linked to two children, **when** they open the app, **then** they can switch between those two children only.
6. **(US-045) Given** a Parent who knows another student's name, phone, or email, **when** they look for that student, **then** there is no search, and API requests for that student return "not found".
7. **(US-045) Given** a Parent whose link to a child is revoked, **when** they next request that child's data, **then** the request is refused, and the child disappears from their switcher.
8. **(US-045) Given** an Admin linking, verifying, or revoking a Parent, **when** the action succeeds, **then** it is audited.
9. **(US-046) Given** a Teacher writing a note, **when** they don't change visibility, **then** the note is "Private to staff" by default.
10. **(US-046) Given** a note set to "Private to staff", **when** a Student or Parent view, API response, PDF, Excel export, or push notification is produced, **then** the note's text is not present in it.
11. **(US-046) Given** a note set to "Visible to student/guardian", **when** the Student or a linked Parent views the report, **then** the note is shown.
12. **(US-046) Given** a Teacher who changes a note's visibility, **when** it is saved, **then** the change is audited.

## Out of scope

- A browser-based portal.
- Offline report caching for Students and Parents.
- Students or Parents editing, commenting on, or replying to anything.
- Parents finding or claiming a student by themselves.
- Messaging between Teachers and Parents.

## Edge cases

| Situation | What should happen |
|---|---|
| A Parent is linked to children in two madaris | Two separate accounts (F01 US-006); each shows only its own madrasa's child |
| A Student account is deactivated | Sign-in is refused (F01) |
| A report is unpublished after a Parent saw it | It disappears on the next fetch |
| An internal note is quoted inside a visible remark by mistake | Not detectable automatically. The visibility control shows a clear label and a warning before export (design.md §4.15) |
| A Student and a Parent share one device | Each signs in separately; nothing is cached between them |

## Open questions

- [ ] D3: who publishes reports, and is it per week, per month, or automatic?
- [ ] D5: the guardian linking and verification steps (who verifies, and with what proof).
- [ ] Which report fields are hidden from Students and Parents besides internal notes (for example the teacher's name or mistake details)?

## Done means

- [ ] Every acceptance criterion has a passing test.
- [ ] `npm run e2e:gate -- F10` passes: every criterion has an E2E test, none is pending, and all pass (e2e/README.md).
- [ ] Nothing from "Out of scope" was built.
- [ ] `npm test` and `npm run lint` pass.
- [ ] A leak test plants a unique marker string in an internal note and asserts that it never appears in any Student/Parent API response, PDF, Excel export, or push payload (AC-SEC-04, AC-XLS-06).

## Test plan

| Level | What it covers | Where |
|---|---|---|
| **Unit** | `projectFor(audience)` removes internal notes and unpublished periods for STUDENT and PARENT | `apps/api/src/modules/access/projection.test.ts` |
| **Integration** | Student self-only access, Parent linked-only access, revocation, ID probing, the leak-marker test across all channels, audit of link/visibility changes | `apps/api/test/portal/*.test.ts` |
| **Component** | Read-only screens with no edit controls, child switcher, offline state, visibility segmented control with default "Private to staff" | `apps/mobile/src/features/portal/__tests__/*.test.tsx` |
| **E2E** | Every acceptance criterion: server-side checks (API) and device journeys (Maestro), including: Teacher writes one internal and one shared note → Parent signs in → sees only the shared note | `e2e/api/f10-portal.spec.ts`, `e2e/mobile/f10-portal/` |

**Traceability:** Each test name starts with its criterion, e.g. `F10-AC10 (US-046) …`. Every AC 1–12 has at least one test.

**Coverage:** ≥80% on new code (100% on `projectFor`).

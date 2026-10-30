# SPEC-US-045 · Parent views linked student reports

| | |
|---|---|
| **Spec ID** | SPEC-US-045 |
| **User story** | US-045 |
| **Feature** | [F10 · Student and Parent access](README.md) |
| **Epic** | EPIC 10 — Student and Parent Access ([user-stories.md](../../user-stories.md)) |
| **Status** | draft |
| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |
| **Split from** | `docs/specs/F10-student-parent-access.md` on 2026-10-30 |

## User story

**US-045 — Parent views linked student reports**

As a Parent, I want read-only access to reports for verified linked students.

Spec wording (from F10):

- **US-045:** As a Parent, I want read-only access to reports for my verified linked children, so that I know how they are doing.

**Feature context** (shared by every story in F10, copied from the feature spec):

> Students and Parents can follow progress in the Android app. Their access is online and read-only, and it covers published reports only:
> - a Student sees only their own reports
> - a Parent sees only children they have been verified as linked to
>
> Teacher notes marked internal must **never** reach them through any channel.
>
> There is no code yet. This feature builds:
> - the `portal` module
> - `student_guardians` linking
> - the `notes.visibility` field
> - the single `projectFor(audience)` choke point ([ARCHITECTURE.md §7.4](../../ARCHITECTURE.md))
>
> Report content comes from F09.

## Related functional requirements

Requirements this story covers. SRS.md has no story-to-requirement table, so this list is derived from the requirement text and the criteria below.

- **Functional:** FR-PORT-002, FR-PORT-005, FR-SEC-005, FR-PORT-007
- **Non-functional:** NFR-PORT-003, NFR-PORT-006
- **SRS acceptance tests cited:** None

Feature requirement set (from F10; additions of 2026-10-30 at the end): FR-PORT-001…005, FR-SEC-004…006, NFR-PORT-001…006, NFR-PRV-004, FR-RPT-010, FR-PORT-006/007

## Acceptance criteria

### Story acceptance criteria

Verbatim from [user-stories.md](../../user-stories.md).

1. The report is derived from source daily records, attempts, schedules, attendance, and homework history for the selected period.
2. Attendance and performance are separate; Leave and normal absences are distinct.
3. Missing quality is excluded from averages, repeated attempts are not double-counted, and viewer permissions filter notes/fields.

### Detailed acceptance criteria

From the F10 feature spec. The original IDs are kept because tests cite them. Criteria marked *Revised* or *Added* come from the decision review of 2026-10-30 (SRS §17).

- **F10-AC5** — **(US-045) Given** a Parent verified-linked to two children, **when** they open the app, **then** they can switch between those two children only.
- **F10-AC6** — **(US-045) Given** a Parent who knows another student's name, phone, or email, **when** they look for that student, **then** there is no search, and API requests for that student return "not found".
- **F10-AC7** — **(US-045) Given** a Parent whose link to a child is revoked, **when** they next request that child's data, **then** the request is refused, and the child disappears from their switcher.
- **F10-AC8** — **(US-045) Given** an Admin linking, verifying, or revoking a Parent, **when** the action succeeds, **then** it is audited.
- **F10-AC16** — **(US-045) Given** an Admin linking a Parent to a student, **when** the link is saved, **then** the verification method is required and recorded. A Teacher cannot create or revoke a link. *(Added 2026-10-30, DEC-B37.)*

## Business rules

From SRS §9 (verbatim):

- **BR-12:** Parent/student access requires authorization and verified linking.

## Validation rules

Stated in these criteria: F10-AC7, F10-AC16.

## Edge cases and error handling

Rows from the F10 edge-case table that apply to this story (verbatim):

| Situation | What should happen |
|---|---|
| A Parent is linked to children in two madaris | Two separate accounts (F01 US-006); each shows only its own madrasa's child |
| A report is unpublished after a Parent saw it | It disappears on the next fetch |
| A Student and a Parent share one device | Each signs in separately; nothing is cached between them |

**Out of scope for the whole feature** (verbatim from F10):

- A browser-based portal.
- Offline report caching for Students and Parents.
- Students or Parents editing, commenting on, or replying to anything.
- Parents finding or claiming a student by themselves.
- Messaging between Teachers and Parents.

## Dependencies

- **Feature F10 depends on:** F09 (from the spec index)
- **Features referenced by this story's criteria and edge cases:** F01
- **Other stories referenced:** US-006
- **Other stories in F10:** [US-044](us-044-student-views-own-reports.md), [US-046](us-046-protect-private-teacher-notes.md)

## Related screens and UI

- **Feature flow** (from F10): Student read-only experience ([design.md §4.11](../../design.md)); Guardian read-only experience ([§4.12](../../design.md)); note visibility control ([§5.4](../../design.md))

[design.md §13](../../design.md) story-to-screen map (verbatim):

| Story | Screen (this document) | Key interaction | Required states beyond standard | Validation shown | Accessibility / localization specifics |
|---|---|---|---|---|---|
| US-045 | §4.12 Guardian read-only | Linking state ("contact the madrasa"); switcher across verified linked students; reports | Offline (network unavailable); Permission revoked | — | Never a student search |

## Related API and data model

- **Modules** ([ARCHITECTURE.md §18](../../ARCHITECTURE.md)): `portal`, `access`
- Tables and services are described in the feature context above and in [ARCHITECTURE.md](../../ARCHITECTURE.md). Concrete API routes are defined at scaffolding (SRS §17 DEC-B54).

## Offline and sync behavior


And in these edge cases (see above):

- A Student and a Parent share one device

## Related E2E test scenarios

**Completion gate:** this spec is complete only when `npm run e2e:gate -- US-045` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](../../../e2e/README.md)).

**API (Playwright):**

- [e2e/api/f10-portal.spec.ts](../../../e2e/api/f10-portal.spec.ts) — F10-AC5 (US-045) a Parent with two verified links can access exactly those children
- [e2e/api/f10-portal.spec.ts](../../../e2e/api/f10-portal.spec.ts) — F10-AC6 (US-045) a Parent has no student search and gets not found for other students
- [e2e/api/f10-portal.spec.ts](../../../e2e/api/f10-portal.spec.ts) — F10-AC7 (US-045) a revoked link refuses that child and removes it from the list
- [e2e/api/f10-portal.spec.ts](../../../e2e/api/f10-portal.spec.ts) — F10-AC8 (US-045) linking, verifying, and revoking a Parent are audited
- [e2e/api/f10-portal.spec.ts](../../../e2e/api/f10-portal.spec.ts) — F10-AC16 (US-045) Parent links need a recorded verification method and are Admin-only

**Mobile (Maestro):**

- [e2e/mobile/f10-portal/parent-linked-children.yaml](../../../e2e/mobile/f10-portal/parent-linked-children.yaml) — F10 parent — switch linked children, no search, revoked link

**Unit (Vitest):**

- None

## Open decisions and blockers

Open questions from F10 that apply to this story, with their resolutions (decision review of 2026-10-30, SRS §17):

- [x] D3: who publishes reports, and is it per week, per month, or automatic? **Resolved:** Teacher or Admin publishes manually (DEC-B33, FR-RPT-010).
- [x] D5: the guardian linking and verification steps (who verifies, and with what proof). **Resolved:** The Admin links after offline verification and records the method (DEC-B37, FR-PORT-007).

## Traceability

- **Story:** US-045 → SPEC-US-045 (this file)
- **Detailed criteria:** F10-AC5, F10-AC6, F10-AC7, F10-AC8, F10-AC16
- **Requirements:** FR-PORT-002, FR-PORT-005, FR-SEC-005, NFR-PORT-003, NFR-PORT-006, FR-PORT-007
- **SRS acceptance tests:** None
- **Business rules:** SRS §9 #12
- **Design:** design.md §13; **Architecture:** ARCHITECTURE.md §18 epic 10
- **Previous location:** `docs/specs/F10-student-parent-access.md`

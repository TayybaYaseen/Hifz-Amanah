# SPEC-US-044 · Student views own reports

| | |
|---|---|
| **Spec ID** | SPEC-US-044 |
| **User story** | US-044 |
| **Feature** | [F10 · Student and Parent access](README.md) |
| **Epic** | EPIC 10 — Student and Parent Access ([user-stories.md](../../user-stories.md)) |
| **Status** | draft |
| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |
| **Split from** | `docs/specs/F10-student-parent-access.md` on 2026-10-30 |

## User story

**US-044 — Student views own reports**

As a Student, I want read-only access to my published reports in the Android app.

Spec wording (from F10):

- **US-044:** As a Student, I want read-only access to my published reports in the Android app, so that I can follow my own progress.

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

- **Functional:** FR-PORT-001, FR-SEC-004, FR-RPT-010, FR-PORT-006
- **Non-functional:** NFR-PORT-001, NFR-PORT-002, NFR-PORT-005
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

- **F10-AC1** — **(US-044) Given** a signed-in Student, **when** they open Reports, **then** they see only their own published reports, and there are no edit controls anywhere.
- **F10-AC2** — **(US-044) Given** a signed-in Student, **when** they request another student's report by changing an ID, **then** the response is "not found".
- **F10-AC3** — **(US-044) Given** a report period that has not been published, **when** the Student opens Reports, **then** that period is not listed, and its data is not in any response.
- **F10-AC4** — **(US-044) Given** a Student with no internet connection, **when** they open the app, **then** a "network unavailable" state is shown, with no cached report data.
- **F10-AC13** — **(US-044) Given** a week whose records are all synced, **when** the Teacher of that class or an Admin publishes it for the class, **then** every student's weekly report becomes visible to that student and their linked Parents, and the publish action is audited. *(Added 2026-10-30, DEC-B33.)*
- **F10-AC14** — **(US-044) Given** offline changes for the period that have not synced, or no internet connection, **when** someone tries to publish, **then** publishing is refused with the reason. *(Added 2026-10-30, DEC-B33.)*
- **F10-AC15** — **(US-044) Given** a published report, **when** a source record in that period is corrected, **then** the Student and Parent see the corrected values with "Updated on …". *(Added 2026-10-30, DEC-B33.)*
- **F10-AC17** — **(US-044) Given** a published report for a Student or Parent, **when** it is returned, **then** it contains attendance, portions with quantities and statuses, quality as number + label, mistake counts by category, the overall label, confirmed homework, visible remarks, and the teacher's name, and no internal notes, Leave reasons, draft homework, AI output, audit, or sync details. *(Added 2026-10-30, DEC-B36.)*

## Business rules

From SRS §9 (verbatim):

- **BR-12:** Parent/student access requires authorization and verified linking.
- **BR-13:** Internal-only notes are excluded from unauthorized outputs.

## Validation rules

Stated in these criteria: F10-AC14.

## Edge cases and error handling

Rows from the F10 edge-case table that apply to this story (verbatim):

| Situation | What should happen |
|---|---|
| A Student account is deactivated | Sign-in is refused (F01) |
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
- **Other stories referenced:** None
- **Other stories in F10:** [US-045](us-045-parent-views-linked-student-reports.md), [US-046](us-046-protect-private-teacher-notes.md)

## Related screens and UI

- **Feature flow** (from F10): Student read-only experience ([design.md §4.11](../../design.md)); Guardian read-only experience ([§4.12](../../design.md)); note visibility control ([§5.4](../../design.md))

[design.md §13](../../design.md) story-to-screen map (verbatim):

| Story | Screen (this document) | Key interaction | Required states beyond standard | Validation shown | Accessibility / localization specifics |
|---|---|---|---|---|---|
| US-044 | §4.11 Student read-only | View own published progress and reports | Offline (network unavailable, no cache); No records ("No report is available yet") | — | No edit controls anywhere |

## Related API and data model

- **Modules** ([ARCHITECTURE.md §18](../../ARCHITECTURE.md)): `portal`, `access`
- Tables and services are described in the feature context above and in [ARCHITECTURE.md](../../ARCHITECTURE.md). Concrete API routes are defined at scaffolding (SRS §17 DEC-B54).

## Offline and sync behavior

Stated in these criteria: F10-AC4, F10-AC13, F10-AC14, F10-AC17.

And in these edge cases (see above):

- A Student and a Parent share one device

## Related E2E test scenarios

**Completion gate:** this spec is complete only when `npm run e2e:gate -- US-044` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](../../../e2e/README.md)).

**API (Playwright):**

- [e2e/api/f10-portal.spec.ts](../../../e2e/api/f10-portal.spec.ts) — F10-AC1 (US-044) a Student lists only their own published reports and cannot write
- [e2e/api/f10-portal.spec.ts](../../../e2e/api/f10-portal.spec.ts) — F10-AC2 (US-044) another student report by ID returns not found
- [e2e/api/f10-portal.spec.ts](../../../e2e/api/f10-portal.spec.ts) — F10-AC3 (US-044) unpublished periods are absent from every response
- [e2e/api/f10-portal.spec.ts](../../../e2e/api/f10-portal.spec.ts) — F10-AC13 (US-044) a Teacher or Admin publishes a class’s weekly reports
- [e2e/api/f10-portal.spec.ts](../../../e2e/api/f10-portal.spec.ts) — F10-AC14 (US-044) publishing is refused while the period has unsynced changes
- [e2e/api/f10-portal.spec.ts](../../../e2e/api/f10-portal.spec.ts) — F10-AC15 (US-044) a corrected published report shows Updated on
- [e2e/api/f10-portal.spec.ts](../../../e2e/api/f10-portal.spec.ts) — F10-AC17 (US-044) Student and Parent reports contain exactly the approved fields

**Mobile (Maestro):**

- [e2e/mobile/f10-portal/publish-reports.yaml](../../../e2e/mobile/f10-portal/publish-reports.yaml) — F10 Teacher publishes reports for a class
- [e2e/mobile/f10-portal/student-read-only.yaml](../../../e2e/mobile/f10-portal/student-read-only.yaml) — F10 student — own published reports, read-only, offline state

**Unit (Vitest):**

- [apps/api/src/modules/access/projection.test.ts](../../../apps/api/src/modules/access/projection.test.ts) — F10-AC3 (US-044) removes unpublished report periods for STUDENT and PARENT

## Open decisions and blockers

Open questions from F10 that apply to this story, with their resolutions (decision review of 2026-10-30, SRS §17):

- [x] D3: who publishes reports, and is it per week, per month, or automatic? **Resolved:** Teacher or Admin publishes manually (DEC-B33, FR-RPT-010).

## Traceability

- **Story:** US-044 → SPEC-US-044 (this file)
- **Detailed criteria:** F10-AC1, F10-AC2, F10-AC3, F10-AC4, F10-AC13, F10-AC14, F10-AC15, F10-AC17
- **Requirements:** FR-PORT-001, FR-SEC-004, NFR-PORT-001, NFR-PORT-002, NFR-PORT-005, FR-RPT-010, FR-PORT-006
- **SRS acceptance tests:** None
- **Business rules:** SRS §9 #12, SRS §9 #13
- **Design:** design.md §13; **Architecture:** ARCHITECTURE.md §18 epic 10
- **Previous location:** `docs/specs/F10-student-parent-access.md`

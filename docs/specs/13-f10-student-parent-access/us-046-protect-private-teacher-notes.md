# SPEC-US-046 · Protect private teacher notes

| | |
|---|---|
| **Spec ID** | SPEC-US-046 |
| **User story** | US-046 |
| **Feature** | [F10 · Student and Parent access](README.md) |
| **Epic** | EPIC 10 — Student and Parent Access ([user-stories.md](../../user-stories.md)) |
| **Status** | draft |
| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |
| **Split from** | `docs/specs/F10-student-parent-access.md` on 2026-10-30 |

## User story

**US-046 — Protect private teacher notes**

As a Teacher, I want internal notes hidden from Student and Parent views.

Spec wording (from F10):

- **US-046:** As a Teacher, I want internal notes hidden from Student and Parent views, so that I can write candid notes for staff.

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

- **Functional:** FR-PORT-003, FR-PORT-004, FR-SEC-006
- **Non-functional:** NFR-PORT-004, NFR-PRV-004
- **SRS acceptance tests cited:** None

Feature requirement set (from F10; additions of 2026-10-30 at the end): FR-PORT-001…005, FR-SEC-004…006, NFR-PORT-001…006, NFR-PRV-004, FR-RPT-010, FR-PORT-006/007

## Acceptance criteria

### Story acceptance criteria

Verbatim from [user-stories.md](../../user-stories.md).

1. Student sees only their own published, read-only records; Parent sees only verified linked students.
2. Internal-only teacher notes are excluded from APIs, screens, exports, and PDFs for Student/Parent.
3. Authorization is enforced server-side for every requested record and export.

### Detailed acceptance criteria

From the F10 feature spec. The original IDs are kept because tests cite them. Criteria marked *Revised* or *Added* come from the decision review of 2026-10-30 (SRS §17).

- **F10-AC9** — **(US-046) Given** a Teacher writing a note, **when** they don't change visibility, **then** the note is "Private to staff" by default.
- **F10-AC10** — **(US-046) Given** a note set to "Private to staff", **when** a Student or Parent view, API response, PDF, Excel export, or push notification is produced, **then** the note's text is not present in it.
- **F10-AC11** — **(US-046) Given** a note set to "Visible to student/guardian", **when** the Student or a linked Parent views the report, **then** the note is shown.
- **F10-AC12** — **(US-046) Given** a Teacher who changes a note's visibility, **when** it is saved, **then** the change is audited.

## Business rules

From SRS §9 (verbatim):

- **BR-13:** Internal-only notes are excluded from unauthorized outputs.

## Validation rules

No validation rule beyond the criteria above.

## Edge cases and error handling

Rows from the F10 edge-case table that apply to this story (verbatim):

| Situation | What should happen |
|---|---|
| An internal note is quoted inside a visible remark by mistake | Not detectable automatically. The visibility control shows a clear label and a warning before export (design.md §4.15) |

**Out of scope for the whole feature** (verbatim from F10):

- A browser-based portal.
- Offline report caching for Students and Parents.
- Students or Parents editing, commenting on, or replying to anything.
- Parents finding or claiming a student by themselves.
- Messaging between Teachers and Parents.

## Dependencies

- **Feature F10 depends on:** F09 (from the spec index)
- **Features referenced by this story's criteria and edge cases:** None
- **Other stories referenced:** None
- **Other stories in F10:** [US-044](us-044-student-views-own-reports.md), [US-045](us-045-parent-views-linked-student-reports.md)

## Related screens and UI

- **Feature flow** (from F10): Student read-only experience ([design.md §4.11](../../design.md)); Guardian read-only experience ([§4.12](../../design.md)); note visibility control ([§5.4](../../design.md))

[design.md §13](../../design.md) story-to-screen map (verbatim):

| Story | Screen (this document) | Key interaction | Required states beyond standard | Validation shown | Accessibility / localization specifics |
|---|---|---|---|---|---|
| US-046 | §5.4 remarks footer; §4.15 export warning | Visibility segmented control: Private to staff / Visible to student/guardian | — | Warning before exporting private notes | Visibility shown as a text label |

## Related API and data model

- **Modules** ([ARCHITECTURE.md §18](../../ARCHITECTURE.md)): `portal`, `access`
- Tables and services are described in the feature context above and in [ARCHITECTURE.md](../../ARCHITECTURE.md). Concrete API routes are defined at scaffolding (SRS §17 DEC-B54).

## Offline and sync behavior

Nothing specific to this story in the source documents.

## Related E2E test scenarios

**Completion gate:** this spec is complete only when `npm run e2e:gate -- US-046` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](../../../e2e/README.md)).

**API (Playwright):**

- [e2e/api/f10-portal.spec.ts](../../../e2e/api/f10-portal.spec.ts) — F10-AC9 (US-046) a note saved without visibility is private to staff
- [e2e/api/f10-portal.spec.ts](../../../e2e/api/f10-portal.spec.ts) — F10-AC10 (US-046) private note text never reaches Student or Parent channels (AC-SEC-04)
- [e2e/api/f10-portal.spec.ts](../../../e2e/api/f10-portal.spec.ts) — F10-AC11 (US-046) a shared note is visible to the Student and linked Parent
- [e2e/api/f10-portal.spec.ts](../../../e2e/api/f10-portal.spec.ts) — F10-AC12 (US-046) changing note visibility is audited

**Mobile (Maestro):**

- [e2e/mobile/f10-portal/note-visibility.yaml](../../../e2e/mobile/f10-portal/note-visibility.yaml) — F10 notes — private by default; Parent and Student see only shared notes

**Unit (Vitest):**

- [apps/api/src/modules/access/projection.test.ts](../../../apps/api/src/modules/access/projection.test.ts) — F10-AC10 (US-046) removes private-to-staff note text for STUDENT
- [apps/api/src/modules/access/projection.test.ts](../../../apps/api/src/modules/access/projection.test.ts) — F10-AC10 (US-046) removes private-to-staff note text for PARENT
- [apps/api/src/modules/access/projection.test.ts](../../../apps/api/src/modules/access/projection.test.ts) — F10-AC11 (US-046) keeps notes visible to student/guardian for STUDENT and PARENT
- [apps/api/src/modules/access/projection.test.ts](../../../apps/api/src/modules/access/projection.test.ts) — F10-AC9 (US-046) a new note is private to staff by default

## Open decisions and blockers

Open questions from F10 that apply to this story, with their resolutions (decision review of 2026-10-30, SRS §17):

- [x] Which report fields are hidden from Students and Parents besides internal notes (for example the teacher's name or mistake details)? **Resolved:** See FR-PORT-006; teacher name and mistake counts by category are shown (DEC-B36).

## Traceability

- **Story:** US-046 → SPEC-US-046 (this file)
- **Detailed criteria:** F10-AC9, F10-AC10, F10-AC11, F10-AC12
- **Requirements:** FR-PORT-003, FR-PORT-004, FR-SEC-006, NFR-PORT-004, NFR-PRV-004
- **SRS acceptance tests:** None
- **Business rules:** SRS §9 #13
- **Design:** design.md §13; **Architecture:** ARCHITECTURE.md §18 epic 10
- **Previous location:** `docs/specs/F10-student-parent-access.md`

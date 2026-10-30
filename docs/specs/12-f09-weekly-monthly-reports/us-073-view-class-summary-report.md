# SPEC-US-073 · View class summary report

| | |
|---|---|
| **Spec ID** | SPEC-US-073 |
| **User story** | US-073 |
| **Feature** | [F09 · Weekly and monthly reports](README.md) |
| **Epic** | EPIC 9 — Weekly and Monthly Reports ([user-stories.md](../../user-stories.md)) |
| **Status** | draft |
| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |
| **Origin** | Added by the decision review of 2026-10-30 (SRS §17) |

## User story

**US-073 — View class summary report**

As a Teacher or Admin, I want a weekly or monthly summary of every student in a class.

Spec wording (from F09):

- **US-073:** As a Teacher or Admin, I want a weekly or monthly summary of every student in a class, so that I can see the whole class at a glance. *(Added 2026-10-30, DEC-B35.)*

**Feature context** (shared by every story in F09, copied from the feature spec):

> Teachers and Admins need weekly and monthly views without adding up registers by hand. Every report is **calculated from the daily source records**, never typed in. When a record is corrected, the report changes with it.
>
> Attendance and recitation performance are reported separately. Missing data is never shown as zero.
>
> There is no code yet. This feature builds:
> - `buildReport()` in `packages/domain/reports`
> - the API `reporting` module with its `report_cache` ([ARCHITECTURE.md §9.3](../../ARCHITECTURE.md))
>
> It reads from F04, F05, F07, and F08. PDF output is F13, and Student/Parent viewing is F10.

## Related functional requirements

Requirements this story covers. SRS.md has no story-to-requirement table, so this list is derived from the requirement text and the criteria below.

- **Functional:** FR-RPT-011, FR-RPT-001, FR-RPT-004, FR-RPT-005, FR-EXP-003, FR-XLS-007
- **Non-functional:** Not applicable
- **SRS acceptance tests cited:** None

Feature requirement set (from F09; additions of 2026-10-30 at the end): FR-WKR-001…008, FR-MNR-001…007, FR-RPT-001…009, FR-CAL-005, NFR-PERF-002/004, NFR-OFF-008, FR-RPT-011

## Acceptance criteria

### Story acceptance criteria

Verbatim from [user-stories.md](../../user-stories.md).

1. The summary has one row per student enrolled during the period, derived from source records, with attendance counts, portions completed by unit, average quality with its rating count, and outstanding homework.
2. Teachers see summaries only for assigned classes (or all classes with the flag); Students and Parents never see them.
3. The summary exports to PDF and Excel under the same permission and note-visibility rules.

### Detailed acceptance criteria

From the F09 feature spec. The original IDs are kept because tests cite them. Criteria marked *Revised* or *Added* come from the decision review of 2026-10-30 (SRS §17).

- **F09-AC18** — **(US-073) Given** a class and a week or month, **when** the class summary opens, **then** it has one row per student enrolled during the period with attendance counts (Present, Late, Half day, Leave, Absent), portions completed per section by unit, average quality with the number of ratings, and outstanding confirmed homework, all derived from source records. *(Added 2026-10-30, DEC-B35.)*
- **F09-AC19** — **(US-073) Given** a Teacher, Student, or Parent, **when** they request a class summary, **then** a Teacher gets it only for assigned classes (or all classes with the flag), and a Student or Parent is refused. *(Added 2026-10-30, DEC-B35.)*
- **F09-AC20** — **(US-073) Given** a class summary, **when** it is exported as PDF or Excel, **then** the file holds the same rows and values, with no internal notes. *(Added 2026-10-30, DEC-B35.)*

## Business rules

No SRS §9 business rule is specific to this story. The rules it follows are stated in the criteria above.

## Validation rules

Stated in these criteria: F09-AC19.

## Edge cases and error handling

No F09 edge case is specific to this story. See the [feature edge cases](README.md#edge-cases).

**Out of scope for the whole feature** (verbatim from F09):

- Editable report totals.
- PDF generation and templates (F13).
- Excel export (F14).
- AI commentary (F15).
- Reports for unassigned classes (F02 scope rules apply).

## Dependencies

- **Feature F09 depends on:** F04, F05, F07, F08 (from the spec index)
- **Features referenced by this story's criteria and edge cases:** None
- **Other stories referenced:** None
- **Other stories in F09:** [US-039](us-039-view-weekly-report.md), [US-040](us-040-view-monthly-report.md), [US-041](us-041-separate-attendance-and-performance.md), [US-042](us-042-show-leave-and-normal-absence.md), [US-043](us-043-show-portion-level-outcomes.md)

## Related screens and UI

- **Feature flow** (from F09): Reports ([design.md §4.10, §5.8](../../design.md))

[design.md §13](../../design.md) story-to-screen map (verbatim):

| Story | Screen (this document) | Key interaction | Required states beyond standard | Validation shown | Accessibility / localization specifics |
|---|---|---|---|---|---|
| US-073 | §4.10 Reports → Class summary (staff only) | Choose class and week/month; table with one row per student; PDF / Excel export | No records; Offline → Provisional | — | Table has row and column headers for screen readers; numbers in tabular digits |

## Related API and data model

- **Modules** ([ARCHITECTURE.md §18](../../ARCHITECTURE.md)): `reporting`, `packages/domain/reports`
- Tables and services are described in the feature context above and in [ARCHITECTURE.md](../../ARCHITECTURE.md). Concrete API routes are defined at scaffolding (SRS §17 DEC-B54).

## Offline and sync behavior

Nothing specific to this story in the source documents.

## Related E2E test scenarios

**Completion gate:** this spec is complete only when `npm run e2e:gate -- US-073` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](../../../e2e/README.md)).

**API (Playwright):**

- [e2e/api/f09-reports.spec.ts](../../../e2e/api/f09-reports.spec.ts) — F09-AC18 (US-073) the class summary has one derived row per enrolled student
- [e2e/api/f09-reports.spec.ts](../../../e2e/api/f09-reports.spec.ts) — F09-AC19 (US-073) class summaries are staff-only and scoped to assigned classes
- [e2e/api/f09-reports.spec.ts](../../../e2e/api/f09-reports.spec.ts) — F09-AC20 (US-073) class summaries export to PDF and Excel with the same values

**Mobile (Maestro):**

- [e2e/mobile/f09-reports/class-summary.yaml](../../../e2e/mobile/f09-reports/class-summary.yaml) — F09 class summary report

**Unit (Vitest):**

- None

## Open decisions and blockers

None. The story was added by the decision review of 2026-10-30, and its behavior is fully decided (SRS §17).

## Traceability

- **Story:** US-073 → SPEC-US-073 (this file)
- **Detailed criteria:** F09-AC18, F09-AC19, F09-AC20
- **Requirements:** FR-RPT-011, FR-RPT-001, FR-RPT-004, FR-RPT-005, FR-EXP-003, FR-XLS-007
- **SRS acceptance tests:** None
- **Business rules:** None
- **Design:** design.md §13; **Architecture:** ARCHITECTURE.md §18 epic 9
- **Decision:** SRS §17 DEC-B35

# SPEC-US-042 · Show leave and normal absence

| | |
|---|---|
| **Spec ID** | SPEC-US-042 |
| **User story** | US-042 |
| **Feature** | [F09 · Weekly and monthly reports](README.md) |
| **Epic** | EPIC 9 — Weekly and Monthly Reports ([user-stories.md](../../user-stories.md)) |
| **Status** | draft |
| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |
| **Split from** | `docs/specs/F09-weekly-monthly-reports.md` on 2026-10-30 |

## User story

**US-042 — Show leave and normal absence**

As a report viewer, I want Leave and normal absences shown separately.

Spec wording (from F09):

- **US-042:** As a report viewer, I want Leave and normal absences shown separately, so that approved excuses are visible. *(Revised 2026-10-30, DEC-B22.)*

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

- **Functional:** FR-CAL-005
- **Non-functional:** Not applicable
- **SRS acceptance tests cited:** None

Feature requirement set (from F09; additions of 2026-10-30 at the end): FR-WKR-001…008, FR-MNR-001…007, FR-RPT-001…009, FR-CAL-005, NFR-PERF-002/004, NFR-OFF-008, FR-RPT-011

## Acceptance criteria

### Story acceptance criteria

Verbatim from [user-stories.md](../../user-stories.md).

1. Attendance is stored separately from recitation/performance status.
2. Bulk attendance offers Present, Late, Half day, Leave, and Absent only; no Hifz portion, mistake, or quality fields are included, and unmarked students are never saved silently.
3. Holidays, unscheduled dates, and no-class days are not counted as absences; Leave requires a reason and Admin approval.

### Detailed acceptance criteria

From the F09 feature spec. The original IDs are kept because tests cite them. Criteria marked *Revised* or *Added* come from the decision review of 2026-10-30 (SRS §17).

- **F09-AC13** — **(US-042) Given** one Admin-approved Leave, one rejected Leave, and one plain absence, **when** the report is shown, **then** it shows 1 Leave and 2 normal absences. *(Revised 2026-10-30, DEC-B22.)*

## Business rules

From SRS §9 (verbatim):

- **BR-6:** Absence is not failed recitation.

## Validation rules

Stated in these criteria: F09-AC13.

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
- **Other stories in F09:** [US-039](us-039-view-weekly-report.md), [US-040](us-040-view-monthly-report.md), [US-041](us-041-separate-attendance-and-performance.md), [US-043](us-043-show-portion-level-outcomes.md), [US-073](us-073-view-class-summary-report.md)

## Related screens and UI

- **Feature flow** (from F09): Reports ([design.md §4.10, §5.8](../../design.md))

[design.md §13](../../design.md) story-to-screen map (verbatim):

| Story | Screen (this document) | Key interaction | Required states beyond standard | Validation shown | Accessibility / localization specifics |
|---|---|---|---|---|---|
| US-039 to US-043 | §4.10 Reports; §5.8 | Weekly/Monthly switch; filters; drill-down to each portion; Publish for class / per student | No records ("No records for this period"); Offline → Provisional with last sync time and pending count; publishing blocked while changes are unsynced | — | Every chart has a text/table equivalent; missing values shown as "Not recorded"; Late, Half day, Leave, and normal absence shown separately |

## Related API and data model

- **Modules** ([ARCHITECTURE.md §18](../../ARCHITECTURE.md)): `reporting`, `packages/domain/reports`
- Tables and services are described in the feature context above and in [ARCHITECTURE.md](../../ARCHITECTURE.md). Concrete API routes are defined at scaffolding (SRS §17 DEC-B54).

## Offline and sync behavior

Nothing specific to this story in the source documents.

## Related E2E test scenarios

**Completion gate:** this spec is complete only when `npm run e2e:gate -- US-042` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](../../../e2e/README.md)).

**API (Playwright):**

- [e2e/api/f09-reports.spec.ts](../../../e2e/api/f09-reports.spec.ts) — F09-AC13 (US-042) Leave and normal absences are counted separately

**Mobile (Maestro):**

- [e2e/mobile/f09-reports/monthly-and-attendance.yaml](../../../e2e/mobile/f09-reports/monthly-and-attendance.yaml) — F09 monthly report — sections, homework measures, difficulty, attendance categories

**Unit (Vitest):**

- [packages/domain/reports/build-report.test.ts](../../../packages/domain/reports/build-report.test.ts) — F09-AC13 (US-042) one approved Leave, one rejected, one plain absence → 1 Leave and 2 normal absences

## Open decisions and blockers

None specific to this story. See the [feature open questions](README.md#open-questions).

## Traceability

- **Story:** US-042 → SPEC-US-042 (this file)
- **Detailed criteria:** F09-AC13
- **Requirements:** FR-CAL-005
- **SRS acceptance tests:** None
- **Business rules:** SRS §9 #6
- **Design:** design.md §13; **Architecture:** ARCHITECTURE.md §18 epic 9
- **Previous location:** `docs/specs/F09-weekly-monthly-reports.md`

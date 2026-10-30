# SPEC-US-040 · View monthly report

| | |
|---|---|
| **Spec ID** | SPEC-US-040 |
| **User story** | US-040 |
| **Feature** | [F09 · Weekly and monthly reports](README.md) |
| **Epic** | EPIC 9 — Weekly and Monthly Reports ([user-stories.md](../../user-stories.md)) |
| **Status** | draft |
| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |
| **Split from** | `docs/specs/F09-weekly-monthly-reports.md` on 2026-10-30 |

## User story

**US-040 — View monthly report**

As a Teacher/Admin, I want a monthly report derived from daily source records.

Spec wording (from F09):

- **US-040:** As a Teacher/Admin, I want a monthly report derived from daily records, so that I can see the month's progress per Para.

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

- **Functional:** FR-MNR-001, FR-MNR-002, FR-MNR-003, FR-MNR-004, FR-MNR-005, FR-MNR-006, FR-MNR-007
- **Non-functional:** Not applicable
- **SRS acceptance tests cited:** None

Feature requirement set (from F09; additions of 2026-10-30 at the end): FR-WKR-001…008, FR-MNR-001…007, FR-RPT-001…009, FR-CAL-005, NFR-PERF-002/004, NFR-OFF-008, FR-RPT-011

## Acceptance criteria

### Story acceptance criteria

Verbatim from [user-stories.md](../../user-stories.md).

1. The report is derived from source daily records, attempts, schedules, attendance, and homework history for the selected period.
2. Attendance and performance are separate; Leave and normal absences are distinct.
3. Missing quality is excluded from averages, repeated attempts are not double-counted, and viewer permissions filter notes/fields.

### Detailed acceptance criteria

From the F09 feature spec. The original IDs are kept because tests cite them. Criteria marked *Revised* or *Added* come from the decision review of 2026-10-30 (SRS §17).

- **F09-AC8** — **(US-040) Given** a month of records, **when** the monthly report is built, **then** Sabaq, Sabqi, and Manzil are aggregated separately, with Para-wise progress and pending portions.
- **F09-AC9** — **(US-040) Given** a month of homework, **when** the monthly report is built, **then** assigned, attempted, completed, and carried-forward homework are shown as four separate measures.
- **F09-AC10** — **(US-040) Given** a Para with a Major or Repeated mistake in 3 or more attempts that month, or Not Remembered 3 or more times, **when** the report is built, **then** that Para is listed as a recurring difficulty, with its mistake counts by category and the dates. A Para with only 2 such attempts is not listed. *(Revised 2026-10-30, DEC-B34.)*

## Business rules

From SRS §9 (verbatim):

- **BR-8:** Weekly/monthly reports are derived from daily source records.
- **BR-16:** Repeated attempts must not be double-counted as separate assigned portions in aggregate progress.
- **BR-17:** Missing data is not the same as zero performance.

## Validation rules

No validation rule beyond the criteria above.

## Edge cases and error handling

Rows from the F09 edge-case table that apply to this story (verbatim):

| Situation | What should happen |
|---|---|
| No records in the period | "No records for this period", never a page of zeros |
| A student joined in the middle of the month | Scheduled days count only from the enrollment date |
| A student moved class in the middle of the month | Days before the move appear under the old class, days after under the new one |

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
- **Other stories in F09:** [US-039](us-039-view-weekly-report.md), [US-041](us-041-separate-attendance-and-performance.md), [US-042](us-042-show-leave-and-normal-absence.md), [US-043](us-043-show-portion-level-outcomes.md), [US-073](us-073-view-class-summary-report.md)

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

**Completion gate:** this spec is complete only when `npm run e2e:gate -- US-040` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](../../../e2e/README.md)).

**API (Playwright):**

- [e2e/api/f09-reports.spec.ts](../../../e2e/api/f09-reports.spec.ts) — F09-AC8 (US-040) the monthly report keeps sections separate with Para-wise progress
- [e2e/api/f09-reports.spec.ts](../../../e2e/api/f09-reports.spec.ts) — F09-AC9 (US-040) monthly homework has four separate measures
- [e2e/api/f09-reports.spec.ts](../../../e2e/api/f09-reports.spec.ts) — F09-AC10 (US-040) a Para with Major or repeated mistakes in 3+ attempts is listed

**Mobile (Maestro):**

- [e2e/mobile/f09-reports/monthly-and-attendance.yaml](../../../e2e/mobile/f09-reports/monthly-and-attendance.yaml) — F09 monthly report — sections, homework measures, difficulty, attendance categories

**Unit (Vitest):**

- [packages/domain/reports/build-report.test.ts](../../../packages/domain/reports/build-report.test.ts) — F09-AC8 (US-040) Sabaq, Sabqi, and Manzil are aggregated separately with Para-wise progress and pending portions
- [packages/domain/reports/build-report.test.ts](../../../packages/domain/reports/build-report.test.ts) — F09-AC9 (US-040) assigned, attempted, completed, and carried-forward homework are four separate measures
- [packages/domain/reports/build-report.test.ts](../../../packages/domain/reports/build-report.test.ts) — F09-AC10 (US-040) a Para with Major or repeated mistakes in 3+ attempts is listed; 2 attempts is not

## Open decisions and blockers

Open questions from F09 that apply to this story, with their resolutions (decision review of 2026-10-30, SRS §17):

- [x] Report publishing for Students/Parents: who publishes, and per week or per month (design.md §11 D3)? **Resolved:** Teacher (assigned classes) or Admin publishes per class or student, per week and month (DEC-B33, FR-RPT-010).
- [x] What counts as a "recurring difficulty"? This spec proposes: a Para with a Major or repeated mistake in at least 2 attempts in the period. **Resolved:** 3 or more attempts with a Major or Repeated mistake, or Not Remembered 3+ times (DEC-B34, FR-MNR-006).
- [x] Should class-level reports (all students) exist in MVP, or student-level only? **Resolved:** Yes, a staff-only class summary (DEC-B35, FR-RPT-011, US-073).

## Traceability

- **Story:** US-040 → SPEC-US-040 (this file)
- **Detailed criteria:** F09-AC8, F09-AC9, F09-AC10
- **Requirements:** FR-MNR-001, FR-MNR-002, FR-MNR-003, FR-MNR-004, FR-MNR-005, FR-MNR-006, FR-MNR-007
- **SRS acceptance tests:** None
- **Business rules:** SRS §9 #8, SRS §9 #16, SRS §9 #17
- **Design:** design.md §13; **Architecture:** ARCHITECTURE.md §18 epic 9
- **Previous location:** `docs/specs/F09-weekly-monthly-reports.md`

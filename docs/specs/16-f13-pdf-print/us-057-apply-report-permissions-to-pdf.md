# SPEC-US-057 · Apply report permissions to PDF

| | |
|---|---|
| **Spec ID** | SPEC-US-057 |
| **User story** | US-057 |
| **Feature** | [F13 · PDF and print](README.md) |
| **Epic** | EPIC 13 — PDF and Print ([user-stories.md](../../user-stories.md)) |
| **Status** | draft |
| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |
| **Split from** | `docs/specs/F13-pdf-print.md` on 2026-10-30 |

## User story

**US-057 — Apply report permissions to PDF**

As a report viewer, I want PDF content restricted exactly like on-screen reports.

Spec wording (from F13):

- **US-057:** As a report viewer, I want PDF content restricted exactly like on-screen reports, so that a PDF never shows more than I may see.

**Feature context** (shared by every story in F13, copied from the feature spec):

> Madaris print reports for files and for parents' meetings. A PDF must look professional, carry the madrasa's branding, and render English, Urdu, Roman Urdu, and Quranic Arabic correctly. It must also follow **exactly** the same permission rules as the on-screen report.
>
> There is no code yet. This feature builds:
> - a server-side renderer that turns an HTML template into a PDF with headless Chromium
> - per-madrasa `report_templates` ([ARCHITECTURE.md §10](../../ARCHITECTURE.md))
>
> Its input is the F09 report after `projectFor(audience)` (F10).

## Related functional requirements

Requirements this story covers. SRS.md has no story-to-requirement table, so this list is derived from the requirement text and the criteria below.

- **Functional:** FR-PDF-003, FR-EXP-003
- **Non-functional:** Not applicable
- **SRS acceptance tests cited:** None

Feature requirement set (from F13; additions of 2026-10-30 at the end): FR-PDF-001…003, FR-EXP-001…003/005, FR-PDF-004

## Acceptance criteria

### Story acceptance criteria

Verbatim from [user-stories.md](../../user-stories.md).

1. PDF generation enforces the same organization, role, student/guardian, and published-report restrictions as the on-screen report, checked server-side.
2. Internal-only teacher notes never appear in PDFs generated for Students or Parents.

### Detailed acceptance criteria

From the F13 feature spec. The original IDs are kept because tests cite them. Criteria marked *Revised* or *Added* come from the decision review of 2026-10-30 (SRS §17).

- **F13-AC10** — **(US-057) Given** a Parent requesting a PDF, **when** it is generated, **then** it contains only their verified linked child's published data, with no internal notes.
- **F13-AC11** — **(US-057) Given** a Teacher requesting a PDF for a student in an unassigned class, **when** the request is made, **then** it is refused exactly as the on-screen report would be.
- **F13-AC12** — **(US-057) Given** a generated PDF, **when** its download link is used after it expires, or by another user, **then** access is refused.

## Business rules

From SRS §9 (verbatim):

- **BR-13:** Internal-only notes are excluded from unauthorized outputs.

## Validation rules

Stated in these criteria: F13-AC11, F13-AC12.

## Edge cases and error handling

No F13 edge case is specific to this story. See the [feature edge cases](README.md#edge-cases).

**Out of scope for the whole feature** (verbatim from F13):

- Editing a PDF's content before export.
- Offline PDF generation.
- Free-form template designers (only the supported controls).
- Emailing PDFs (email notifications are excluded from MVP).

## Dependencies

- **Feature F13 depends on:** F09, F10 (from the spec index)
- **Features referenced by this story's criteria and edge cases:** None
- **Other stories referenced:** None
- **Other stories in F13:** [US-055](us-055-generate-professional-pdf.md), [US-056](us-056-customize-report-template.md)

## Related screens and UI

- **Feature flow** (from F13): Reports → Print / PDF ([design.md §4.10](../../design.md)); Settings → Report template (design gap)

[design.md §13](../../design.md) story-to-screen map (verbatim):

| Story | Screen (this document) | Key interaction | Required states beyond standard | Validation shown | Accessibility / localization specifics |
|---|---|---|---|---|---|
| US-055, US-057 | §4.10 Print/PDF | Print; PDF | Offline (PDF needs network) | — | Fonts: Inter, Noto Nastaliq Urdu, Noto Naskh Arabic; A4 with repeated header, rows never split (FR-PDF-004) |

## Related API and data model

- **Modules** ([ARCHITECTURE.md §18](../../ARCHITECTURE.md)): `reporting` (PDF)
- Tables and services are described in the feature context above and in [ARCHITECTURE.md](../../ARCHITECTURE.md). Concrete API routes are defined at scaffolding (SRS §17 DEC-B54).

## Offline and sync behavior

Nothing specific to this story in the source documents.

## Related E2E test scenarios

**Completion gate:** this spec is complete only when `npm run e2e:gate -- US-057` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](../../../e2e/README.md)).

**API (Playwright):**

- [e2e/api/f13-pdf.spec.ts](../../../e2e/api/f13-pdf.spec.ts) — F13-AC10 (US-057) a Parent PDF has only the linked child published data and no internal notes
- [e2e/api/f13-pdf.spec.ts](../../../e2e/api/f13-pdf.spec.ts) — F13-AC11 (US-057) a Teacher PDF for an unassigned class is refused like the screen report
- [e2e/api/f13-pdf.spec.ts](../../../e2e/api/f13-pdf.spec.ts) — F13-AC12 (US-057) an expired or foreign PDF link is refused

**Mobile (Maestro):**

- [e2e/mobile/f13-pdf/export-pdf.yaml](../../../e2e/mobile/f13-pdf/export-pdf.yaml) — F13 PDF — export weekly and Urdu monthly PDFs from Reports
- [e2e/mobile/f13-pdf/report-template.yaml](../../../e2e/mobile/f13-pdf/report-template.yaml) — F13 template — Admin logo and headings; validation; Teacher has no controls; Parent PDF

**Unit (Vitest):**

- [apps/api/src/modules/reporting/pdf/template.test.ts](../../../apps/api/src/modules/reporting/pdf/template.test.ts) — F13-AC10 (US-057) a Parent PDF is rendered from the PARENT projection with no internal notes

## Open decisions and blockers

Open questions from F13 that apply to this story, with their resolutions (decision review of 2026-10-30, SRS §17):

- [x] How long are generated PDFs kept on the server? **Resolved:** 24 hours (DEC-B44, NFR-PRV-005).

## Traceability

- **Story:** US-057 → SPEC-US-057 (this file)
- **Detailed criteria:** F13-AC10, F13-AC11, F13-AC12
- **Requirements:** FR-PDF-003, FR-EXP-003
- **SRS acceptance tests:** None
- **Business rules:** SRS §9 #13
- **Design:** design.md §13; **Architecture:** ARCHITECTURE.md §18 epic 13
- **Previous location:** `docs/specs/F13-pdf-print.md`

# SPEC-US-055 · Generate professional PDF

| | |
|---|---|
| **Spec ID** | SPEC-US-055 |
| **User story** | US-055 |
| **Feature** | [F13 · PDF and print](README.md) |
| **Epic** | EPIC 13 — PDF and Print ([user-stories.md](../../user-stories.md)) |
| **Status** | draft |
| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |
| **Split from** | `docs/specs/F13-pdf-print.md` on 2026-10-30 |

## User story

**US-055 — Generate professional PDF**

As a Teacher/Admin, I want a professional PDF report.

Spec wording (from F13):

- **US-055:** As a Teacher/Admin, I want a professional PDF report, so that I can print or share it.

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

- **Functional:** FR-PDF-001, FR-EXP-001, FR-EXP-002, FR-EXP-005, FR-PDF-004
- **Non-functional:** Not applicable
- **SRS acceptance tests cited:** None

Feature requirement set (from F13; additions of 2026-10-30 at the end): FR-PDF-001…003, FR-EXP-001…003/005, FR-PDF-004

## Acceptance criteria

### Story acceptance criteria

Verbatim from [user-stories.md](../../user-stories.md).

1. A professional default PDF layout is available for weekly and monthly reports and shows the date range, section details, quantities with units, statuses, and authorized remarks.
2. English, Urdu (RTL), Roman Urdu, and Quranic Arabic text render correctly in the PDF.

### Detailed acceptance criteria

From the F13 feature spec. The original IDs are kept because tests cite them. Criteria marked *Revised* or *Added* come from the decision review of 2026-10-30 (SRS §17).

- **F13-AC1** — **(US-055) Given** a weekly or monthly report, **when** the user taps PDF, **then** a PDF is produced with the report type, date range, timezone, Sabaq/Sabqi/Manzil details, quantities with units, statuses, and authorized remarks.
- **F13-AC2** — **(US-055) Given** a report generated in Urdu, **when** the PDF opens, **then** the layout is right to left, and the Urdu text is shaped correctly (no disconnected letters).
- **F13-AC3** — **(US-055) Given** a report containing a Surah name in Arabic, **when** the PDF opens, **then** the Arabic is identical to the stored text and uses the Quranic font.
- **F13-AC4** — **(US-055) Given** quality scores in the report, **when** the PDF opens, **then** each score is shown as number + label from the approved scale in the report's language.
- **F13-AC5** — **(US-055) Given** a report that spans several pages, **when** it is rendered, **then** table headers repeat on each page, and no row is split across a page break.
- **F13-AC14** — **(US-055) Given** a report long enough for 3 pages, **when** it is rendered, **then** it is A4, the header repeats on each page, no table row is split across pages, and Urdu uses Noto Nastaliq Urdu while Quranic Arabic uses Noto Naskh Arabic. *(Added 2026-10-30, DEC-B40.)*

## Business rules

From SRS §9 (verbatim):

- **BR-14:** English and Roman Urdu use LTR; Urdu script uses RTL.
- **BR-15:** Quranic Arabic must remain intact.

## Validation rules

No validation rule beyond the criteria above.

## Edge cases and error handling

Rows from the F13 edge-case table that apply to this story (verbatim):

| Situation | What should happen |
|---|---|
| The device is offline | The PDF action shows "PDF needs a connection" |
| A very long student name or remark | It wraps inside its cell; the layout does not break |
| Mixed Arabic, Urdu, and Latin in one remark | Each part keeps its direction (bidi isolation) |
| Rendering takes a long time | A progress state is shown, and the user can leave the screen; the file is ready when they return |

**Out of scope for the whole feature** (verbatim from F13):

- Editing a PDF's content before export.
- Offline PDF generation.
- Free-form template designers (only the supported controls).
- Emailing PDFs (email notifications are excluded from MVP).

## Dependencies

- **Feature F13 depends on:** F09, F10 (from the spec index)
- **Features referenced by this story's criteria and edge cases:** None
- **Other stories referenced:** None
- **Other stories in F13:** [US-056](us-056-customize-report-template.md), [US-057](us-057-apply-report-permissions-to-pdf.md)

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


And in these edge cases (see above):

- The device is offline

## Related E2E test scenarios

**Completion gate:** this spec is complete only when `npm run e2e:gate -- US-055` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](../../../e2e/README.md)).

**API (Playwright):**

- [e2e/api/f13-pdf.spec.ts](../../../e2e/api/f13-pdf.spec.ts) — F13-AC1 (US-055) the PDF has type, range, timezone, sections, quantities, statuses, and remarks
- [e2e/api/f13-pdf.spec.ts](../../../e2e/api/f13-pdf.spec.ts) — F13-AC2 (US-055) an Urdu PDF is right to left with shaped text
- [e2e/api/f13-pdf.spec.ts](../../../e2e/api/f13-pdf.spec.ts) — F13-AC3 (US-055) Arabic Surah names are identical and use the Quranic font
- [e2e/api/f13-pdf.spec.ts](../../../e2e/api/f13-pdf.spec.ts) — F13-AC4 (US-055) quality scores appear as number + label in the report language
- [e2e/api/f13-pdf.spec.ts](../../../e2e/api/f13-pdf.spec.ts) — F13-AC5 (US-055) headers repeat and rows never split across pages
- [e2e/api/f13-pdf.spec.ts](../../../e2e/api/f13-pdf.spec.ts) — F13-AC14 (US-055) PDFs are A4 with repeated headers, whole rows, and the approved fonts

**Mobile (Maestro):**

- [e2e/mobile/f13-pdf/export-pdf.yaml](../../../e2e/mobile/f13-pdf/export-pdf.yaml) — F13 PDF — export weekly and Urdu monthly PDFs from Reports

**Unit (Vitest):**

- [apps/api/src/modules/reporting/pdf/template.test.ts](../../../apps/api/src/modules/reporting/pdf/template.test.ts) — F13-AC1 (US-055) the rendered report has type, date range, timezone, section details, quantities with units, statuses, and authorized remarks
- [apps/api/src/modules/reporting/pdf/template.test.ts](../../../apps/api/src/modules/reporting/pdf/template.test.ts) — F13-AC4 (US-055) quality scores render as number + label from the approved scale in the report language
- [apps/api/src/modules/reporting/pdf/template.test.ts](../../../apps/api/src/modules/reporting/pdf/template.test.ts) — F13-AC3 (US-055) Arabic Surah names are identical to the stored text and use the Quranic font
- [apps/api/src/modules/reporting/pdf/template.test.ts](../../../apps/api/src/modules/reporting/pdf/template.test.ts) — F13-AC2 (US-055) an Urdu report renders right to left
- [apps/api/src/modules/reporting/pdf/template.test.ts](../../../apps/api/src/modules/reporting/pdf/template.test.ts) — F13-AC5 (US-055) table headers repeat on each page and rows never split across pages

## Open decisions and blockers

Open questions from F13 that apply to this story, with their resolutions (decision review of 2026-10-30, SRS §17):

- [x] Final font stack for Urdu, Roman Urdu, and Quranic Arabic (SRS §13 #4). **Resolved:** Inter, Noto Nastaliq Urdu, Noto Naskh Arabic; A4 (DEC-B40, FR-PDF-004).

## Traceability

- **Story:** US-055 → SPEC-US-055 (this file)
- **Detailed criteria:** F13-AC1, F13-AC2, F13-AC3, F13-AC4, F13-AC5, F13-AC14
- **Requirements:** FR-PDF-001, FR-EXP-001, FR-EXP-002, FR-EXP-005, FR-PDF-004
- **SRS acceptance tests:** None
- **Business rules:** SRS §9 #14, SRS §9 #15
- **Design:** design.md §13; **Architecture:** ARCHITECTURE.md §18 epic 13
- **Previous location:** `docs/specs/F13-pdf-print.md`

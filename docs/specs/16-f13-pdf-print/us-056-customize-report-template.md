# SPEC-US-056 · Customize report template

| | |
|---|---|
| **Spec ID** | SPEC-US-056 |
| **User story** | US-056 |
| **Feature** | [F13 · PDF and print](README.md) |
| **Epic** | EPIC 13 — PDF and Print ([user-stories.md](../../user-stories.md)) |
| **Status** | draft |
| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |
| **Split from** | `docs/specs/F13-pdf-print.md` on 2026-10-30 |

## User story

**US-056 — Customize report template**

As a Madrasa Admin, I want to customize logo, colors, headings, and layout.

Spec wording (from F13):

- **US-056:** As a Madrasa Admin, I want to customize the logo, colors, headings, and layout, so that reports carry our madrasa's identity.

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

- **Functional:** FR-PDF-002
- **Non-functional:** Not applicable
- **SRS acceptance tests cited:** None

Feature requirement set (from F13; additions of 2026-10-30 at the end): FR-PDF-001…003, FR-EXP-001…003/005, FR-PDF-004

## Acceptance criteria

### Story acceptance criteria

Verbatim from [user-stories.md](../../user-stories.md).

1. Only a Madrasa Admin can customize the report logo, colors, headings, and layout, within the supported template controls.
2. The customization applies to all PDF reports generated for that madrasa and never changes report data or calculations.

### Detailed acceptance criteria

From the F13 feature spec. The original IDs are kept because tests cite them. Criteria marked *Revised* or *Added* come from the decision review of 2026-10-30 (SRS §17).

- **F13-AC6** — **(US-056) Given** a Madrasa Admin, **when** they upload a logo and set colors and headings, **then** every PDF generated afterwards for that madrasa uses them.
- **F13-AC7** — **(US-056) Given** a Teacher, **when** they open report template settings, **then** there are no edit controls, and the API returns forbidden.
- **F13-AC8** — **(US-056) Given** any template customization, **when** a PDF is generated, **then** the report's numbers and content are identical to the default template's; only the presentation differs.
- **F13-AC9** — **(US-056) Given** a logo file that is too large or not an image, **when** the Admin uploads it, **then** it is rejected with a field error.
- **F13-AC13** — **(US-056) Given** the report template settings, **when** the Admin opens them, **then** they can choose portrait or landscape, show or hide each optional section, set heading text per language, and pick colours from presets that pass a contrast check. There is no control to reorder sections. *(Added 2026-10-30, DEC-B41.)*

## Business rules

No SRS §9 business rule is specific to this story. The rules it follows are stated in the criteria above.

## Validation rules

Stated in these criteria: F13-AC7, F13-AC9, F13-AC13.

## Edge cases and error handling

Rows from the F13 edge-case table that apply to this story (verbatim):

| Situation | What should happen |
|---|---|
| The madrasa has no logo | The default template header is used |

**Out of scope for the whole feature** (verbatim from F13):

- Editing a PDF's content before export.
- Offline PDF generation.
- Free-form template designers (only the supported controls).
- Emailing PDFs (email notifications are excluded from MVP).

## Dependencies

- **Feature F13 depends on:** F09, F10 (from the spec index)
- **Features referenced by this story's criteria and edge cases:** None
- **Other stories referenced:** None
- **Other stories in F13:** [US-055](us-055-generate-professional-pdf.md), [US-057](us-057-apply-report-permissions-to-pdf.md)

## Related screens and UI

- **Feature flow** (from F13): Reports → Print / PDF ([design.md §4.10](../../design.md)); Settings → Report template (design gap)

[design.md §13](../../design.md) story-to-screen map (verbatim):

| Story | Screen (this document) | Key interaction | Required states beyond standard | Validation shown | Accessibility / localization specifics |
|---|---|---|---|---|---|
| US-056 | Settings → Report template (design gap; Admin only) | Upload logo; preset colours; headings per language; portrait/landscape; show/hide sections (fixed order, FR-PDF-002) | Offline (needs network) | Logo file type/size | Preview in all three languages |

## Related API and data model

- **Modules** ([ARCHITECTURE.md §18](../../ARCHITECTURE.md)): `reporting` (PDF)
- Tables and services are described in the feature context above and in [ARCHITECTURE.md](../../ARCHITECTURE.md). Concrete API routes are defined at scaffolding (SRS §17 DEC-B54).

## Offline and sync behavior

Nothing specific to this story in the source documents.

## Related E2E test scenarios

**Completion gate:** this spec is complete only when `npm run e2e:gate -- US-056` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](../../../e2e/README.md)).

**API (Playwright):**

- [e2e/api/f13-pdf.spec.ts](../../../e2e/api/f13-pdf.spec.ts) — F13-AC6 (US-056) Admin logo, colors, and headings apply to later PDFs
- [e2e/api/f13-pdf.spec.ts](../../../e2e/api/f13-pdf.spec.ts) — F13-AC7 (US-056) a Teacher cannot change report template settings
- [e2e/api/f13-pdf.spec.ts](../../../e2e/api/f13-pdf.spec.ts) — F13-AC8 (US-056) template changes never change report content
- [e2e/api/f13-pdf.spec.ts](../../../e2e/api/f13-pdf.spec.ts) — F13-AC9 (US-056) an oversized or non-image logo is rejected
- [e2e/api/f13-pdf.spec.ts](../../../e2e/api/f13-pdf.spec.ts) — F13-AC13 (US-056) template controls are orientation, section visibility, headings, and preset colours

**Mobile (Maestro):**

- [e2e/mobile/f13-pdf/report-template.yaml](../../../e2e/mobile/f13-pdf/report-template.yaml) — F13 template — Admin logo and headings; validation; Teacher has no controls; Parent PDF
- [e2e/mobile/f13-pdf/template-controls.yaml](../../../e2e/mobile/f13-pdf/template-controls.yaml) — F13 report template controls

**Unit (Vitest):**

- [apps/api/src/modules/reporting/pdf/template.test.ts](../../../apps/api/src/modules/reporting/pdf/template.test.ts) — F13-AC6 (US-056) the madrasa logo, colors, and headings are applied
- [apps/api/src/modules/reporting/pdf/template.test.ts](../../../apps/api/src/modules/reporting/pdf/template.test.ts) — F13-AC8 (US-056) a customized template produces the same numbers and content as the default
- [apps/api/src/modules/reporting/pdf/template.test.ts](../../../apps/api/src/modules/reporting/pdf/template.test.ts) — F13-AC9 (US-056) a logo that is too large or not an image is rejected

## Open decisions and blockers

Open questions from F13 that apply to this story, with their resolutions (decision review of 2026-10-30, SRS §17):

- [x] Which layout options does the Admin get (portrait/landscape, section order, show/hide sections)? **Resolved:** Orientation, show/hide sections, headings, preset colours; fixed order (DEC-B41, FR-PDF-002).

## Traceability

- **Story:** US-056 → SPEC-US-056 (this file)
- **Detailed criteria:** F13-AC6, F13-AC7, F13-AC8, F13-AC9, F13-AC13
- **Requirements:** FR-PDF-002
- **SRS acceptance tests:** None
- **Business rules:** None
- **Design:** design.md §13; **Architecture:** ARCHITECTURE.md §18 epic 13
- **Previous location:** `docs/specs/F13-pdf-print.md`

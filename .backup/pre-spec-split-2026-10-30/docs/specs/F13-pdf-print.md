# F13 · PDF and print

**Status:** draft
**Brief:** [00-product-brief.md](../00-product-brief.md) · **Flow:** Reports → Print / PDF ([design.md §4.10](../../design.md)); Settings → Report template (design gap)
**Stories:** US-055 – US-057 · **Requirements:** FR-PDF-001…003, FR-EXP-001…003/005

## Context

Madaris print reports for files and for parents' meetings. A PDF must look professional, carry the madrasa's branding, and render English, Urdu, Roman Urdu, and Quranic Arabic correctly. It must also follow **exactly** the same permission rules as the on-screen report.

There is no code yet. This feature builds:
- a server-side renderer that turns an HTML template into a PDF with headless Chromium
- per-madrasa `report_templates` ([ARCHITECTURE.md §10](../../ARCHITECTURE.md))

Its input is the F09 report after `projectFor(audience)` (F10).

## User story

- **US-055:** As a Teacher/Admin, I want a professional PDF report, so that I can print or share it.
- **US-056:** As a Madrasa Admin, I want to customize the logo, colors, headings, and layout, so that reports carry our madrasa's identity.
- **US-057:** As a report viewer, I want PDF content restricted exactly like on-screen reports, so that a PDF never shows more than I may see.

## Acceptance criteria

1. **(US-055) Given** a weekly or monthly report, **when** the user taps PDF, **then** a PDF is produced with the report type, date range, timezone, Sabaq/Sabqi/Manzil details, quantities with units, statuses, and authorized remarks.
2. **(US-055) Given** a report generated in Urdu, **when** the PDF opens, **then** the layout is right to left, and the Urdu text is shaped correctly (no disconnected letters).
3. **(US-055) Given** a report containing a Surah name in Arabic, **when** the PDF opens, **then** the Arabic is identical to the stored text and uses the Quranic font.
4. **(US-055) Given** quality scores in the report, **when** the PDF opens, **then** each score is shown as number + label from the approved scale in the report's language.
5. **(US-055) Given** a report that spans several pages, **when** it is rendered, **then** table headers repeat on each page, and no row is split across a page break.
6. **(US-056) Given** a Madrasa Admin, **when** they upload a logo and set colors and headings, **then** every PDF generated afterwards for that madrasa uses them.
7. **(US-056) Given** a Teacher, **when** they open report template settings, **then** there are no edit controls, and the API returns forbidden.
8. **(US-056) Given** any template customization, **when** a PDF is generated, **then** the report's numbers and content are identical to the default template's; only the presentation differs.
9. **(US-056) Given** a logo file that is too large or not an image, **when** the Admin uploads it, **then** it is rejected with a field error.
10. **(US-057) Given** a Parent requesting a PDF, **when** it is generated, **then** it contains only their verified linked child's published data, with no internal notes.
11. **(US-057) Given** a Teacher requesting a PDF for a student in an unassigned class, **when** the request is made, **then** it is refused exactly as the on-screen report would be.
12. **(US-057) Given** a generated PDF, **when** its download link is used after it expires, or by another user, **then** access is refused.

## Out of scope

- Editing a PDF's content before export.
- Offline PDF generation.
- Free-form template designers (only the supported controls).
- Emailing PDFs (email notifications are excluded from MVP).

## Edge cases

| Situation | What should happen |
|---|---|
| The device is offline | The PDF action shows "PDF needs a connection" |
| A very long student name or remark | It wraps inside its cell; the layout does not break |
| Mixed Arabic, Urdu, and Latin in one remark | Each part keeps its direction (bidi isolation) |
| The madrasa has no logo | The default template header is used |
| Rendering takes a long time | A progress state is shown, and the user can leave the screen; the file is ready when they return |

## Open questions

- [ ] Final font stack for Urdu, Roman Urdu, and Quranic Arabic (SRS §13 #4).
- [ ] Which layout options does the Admin get (portrait/landscape, section order, show/hide sections)?
- [ ] How long are generated PDFs kept on the server?

## Done means

- [ ] Every acceptance criterion has a passing test.
- [ ] `npm run e2e:gate -- F13` passes: every criterion has an E2E test, none is pending, and all pass (e2e/README.md).
- [ ] Nothing from "Out of scope" was built.
- [ ] `npm test` and `npm run lint` pass.
- [ ] Golden-file PDFs exist for `en`, `ur`, and `ur-Latn`, each with an Arabic snippet, and are reviewed by a person once.
- [ ] The F10 leak-marker test covers PDFs.

## Test plan

| Level | What it covers | Where |
|---|---|---|
| **Unit** | Template rendering from the report model, label localization, page-break rules | `apps/api/src/modules/reporting/pdf/*.test.ts` |
| **Integration** | PDF job end to end with real Chromium, role/scope refusal, signed URL expiry and owner check, template settings by role | `apps/api/test/reporting/pdf-*.test.ts` |
| **Component** | Template settings form (logo validation, color pickers), PDF action states (offline, generating, ready) | `apps/mobile/src/features/reports/__tests__/pdf*.test.tsx` |
| **E2E** | Every acceptance criterion: server-side checks (API) and device journeys (Maestro), including: Admin sets a logo → Teacher exports an Urdu monthly PDF → the file opens | `e2e/api/f13-pdf.spec.ts`, `e2e/mobile/f13-pdf/` |

**Traceability:** Each test name starts with its criterion, e.g. `F13-AC10 (US-057) …`. Every AC 1–12 has at least one test.

**Coverage:** ≥80% on new code.

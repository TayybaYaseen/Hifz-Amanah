# F13 · PDF and print

**Status:** draft
**Brief:** [00-product-brief.md](../../00-product-brief.md) · **Flow:** Reports → Print / PDF ([design.md §4.10](../../design.md)); Settings → Report template (design gap)
**Requirements:** FR-PDF-001…003, FR-EXP-001…003/005, FR-PDF-004
**Stories:** US-055 – US-057 · **Depends on:** F09, F10
**Build order:** 16 of 17 (dependency level 7)

This folder has one spec per user story. This page keeps what applies to the whole feature: context, scope, edge cases, open questions, the feature test plan, and its definition of done. Story specs repeat the edge cases and open questions that apply to them.

## Story specs

| Spec | Story | Detailed criteria |
|---|---|---|
| [SPEC-US-055](us-055-generate-professional-pdf.md) | US-055 — Generate professional PDF | F13-AC1, F13-AC2, F13-AC3, F13-AC4, F13-AC5, F13-AC14 |
| [SPEC-US-056](us-056-customize-report-template.md) | US-056 — Customize report template | F13-AC6, F13-AC7, F13-AC8, F13-AC9, F13-AC13 |
| [SPEC-US-057](us-057-apply-report-permissions-to-pdf.md) | US-057 — Apply report permissions to PDF | F13-AC10, F13-AC11, F13-AC12 |

## Context

Madaris print reports for files and for parents' meetings. A PDF must look professional, carry the madrasa's branding, and render English, Urdu, Roman Urdu, and Quranic Arabic correctly. It must also follow **exactly** the same permission rules as the on-screen report.

There is no code yet. This feature builds:
- a server-side renderer that turns an HTML template into a PDF with headless Chromium
- per-madrasa `report_templates` ([ARCHITECTURE.md §10](../../ARCHITECTURE.md))

Its input is the F09 report after `projectFor(audience)` (F10).

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

## Open questions (resolved 2026-10-30)

- [x] Final font stack for Urdu, Roman Urdu, and Quranic Arabic (SRS §13 #4). **Resolved:** Inter, Noto Nastaliq Urdu, Noto Naskh Arabic; A4 (DEC-B40, FR-PDF-004).
- [x] Which layout options does the Admin get (portrait/landscape, section order, show/hide sections)? **Resolved:** Orientation, show/hide sections, headings, preset colours; fixed order (DEC-B41, FR-PDF-002).
- [x] How long are generated PDFs kept on the server? **Resolved:** 24 hours (DEC-B44, NFR-PRV-005).

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

**Traceability:** Each test name starts with its criterion, e.g. `F13-AC10 (US-057) …`. Every AC 1–14 has at least one test.

**Coverage:** ≥80% on new code.

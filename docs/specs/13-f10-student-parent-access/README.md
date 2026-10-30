# F10 · Student and Parent access

**Status:** draft
**Brief:** [00-product-brief.md](../../00-product-brief.md) · **Flow:** Student read-only experience ([design.md §4.11](../../design.md)); Guardian read-only experience ([§4.12](../../design.md)); note visibility control ([§5.4](../../design.md))
**Requirements:** FR-PORT-001…005, FR-SEC-004…006, NFR-PORT-001…006, NFR-PRV-004, FR-RPT-010, FR-PORT-006/007
**Stories:** US-044 – US-046 · **Depends on:** F09
**Build order:** 13 of 17 (dependency level 6)

This folder has one spec per user story. This page keeps what applies to the whole feature: context, scope, edge cases, open questions, the feature test plan, and its definition of done. Story specs repeat the edge cases and open questions that apply to them.

## Story specs

| Spec | Story | Detailed criteria |
|---|---|---|
| [SPEC-US-044](us-044-student-views-own-reports.md) | US-044 — Student views own reports | F10-AC1, F10-AC2, F10-AC3, F10-AC4, F10-AC13, F10-AC14, F10-AC15, F10-AC17 |
| [SPEC-US-045](us-045-parent-views-linked-student-reports.md) | US-045 — Parent views linked student reports | F10-AC5, F10-AC6, F10-AC7, F10-AC8, F10-AC16 |
| [SPEC-US-046](us-046-protect-private-teacher-notes.md) | US-046 — Protect private teacher notes | F10-AC9, F10-AC10, F10-AC11, F10-AC12 |

## Context

Students and Parents can follow progress in the Android app. Their access is online and read-only, and it covers published reports only:
- a Student sees only their own reports
- a Parent sees only children they have been verified as linked to

Teacher notes marked internal must **never** reach them through any channel.

There is no code yet. This feature builds:
- the `portal` module
- `student_guardians` linking
- the `notes.visibility` field
- the single `projectFor(audience)` choke point ([ARCHITECTURE.md §7.4](../../ARCHITECTURE.md))

Report content comes from F09.

## Out of scope

- A browser-based portal.
- Offline report caching for Students and Parents.
- Students or Parents editing, commenting on, or replying to anything.
- Parents finding or claiming a student by themselves.
- Messaging between Teachers and Parents.

## Edge cases

| Situation | What should happen |
|---|---|
| A Parent is linked to children in two madaris | Two separate accounts (F01 US-006); each shows only its own madrasa's child |
| A Student account is deactivated | Sign-in is refused (F01) |
| A report is unpublished after a Parent saw it | It disappears on the next fetch |
| An internal note is quoted inside a visible remark by mistake | Not detectable automatically. The visibility control shows a clear label and a warning before export (design.md §4.15) |
| A Student and a Parent share one device | Each signs in separately; nothing is cached between them |

## Open questions (resolved 2026-10-30)

- [x] D3: who publishes reports, and is it per week, per month, or automatic? **Resolved:** Teacher or Admin publishes manually (DEC-B33, FR-RPT-010).
- [x] D5: the guardian linking and verification steps (who verifies, and with what proof). **Resolved:** The Admin links after offline verification and records the method (DEC-B37, FR-PORT-007).
- [x] Which report fields are hidden from Students and Parents besides internal notes (for example the teacher's name or mistake details)? **Resolved:** See FR-PORT-006; teacher name and mistake counts by category are shown (DEC-B36).

## Done means

- [ ] Every acceptance criterion has a passing test.
- [ ] `npm run e2e:gate -- F10` passes: every criterion has an E2E test, none is pending, and all pass (e2e/README.md).
- [ ] Nothing from "Out of scope" was built.
- [ ] `npm test` and `npm run lint` pass.
- [ ] A leak test plants a unique marker string in an internal note and asserts that it never appears in any Student/Parent API response, PDF, Excel export, or push payload (AC-SEC-04, AC-XLS-06).

## Test plan

| Level | What it covers | Where |
|---|---|---|
| **Unit** | `projectFor(audience)` removes internal notes and unpublished periods for STUDENT and PARENT | `apps/api/src/modules/access/projection.test.ts` |
| **Integration** | Student self-only access, Parent linked-only access, revocation, ID probing, the leak-marker test across all channels, audit of link/visibility changes | `apps/api/test/portal/*.test.ts` |
| **Component** | Read-only screens with no edit controls, child switcher, offline state, visibility segmented control with default "Private to staff" | `apps/mobile/src/features/portal/__tests__/*.test.tsx` |
| **E2E** | Every acceptance criterion: server-side checks (API) and device journeys (Maestro), including: Teacher writes one internal and one shared note → Parent signs in → sees only the shared note | `e2e/api/f10-portal.spec.ts`, `e2e/mobile/f10-portal/` |

**Traceability:** Each test name starts with its criterion, e.g. `F10-AC10 (US-046) …`. Every AC 1–17 has at least one test.

**Coverage:** ≥80% on new code (100% on `projectFor`).

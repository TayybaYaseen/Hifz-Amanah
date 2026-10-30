# F11 · Localization and accessibility

**Status:** draft
**Brief:** [00-product-brief.md](../../00-product-brief.md) · **Flow:** Settings → Language ([design.md §4.16](../../design.md)); direction system ([§6](../../design.md))
**Requirements:** FR-I18N-001…008, FR-AUTH-004/005, NFR-MNT-003, NFR-UX-002/005, NFR-COMP-002, FR-I18N-009
**Stories:** US-047 – US-050 · **Depends on:** — (cross-cutting)
**Build order:** 2 of 17 (dependency level 0)

This folder has one spec per user story. This page keeps what applies to the whole feature: context, scope, edge cases, open questions, the feature test plan, and its definition of done. Story specs repeat the edge cases and open questions that apply to them.

## Story specs

| Spec | Story | Detailed criteria |
|---|---|---|
| [SPEC-US-047](us-047-use-english-interface.md) | US-047 — Use English interface | F11-AC1, F11-AC4, F11-AC11, F11-AC12, F11-AC13 |
| [SPEC-US-048](us-048-use-urdu-interface.md) | US-048 — Use Urdu interface | F11-AC2, F11-AC5, F11-AC6, F11-AC14 |
| [SPEC-US-049](us-049-use-roman-urdu-interface.md) | US-049 — Use Roman Urdu interface | F11-AC3, F11-AC7 |
| [SPEC-US-050](us-050-preserve-quran-arabic-text.md) | US-050 — Preserve Quran Arabic text | F11-AC8, F11-AC9, F11-AC10 |

## Context

The app is used in three languages:
- English, left to right
- Urdu script, right to left
- Roman Urdu, left to right

Quranic Arabic must appear exactly as stored, in every language. Switching language changes labels only: never stored values, and never unsaved work.

There is no code yet. This feature builds:
- the mobile `i18n` layer and its locale files (`en`, `ur`, `ur-Latn`)
- a `DirectionProvider` for in-place direction switching
- a `QuranText` component
- the shared `packages/i18n-keys` used by PDF, Excel, and push ([ARCHITECTURE.md §14](../../ARCHITECTURE.md))

## Out of scope

- Languages other than these three.
- Auto-translating user-entered notes.
- Showing Quran text beyond Surah names and references.
- Converting between Urdu script and Roman Urdu automatically.

## Edge cases

| Situation | What should happen |
|---|---|
| A student's name is in Urdu script while the UI is in English | The name is shown right to left inside the left-to-right layout, isolated so the punctuation around it stays correct |
| Numbers in the Urdu interface | One digit style is used consistently; quantities and dates stay readable (see open question) |
| An icon with a direction (back chevron) | Mirrored in RTL; icons without a direction are not mirrored |
| A translation is missing at runtime | Falls back to English, and the gap is logged once; CI should catch this before release |
| A long Roman Urdu label | Wraps rather than truncating important words |

## Open questions (resolved 2026-10-30)

- [x] In the Urdu interface, are numbers shown as Western digits (123) or Urdu digits (۱۲۳)? **Resolved:** Western digits (DEC-B38, FR-I18N-009).
- [x] Who owns and reviews the Roman Urdu glossary? **Resolved:** Dev team drafts; the product owner or their nominee approves (DEC-B39, FR-I18N-008).
- [x] Final Urdu UI font (design.md §2.3 suggests Noto Sans Arabic or a verified Urdu font). **Resolved:** Noto Nastaliq Urdu (DEC-B40, FR-PDF-004).

## Done means

- [ ] Every acceptance criterion has a passing test.
- [ ] `npm run e2e:gate -- F11` passes: every criterion has an E2E test, none is pending, and all pass (e2e/README.md).
- [ ] Nothing from "Out of scope" was built.
- [ ] `npm test` and `npm run lint` pass.
- [ ] A missing-key check runs in CI.
- [ ] Main screens are reviewed on a physical Android device in all three languages.

## Test plan

| Level | What it covers | Where |
|---|---|---|
| **Unit** | Direction helpers, bidi isolation for mixed ranges, locale fallback, glossary terms | `apps/mobile/src/i18n/*.test.ts`, `packages/i18n-keys/*.test.ts` |
| **Integration** | Language preference persists on the user record; server-rendered labels (PDF/Excel/push) come out in the requested locale | `apps/api/test/identity/locale-*.test.ts` |
| **Component** | RTL/LTR snapshots of key screens, form values kept across a language switch, `QuranText` byte-exact rendering, large-font layout | `apps/mobile/src/**/__tests__/*.i18n.test.tsx` |
| **E2E** | Every acceptance criterion: server-side checks (API) and device journeys (Maestro), including: Switch the language mid-entry → save → sign out/in → the language is kept | `e2e/api/f11-i18n.spec.ts`, `e2e/mobile/f11-i18n/` |

**Traceability:** Each test name starts with its criterion, e.g. `F11-AC05 (US-048) …`. Every AC 1–14 has at least one test.

**Coverage:** ≥80% on new code.

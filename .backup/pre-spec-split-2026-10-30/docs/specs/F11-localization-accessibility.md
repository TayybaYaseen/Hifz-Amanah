# F11 · Localization and accessibility

**Status:** draft
**Brief:** [00-product-brief.md](../00-product-brief.md) · **Flow:** Settings → Language ([design.md §4.16](../../design.md)); direction system ([§6](../../design.md))
**Stories:** US-047 – US-050 · **Requirements:** FR-I18N-001…008, FR-AUTH-004/005, NFR-MNT-003, NFR-UX-002/005, NFR-COMP-002

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

## User story

- **US-047:** As a user, I want to use the app in English, so that I can work in the language I read best.
- **US-048:** As a user, I want to use the app in Urdu script with a right-to-left layout, so that it reads naturally.
- **US-049:** As a user, I want to use the app in Roman Urdu with a left-to-right layout, so that I can read Urdu without Urdu script.
- **US-050:** As a user, I want Quranic Arabic text and ranges preserved exactly in every language, so that the Quran is never altered.

## Acceptance criteria

1. **(US-047) Given** English selected, **when** any screen is shown, **then** navigation, labels, buttons, validation messages, and empty states are in English, and the layout is left to right (AC-I18N-01).
2. **(US-048) Given** Urdu selected, **when** any screen is shown, **then** all of the same text is in Urdu script, and the layout is right to left (AC-I18N-02).
3. **(US-049) Given** Roman Urdu selected, **when** any screen is shown, **then** all key strings are in Roman Urdu, and the layout is left to right (AC-I18N-03).
4. **(US-047) Given** a user who chose Urdu, **when** they sign out and sign in again, on this device or another, **then** the app opens in Urdu (AC-I18N-04).
5. **(US-048) Given** a half-filled Daily Entry form, **when** the user switches from English to Urdu, **then** every entered value is still there, and no app restart is needed (AC-I18N-05).
6. **(US-048) Given** a portion saved as Not Remembered in Urdu, **when** it is read from the database, **then** the stored status is `NOT_REMEMBERED`, the same value as when it is saved in English.
7. **(US-049) Given** the Roman Urdu glossary, **when** a domain term (Sabaq, Sabqi, Manzil, Para, Rubu, Salasah) appears on screen, **then** it uses the glossary spelling everywhere.
8. **(US-050) Given** a Surah name stored in Arabic, **when** it is shown in English, Urdu, or Roman Urdu, **then** the Arabic characters are identical to the stored value and are not translated or transliterated.
9. **(US-050) Given** the range "البقرة 2:255–260" inside an English sentence and inside an Urdu sentence, **when** it is rendered, **then** the numbers and the Arabic both read correctly in both directions (AC-I18N-06).
10. **(US-050) Given** Arabic text exported to PDF or Excel, **when** the file is opened, **then** the Arabic text is unchanged.
11. **(US-047) Given** every message key in the app and server catalogues, **when** CI runs, **then** each key exists in `en`, `ur`, and `ur-Latn`, or the build fails.
12. **(US-047) Given** Android's largest font size, **when** the main screens are shown, **then** text is not clipped, and touch targets stay at least 44 dp.
13. **(US-047) Given** a status shown anywhere, **when** it is rendered, **then** it has a text label and an icon, never color alone.

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

## Open questions

- [ ] In the Urdu interface, are numbers shown as Western digits (123) or Urdu digits (۱۲۳)?
- [ ] Who owns and reviews the Roman Urdu glossary?
- [ ] Final Urdu UI font (design.md §2.3 suggests Noto Sans Arabic or a verified Urdu font).

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

**Traceability:** Each test name starts with its criterion, e.g. `F11-AC05 (US-048) …`. Every AC 1–13 has at least one test.

**Coverage:** ≥80% on new code.

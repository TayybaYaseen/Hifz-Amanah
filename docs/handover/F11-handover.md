# F11 handover — Localization and accessibility

**Branch:** `feature/f11-localization-accessibility` · **Audited:** 2026-11-06
**Gate:** `npm run e2e:gate -- F11` → **PENDING** (7 of 11 E2E tests pending). F11 is **not complete**.

## Commits

| Commit | Content |
|---|---|
| `cf4c176` | Spec status `draft` → `Approved` on the five F11 spec pages only (one line each) |
| `a36b5da` | F11 implementation and tests (46 files) |
| this file | Handover checklist |

The branch is based on the F01 tip `33b6455`, which is merged into `origin/main` by PR #3 (`bcf3b05`). The tree
of `origin/main` equals the F01 tip, and a trial merge of this branch into `origin/main` has no conflicts.

## Acceptance criteria

PASS means the tests listed ran and passed on 2026-11-06. **No F11 story gate passes yet**: each story still has a
pending E2E test.

| Criterion | Story | Status | Evidence, or what it waits for |
|---|---|---|---|
| F11-AC1 English, LTR | US-047 | Unit PASS · E2E **PENDING** | `direction.test.ts`. Mobile sweep `locales-and-direction.yaml` waits for the screens listed below |
| F11-AC2 Urdu, RTL | US-048 | Unit PASS · E2E **PENDING** | Same flow |
| F11-AC3 Roman Urdu, LTR | US-049 | Unit PASS · E2E **PENDING** | Same flow |
| F11-AC4 Language kept across sessions/devices | US-047 | API E2E PASS · integration PASS · mobile **NOT RUN** | `f11-i18n.spec.ts`, `locale-preference.test.ts`. `language-persists.yaml` is written and unpended but has never run (see below) |
| F11-AC5 Values kept when switching mid-entry | US-048 | **PENDING** | Needs Daily Entry (F05, spec 09). `switch-mid-entry.yaml` |
| F11-AC6 Status stored canonically | US-048 | Unit PASS · API E2E **PENDING** | Needs a route that saves a recitation status (F05). `test.fixme` in `f11-i18n.spec.ts`; also in `switch-mid-entry.yaml` |
| F11-AC7 Glossary spelling | US-049 | Unit PASS · E2E **PENDING** | No screen shows the terms until F05/F06. Glossary wording awaits DEC-B39 |
| F11-AC8 Arabic unchanged | US-050 | Unit PASS · E2E **PENDING** | `arabic-and-bidi.yaml` needs a stored Surah range (F05/F06) |
| F11-AC9 Mixed range readable both ways | US-050 | Unit PASS · E2E **PENDING** | Same flow; visual check needs golden screenshots |
| F11-AC10 Arabic unchanged in PDF/Excel | US-050 | **PENDING** | Needs PDF export (F13, spec 16) and Excel export (F14, spec 14). `test.fixme` and `arabic-and-bidi.yaml` step 4 |
| F11-AC11 Every key in all locales | US-047 | Unit PASS · API E2E PASS | `catalogue.test.ts`, `f11-i18n.spec.ts` (2 tests) |
| F11-AC12 Largest font, ≥ 44 dp | US-047 | E2E **PENDING** | `accessibility.yaml` sweeps screens not built yet |
| F11-AC13 Status = text + icon | US-047 | E2E **PENDING** | Same flow. `StatusBadge` used for account status |
| F11-AC14 Western digits | US-048 | Unit PASS · E2E **PENDING** | `western-digits.yaml` needs quantities (F05), quality scores (F07), report dates (F09) |

### Pending mobile flows: screens they need

| Flow | Covers | Screens or data it needs | Features |
|---|---|---|---|
| `locales-and-direction.yaml` | AC1, AC2, AC3, AC7 | Students, Daily Entry, Bulk Entry, Homework, Reports, Sync queue; screens showing Sabaq/Sabqi/Manzil/Para/Rubu/Salasah | F03, F04, F05, F06, F08, F09, F12 |
| `accessibility.yaml` | AC12, AC13 | Students, Daily Entry, Bulk Entry, Homework, Reports; status chips, sync states, attendance marks | F03, F04, F05, F08, F09, F12 |
| `arabic-and-bidi.yaml` | AC8, AC9, AC10 | A record with "البقرة 2:255–260"; report PDF | F05, F06, F09, F13 |
| `western-digits.yaml` | AC14 | Quantities, quality scores, report dates on screen | F05, F07, F09 |
| `switch-mid-entry.yaml` | AC5, AC6 | Daily Entry form and save | F05 |

Keep these flows tagged `pending` and these API tests `test.fixme` until their features exist. Do not narrow a sweep
to today's screens to make the gate pass.

### `language-persists.yaml` (AC4)

- Parses as valid Maestro YAML: 24 steps, tags `F11`, `US-047`.
- Uses only testIDs that exist: `nav.more`, `more.profile`, `language.option.ur`, `profile.language.success`,
  `signin.screen`, plus those inside the shared subflows.
- Asserts the Urdu option is `selected` after sign-out and sign-in, and again after `clearState` (as on a new
  device). It waits on `profile.language.success`, so the account update has finished before signing out.
- **It has never run.** Maestro 2.12.1, `emulator-5554`, and a dev build (`dev.local.hifzamanah`) are present. But
  running it would reset the data of an E2E server on port 3000 and use a Metro bundler on port 8081. Both were
  started before this work (06:37) by another session, so they were not touched. Run it once that is confirmed:
  `npm run e2e:mobile -- --include-tags US-047 -e APP_ID=dev.local.hifzamanah`. That local ID is a development
  placeholder only, not a decision on DEC-B55.

## Outstanding quality work

| Item | Status | Plan |
|---|---|---|
| Review on a physical Android device in all three languages | Not done | Sign-in, Home, More, My profile, Accounts in `en`, `ur`, `ur-Latn` at default and largest font. Check Nastaliq line height, Naskh diacritics, mirrored header and back arrow |
| RTL/LTR component snapshot tests (`*.i18n.test.tsx`) | Not done | No React Native renderer in the test setup (Vitest cannot load `react-native`). Needs `@testing-library/react-native` with a Jest or Vitest RN preset: a tooling decision |
| Coverage (≥ 80 % on new code) | Not measured | Add `@vitest/coverage-v8` and a `test:coverage` script; report `packages/i18n-keys` and `apps/mobile/src/i18n` |
| CI workflow | None in the repository | GitHub Actions on each PR: `npm ci`, `typecheck`, `lint`, `npm test` (includes the missing-key check), `e2e:trace`, `docs:check`, API E2E. Maestro nightly (NFR-MNT-005) |
| DEC-B39 glossary approval | Product-owner action | `packages/i18n-keys/src/glossary.ts` and `labels.ts` are drafts (`GLOSSARY_STATUS = 'DRAFT'`). Only the Quality Rating Scale is approved |
| DEC-B55 Android application ID | Deferred | Blocks every mobile gate and release. Builds read `APP_ID`; nothing in code chooses one |

## Merge note

`IMPLEMENTATION_PLAN.md` merges a feature only after its gate passes. F11's gate cannot pass before F05, F13, and
F14, while `packages/i18n-keys` is needed by those features. Merging F11 earlier, with the pending criteria above
kept open, needs the user's explicit approval.

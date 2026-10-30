# HifzAmanah end-to-end tests

App-wide E2E suite, written from `SRS.md`, `user-stories.md`, `design.md`, and the feature specs in
`docs/specs/` before implementation starts.

## The rule

**A spec is not complete until its E2E gate passes:**

```sh
npm run e2e:gate -- F05
```

The gate fails unless all four hold:

1. Every acceptance criterion in the spec has at least one E2E test (`npm run e2e:trace`).
2. None of the spec's E2E tests is pending.
3. All of the spec's API E2E tests pass (`@F05`).
4. All of the spec's mobile flows pass (tag `F05`).

App-wide tests (`APP`) are the **release gate**: `npm run e2e:gate -- APP`. They span several specs, so they
never block a single spec.

## Layout

```text
e2e/
  api/                      Playwright Test: black-box API checks against a running test environment
    f01-identity.spec.ts …  one file per spec, tagged @F01 … @F17
    journeys/               app-wide sweeps (@APP): tenant isolation, internal-note leaks
    support/fixtures.ts     persona sign-in and test-control fixtures
    playwright.config.ts
  mobile/                   Maestro: user journeys on an Android emulator or device
    f01-identity/ …         flows per spec, tagged F01 … F17
    app/                    app-wide screens (@APP): role navigation, Teacher Home, screen states, layouts
    journeys/               cross-feature journeys (@APP), including SRS §10.8
    config.yaml
  support/maestro/          subflows: sign-in, sign-out, set-language, go-offline, go-online
  fixtures/                 synthetic personas and workbook definitions
  scripts/                  traceability and spec-gate runners
```

**Why two layers.**
- Many criteria are only observable on the server: forbidden responses, audit contents, idempotent replays, payload contents. Those are API tests.
- Criteria about what the user sees and does are Maestro flows on the real Android app.
- Playwright cannot drive a native React Native app, and Maestro cannot inspect the server, so each layer covers what the other cannot.

## Writing tests ahead of the code

All tests start pending:
- **API:** `test.fixme('F05-AC6 (US-019) …', async () => { /* steps */ })`
- **Mobile:** tag `pending`, with steps as comments

When you implement a criterion:
1. Replace the comment steps with real calls (API) or Maestro commands (mobile).
2. Change `test.fixme` to `test`, or remove the `pending` tag.
3. Run `npm run e2e:gate -- F05`.

**Naming:** titles start with the criterion ID, `F<nn>-AC<k> (US-xxx)`, exactly as in the spec. Mobile flows list their criteria in a `# Covers:` header. App-wide tests use `APP-<area>-<n>` IDs.

**When a spec changes:** run `npm run e2e:trace`. It fails if a criterion has no test, or if a test cites a criterion that no longer exists.

## Test data

- Synthetic only (`fixtures/personas.ts`): two madaris (A and B), Owner, Admin, two Teachers, Students, and Parents.
- The personas include a shared Student/Parent email and the same person holding accounts in both madaris.
- Never use real student data (AGENTS.md §6).

## testID contract

Maestro selects elements by `testID`, named `<screen>.<element>`, for example `signin.userId`, `signin.submit`, `home.screen`, `nav.more`, `settings.signOut`, `signout.unsyncedWarning`, `sync.banner.synced`, and `language.option.ur`. Add a testID to every control a flow uses. Never select by visible text, so flows run in every locale.

## Still open (do not resolve silently)

| Needed by the suite | Gate |
|---|---|
| Test-control mechanism: seed reset, OTP mail sink, clock control, AI and push provider stubs, forced server errors | SRS §13 #10 |
| API routes and session transport (fixtures throw until defined) | SRS §13 #1, ARCHITECTURE §3.2 |
| Android application ID (`APP_ID`) and test environment URL (`E2E_API_URL`) | SRS §13 #7, #9 |
| Password policy for the seed password | SRS §13 #1 |
| Push event catalogue | SRS §13 #11 |
| PDF fonts and golden images | SRS §13 #4 |
| Device matrix for layout runs | SRS §13 #7 |
| New-workspace onboarding, offline homework confirmation, Excel version marker and batch size | design.md §11 D1, D2, D7 |
| SRS §10.8 step 1 says a Teacher creates the class and student; §16.1 says only the Admin does | SRS §10.8 vs §16.1 |

## Commands

| Task | Command |
|---|---|
| Traceability check (no environment needed) | `npm run e2e:trace` |
| Gate one spec | `npm run e2e:gate -- F05` |
| Release gate | `npm run e2e:gate -- APP` |
| API E2E | `E2E_API_URL=… npm run e2e:api` |
| Mobile E2E | `npm run e2e:mobile -- -e APP_ID=…` (needs the Maestro CLI and an emulator) |

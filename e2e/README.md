# HifzAmanah end-to-end tests

App-wide E2E suite, written from `SRS.md`, `user-stories.md`, `design.md`, and the specs in
[`docs/specs/`](../docs/specs/README.md) before implementation starts. There is one spec per user story.

## The rule

**A spec is not complete until its E2E gate passes:**

```sh
npm run e2e:gate -- US-022
```

The gate fails unless all four hold:

1. Every acceptance criterion in the spec has at least one E2E test (`npm run e2e:trace`).
2. None of the spec's E2E tests is pending.
3. All of the spec's API E2E tests pass: tests whose title cites `(US-022)`.
4. All of the spec's mobile flows pass: flows tagged `US-022`.

`npm run e2e:gate -- F05` gates every story in a feature at once.

A mobile flow can cover several stories, and it carries one tag per story. Until it is implemented, it keeps each of those stories' gates pending. Split the flow if one story needs to finish first.

App-wide tests (`APP`) are the **release gate**: `npm run e2e:gate -- APP`. They span several specs, so they
never block a single spec.

## Layout

```text
e2e/
  api/                      Playwright Test: black-box API checks against a running test environment
    f01-identity.spec.ts …  one file per feature, tagged @F01 … @F17; each title cites its story (US-nnn)
    journeys/               app-wide sweeps (@APP): tenant isolation, internal-note leaks
    support/fixtures.ts     persona sign-in and test-control fixtures
    playwright.config.ts
  mobile/                   Maestro: user journeys on an Android emulator or device
    f01-identity/ …         flows per feature, tagged F01 … F17 and with each story they cover (US-nnn)
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
3. Run `npm run e2e:gate -- US-<nnn>` for the story.

**Naming:** titles start with the criterion ID, `F<nn>-AC<k> (US-xxx)`, exactly as in the story spec. Mobile flows list their criteria in a `# Covers:` header and carry a `US-xxx` tag for each story they cover. App-wide tests use `APP-<area>-<n>` IDs.

**When a spec changes:** run `npm run e2e:trace`. It fails if a criterion has no test, or if a test cites a criterion that no longer exists.

## Test data

- Synthetic only (`fixtures/personas.ts`): two madaris (A and B), Owner, Admin, two Teachers, Students, and Parents.
- The personas include a shared Student/Parent email and the same person holding accounts in both madaris.
- Never use real student data (AGENTS.md §6).

## testID contract

Maestro selects elements by `testID`, named `<screen>.<element>`, for example `signin.userId`, `signin.submit`, `home.screen`, `nav.more`, `settings.signOut`, `signout.unsyncedWarning`, `sync.banner.synced`, and `language.option.ur`. Add a testID to every control a flow uses. Never select by visible text, so flows run in every locale.

## Decisions the suite depends on (closed 2026-10-30, SRS §17)

| Needed by the suite | Decision |
|---|---|
| Test control: a test-only API in local/staging with a secret, providing seed reset, Mailpit OTP sink, clock control, AI and push stubs, and TOTP codes for Owner/Admin personas | NFR-MNT-005, DEC-B54 |
| CI runs API E2E against Docker Compose on every PR; Maestro runs nightly and before release | NFR-MNT-005 |
| Seed password meets the password policy | FR-AUTH-012 |
| Push event catalogue: "Report published" only | FR-NOT-004 |
| PDF fonts and page rules (golden images are recorded at implementation) | FR-PDF-004 |
| Device matrix for layout runs | NFR-COMP-001 |
| Workspace onboarding by the platform operator, offline homework confirmation, Excel `_meta` sheet and 200-row batches | FR-ORG-001, FR-HW-017, FR-XLS-018 |
| SRS §10.8 step 1: the Admin creates the class, and the Teacher adds the student | DEC-B04 |

**Still deferred:**
- **The Android application ID (`APP_ID`, DEC-B55).** Mobile flows read it from `-e APP_ID=…`.
- **API routes and session transport.** They are defined at scaffolding; the fixtures throw until then.

## Commands

| Task | Command |
|---|---|
| Traceability check (no environment needed) | `npm run e2e:trace` |
| Gate one spec (story) | `npm run e2e:gate -- US-022` |
| Gate a feature | `npm run e2e:gate -- F05` |
| Release gate | `npm run e2e:gate -- APP` |
| API E2E | `E2E_API_URL=… npm run e2e:api` |
| Mobile E2E | `npm run e2e:mobile -- -e APP_ID=…` (needs the Maestro CLI and an emulator) |

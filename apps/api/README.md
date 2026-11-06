# HifzAmanah API

Node.js + Fastify + Kysely over PostgreSQL (ARCHITECTURE.md §3.2). Request and response shapes are the Zod
schemas and types in [`packages/contracts`](../../packages/contracts/src/identity.ts), shared with the app.

## Run

| Task | Command (from the repository root) |
|---|---|
| Dev server on `http://127.0.0.1:3000` | `npm run api:dev` |
| E2E server (fresh in-memory database, seeded personas, test-control API) | `npm run api:e2e-server` |
| Migrations against `DATABASE_URL` | `npm run db:migrate` |
| Tests (unit + integration) | `npm test` |

Without `DATABASE_URL`, development and tests use embedded Postgres (PGlite, DEC-B68). Development data persists
in `apps/api/.data/pglite` (git-ignored).

An unset `NODE_ENV` means **production**, which requires `DATABASE_URL`, `JWT_SECRET`, `HASH_PEPPER`,
`TOTP_ENCRYPTION_KEY` (32 bytes, base64) and `MAIL_TRANSPORT=ses`. `npm run api:dev` sets `development`.
`TEST_CONTROL_SECRET` is accepted only with `NODE_ENV=test`. `TRUST_PROXY_HOPS` (default 0) sets how many
proxies in front of the API are trusted for the client address.

## Conventions

- **Errors:** `{ "error": { "code", "message", "fields"? } }`. The app localizes by `code` (contracts `ERROR_CODES`).
- **Auth:** `Authorization: Bearer <accessToken>`. Every request re-checks the session, account, and membership,
  so sign-out, resets, and deactivation take effect at once. Organization and role come from the membership,
  never from the request (FR-SEC-009).
- **Scope:** a record outside the caller's madrasa, or outside what the role may see, is `404 NOT_FOUND`,
  the same as a missing ID (FR-SEC-008).

## Identity routes (F01)

| Method and path | Who | Body | Success |
|---|---|---|---|
| `POST /auth/sign-in` | anyone | `{ loginId, password, deviceId? }` | `200` `{ step: SIGNED_IN, accessToken, refreshToken, expiresIn }`, or for Owner/Admin `{ step: TWO_FACTOR_REQUIRED \| TWO_FACTOR_SETUP_REQUIRED, challengeToken }`. Any refusal: `401 INVALID_CREDENTIALS` |
| `POST /auth/two-factor/setup` | Owner/Admin, first sign-in | `{ challengeToken }` | `200` `{ secret, otpauthUri }` |
| `POST /auth/two-factor/setup/confirm` | same | `{ challengeToken, code }` | `200` signed in, plus `recoveryCodes` (10, shown once) |
| `POST /auth/two-factor/verify` | Owner/Admin | `{ challengeToken, code }` or `{ challengeToken, recoveryCode }` | `200` signed in |
| `POST /auth/refresh` | anyone with a refresh token | `{ refreshToken }` | `200` new token pair (rotated; a replayed old token ends the session) |
| `POST /auth/sign-out` | signed in, or holding the refresh token | `{ refreshToken? }` | `204`; ends this session only. With an expired access token, the refresh token alone is enough |
| `POST /auth/password-reset/request` | anyone | `{ loginId }` | `202` `{ status: RESET_REQUESTED }`, always the same |
| `POST /auth/password-reset/confirm` | anyone | `{ loginId, otp, newPassword }` | `204`; ends every session. `400 OTP_INVALID` for a wrong, expired, used, or over-tried code |
| `GET /me` | signed in | — | `200` profile: display name, email, User ID, role, madrasa, language, 2FA status |
| `PATCH /me` | signed in | `{ displayName?, email?, preferredLocale?, currentPassword? }` only | `200` profile; any other field is `400`. Changing the email needs `currentPassword` (DEC-B69): missing is `400 fields.currentPassword: REQUIRED`, wrong is `400 CURRENT_PASSWORD_INCORRECT`, and nothing changes |
| `POST /me/password` | signed in | `{ currentPassword, newPassword }` | `204`; ends the user's other sessions |
| `POST /me/two-factor/recovery-codes` | Owner/Admin, signed in within 15 min | `{ code }` | `200` `{ recoveryCodes }`; earlier codes stop working. `403 REAUTH_REQUIRED` if not recent |
| `GET /accounts?page=` | Owner/Admin | — | `200` 25 per page |
| `POST /accounts` | Owner/Admin | `{ loginId, displayName, email?, role: TEACHER \| STUDENT \| PARENT, password }` | `201` account. `409 LOGIN_ID_TAKEN`, `400` with `fields.loginId` / `fields.password` |
| `GET /accounts/login-id-suggestion` | Owner/Admin | — | `200` `{ prefix }`, e.g. `ALIF-` |
| `GET /accounts/:id` | Owner/Admin | — | `200` account, including `lockedUntil` |
| `POST /accounts/:id/deactivate` | Owner/Admin (Admin: Teacher/Student/Parent only) | — | `200` account; its sessions end |
| `POST /accounts/:id/password` | Owner/Admin (only the Owner for an Admin) | `{ newPassword }` | `204`; the user's sessions end |
| `POST /accounts/:id/two-factor/reset` | Owner, for an Admin | — | `204`; the Admin's sessions end and 2FA must be set up again |

Rules and values live in [`src/modules/identity/rules.ts`](src/modules/identity/rules.ts): OTP 6 digits, 10 minutes,
5 tries, 3 per hour (DEC-B10); 10 failures in 15 minutes lock for 15 minutes, with a 1–8 s progressive delay after
5 (DEC-B67); sessions end 30 days after sign-in (DEC-B65); recent sign-in is 15 minutes (DEC-B66).

**Throttling.** Each attempt is counted before the secret is checked, so parallel requests cannot slip past the lock.
Passwords are throttled per typed User ID (sign-in and the current password on My profile). Authenticator and
recovery codes have their own per-account counter, which a correct password does not reset. An authenticator code
is accepted once only.

## Test control (non-production only)

Enabled when `TEST_CONTROL_SECRET` is set (the E2E server sets `local-e2e-control-secret` unless overridden; E2E
fixtures read `E2E_CONTROL_SECRET`). Every route needs the `x-test-control-secret` header and is otherwise `404`.

`POST /__test/reset` · `POST /__test/clock { advanceMs }` · `GET /__test/users/:loginId` · `GET /__test/otp/:loginId` ·
`GET /__test/emails/:loginId` · `GET /__test/audit/:loginId` · `GET /__test/totp/:loginId` · `POST /__test/search { text }`

## Not yet in F01

- The per-IP throttle (F17-AC13) and the F17 audit query API arrive with F17.
- Row-level security (ADR-006) arrives with F02's tenant-scoped tables.
- The platform operator's reset of an Owner's two-factor setup is operator tooling, not an API route.
- Open items from the F01 code review (2026-11-02):
  - Refresh-token reuse is detected one rotation back only; older replays are refused but do not end the session (L3).
  - `login_failures` rows are never pruned; a cleanup job arrives with the pg-boss workers (L10).
  - Unknown User IDs answer a reset request with slightly less database work than real ones; the email send no
    longer adds to the difference (M3, partly addressed).

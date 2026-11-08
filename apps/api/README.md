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
proxies in front of the API are trusted for the client address. `SYNC_MIN_PROTOCOL_VERSION` (integer ≥ 1,
default 1) is the oldest sync protocol the server accepts; older apps get `426 UPGRADE_REQUIRED` (F12-AC15).

### Database role and row-level security (F12, ADR-016)

Sync tables use Postgres row-level security with the `hifz_tenant` role ([`src/platform/tenant.ts`](src/platform/tenant.ts)).
In staging and production:

- The API must connect as a **non-superuser without `BYPASSRLS`** that is a **member of `hifz_tenant`**. Migration
  0004 grants the role to the migrating user (`GRANT hifz_tenant TO CURRENT_USER`); if the API connects as another
  role, grant it to that role too.
- Running migration 0004 needs **`CREATEROLE`**, or a DBA creates `hifz_tenant` (`NOLOGIN NOSUPERUSER NOBYPASSRLS`)
  beforehand.
- A superuser or `BYPASSRLS` login defeats RLS. Only the embedded development/test database connects as a superuser.

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

## Organization routes (F02)

Organization and role always come from the signed-in membership (FR-SEC-009). Bodies are strict: an
`organizationId`, `role`, or any other unexpected field is `400` with `fields.<name>: NOT_ALLOWED` (F02-AC9).
There is no route that creates a workspace or signs up (F02-AC16), and none that edits or deletes an audit record
(F02-AC12). Rules live in [`src/modules/access/policy.ts`](src/modules/access/policy.ts) (the SRS §17.1 matrix as
data, `can()` / `authorize()`, list scope) and [`src/modules/organization/rules.ts`](src/modules/organization/rules.ts).

| Route | Who | Body | Result |
|---|---|---|---|
| `GET /organization` | any member | — | `200` `{ id, name, kind, timezone, weekStart, dailyReportMode, canEdit }` |
| `PATCH /organization` | Owner/Admin | `{ name?, timezone?, weekStart? }` only | `200` settings; one `ORGANIZATION_UPDATED` audit with old and new values, none if nothing changed. `400 fields.name: REQUIRED` (blank), `fields.timezone: INVALID` (not an IANA name), `fields.weekStart: INVALID`. `403` for Teacher/Student/Parent |
| `POST /accounts/:id/role` | Owner | `{ role: ADMIN \| TEACHER }` | `200` account; `ADMIN_ADDED` or `ADMIN_REMOVED` audit. A new Admin's sessions end, so the next sign-in sets up two-factor. `400` unless the target is an active Teacher or Admin; `409 LAST_ADMIN` if no Owner/Admin would remain |
| `POST /accounts/:id/owner` | Owner | — | `200` account; the Admin becomes an Owner too, and the current Owner stays Owner. `OWNER_ADDED` audit. `400` unless the target is an active Admin |
| `POST /accounts/:id/all-classes` | Owner/Admin | `{ allClasses: boolean }` | `200` account; `ALL_CLASSES_SET` or `ALL_CLASSES_CLEARED` audit, none if unchanged. `400` unless the target is an active Teacher |

The role is checked first, so `403` comes before any ID lookup. An ID outside the madrasa is `404`, identical to an
ID that does not exist (F02-AC7). Accounts now include `allClasses`. Deactivation is refused with `409 LAST_ADMIN`
if it would leave no Owner or Admin.

## Sync routes (F12)

Protocol v1, decisions in [ADR-015](../../docs/adr/ADR-015-sync-protocol-idempotency-conflicts.md); shapes in
[`packages/contracts/src/sync.ts`](../../packages/contracts/src/sync.ts); pure rules in `packages/domain/sync`; code in
[`src/modules/sync`](src/modules/sync). Teacher, Admin, and Owner only; Student and Parent get `403 FORBIDDEN`
(online, read-only). Every route refuses a revoked membership or deactivated account with `403 ACCESS_REVOKED`
(also `/auth/refresh` and every other authenticated route, when the session ended for that reason), and an expired
session with `401 SESSION_EXPIRED`.

| Route | Body / query | Result |
|---|---|---|
| `POST /sync/push` | `{ protocolVersion, deviceId, ops: SyncOp[] }`, 1–100 ops in outbox order | `200` `{ results[], serverTime }`, one result per op in order: `APPLIED { rowVersion, entityId }`, `CONFLICT { conflictId }`, `REJECTED { code, fields? }` (`VALIDATION`, `NOT_FOUND`, `ENTITY_NOT_SUPPORTED`, `ID_TAKEN`, `OP_ID_REUSED`), or `RETRY { code }` (`DEPENDENCY_PENDING`, `CONFLICT_OPEN`; not stored, send again later). `426 UPGRADE_REQUIRED` below the minimum protocol; nothing applied |
| `GET /sync/pull` | `?protocolVersion=` (absent = 1) `&cursor=` (absent = bootstrap) `&limit=` (1–500, default 500) | `200` `{ changes[], cursor, hasMore, scopeReset, serverTime }`; a change is `UPSERT` with staff-projected `fields` or `REMOVE_FROM_DEVICE`. `400 fields.cursor: INVALID` for a bad cursor; `426` as for push |
| `GET /sync/conflicts` | `?status=OPEN\|RESOLVED&page=` | `200` 50 per page: entity, safe label, created time, caused-by user. A Teacher sees only conflicts their own operations caused, for records still in scope; Owner/Admin see all |
| `GET /sync/conflicts/:id` | — | `200` both versions, base and server versions, `fieldDiff[]`; `404` for anyone who may not resolve it |
| `POST /sync/conflicts/:id/resolve` | `{ choice: KEEP_DEVICE \| KEEP_SERVER \| MERGE, picks? }` | `200` `{ rowVersion }`; one `SYNC_CONFLICT_RESOLVED` audit. `404` for another Teacher (F12-AC17), `409 CONFLICT_STALE` if the row changed since, `409 CONFLICT_CLOSED` if already resolved, `400` for picks that split a coupled group |

- **Per op, one transaction:** organization advisory lock, idempotent replay check (`sync_ops.op_hash`), `op_id`
  claim, dependencies, scope (out of scope = `NOT_FOUND`), the handler's strict schema, conflict detection against
  `change_log`; then apply or store a conflict. One refused op never rolls back the others.
- **Dependencies:** an op is `RETRY DEPENDENCY_PENDING` until each `dependsOn` op of the same user is `APPLIED`, or
  its conflict is `RESOLVED`, **and** that op's record exists in the organization. F04/F05 must decide what happens
  to the dependents of a natural-key create-create conflict resolved with `KEEP_SERVER` (decision Q11), whose record
  is never created.
- **Own edits and `seq` (migration `0006_sync_ops_seq.sql`):** `sync_ops.seq` stores the op's client outbox `seq`
  (nullable, not unique, not part of `op_hash`). In the conflict check, a change since the base counts as a server
  change if its `op_id` is NULL, it came from another user or device, its `seq` is NULL, or its `seq` is greater than
  the incoming op's `seq`. So this device's own earlier edits are excluded, but an older edit arriving after a newer
  one becomes a conflict instead of overwriting it (NFR-OFF-006).
- **No entity is synced in production yet.** Each feature registers a `SyncHandler`
  ([`src/modules/sync/handler.ts`](src/modules/sync/handler.ts)) for its entities: attendance (F04), daily records,
  portions, attempts (F05), mistakes and notes (F07), homework (F08). Until then they are `ENTITY_NOT_SUPPORTED`.
- **Test-only `sync_probe` entity:** its table is applied by the integration-test harness from
  `test/support/migrations/9001_sync_probe.sql` and its handler is passed in as `testSync` (`NODE_ENV=test`). It is
  not in `migrations/` and is not registered by `npm run api:e2e-server`.
- **Scope:** until F03 adds the roster, a Teacher without "all classes" has an empty sync scope (fail closed). F03
  supplies a `SyncScopeProvider` and must call `recordScopeChange` for every Teacher a roster change affects
  ([`src/modules/sync/change-log.ts`](src/modules/sync/change-log.ts)).
- Request bodies are never logged, so operation fields and note bodies never reach the logs.

## Test control (non-production only)

Enabled when `TEST_CONTROL_SECRET` is set (the E2E server sets `local-e2e-control-secret` unless overridden; E2E
fixtures read `E2E_CONTROL_SECRET`). Every route needs the `x-test-control-secret` header and is otherwise `404`.

`POST /__test/reset` · `POST /__test/clock { advanceMs }` · `GET /__test/users/:loginId` · `GET /__test/otp/:loginId` ·
`GET /__test/emails/:loginId` · `GET /__test/audit/:loginId` · `GET /__test/totp/:loginId` · `POST /__test/search { text }`

F02 adds:
- `POST /__test/organizations { name, code, kind?, owner: { loginId, displayName?, email?, password? }, twoFactor? }`: the
  platform operator creates a workspace and its first Owner (FR-ORG-001), with the database defaults for timezone,
  week start, and report mode. With `twoFactor` (the default) the Owner gets an authenticator so fixtures can sign in.
- `POST /__test/audit/fail-next`: the next audit write fails (F02-AC13). A reset clears it.
- `GET /__test/audit-target/:id`: audit records about one organization or user, oldest first.

F12 adds (all cleared by `/__test/reset`):
- `POST /__test/sync/min-protocol { version }`: sets the oldest accepted protocol version (F12-AC15).
- `POST /__test/sync/fail-next { count, status? }`: the next `count` push/pull requests fail with `status`
  (500–599, default 503) (F12-AC6).
- `GET /__test/sync/ops/:opId`: the stored result of one operation (no fields; `sync_ops` never stores them).
- `GET /__test/sync/conflicts`: every conflict, oldest first, without the device/server values.

## Not yet built

- The per-IP throttle (F17-AC13) and the F17 audit query API arrive with F17.
- Row-level security (ADR-006, ADR-016) covers the sync tables only. The F01/F02 tables (`users`, `memberships`,
  `audit_logs`, …) get it with F03; until then every query on them filters by the membership's organization.
- Rate limiting on `/sync/*` is not built (open item D4 in docs/handover/F12-plan.md §12).
- F02: an operator CLI or console for creating workspaces (only test control does it today), and removing or demoting
  an Owner (who may do it is still open).
- The platform operator's reset of an Owner's two-factor setup is operator tooling, not an API route.
- Open items from the F01 code review (2026-11-02):
  - Refresh-token reuse is detected one rotation back only; older replays are refused but do not end the session (L3).
  - `login_failures` rows are never pruned; a cleanup job arrives with the pg-boss workers (L10).
  - Unknown User IDs answer a reset request with slightly less database work than real ones; the email send no
    longer adds to the difference (M3, partly addressed).

# F01 · Identity and authentication

**Status:** draft
**Brief:** [00-product-brief.md](../00-product-brief.md) · **Flow:** Sign-in and forgot password ([design.md §4.2](../../design.md)); Admin account management (design gap)
**Stories:** US-001 – US-006 · **Requirements:** FR-AUTH-001…011, FR-SEC-010, NFR-SEC-003

## Context

Every user signs in with a User ID that their madrasa gives them, never with an email. A Student and a Parent may share one email, and a person who belongs to several madaris has a separate account in each, so email cannot identify an account. The Madrasa Admin creates every Teacher, Student, and Parent account and sets its first password.

There is no code yet. This feature creates the `identity` module ([ARCHITECTURE.md §5, §7.1](../../ARCHITECTURE.md)), which consists of:
- the `users`, `sessions`, and `password_reset_otps` tables
- Argon2id password hashing
- a short-lived access token plus a rotating refresh token

Everything else depends on this feature, so build it first.

## User story

- **US-001:** As a user, I want to sign in with my unique User ID and password, so that my account does not depend on email being unique.
- **US-002:** As a user, I want to recover my password with an OTP sent to my registered email, so that I can get back in without waiting for the Admin.
- **US-003:** As a Madrasa Admin, I want to create Teacher, Student, and Parent accounts, so that access is controlled by the madrasa.
- **US-004:** As a Madrasa Admin, I want to set initial passwords for new accounts, so that users can sign in straight away.
- **US-005:** As an Admin, I want Student and Parent accounts to share an email while keeping separate User IDs, so that a family with one email can still have two accounts.
- **US-006:** As a user in several madaris, I want a separate account and User ID for each madrasa, so that each madrasa's data stays separate.

## Acceptance criteria

1. **(US-001) Given** an active account with a correct User ID and password, **when** the user signs in, **then** they reach their role's home screen and see data from that account's madrasa only.
2. **(US-001) Given** an account with a registered email, **when** someone types that email into the User ID field, **then** sign-in fails with the same message as a wrong password.
3. **(US-001) Given** a wrong password, or a User ID that does not exist, **when** sign-in is attempted, **then** the same message is shown in both cases ("User ID or password is incorrect").
4. **(US-001) Given** a User ID that has reached the failed-attempt limit, **when** another attempt is made, **then** it is refused for the cooling period, and the refusal looks the same whether or not the User ID exists.
5. **(US-001) Given** a signed-in user, **when** they sign out, **then** their refresh token is revoked, and any later request using that session's tokens is rejected.
6. **(US-001) Given** a session that has expired, **when** the app calls the API, **then** the app shows the session-expired sign-in prompt, and unsynced local changes are kept.
7. **(US-002) Given** an account with a registered email, **when** the user requests a reset by entering their User ID, **then** an OTP is emailed to that account's email only, and the screen shows a neutral confirmation.
8. **(US-002) Given** a User ID that does not exist, or an account with no email, **when** a reset is requested, **then** the same neutral confirmation is shown and no email is sent.
9. **(US-002) Given** an OTP that has expired, or has had too many wrong tries, **when** it is submitted, **then** it is rejected and the password is unchanged.
10. **(US-002) Given** a valid OTP, **when** the user sets a new password that meets the policy, **then** the password changes and every existing session of that account is revoked. An audit event is recorded that contains neither the OTP nor the password.
11. **(US-002) Given** an account that has hit the OTP request limit, **when** another OTP is requested, **then** no new OTP is sent until the limit window passes.
12. **(US-003) Given** a Madrasa Admin, **when** they create a Teacher, Student, or Parent account with a User ID, **then** the account exists in that madrasa with that role, and an audit event is recorded.
13. **(US-003) Given** a Teacher, Student, or Parent, **when** they call the create-account endpoint, **then** it returns forbidden and nothing is created.
14. **(US-003) Given** a User ID that is already in use, **when** the Admin creates another account with the same ID, **then** creation is rejected with "User ID already in use".
15. **(US-004) Given** an Admin-set initial password, **when** the account is saved, **then** only a password hash is stored, and the plain password does not appear in the database, logs, or audit records.
16. **(US-004) Given** an initial password that does not meet the password policy, **when** the Admin saves, **then** the password field shows an error and the account is not created.
17. **(US-004) Given** a new account, **when** the user signs in for the first time with the Admin-set password, **then** they go straight to their home screen and are not asked to change the password.
18. **(US-005) Given** a Student account with email `x@example.com`, **when** the Admin creates a Parent account with the same email, **then** the Parent account is saved.
19. **(US-005) Given** a Student and a Parent who share an email, **when** the Parent resets their password using the Parent User ID, **then** the Student's password and sessions are unchanged.
20. **(US-006) Given** a person with accounts in Madrasa A and Madrasa B, **when** they are signed in to the A account and request a Madrasa B record by its ID, **then** the response is "not found", exactly as for an ID that does not exist.
21. **(US-006) Given** a person whose Madrasa A account has been deactivated, **when** they sign in to their Madrasa B account, **then** sign-in works normally.
22. **(US-006) Given** a deactivated account, **when** it tries to sign in or use an existing session, **then** it is refused and its sessions are revoked.

## Out of scope

- Signing in with email or phone number.
- Self sign-up for Teacher, Student, or Parent.
- Email verification to activate an account (FR-AUTH-008).
- Forcing a password change on first sign-in.
- 2FA and recovery codes (still open: SRS §13 #1).
- Social or SSO login, and SMS OTP.
- One account that switches between several madaris.

## Edge cases

| Situation | What should happen |
|---|---|
| The User ID is typed with spaces before or after it | The spaces are trimmed before checking |
| Sign-in is attempted while offline | A "network unavailable" state is shown; the typed User ID is kept and the password field is cleared |
| The user asks for a second OTP | A new OTP replaces the old one, within the rate limit; the old OTP stops working |
| The account has no email | Self-service recovery is impossible. The neutral confirmation is shown, and the help text says to contact the madrasa Admin |
| The user signs out while changes are not yet synced | The unsynced-changes warning from F12 appears first |
| Two accounts are used on one device | Each account's local data is kept separate; signing in to one never shows the other's cached data |

## Open questions

- [ ] Which authentication provider/library and email-sending service to use (SRS §13 #1)?
- [ ] Password policy: minimum length and any character rules.
- [ ] User ID format and whether it is case-sensitive. ARCHITECTURE ADR-011 proposes globally unique IDs with a madrasa prefix.
- [ ] The failed-attempt limit and cooling period, plus OTP length, expiry, and attempt limit. The proposed values are a 6-digit OTP, a 10-minute expiry, and 5 attempts.
- [ ] Can an Admin reset a user's password directly, for a user with no email?
- [ ] Is 2FA part of MVP (SRS §13 #1)?

## Done means

- [ ] Every acceptance criterion has a passing test.
- [ ] `npm run e2e:gate -- F01` passes: every criterion has an E2E test, none is pending, and all pass (e2e/README.md).
- [ ] Nothing from "Out of scope" was built.
- [ ] `npm test` and `npm run lint` pass.
- [ ] A test checks that sign-in and reset messages are identical for an unknown User ID and a wrong password.
- [ ] No test fixture, log, or audit record contains a real password, OTP, or token.

## Test plan

| Level | What it covers | Where |
|---|---|---|
| **Unit** | Password policy check, OTP generation/expiry/attempt counting, User ID normalization (trim) | `apps/api/src/modules/identity/**/*.test.ts` |
| **Integration** | Sign-in, sign-out, refresh, rate limits, OTP reset, session revocation, account creation by role, cross-madrasa ID probing — against a real Postgres | `apps/api/test/identity/*.test.ts` |
| **Component** | Sign-in form states, forgot-password steps, neutral messages, offline state | `apps/mobile/src/features/auth/__tests__/*.test.tsx` |
| **E2E** | Every acceptance criterion: server-side checks (API) and device journeys (Maestro), including: Admin creates a Teacher → the Teacher signs in → signs out; Forgot password → OTP → new password | `e2e/api/f01-identity.spec.ts`, `e2e/mobile/f01-identity/` |

**Traceability:** Each test name starts with its criterion, e.g. `F01-AC03 (US-001) …`. Every AC 1–22 has at least one test.

**Coverage:** ≥80% on new code.

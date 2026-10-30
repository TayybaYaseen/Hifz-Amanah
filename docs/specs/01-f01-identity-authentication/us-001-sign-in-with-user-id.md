# SPEC-US-001 · Sign in with User ID

| | |
|---|---|
| **Spec ID** | SPEC-US-001 |
| **User story** | US-001 |
| **Feature** | [F01 · Identity and authentication](README.md) |
| **Epic** | EPIC 1 — Identity and Authentication ([user-stories.md](../../user-stories.md)) |
| **Status** | draft |
| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |
| **Split from** | `docs/specs/F01-identity-authentication.md` on 2026-10-30 |

## User story

**US-001 — Sign in with User ID**

As a user, I want to sign in with my unique User ID and password so that my account is not dependent on email uniqueness.

Spec wording (from F01):

- **US-001:** As a user, I want to sign in with my unique User ID and password, so that my account does not depend on email being unique.

**Feature context** (shared by every story in F01, copied from the feature spec):

> Every user signs in with a User ID that their madrasa gives them, never with an email. A Student and a Parent may share one email, and a person who belongs to several madaris has a separate account in each, so email cannot identify an account. The Madrasa Admin creates every Teacher, Student, and Parent account and sets its first password.
>
> There is no code yet. This feature creates the `identity` module ([ARCHITECTURE.md §5, §7.1](../../ARCHITECTURE.md)), which consists of:
> - the `users`, `sessions`, and `password_reset_otps` tables
> - Argon2id password hashing
> - a short-lived access token plus a rotating refresh token
>
> Everything else depends on this feature, so build it first.

## Related functional requirements

Requirements this story covers. SRS.md has no story-to-requirement table, so this list is derived from the requirement text and the criteria below.

- **Functional:** FR-AUTH-001, FR-AUTH-002, FR-AUTH-003, FR-SEC-001, FR-AUTH-014
- **Non-functional:** NFR-SEC-003
- **SRS acceptance tests cited:** None

Feature requirement set (from F01; additions of 2026-10-30 at the end): FR-AUTH-001…011, FR-SEC-010, NFR-SEC-003, FR-AUTH-012…016

## Acceptance criteria

### Story acceptance criteria

Verbatim from [user-stories.md](../../user-stories.md).

1. The user enters a valid User ID and password to access only the account associated with that identity.
2. Email is not accepted as a login identifier; invalid credentials produce a non-revealing error.
3. Sessions expire/revoke securely and sign-out prevents subsequent access using the ended session.

### Detailed acceptance criteria

From the F01 feature spec. The original IDs are kept because tests cite them. Criteria marked *Revised* or *Added* come from the decision review of 2026-10-30 (SRS §17).

- **F01-AC1** — **(US-001) Given** an active account with a correct User ID and password, **when** the user signs in, **then** they reach their role's home screen and see data from that account's madrasa only.
- **F01-AC2** — **(US-001) Given** an account with a registered email, **when** someone types that email into the User ID field, **then** sign-in fails with the same message as a wrong password.
- **F01-AC3** — **(US-001) Given** a wrong password, or a User ID that does not exist, **when** sign-in is attempted, **then** the same message is shown in both cases ("User ID or password is incorrect").
- **F01-AC4** — **(US-001) Given** a User ID that has reached the failed-attempt limit, **when** another attempt is made, **then** it is refused for the cooling period, and the refusal looks the same whether or not the User ID exists.
- **F01-AC5** — **(US-001) Given** a signed-in user, **when** they sign out, **then** their refresh token is revoked, and any later request using that session's tokens is rejected.
- **F01-AC6** — **(US-001) Given** a session that has expired, **when** the app calls the API, **then** the app shows the session-expired sign-in prompt, and unsynced local changes are kept.
- **F01-AC25** — **(US-001) Given** 10 failed sign-ins for one User ID within 15 minutes, **when** another attempt is made with the right password, **then** it is refused for 15 minutes with the same message as for an unknown User ID, and the lock is audited and visible to the Admin. *(Added 2026-10-30, DEC-B10.)*

## Business rules

No SRS §9 business rule is specific to this story. The rules it follows are stated in the criteria above.

## Validation rules

Stated in these criteria: F01-AC4, F01-AC5, F01-AC25.

## Edge cases and error handling

Rows from the F01 edge-case table that apply to this story (verbatim):

| Situation | What should happen |
|---|---|
| The User ID is typed with spaces before or after it | The spaces are trimmed before checking |
| Sign-in is attempted while offline | A "network unavailable" state is shown; the typed User ID is kept and the password field is cleared |
| The user signs out while changes are not yet synced | The unsynced-changes warning from F12 appears first |
| Two accounts are used on one device | Each account's local data is kept separate; signing in to one never shows the other's cached data |

**Out of scope for the whole feature** (verbatim from F01):

- Signing in with email or phone number.
- Self sign-up for Teacher, Student, or Parent.
- Email verification to activate an account (FR-AUTH-008).
- Forcing a password change on first sign-in.
- Two-factor sign-in for Teacher, Student, and Parent accounts. Owner/Admin two-factor sign-in is in scope (US-072, FR-AUTH-016).
- Social or SSO login, and SMS OTP.
- One account that switches between several madaris.

## Dependencies

- **Feature F01 depends on:** — (from the spec index)
- **Features referenced by this story's criteria and edge cases:** F12
- **Other stories referenced:** None
- **Other stories in F01:** [US-002](us-002-recover-password-by-email-otp.md), [US-003](us-003-admin-creates-accounts.md), [US-004](us-004-admin-sets-initial-passwords.md), [US-005](us-005-use-shared-email-safely.md), [US-006](us-006-separate-accounts-per-madrasa.md), [US-071](us-071-manage-my-profile.md), [US-072](us-072-use-two-factor-sign-in-as-owner-or-admin.md)

## Related screens and UI

- **Feature flow** (from F01): Sign-in and forgot password ([design.md §4.2](../../design.md)); Admin account management (design gap)

[design.md §13](../../design.md) story-to-screen map (verbatim):

| Story | Screen (this document) | Key interaction | Required states beyond standard | Validation shown | Accessibility / localization specifics |
|---|---|---|---|---|---|
| US-001 | §4.2 Sign-in; §4.13, §8 session expired | User ID and password; Sign in (disabled while sending); session-expired prompt, then sign in again | Offline (network unavailable, input kept); Session expired; Waiting to sync | Generic credential error; User ID kept | Language selector on Sign-in; password show/hide labeled; pending count available to screen readers |

## Related API and data model

- **Modules** ([ARCHITECTURE.md §18](../../ARCHITECTURE.md)): `identity`
- Tables and services are described in the feature context above and in [ARCHITECTURE.md](../../ARCHITECTURE.md). Concrete API routes are defined at scaffolding (SRS §17 DEC-B54).

## Offline and sync behavior

Stated in these criteria: F01-AC6.

And in these edge cases (see above):

- Sign-in is attempted while offline
- The user signs out while changes are not yet synced
- Two accounts are used on one device

## Related E2E test scenarios

**Completion gate:** this spec is complete only when `npm run e2e:gate -- US-001` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](../../../e2e/README.md)).

**API (Playwright):**

- [e2e/api/f01-identity.spec.ts](../../../e2e/api/f01-identity.spec.ts) — F01-AC2 (US-001) an email in the User ID field fails exactly like a wrong password
- [e2e/api/f01-identity.spec.ts](../../../e2e/api/f01-identity.spec.ts) — F01-AC3 (US-001) wrong password and unknown User ID return the same message
- [e2e/api/f01-identity.spec.ts](../../../e2e/api/f01-identity.spec.ts) — F01-AC4 (US-001) lockout looks the same for existing and unknown User IDs
- [e2e/api/f01-identity.spec.ts](../../../e2e/api/f01-identity.spec.ts) — F01-AC5 (US-001) sign-out revokes the refresh token and the session
- [e2e/api/f01-identity.spec.ts](../../../e2e/api/f01-identity.spec.ts) — F01-AC25 (US-001) 10 failures in 15 minutes lock the account for 15 minutes

**Mobile (Maestro):**

- [e2e/mobile/f01-identity/session-expired.yaml](../../../e2e/mobile/f01-identity/session-expired.yaml) — F01 session — expired session prompts sign-in and keeps unsynced changes
- [e2e/mobile/f01-identity/sign-in.yaml](../../../e2e/mobile/f01-identity/sign-in.yaml) — F01 sign-in — role home, neutral errors, no forced password change

**Unit (Vitest):**

- [apps/api/src/modules/identity/identity.test.ts](../../../apps/api/src/modules/identity/identity.test.ts) — F01-AC2 (US-001) an email address typed as User ID never matches an account by email

## Open decisions and blockers

Open questions from F01 that apply to this story, with their resolutions (decision review of 2026-10-30, SRS §17):

- [x] Which authentication provider/library and email-sending service to use (SRS §13 #1)? **Resolved:** Built into the API; OTP email through Amazon SES (DEC-B05, B06).
- [x] User ID format and whether it is case-sensitive. ARCHITECTURE ADR-011 proposes globally unique IDs with a madrasa prefix. **Resolved:** Global, case-insensitive, 3–32 letters/digits/hyphens, madrasa prefix suggested (DEC-B09, FR-AUTH-013).
- [x] The failed-attempt limit and cooling period, plus OTP length, expiry, and attempt limit. The proposed values are a 6-digit OTP, a 10-minute expiry, and 5 attempts. **Resolved:** 6-digit OTP, 10 minutes, 5 tries, 3 requests/hour; 10 failures in 15 minutes lock for 15 minutes (DEC-B10, FR-AUTH-014).
- [x] Is 2FA part of MVP (SRS §13 #1)? **Resolved:** Yes for Owner and Admin: authenticator app + 10 recovery codes (DEC-B07, FR-AUTH-016, US-072).

## Traceability

- **Story:** US-001 → SPEC-US-001 (this file)
- **Detailed criteria:** F01-AC1, F01-AC2, F01-AC3, F01-AC4, F01-AC5, F01-AC6, F01-AC25
- **Requirements:** FR-AUTH-001, FR-AUTH-002, FR-AUTH-003, FR-SEC-001, NFR-SEC-003, FR-AUTH-014
- **SRS acceptance tests:** None
- **Business rules:** None
- **Design:** design.md §13; **Architecture:** ARCHITECTURE.md §18 epic 1
- **Previous location:** `docs/specs/F01-identity-authentication.md`

# SPEC-US-002 · Recover password by email OTP

| | |
|---|---|
| **Spec ID** | SPEC-US-002 |
| **User story** | US-002 |
| **Feature** | [F01 · Identity and authentication](README.md) |
| **Epic** | EPIC 1 — Identity and Authentication ([user-stories.md](../../user-stories.md)) |
| **Status** | draft |
| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |
| **Split from** | `docs/specs/F01-identity-authentication.md` on 2026-10-30 |

## User story

**US-002 — Recover password by email OTP**

As a user, I want to recover my password using an OTP sent to my registered email.

Spec wording (from F01):

- **US-002:** As a user, I want to recover my password with an OTP sent to my registered email, so that I can get back in without waiting for the Admin.

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

- **Functional:** FR-AUTH-007, FR-AUTH-015
- **Non-functional:** NFR-SEC-003
- **SRS acceptance tests cited:** None

Feature requirement set (from F01; additions of 2026-10-30 at the end): FR-AUTH-001…011, FR-SEC-010, NFR-SEC-003, FR-AUTH-012…016

## Acceptance criteria

### Story acceptance criteria

Verbatim from [user-stories.md](../../user-stories.md).

1. A recovery OTP is sent only to the registered email address and is time-limited and rate-limited.
2. A password reset is allowed only after valid OTP verification; expired/invalid OTPs are rejected.
3. The reset event is audited and existing session/security behavior follows the approved recovery policy.

### Detailed acceptance criteria

From the F01 feature spec. The original IDs are kept because tests cite them. Criteria marked *Revised* or *Added* come from the decision review of 2026-10-30 (SRS §17).

- **F01-AC7** — **(US-002) Given** an account with a registered email, **when** the user requests a reset by entering their User ID, **then** an OTP is emailed to that account's email only, and the screen shows a neutral confirmation.
- **F01-AC8** — **(US-002) Given** a User ID that does not exist, or an account with no email, **when** a reset is requested, **then** the same neutral confirmation is shown and no email is sent.
- **F01-AC9** — **(US-002) Given** an OTP that has expired, or has had too many wrong tries, **when** it is submitted, **then** it is rejected and the password is unchanged.
- **F01-AC10** — **(US-002) Given** a valid OTP, **when** the user sets a new password that meets the policy, **then** the password changes and every existing session of that account is revoked. An audit event is recorded that contains neither the OTP nor the password.
- **F01-AC11** — **(US-002) Given** an account that has hit the OTP request limit, **when** another OTP is requested, **then** no new OTP is sent until the limit window passes.
- **F01-AC26** — **(US-002) Given** an Owner or Admin, **when** they set a new password for a Teacher, Student, or Parent account, **then** the password changes, that user's sessions are revoked, and the action is audited. An Admin cannot reset another Admin's or the Owner's password; the Owner can reset an Admin's. *(Added 2026-10-30, DEC-B11.)*

## Business rules

No SRS §9 business rule is specific to this story. The rules it follows are stated in the criteria above.

## Validation rules

Stated in these criteria: F01-AC9, F01-AC26.

## Edge cases and error handling

Rows from the F01 edge-case table that apply to this story (verbatim):

| Situation | What should happen |
|---|---|
| The user asks for a second OTP | A new OTP replaces the old one, within the rate limit; the old OTP stops working |
| The account has no email | Self-service recovery is impossible. The neutral confirmation is shown, and the help text says to contact the madrasa Admin |

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
- **Features referenced by this story's criteria and edge cases:** None
- **Other stories referenced:** None
- **Other stories in F01:** [US-001](us-001-sign-in-with-user-id.md), [US-003](us-003-admin-creates-accounts.md), [US-004](us-004-admin-sets-initial-passwords.md), [US-005](us-005-use-shared-email-safely.md), [US-006](us-006-separate-accounts-per-madrasa.md), [US-071](us-071-manage-my-profile.md), [US-072](us-072-use-two-factor-sign-in-as-owner-or-admin.md)

## Related screens and UI

- **Feature flow** (from F01): Sign-in and forgot password ([design.md §4.2](../../design.md)); Admin account management (design gap)

[design.md §13](../../design.md) story-to-screen map (verbatim):

| Story | Screen (this document) | Key interaction | Required states beyond standard | Validation shown | Accessibility / localization specifics |
|---|---|---|---|---|---|
| US-002, US-070 | §4.2 Forgot password | User ID → OTP → new password | Offline; OTP expired; too many attempts | Neutral confirmation that never reveals whether the User ID exists | OTP field announces expiry time |

## Related API and data model

- **Modules** ([ARCHITECTURE.md §18](../../ARCHITECTURE.md)): `identity`
- Tables and services are described in the feature context above and in [ARCHITECTURE.md](../../ARCHITECTURE.md). Concrete API routes are defined at scaffolding (SRS §17 DEC-B54).

## Offline and sync behavior

Nothing specific to this story in the source documents.

## Related E2E test scenarios

**Completion gate:** this spec is complete only when `npm run e2e:gate -- US-002` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](../../../e2e/README.md)).

**API (Playwright):**

- [e2e/api/f01-identity.spec.ts](../../../e2e/api/f01-identity.spec.ts) — F01-AC7 (US-002) reset OTP is emailed only to the account email
- [e2e/api/f01-identity.spec.ts](../../../e2e/api/f01-identity.spec.ts) — F01-AC8 (US-002) unknown User ID or no email gives the same neutral response and sends nothing
- [e2e/api/f01-identity.spec.ts](../../../e2e/api/f01-identity.spec.ts) — F01-AC9 (US-002) expired or over-tried OTP is rejected and the password is unchanged
- [e2e/api/f01-identity.spec.ts](../../../e2e/api/f01-identity.spec.ts) — F01-AC10 (US-002) a valid OTP reset changes the password, revokes sessions, and audits safely
- [e2e/api/f01-identity.spec.ts](../../../e2e/api/f01-identity.spec.ts) — F01-AC11 (US-002) OTP requests over the limit send nothing until the window passes
- [e2e/api/f01-identity.spec.ts](../../../e2e/api/f01-identity.spec.ts) — F01-AC26 (US-002) an Admin can reset a user password directly; only the Owner resets an Admin

**Mobile (Maestro):**

- [e2e/mobile/f01-identity/password-reset.yaml](../../../e2e/mobile/f01-identity/password-reset.yaml) — F01 password reset — User ID, OTP, new password
- [e2e/mobile/f01-identity/profile-and-two-factor.yaml](../../../e2e/mobile/f01-identity/profile-and-two-factor.yaml) — F01 profile, User ID rules, Admin reset, and Owner/Admin two-factor sign-in

**Unit (Vitest):**

- [apps/api/src/modules/identity/identity.test.ts](../../../apps/api/src/modules/identity/identity.test.ts) — F01-AC9 (US-002) rejects an expired OTP
- [apps/api/src/modules/identity/identity.test.ts](../../../apps/api/src/modules/identity/identity.test.ts) — F01-AC9 (US-002) rejects an OTP after the maximum number of wrong tries
- [apps/api/src/modules/identity/identity.test.ts](../../../apps/api/src/modules/identity/identity.test.ts) — F01-AC11 (US-002) refuses a new OTP while the request limit window is active
- [apps/api/src/modules/identity/identity.test.ts](../../../apps/api/src/modules/identity/identity.test.ts) — F01-AC11 (US-002) allows a new OTP once the limit window has passed

## Open decisions and blockers

Open questions from F01 that apply to this story, with their resolutions (decision review of 2026-10-30, SRS §17):

- [x] Which authentication provider/library and email-sending service to use (SRS §13 #1)? **Resolved:** Built into the API; OTP email through Amazon SES (DEC-B05, B06).
- [x] The failed-attempt limit and cooling period, plus OTP length, expiry, and attempt limit. The proposed values are a 6-digit OTP, a 10-minute expiry, and 5 attempts. **Resolved:** 6-digit OTP, 10 minutes, 5 tries, 3 requests/hour; 10 failures in 15 minutes lock for 15 minutes (DEC-B10, FR-AUTH-014).
- [x] Can an Admin reset a user's password directly, for a user with no email? **Resolved:** Yes, audited; only the Owner resets an Admin (DEC-B11, FR-AUTH-015).

## Traceability

- **Story:** US-002 → SPEC-US-002 (this file)
- **Detailed criteria:** F01-AC7, F01-AC8, F01-AC9, F01-AC10, F01-AC11, F01-AC26
- **Requirements:** FR-AUTH-007, NFR-SEC-003, FR-AUTH-015
- **SRS acceptance tests:** None
- **Business rules:** None
- **Design:** design.md §13; **Architecture:** ARCHITECTURE.md §18 epic 1
- **Previous location:** `docs/specs/F01-identity-authentication.md`

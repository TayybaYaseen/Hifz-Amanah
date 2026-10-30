# SPEC-US-004 · Admin sets initial passwords

| | |
|---|---|
| **Spec ID** | SPEC-US-004 |
| **User story** | US-004 |
| **Feature** | [F01 · Identity and authentication](README.md) |
| **Epic** | EPIC 1 — Identity and Authentication ([user-stories.md](../../user-stories.md)) |
| **Status** | draft |
| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |
| **Split from** | `docs/specs/F01-identity-authentication.md` on 2026-10-30 |

## User story

**US-004 — Admin sets initial passwords**

As a Madrasa Admin, I want to set initial passwords for newly created accounts.

Spec wording (from F01):

- **US-004:** As a Madrasa Admin, I want to set initial passwords for new accounts, so that users can sign in straight away.

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

- **Functional:** FR-AUTH-009, FR-AUTH-010, FR-AUD-003, FR-AUTH-012
- **Non-functional:** Not applicable
- **SRS acceptance tests cited:** None

Feature requirement set (from F01; additions of 2026-10-30 at the end): FR-AUTH-001…011, FR-SEC-010, NFR-SEC-003, FR-AUTH-012…016

## Acceptance criteria

### Story acceptance criteria

Verbatim from [user-stories.md](../../user-stories.md).

1. Only an authorized Madrasa Admin can set the initial password when creating a Teacher, Student, or Parent account.
2. The password must meet the approved password policy; it is stored only as a secure hash and never appears in logs or audit records.
3. The user can sign in with the Admin-set password and is not forced to change it on first login.

### Detailed acceptance criteria

From the F01 feature spec. The original IDs are kept because tests cite them. Criteria marked *Revised* or *Added* come from the decision review of 2026-10-30 (SRS §17).

- **F01-AC15** — **(US-004) Given** an Admin-set initial password, **when** the account is saved, **then** only a password hash is stored, and the plain password does not appear in the database, logs, or audit records.
- **F01-AC16** — **(US-004) Given** an initial password that does not meet the password policy, **when** the Admin saves, **then** the password field shows an error and the account is not created.
- **F01-AC17** — **(US-004) Given** a new account, **when** the user signs in for the first time with the Admin-set password, **then** they go straight to their home screen and are not asked to change the password.
- **F01-AC23** — **(US-004) Given** a password of 7 characters, a very common password, or one equal to the User ID, **when** an Admin or the user sets it, **then** it is rejected with a field error. A password of 8–64 characters is accepted with any characters, without composition rules. *(Added 2026-10-30, DEC-B08.)*

## Business rules

No SRS §9 business rule is specific to this story. The rules it follows are stated in the criteria above.

## Validation rules

Stated in these criteria: F01-AC16, F01-AC23.

## Edge cases and error handling

No F01 edge case is specific to this story. See the [feature edge cases](README.md#edge-cases).

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
- **Other stories in F01:** [US-001](us-001-sign-in-with-user-id.md), [US-002](us-002-recover-password-by-email-otp.md), [US-003](us-003-admin-creates-accounts.md), [US-005](us-005-use-shared-email-safely.md), [US-006](us-006-separate-accounts-per-madrasa.md), [US-071](us-071-manage-my-profile.md), [US-072](us-072-use-two-factor-sign-in-as-owner-or-admin.md)

## Related screens and UI

- **Feature flow** (from F01): Sign-in and forgot password ([design.md §4.2](../../design.md)); Admin account management (design gap)

[design.md §13](../../design.md) story-to-screen map (verbatim):

| Story | Screen (this document) | Key interaction | Required states beyond standard | Validation shown | Accessibility / localization specifics |
|---|---|---|---|---|---|
| US-003, US-004, US-005, US-006 | Account management (design gap; FormField and §5.11 dialogs) | Admin creates Teacher/Student/Parent account, assigns User ID, sets initial password, optional email | Offline (creation needs network) | User ID unique, case-insensitive, 3–32 characters, madrasa prefix suggested (FR-AUTH-013); password 8–64 characters, common passwords and the User ID rejected (FR-AUTH-012); shared Student/Parent email allowed | Password field show/hide; no email-as-login hint |

## Related API and data model

- **Modules** ([ARCHITECTURE.md §18](../../ARCHITECTURE.md)): `identity`
- Tables and services are described in the feature context above and in [ARCHITECTURE.md](../../ARCHITECTURE.md). Concrete API routes are defined at scaffolding (SRS §17 DEC-B54).

## Offline and sync behavior

Nothing specific to this story in the source documents.

## Related E2E test scenarios

**Completion gate:** this spec is complete only when `npm run e2e:gate -- US-004` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](../../../e2e/README.md)).

**API (Playwright):**

- [e2e/api/f01-identity.spec.ts](../../../e2e/api/f01-identity.spec.ts) — F01-AC15 (US-004) the initial password is never stored or logged in plain text
- [e2e/api/f01-identity.spec.ts](../../../e2e/api/f01-identity.spec.ts) — F01-AC16 (US-004) an initial password that breaks the policy is rejected
- [e2e/api/f01-identity.spec.ts](../../../e2e/api/f01-identity.spec.ts) — F01-AC23 (US-004) the password policy is 8–64 characters with a common-password and User ID blocklist

**Mobile (Maestro):**

- [e2e/mobile/f01-identity/admin-creates-accounts.yaml](../../../e2e/mobile/f01-identity/admin-creates-accounts.yaml) — F01 accounts — Admin creates Teacher, Student, Parent with shared email
- [e2e/mobile/f01-identity/sign-in.yaml](../../../e2e/mobile/f01-identity/sign-in.yaml) — F01 sign-in — role home, neutral errors, no forced password change

**Unit (Vitest):**

- [apps/api/src/modules/identity/identity.test.ts](../../../apps/api/src/modules/identity/identity.test.ts) — F01-AC16 (US-004) rejects an initial password that does not meet the policy
- [apps/api/src/modules/identity/identity.test.ts](../../../apps/api/src/modules/identity/identity.test.ts) — F01-AC16 (US-004) accepts a password that meets the policy
- [apps/api/src/modules/identity/identity.test.ts](../../../apps/api/src/modules/identity/identity.test.ts) — F01-AC15 (US-004) stores only a hash; the hash never contains the plain password
- [apps/api/src/modules/identity/identity.test.ts](../../../apps/api/src/modules/identity/identity.test.ts) — F01-AC23 (US-004) the password policy is 8–64 characters with a common-password and User ID blocklist

## Open decisions and blockers

Open questions from F01 that apply to this story, with their resolutions (decision review of 2026-10-30, SRS §17):

- [x] Password policy: minimum length and any character rules. **Resolved:** 8–64 characters, no composition rules, common passwords and the User ID rejected (DEC-B08, FR-AUTH-012).

## Traceability

- **Story:** US-004 → SPEC-US-004 (this file)
- **Detailed criteria:** F01-AC15, F01-AC16, F01-AC17, F01-AC23
- **Requirements:** FR-AUTH-009, FR-AUTH-010, FR-AUD-003, FR-AUTH-012
- **SRS acceptance tests:** None
- **Business rules:** None
- **Design:** design.md §13; **Architecture:** ARCHITECTURE.md §18 epic 1
- **Previous location:** `docs/specs/F01-identity-authentication.md`

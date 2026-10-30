# SPEC-US-071 · Manage my profile

| | |
|---|---|
| **Spec ID** | SPEC-US-071 |
| **User story** | US-071 |
| **Feature** | [F01 · Identity and authentication](README.md) |
| **Epic** | EPIC 1 — Identity and Authentication ([user-stories.md](../../user-stories.md)) |
| **Status** | draft |
| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |
| **Origin** | Added by the decision review of 2026-10-30 (SRS §17) |

## User story

**US-071 — Manage my profile**

As a signed-in user, I want to view my profile, change my own password, and update my display name and optional email.

Spec wording (from F01):

- **US-071:** As a signed-in user, I want to view my profile, change my own password, and update my display name and optional email, so that my account details stay correct without asking the Admin. *(Added 2026-10-30, DEC-B03.)*

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

- **Functional:** FR-AUTH-006, FR-AUTH-012, FR-AUD-001
- **Non-functional:** Not applicable
- **SRS acceptance tests cited:** None

Feature requirement set (from F01; additions of 2026-10-30 at the end): FR-AUTH-001…011, FR-SEC-010, NFR-SEC-003, FR-AUTH-012…016

## Acceptance criteria

### Story acceptance criteria

Verbatim from [user-stories.md](../../user-stories.md).

1. A user can view their own profile and edit only their display name and optional email; User ID, role, and madrasa are read-only.
2. Changing the password requires the current password, follows the password policy, revokes the user's other sessions, and is audited.
3. A user can never change another user's profile from My profile.

### Detailed acceptance criteria

From the F01 feature spec. The original IDs are kept because tests cite them. Criteria marked *Revised* or *Added* come from the decision review of 2026-10-30 (SRS §17).

- **F01-AC27** — **(US-071) Given** a signed-in user, **when** they open My profile, **then** they see their display name, optional email, User ID, role, and madrasa, and can edit only the display name and email. *(Added 2026-10-30, DEC-B03.)*
- **F01-AC28** — **(US-071) Given** a signed-in user changing their password, **when** they enter the correct current password and a new password that meets the policy, **then** the password changes, their other sessions are revoked, and the change is audited. A wrong current password is rejected and nothing changes. *(Added 2026-10-30, DEC-B03.)*
- **F01-AC29** — **(US-071) Given** a user, **when** they send a profile update that changes their User ID, role, madrasa, or another user's profile, **then** it is rejected and nothing changes. *(Added 2026-10-30, DEC-B03.)*

## Business rules

No SRS §9 business rule is specific to this story. The rules it follows are stated in the criteria above.

## Validation rules

Stated in these criteria: F01-AC28, F01-AC29.

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
- **Other stories in F01:** [US-001](us-001-sign-in-with-user-id.md), [US-002](us-002-recover-password-by-email-otp.md), [US-003](us-003-admin-creates-accounts.md), [US-004](us-004-admin-sets-initial-passwords.md), [US-005](us-005-use-shared-email-safely.md), [US-006](us-006-separate-accounts-per-madrasa.md), [US-072](us-072-use-two-factor-sign-in-as-owner-or-admin.md)

## Related screens and UI

- **Feature flow** (from F01): Sign-in and forgot password ([design.md §4.2](../../design.md)); Admin account management (design gap)

[design.md §13](../../design.md) story-to-screen map (verbatim):

| Story | Screen (this document) | Key interaction | Required states beyond standard | Validation shown | Accessibility / localization specifics |
|---|---|---|---|---|---|
| US-071 | §4.16 Settings → My profile | View profile; edit display name and optional email; Change password (current + new) | Offline (changes need network) | Wrong current password; password policy | User ID, role, and madrasa shown read-only as text |

## Related API and data model

- **Modules** ([ARCHITECTURE.md §18](../../ARCHITECTURE.md)): `identity`
- Tables and services are described in the feature context above and in [ARCHITECTURE.md](../../ARCHITECTURE.md). Concrete API routes are defined at scaffolding (SRS §17 DEC-B54).

## Offline and sync behavior

Nothing specific to this story in the source documents.

## Related E2E test scenarios

**Completion gate:** this spec is complete only when `npm run e2e:gate -- US-071` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](../../../e2e/README.md)).

**API (Playwright):**

- [e2e/api/f01-identity.spec.ts](../../../e2e/api/f01-identity.spec.ts) — F01-AC28 (US-071) changing your own password needs the current password and revokes other sessions
- [e2e/api/f01-identity.spec.ts](../../../e2e/api/f01-identity.spec.ts) — F01-AC29 (US-071) User ID, role, madrasa, and other users’ profiles cannot be changed from My profile

**Mobile (Maestro):**

- [e2e/mobile/f01-identity/profile-and-two-factor.yaml](../../../e2e/mobile/f01-identity/profile-and-two-factor.yaml) — F01 profile, User ID rules, Admin reset, and Owner/Admin two-factor sign-in

**Unit (Vitest):**

- None

## Open decisions and blockers

None. The story was added by the decision review of 2026-10-30, and its behavior is fully decided (SRS §17).

## Traceability

- **Story:** US-071 → SPEC-US-071 (this file)
- **Detailed criteria:** F01-AC27, F01-AC28, F01-AC29
- **Requirements:** FR-AUTH-006, FR-AUTH-012, FR-AUD-001
- **SRS acceptance tests:** None
- **Business rules:** None
- **Design:** design.md §13; **Architecture:** ARCHITECTURE.md §18 epic 1
- **Decision:** SRS §17 DEC-B03

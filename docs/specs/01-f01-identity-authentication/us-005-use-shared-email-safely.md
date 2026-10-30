# SPEC-US-005 · Use shared email safely

| | |
|---|---|
| **Spec ID** | SPEC-US-005 |
| **User story** | US-005 |
| **Feature** | [F01 · Identity and authentication](README.md) |
| **Epic** | EPIC 1 — Identity and Authentication ([user-stories.md](../../user-stories.md)) |
| **Status** | draft |
| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |
| **Split from** | `docs/specs/F01-identity-authentication.md` on 2026-10-30 |

## User story

**US-005 — Use shared email safely**

As an Admin, I want Student and Parent accounts to be allowed to share an email while retaining separate User IDs.

Spec wording (from F01):

- **US-005:** As an Admin, I want Student and Parent accounts to share an email while keeping separate User IDs, so that a family with one email can still have two accounts.

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

- **Functional:** FR-SEC-010, FR-AUTH-007, FR-AUTH-009
- **Non-functional:** Not applicable
- **SRS acceptance tests cited:** None

Feature requirement set (from F01; additions of 2026-10-30 at the end): FR-AUTH-001…011, FR-SEC-010, NFR-SEC-003, FR-AUTH-012…016

## Acceptance criteria

### Story acceptance criteria

Verbatim from [user-stories.md](../../user-stories.md).

1. A Student account and a Parent account can be saved with the same email address; the shared email is not rejected as a duplicate.
2. Each account has its own unique User ID and password, and sign-in uses the User ID only.
3. Password recovery is requested by User ID and sends the OTP to that account's registered email, so recovering one account never resets the other.

### Detailed acceptance criteria

From the F01 feature spec. The original IDs are kept because tests cite them. Criteria marked *Revised* or *Added* come from the decision review of 2026-10-30 (SRS §17).

- **F01-AC18** — **(US-005) Given** a Student account with email `x@example.com`, **when** the Admin creates a Parent account with the same email, **then** the Parent account is saved.
- **F01-AC19** — **(US-005) Given** a Student and a Parent who share an email, **when** the Parent resets their password using the Parent User ID, **then** the Student's password and sessions are unchanged.

## Business rules

No SRS §9 business rule is specific to this story. The rules it follows are stated in the criteria above.

## Validation rules

No validation rule beyond the criteria above.

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
- **Other stories in F01:** [US-001](us-001-sign-in-with-user-id.md), [US-002](us-002-recover-password-by-email-otp.md), [US-003](us-003-admin-creates-accounts.md), [US-004](us-004-admin-sets-initial-passwords.md), [US-006](us-006-separate-accounts-per-madrasa.md), [US-071](us-071-manage-my-profile.md), [US-072](us-072-use-two-factor-sign-in-as-owner-or-admin.md)

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

**Completion gate:** this spec is complete only when `npm run e2e:gate -- US-005` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](../../../e2e/README.md)).

**API (Playwright):**

- [e2e/api/f01-identity.spec.ts](../../../e2e/api/f01-identity.spec.ts) — F01-AC18 (US-005) a Parent may share a Student email
- [e2e/api/f01-identity.spec.ts](../../../e2e/api/f01-identity.spec.ts) — F01-AC19 (US-005) resetting the Parent never touches the Student sharing its email

**Mobile (Maestro):**

- [e2e/mobile/f01-identity/admin-creates-accounts.yaml](../../../e2e/mobile/f01-identity/admin-creates-accounts.yaml) — F01 accounts — Admin creates Teacher, Student, Parent with shared email

**Unit (Vitest):**

- None

## Open decisions and blockers

None specific to this story. See the [feature open questions](README.md#open-questions).

## Traceability

- **Story:** US-005 → SPEC-US-005 (this file)
- **Detailed criteria:** F01-AC18, F01-AC19
- **Requirements:** FR-SEC-010, FR-AUTH-007, FR-AUTH-009
- **SRS acceptance tests:** None
- **Business rules:** None
- **Design:** design.md §13; **Architecture:** ARCHITECTURE.md §18 epic 1
- **Previous location:** `docs/specs/F01-identity-authentication.md`

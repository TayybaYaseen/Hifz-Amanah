# SPEC-US-072 · Use two-factor sign-in as Owner or Admin

| | |
|---|---|
| **Spec ID** | SPEC-US-072 |
| **User story** | US-072 |
| **Feature** | [F01 · Identity and authentication](README.md) |
| **Epic** | EPIC 1 — Identity and Authentication ([user-stories.md](../../user-stories.md)) |
| **Status** | draft |
| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |
| **Origin** | Added by the decision review of 2026-10-30 (SRS §17) |

## User story

**US-072 — Use two-factor sign-in as Owner or Admin**

As an Owner or Admin, I want my sign-in protected by an authenticator app and recovery codes so that the accounts with the widest access cannot be taken over with a password alone.

Spec wording (from F01):

- **US-072:** As an Owner or Admin, I want my sign-in protected by an authenticator app and recovery codes, so that the accounts with the widest access cannot be taken over with a password alone. *(Added 2026-10-30, DEC-B07.)*

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

- **Functional:** FR-AUTH-016, FR-AUTH-003, FR-AUD-001
- **Non-functional:** NFR-SEC-003
- **SRS acceptance tests cited:** None

Feature requirement set (from F01; additions of 2026-10-30 at the end): FR-AUTH-001…011, FR-SEC-010, NFR-SEC-003, FR-AUTH-012…016

## Acceptance criteria

### Story acceptance criteria

Verbatim from [user-stories.md](../../user-stories.md).

1. An Owner or Admin must set up an authenticator app and receives 10 one-time recovery codes before reaching madrasa data; every later sign-in requires a valid code or an unused recovery code.
2. Regenerating recovery codes requires a recent sign-in and an authenticator code, invalidates all earlier codes, and is audited.
3. After a lost device, the Owner resets an Admin's two-factor setup and the platform operator resets an Owner's; each reset is audited and revokes sessions.

### Detailed acceptance criteria

From the F01 feature spec. The original IDs are kept because tests cite them. Criteria marked *Revised* or *Added* come from the decision review of 2026-10-30 (SRS §17).

- **F01-AC30** — **(US-072) Given** an Owner or Admin signing in for the first time, **when** the password is accepted, **then** they must set up an authenticator app and are shown 10 one-time recovery codes before any madrasa data is shown. *(Added 2026-10-30, DEC-B07.)*
- **F01-AC31** — **(US-072) Given** an Owner or Admin with two-factor sign-in, **when** they sign in, **then** a valid authenticator code or an unused recovery code is required. A used recovery code is rejected the second time. *(Added 2026-10-30, DEC-B07.)*
- **F01-AC32** — **(US-072) Given** an Owner or Admin who regenerates recovery codes, **when** they have signed in recently and enter an authenticator code, **then** 10 new codes are issued, every earlier code stops working, and the action is audited. Without a recent sign-in and a code, regeneration is refused. *(Added 2026-10-30, DEC-B07.)*
- **F01-AC33** — **(US-072) Given** an Admin who lost their device, **when** the Owner resets that Admin's two-factor setup, **then** the Admin's sessions are revoked, the Admin must set up two-factor sign-in again at next sign-in, and the reset is audited. An Admin cannot reset another Admin's or the Owner's two-factor setup. *(Added 2026-10-30, DEC-B07.)*
- **F01-AC34** — **(US-072) Given** a Teacher, Student, or Parent, **when** they sign in, **then** no two-factor step is required. *(Added 2026-10-30, DEC-B07.)*

## Business rules

No SRS §9 business rule is specific to this story. The rules it follows are stated in the criteria above.

## Validation rules

Stated in these criteria: F01-AC31, F01-AC32, F01-AC33, F01-AC34.

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
- **Other stories in F01:** [US-001](us-001-sign-in-with-user-id.md), [US-002](us-002-recover-password-by-email-otp.md), [US-003](us-003-admin-creates-accounts.md), [US-004](us-004-admin-sets-initial-passwords.md), [US-005](us-005-use-shared-email-safely.md), [US-006](us-006-separate-accounts-per-madrasa.md), [US-071](us-071-manage-my-profile.md)

## Related screens and UI

- **Feature flow** (from F01): Sign-in and forgot password ([design.md §4.2](../../design.md)); Admin account management (design gap)

[design.md §13](../../design.md) story-to-screen map (verbatim):

| Story | Screen (this document) | Key interaction | Required states beyond standard | Validation shown | Accessibility / localization specifics |
|---|---|---|---|---|---|
| US-072 | §4.2 Two-factor step; §4.16 Security | First sign-in: set up authenticator, save 10 recovery codes; later sign-ins: enter code or recovery code; regenerate codes | Offline (sign-in needs network); Too many attempts | Invalid or used code | Codes readable at large font size; copy action labelled |

## Related API and data model

- **Modules** ([ARCHITECTURE.md §18](../../ARCHITECTURE.md)): `identity`
- Tables and services are described in the feature context above and in [ARCHITECTURE.md](../../ARCHITECTURE.md). Concrete API routes are defined at scaffolding (SRS §17 DEC-B54).

## Offline and sync behavior

Stated in these criteria: F01-AC33.

## Related E2E test scenarios

**Completion gate:** this spec is complete only when `npm run e2e:gate -- US-072` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](../../../e2e/README.md)).

**API (Playwright):**

- [e2e/api/f01-identity.spec.ts](../../../e2e/api/f01-identity.spec.ts) — F01-AC31 (US-072) Owner/Admin sign-in needs an authenticator code or an unused recovery code
- [e2e/api/f01-identity.spec.ts](../../../e2e/api/f01-identity.spec.ts) — F01-AC32 (US-072) regenerating recovery codes needs recent sign-in and a code, and voids old codes
- [e2e/api/f01-identity.spec.ts](../../../e2e/api/f01-identity.spec.ts) — F01-AC33 (US-072) only the Owner resets an Admin’s two-factor setup
- [e2e/api/f01-identity.spec.ts](../../../e2e/api/f01-identity.spec.ts) — F01-AC34 (US-072) Teacher, Student, and Parent sign-in has no two-factor step

**Mobile (Maestro):**

- [e2e/mobile/f01-identity/profile-and-two-factor.yaml](../../../e2e/mobile/f01-identity/profile-and-two-factor.yaml) — F01 profile, User ID rules, Admin reset, and Owner/Admin two-factor sign-in

**Unit (Vitest):**

- None

## Open decisions and blockers

None. The story was added by the decision review of 2026-10-30, and its behavior is fully decided (SRS §17).

## Traceability

- **Story:** US-072 → SPEC-US-072 (this file)
- **Detailed criteria:** F01-AC30, F01-AC31, F01-AC32, F01-AC33, F01-AC34
- **Requirements:** FR-AUTH-016, FR-AUTH-003, NFR-SEC-003, FR-AUD-001
- **SRS acceptance tests:** None
- **Business rules:** None
- **Design:** design.md §13; **Architecture:** ARCHITECTURE.md §18 epic 1
- **Decision:** SRS §17 DEC-B07

# F01 · Identity and authentication

**Status:** draft
**Brief:** [00-product-brief.md](../../00-product-brief.md) · **Flow:** Sign-in and forgot password ([design.md §4.2](../../design.md)); Admin account management (design gap)
**Requirements:** FR-AUTH-001…011, FR-SEC-010, NFR-SEC-003, FR-AUTH-012…016
**Stories:** US-001 – US-006, US-071, US-072 · **Depends on:** —
**Build order:** 1 of 17 (dependency level 0)

This folder has one spec per user story. This page keeps what applies to the whole feature: context, scope, edge cases, open questions, the feature test plan, and its definition of done. Story specs repeat the edge cases and open questions that apply to them.

## Story specs

| Spec | Story | Detailed criteria |
|---|---|---|
| [SPEC-US-001](us-001-sign-in-with-user-id.md) | US-001 — Sign in with User ID | F01-AC1, F01-AC2, F01-AC3, F01-AC4, F01-AC5, F01-AC6, F01-AC25 |
| [SPEC-US-002](us-002-recover-password-by-email-otp.md) | US-002 — Recover password by email OTP | F01-AC7, F01-AC8, F01-AC9, F01-AC10, F01-AC11, F01-AC26 |
| [SPEC-US-003](us-003-admin-creates-accounts.md) | US-003 — Admin creates accounts | F01-AC12, F01-AC13, F01-AC14, F01-AC24 |
| [SPEC-US-004](us-004-admin-sets-initial-passwords.md) | US-004 — Admin sets initial passwords | F01-AC15, F01-AC16, F01-AC17, F01-AC23 |
| [SPEC-US-005](us-005-use-shared-email-safely.md) | US-005 — Use shared email safely | F01-AC18, F01-AC19 |
| [SPEC-US-006](us-006-separate-accounts-per-madrasa.md) | US-006 — Separate accounts per madrasa | F01-AC20, F01-AC21, F01-AC22 |
| [SPEC-US-071](us-071-manage-my-profile.md) | US-071 — Manage my profile | F01-AC27, F01-AC28, F01-AC29 |
| [SPEC-US-072](us-072-use-two-factor-sign-in-as-owner-or-admin.md) | US-072 — Use two-factor sign-in as Owner or Admin | F01-AC30, F01-AC31, F01-AC32, F01-AC33, F01-AC34 |

## Context

Every user signs in with a User ID that their madrasa gives them, never with an email. A Student and a Parent may share one email, and a person who belongs to several madaris has a separate account in each, so email cannot identify an account. The Madrasa Admin creates every Teacher, Student, and Parent account and sets its first password.

There is no code yet. This feature creates the `identity` module ([ARCHITECTURE.md §5, §7.1](../../ARCHITECTURE.md)), which consists of:
- the `users`, `sessions`, and `password_reset_otps` tables
- Argon2id password hashing
- a short-lived access token plus a rotating refresh token

Everything else depends on this feature, so build it first.

## Out of scope

- Signing in with email or phone number.
- Self sign-up for Teacher, Student, or Parent.
- Email verification to activate an account (FR-AUTH-008).
- Forcing a password change on first sign-in.
- Two-factor sign-in for Teacher, Student, and Parent accounts. Owner/Admin two-factor sign-in is in scope (US-072, FR-AUTH-016).
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

## Open questions (resolved 2026-10-30)

- [x] Which authentication provider/library and email-sending service to use (SRS §13 #1)? **Resolved:** Built into the API; OTP email through Amazon SES (DEC-B05, B06).
- [x] Password policy: minimum length and any character rules. **Resolved:** 8–64 characters, no composition rules, common passwords and the User ID rejected (DEC-B08, FR-AUTH-012).
- [x] User ID format and whether it is case-sensitive. ARCHITECTURE ADR-011 proposes globally unique IDs with a madrasa prefix. **Resolved:** Global, case-insensitive, 3–32 letters/digits/hyphens, madrasa prefix suggested (DEC-B09, FR-AUTH-013).
- [x] The failed-attempt limit and cooling period, plus OTP length, expiry, and attempt limit. The proposed values are a 6-digit OTP, a 10-minute expiry, and 5 attempts. **Resolved:** 6-digit OTP, 10 minutes, 5 tries, 3 requests/hour; 10 failures in 15 minutes lock for 15 minutes (DEC-B10, FR-AUTH-014).
- [x] Can an Admin reset a user's password directly, for a user with no email? **Resolved:** Yes, audited; only the Owner resets an Admin (DEC-B11, FR-AUTH-015).
- [x] Is 2FA part of MVP (SRS §13 #1)? **Resolved:** Yes for Owner and Admin: authenticator app + 10 recovery codes (DEC-B07, FR-AUTH-016, US-072).

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

**Traceability:** Each test name starts with its criterion, e.g. `F01-AC03 (US-001) …`. Every AC 1–34 has at least one test.

**Coverage:** ≥80% on new code.

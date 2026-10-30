// F01 · Identity and authentication — API E2E (docs/specs/01-f01-identity-authentication/)
// Server-enforced behaviour. Screen journeys: e2e/mobile/f01-identity/.
import { test } from './support/fixtures';

test.describe('F01 · Identity and authentication', { tag: '@F01' }, () => {
  test.fixme('F01-AC2 (US-001) an email in the User ID field fails exactly like a wrong password', async () => {
    // Sign in with User ID = teacher.a1's registered email and the correct password.
    // Sign in with User ID = teacher.a1 and a wrong password.
    // Expect identical status code and body; no session is issued.
  });

  test.fixme('F01-AC3 (US-001) wrong password and unknown User ID return the same message', async () => {
    // Sign in as teacher.a1 with a wrong password; sign in as "no.such.user".
    // Expect identical status code and body ("User ID or password is incorrect").
  });

  test.fixme('F01-AC4 (US-001) lockout looks the same for existing and unknown User IDs', async () => {
    // Fail sign-in for teacher.a1 up to the attempt limit, then once more.
    // Do the same for "no.such.user".
    // Expect identical refusals; teacher.a1 with the right password is still refused during the cooling period.
    // control.advanceClock(cooling period) → teacher.a1 can sign in.
  });

  test.fixme('F01-AC5 (US-001) sign-out revokes the refresh token and the session', async () => {
    // Sign in as teacher.a1; keep access and refresh tokens; sign out.
    // A request with the old access token is rejected; refreshing with the old refresh token is rejected.
  });

  test.fixme('F01-AC7 (US-002) reset OTP is emailed only to the account email', async () => {
    // Request a reset for student.s1 by User ID.
    // control: exactly one email to family1@example.test; parent.p1 (same email) gets no OTP of its own.
  });

  test.fixme('F01-AC8 (US-002) unknown User ID or no email gives the same neutral response and sends nothing', async () => {
    // Request resets for "no.such.user" and student.s3 (no email); compare with teacher.a1's response.
    // Expect identical responses; control.sentEmails() is 0 for both.
  });

  test.fixme('F01-AC9 (US-002) expired or over-tried OTP is rejected and the password is unchanged', async () => {
    // Request an OTP; control.advanceClock(past expiry); submit it → rejected.
    // Request another; submit wrong codes up to the limit, then the right one → rejected.
    // The old password still signs in.
  });

  test.fixme('F01-AC10 (US-002) a valid OTP reset changes the password, revokes sessions, and audits safely', async () => {
    // Sign in teacher.a1 on two contexts; reset by OTP to a new valid password.
    // Both old sessions are rejected; the new password signs in.
    // control.auditFor(teacher.a1) has a reset event with no OTP, password, or token text.
  });

  test.fixme('F01-AC11 (US-002) OTP requests over the limit send nothing until the window passes', async () => {
    // Request OTPs for teacher.a1 past the limit; the extra request sends no email.
    // control.advanceClock(window) → a new request sends one email.
  });

  test.fixme('F01-AC12 (US-003) Admin creates Teacher, Student, and Parent accounts with audit events', async () => {
    // As admin.a create one account of each role.
    // Each can sign in and its membership shows Madrasa A and the right role; each creation is audited.
  });

  test.fixme('F01-AC13 (US-003) non-admins cannot create accounts', async () => {
    // As teacher.a1, student.s1, and parent.p1 call create-account → forbidden; no account exists afterwards.
  });

  test.fixme('F01-AC14 (US-003) a duplicate User ID is rejected', async () => {
    // As admin.a create an account with User ID teacher.a1 → rejected with "User ID already in use".
  });

  test.fixme('F01-AC15 (US-004) the initial password is never stored or logged in plain text', async () => {
    // Create an account with a known unique password string.
    // Search the database dump, application logs, and audit records for that string → not found.
  });

  test.fixme('F01-AC16 (US-004) an initial password that breaks the policy is rejected', async () => {
    // Password policy FR-AUTH-012 (8–64 characters, common passwords and the User ID blocked). Create an account with a 7-character password → field error; no account.
  });

  test.fixme('F01-AC18 (US-005) a Parent may share a Student email', async () => {
    // As admin.a create a Parent with student.s1's email → saved.
  });

  test.fixme('F01-AC19 (US-005) resetting the Parent never touches the Student sharing its email', async () => {
    // Sign in student.s1; reset parent.p1 by OTP.
    // student.s1's password still works and its session is still valid.
  });

  test.fixme('F01-AC20 (US-006) a Madrasa B ID requested from Madrasa A returns not found', async () => {
    // As teacher.a2 request SB1 by ID and a random non-existent ID.
    // Both return the same not-found status and body.
  });

  test.fixme('F01-AC21 (US-006) deactivating the Madrasa A account leaves the Madrasa B account working', async () => {
    // As admin.a deactivate teacher.a2; teacher.b1 (same person) signs in to Madrasa B normally.
  });

  test.fixme('F01-AC22 (US-006) a deactivated account cannot sign in and loses its sessions', async () => {
    // Sign in teacher.a2; admin.a deactivates it.
    // The existing session is rejected; a new sign-in is refused.
  });

  // Added by the decision review of 2026-10-30 (SRS §17).
  test.fixme('F01-AC23 (US-004) the password policy is 8–64 characters with a common-password and User ID blocklist', async () => {
    // Given a password of 7 characters, a very common password, or one equal to the User ID, when an Admin or the user sets it, then it is rejected with a field error. A password of 8–64 characters is accepted with any characters, without composition rules.
  });

  test.fixme('F01-AC24 (US-003) User IDs are global, case-insensitive, 3–32 letters, digits, and hyphens', async () => {
    // Given an Admin creating an account, when the User ID field opens, then it suggests the madrasa-code prefix. An ID that differs from an existing one only in letter case is rejected as "User ID already in use", and an ID outside 3–32 letters, digits, and hyphens is rejected.
  });

  test.fixme('F01-AC25 (US-001) 10 failures in 15 minutes lock the account for 15 minutes', async () => {
    // Given 10 failed sign-ins for one User ID within 15 minutes, when another attempt is made with the right password, then it is refused for 15 minutes with the same message as for an unknown User ID, and the lock is audited and visible to the Admin.
  });

  test.fixme('F01-AC26 (US-002) an Admin can reset a user password directly; only the Owner resets an Admin', async () => {
    // Given an Owner or Admin, when they set a new password for a Teacher, Student, or Parent account, then the password changes, that user's sessions are revoked, and the action is audited. An Admin cannot reset another Admin's or the Owner's password; the Owner can reset an Admin's.
  });

  test.fixme('F01-AC28 (US-071) changing your own password needs the current password and revokes other sessions', async () => {
    // Given a signed-in user changing their password, when they enter the correct current password and a new password that meets the policy, then the password changes, their other sessions are revoked, and the change is audited. A wrong current password is rejected and nothing changes.
  });

  test.fixme('F01-AC29 (US-071) User ID, role, madrasa, and other users’ profiles cannot be changed from My profile', async () => {
    // Given a user, when they send a profile update that changes their User ID, role, madrasa, or another user's profile, then it is rejected and nothing changes.
  });

  test.fixme('F01-AC31 (US-072) Owner/Admin sign-in needs an authenticator code or an unused recovery code', async () => {
    // Given an Owner or Admin with two-factor sign-in, when they sign in, then a valid authenticator code or an unused recovery code is required. A used recovery code is rejected the second time.
  });

  test.fixme('F01-AC32 (US-072) regenerating recovery codes needs recent sign-in and a code, and voids old codes', async () => {
    // Given an Owner or Admin who regenerates recovery codes, when they have signed in recently and enter an authenticator code, then 10 new codes are issued, every earlier code stops working, and the action is audited. Without a recent sign-in and a code, regeneration is refused.
  });

  test.fixme('F01-AC33 (US-072) only the Owner resets an Admin’s two-factor setup', async () => {
    // Given an Admin who lost their device, when the Owner resets that Admin's two-factor setup, then the Admin's sessions are revoked, the Admin must set up two-factor sign-in again at next sign-in, and the reset is audited. An Admin cannot reset another Admin's or the Owner's two-factor setup.
  });

  test.fixme('F01-AC34 (US-072) Teacher, Student, and Parent sign-in has no two-factor step', async () => {
    // Given a Teacher, Student, or Parent, when they sign in, then no two-factor step is required.
  });
});

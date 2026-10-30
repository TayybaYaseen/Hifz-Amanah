// F10 · Student and Parent access — API E2E (docs/specs/F10-student-parent-access.md)
// Screen journeys: e2e/mobile/f10-portal/.
import { test } from './support/fixtures';

test.describe('F10 · Student and Parent access', { tag: '@F10' }, () => {
  test.fixme('F10-AC1 (US-044) a Student lists only their own published reports and cannot write', async () => {
    // As student.s1 list reports → S1 published periods only; any write endpoint → forbidden.
  });

  test.fixme('F10-AC2 (US-044) another student report by ID returns not found', async () => {
    // As student.s1 request an S2 report ID and a random ID → identical not found.
  });

  test.fixme('F10-AC3 (US-044) unpublished periods are absent from every response', async () => {
    // Leave a period unpublished; as student.s1 list and fetch it by ID → not listed, not found; no data in any body.
  });

  test.fixme('F10-AC5 (US-045) a Parent with two verified links can access exactly those children', async () => {
    // As parent.p1 list children → S1, S2 only.
  });

  test.fixme('F10-AC6 (US-045) a Parent has no student search and gets not found for other students', async () => {
    // As parent.p1 call any search endpoint → not found/forbidden; request S3 by ID → not found.
  });

  test.fixme('F10-AC7 (US-045) a revoked link refuses that child and removes it from the list', async () => {
    // admin.a revokes parent.p1 → S2; S2 requests refused; children list → S1 only.
  });

  test.fixme('F10-AC8 (US-045) linking, verifying, and revoking a Parent are audited', async () => {
    // Perform each action as admin.a; three audit records.
  });

  test.fixme('F10-AC9 (US-046) a note saved without visibility is private to staff', async () => {
    // As teacher.a1 save a note with no visibility field → stored PRIVATE_TO_STAFF.
  });

  test.fixme('F10-AC10 (US-046) private note text never reaches Student or Parent channels (AC-SEC-04)', async () => {
    // Write a private note with a unique marker. As student.s1 and parent.p1 fetch: report API, PDF, Excel export,
    // and control.pushesFor(). The marker appears in none of them.
  });

  test.fixme('F10-AC11 (US-046) a shared note is visible to the Student and linked Parent', async () => {
    // Note visible to student/guardian → present in student.s1 and parent.p1 report responses.
  });

  test.fixme('F10-AC12 (US-046) changing note visibility is audited', async () => {
    // Change visibility; one audit record with before/after visibility and no note text.
  });
});

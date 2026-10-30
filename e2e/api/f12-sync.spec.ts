// F12 · Offline and synchronization — API E2E (docs/specs/04-f12-offline-sync/)
// Sync protocol checks against the server. Device journeys: e2e/mobile/f12-sync/.
import { test } from './support/fixtures';

test.describe('F12 · Offline and synchronization', { tag: '@F12' }, () => {
  test.fixme('F12-AC3 (US-051) the server keeps the client-generated UUID', async () => {
    // Push a create operation with client UUIDv7 X; the stored record ID is X; later pulls return X.
  });

  test.fixme('F12-AC4 (US-052) a record must exist before its dependent portions and attempts', async () => {
    // Push an attempt whose record has not been pushed → refused as out of order, not applied.
    // Push record, portion, attempt in order → all applied.
  });

  test.fixme('F12-AC5 (US-052) replaying an applied op_id returns the stored result and creates nothing', async () => {
    // Push the same operation twice for a record, an attempt, attendance, and a homework portion;
    // second responses equal the first; counts are unchanged.
  });

  test.fixme('F12-AC7 (US-052) a pull returns only changes since the cursor, within scope', async () => {
    // teacher.a2 changes S3 and teacher.a1 changes S1 after cursor C.
    // teacher.a1 pull(C) returns the S1 change only.
  });

  test.fixme('F12-AC11 (US-054) concurrent edits from one base version create a conflict', async () => {
    // Two operations change the same portion status from base version v1; the second returns conflict;
    // the server keeps both versions; the record is action required; neither overwrote the other.
  });

  test.fixme('F12-AC12 (US-054) the author or an Admin resolves a conflict as an audited change', async () => {
    // As teacher.a1 resolve by choosing one version; the record has it; the conflict is closed; audit present.
  });

  test.fixme('F12-AC13 (US-054) a non-meaningful field merges without a conflict', async () => {
    // Two operations change display order from the same base version → no conflict; documented merge applied.
  });

  test.fixme('F12-AC14 (US-052) a revoked Teacher gets "access revoked" on sync', async () => {
    // admin.a removes teacher.a1 membership; teacher.a1 push and pull → access revoked code.
  });

  test.fixme('F12-AC15 (US-052) an unsupported protocol version gets "upgrade required"', async () => {
    // Push with a protocol version below the minimum → upgrade required; nothing applied.
  });

  // Added by the decision review of 2026-10-30 (SRS §17).
  test.fixme('F12-AC17 (US-054) only the conflict author or an Admin can resolve a conflict', async () => {
    // Given a conflict caused by Teacher A, when Teacher B, who is also assigned to the student, tries to resolve it, then it is refused.
  });
});

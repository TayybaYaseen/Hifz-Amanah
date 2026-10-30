// F03 · Classes and students — API E2E (docs/specs/F03-classes-students.md)
// Screen journeys: e2e/mobile/f03-roster/.
import { test } from './support/fixtures';

test.describe('F03 · Classes and students', { tag: '@F03' }, () => {
  test.fixme('F03-AC1 (US-010) a new class with teachers is visible to each assigned Teacher', async () => {
    // As admin.a create class "Hifz A3" with teacher.a1 and teacher.a2; both list it.
  });

  test.fixme('F03-AC2 (US-010) an empty class name is rejected', async () => {
    // As admin.a create a class with name "" → field error; no class created.
  });

  test.fixme('F03-AC3 (US-010) a Teacher cannot create, edit, or deactivate a class', async () => {
    // As teacher.a1 call each endpoint → forbidden; nothing changes.
  });

  test.fixme('F03-AC4 (US-010) a deactivated class leaves pickers but keeps its history', async () => {
    // Seed records in A2; admin.a deactivates A2.
    // Entry pickers exclude A2; past A2 reports still return the records.
  });

  test.fixme('F03-AC6 (US-011) a new student is saved in the active madrasa and audited', async () => {
    // As admin.a create a student with External Student ID and admission date; it is in Madrasa A; audit exists.
  });

  test.fixme('F03-AC7 (US-011) a duplicate External Student ID in the same madrasa is rejected', async () => {
    // As admin.a create a student with EXT-A-001 → field error.
    // As admin.b create a student with EXT-A-001 in Madrasa B → allowed.
  });

  test.fixme('F03-AC8 (US-011) search and filters page through matching students only', async () => {
    // Seed more than one page of students; search by name, by External Student ID, filter by class and status.
    // Each page contains only matches; paging returns every match exactly once.
  });

  test.fixme('F03-AC9 (US-011) deactivating a student deletes nothing', async () => {
    // Deactivate S2 (with records, attempts, homework); all are still returned for earlier periods.
  });

  test.fixme('F03-AC10 (US-011) reactivating a student restores them to pickers with history intact', async () => {
    // Reactivate S2; pickers include S2; history counts match those before deactivation.
  });

  test.fixme('F03-AC11 (US-012) moving a student ends the old enrollment the day before', async () => {
    // Move S2 from A1 to A2 from date D; enrollments: A1 ends D−1, A2 starts D.
  });

  test.fixme('F03-AC12 (US-012) records before a move still show the old class', async () => {
    // A report for a period before D shows S2 in A1.
  });
});

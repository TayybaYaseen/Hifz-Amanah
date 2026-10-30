// F04 · Calendar and attendance — API E2E (docs/specs/F04-calendar-attendance.md)
// Screen journeys: e2e/mobile/f04-attendance/.
import { test } from './support/fixtures';

test.describe('F04 · Calendar and attendance', { tag: '@F04' }, () => {
  test.fixme('F04-AC1 (US-013) a Monday–Saturday class has Sunday as a no-class day', async () => {
    // Weekly report for A1 lists Mon–Sat as scheduled and Sunday as no-class.
  });

  test.fixme('F04-AC2 (US-013) a schedule change applies from its effective date only', async () => {
    // Change A1 to Mon–Thu from Wednesday; that week: Mon–Tue use the old schedule, Wed onward the new one.
  });

  test.fixme('F04-AC3 (US-014) a madrasa holiday is shown as a holiday with no absences', async () => {
    // admin.a declares a holiday; the report shows it as holiday; no student absent that day.
  });

  test.fixme('F04-AC4 (US-014) a no-class exception affects only that class', async () => {
    // No-class exception for A1 on date D; A1 students show "no class"; A2 students do not.
  });

  test.fixme('F04-AC7 (US-015) Mark all Present keeps existing marks', async () => {
    // Mark S2 Absent; then save a bulk "all Present" for A1 on the same date; S2 stays Absent.
  });

  test.fixme('F04-AC8 (US-015) an unmarked student is not counted absent', async () => {
    // Bulk-save A1 with S1 Present and S2 omitted; report shows S2 as not marked, absences 0.
  });

  test.fixme('F04-AC9 (US-015) one invalid row does not block the valid rows', async () => {
    // Bulk-save with one row for a student outside A1; the valid rows save; the invalid row has an error;
    // the response counts saved, needs-correction, and not-marked rows.
  });

  test.fixme('F04-AC10 (US-015) retrying a sent bulk save creates no duplicates', async () => {
    // Send the same bulk operation (same op_id) twice; one attendance record per student exists.
  });

  test.fixme('F04-AC11 (US-015) an Absent mark creates no attempt, failure, or quality', async () => {
    // Bulk-save S1 Absent; S1 has no portion attempt, no failed recitation, and no quality for that date.
  });

  test.fixme('F04-AC13 (US-016) a Teacher can request an excuse on an Absent record', async () => {
    // As teacher.a1 request an excuse with a reason on S1's absence → status awaiting approval.
  });

  test.fixme('F04-AC14 (US-016) an excuse cannot be requested for a Present record', async () => {
    // As teacher.a1 request an excuse on S2's Present record → rejected.
  });

  test.fixme('F04-AC15 (US-017) Admin approval counts as excused and is audited', async () => {
    // As admin.a approve; report shows 1 excused absence; audit has admin.a and the time.
  });

  test.fixme('F04-AC16 (US-017) Admin rejection counts as a normal absence', async () => {
    // As admin.a reject another request; report shows a normal absence; the record status is rejected.
  });

  test.fixme('F04-AC17 (US-017) a Teacher cannot approve or reject an excuse', async () => {
    // As teacher.a1 call approve and reject → forbidden; status unchanged.
  });
});

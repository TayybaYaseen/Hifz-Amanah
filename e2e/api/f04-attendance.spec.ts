// F04 · Calendar and attendance — API E2E (docs/specs/08-f04-calendar-attendance/)
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

  test.fixme('F04-AC8 (US-015) unmarked students are confirmed in a dialog, never saved silently', async () => {
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

  test.fixme('F04-AC13 (US-016) a Teacher marks Leave with a reason and it awaits approval', async () => {
    // As teacher.a1 mark Leave with a reason for S1 → status LEAVE, awaiting approval.
  });

  test.fixme('F04-AC14 (US-016) Leave without a reason is rejected', async () => {
    // As teacher.a1 mark Leave for S2 with an empty reason → field error; nothing saved.
  });

  test.fixme('F04-AC15 (US-017) Admin approval counts as Leave and is audited', async () => {
    // As admin.a approve; report shows 1 Leave; audit has admin.a and the time.
  });

  test.fixme('F04-AC16 (US-017) Admin rejection of a Leave counts as a normal absence', async () => {
    // As admin.a reject another request; report shows a normal absence; the record status is rejected.
  });

  test.fixme('F04-AC17 (US-017) a Teacher cannot approve or reject a Leave', async () => {
    // As teacher.a1 call approve and reject → forbidden; status unchanged.
  });

  // Added by the decision review of 2026-10-30 (SRS §17).
  test.fixme('F04-AC18 (US-015) Absent can become Late and Present can become Half day, audited', async () => {
    // Given a student already saved as Absent, when the Teacher changes them to Late, or changes a Present student to Half day, then the record changes, the change is audited, and Hifz portions can be recorded for that student that day.
  });

  test.fixme('F04-AC19 (US-015) Absent for a student who recited needs a note; portions unchanged', async () => {
    // Given a student who already has recited portions saved for the date, when the Teacher marks them Absent in Bulk Entry, then the row suggests "Mark Late instead". If the Teacher keeps Absent, the row cannot save until an internal note with the reason is entered, and the recited portions are unchanged.
  });

  test.fixme('F04-AC20 (US-014) a holiday declared on a recorded date excludes its records and refuses new ones', async () => {
    // Given attendance or daily records already saved for a date, when the Admin declares a holiday on it, then the Admin is warned with the number of records and must confirm. After confirming, the date is not a working day, those records are excluded from reports and homework suggestions but kept in history, and new entries for that date are refused.
  });

  test.fixme('F04-AC22 (US-017) Leave marked by an Admin is approved at once', async () => {
    // Given an Owner or Admin, when they mark Leave with a reason, then it is approved at once with no approval step, and the action is audited.
  });

  test.fixme('F04-AC23 (US-016) Leave reasons and absence notes never reach Students or Parents', async () => {
    // Given a Leave or Absent note with a reason, when a Student or Parent view, API response, PDF, Excel export, or push is produced, then the reason text is not in it.
  });
});

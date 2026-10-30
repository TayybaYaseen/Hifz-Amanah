// F05 · Daily Hifz entry — API E2E (docs/specs/F05-daily-hifz-entry.md)
// Screen journeys: e2e/mobile/f05-daily-entry/.
import { test } from './support/fixtures';

test.describe('F05 · Daily Hifz entry', { tag: '@F05' }, () => {
  test.fixme('F05-AC1 (US-018) report_date is the date the Teacher chose, separate from save and sync times', async () => {
    // As teacher.a1 save a record for S1 with report_date = yesterday.
    // Stored report_date is yesterday; created_at and synced_at are today.
  });

  test.fixme('F05-AC2 (US-018) a record synced the next day keeps its report_date', async () => {
    // Submit a sync operation for report_date D with client save time D; control.advanceClock(1 day) before sending.
    // Stored report_date is D.
  });

  test.fixme('F05-AC4 (US-018) editing a portion audits, recalculates drafts and reports, and keeps confirmed homework', async () => {
    // Seed a Partial portion with a confirmed homework and a draft suggestion; edit the portion.
    // Audit has the edit; the draft is rebuilt; the weekly report total changes; the confirmed homework is unchanged;
    // the response carries the "Confirmed homework was not changed" notice.
  });

  test.fixme('F05-AC5 (US-018) an Absent day has no failed portion and no quality', async () => {
    // Save S1 Absent for date D; no portion is failed and no quality value exists for D.
  });

  test.fixme('F05-AC6 (US-019) SINGLE mode refuses a second record for the same student and date', async () => {
    // Create a record for S1 on D; create another → refused with a reference to the existing record.
  });

  test.fixme('F05-AC7 (US-019) MULTI_SESSION mode requires a label and allows distinct labels', async () => {
    // admin.a sets MULTI_SESSION. Record without session_label → rejected.
    // Records "Fajr" and "Asr" for S1 on D → both saved; a second "Fajr" → refused.
  });

  test.fixme('F05-AC8 (US-019) switching back to SINGLE is blocked while conflicts exist', async () => {
    // With two sessions for S1 on D, admin.a sets SINGLE → refused; the response lists S1 and D.
  });

  test.fixme('F05-AC9 (US-019) a Teacher cannot change the daily-report mode', async () => {
    // As teacher.a1 update the mode → forbidden.
  });

  test.fixme('F05-AC10 (US-020) a Sabaq portion stores every field', async () => {
    // Save Sabaq: Para 5, Surah/Ayat range, assigned Half, completed Half, COMPLETED, 1 mistake, quality 2, remarks.
    // Read it back: every field matches, quantities as (unit, numerator, denominator).
  });

  test.fixme('F05-AC11 (US-021) Sabqi portions keep independent statuses', async () => {
    // Sabqi Para 3 COMPLETED and Para 4 PARTIAL; update Para 4 only; Para 3 is unchanged.
  });

  test.fixme('F05-AC13 (US-022) three Manzil outcomes stay separate (AC-QTY-06)', async () => {
    // Manzil Para 1 COMPLETED, Para 5 PARTIAL 1/2, Para 10 NOT_REMEMBERED; record and report show three lines.
  });

  test.fixme('F05-AC14 (US-022) Not Remembered without completed defaults to 0 completed, full remaining', async () => {
    // Save NOT_REMEMBERED with assigned Half and no completed; stored completed 0/1 PARA, remaining 1/2 PARA.
    // Then save completed Rubu as a correction → accepted.
  });

  test.fixme('F05-AC15 (US-023) a second attempt keeps the first unchanged (AC-ATT-05)', async () => {
    // Add attempt 2 to a portion; attempt 1 fields, recorder, and time are unchanged; both are listed.
  });

  test.fixme('F05-AC16 (US-023) the latest attempt drives status and the assigned quantity counts once', async () => {
    // Attempt 1 PARTIAL, attempt 2 COMPLETED; report shows COMPLETED and assigned quantity once.
  });
});

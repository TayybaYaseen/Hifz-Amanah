// F09 · Weekly and monthly reports — API E2E (docs/specs/F09-weekly-monthly-reports.md)
// Screen journeys: e2e/mobile/f09-reports/.
import { test } from './support/fixtures';

test.describe('F09 · Weekly and monthly reports', { tag: '@F09' }, () => {
  test.fixme('F09-AC1 (US-039) the week is Monday 00:00 to Sunday 23:59 Asia/Karachi (AC-RPT-07)', async () => {
    // Seed records at Sunday 23:30 and Monday 00:10 Karachi time; each lands in the correct week; range is stated.
  });

  test.fixme('F09-AC2 (US-039) every total equals a direct calculation from source records (AC-RPT-01)', async () => {
    // Seed a known week; compare each report total with the expected values computed in the test.
  });

  test.fixme('F09-AC3 (US-039) a corrected record changes the next report view (AC-RPT-02)', async () => {
    // Read the report; correct one record; read again → totals reflect the correction.
  });

  test.fixme('F09-AC4 (US-039) quantities are grouped by unit (AC-RPT-04)', async () => {
    // LINES and PARA in the same week → separate totals.
  });

  test.fixme('F09-AC5 (US-039) a portion with two attempts counts once with the latest status (AC-RPT-05)', async () => {
    // Attempts PARTIAL then COMPLETED; assigned counted once; status COMPLETED.
  });

  test.fixme('F09-AC6 (US-039) confirmed homework and drafts are separate counts (AC-RPT-06)', async () => {
    // One confirmed, two drafts → confirmed 1, drafts 2.
  });

  test.fixme('F09-AC7 (US-039) scores 1, 3 and two missing → 2.0 · Good (2 ratings) (AC-RPT-03)', async () => {
    // Report quality average value 2.0, label Good, count 2.
  });

  test.fixme('F09-AC8 (US-040) the monthly report keeps sections separate with Para-wise progress', async () => {
    // Seed a month; Sabaq, Sabqi, Manzil aggregated separately; Para-wise progress and pending portions listed.
  });

  test.fixme('F09-AC9 (US-040) monthly homework has four separate measures', async () => {
    // Assigned, attempted, completed, carried-forward each match the seeded month.
  });

  test.fixme('F09-AC10 (US-040) a Para with recurring Major or repeated mistakes is listed', async () => {
    // Para 7 has Major/repeated mistakes on three attempts → listed with counts by category.
  });

  test.fixme('F09-AC11 (US-041) absent days do not appear as failed or zero performance', async () => {
    // 2 absent and 4 recited days → attendance 2 absences; performance lists 4 days only.
  });

  test.fixme('F09-AC12 (US-041) holidays and unscheduled Sundays are not absences (AC-RPT-08)', async () => {
    // Week with a holiday and a Sunday → listed as holiday and no-class; absences 0.
  });

  test.fixme('F09-AC13 (US-042) excused and normal absences are counted separately', async () => {
    // One approved excuse, one rejected, one plain absence → 1 excused, 2 normal.
  });

  test.fixme('F09-AC14 (US-043) three Manzil portions on one day are three lines', async () => {
    // Para 1 COMPLETED, Para 5 PARTIAL 1/2, Para 10 NOT_REMEMBERED → three daily-detail lines.
  });

  test.fixme('F09-AC15 (US-039) internal notes are absent from the payload for viewers without permission', async () => {
    // As student.s1 and parent.p1 fetch the report; the raw response body does not contain the private note text.
  });
});

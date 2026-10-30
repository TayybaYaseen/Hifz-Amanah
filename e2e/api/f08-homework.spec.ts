// F08 · Homework and carry forward — API E2E (docs/specs/11-f08-homework-carry-forward/)
// Screen journeys: e2e/mobile/f08-homework/.
import { test } from './support/fixtures';

test.describe('F08 · Homework and carry forward', { tag: '@F08' }, () => {
  test.fixme('F08-AC1 (US-033) each homework portion stores its own section, Para, range, quantity, and instructions', async () => {
    // Create homework: Sabaq Para 5 Half, Sabqi Para 3 Rubu, Sabqi Para 4 Complete; read back three portions.
  });

  test.fixme('F08-AC2 (US-033) an assignment stores dates, status, creator, and instructions', async () => {
    // Read the assignment: assigned date, due date, status, creator teacher.a1, general instructions.
  });

  test.fixme('F08-AC3 (US-034) 3/4 assigned and 1/2 completed suggest 1/4 Para', async () => {
    // Record PARTIAL Salasah/Half; the draft suggestion portion has PARA 1/4.
  });

  test.fixme('F08-AC4 (US-034) mismatched units give no remaining and a review flag', async () => {
    // Assigned PARA Half, completed 6 LINES; the suggestion has no remaining quantity and needs_review = true.
  });

  test.fixme('F08-AC5 (US-035) Partial and Not Remembered with remaining are suggested and linked (AC-HW-01, AC-HW-08)', async () => {
    // Each suggestion portion links to its source attempt ID and carries the remaining quantity.
  });

  test.fixme('F08-AC6 (US-035) Absent, Not Assigned, Pending, and Completed are not suggested (AC-HW-09)', async () => {
    // Record one portion of each; suggestions contain none of them.
  });

  test.fixme('F08-AC8 (US-036) draft edits are kept and each portion records its origin (AC-HW-02)', async () => {
    // Edit a quantity, remove one portion, add one, change due date; portions are SUGGESTED, EDITED, ADDED.
  });

  test.fixme('F08-AC9 (US-036) a rejected draft is not counted as homework', async () => {
    // Reject the draft; status REJECTED; homework counts in reports exclude it.
  });

  test.fixme('F08-AC10 (US-037) confirming stores the confirmer and time and is audited (AC-HW-04)', async () => {
    // Confirm as teacher.a1; status CONFIRMED, confirmed_by teacher.a1, confirmed_at set; audit present.
  });

  test.fixme('F08-AC11 (US-037) a draft is never confirmed automatically (AC-HW-03)', async () => {
    // control.advanceClock(past due date and next class); the draft is still DRAFT.
  });

  test.fixme('F08-AC12 (US-037) a confirmation that fails partway confirms nothing', async () => {
    // Confirm a draft with one invalid portion → error; draft unchanged; no partial confirmed assignment exists.
  });

  test.fixme('F08-AC13 (US-038) a new assignment keeps the earlier one unchanged (AC-HW-05)', async () => {
    // Confirm assignment 1; create and confirm assignment 2; assignment 1 is byte-identical.
  });

  test.fixme('F08-AC14 (US-038) correcting a source attempt rebuilds drafts only (AC-HW-06, AC-HW-07)', async () => {
    // Correct the source attempt; the draft quantity changes; confirmed homework unchanged; response has the notice.
  });

  test.fixme('F08-AC15 (US-038) an Admin’s revision creates a linked assignment and supersedes the old one', async () => {
    // Revise and confirm; new assignment links to the old; old status SUPERSEDED; both audited.
  });

  test.fixme('F08-AC16 (US-038) a next-class attempt links to its homework portion (FR-HW-015)', async () => {
    // Record an attempt on the due homework portion; the attempt references that homework portion ID.
  });

  // Added by the decision review of 2026-10-30 (SRS §17).
  test.fixme('F08-AC17 (US-038) a Teacher cannot revise confirmed homework', async () => {
    // Given a Teacher, when they try to revise confirmed homework, then there is no Revise control, and the API returns forbidden.
  });

  test.fixme('F08-AC18 (US-036) the due date defaults to the next scheduled class day', async () => {
    // Given a class scheduled Monday to Saturday, when homework is drafted on Saturday, then the due date defaults to Monday; if Monday is a holiday, it defaults to Tuesday.
  });

  test.fixme('F08-AC19 (US-038) homework missed through absence or a holiday carries over unchanged', async () => {
    // Given confirmed homework due on a day the student is Absent or on Leave, or that becomes a holiday, when the next class day comes, then the same homework is shown as outstanding and labelled "carried over — absent/holiday". It is not counted as failed, and the confirmed assignment is unchanged.
  });

  test.fixme('F08-AC21 (US-037) an offline confirmation against changed source data becomes a conflict', async () => {
    // Given an offline confirmation whose source records changed on the server after the draft was built, when it syncs, then the homework is not confirmed, and a sync conflict is created for review.
  });
});

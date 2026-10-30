// F07 · Mistakes and quality — API E2E (docs/specs/10-f07-mistakes-quality/)
// Screen journeys: e2e/mobile/f07-quality/.
import { test } from './support/fixtures';

test.describe('F07 · Mistakes and quality', { tag: '@F07' }, () => {
  test.fixme('F07-AC1 (US-028) two mistakes are stored on the attempt, one category each', async () => {
    // Add TAJWEED and LAFZI to an attempt; read back two mistakes; a mistake with two categories is rejected.
  });

  test.fixme('F07-AC2 (US-028) a mistake saved in Urdu is the same canonical value', async () => {
    // Save with Accept-Language ur; read with en → category TAJWEED, English label "Tajweed".
  });

  test.fixme('F07-AC3 (US-028) the weekly report counts mistakes per category', async () => {
    // Seed 2 TAJWEED and 1 LAFZI in a week; report shows those counts.
  });

  test.fixme('F07-AC4 (US-029) severity accepts only MINOR or MAJOR', async () => {
    // MAJOR → stored; "CRITICAL" → rejected.
  });

  test.fixme('F07-AC5 (US-030) Repeated is a separate flag that leaves severity unchanged', async () => {
    // Save MINOR with repeated = true; read MINOR and repeated true.
  });

  test.fixme('F07-AC7 (US-031) no quality is stored as NULL, never 0', async () => {
    // Save a portion without quality; stored value is null; report shows "Not recorded".
  });

  test.fixme('F07-AC8 (US-031) scores 1, 2, 2 and one missing average 1.7 · Good (3 ratings)', async () => {
    // Report average value 1.67 (displayed 1.7), label Good, count 3.
  });

  test.fixme('F07-AC9 (US-031) an average of exactly 1.5 is labelled Good', async () => {
    // Scores 1 and 2 → 1.5 · Good (2 ratings).
  });

  test.fixme('F07-AC10 (US-031) Absent, Not Assigned, and Pending attempts reject quality', async () => {
    // Save each status with quality 3 → rejected; without quality → saved and excluded from averages.
  });

  test.fixme('F07-AC11 (US-031) no automated process writes a quality score', async () => {
    // Run AI recommendations, sync, import without QualityRating, and homework recalculation;
    // every quality value is unchanged and none was created.
  });

  test.fixme('F07-AC12 (US-032) the overall label is stored once per record', async () => {
    // Save overall GOOD on the record; portions keep their own quality scores.
  });

  test.fixme('F07-AC13 (US-032) the overall label and quality scores are never derived from each other', async () => {
    // Save quality 1 on all portions and no overall label → label stays null.
    // Save overall NEEDS_IMPROVEMENT with no quality → portion quality stays null.
  });

  // Added by the decision review of 2026-10-30 (SRS §17).
  test.fixme('F07-AC14 (US-028) "No mistakes" stores 0; an empty list stays Not recorded', async () => {
    // Given a portion attempt, when the Teacher chooses "No mistakes", then a mistake count of 0 is stored. An attempt with no mistakes entered and no "No mistakes" choice is shown and counted as "Not recorded".
  });

  test.fixme('F07-AC15 (US-028) mistake notes are private by default', async () => {
    // Given a mistake with a note, when the Teacher leaves its visibility unchanged, then the note is private to staff and is absent from every Student and Parent output. When the Teacher marks it visible, it is shown to them.
  });
});

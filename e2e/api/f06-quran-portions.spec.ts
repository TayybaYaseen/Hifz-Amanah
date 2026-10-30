// F06 · Quran portions and metadata — API E2E (docs/specs/07-f06-quran-portions-metadata/)
// Screen journeys: e2e/mobile/f06-quran-portions/.
import { test } from './support/fixtures';

test.describe('F06 · Quran portions and metadata', { tag: '@F06' }, () => {
  test.fixme('F06-AC1 (US-024) Admin Surah and Para boundary edits are saved per madrasa and audited', async () => {
    // As admin.a add a Surah and edit a Para boundary; visible in Madrasa A, not in Madrasa B; both audited.
  });

  test.fixme('F06-AC2 (US-024) a Teacher cannot edit Quran metadata', async () => {
    // As teacher.a1 call the metadata write endpoints → forbidden.
  });

  test.fixme('F06-AC3 (US-024) an Arabic Surah name is returned byte-identical in every locale', async () => {
    // Save "الفاتحة"; read with Accept-Language en, ur, ur-Latn; each value equals the input byte for byte.
  });

  test.fixme('F06-AC4 (US-024) a Para boundary ending before it starts is rejected', async () => {
    // As admin.a save a boundary with end < start → field error.
  });

  test.fixme('F06-AC5 (US-025) Para 1–30 is accepted; 0 and 31 are rejected', async () => {
    // Save portions with Para 1, 30 → ok; 0, 31 → field errors.
  });

  test.fixme('F06-AC6 (US-025) an Ayat past the Surah end is rejected naming the maximum', async () => {
    // Surah with 7 Ayat; range 3–9 → error naming 7.
  });

  test.fixme('F06-AC7 (US-025) an end Ayat before the start Ayat is rejected', async () => {
    // Range 5–2 in one Surah → field error.
  });

  test.fixme('F06-AC8 (US-026) line quantities are whole LINES', async () => {
    // Save 10 LINES → stored unit LINES, 10/1; save 2.5 LINES → rejected.
  });

  test.fixme('F06-AC9 (US-026) 10 lines assigned and 6 completed leave 4 lines (AC-QTY-02)', async () => {
    // Read remaining for the portion → 4 LINES.
  });

  test.fixme('F06-AC10 (US-027) Salasah is stored as 3/4 Para (AC-QTY-01)', async () => {
    // Save SALASAH; stored PARA 3/4.
  });

  test.fixme('F06-AC11 (US-027) Rubu, Half, and Complete are stored exactly', async () => {
    // Stored as PARA 1/4, 1/2, 1/1.
  });

  test.fixme('F06-AC12 (US-027) 3/4 Para assigned and 1/2 completed leave 1/4 Para (AC-QTY-03)', async () => {
    // Read remaining → PARA 1/4.
  });

  test.fixme('F06-AC13 (US-027) LINES and PARA totals are never combined (AC-QTY-04)', async () => {
    // One day with a LINES portion and a PARA portion; totals are two entries, one per unit.
  });

  test.fixme('F06-AC14 (US-027) completed greater than assigned is rejected (AC-QTY-05)', async () => {
    // Assigned Half, completed Complete → field error on completed.
  });

  // Added by the decision review of 2026-10-30 (SRS §17).
  test.fixme('F06-AC16 (US-027) extra work is a separate Extra portion; completed never exceeds assigned', async () => {
    // Given 1/2 Para assigned and 3/4 Para recited, when the Teacher records completed 1/2 and adds an Extra portion of 1/4, then both portions are saved with completed ≤ assigned, and reports show the 1/4 as extra work. Entering completed 3/4 on the original portion is refused.
  });

  test.fixme('F06-AC17 (US-026) Lines, Ayat, and Pages are whole numbers only', async () => {
    // Given a Lines, Ayat, or Pages quantity, when 2.5 is entered, then it is rejected; whole numbers are accepted.
  });

  test.fixme('F06-AC18 (US-024) a new madrasa starts with the reviewed Quran metadata seed', async () => {
    // Given a newly created madrasa, when Quran metadata is opened, then it already contains 114 Surahs with their Ayat counts and 30 Para boundaries from the reviewed seed.
  });

  test.fixme('F06-AC19 (US-024) a metadata correction flags affected records and never changes them', async () => {
    // Given records that use a Para boundary, when the Admin corrects that boundary, then the records keep their stored ranges, any range that is no longer valid is listed for Admin review, and the edit is audited.
  });
});

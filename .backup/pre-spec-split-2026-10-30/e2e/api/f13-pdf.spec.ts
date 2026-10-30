// F13 · PDF and print — API E2E (docs/specs/F13-pdf-print.md)
// Generated PDFs are fetched and inspected (text extraction and page images).
// Screen journeys: e2e/mobile/f13-pdf/.
// OPEN: SRS §13 #4 — PDF font stack and page-break details; golden images are recorded once decided.
import { test } from './support/fixtures';

test.describe('F13 · PDF and print', { tag: '@F13' }, () => {
  test.fixme('F13-AC1 (US-055) the PDF has type, range, timezone, sections, quantities, statuses, and remarks', async () => {
    // Generate a weekly PDF for S1; extracted text contains each required element.
  });

  test.fixme('F13-AC2 (US-055) an Urdu PDF is right to left with shaped text', async () => {
    // Generate in ur; compare page images with the approved golden; text extraction yields joined Urdu words.
  });

  test.fixme('F13-AC3 (US-055) Arabic Surah names are identical and use the Quranic font', async () => {
    // Extracted Arabic equals the stored value; the PDF font list includes the Quranic font for that run.
  });

  test.fixme('F13-AC4 (US-055) quality scores appear as number + label in the report language', async () => {
    // en PDF contains "2 · Good"; ur PDF contains "۲ · اچھا"; ur-Latn PDF contains "2 · Achha".
  });

  test.fixme('F13-AC5 (US-055) headers repeat and rows never split across pages', async () => {
    // Generate a multi-page monthly PDF; each page starts with the table header; no row spans two pages.
  });

  test.fixme('F13-AC6 (US-056) Admin logo, colors, and headings apply to later PDFs', async () => {
    // admin.a sets a synthetic logo and heading; a new PDF contains the heading and the logo image.
  });

  test.fixme('F13-AC7 (US-056) a Teacher cannot change report template settings', async () => {
    // As teacher.a1 update template settings → forbidden.
  });

  test.fixme('F13-AC8 (US-056) template changes never change report content', async () => {
    // Generate with default and customized templates; extracted numbers and content are identical.
  });

  test.fixme('F13-AC9 (US-056) an oversized or non-image logo is rejected', async () => {
    // Upload a too-large image and a text file renamed .png → field errors.
  });

  test.fixme('F13-AC10 (US-057) a Parent PDF has only the linked child published data and no internal notes', async () => {
    // As parent.p1 generate for S1; text has no private-note marker and no unpublished period.
    // Generate for S3 → not found.
  });

  test.fixme('F13-AC11 (US-057) a Teacher PDF for an unassigned class is refused like the screen report', async () => {
    // As teacher.a1 generate for S3 → same not found as the S3 report endpoint.
  });

  test.fixme('F13-AC12 (US-057) an expired or foreign PDF link is refused', async () => {
    // Fetch the link as teacher.a2 → refused; control.advanceClock(past expiry); teacher.a1 → refused.
  });
});

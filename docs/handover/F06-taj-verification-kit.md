# F06 · Physical Taj Mushaf verification checklist and reviewer sign-off template

**Status:** Template for the product owner and the nominated reviewer. **Nothing has been verified.** No dataset has
been downloaded, so the dataset columns stay empty until an approved file has been converted (ADR-017 §4).
**Decisions:** DEC-B31 (reviewer), DEC-B70 (16-line Indo-Pak), DEC-B71 (Taj Company target publisher). Open: SRS §17.3
OD-QR-1, OD-QR-4. **Replaces** the short checklist formerly in
[F06-quran-dataset-candidates.md §6](F06-quran-dataset-candidates.md).

## How to use this kit

1. **Part A** can be done **now**, with no dataset and no licence. It identifies the Taj printing (OD-QR-1).
2. **Parts B–E** need the converted candidate dataset, which can exist only after licence clearance (FR-SAB-011). The
   reviewer compares the dataset with the physical Mushaf, item by item.
3. **Part F** is the sign-off. It is attached to the validation report (ADR-017 §7), and its SHA-256 is recorded on the
   import.

**Ground rules**
- Use a **physical Taj Company Mushaf in use at a target madrasa**. A PDF, scan, phone photo of someone else's copy, or a
  website preview does not count.
- If two copies differ (different printings), **stop**: each printing is its own edition and is verified separately.
- Record what you see. Never "fix" the dataset by hand. Every mismatch is a finding.
- Never write Quran text into the checklist. Use Surah:Ayat numbers, page and line numbers, and photos.
- Line numbers count from the top line of the text block (line 1) to the bottom (line 16). Margin notes, page headers,
  and footers are not lines.

## Part A — Edition identification (no dataset needed)

| # | Check | How | Result |
|---|---|---|---|
| A1 | Publisher name exactly as printed (including the city and country of the publishing entity) | Title page and imprint | |
| A2 | Title of the Mushaf as printed | Title page | |
| A3 | Edition, printing, or year statement; any print, catalogue, or ISBN number | Imprint page and back cover | |
| A4 | Approval or certification statement printed in the Mushaf (who certified it, and when), if any | Front or back matter | |
| A5 | Physical form: size (cm), binding, paper colour, colour coding (if any) | Measure | |
| A6 | Photographs: cover, title page, imprint page, first and last text pages | Attach files A6-1…A6-n | |
| A7 | The same printing at each target madrasa sampled (at least 2–3); note the madrasa and number of copies checked | Compare A1–A5 | |
| A8 | **Edition identifier proposed** for `mushaf_editions.printing_id` (e.g. publisher + printing statement) | From A1–A3 | |

## Part B — Page structure

| # | Check | How | Dataset value | Physical value | Match? |
|---|---|---|---|---|---|
| B1 | Total number of Quran-text pages | Count; note front/back matter separately | | | |
| B2 | Printed page number of the first Quran-text page; whether the dataset's page 1 is that page | First text page | | | |
| B3 | Printed page number and contents (last Surah:Ayat) of the last Quran-text page | Last text page | | | |
| B4 | Pages without exactly 16 text lines (list each page and its line count) | Leaf through the whole Mushaf | | | |
| B5 | Pages with decorative frames or headings that take line positions (e.g. the opening pages) | Opening and closing pages | | | |
| B6 | Page numbering continuous with no skipped or repeated numbers | Leaf through | | | |
| B7 | Where each of the 30 Paras starts: page, line, and Surah:Ayat | Para marks | | | |

## Part C — Line content (sampled pages, compared line by line)

**Sample:** at least **40 pages**, chosen and listed in advance:
- the first 3 and last 3 text pages;
- the page where each of Paras 1, 5, 10, 15, 20, 25, and 30 starts;
- 5 pages with a Surah heading mid-page;
- the page where Surah 9 starts (no Bismillah);
- 5 pages in Juz 30 where several short Surahs share a page;
- 5 pages with centred lines;
- the rest chosen at random by the reviewer.

For **each line** on a sampled page, record:

| Page | Line | Type: Ayat / Surah heading / Bismillah / other | Surah | First Ayat on the line (and whether it starts mid-Ayat) | Last Ayat on the line (and whether it ends mid-Ayat) | Centred or justified | Dataset agrees? | Note |
|---|---|---|---|---|---|---|---|---|

Then summarise:

| # | Check | Result |
|---|---|---|
| C1 | **Surah heading positions:** every heading on the sampled pages is on the same page and line in the dataset | |
| C2 | **Bismillah positions:** every Bismillah line matches; none before Surah 9; how the opening of Surah 1 is laid out in print vs. how the dataset types it | |
| C3 | **Ayat-to-page mapping:** for at least 60 Ayat spread over all 30 Paras, the page where each Ayat starts matches | |
| C4 | **Ayat-to-line mapping:** on every sampled page, each line's first and last Ayat match | |
| C5 | **Ayat that break across lines or pages:** the break point matches (which line the Ayat continues on) | |
| C6 | **Alignment:** centred and justified lines match the dataset's `is_centered` | |
| C7 | **Line breaks:** no sampled line starts or ends at a different word position (check the first and last word visually; do not transcribe text) | |
| C8 | **Other line types** found in print but absent from the dataset (e.g. section marks occupying a line): list each | |

## Part D — Metadata

| # | Check | Result |
|---|---|---|
| D1 | All 114 Surah headings present in order; at least 20 Arabic names compared visually with the dataset (including Surahs 1, 2, 9, and 114) | |
| D2 | Ayat counts: the dataset's cross-source comparison has no unexplained difference; spot-check 10 Surahs by counting the Ayat markers in print | |
| D3 | All 30 Para starts (from B7) match the dataset's Para boundaries | |
| D4 | Line counts: for 20 Sabaq-style ranges (one Surah, start–end Ayat), the app's Total Lines equals a count of Ayat lines on the printed pages, with Surah-heading and Bismillah lines excluded (OD-QR-11) | |
| D5 | Divisions (Ruku, Hizb, quarter-Hizb, seven Manzil): **not checked; later phase (DEC-B71)** | n/a |

## Part E — Preconditions (checked by the product owner before the review starts)

| # | Check | Evidence | Result |
|---|---|---|---|
| E1 | Every source file is `OPEN_LICENCE_VERIFIED` or `PERMISSION_GRANTED` (FR-SAB-011) | Permission letters, licence texts | |
| E2 | For the Taj layout: Taj Company's written position (permission, or legal advice that none is needed) is on file | Letter or legal memo reference | |
| E3 | The automated validation report passes V1–V12 (ADR-017 §6.2) | Report file and SHA-256 | |
| E4 | The reviewer is the person nominated by the product owner (DEC-B31) | Nomination record | |

## Part F — Reviewer sign-off template

Copy this into the validation report's `review` block (ADR-017 §7) and keep the signed copy with the product owner's
records.

```text
HIFZAMANAH — QURAN REFERENCE DATA REVIEW SIGN-OFF

Dataset key / version:         ______________________ / ______________
Validation report SHA-256:     ________________________________________________________________
Seed file SHA-256:             ________________________________________________________________
Source files (provider, resource ID, file SHA-256, licence status, permission reference):
  1. ____________________________________________________________________________
  2. ____________________________________________________________________________

Edition reviewed:              Taj Company — printing identifier: ______________________ (Part A8)
Physical copies used:          madrasa __________________ copy no. ____; madrasa __________________ copy no. ____
Pages counted (B1):            ______      Candidate page count: 548 (QUL 11)      Match: YES / NO
Lines per page (B4 exceptions): ________________________________________________

Parts completed:   A [ ]   B [ ]   C [ ] (pages sampled: ____ )   D [ ]   E (by product owner) [ ]

Findings (each with its page/line and a photo reference):
  # | Part/item | Description | Severity (blocks release / does not block) | Reported to source (date)
  __|___________|_____________|____________________________________________|_______________________

Decision:  [ ] APPROVED — the dataset matches the physical Mushaf on every sampled item; no blocking finding.
           [ ] APPROVED WITH NON-BLOCKING FINDINGS — listed above; none affects page/line/Ayat mapping.
           [ ] REJECTED — blocking findings above. The dataset must not be imported.

I confirm that I compared this dataset with the physical Taj Company Mushaf identified above, that I did not edit the
dataset, and that every difference I found is listed.

Reviewer name:  ______________________   Qualification (e.g. Hafiz, Qari, teacher at): ______________________
Signature:      ______________________   Date: ____________   Place: ____________

Product owner acceptance:  name ______________________  signature ______________  date ____________
```

A **REJECTED** decision, or any finding in C1–C7 or D3–D4, blocks the import (FR-SAB-013, planned F06-AC27). The
edition stays `UNVERIFIED`. The fix is made at the source or with a corrected source file, followed by a new dataset
version and a new review. It is never a manual patch.

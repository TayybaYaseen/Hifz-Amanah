# F06 · Written permission requests (DRAFTS — NOT SENT)

**Status:** Drafts for the product owner. **Not sent. No permission has been requested or received.** The product owner
decides whether, when, and from which account to send them, after legal review (OD-QR-3).
**Context:** [F06-quran-dataset-candidates.md](F06-quran-dataset-candidates.md) §4 and §7, SRS FR-SAB-011 (proposed),
DEC-B71.

Before sending:
- [ ] Fill every `[…]` placeholder. **Contact addresses were not verified** during research: find them on the official
      sites (qul.tarteel.ai / tarteel.ai for Tarteel; the imprint page of the Mushaf for Taj Company). Do not guess them.
- [ ] Confirm **which Taj Company entity** publishes the printing the madaris use, from the imprint (verification kit A1).
- [ ] Have a legal adviser review the wording, especially the scope of use and the derived-data description.
- [ ] Record each reply as `permission_ref` on the source record (ADR-017 §3.1). A verbal or chat "yes" is not
      sufficient; keep the written reply.

---

## Draft 1 — To Tarteel AI (Quranic Universal Library)

**To:** [Tarteel / QUL contact address — to be confirmed on the official site]
**Subject:** Permission request: commercial use of QUL Mushaf layout 11 and related metadata in the HifzAmanah Android app

Assalamu alaikum,

We are building **HifzAmanah**, an Android app that helps Hifz teachers and madaris record their students' daily Quran
memorization (Sabaq, Sabqi, and Manzil). Teachers use it offline in class. It is a **commercial** product, offered to
madaris [free / by subscription — product owner to state].

The madaris we serve mainly use the **Taj Company 16-line Indo-Pak Mushaf**. QUL publishes a resource that appears to
match it, and we ask for **written permission** to use the following:

| QUL resource | ID | Page |
|---|---|---|
| Indopak 16 lines layout (Taj company), 548 pages | 11 | https://qul.tarteel.ai/resources/mushaf-layout/11 |
| The word-by-word Quran script that layout 11's `first_word_id`/`last_word_id` refer to (please tell us which) | 55 or 59? | https://qul.tarteel.ai/resources/quran-script |
| Surah names *(only if needed)* | 70 | https://qul.tarteel.ai/resources/quran-metadata/70 |
| Juz *(only if needed)* | 68 | https://qul.tarteel.ai/resources/quran-metadata/68 |

The resource pages state "We don't have copyright information for this resource," and your FAQ asks users to check each
resource's licence. We therefore ask you directly.

**How we would use the data:**
1. Download each file **once**, record its checksum, and convert it offline into a **derived form**. For each printed
   line we keep the page, line number, line type, alignment, Surah, and the first and last Ayat with the word position
   in each. **We would not store or redistribute any Quran text, fonts, or images**, and we would not call any QUL
   service at runtime.
2. A qualified reviewer compares the result with a physical Taj Company Mushaf before release.
3. We store the derived data on our servers (AWS, Mumbai region), send it to authorized Teacher and Admin devices, and
   cache it there for offline use.

**Our questions:**
1. May we use these resources, in that derived form, in a **commercial** Android app?
2. May we **redistribute** the derived data to our users' devices (server storage plus an offline cache on the device)?
3. What **attribution** do you require, with the exact wording and where it should appear (in-app About screen, store
   listing, documentation)?
4. Does **Taj Company**, or any other party, hold rights in the layout of resource 11? If so, whom should we contact? Did
   QUL obtain any permission from Taj Company when preparing it?
5. Which script resource's `word_index` do layout 11's word IDs refer to? How do the CMS word IDs shown in the preview
   (e.g. 883507…) relate to them?
6. Which **printing** of the Taj Company Mushaf was layout 11 prepared from (year, edition statement, page count)?
7. Is there a **version or date** for the current files, and how are corrections published?
8. Are there any conditions or restrictions we should know about (e.g. no modification, notice of changes, revocation)?

We are glad to share how we credit QUL and to report any errors our reviewer finds back to you.

JazakAllahu khairan,
[Name], [Role], HifzAmanah
[Organization / legal entity], [Address], [Email], [Phone]

---

## Draft 2 — To Taj Company

**To:** [Taj Company — the publishing entity named on the imprint of the printing used by the madaris; address from the
imprint or official contact]
**Subject:** Permission request: using the page and line layout of your 16-line Quran Majeed in a Hifz teaching app

Assalamu alaikum,

We are building **HifzAmanah**, an Android app that helps Hifz teachers and madaris record their students' daily Quran
memorization. The madaris we serve mainly use **your 16-line Quran Majeed** ([title, printing, and year as on the
imprint — from verification kit A1–A3]).

Teachers assign lessons by **lines on the page** of your Mushaf. To count lines correctly, our app needs to know, for
each page of your printing, **which Surah and Ayat appear on each of its 16 lines**. We ask for your **written
permission** to use that page-and-line layout.

**What we would use, and what we would not:**
- **We would use:** for each page of your printing, the page number and, for each line, the line number, whether it is
  a Surah heading, a Bismillah, or Ayat text, the line's alignment, and the first and last Ayat on the line.
- **We would not use:** the Quran text, your calligraphy, your page images, your fonts, your cover, or your trade marks.
  Nothing from your Mushaf would be reproduced as an image or printed.
- **Source:** the layout data was published by a third party, the Quranic Universal Library (Tarteel AI), as "Indopak 16
  lines layout (Taj company), 548 pages". We are also asking Tarteel for permission. A qualified reviewer would compare
  every detail with a printed copy of your Mushaf before use.
- **Distribution:** stored on our servers and on the Android devices of authorized teachers and madrasa administrators,
  for offline use, in a [free / paid — product owner to state] app.

**Our questions:**
1. Do you permit this use of your page and line layout in a commercial Android app? On what conditions?
2. What **credit** would you like shown (exact wording and place)?
3. Which **printing** is current, and do different printings have different page or line breaks? Please give the edition
   statement or year of each printing, so our app identifies the right one.
4. Is the **548-page** count correct for the printing the layout was prepared from?
5. If you prefer, could you provide or confirm the page-and-line layout yourselves?

We would be glad to show you how the app credits your Mushaf before release.

JazakAllahu khairan,
[Name], [Role], HifzAmanah
[Organization / legal entity], [Address], [Email], [Phone]

---

## Recording the answers

| Party | Sent on | By | Reply received | Outcome (granted / conditions / refused) | Attribution required | Stored at | `permission_ref` |
|---|---|---|---|---|---|---|---|
| Tarteel AI (QUL) | — | — | — | — | — | — | — |
| Taj Company | — | — | — | — | — | — | — |

Until **both** replies grant permission, or legal advice says Taj Company's permission is not needed, every Taj layout
source stays `LICENSE_REVIEW_REQUIRED` and nothing is imported (FR-SAB-011, planned F06-AC26).

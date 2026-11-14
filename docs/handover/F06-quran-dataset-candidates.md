# F06 · Quran reference data: sources, licences, and recommendation

**Status:** Research for a product-owner decision. **Nothing here is approved, no dataset has been downloaded or
imported, and no Quran data was generated or typed in.**
**Dates:** first version 2026-11-09 (candidate comparison); revised 2026-11-09 (full QUL resource review, licence status
per resource, source per category, permission checklist).
**Decisions:** DEC-B31 (reviewed seed, reviewer), DEC-B70 (16-line Indo-Pak Mushaf), **DEC-B71 (Taj Company is the
primary target publisher, 2026-11-09)**. Open items: SRS §17.3.

> **Target edition (DEC-B71):** the target madaris mainly use the **Taj Company** Quran. The candidate profile is Taj
> Indo-Pak 16-line, and QUL resource 11 (548 pages) is a **candidate layout only**. The exact printing, page count, page
> numbering, and every line break stay **unverified** until checked against a physical Taj Mushaf from the target
> madaris (§6). The publisher decision grants **no** licence to any file.
**Design that uses this research:** [ADR-017](../adr/ADR-017-quran-reference-data-model.md) (Proposed): data model, line
structure, offline strategy, import and validation.

> **Seed import ≠ runtime provider.** HifzAmanah never calls QUL, Tanzil, Quran Foundation or any other provider while
> the app runs (SRS §1.5, FR-SAB-005). The plan is a **one-time, reviewed, versioned import**: an approved file is
> downloaded once by a maintainer, converted offline, validated, reviewed, and loaded by the existing seed loader. Teachers
> then use HifzAmanah's own copy, offline.

## 1. What the app needs

| # | Need | Used by | MVP? |
|---|---|---|---|
| 1 | 114 Surahs: number, Arabic name (byte-exact, BR-15), transliterated name, Ayat count | Surah picker, range validation (FR-SAB-005, F06-AC6) | Yes |
| 2 | 30 Para (Juz) boundaries | Derived Sabaq Para (FR-SAB-001), Sabqi/Manzil Para | Yes |
| 3 | Page/line layout of the **16-line Indo-Pak** Mushaf, with Surah-heading and Bismillah lines | Total Lines pre-fill (FR-SAB-008), page/line navigation | Yes (blocked) |
| 4 | Ruku boundaries | Navigation aid only | **Later phase** (DEC-B71) |
| 5 | Hizb, Rub al-Hizb (quarter-Hizb), Manzil (7-part) divisions | Navigation aid only | **Later phase** (DEC-B71) |
| 6 | Revelation place and order, Bismillah flag | Display only | Optional |
| 7 | Provenance: source, resource ID, version, file checksum, licence, reviewer | `quran_imports` (FR-SAB-007) | Yes |
| 8 | A licence that allows commercial use **and** redistribution inside an Android app | Release gate | Yes |

HifzAmanah does **not** need Quran text, word text, audio, translations, or tafsir. Showing Quran text is out of scope
(F06 spec), so no script or font is shipped. Word data is used only by the offline converter (ADR-017 §4).

## 2. QUL (Quranic Universal Library, Tarteel AI): what exists

Read on 2026-11-09 from https://qul.tarteel.ai/resources and the pages listed in §8.

**The GitHub repository is not the data.** `TarteelAI/quranic-universal-library` is a Ruby on Rails / Active Admin
content-management system, MIT-licensed ("Copyright (c) 2024-present Tarteel, Inc"). The MIT licence covers that
software. The datasets are downloaded separately from the website, and **the MIT licence does not apply to them**.

**How downloads work.** Each resource page offers "Download json" / "Download sqlite" (layouts: sqlite / docx). The
QUL site says resources "are intended for you to download and package with your own project; no API is available". The
download links were placeholders in the fetched pages, so the real file URLs and whether a login is needed were **not
verified**. The FAQ says downloading needs no access to the tools.

**Catalogue (counts as shown on the index page):** recitations 131, Mushaf layouts 28 (20 approved, 8 WIP; 12 listed
publicly), translations 220, tafsirs 115, Quran script 30, fonts 26, **Quran metadata 8**, transliteration 11, Surah
information 9 languages, topics, morphology, mutashabihat, similar ayahs, ayah themes.

### 2.1 Quran metadata resources (category "Quran metadata", 8 resources)

| ID | Name | Records | Fields (from the resource's Docs tab) | Formats | Licence page text |
|---|---|---|---|---|---|
| 70 | Surah names | 114 | `id`, `name` (transliteration with diacritics), `name_simple`, `name_arabic`, `revelation_order`, `revelation_place` (`makkah`/`madinah`), `verses_count`, `bismillah_pre`. SQLite table `chapters` | json, sqlite | "We don't have copyright information for this resource." |
| 69 | Ayah | 6,236 (keys 1–6236) | `id`, `surah_number`, `ayah_number`, `verse_key` ("s:a"), `words_count`, `text` (QPC Hafs script). Table `verses` | json, sqlite | same |
| 68 | Juz | 30 | `juz_number`, `verses_count`, `first_verse_key`, `last_verse_key`, `verse_mapping` (Surah → "start-end"). Table `juz` | json, sqlite | same |
| 67 | Hizb | 60 | `hizb_number`, `verses_count`, `first_verse_key`, `last_verse_key`, `verse_mapping`. Table `hizbs` (the Docs table mislabels the first field `juz_number`) | json, sqlite | same |
| 63 | Rub | 240 | `rub_number`, same range fields. Table `rub`. "Rub" = Rub al-Hizb = ¼ Hizb = ⅛ Juz | json, sqlite | same |
| 65 | Ruku | **558** (keys 1–558; the description says "about 540") | `ruku_number`, `surah_ruku_number`, `verses_count`, `first_verse_key`, `last_verse_key`, `verse_mapping`. Table `ruku` | json, sqlite | same |
| 66 | Manzil | 7 | `manzil_number`, range fields. Table `manzil` (Docs page partly truncated in our fetch) | json, sqlite | same (truncated fetch) |
| 64 | Sajda | 15 | `sajdah_number`, `verse_key`, `sajdah_type` (`required`/`optional`). Table `sajdah` | json, sqlite | same |

None of these pages shows a version number or an "updated" date. QUL has **no** separate page-metadata resource; page
data comes from the Mushaf layouts.

### 2.2 Mushaf layouts (12 listed publicly)

| ID | Name | Pages / lines (as stated) | Formats | Licence page text |
|---|---|---|---|---|
| **11** | **Indopak 16 lines layout (Taj company)** | "This layout has 548 pages." 16 lines per page from the title only | sqlite, docx | "We don't have copyright information for this resource." |
| 313 | Indopak 13 lines layout (Taj company) | 847 pages, 13 lines | docx, sqlite | same |
| 12 | Indopak 15 lines layout (Qudratullah) | 610 pages, 15 lines | json, docx, sqlite, images | same |
| 236 | Indopak 13 lines layout (Qudratullah) | not checked | sqlite, docx | not checked |
| 571 | Indopak 9 lines (Gaba) | not checked | docx, sqlite | not checked |
| 8, 15, 10, 21, 19, 570, 569 | KFGQPC / Madani / Qatar / SVG layouts | not relevant (not Indo-Pak 16-line) | — | not checked |

**Layout format** (QUL docs `/docs/mushaf-layout` and `/resources/mushaf-layout/11/docs`): one SQLite table `pages`,
one row per printed line:

| Column | Meaning (QUL docs) |
|---|---|
| `page_number` | page in the Mushaf |
| `line_number` | line on the page |
| `line_type` | `ayah` (Quran text), `surah_name` (Surah heading; use `surah_number`), `basmallah` |
| `is_centered` | true = centred, false = fully justified |
| `first_word_id`, `last_word_id` | first/last word on the line; null on `surah_name` lines in the docs sample |
| `surah_number` | the Surah shown on the line |

The words are not in the layout file. They are in a **separate "Quran script, word by word" download**, table `words`:
`word_index` ("The unique ID for each word. This id is referenced in first_word_id and last_word_id"), `word_key`
("s:a:w", e.g. `74:19:3`), `surah`, `ayah`, `text`. An ayah line holds the words `first_word_id … last_word_id`
inclusive.

**Unresolved for layout 11 (blocker B-1):**
- QUL does **not** say which word-by-word script pairs with layout 11. Candidates: script **55** "Indopak" (tags Mushaf
  layout, Pdms-saleem) and **59** "Indopak Nastaleeq – Word by Word", which links to layouts 12 and 236, not 11. Both say
  "We don't have copyright information for this resource."
- The docs sample uses word IDs 1–36 for page 1. The live preview of layout 11 links words to CMS IDs 883507–883542. How
  the CMS IDs relate to `word_index` is not documented.
- The docs sample's page 1 rows (Surah heading, then ayah lines with word ranges 1–5, 6–10, …) are a **generic**
  documentation example rendered in QPC Hafs script. They are not shown to be layout 11's data.

So the layout can only be converted after the files are downloaded and the converter proves that **every**
`first_word_id`/`last_word_id` in layout 11 resolves to exactly one word in the paired script, and that the word
sequence covers all 6,236 Ayat with no gap or overlap (ADR-017 §6). If that fails, the import stops.

### 2.3 Other QUL resources (not needed)

Quran script (30), fonts (26), Surah information (9 languages), translations, tafsir, recitations, morphology and the
rest are not needed. Scripts are touched only as the word → Ayat lookup table for the converter. No text is stored.

## 3. Other sources

| Source | What it offers | Licence (as found) | Verified? |
|---|---|---|---|
| **Tanzil** `quran-data` (tanzil.net/docs/Quran_Metadata; file `quran-data.js`/XML) | Expected: Suras (ayah counts, start index, names, type, revelation order, rukus), Juz, hizb quarters, manzils, rukus, pages (Madina Mushaf), sajdas | A third-party copy of the file header reads "Quran Metadata (ver 1.0), Copyright (C) 2008-2009 Tanzil.info", and a third party reports "Creative Commons Attribution 3.0" | **No.** tanzil.net failed DNS from the research environment on both attempts. Its page data is for the Madina Mushaf, not Indo-Pak 16-line |
| **quran-meta** (github.com/quran-center/quran-meta, npm) | Surahs, Ayat, Juz, Hizb, Rub al-Hizb, Thumun, pages, rukus (Hafs: **556**), manzils, sajdas for eight riwayas | MIT ("Copyright (c) 2020 Quran-Center") for the package. Its data is generated from "quranpedia.net dumps" and KFGQPC font data, whose terms were not checked | Repo and LICENSE read. npm page returned 403. Pages are the 604-page Madinah Mushaf only. It is a JS library, not a dataset file |
| **Quran Foundation Content API v4** | Chapters, verses, juzs; Mushaf ID 7 "IndoPak with 16 lines per page", 548 pages | No terms or caching/redistribution clause found; needs registered client credentials | Docs read 2026-11-09. A live authenticated service, so it is not a seed source without written terms. Possible cross-check only |
| **Printed Mushaf** (the madaris' own copy) | The ground truth for page/line breaks, Ruku marks, Para starts | n/a | The reviewer uses it (§6) |

**Cross-source observations to settle in review:**
- Ruku count: QUL 558, quran-meta 556 (Hafs). Indo-Pak printings mark Rukus (ع) by their own convention. The count used
  must match the **printed Indo-Pak Mushaf**. It is not taken from either source on trust.
- QUL layout 11 and Quran Foundation Mushaf 7 both report 548 pages, which suggests the same printing. That is not proven.
- QUL's "Rub" is Rub al-Hizb (⅛ Juz). It is **not** the Hifz quantity preset Rubu (¼ Para, FR-QTY-002). The two must
  never be linked (ADR-017 §5.3).

## 4. Licence status per resource

`LICENSE_REVIEW_REQUIRED` = no licence that permits commercial use and app redistribution has been confirmed. Such a
resource must not be bundled, redistributed, or loaded into production until written permission or a verified open
licence is recorded.

| Resource | ID | Source URL | Download URL | Licence | Commercial use | Attribution | Redistribution | Permission needed from | Bundle in Android app? | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| QUL Surah names | 70 | qul.tarteel.ai/resources/quran-metadata/70 | not captured (placeholder link) | None stated ("We don't have copyright information…") | QUL FAQ: allowed "subject to each resource's licence"; none stated here | Unknown | Unknown | Tarteel (QUL) | **No, not yet** | `LICENSE_REVIEW_REQUIRED` |
| QUL Ayah | 69 | …/quran-metadata/69 | not captured | None stated | Unknown | Unknown | Unknown | Tarteel | No (and not needed) | `LICENSE_REVIEW_REQUIRED` |
| QUL Juz | 68 | …/quran-metadata/68 | not captured | None stated | Unknown | Unknown | Unknown | Tarteel | **No, not yet** | `LICENSE_REVIEW_REQUIRED` |
| QUL Hizb | 67 | …/quran-metadata/67 | not captured | None stated | Unknown | Unknown | Unknown | Tarteel | No | `LICENSE_REVIEW_REQUIRED` |
| QUL Rub | 63 | …/quran-metadata/63 | not captured | None stated | Unknown | Unknown | Unknown | Tarteel | No | `LICENSE_REVIEW_REQUIRED` |
| QUL Ruku | 65 | …/quran-metadata/65 | not captured | None stated | Unknown | Unknown | Unknown | Tarteel | No | `LICENSE_REVIEW_REQUIRED` |
| QUL Manzil | 66 | …/quran-metadata/66 | not captured | None stated (truncated fetch) | Unknown | Unknown | Unknown | Tarteel | No | `LICENSE_REVIEW_REQUIRED` |
| QUL Sajda | 64 | …/quran-metadata/64 | not captured | None stated | Unknown | Unknown | Unknown | Tarteel | No (not needed) | `LICENSE_REVIEW_REQUIRED` |
| **QUL Indopak 16-line layout (Taj company)** | **11** | qul.tarteel.ai/resources/mushaf-layout/11 | not captured | None stated | Unknown | Unknown | Unknown | **Tarteel, and possibly Taj Company** (publisher of the printed layout) | **No, not yet** | `LICENSE_REVIEW_REQUIRED` |
| QUL Indopak word-by-word script | 55 / 59 | …/quran-script/55, /59 | not captured | None stated | Unknown | Unknown | Unknown | Tarteel (and the script's original author) | Not shipped; converter input only. Use still needs permission | `LICENSE_REVIEW_REQUIRED` |
| QUL CMS software | GitHub | github.com/TarteelAI/quranic-universal-library | — | MIT (code only) | Yes (code) | MIT notice | Yes (code) | — | Not used | n/a: not data |
| Tanzil Quran metadata | quran-data | tanzil.net/docs/Quran_Metadata | tanzil.net/res/text/metadata/quran-data.js (named in quran-meta README) | Reportedly CC BY 3.0, **unverified** | Likely yes if CC BY 3.0 is confirmed | Likely required (credit + link) | Likely yes if confirmed | Nobody, if CC BY 3.0 is confirmed at the source | Only after verification | `LICENSE_REVIEW_REQUIRED` (verification pending) |
| quran-meta | npm/GitHub | github.com/quran-center/quran-meta | npm | MIT (package) | Yes (package) | MIT notice | Yes (package) | Upstream terms (quranpedia, KFGQPC) not checked | Not recommended as a seed source | `LICENSE_REVIEW_REQUIRED` (upstream) |
| Quran Foundation API v4 | Mushaf 7 | api-docs.quran.foundation | API only | Terms not found | Unknown | Unknown | Unknown (storing API data) | Quran Foundation | No | `LICENSE_REVIEW_REQUIRED` |

**Cautions that apply to every row:**
- QUL's MIT licence covers its website software, **not** the datasets it serves.
- A file that anyone can download is **not** thereby licensed for redistribution.
- Taj Company publishing, or a madrasa owning, a printed Taj Mushaf grants **no** right to distribute a digital layout of
  it. For any Taj layout data, Taj Company's position (permission, or legal advice that none is needed) is a
  **prerequisite**, in addition to the dataset provider's permission (SRS FR-SAB-011, OD-QR-3).

**No resource is approved.** Facts such as "Surah 2 has 286 Ayat" are part of the Quran itself. A curated compilation or
a page layout may still carry rights, and HifzAmanah does not make that legal judgement. It goes to the product owner's
legal adviser.

## 5. Recommended source per category (pending licence and review)

| Category | Recommended primary | Cross-check (internal comparison only, never shipped) | Notes |
|---|---|---|---|
| Surahs (number, Arabic name, translit name, Ayat count, revelation place/order, Bismillah) | **Tanzil quran-data**, once its CC BY 3.0 licence is confirmed at tanzil.net. **Otherwise QUL 70** with written permission | QUL 70 vs Tanzil vs printed Mushaf | Arabic names stored byte-exact as the chosen source gives them. Never edited or transliterated by us |
| Para/Juz boundaries | **Tanzil** (juzs), else **QUL 68** with permission | The other one, plus the printed Indo-Pak Mushaf's Para starts | Indo-Pak Para starts must match the print. Any mismatch is reported, never "fixed" |
| Taj Indo-Pak 16-line page/line layout (DEC-B71) | **QUL 11 ("Indopak 16 lines layout (Taj company)", 548 pages) as a candidate only**, the only file-based Taj 16-line source found. Needs written permission from Tarteel **and** Taj Company's position on digital use, the paired word script resolved (B-1), and the §6 Taj verification against a physical Taj Mushaf | Quran Foundation Mushaf 7 page count only; the printed Mushaf (sampled pages) | No alternative found. If permission is refused, the layout stays unloaded and Total Lines is entered by hand (FR-SAB-008 fallback, already built) |
| Word → Ayat lookup (converter only) | The QUL word-by-word script that pairs with layout 11 (55 or 59, to be confirmed) | Ayat count per Surah from the metadata source | Not stored at runtime |
| Ruku | Tanzil rukus or QUL 65, **verified against the printed Indo-Pak Ruku marks** | quran-meta (556) vs QUL (558) | Only if OD-QR-5 puts Ruku in scope |
| Hizb / Rub al-Hizb / Manzil (7) | Later phase (DEC-B71) | — | "Manzil" (7-part) clashes with the Hifz section name Manzil. Quarter-Hizb is **not** the Hifz quantity Rubu (¼ Para) |

**F06 MVP priority order (DEC-B71):** 1. Surah metadata. 2. Ayat metadata and validation (Ayat count per Surah, checked
against the source's full Ayat list). 3. Para/Juz metadata. 4. The Taj edition profile. 5. The verified Taj page/line
layout mapping. 6. The offline reference-data snapshot and versioning. Ruku, Hizb, quarter-Hizb, and seven-Manzil come
later, and only with an approved source and a clear need.

**Simplest reliable path:** Tanzil (or QUL with permission) for Surahs + Juz; QUL 11 + its paired word script for the
Taj layout, after Tarteel's and Taj Company's permission; a physical Taj Mushaf for human verification. Everything goes
through one reviewed seed file.

## 6. Taj edition verification and human review checklist

**Moved 2026-11-09** to [F06-taj-verification-kit.md](F06-taj-verification-kit.md), so there is a single checklist.
It covers Part A (edition identification), Part B (page structure), Part C (40-page line-by-line sample: Surah headings,
Bismillah, Ayat-to-page, Ayat-to-line, breaks, alignment), Part D (metadata and line counts), Part E (licence
preconditions), and Part F (the reviewer sign-off template). The comparison uses a **physical Taj Company Mushaf in use
at the target madaris** (DEC-B71).

## 7. Permission request checklist (draft, not sent)

Full letters: [F06-permission-request-drafts.md](F06-permission-request-drafts.md) (separate drafts for Tarteel AI and
Taj Company; **not sent**).

To **Tarteel AI / QUL** (contact via qul.tarteel.ai or Tarteel's site), and to **Taj Company**. Since DEC-B71, the Taj
Company request is a prerequisite for any Taj layout data, whatever Tarteel answers:

- [ ] Who we are: HifzAmanah, a commercial Android app for Hifz teachers, madaris, students, and parents.
- [ ] The exact resources: Mushaf layout **11** (Indopak 16 lines, Taj Company, 548 pages); the word-by-word script that
      pairs with it (55 or 59, ask which); and, if Tanzil is not used, metadata **70** (Surah names) and **68** (Juz).
      Optionally 65 (Ruku).
- [ ] The use: a one-time import, converted to a derived form (per line: page, line, line type, Surah, first/last Ayat
      and word position). **No Quran text and no fonts are redistributed.**
- [ ] Distribution: stored on our servers (AWS Mumbai) and cached on Teacher/Admin Android devices for offline use.
      Ask explicitly about **commercial use**, **redistribution in a paid or free Android app**, and **derived data**.
- [ ] Attribution wording they require, and where it must be shown (About screen, store listing, docs).
- [ ] Whether Taj Company (or another party) holds rights in the layout, and whom to contact.
- [ ] Which script's `word_index` the layout's `first_word_id`/`last_word_id` refer to, and how the CMS IDs relate.
- [ ] The dataset version or date, and how corrections are published (changelog).
- [ ] Permission recorded in writing (email or letter), stored by the product owner. Its reference is entered as
      `permission_ref` on the source record (ADR-017 §3.1).

To **Tanzil**: verify the licence at tanzil.net directly (no request needed if CC BY 3.0 is confirmed). Record the exact
licence text, version, and the attribution it requires.

## 8. Sources read (2026-11-09)

- QUL: https://qul.tarteel.ai/resources ; /resources/quran-metadata and /quran-metadata/{63…70} with their /licence and
  /docs tabs; /resources/mushaf-layout, /mushaf-layout/11 (+ /docs, /licence), /mushaf-layout/313/licence,
  /mushaf-layout/12/licence; /resources/quran-script, /quran-script/55 and /59 (+ /licence); /docs, /docs/mushaf-layout,
  /docs/quran-script, /docs/downloading-data; /faq; /credits.
- GitHub: https://github.com/TarteelAI/quranic-universal-library (README, LICENSE);
  https://github.com/quran-center/quran-meta (README, LICENSE).
- Quran Foundation page-layout guide and API docs: https://api-docs.quran.foundation/docs/tutorials/fonts/page-layout/ ,
  https://api-docs.quran.foundation/

**Not read:** tanzil.net (DNS failure on every attempt), the body of https://www.tarteel.ai/terms (only the title was
returned), https://qul.tarteel.ai/terms (404), the npm page for quran-meta (403), the real download files and whether a
login is needed. **No file was downloaded.**

# F06 · Decision proposal: OD-QR-7, OD-QR-10, OD-QR-11

**Status:** **Decided 2026-11-09:** OD-QR-7 → A (DEC-B75), OD-QR-10 → confirmed, quantities only (DEC-B76), OD-QR-11 → A, Ayat lines only, with teacher consultation recommended before production rollout (DEC-B77). Kept for history; the record is `decision-log.md` and SRS §17. Original status: proposal; nothing was built on the proposed
answers.
**Date:** 2026-11-09. **Context:** SRS §17.3; ADR-017 (accepted); proposed design
[ADR-018](../adr/ADR-018-quran-reference-snapshot-offline-cache.md) (for OD-QR-7).

To decide, tick one box per question and add a note if needed. The decision is then recorded as a DEC row in SRS §17.

---

## OD-QR-7 · How do Teacher and Admin devices get Quran reference data for offline use?

**Recommendation: A, an API snapshot after the first online sign-in.**

| | A. API snapshot after sign-in (recommended) | B. Bundled in the APK | C. Live API calls only (no cache) |
|---|---|---|---|
| Offline after setup | Yes, after the first online sign-in to a workspace | Yes, from first launch | **No.** Fails FR-SAB-014 and NFR-OFF |
| Per-madrasa Admin edits | Included: the snapshot is the madrasa's own data | **Missing:** the APK holds the base seed only; edits need a second channel anyway | Included |
| Updating after a correction or new dataset version | Next refresh, no app release | **Needs an app release** through Play Store review | Immediate |
| Licensing (redistribution) | Only to authorized staff of a licensed madrasa; can stop at once if a licence changes | Every APK download is a copy, including uninstalled and side-loaded copies; it cannot be withdrawn | Least exposure |
| App size | Unchanged | Grows by the dataset | Unchanged |
| Effort | Snapshot route, device cache, refresh logic (ADR-018) | Build-time packaging, plus a delta channel for Admin edits | Already built |
| Fits existing decisions | Teachers sign in online first anyway (F01); Student/Parent stay online-only | Conflicts with per-madrasa metadata (FR-SAB-005) | Conflicts with FR-SAB-014 |

**If approved:**
- Build ADR-018: two read-only routes, the `ref_*` SQLite cache, and refresh and recovery logic.
- Activate the AC24 E2E test and add a Maestro offline flow.
- No F12 protocol change is needed (ADR-018 §3).

**If B is chosen instead:** a written licence term permitting APK redistribution is needed first (OD-QR-3), plus a
second mechanism for Admin edits.

- [ ] A — API snapshot after the first online sign-in
- [ ] B — bundled in the APK
- [ ] Other: ______________________

---

## OD-QR-10 · Can a Teacher pick a Para *quarter* as a position (e.g. "Para 5, second quarter")?

**Recommendation: No. Rubu, Half, Salasah, and Complete stay quantities only, as today.**

- **What exists:** Rubu = ¼, Half = ½, Salasah = ¾, Complete = 1 Para are amounts, stored as `(PARA, n, d)` (FR-QTY-002,
  ADR-005). They say how much was done, not where.
- **What "positions" would need:** verified start points for each quarter of each Para in the **Taj** printing. Indo-Pak
  Mushafs mark Para quarters in the margin. That is new Quran metadata, needing a source, a licence, and a reviewer
  check, like the layout. QUL's "Rub" (Rub al-Hizb, ⅛ Juz) is a different division and must not be used for it (ADR-017
  §5.3).
- **Why not now:** no approved source exists, DEC-B71 moved such divisions to a later phase, and positions add no value
  while ranges can already be entered as Surah/Ayat.
- **If approved as recommended:** no change. The rule is confirmed and written into FR-QTY.
- **If rejected (positions wanted):** a later phase needs a quarter-marks dataset, a new table (`quran_divisions`,
  ADR-017 §3.5), review, and UI. It is not an MVP item.

- [ ] Confirm: Para quarters stay quantities only
- [ ] Positions are wanted in a later phase
- [ ] Other: ______________________

---

## OD-QR-11 · Do Surah-heading and Bismillah lines count in a Sabaq's Total Lines?

**Recommendation: No. Only Ayat lines count, as already built.**

- **Current behaviour:** Total Lines counts only lines that hold Ayat of the range (FR-SAB-008, FR-SAB-012). A range
  that starts a Surah does not count its heading or Bismillah line. The Teacher can always correct the pre-filled
  number, and the stored count records whether it came from the layout or was entered by hand (DEC-B64).
- **Why:** Lines measure memorised text. Headings and the Bismillah before a Surah are not part of the assigned Ayat
  range, so counting them would make the same lesson count differently depending on where it starts.
- **What to check before confirming:** ask 2–3 Hifz teachers at the target madaris how they count lines when a lesson
  starts a new Surah. If their practice differs, option B below is a small, contained change.
- **If approved as recommended:** remove the `DEFERRED: OD-QR-11` markers; no behaviour change.
- **If B is chosen:** change `countLines` to also count the heading and Bismillah lines directly before Ayat 1 when a
  range starts at Ayat 1. Update unit tests and AC23, and record a DEC row. Stored counts are never recalculated
  (FR-SAB-008).

- [ ] A — Ayat lines only (recommended, as built)
- [ ] B — also count the heading and Bismillah lines when a range starts at Ayat 1
- [ ] Other: ______________________

---

**Product owner:** name ____________________ date ____________

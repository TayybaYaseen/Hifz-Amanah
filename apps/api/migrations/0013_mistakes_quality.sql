-- 0013 · Mistakes and quality: the overall performance label and mistake notes (F07; US-028…032).
-- ARCHITECTURE.md §6.3; FR-ATT-009, FR-ATT-010, FR-ATT-012; DEC-B27, DEC-B28, DEC-B86. Plan: docs/handover/F07-plan.md.
--
-- Quality (portion_attempts.quality, 1–5 or NULL, lower is better) and "No mistakes" (no_mistakes) were added by 0012.
-- This migration is additive: no existing row changes meaning, no default fills a value in from another field.

-- ---------- daily_records.overall_label (FR-ATT-009 note, US-032) ----------
-- One optional label per record. Never derived from, or converted to, the portions' quality scores (F07-AC13).
ALTER TABLE daily_records
  ADD COLUMN overall_label text CHECK (overall_label IN ('EXCELLENT', 'GOOD', 'AVERAGE', 'NEEDS_IMPROVEMENT'));

GRANT UPDATE (overall_label) ON daily_records TO hifz_tenant;

-- ---------- attempt_mistakes.note, note_visibility (FR-ATT-012, DEC-B28, DEC-B86) ----------
-- An optional short note per mistake: trimmed, 1–200 characters. Internal staff text by default: never logged,
-- audited by field name only, and sent to a Student or Parent only when note_visibility is SHARED (F07-AC15).
-- Mistake rows are still never updated in place: a correction detaches the old list (superseded_at) and inserts the
-- new one, so a note's history is kept with its mistake.
ALTER TABLE attempt_mistakes
  ADD COLUMN note text CHECK (note IS NULL OR (length(note) BETWEEN 1 AND 200 AND note = btrim(note))),
  ADD COLUMN note_visibility text NOT NULL DEFAULT 'INTERNAL' CHECK (note_visibility IN ('INTERNAL', 'SHARED'));

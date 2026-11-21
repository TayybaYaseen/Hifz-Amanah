// F08 · Homework portion form model (US-033, US-036; F08-AC1, AC4, AC8). Pure TypeScript.
// A homework portion is edited with the F05 portion fields (Sabaq: single-Surah range, Total Lines, Assigned Lines in
// LINES with its Para derived; Sabqi/Manzil: Para with presets or Lines/Ayat/Pages, DEC-B60), without the attempt
// part. Every rule is the domain's: validatePortionFields (F05 portion rules) and originAfterEdit (Suggested → Edited,
// F08-AC8). Form state holds what the Teacher typed, never localized text.
import { validatePortionFields, type RangeReference } from '@hifz/domain/hifz';
import { originAfterEdit, type HomeworkPortion } from '@hifz/domain/homework';
import { presetOf, type Quantity } from '@hifz/domain/quantity';
import type { ReferenceIndex } from '@hifz/domain/quran-ref';
import { newPortion, portionValues, uiIssue, type FormIssue, type PortionForm, type UnitChoice } from '../daily-entry/form.ts';
import type { Section } from '../daily-entry/local.ts';
import type { LocalHomeworkPortion } from './local.ts';

const textOf = (n: number | null | undefined): string => (n === null || n === undefined ? '' : String(n));

function choiceOf(q: Quantity | null): UnitChoice | null {
  if (!q) return null;
  if (q.unit === 'PARA') return presetOf(q);
  return q.unit;
}

/** Fills portion fields from a homework portion (editing a draft, a revision, or a due portion in Daily Entry). */
export function formFromHomework(p: Pick<HomeworkPortion, 'section' | 'paraNumber' | 'range' | 'totalLines' | 'assigned'>, key: string, savedId: string | null): PortionForm {
  const sabaq = p.section === 'SABAQ';
  const base = newPortion(key, p.section);
  return {
    ...base,
    savedId,
    surah: textOf(p.range?.surahStart),
    surahEnd: p.range && p.range.surahEnd !== p.range.surahStart ? textOf(p.range.surahEnd) : '',
    ayahStart: textOf(p.range?.ayahStart),
    ayahEnd: textOf(p.range?.ayahEnd),
    totalLines: sabaq ? textOf(p.totalLines) : '',
    linesTouched: sabaq && p.totalLines !== null,
    assignedLines: sabaq ? textOf(p.assigned?.numerator) : '',
    assignedTouched: sabaq,
    savedLines: sabaq && p.totalLines !== null ? { text: textOf(p.totalLines), source: null } : null,
    para: sabaq ? '' : textOf(p.paraNumber),
    unit: sabaq ? null : choiceOf(p.assigned),
    assignedAmount: !sabaq && p.assigned && p.assigned.unit !== 'PARA' ? String(p.assigned.numerator) : '',
  };
}

/** A due homework portion as a new Daily Entry portion linked to it (FR-HW-015, F08-AC16). */
export function formForDuePortion(p: LocalHomeworkPortion, key: string): PortionForm {
  return { ...formFromHomework(p, key, null), homeworkPortionId: p.id };
}

export interface HomeworkValues {
  section: Section;
  /** Sabqi/Manzil: entered. Sabaq: the device's derived Para for display; never sent. */
  paraNumber: number | null;
  range: HomeworkPortion['range'];
  totalLines: number | null;
  /** Null while incomplete. */
  assigned: Quantity | null;
}

export function homeworkValues(form: PortionForm, position: number, index: ReferenceIndex | null): HomeworkValues {
  const v = portionValues(form, position, index);
  const a = v.portion.assigned;
  const assigned: Quantity | null = a && a.unit !== null && a.numerator !== null ? { unit: a.unit, numerator: a.numerator, denominator: a.denominator ?? 1 } : null;
  const r = v.portion.range;
  const range =
    form.section === 'SABAQ' && r && r.surahStart !== null && r.ayahStart !== null && r.surahEnd !== null && r.ayahEnd !== null
      ? { surahStart: r.surahStart, ayahStart: r.ayahStart, surahEnd: r.surahEnd, ayahEnd: r.ayahEnd }
      : null;
  return {
    section: form.section,
    paraNumber: form.section === 'SABAQ' ? (v.derived?.para ?? null) : v.portion.paraNumber,
    range,
    totalLines: form.section === 'SABAQ' ? v.portion.totalLines : null,
    assigned,
  };
}

/** Every issue of one homework portion (the F05 portion rules, no attempt), in field order (F08-AC1, AC12). */
export function homeworkIssues(form: PortionForm, portionNumber: number, index: ReferenceIndex | null): FormIssue[] {
  const v = portionValues(form, portionNumber, index);
  const ref: RangeReference | null = index && index.surahs.length ? { surahs: index.surahs, paras: index.paras, metadataWithdrawn: index.metadataWithdrawn } : null;
  const base = { portionKey: form.key, section: form.section, portionNumber };
  const out: FormIssue[] = [];
  const seen = new Set<string>();
  for (const b of v.badText.filter((x) => x.field !== 'completed' && x.field !== 'completedAmount')) {
    const u = uiIssue(form.section, form.unit, { field: b.field, code: b.code });
    out.push({ ...base, ...u });
    seen.add(u.field);
  }
  const domain = validatePortionFields(v.portion, ref);
  const unitMissing = domain.some((d) => d.field === 'unit' && d.code === 'REQUIRED');
  for (const d of domain) {
    if (unitMissing && d.field === 'assigned' && d.code === 'REQUIRED') continue;
    const u = uiIssue(form.section, form.unit, d);
    if (seen.has(u.field)) continue;
    out.push({ ...base, ...u });
    seen.add(u.field);
  }
  return out;
}

/** One portion of the editor: its fields, and the stored portion it started from (null: added by the Teacher). */
export interface EditorPortion {
  form: PortionForm;
  base: LocalHomeworkPortion | null;
}

/**
 * A portion the Teacher adds in the editor. The entry and its form share ONE key: `homeworkIssues` tags each issue with
 * the form's key and the editor shows (and clears) them by the entry's key, so they must match (review M2).
 */
export function newEditorEntry(key: string, section: Section): EditorPortion & { key: string } {
  return { key, form: newPortion(key, section), base: null };
}

const sameQuantity =(a: Quantity | null, b: Quantity | null): boolean =>
  a === b || (a !== null && b !== null && a.unit === b.unit && a.numerator * b.denominator === b.numerator * a.denominator);

/**
 * The stored portion for an editor entry. An untouched suggestion keeps the server-derived values exactly; a changed one
 * becomes TEACHER_EDITED (domain originAfterEdit, F08-AC8) and no longer needs review; an added one is TEACHER_ADDED.
 */
export function toHomeworkPortion(entry: EditorPortion, position: number, index: ReferenceIndex | null, newId: () => string): LocalHomeworkPortion {
  const v = homeworkValues(entry.form, position, index);
  const b = entry.base;
  if (!b) {
    return {
      id: newId(),
      section: v.section,
      position,
      paraNumber: v.paraNumber,
      range: v.range,
      totalLines: v.totalLines,
      lineCountEdition: null,
      assigned: v.assigned,
      needsReview: false,
      origin: 'TEACHER_ADDED',
      sourceAttemptId: null,
      sourceLessonPortionId: null,
      sourceHomeworkPortionId: null,
      instructions: null,
      removed: false,
      sourceReportDate: null,
      why: null,
    };
  }
  const sabaq = b.section === 'SABAQ';
  const changed: Partial<Pick<HomeworkPortion, 'assigned' | 'range' | 'paraNumber' | 'totalLines'>> = {};
  if (!sameQuantity(v.assigned, b.assigned)) changed.assigned = v.assigned;
  if (sabaq && JSON.stringify(v.range) !== JSON.stringify(b.range)) changed.range = v.range;
  if (sabaq && v.totalLines !== b.totalLines) changed.totalLines = v.totalLines;
  if (!sabaq && v.paraNumber !== b.paraNumber) changed.paraNumber = v.paraNumber;
  const origin = originAfterEdit(b, changed);
  if (Object.keys(changed).length === 0) return { ...b, position, removed: false };
  return {
    ...b,
    position,
    paraNumber: sabaq ? b.paraNumber : v.paraNumber,
    range: sabaq ? v.range : b.range,
    totalLines: sabaq ? v.totalLines : null,
    assigned: v.assigned,
    needsReview: false,
    origin,
    removed: false,
  };
}

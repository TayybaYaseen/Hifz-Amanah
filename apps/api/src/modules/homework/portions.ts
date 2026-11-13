// A homework portion the Teacher (or an Owner/Admin revising) entered: TEACHER_EDITED or TEACHER_ADDED (F08-AC1, AC8,
// AC15). Checked with the F05 portion rules (units by section, Sabaq range in one Surah, LINES ≤ Total Lines, Para
// 1–30), and the Sabaq Para derived from the range on the server (FR-SAB-001), never taken from the client.
import { HOMEWORK_INSTRUCTIONS_MAX, type AyahRangeValue, type QuantityValue, type Section } from '@hifz/contracts';
import { deriveSabaqPara, type RangeReference } from '@hifz/domain/hifz';
import { portionIssues, type HomeworkPortion, type PortionOrigin } from '@hifz/domain/homework';
import type { Tx } from '../../platform/db.ts';
import { canonical } from '../hifz/shared.ts';
import type { QuranMetadataService } from '../quran-ref/metadata-service.ts';
import { cleanInstructions } from './shared.ts';

export interface TeacherPortionInput {
  id: string;
  section: Section;
  position: number;
  paraNumber: number | null;
  range: AyahRangeValue | null;
  totalLines: number | null;
  assigned: QuantityValue | null;
  instructions: string | null;
}

/** Where an edited portion came from: its source attempt and lesson portion, or the portion a revision replaces. */
export interface PortionSource {
  attemptId: string | null;
  lessonPortionId: string | null;
  homeworkPortionId: string | null;
  section: Section;
  lineCountEdition: string | null;
}

/** Returns the portion, or its field issues as [field, code] pairs. */
export async function teacherPortion(
  tx: Tx,
  quran: QuranMetadataService,
  organizationId: string,
  p: TeacherPortionInput,
  origin: Exclude<PortionOrigin, 'SUGGESTED'>,
  ref: RangeReference | null,
  source: PortionSource | null,
): Promise<{ issues: [string, string][] } | { portion: HomeworkPortion }> {
  const issues: [string, string][] = [];
  const instructions = cleanInstructions(p.instructions);
  if (instructions !== null && instructions.length > HOMEWORK_INSTRUCTIONS_MAX) issues.push(['instructions', 'TOO_LONG']);
  if (source && source.section !== p.section) return { issues: [['section', 'INVALID']] };
  const sabaq = p.section === 'SABAQ';
  if (sabaq && ref === null) return { issues: [['range', 'METADATA_UNAVAILABLE']] };
  if (p.assigned === null) issues.push(['assigned', 'REQUIRED']);
  for (const e of portionIssues({ section: p.section, position: p.position, paraNumber: sabaq ? null : p.paraNumber, range: p.range, totalLines: p.totalLines, assigned: p.assigned }, ref)) {
    issues.push([e.field, e.code]);
  }
  if (issues.length) return { issues };
  let paraNumber = p.paraNumber;
  let lineCountEdition: string | null = null;
  if (sabaq && p.range) {
    paraNumber = deriveSabaqPara(p.range, ref as RangeReference);
    if (paraNumber === null) return { issues: [['range', 'PARA_UNKNOWN']] };
    lineCountEdition = source?.lineCountEdition ?? (await quran.countLinesFor(tx, organizationId, { surah: p.range.surahStart, ayahStart: p.range.ayahStart, ayahEnd: p.range.ayahEnd })).edition;
  }
  return {
    portion: {
      id: p.id,
      section: p.section,
      position: p.position,
      paraNumber,
      range: p.range ? { surahStart: p.range.surahStart, ayahStart: p.range.ayahStart, surahEnd: p.range.surahEnd, ayahEnd: p.range.ayahEnd } : null,
      totalLines: sabaq ? p.totalLines : null,
      lineCountEdition,
      assigned: p.assigned ? canonical(p.assigned) : null,
      needsReview: false,
      origin,
      sourceAttemptId: source?.attemptId ?? null,
      sourceLessonPortionId: source?.lessonPortionId ?? null,
      sourceHomeworkPortionId: source?.homeworkPortionId ?? null,
      instructions,
      removed: false,
    },
  };
}

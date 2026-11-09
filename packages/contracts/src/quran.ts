// Quran reference contracts shared by the API and the app (F06; FR-SAB-005…008, FR-I18N-006, BR-15; DEC-B31, B32,
// B70). Organization and role always come from the signed-in membership: every request schema is strict.
//
// Owner/Admin edit Surahs and Para boundaries (audited); Teachers read them (F06-AC2). There is no line-layout editor:
// page/line data comes only from an approved import. No route deletes anything.
import { z } from 'zod';

export const METADATA_SOURCES = ['SEED', 'ADMIN'] as const;
export type MetadataSource = (typeof METADATA_SOURCES)[number];

/** LAYOUT: counted from the edition's verified layout. UNAVAILABLE: no layout data covers the range (enter by hand). */
export const LINE_COUNT_SOURCES = ['LAYOUT', 'UNAVAILABLE'] as const;
export type LineCountLookupSource = (typeof LINE_COUNT_SOURCES)[number];

const surahNumber = z.coerce.number().int().min(1).max(114);
const paraNumber = z.coerce.number().int().min(1).max(30);
const ayah = z.number().int().min(1).max(999);
const ref = z.strictObject({ surah: z.number().int().min(1).max(114), ayah });
/** null on create; the row's current version on edit (409 CONFLICT_STALE when another edit came first). */
const rowVersion = z.number().int().min(1).nullable();

export const SurahParam = z.strictObject({ number: surahNumber });
export const ParaParam = z.strictObject({ number: paraNumber });

/** The Arabic name is stored byte-for-byte as sent: no trim, no normalization (F06-AC3). */
export const SaveSurahRequest = z.strictObject({
  nameAr: z.string().max(400),
  nameTranslit: z.string().max(400),
  ayahCount: z.number().int(),
  rowVersion,
});
export type SaveSurahRequest = z.infer<typeof SaveSurahRequest>;

export const SaveParaRequest = z.strictObject({ start: ref, end: ref, rowVersion });
export type SaveParaRequest = z.infer<typeof SaveParaRequest>;

export const LineCountQuery = z.strictObject({
  surah: surahNumber,
  ayahStart: z.coerce.number().int().min(1).max(999),
  ayahEnd: z.coerce.number().int().min(1).max(999),
});
export type LineCountQuery = z.infer<typeof LineCountQuery>;

export interface MushafEditionView {
  code: string;
  name: string;
  linesPerPage: number;
  /** Null until the exact publisher is approved (DEFERRED: DEC-B70). */
  publisher: string | null;
  /** The exact printing, once identified on a physical Mushaf (DEC-B71; null until then). */
  printingId: string | null;
  pageCount: number | null;
  verification: 'UNVERIFIED' | 'VERIFIED';
  /** A page/line layout has been imported for this madrasa. */
  hasLayout: boolean;
  /**
   * The madrasa's active layout is a production import with an approving review signed by the named reviewer, its
   * physical-verification evidence on file, and every source still licensed (FR-SAB-013, F06-AC20; DEC-B78, DEC-B79).
   * False for test data (signed or not), unsigned imports, and withdrawn layouts. It records the human reviewer's
   * sign-off; it is not an automated proof that the layout matches the printed Mushaf. Not the same as
   * `verification`, the edition's own catalogue status (DEC-B71).
   */
  layoutVerified: boolean;
  /**
   * The active layout's source licence (or the publisher's clearance) was withdrawn: it is no longer distributed or
   * used for Total Lines, and is not presented as approved (DEC-B79, plan P2). The data is kept for audit.
   */
  layoutWithdrawn: boolean;
}

export interface EditionsResponse {
  /** The edition this madrasa counts lines on. */
  active: string;
  editions: MushafEditionView[];
}

export interface SurahView {
  id: string;
  number: number;
  nameAr: string;
  nameTranslit: string;
  ayahCount: number;
  source: MetadataSource;
  rowVersion: number;
  updatedAt: string;
}

export interface ParaView {
  id: string;
  number: number;
  start: { surah: number; ayah: number };
  end: { surah: number; ayah: number };
  source: MetadataSource;
  rowVersion: number;
  updatedAt: string;
}

/** `empty` drives "No Quran reference data yet — ask your Admin" (F06 edge case). */
export interface SurahListResponse {
  items: SurahView[];
  empty: boolean;
}

export interface ParaListResponse {
  items: ParaView[];
  empty: boolean;
}

/** After an edit: how many stored records now need review (F06-AC19). The records themselves are unchanged. */
export interface SaveSurahResponse {
  surah: SurahView;
  recordsNeedingReview: number;
}

export interface SaveParaResponse {
  para: ParaView;
  recordsNeedingReview: number;
}

export type MetadataFindingView =
  | { code: 'MISSING_SURAHS' | 'MISSING_PARAS'; numbers: number[] }
  | { code: 'PARA_INVALID'; para: number; issues: { field: string; code: string; max?: number }[] }
  | { code: 'PARA_OVERLAP' | 'PARA_GAP'; para: number; next: number }
  | { code: 'LAYOUT_MISSING'; edition: string };

/** A stored record whose Quran range no longer fits the metadata. Listed for review; never changed. */
export interface ReviewRecordView {
  kind: string;
  id: string;
  range: { surah: number; ayahStart: number; ayahEnd: number };
  issues: { field: string; code: string; max?: number }[];
}

export interface ReviewResponse {
  findings: MetadataFindingView[];
  records: ReviewRecordView[];
}

export interface LineCountResponse {
  edition: string;
  /** Pre-fill for Total Lines, or null: the Teacher enters it (FR-SAB-008). Never a guess. */
  totalLines: number | null;
  source: LineCountLookupSource;
  layoutImportId: string | null;
  /** Derived from the range start and the Para boundaries, or null when no boundary covers it (FR-SAB-001). */
  para: number | null;
  /** Range field errors (e.g. ayahEnd OUT_OF_RANGE with max), so the app can show them before saving. */
  issues: { field: string; code: string; max?: number }[];
}

export interface QuranImportView {
  id: string;
  kind: 'METADATA' | 'LAYOUT';
  edition: string | null;
  datasetKey: string;
  datasetVersion: string;
  sourceName: string;
  sourceUrl: string | null;
  licence: string;
  reviewedBy: string | null;
  approvedOn: string | null;
  synthetic: boolean;
  checksum: string;
  counts: Record<string, number>;
  appliedAt: string;
  active: boolean;
  /** 1 or 2 (ADR-017 §6.1). Production imports are format 2. */
  seedFormatVersion: 1 | 2;
  /** The reviewer's approving decision from the signed validation report; null for test data without one. */
  reviewDecision: 'APPROVED' | 'APPROVED_WITH_FINDINGS' | null;
  validationReportSha256: string | null;
  /** The physical Mushaf printing the reviewer compared against (DEC-B78); null for test data without one. */
  mushafPrinting: string | null;
  /** Where the paper sign-off (or its documented digital equivalent) is held (DEC-B78). */
  signOffRef: string | null;
  /** The signed validation report itself is stored with the import, its hash checked at import (DEC-B78). */
  validationReportStored: boolean;
  /** The registered source files this import was built from, with each one's current licence status (FR-SAB-011). */
  sources: QuranImportSourceView[];
}

export interface QuranImportSourceView {
  provider: string;
  resourceId: string | null;
  resourceName: string;
  fileSha256: string;
  role: 'METADATA' | 'LAYOUT' | 'WORDS';
  licenceStatus: 'LICENSE_REVIEW_REQUIRED' | 'OPEN_LICENCE_VERIFIED' | 'PERMISSION_GRANTED' | 'REFUSED';
}

export interface ImportListResponse {
  items: QuranImportView[];
}

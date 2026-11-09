// Quran metadata: reads for staff, audited edits by Owner/Admin, the review list, and the Total Lines lookup
// (F06; US-024…026; FR-SAB-001, FR-SAB-005…008; F06-AC1…AC4, AC19; DEC-B32, DEC-B70). The service exposes
// `paraFor` and `countLines` to other modules (ARCHITECTURE.md §5): F05 uses them for Sabaq.
//
// An edit never rewrites a stored record: records whose range no longer fits are listed for review (F06-AC19).
// Arabic names are stored byte-for-byte as sent (F06-AC3).
import { v7 as uuidv7 } from 'uuid';
import type {
  EditionsResponse,
  ImportListResponse,
  LineCountQuery,
  LineCountResponse,
  ParaListResponse,
  ParaView,
  ReviewRecordView,
  ReviewResponse,
  SaveParaRequest,
  SaveParaResponse,
  SaveSurahRequest,
  SaveSurahResponse,
  SurahListResponse,
  SurahView,
} from '@hifz/contracts';
import {
  countLines,
  metadataFindings,
  paraFor,
  validateAyahRange,
  validateParaBoundary,
  validateSurah,
  type AyahRange,
  type LayoutRow,
  type MetadataFinding,
  type ParaBoundary,
  type SurahMeta,
} from '@hifz/domain/quran-ref';
import type { Clock } from '../../platform/clock.ts';
import type { Db, Executor, Tx } from '../../platform/db.ts';
import { AppError } from '../../platform/errors.ts';
import { withTenant } from '../../platform/tenant.ts';
import { recordAudit } from '../audit/audit.ts';
import type { Actor } from '../identity/auth-service.ts';
import { requireRole } from '../roster/shared.ts';

/**
 * Stored records that carry a Quran range, for the review list (F06-AC19). F05 (Sabaq portions) and F08 (homework)
 * register theirs; until then no record holds a range, so the list has only metadata findings.
 */
export type RangeRecordSource = (db: Executor, organizationId: string) => Promise<{ kind: string; id: string; range: AyahRange }[]>;

export const noRangeRecordsYet: RangeRecordSource = async () => [];

type SurahRow = { id: string; number: number; name_ar: string; name_translit: string; ayah_count: number; source: 'SEED' | 'ADMIN'; row_version: string; updated_at: Date };
type ParaRow = { id: string; number: number; start_surah: number; start_ayah: number; end_surah: number; end_ayah: number; source: 'SEED' | 'ADMIN'; row_version: string; updated_at: Date };

const SURAH_COLUMNS = ['id', 'number', 'name_ar', 'name_translit', 'ayah_count', 'source', 'row_version', 'updated_at'] as const;
const PARA_COLUMNS = ['id', 'number', 'start_surah', 'start_ayah', 'end_surah', 'end_ayah', 'source', 'row_version', 'updated_at'] as const;

const surahView = (r: SurahRow): SurahView => ({
  id: r.id,
  number: r.number,
  nameAr: r.name_ar,
  nameTranslit: r.name_translit,
  ayahCount: r.ayah_count,
  source: r.source,
  rowVersion: Number(r.row_version),
  updatedAt: r.updated_at.toISOString(),
});

const paraBoundary = (r: Pick<ParaRow, 'number' | 'start_surah' | 'start_ayah' | 'end_surah' | 'end_ayah'>): ParaBoundary => ({
  number: r.number,
  start: { surah: r.start_surah, ayah: r.start_ayah },
  end: { surah: r.end_surah, ayah: r.end_ayah },
});

const paraView = (r: ParaRow): ParaView => ({ id: r.id, ...paraBoundary(r), source: r.source, rowVersion: Number(r.row_version), updatedAt: r.updated_at.toISOString() });

/** Field issues → the error's `fields` map; `max` travels as `<field>.max` so the app can name the limit (F06-AC6). */
function validation(issues: readonly { field: string; code: string; max?: number }[]): AppError {
  const fields: Record<string, string> = {};
  for (const i of issues) {
    fields[i.field] ??= i.code;
    if (i.max !== undefined) fields[`${i.field}.max`] = String(i.max);
  }
  return new AppError('VALIDATION', fields);
}

export class QuranMetadataService {
  private readonly db: Db;
  private readonly clock: Clock;
  private readonly rangeRecords: RangeRecordSource;

  constructor(db: Db, clock: Clock, rangeRecords: RangeRecordSource = noRangeRecordsYet) {
    this.db = db;
    this.clock = clock;
    this.rangeRecords = rangeRecords;
  }

  // ---------- Loaders other modules use inside their own tenant transaction ----------

  async surahMeta(db: Executor, organizationId: string): Promise<SurahMeta[]> {
    const rows = await db.selectFrom('quran_surahs').select(['number', 'ayah_count']).where('organization_id', '=', organizationId).orderBy('number').execute();
    return rows.map((r) => ({ number: r.number, ayahCount: r.ayah_count }));
  }

  async paraBoundaries(db: Executor, organizationId: string): Promise<ParaBoundary[]> {
    const rows = await db.selectFrom('quran_paras').select(['number', 'start_surah', 'start_ayah', 'end_surah', 'end_ayah']).where('organization_id', '=', organizationId).orderBy('number').execute();
    return rows.map(paraBoundary);
  }

  /** The madrasa's edition and its active verified layout import, if any. */
  async activeLayout(db: Executor, organizationId: string): Promise<{ edition: string; importId: string | null }> {
    const org = await db.selectFrom('organizations').select('mushaf_edition').where('id', '=', organizationId).executeTakeFirstOrThrow();
    const layout = await db.selectFrom('mushaf_layouts').select('import_id').where('organization_id', '=', organizationId).where('edition', '=', org.mushaf_edition).executeTakeFirst();
    return { edition: org.mushaf_edition, importId: layout?.import_id ?? null };
  }

  /** Lines a single-Surah range covers on the madrasa's verified layout, or null (enter by hand; FR-SAB-008). */
  async countLinesFor(db: Executor, organizationId: string, range: AyahRange): Promise<{ edition: string; totalLines: number | null; importId: string | null }> {
    const { edition, importId } = await this.activeLayout(db, organizationId);
    if (!importId) return { edition, totalLines: null, importId: null };
    // Ayat lines only: Surah-heading and Bismillah lines never count (FR-SAB-012; DEC-B77).
    const rows = await db
      .selectFrom('mushaf_layout_lines')
      .select(['page', 'line', 'surah', 'line_type', 'ayah_start', 'ayah_end'])
      .where('organization_id', '=', organizationId)
      .where('import_id', '=', importId)
      .where('line_type', '=', 'AYAH')
      .where('surah', '=', range.surah)
      .where('ayah_end', '>=', range.ayahStart)
      .where('ayah_start', '<=', range.ayahEnd)
      .execute();
    const lines: LayoutRow[] = rows.map((r) => ({ page: r.page, line: r.line, surah: r.surah, lineType: r.line_type, ayahStart: r.ayah_start, ayahEnd: r.ayah_end }));
    return { edition, totalLines: countLines(range, lines), importId };
  }

  // ---------- Reads (Owner, Admin, Teacher: `quran.view`) ----------

  async editions(actor: Actor): Promise<EditionsResponse> {
    requireRole(actor, 'quran.view');
    return withTenant(this.db, actor.organizationId, async (tx) => {
      const { edition } = await this.activeLayout(tx, actor.organizationId);
      const rows = await tx.selectFrom('mushaf_editions').select(['code', 'name', 'lines_per_page', 'publisher', 'printing_id', 'page_count', 'verification']).orderBy('code').execute();
      const active = await tx
        .selectFrom('mushaf_layouts as m')
        .innerJoin('quran_imports as i', (j) => j.onRef('i.id', '=', 'm.import_id').onRef('i.organization_id', '=', 'm.organization_id'))
        .select(['m.edition', 'i.synthetic', 'i.review_decision', 'i.validation_report_sha256'])
        .where('m.organization_id', '=', actor.organizationId)
        .execute();
      const layouts = new Set(active.map((r) => r.edition));
      // Verified for this madrasa only when its active layout is a production import with an approving, signed review
      // (FR-SAB-013; F06-AC20). Test data and unsigned imports never count.
      const verified = new Set(active.filter((r) => !r.synthetic && r.review_decision !== null && r.validation_report_sha256 !== null).map((r) => r.edition));
      return {
        active: edition,
        editions: rows.map((r) => ({
          code: r.code,
          name: r.name,
          linesPerPage: r.lines_per_page,
          publisher: r.publisher,
          printingId: r.printing_id,
          pageCount: r.page_count,
          verification: r.verification,
          hasLayout: layouts.has(r.code),
          layoutVerified: verified.has(r.code),
        })),
      };
    });
  }

  async surahs(actor: Actor): Promise<SurahListResponse> {
    requireRole(actor, 'quran.view');
    return withTenant(this.db, actor.organizationId, async (tx) => {
      const rows = await tx.selectFrom('quran_surahs').select(SURAH_COLUMNS).where('organization_id', '=', actor.organizationId).orderBy('number').execute();
      return { items: rows.map(surahView), empty: rows.length === 0 };
    });
  }

  async paras(actor: Actor): Promise<ParaListResponse> {
    requireRole(actor, 'quran.view');
    return withTenant(this.db, actor.organizationId, async (tx) => {
      const rows = await tx.selectFrom('quran_paras').select(PARA_COLUMNS).where('organization_id', '=', actor.organizationId).orderBy('number').execute();
      return { items: rows.map(paraView), empty: rows.length === 0 };
    });
  }

  /** Total Lines pre-fill, derived Para, and range errors for a Sabaq range (FR-SAB-001, FR-SAB-008, F06-AC6). */
  async lineCount(actor: Actor, query: LineCountQuery): Promise<LineCountResponse> {
    requireRole(actor, 'quran.view');
    return withTenant(this.db, actor.organizationId, async (tx) => {
      const range = { surah: query.surah, ayahStart: query.ayahStart, ayahEnd: query.ayahEnd };
      const surahs = await this.surahMeta(tx, actor.organizationId);
      const issues = validateAyahRange(range, surahs);
      const { edition, importId } = await this.activeLayout(tx, actor.organizationId);
      if (issues.length) return { edition, totalLines: null, source: 'UNAVAILABLE', layoutImportId: importId, para: null, issues };
      const counted = await this.countLinesFor(tx, actor.organizationId, range);
      const para = paraFor({ surah: range.surah, ayah: range.ayahStart }, await this.paraBoundaries(tx, actor.organizationId));
      return {
        edition,
        totalLines: counted.totalLines,
        source: counted.totalLines === null ? 'UNAVAILABLE' : 'LAYOUT',
        layoutImportId: counted.importId,
        para,
        issues: [],
      };
    });
  }

  // ---------- Admin (Owner, Admin: `quran.manage`) ----------

  /** Add or edit a Surah (F06-AC1, AC3). Audited with before/after values in the same transaction. */
  async saveSurah(actor: Actor, number: number, input: SaveSurahRequest): Promise<SaveSurahResponse> {
    requireRole(actor, 'quran.manage');
    const record = { number, nameAr: input.nameAr, nameTranslit: input.nameTranslit, ayahCount: input.ayahCount };
    const issues = validateSurah(record);
    if (issues.length) throw validation(issues);
    const now = this.clock.now();
    return withTenant(this.db, actor.organizationId, async (tx) => {
      const before = await tx.selectFrom('quran_surahs').select(SURAH_COLUMNS).where('organization_id', '=', actor.organizationId).where('number', '=', number).forUpdate().executeTakeFirst();
      this.checkVersion(before ? Number(before.row_version) : null, input.rowVersion);
      const values = { name_ar: input.nameAr, name_translit: input.nameTranslit, ayah_count: input.ayahCount, source: 'ADMIN' as const, updated_at: now, updated_by: actor.userId };
      let id: string;
      if (!before) {
        id = uuidv7();
        await tx.insertInto('quran_surahs').values({ id, organization_id: actor.organizationId, number, import_id: null, ...values }).execute();
      } else {
        id = before.id;
        await tx
          .updateTable('quran_surahs')
          .set({ ...values, row_version: Number(before.row_version) + 1 })
          .where('organization_id', '=', actor.organizationId)
          .where('id', '=', id)
          .execute();
      }
      await recordAudit(tx, {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        action: before ? 'QURAN_SURAH_UPDATED' : 'QURAN_SURAH_CREATED',
        targetType: 'QURAN_SURAH',
        targetId: id,
        summary: {
          surah: number,
          before: before ? { nameAr: before.name_ar, nameTranslit: before.name_translit, ayahCount: before.ayah_count, source: before.source } : null,
          after: { nameAr: input.nameAr, nameTranslit: input.nameTranslit, ayahCount: input.ayahCount },
        },
        at: now,
      });
      const row = await tx.selectFrom('quran_surahs').select(SURAH_COLUMNS).where('organization_id', '=', actor.organizationId).where('id', '=', id).executeTakeFirstOrThrow();
      return { surah: surahView(row), recordsNeedingReview: (await this.reviewRecords(tx, actor.organizationId)).length };
    });
  }

  /** Add or correct a Para boundary (F06-AC1, AC4, AC19). Records keep their stored ranges. */
  async savePara(actor: Actor, number: number, input: SaveParaRequest): Promise<SaveParaResponse> {
    requireRole(actor, 'quran.manage');
    const now = this.clock.now();
    return withTenant(this.db, actor.organizationId, async (tx) => {
      const surahs = await this.surahMeta(tx, actor.organizationId);
      const issues = validateParaBoundary({ number, start: input.start, end: input.end }, surahs);
      if (issues.length) throw validation(issues);
      const before = await tx.selectFrom('quran_paras').select(PARA_COLUMNS).where('organization_id', '=', actor.organizationId).where('number', '=', number).forUpdate().executeTakeFirst();
      this.checkVersion(before ? Number(before.row_version) : null, input.rowVersion);
      const values = {
        start_surah: input.start.surah,
        start_ayah: input.start.ayah,
        end_surah: input.end.surah,
        end_ayah: input.end.ayah,
        source: 'ADMIN' as const,
        updated_at: now,
        updated_by: actor.userId,
      };
      let id: string;
      if (!before) {
        id = uuidv7();
        await tx.insertInto('quran_paras').values({ id, organization_id: actor.organizationId, number, import_id: null, ...values }).execute();
      } else {
        id = before.id;
        await tx
          .updateTable('quran_paras')
          .set({ ...values, row_version: Number(before.row_version) + 1 })
          .where('organization_id', '=', actor.organizationId)
          .where('id', '=', id)
          .execute();
      }
      await recordAudit(tx, {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        action: before ? 'QURAN_PARA_UPDATED' : 'QURAN_PARA_CREATED',
        targetType: 'QURAN_PARA',
        targetId: id,
        summary: { para: number, before: before ? { ...paraBoundary(before), source: before.source } : null, after: { start: input.start, end: input.end } },
        at: now,
      });
      const row = await tx.selectFrom('quran_paras').select(PARA_COLUMNS).where('organization_id', '=', actor.organizationId).where('id', '=', id).executeTakeFirstOrThrow();
      return { para: paraView(row), recordsNeedingReview: (await this.reviewRecords(tx, actor.organizationId)).length };
    });
  }

  /** What an Admin should review: metadata gaps and inconsistencies, and records whose range no longer fits. */
  async review(actor: Actor): Promise<ReviewResponse> {
    requireRole(actor, 'quran.manage');
    return withTenant(this.db, actor.organizationId, async (tx) => {
      const surahs = await this.surahMeta(tx, actor.organizationId);
      const findings: MetadataFinding[] = metadataFindings(surahs, await this.paraBoundaries(tx, actor.organizationId));
      const { edition, importId } = await this.activeLayout(tx, actor.organizationId);
      if (!importId) findings.push({ code: 'LAYOUT_MISSING', edition });
      return { findings, records: await this.reviewRecords(tx, actor.organizationId, surahs) };
    });
  }

  /** Provenance of every dataset applied to this madrasa. */
  async imports(actor: Actor): Promise<ImportListResponse> {
    requireRole(actor, 'quran.manage');
    return withTenant(this.db, actor.organizationId, async (tx) => {
      const active = new Set((await tx.selectFrom('mushaf_layouts').select('import_id').where('organization_id', '=', actor.organizationId).execute()).map((r) => r.import_id));
      const rows = await tx.selectFrom('quran_imports').selectAll().where('organization_id', '=', actor.organizationId).orderBy('applied_at', 'desc').orderBy('id', 'desc').execute();
      // The source files behind each import, with each source's current licence status (FR-SAB-011).
      const links = await tx
        .selectFrom('quran_import_sources as l')
        .innerJoin('quran_sources as s', 's.id', 'l.source_id')
        .select(['l.import_id', 'l.role', 's.id', 's.provider', 's.resource_id', 's.resource_name', 's.file_sha256'])
        .where('l.organization_id', '=', actor.organizationId)
        .execute();
      const sourceIds = [...new Set(links.map((l) => l.id))];
      const licences = sourceIds.length
        ? await tx.selectFrom('quran_source_licences').select(['source_id', 'status']).where('source_id', 'in', sourceIds).orderBy('recorded_at', 'desc').orderBy('id', 'desc').execute()
        : [];
      const currentStatus = (id: string) => licences.find((l) => l.source_id === id)?.status ?? 'LICENSE_REVIEW_REQUIRED';
      return {
        items: rows.map((r) => ({
          id: r.id,
          kind: r.kind,
          edition: r.edition,
          datasetKey: r.dataset_key,
          datasetVersion: r.dataset_version,
          sourceName: r.source_name,
          sourceUrl: r.source_url,
          licence: r.licence,
          reviewedBy: r.reviewed_by,
          approvedOn: r.approved_on,
          synthetic: r.synthetic,
          checksum: r.checksum,
          counts: r.counts,
          appliedAt: r.applied_at.toISOString(),
          seedFormatVersion: r.seed_format_version,
          reviewDecision: r.review_decision,
          validationReportSha256: r.validation_report_sha256,
          sources: links
            .filter((l) => l.import_id === r.id)
            .map((l) => ({
              provider: l.provider,
              resourceId: l.resource_id,
              resourceName: l.resource_name,
              fileSha256: l.file_sha256,
              role: l.role,
              licenceStatus: currentStatus(l.id),
            })),
          // Metadata imports are always in effect (row by row); a layout import only while it is the active one.
          active: r.kind === 'METADATA' || active.has(r.id),
        })),
      };
    });
  }

  private async reviewRecords(tx: Tx, organizationId: string, surahs?: SurahMeta[]): Promise<ReviewRecordView[]> {
    const meta = surahs ?? (await this.surahMeta(tx, organizationId));
    const out: ReviewRecordView[] = [];
    for (const r of await this.rangeRecords(tx, organizationId)) {
      const issues = validateAyahRange(r.range, meta);
      if (issues.length) out.push({ kind: r.kind, id: r.id, range: r.range, issues });
    }
    return out;
  }

  /** Optimistic concurrency: a create sends null, an edit sends the version it read. */
  private checkVersion(current: number | null, sent: number | null): void {
    if (current !== sent) throw new AppError('CONFLICT_STALE');
  }
}

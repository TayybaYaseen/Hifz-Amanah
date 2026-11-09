// The versioned, repeatable Quran seed loader (F06; FR-SAB-007, FR-SAB-008; DEC-B31, DEC-B70).
//
// THERE IS NO PRODUCTION SEED YET (DEFERRED: DEC-B31). The loader only applies a seed file it is given:
// - in production, the file named by QURAN_SEED_FILE, which must stay unset until a dataset's accuracy and licence are
//   approved and a reviewer is named; the file must then carry that reviewer and approval date;
// - in tests, synthetic fixtures, which the loader refuses whenever NODE_ENV is not `test`.
// Nothing here invents, derives, or "fixes" Quran data. A seed with any issue is refused whole (no partial import).
//
// Repeatable: each (madrasa, kind, dataset, version[, edition]) is applied once; applying it again is a no-op, and the
// same version with different content is refused. A newer metadata version updates rows still as seeded but never an
// Admin's edit (those are reported as kept). A newer layout is a new import beside the old one; the active pointer
// moves, old lines stay. Stored line counts on records are never recalculated (FR-SAB-008).
//
// Format 2 (ADR-017, DEC-B72): typed lines (Ayat, Surah heading, Bismillah) with word positions, the registered source
// files the seed was built from, and the reviewer's signed validation report. Every cited source must be registered
// (`npm run quran:source`) with a cleared licence, and a layout source also needs the printed edition's publisher
// clearance (FR-SAB-011; Taj Company for the Taj layout, DEC-B71). Production seeds must be format 2 (FR-SAB-013).
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { v7 as uuidv7 } from 'uuid';
import { z } from 'zod';
import {
  APPROVING_DECISIONS,
  LINE_TYPES,
  REVIEW_DECISIONS,
  SOURCE_ROLES,
  canonicalJson,
  normalizedLines,
  sourceLicenceIssue,
  validateSeed,
  type QuranSeed,
  type QuranSeedV2,
  type SeedIssue,
  type SeedSurah,
  type SourceRole,
} from '@hifz/domain/quran-ref';
import type { Clock } from '../../platform/clock.ts';
import type { Db, Tx } from '../../platform/db.ts';
import { withTenant } from '../../platform/tenant.ts';
import { recordAudit } from '../audit/audit.ts';

/** The file shape. Value checks (ranges, completeness, provenance) are validateSeed's; this checks the structure. */
const ref = z.strictObject({ surah: z.number(), ayah: z.number() });
const optNum = z.number().nullable().optional();
const surahV1 = z.strictObject({ number: z.number(), nameAr: z.string(), nameTranslit: z.string(), ayahCount: z.number() });
const surahV2 = surahV1.extend({
  revelationPlace: z.enum(['MAKKI', 'MADANI']).nullable().optional(),
  revelationOrder: optNum,
  bismillahPre: z.boolean().nullable().optional(),
});
const envelope = {
  format: z.literal('hifz-quran-seed'),
  datasetKey: z.string(),
  datasetVersion: z.string(),
  provenance: z.strictObject({
    sourceName: z.string(),
    sourceUrl: z.string().max(500).nullable(),
    licence: z.string().max(200),
    reviewedBy: z.string().max(200).nullable(),
    approvedOn: z.string().nullable(),
    synthetic: z.boolean(),
  }),
};
const paras = z.array(z.strictObject({ number: z.number(), start: ref, end: ref })).max(60);
const SeedV1Schema = z.strictObject({
  ...envelope,
  formatVersion: z.literal(1),
  metadata: z.strictObject({ surahs: z.array(surahV1).max(200), paras }).nullable(),
  layouts: z
    .array(
      z.strictObject({
        edition: z.string(),
        linesPerPage: z.number(),
        lines: z.array(z.strictObject({ page: z.number(), line: z.number(), surah: z.number(), ayahStart: z.number(), ayahEnd: z.number() })).max(50_000),
      }),
    )
    .max(10),
});
const SeedV2Schema = z.strictObject({
  ...envelope,
  formatVersion: z.literal(2),
  sources: z
    .array(z.strictObject({ provider: z.string().max(40), resourceId: z.string().max(100).nullable(), fileSha256: z.string().max(64), role: z.enum(SOURCE_ROLES) }))
    .max(50),
  validationReport: z
    .strictObject({ sha256: z.string().max(64), decision: z.enum(REVIEW_DECISIONS), signedBy: z.string().max(200).nullable(), signedOn: z.string().max(10).nullable() })
    .nullable(),
  metadata: z.strictObject({ surahs: z.array(surahV2).max(200), paras }).nullable(),
  layouts: z
    .array(
      z.strictObject({
        edition: z.string(),
        linesPerPage: z.number(),
        lines: z
          .array(
            z.strictObject({
              page: z.number(),
              line: z.number(),
              lineType: z.enum(LINE_TYPES),
              isCentered: z.boolean().nullable().optional(),
              surah: z.number(),
              ayahStart: optNum,
              wordStart: optNum,
              ayahEnd: optNum,
              wordEnd: optNum,
              srcFirstWordId: optNum,
              srcLastWordId: optNum,
            }),
          )
          .max(50_000),
      }),
    )
    .max(10),
});
export const SeedFileSchema = z.discriminatedUnion('formatVersion', [SeedV1Schema, SeedV2Schema]);

export class SeedRejectedError extends Error {
  readonly issues: SeedIssue[];
  constructor(issues: SeedIssue[]) {
    super(`Quran seed refused: ${issues.length} issue(s)`);
    this.name = 'SeedRejectedError';
    this.issues = issues;
  }
}

/** Parses a seed file's JSON. Structure errors become issues (paths only, never values). */
export function parseSeed(json: unknown): QuranSeed {
  const result = SeedFileSchema.safeParse(json);
  if (!result.success) throw new SeedRejectedError(result.error.issues.map((i) => ({ path: i.path.join('.') || '_', code: 'INVALID' })));
  return result.data as QuranSeed;
}

export async function readSeedFile(path: string): Promise<QuranSeed> {
  return parseSeed(JSON.parse(await readFile(path, 'utf8')));
}

export const seedChecksum = (seed: QuranSeed): string => createHash('sha256').update(canonicalJson(seed), 'utf8').digest('hex');

export type ApplyStatus = 'APPLIED' | 'ALREADY_APPLIED';

export interface ApplyResult {
  metadata: ApplyStatus | 'NONE';
  layouts: { edition: string; status: ApplyStatus }[];
  /** Rows an Admin edited, which this seed did not overwrite. */
  keptAdminEdits: { surahs: number[]; paras: number[] };
}

const LINE_BATCH = 500;

/** A registered, cleared source an import was built from. */
type LinkedSource = { id: string; role: SourceRole };

export class QuranSeedLoader {
  private readonly db: Db;
  private readonly clock: Clock;
  private readonly allowSynthetic: boolean;

  constructor(db: Db, clock: Clock, options: { allowSynthetic: boolean }) {
    this.db = db;
    this.clock = clock;
    this.allowSynthetic = options.allowSynthetic;
  }

  /** Applies a seed to one madrasa in its own tenant transaction. */
  apply(organizationId: string, seed: QuranSeed, actorUserId: string | null = null): Promise<ApplyResult> {
    return withTenant(this.db, organizationId, (tx) => this.applyInTx(tx, organizationId, seed, actorUserId));
  }

  /** Applies a seed inside an open tenant transaction (workspace creation uses this). */
  async applyInTx(tx: Tx, organizationId: string, seed: QuranSeed, actorUserId: string | null): Promise<ApplyResult> {
    const now = this.clock.now();
    const editions = (await tx.selectFrom('mushaf_editions').select(['code', 'lines_per_page', 'page_count']).execute()).map((e) => ({
      code: e.code,
      linesPerPage: e.lines_per_page,
      pageCount: e.page_count,
    }));
    const existingSurahs = (
      await tx.selectFrom('quran_surahs').select(['number', 'ayah_count']).where('organization_id', '=', organizationId).execute()
    ).map((s) => ({ number: s.number, ayahCount: s.ayah_count }));
    const issues = validateSeed(seed, { editions, allowSynthetic: this.allowSynthetic, existingSurahs });
    if (issues.length) throw new SeedRejectedError(issues);
    // The licence gate (FR-SAB-011): every cited source registered and cleared, before anything is written.
    const sources = seed.formatVersion === 2 ? await this.resolveSources(tx, seed) : [];
    const checksum = seedChecksum(seed);

    const result: ApplyResult = { metadata: 'NONE', layouts: [], keptAdminEdits: { surahs: [], paras: [] } };
    if (seed.metadata) result.metadata = await this.applyMetadata(tx, organizationId, seed, sources, checksum, actorUserId, now, result);
    for (let i = 0; i < seed.layouts.length; i++) {
      const edition = seed.layouts[i]!.edition;
      result.layouts.push({ edition, status: await this.applyLayout(tx, organizationId, seed, i, sources, checksum, actorUserId, now) });
    }
    return result;
  }

  /** Each cited source's registered row, or refuses the seed when one is unregistered or not cleared. */
  private async resolveSources(tx: Tx, seed: QuranSeedV2): Promise<LinkedSource[]> {
    const issues: SeedIssue[] = [];
    const out: LinkedSource[] = [];
    for (const [i, ref] of seed.sources.entries()) {
      let q = tx.selectFrom('quran_sources').select(['id', 'synthetic']).where('provider', '=', ref.provider).where('file_sha256', '=', ref.fileSha256);
      q = ref.resourceId === null ? q.where('resource_id', 'is', null) : q.where('resource_id', '=', ref.resourceId);
      const row = await q.executeTakeFirst();
      const licence = row
        ? await tx
            .selectFrom('quran_source_licences')
            .select(['status', 'publisher_clearance_ref'])
            .where('source_id', '=', row.id)
            .orderBy('recorded_at', 'desc')
            .orderBy('id', 'desc')
            .limit(1)
            .executeTakeFirst()
        : undefined;
      const registered = row
        ? { synthetic: row.synthetic, status: licence?.status ?? ('LICENSE_REVIEW_REQUIRED' as const), publisherClearanceRef: licence?.publisher_clearance_ref ?? null }
        : null;
      const issue = sourceLicenceIssue(registered, ref.role, !seed.provenance.synthetic);
      if (issue) issues.push({ path: `sources[${i}]`, code: issue });
      else out.push({ id: row!.id, role: ref.role });
    }
    if (issues.length) throw new SeedRejectedError(issues);
    return out;
  }

  private async findImport(tx: Tx, organizationId: string, kind: 'METADATA' | 'LAYOUT', edition: string | null, seed: QuranSeed) {
    let q = tx
      .selectFrom('quran_imports')
      .select(['id', 'checksum'])
      .where('organization_id', '=', organizationId)
      .where('kind', '=', kind)
      .where('dataset_key', '=', seed.datasetKey)
      .where('dataset_version', '=', seed.datasetVersion);
    q = edition === null ? q.where('edition', 'is', null) : q.where('edition', '=', edition);
    return q.executeTakeFirst();
  }

  private async insertImport(
    tx: Tx,
    organizationId: string,
    seed: QuranSeed,
    kind: 'METADATA' | 'LAYOUT',
    edition: string | null,
    checksum: string,
    counts: Record<string, number>,
    sources: LinkedSource[],
    actorUserId: string | null,
    now: Date,
  ): Promise<string> {
    const id = uuidv7();
    const p = seed.provenance;
    const report = seed.formatVersion === 2 ? seed.validationReport : null;
    await tx
      .insertInto('quran_imports')
      .values({
        id,
        organization_id: organizationId,
        kind,
        edition,
        dataset_key: seed.datasetKey,
        dataset_version: seed.datasetVersion,
        source_name: p.sourceName,
        source_url: p.sourceUrl,
        licence: p.licence,
        reviewed_by: p.reviewedBy,
        approved_on: p.approvedOn,
        synthetic: p.synthetic,
        checksum,
        counts: JSON.stringify(counts),
        applied_at: now,
        applied_by: actorUserId,
        seed_format_version: seed.formatVersion,
        review_decision: report && APPROVING_DECISIONS.includes(report.decision) ? (report.decision as 'APPROVED' | 'APPROVED_WITH_FINDINGS') : null,
        validation_report_sha256: report?.sha256 ?? null,
      })
      .execute();
    // The source files this import was built from: metadata sources for metadata; layout and word sources for a layout.
    const roles: SourceRole[] = kind === 'METADATA' ? ['METADATA'] : ['LAYOUT', 'WORDS'];
    const links = sources.filter((s) => roles.includes(s.role)).map((s) => ({ organization_id: organizationId, import_id: id, source_id: s.id, role: s.role }));
    if (links.length) await tx.insertInto('quran_import_sources').values(links).execute();
    return id;
  }

  /** The same dataset version again: a no-op when identical, refused when its content changed. */
  private sameVersion(found: { checksum: string } | undefined, checksum: string): ApplyStatus | null {
    if (!found) return null;
    if (found.checksum !== checksum) throw new SeedRejectedError([{ path: 'datasetVersion', code: 'CONTENT_CHANGED' }]);
    return 'ALREADY_APPLIED';
  }

  private async applyMetadata(
    tx: Tx,
    organizationId: string,
    seed: QuranSeed,
    sources: LinkedSource[],
    checksum: string,
    actorUserId: string | null,
    now: Date,
    result: ApplyResult,
  ): Promise<ApplyStatus> {
    const meta = seed.metadata!;
    const again = this.sameVersion(await this.findImport(tx, organizationId, 'METADATA', null, seed), checksum);
    if (again) return again;
    const importId = await this.insertImport(tx, organizationId, seed, 'METADATA', null, checksum, { surahs: meta.surahs.length, paras: meta.paras.length }, sources, actorUserId, now);
    // Format-2 display fields, copied from the source as given; format 1 leaves them untouched.
    const display = (s: SeedSurah) =>
      seed.formatVersion === 2 ? { revelation_place: s.revelationPlace ?? null, revelation_order: s.revelationOrder ?? null, bismillah_pre: s.bismillahPre ?? null } : {};

    const surahRows = new Map(
      (await tx.selectFrom('quran_surahs').select(['number', 'source', 'row_version']).where('organization_id', '=', organizationId).execute()).map((r) => [r.number, r]),
    );
    let inserted = 0;
    let updated = 0;
    for (const s of meta.surahs) {
      const row = surahRows.get(s.number);
      if (!row) {
        await tx
          .insertInto('quran_surahs')
          .values({ id: uuidv7(), organization_id: organizationId, number: s.number, name_ar: s.nameAr, name_translit: s.nameTranslit, ayah_count: s.ayahCount, ...display(s), source: 'SEED', import_id: importId, updated_at: now, updated_by: actorUserId })
          .execute();
        inserted++;
      } else if (row.source === 'ADMIN') {
        result.keptAdminEdits.surahs.push(s.number);
      } else {
        await tx
          .updateTable('quran_surahs')
          .set({ name_ar: s.nameAr, name_translit: s.nameTranslit, ayah_count: s.ayahCount, ...display(s), import_id: importId, updated_at: now, updated_by: actorUserId, row_version: Number(row.row_version) + 1 })
          .where('organization_id', '=', organizationId)
          .where('number', '=', s.number)
          .execute();
        updated++;
      }
    }

    const paraRows = new Map(
      (await tx.selectFrom('quran_paras').select(['number', 'source', 'row_version']).where('organization_id', '=', organizationId).execute()).map((r) => [r.number, r]),
    );
    for (const p of meta.paras) {
      const values = { start_surah: p.start.surah, start_ayah: p.start.ayah, end_surah: p.end.surah, end_ayah: p.end.ayah };
      const row = paraRows.get(p.number);
      if (!row) {
        await tx.insertInto('quran_paras').values({ id: uuidv7(), organization_id: organizationId, number: p.number, ...values, source: 'SEED', import_id: importId, updated_at: now, updated_by: actorUserId }).execute();
        inserted++;
      } else if (row.source === 'ADMIN') {
        result.keptAdminEdits.paras.push(p.number);
      } else {
        await tx
          .updateTable('quran_paras')
          .set({ ...values, import_id: importId, updated_at: now, updated_by: actorUserId, row_version: Number(row.row_version) + 1 })
          .where('organization_id', '=', organizationId)
          .where('number', '=', p.number)
          .execute();
        updated++;
      }
    }

    await recordAudit(tx, {
      organizationId,
      actorUserId,
      action: 'QURAN_SEED_APPLIED',
      targetType: 'QURAN_IMPORT',
      targetId: importId,
      summary: {
        datasetKey: seed.datasetKey,
        datasetVersion: seed.datasetVersion,
        formatVersion: seed.formatVersion,
        synthetic: seed.provenance.synthetic,
        sources: sources.filter((s) => s.role === 'METADATA').length,
        inserted,
        updated,
        keptAdminEdits: { surahs: result.keptAdminEdits.surahs, paras: result.keptAdminEdits.paras },
      },
      at: now,
    });
    return 'APPLIED';
  }

  private async applyLayout(
    tx: Tx,
    organizationId: string,
    seed: QuranSeed,
    layoutIndex: number,
    sources: LinkedSource[],
    checksum: string,
    actorUserId: string | null,
    now: Date,
  ): Promise<ApplyStatus> {
    const layout = seed.layouts[layoutIndex]!;
    const again = this.sameVersion(await this.findImport(tx, organizationId, 'LAYOUT', layout.edition, seed), checksum);
    if (again) return again;
    const lines = normalizedLines(seed, layoutIndex);
    const pages = new Set(lines.map((l) => l.page)).size;
    const byType = (t: string) => lines.filter((l) => l.lineType === t).length;
    const counts = { lines: lines.length, pages, ayahLines: byType('AYAH'), surahNameLines: byType('SURAH_NAME'), basmallahLines: byType('BASMALLAH') };
    const importId = await this.insertImport(tx, organizationId, seed, 'LAYOUT', layout.edition, checksum, counts, sources, actorUserId, now);
    for (let i = 0; i < lines.length; i += LINE_BATCH) {
      const batch = lines.slice(i, i + LINE_BATCH).map((l) => ({
        organization_id: organizationId,
        import_id: importId,
        page: l.page,
        line: l.line,
        surah: l.surah,
        line_type: l.lineType,
        is_centered: l.isCentered,
        ayah_start: l.ayahStart,
        word_start: l.wordStart,
        ayah_end: l.ayahEnd,
        word_end: l.wordEnd,
        src_first_word_id: l.srcFirstWordId,
        src_last_word_id: l.srcLastWordId,
      }));
      await tx.insertInto('mushaf_layout_lines').values(batch).execute();
    }
    await tx
      .insertInto('mushaf_layouts')
      .values({ organization_id: organizationId, edition: layout.edition, import_id: importId, activated_at: now })
      .onConflict((oc) => oc.columns(['organization_id', 'edition']).doUpdateSet({ import_id: importId, activated_at: now }))
      .execute();
    await recordAudit(tx, {
      organizationId,
      actorUserId,
      action: 'QURAN_LAYOUT_APPLIED',
      targetType: 'QURAN_IMPORT',
      targetId: importId,
      summary: {
        datasetKey: seed.datasetKey,
        datasetVersion: seed.datasetVersion,
        formatVersion: seed.formatVersion,
        edition: layout.edition,
        synthetic: seed.provenance.synthetic,
        sources: sources.filter((s) => s.role !== 'METADATA').length,
        reviewDecision: seed.formatVersion === 2 ? (seed.validationReport?.decision ?? null) : null,
        ...counts,
      },
      at: now,
    });
    return 'APPLIED';
  }
}

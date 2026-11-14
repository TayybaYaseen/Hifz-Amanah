// F06 · The Quran reference snapshot (ADR-018; FR-SAB-014; DEC-B75, DEC-B77, DEC-B78, DEC-B79; plan P1–P3).
//
// Owner, Admin, and Teacher devices download one versioned, checksummed snapshot of their madrasa's reference data
// after the first online sign-in, then check it cheaply. Student and Parent never receive it (403). The organization
// always comes from the session.
//
// - The snapshot is built from data that may be distributed now (distribution.ts): rows from an import whose source
//   licence was withdrawn are left out, including rows an Admin edited later (P1), and test data never leaves a test
//   build. Nothing is deleted (P2).
// - Its body is canonical JSON and `referenceVersion = sha256(body)`, so the same data always gives the same version
//   (determinism) and the device can verify what it received before activating it.
// - Every version served is recorded in `quran_reference_snapshots` with the imports and sources it contained, so a
//   licence withdrawal marks those versions revoked (DEC-B79) and `/version?have=` tells a device to delete its copy.
//   A device that stays offline keeps its copy until it next connects: nothing here can reach it before that.
// - The body is rebuilt on each request (a few small queries and the layout's Ayat lines). No in-process cache can go
//   stale across server instances.
import { createHash } from 'node:crypto';
import type { ReferenceSnapshotQuery, ReferenceVersionQuery, ReferenceVersionResponse } from '@hifz/contracts';
import {
  SNAPSHOT_FORMAT_VERSION,
  SNAPSHOT_MIN_FORMAT_VERSION,
  buildSnapshot,
  snapshotBody,
  type LayoutRow,
  type ParaBoundary,
  type SurahRecord,
} from '@hifz/domain/quran-ref';
import type { Clock } from '../../platform/clock.ts';
import type { Db, Executor } from '../../platform/db.ts';
import { AppError } from '../../platform/errors.ts';
import { withTenant } from '../../platform/tenant.ts';
import { recordAudit } from '../audit/audit.ts';
import type { Actor } from '../identity/auth-service.ts';
import { requireRole } from '../roster/shared.ts';
import { blockReason, loadImportStates, productionVerified, withdrawnSources, type ImportState } from './distribution.ts';

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

/** One built snapshot: its exact body and what went into it. */
export interface BuiltSnapshot {
  body: string;
  referenceVersion: string;
  bytes: number;
  builtAt: Date;
  layout: { importId: string | null; verified: boolean; withdrawn: boolean };
  metadataWithdrawn: boolean;
  empty: boolean;
}

export type SnapshotResult = { status: 200; snapshot: BuiltSnapshot } | { status: 304; referenceVersion: string };

export interface ReferenceServiceOptions {
  /** True only when NODE_ENV=test: test data is never distributed outside tests. */
  allowSynthetic: boolean;
  /** Full snapshot downloads per user per hour (proposed default 30; configurable). */
  snapshotLimitPerHour?: number;
}

/** The format the server serves for an app that reads up to `requested` (ADR-018 §4.7), or 426 when too old. */
export function servedFormat(requested: number): number {
  if (requested < SNAPSHOT_MIN_FORMAT_VERSION) throw new AppError('UPGRADE_REQUIRED');
  return Math.min(requested, SNAPSHOT_FORMAT_VERSION);
}

/**
 * Marks revoked every recorded snapshot version of this madrasa that carried a source which no longer passes the
 * licence gate, and audits it, in the caller's tenant transaction (DEC-B79). Returns the versions it revoked. Used by
 * the licence command when a licence is withdrawn, and as a safety net by `/version`.
 */
export async function revokeWithdrawnSnapshots(
  tx: Executor,
  organizationId: string,
  now: Date,
  states?: Map<string, ImportState>,
): Promise<string[]> {
  const imports = states ?? (await loadImportStates(tx, organizationId));
  const withdrawn = new Map<string, string | null>();
  for (const imp of imports.values()) for (const s of withdrawnSources(imp)) withdrawn.set(s.id, s.licenceId);
  if (withdrawn.size === 0) return [];
  const ids = [...withdrawn.keys()];
  const rows = await tx
    .selectFrom('quran_reference_snapshots')
    .select(['reference_version', 'source_ids'])
    .where('organization_id', '=', organizationId)
    .where('revoked_at', 'is', null)
    .execute();
  const affected = rows.filter((r) => r.source_ids.some((id) => withdrawn.has(id)));
  for (const row of affected) {
    const sourceId = row.source_ids.find((id) => withdrawn.has(id))!;
    await tx
      .updateTable('quran_reference_snapshots')
      .set({ revoked_at: now, revoked_reason: 'LICENCE_WITHDRAWN', revoked_by_licence_id: withdrawn.get(sourceId) ?? null })
      .where('organization_id', '=', organizationId)
      .where('reference_version', '=', row.reference_version)
      .where('revoked_at', 'is', null)
      .execute();
    await recordAudit(tx, {
      organizationId,
      actorUserId: null,
      action: 'QURAN_REFERENCE_REVOKED',
      targetType: 'QURAN_SOURCE',
      targetId: sourceId,
      summary: { referenceVersion: row.reference_version, reason: 'LICENCE_WITHDRAWN', withdrawnSources: ids.filter((id) => row.source_ids.includes(id)) },
      at: now,
    });
  }
  return affected.map((r) => r.reference_version);
}

export class QuranReferenceService {
  private readonly db: Db;
  private readonly clock: Clock;
  private readonly allowSynthetic: boolean;
  private readonly limitPerHour: number;
  private readonly downloads = new Map<string, number[]>();

  constructor(db: Db, clock: Clock, options: ReferenceServiceOptions) {
    this.db = db;
    this.clock = clock;
    this.allowSynthetic = options.allowSynthetic;
    this.limitPerHour = options.snapshotLimitPerHour ?? 30;
  }

  /** `GET /quran/reference/version`: the current version and, with `have`, the status of the device's copy. */
  async version(actor: Actor, query: ReferenceVersionQuery): Promise<ReferenceVersionResponse> {
    requireRole(actor, 'quran.view');
    const format = servedFormat(query.format);
    const now = this.clock.now();
    return withTenant(this.db, actor.organizationId, async (tx) => {
      const states = await loadImportStates(tx, actor.organizationId);
      const built = await this.build(tx, actor.organizationId, format, states, now);
      const response: ReferenceVersionResponse = {
        snapshotFormatVersion: format,
        referenceVersion: built.referenceVersion,
        bytes: built.bytes,
        builtAt: built.builtAt.toISOString(),
        layout: built.layout,
        metadataWithdrawn: built.metadataWithdrawn,
        empty: built.empty,
      };
      if (query.have === undefined) return response;
      if (query.have === built.referenceVersion) return { ...response, cached: { referenceVersion: query.have, status: 'CURRENT' } };
      // Safety net: a withdrawal recorded without the licence command's revocation is caught here.
      await revokeWithdrawnSnapshots(tx, actor.organizationId, now, states);
      const row = await tx
        .selectFrom('quran_reference_snapshots')
        .select(['revoked_at', 'revoked_reason'])
        .where('organization_id', '=', actor.organizationId)
        .where('reference_version', '=', query.have)
        .executeTakeFirst();
      // A version from another madrasa is simply unknown here (RLS and the filter); its existence is never revealed.
      if (!row) return { ...response, cached: { referenceVersion: query.have, status: 'UNKNOWN' } };
      if (row.revoked_at) {
        return { ...response, cached: { referenceVersion: query.have, status: 'REVOKED', revokedAt: row.revoked_at.toISOString(), reasonCode: row.revoked_reason ?? 'LICENCE_WITHDRAWN' } };
      }
      return { ...response, cached: { referenceVersion: query.have, status: 'SUPERSEDED' } };
    });
  }

  /** `GET /quran/reference/snapshot`: the full body, or 304 when the device already has the current version. */
  async snapshot(actor: Actor, query: ReferenceSnapshotQuery, ifNoneMatch: string | undefined): Promise<SnapshotResult> {
    requireRole(actor, 'quran.view');
    const format = servedFormat(query.format);
    const now = this.clock.now();
    const built = await withTenant(this.db, actor.organizationId, async (tx) => this.build(tx, actor.organizationId, format, await loadImportStates(tx, actor.organizationId), now));
    if (ifNoneMatch !== undefined && ifNoneMatch.replace(/^W\//, '').replace(/"/g, '') === built.referenceVersion) {
      return { status: 304, referenceVersion: built.referenceVersion };
    }
    this.countDownload(actor.userId, now.getTime());
    return { status: 200, snapshot: built };
  }

  /** A light per-user limit on full downloads; a refresh is at most a few per day (ADR-018 §5). */
  private countDownload(userId: string, nowMs: number): void {
    const hourAgo = nowMs - 3_600_000;
    const recent = (this.downloads.get(userId) ?? []).filter((t) => t > hourAgo);
    if (recent.length >= this.limitPerHour) {
      this.downloads.set(userId, recent);
      throw new AppError('RATE_LIMITED');
    }
    recent.push(nowMs);
    this.downloads.set(userId, recent);
  }

  /** Builds the madrasa's snapshot from distributable data and records the version in the manifest. */
  private async build(tx: Executor, organizationId: string, format: number, states: Map<string, ImportState>, now: Date): Promise<BuiltSnapshot> {
    // Only format 1 exists; `format` selects the builder once a second format exists.
    void format;
    const org = await tx.selectFrom('organizations').select('mushaf_edition').where('id', '=', organizationId).executeTakeFirstOrThrow();
    const edition = await tx
      .selectFrom('mushaf_editions')
      .select(['code', 'lines_per_page', 'publisher', 'printing_id', 'page_count'])
      .where('code', '=', org.mushaf_edition)
      .executeTakeFirstOrThrow();

    const usable = (importId: string | null): boolean => {
      if (importId === null) return true; // entered by an Admin with no imported origin
      const state = states.get(importId);
      return state !== undefined && blockReason(state, this.allowSynthetic) === null;
    };
    const withdrawnImport = (importId: string | null): boolean => {
      if (importId === null) return false;
      const state = states.get(importId);
      return state !== undefined && blockReason(state, this.allowSynthetic) === 'LICENCE_WITHDRAWN';
    };

    // P1: a row whose imported origin is withdrawn is left out even after an Admin edit (it keeps its import_id).
    const surahRows = await tx
      .selectFrom('quran_surahs')
      .select(['number', 'name_ar', 'name_translit', 'ayah_count', 'import_id'])
      .where('organization_id', '=', organizationId)
      .execute();
    const paraRows = await tx
      .selectFrom('quran_paras')
      .select(['number', 'start_surah', 'start_ayah', 'end_surah', 'end_ayah', 'import_id'])
      .where('organization_id', '=', organizationId)
      .execute();
    const surahs: SurahRecord[] = surahRows.filter((r) => usable(r.import_id)).map((r) => ({ number: r.number, nameAr: r.name_ar, nameTranslit: r.name_translit, ayahCount: r.ayah_count }));
    const paras: ParaBoundary[] = paraRows
      .filter((r) => usable(r.import_id))
      .map((r) => ({ number: r.number, start: { surah: r.start_surah, ayah: r.start_ayah }, end: { surah: r.end_surah, ayah: r.end_ayah } }));
    const metadataWithdrawn = [...surahRows, ...paraRows].some((r) => withdrawnImport(r.import_id));

    const active = await tx
      .selectFrom('mushaf_layouts')
      .select('import_id')
      .where('organization_id', '=', organizationId)
      .where('edition', '=', org.mushaf_edition)
      .executeTakeFirst();
    const layoutImportId = active && usable(active.import_id) ? active.import_id : null;
    const lines: LayoutRow[] = layoutImportId
      ? (
          await tx
            .selectFrom('mushaf_layout_lines')
            .select(['page', 'line', 'surah', 'ayah_start', 'ayah_end'])
            .where('organization_id', '=', organizationId)
            .where('import_id', '=', layoutImportId)
            .where('line_type', '=', 'AYAH')
            .execute()
        ).map((r) => ({ page: r.page, line: r.line, surah: r.surah, lineType: 'AYAH' as const, ayahStart: r.ayah_start, ayahEnd: r.ayah_end }))
      : [];

    // What this version contains: the imports behind its rows and their source files (for revocation).
    const usedImports = new Set<string>();
    for (const r of [...surahRows, ...paraRows]) if (r.import_id && usable(r.import_id)) usedImports.add(r.import_id);
    if (layoutImportId) usedImports.add(layoutImportId);
    const usedSources = new Set<string>();
    const attribution: string[] = [];
    for (const id of usedImports) {
      for (const s of states.get(id)?.sources ?? []) {
        usedSources.add(s.id);
        if (s.attributionText) attribution.push(s.attributionText);
      }
    }

    const snapshot = buildSnapshot({
      edition: { code: edition.code, linesPerPage: edition.lines_per_page, publisher: edition.publisher, printingId: edition.printing_id, pageCount: edition.page_count },
      layout: {
        importId: layoutImportId,
        verified: layoutImportId !== null && productionVerified(states.get(layoutImportId)),
        withdrawn: active !== undefined && withdrawnImport(active.import_id),
      },
      metadataWithdrawn,
      surahs,
      paras,
      lines,
      attribution,
    });
    const body = snapshotBody(snapshot);
    const referenceVersion = sha256(body);
    const bytes = Buffer.byteLength(body, 'utf8');
    await tx
      .insertInto('quran_reference_snapshots')
      .values({
        organization_id: organizationId,
        reference_version: referenceVersion,
        snapshot_format_version: snapshot.snapshotFormatVersion,
        bytes,
        layout_import_id: layoutImportId,
        import_ids: [...usedImports].sort(),
        source_ids: [...usedSources].sort(),
        built_at: now,
      })
      .onConflict((oc) => oc.columns(['organization_id', 'reference_version']).doNothing())
      .execute();
    const recorded = await tx
      .selectFrom('quran_reference_snapshots')
      .select('built_at')
      .where('organization_id', '=', organizationId)
      .where('reference_version', '=', referenceVersion)
      .executeTakeFirstOrThrow();
    return { body, referenceVersion, bytes, builtAt: recorded.built_at, layout: snapshot.layout, metadataWithdrawn, empty: surahs.length === 0 };
  }
}

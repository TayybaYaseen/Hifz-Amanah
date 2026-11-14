// F06 · Whether imported Quran reference data may still be distributed and presented as approved (FR-SAB-011,
// FR-SAB-013; DEC-B78, DEC-B79; ADR-018 §3.4; plan P1, P2).
//
// One rule, used everywhere data leaves the server (the snapshot, the online Total Lines lookup, the edition list):
// an import is distributable only while every source file it was built from still passes the same licence gate the
// loader applied at import (`sourceLicenceIssue`): registered, cleared, the publisher's clearance for a layout, and no
// test source behind production data. A licence withdrawn after import therefore stops distribution at once. Nothing
// is deleted: the rows stay for audit and legal review (P2), and stored records are never changed.
import { sourceLicenceIssue, type LicenceStatus, type SourceRole } from '@hifz/domain/quran-ref';
import type { Executor } from '../../platform/db.ts';

export interface ImportSourceState {
  id: string;
  role: SourceRole;
  synthetic: boolean;
  /** The current (latest) licence record. */
  licenceId: string | null;
  status: LicenceStatus;
  publisherClearanceRef: string | null;
  attributionText: string | null;
}

export interface ImportState {
  id: string;
  kind: 'METADATA' | 'LAYOUT';
  synthetic: boolean;
  reviewDecision: 'APPROVED' | 'APPROVED_WITH_FINDINGS' | null;
  validationReportSha256: string | null;
  mushafPrinting: string | null;
  signOffRef: string | null;
  reportStored: boolean;
  sources: ImportSourceState[];
}

/** Why an import may not be distributed now, or null when it may. */
export type BlockReason = 'LICENCE_WITHDRAWN' | 'SYNTHETIC_NOT_ALLOWED';

/** Every import of a madrasa with its source files and their current licence records (inside its tenant transaction). */
export async function loadImportStates(db: Executor, organizationId: string): Promise<Map<string, ImportState>> {
  const imports = await db
    .selectFrom('quran_imports')
    .select(['id', 'kind', 'synthetic', 'review_decision', 'validation_report_sha256', 'mushaf_printing', 'signoff_ref', 'validation_report'])
    .where('organization_id', '=', organizationId)
    .execute();
  const links = await db
    .selectFrom('quran_import_sources as l')
    .innerJoin('quran_sources as s', 's.id', 'l.source_id')
    .select(['l.import_id', 'l.role', 's.id', 's.synthetic'])
    .where('l.organization_id', '=', organizationId)
    .execute();
  const sourceIds = [...new Set(links.map((l) => l.id))];
  const licences = sourceIds.length
    ? await db
        .selectFrom('quran_source_licences')
        .select(['id', 'source_id', 'status', 'publisher_clearance_ref', 'attribution_text'])
        .where('source_id', 'in', sourceIds)
        .orderBy('recorded_at', 'desc')
        .orderBy('id', 'desc')
        .execute()
    : [];
  const latest = new Map<string, (typeof licences)[number]>();
  for (const l of licences) if (!latest.has(l.source_id)) latest.set(l.source_id, l);

  const out = new Map<string, ImportState>();
  for (const i of imports) {
    out.set(i.id, {
      id: i.id,
      kind: i.kind,
      synthetic: i.synthetic,
      reviewDecision: i.review_decision,
      validationReportSha256: i.validation_report_sha256,
      mushafPrinting: i.mushaf_printing,
      signOffRef: i.signoff_ref,
      reportStored: i.validation_report !== null && i.validation_report !== undefined,
      sources: links
        .filter((l) => l.import_id === i.id)
        .map((l) => {
          const lic = latest.get(l.id);
          return {
            id: l.id,
            role: l.role,
            synthetic: l.synthetic,
            licenceId: lic?.id ?? null,
            status: lic?.status ?? 'LICENSE_REVIEW_REQUIRED',
            publisherClearanceRef: lic?.publisher_clearance_ref ?? null,
            attributionText: lic?.attribution_text ?? null,
          };
        }),
    });
  }
  return out;
}

/** The sources of an import that no longer pass the licence gate (the gate the loader applied at import). */
export function withdrawnSources(imp: ImportState): ImportSourceState[] {
  return imp.sources.filter((s) => sourceLicenceIssue({ synthetic: s.synthetic, status: s.status, publisherClearanceRef: s.publisherClearanceRef }, s.role, !imp.synthetic) !== null);
}

/**
 * Whether an import's data may be distributed now. Test data is distributable only where test data is allowed
 * (NODE_ENV=test): production snapshots never carry it.
 */
export function blockReason(imp: ImportState, allowSynthetic: boolean): BlockReason | null {
  if (imp.synthetic && !allowSynthetic) return 'SYNTHETIC_NOT_ALLOWED';
  return withdrawnSources(imp).length ? 'LICENCE_WITHDRAWN' : null;
}

/**
 * A layout counts as verified for this madrasa only when it is a production import with an approving, signed review,
 * the physical-verification evidence on file (printing, sign-off reference, the stored report), and every source
 * still licensed (F06-AC20; DEC-B78, DEC-B79). Signed test data never counts. This records human approval; it does
 * not prove that the layout matches the printed Mushaf.
 */
export function productionVerified(imp: ImportState | undefined): boolean {
  if (!imp || imp.synthetic) return false;
  return (
    imp.reviewDecision !== null &&
    imp.validationReportSha256 !== null &&
    imp.mushafPrinting !== null &&
    imp.signOffRef !== null &&
    imp.reportStored &&
    withdrawnSources(imp).length === 0
  );
}

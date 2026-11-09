// F06 · Signing a converted dataset: the reviewer's decision after comparing it with the physical Mushaf
// (verification kit Part F; FR-SAB-013; DEC-B31, DEC-B71, DEC-B72).
//
// Signing records a decision the reviewer made; it never makes one. It refuses to attach an approval to a seed that
// was changed after conversion, to a conversion with a failed check, or alongside a blocking finding. A REJECTED
// decision is recorded too, and the resulting seed is then refused at import (validateSeed: NOT_APPROVED).
import { z } from 'zod';
import { APPROVING_DECISIONS, validateSeed, type QuranSeedV2 } from '@hifz/domain/quran-ref';
import { gateOf, reportSha256, seedSha256, type ReportReview, type ValidationReport } from './convert.ts';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The reviewer's signed review, transcribed from the paper sign-off (kit Part F). */
export const ReviewInput = z.strictObject({
  reviewer: z.string().trim().min(1).max(200),
  qualification: z.string().trim().min(1).max(200).nullable(),
  /** The printing identifier from kit Part A8. */
  mushafPrinting: z.string().trim().min(1).max(300),
  decision: z.enum(['APPROVED', 'APPROVED_WITH_FINDINGS', 'REJECTED']),
  signedOn: z.string().regex(ISO_DATE),
  findings: z.array(z.strictObject({ part: z.string().min(1).max(40), description: z.string().min(1).max(2000), blocking: z.boolean() })).max(500),
});
export type ReviewInput = z.infer<typeof ReviewInput>;

export class SignRefusedError extends Error {
  readonly reasons: string[];
  constructor(reasons: string[]) {
    super(`Signing refused: ${reasons.join('; ')}`);
    this.name = 'SignRefusedError';
    this.reasons = reasons;
  }
}

export interface SignedDataset {
  seed: QuranSeedV2;
  report: ValidationReport;
  reportSha256: string;
}

export function signDataset(unsignedSeed: QuranSeedV2, report: ValidationReport, reviewInput: unknown): SignedDataset {
  const review = ReviewInput.parse(reviewInput);
  const reasons: string[] = [];
  if (report.review.decision !== 'PENDING') reasons.push('REPORT_ALREADY_SIGNED');
  if (report.seedSha256 === null) reasons.push('NO_SEED: the conversion failed, so there is nothing to sign');
  else if (seedSha256(unsignedSeed) !== report.seedSha256) reasons.push('SEED_CHANGED: the seed differs from the one this report validated');
  if (unsignedSeed.validationReport !== null || unsignedSeed.provenance.reviewedBy !== null) reasons.push('SEED_ALREADY_SIGNED');
  const approving = APPROVING_DECISIONS.includes(review.decision);
  if (approving && report.checks.some((c) => c.result === 'FAIL')) reasons.push('CHECKS_FAILED: an approval cannot be given while a check failed');
  if (approving && review.findings.some((f) => f.blocking)) reasons.push('BLOCKING_FINDING: an approval cannot list a blocking finding');
  if (review.decision === 'APPROVED' && review.findings.length > 0) reasons.push('FINDINGS_LISTED: use APPROVED_WITH_FINDINGS when findings are listed');
  if (reasons.length) throw new SignRefusedError(reasons);

  const signedReview: ReportReview = {
    reviewer: review.reviewer,
    qualification: review.qualification,
    mushafPrinting: review.mushafPrinting,
    decision: review.decision,
    signedOn: review.signedOn,
    findings: review.findings,
  };
  const signedReport: ValidationReport = { ...report, review: signedReview };
  signedReport.gate = gateOf(signedReport);
  const sha = reportSha256(signedReport);
  const seed: QuranSeedV2 = {
    ...unsignedSeed,
    provenance: { ...unsignedSeed.provenance, reviewedBy: review.reviewer, approvedOn: review.signedOn },
    validationReport: { sha256: sha, decision: review.decision, signedBy: review.reviewer, signedOn: review.signedOn },
  };

  // The signed seed must satisfy the existing rules, except that a REJECTED decision is recorded and later refused.
  const issues = validateSeed(seed, {
    editions: [{ code: report.edition.code, linesPerPage: report.edition.linesPerPage, pageCount: report.edition.pageCount }],
    allowSynthetic: true,
    existingSurahs: [],
  }).filter((i) => !(review.decision === 'REJECTED' && i.path === 'validationReport.decision'));
  if (issues.length) throw new SignRefusedError(issues.map((i) => `${i.path}: ${i.code}`));
  return { seed, report: signedReport, reportSha256: sha };
}

/** A readable copy of the report for the product owner and the reviewer. It holds no Quran text. */
export function renderReportMarkdown(report: ValidationReport, sha: string | null): string {
  const out: string[] = [];
  const row = (...cells: (string | number)[]) => `| ${cells.join(' | ')} |`;
  out.push(`# Quran dataset validation report — ${report.datasetKey} ${report.datasetVersion}`, '');
  if (report.synthetic) out.push('> **SYNTHETIC TEST DATA — not Quran metadata. Never import into production.**', '');
  out.push(`- Generated: ${report.generatedAt} by converter ${report.converterVersion}`);
  out.push(`- Edition: ${report.edition.code}, ${report.edition.linesPerPage} lines per page, verified page count: ${report.edition.pageCount ?? 'not recorded'}`);
  out.push(`- Seed SHA-256: ${report.seedSha256 ?? 'none (checks failed)'}`);
  if (sha) out.push(`- Report SHA-256: ${sha}`);
  out.push('', `## Import gate: ${report.gate.importReady ? 'READY' : 'BLOCKED'}`, '');
  if (report.gate.blockers.length) out.push(...report.gate.blockers.map((b) => `- ${b}`), '');
  out.push('## Sources', '', row('File', 'Provider', 'Resource', 'Role', 'File name', 'SHA-256', 'Licence', 'Publisher clearance'), row('---', '---', '---', '---', '---', '---', '---', '---'));
  for (const s of report.sources) {
    out.push(row(s.file, s.provider, s.resourceId ?? '-', s.role, s.fileName, s.fileSha256, s.licenceStatus, s.publisherClearance === null ? 'not checked' : s.publisherClearance ? 'on file' : 'missing'));
  }
  const c = report.counts;
  out.push('', '## Counts', '', `Surahs ${c.surahs} · Ayat ${c.ayahTotal} · words ${c.words} · Paras ${c.paras} · pages ${c.pages} · lines: Ayat ${c.lines.AYAH}, Surah heading ${c.lines.SURAH_NAME}, Bismillah ${c.lines.BASMALLAH}`);
  out.push('', '## Checks', '', row('Check', 'Title', 'Result', 'Details'), row('---', '---', '---', '---'));
  for (const check of report.checks) out.push(row(check.id, check.title, check.result, check.details.length));
  for (const check of report.checks.filter((x) => x.details.length)) {
    out.push('', `### ${check.id} · ${check.title} (${check.result})`, '', ...check.details.map((d) => `- ${d}`));
  }
  const mismatches = report.crossSource.filter((x) => x.status === 'MISMATCH');
  out.push('', `## Cross-source comparison (${mismatches.length} mismatch(es) of ${report.crossSource.length})`, '');
  for (const m of mismatches) out.push(`- ${m.item}: ${m.sourceA} vs ${m.sourceB}`);
  out.push('', '## Reviewer sample (verification kit Part C)', '', report.reviewerSample.join(', ') || 'none');
  const r = report.review;
  out.push('', '## Review', '', `- Decision: ${r.decision}`, `- Reviewer: ${r.reviewer ?? '—'} (${r.qualification ?? '—'})`, `- Printing: ${r.mushafPrinting ?? '—'}`, `- Signed on: ${r.signedOn ?? '—'}`);
  for (const f of r.findings) out.push(`- Finding (${f.part}, ${f.blocking ? 'blocking' : 'not blocking'}): ${f.description}`);
  return `${out.join('\n')}\n`;
}

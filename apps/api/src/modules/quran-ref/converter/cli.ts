// npm run quran:convert -- <command> — the offline Quran source converter (ADR-017 §4–§7; FR-SAB-011…013).
//
//   convert <manifest.json> --out <dir> [--check-sources]
//       Reads the manifest's source files (paths relative to the manifest), checks them, and writes report.json and
//       report.md to <dir>; writes seed.json only when every check passed. --check-sources looks each file up in the
//       source catalogue (needs DATABASE_URL) so the report shows its licence status. Exit code 1 when a check failed.
//   sign <dir> <review.json>
//       Attaches the reviewer's signed decision (verification kit Part F) to <dir>/seed.json and report.json and writes
//       seed.signed.json, report.signed.json, and report.signed.md. Refuses a changed seed, a failed check, or an
//       approval with a blocking finding.
//
// It downloads nothing and imports nothing: the signed seed is applied later by the seed loader, which enforces the
// licence and review gates again. Synthetic manifests are accepted only when NODE_ENV=test.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { convertSources, SourceManifest, type SourceFileKey, type SourceStatusLookup, type ValidationReport } from './convert.ts';
import { renderReportMarkdown, signDataset, SignRefusedError } from './sign.ts';
import type { QuranSeedV2 } from '@hifz/domain/quran-ref';

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const readJson = async (path: string): Promise<unknown> => JSON.parse(await readFile(path, 'utf8'));

async function sourceStatusFromCatalogue(): Promise<{ lookup: SourceStatusLookup; close: () => Promise<void> }> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('--check-sources needs DATABASE_URL');
  const { createDb } = await import('../../../platform/db.ts');
  const { Clock } = await import('../../../platform/clock.ts');
  const { QuranSourceRegistry } = await import('../sources.ts');
  const { db } = createDb({ connectionString: url, maxConnections: 1 });
  const rows = await new QuranSourceRegistry(db, new Clock(), { allowSynthetic: false }).list();
  const lookup: SourceStatusLookup = (ref) => {
    const row = rows.find((r) => r.provider === ref.provider && r.resourceId === ref.resourceId && r.fileSha256 === ref.fileSha256);
    if (!row || !row.licence) return null;
    return { synthetic: row.synthetic, status: row.licence.status as never, publisherClearanceRef: row.licence.publisherClearanceRef };
  };
  return { lookup, close: () => db.destroy() };
}

async function convert(manifestPath: string, outDir: string, checkSources: boolean): Promise<number> {
  const manifest = SourceManifest.parse(await readJson(manifestPath));
  if (manifest.provenance.synthetic && process.env.NODE_ENV !== 'test') throw new Error('Synthetic manifests are accepted only when NODE_ENV=test');
  const base = dirname(resolve(manifestPath));
  const files = {} as Record<SourceFileKey, { fileName: string; bytes: Uint8Array }>;
  for (const key of ['surahs', 'juz', 'layout', 'words'] as const) {
    const path = resolve(base, manifest.files[key].path);
    files[key] = { fileName: manifest.files[key].path, bytes: new Uint8Array(await readFile(path)) };
  }
  const catalogue = checkSources ? await sourceStatusFromCatalogue() : null;
  try {
    const { seed, report } = convertSources(manifest, files, { now: new Date(), ...(catalogue ? { sourceStatus: catalogue.lookup } : {}) });
    await mkdir(outDir, { recursive: true });
    await writeFile(join(outDir, 'report.json'), json(report));
    await writeFile(join(outDir, 'report.md'), renderReportMarkdown(report, null));
    if (seed) await writeFile(join(outDir, 'seed.json'), json(seed));
    const failed = report.checks.filter((c) => c.result === 'FAIL').map((c) => c.id);
    console.log(seed ? `Converted: seed.json written (${report.seedSha256})` : `Checks failed (${failed.join(', ')}): no seed written`);
    console.log(`Import gate: ${report.gate.importReady ? 'READY' : `BLOCKED — ${report.gate.blockers.join('; ')}`}`);
    return seed ? 0 : 1;
  } finally {
    await catalogue?.close();
  }
}

async function sign(dir: string, reviewPath: string): Promise<number> {
  const seed = (await readJson(join(dir, 'seed.json'))) as QuranSeedV2;
  const report = (await readJson(join(dir, 'report.json'))) as ValidationReport;
  const signed = signDataset(seed, report, await readJson(reviewPath));
  await writeFile(join(dir, 'seed.signed.json'), json(signed.seed));
  await writeFile(join(dir, 'report.signed.json'), json(signed.report));
  await writeFile(join(dir, 'report.signed.md'), renderReportMarkdown(signed.report, signed.reportSha256));
  console.log(`Signed: ${signed.report.review.decision} by ${signed.report.review.reviewer}; report SHA-256 ${signed.reportSha256}`);
  console.log(`Import gate: ${signed.report.gate.importReady ? 'READY' : `BLOCKED — ${signed.report.gate.blockers.join('; ')}`}`);
  return 0;
}

const [command, ...args] = process.argv.slice(2);
try {
  if (command === 'convert' && args[0] && args.indexOf('--out') > 0 && args[args.indexOf('--out') + 1]) {
    process.exitCode = await convert(args[0], args[args.indexOf('--out') + 1]!, args.includes('--check-sources'));
  } else if (command === 'sign' && args[0] && args[1]) {
    process.exitCode = await sign(args[0], args[1]);
  } else {
    console.error('Usage: npm run quran:convert -- convert <manifest.json> --out <dir> [--check-sources] | sign <dir> <review.json>');
    process.exitCode = 2;
  }
} catch (error) {
  console.error(error instanceof SignRefusedError ? `Signing refused:\n- ${error.reasons.join('\n- ')}` : error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

// npm run quran:source -- <command> — the maintainer's privileged step for the Quran source catalogue (FR-SAB-011;
// ADR-017 §3.1). Uses DATABASE_URL (the owner connection), like db:migrate.
//
//   list                              every registered source with its current licence status
//   register <file.json>              register a downloaded file (RegisterSourceInput); starts LICENSE_REVIEW_REQUIRED
//   licence <sourceId> <file.json>    append a licence record (RecordLicenceInput); a cleared status needs its evidence
//
// It never downloads anything and never registers synthetic sources. Recording PERMISSION_GRANTED or
// OPEN_LICENCE_VERIFIED is the product owner's decision, backed by written evidence; this tool only records it.
import { readFile } from 'node:fs/promises';
import { Clock } from '../../platform/clock.ts';
import { createDb } from '../../platform/db.ts';
import { QuranSourceRegistry } from './sources.ts';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}
const [command, ...args] = process.argv.slice(2);
const readJson = async (path: string | undefined): Promise<unknown> => {
  if (!path) throw new Error('A JSON file path is required');
  return JSON.parse(await readFile(path, 'utf8'));
};

const { db } = createDb({ connectionString: url, maxConnections: 1 });
const registry = new QuranSourceRegistry(db, new Clock(), { allowSynthetic: false });
try {
  if (command === 'list') {
    console.log(JSON.stringify(await registry.list(), null, 2));
  } else if (command === 'register') {
    const result = await registry.register(await readJson(args[0]));
    console.log(result.created ? `Registered ${result.id} (LICENSE_REVIEW_REQUIRED)` : `Already registered: ${result.id}`);
  } else if (command === 'licence') {
    if (!args[0]) throw new Error('A source id is required');
    const { revokedVersions } = await registry.recordLicence(args[0], await readJson(args[1]));
    console.log(`Licence record added to ${args[0]}`);
    // DEC-B79: devices delete a revoked copy on their next successful online check, not before.
    if (revokedVersions) console.log(`Snapshot versions revoked (removed from devices on their next successful connection): ${revokedVersions}`);
  } else {
    console.error('Usage: npm run quran:source -- list | register <file.json> | licence <sourceId> <file.json>');
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await db.destroy();
}

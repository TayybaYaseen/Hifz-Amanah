// Checks that every detailed acceptance criterion in the story specs (docs/specs/<feature>/us-*.md)
// has at least one E2E test, and that no E2E test cites a criterion that does not exist.
// Usage: node e2e/scripts/traceability.mjs [US-022 | F05]
import { loadSpecs, loadTests, selectSpecs } from './lib.mjs';

const arg = process.argv[2]?.toUpperCase();
const all = loadSpecs();
const specs = arg ? selectSpecs(arg) : all;
if (arg && !specs.length) {
  console.error(`No story spec matches ${arg}`);
  process.exit(2);
}
const tests = loadTests();
const known = new Set(all.flatMap((s) => s.criteria));

let failed = false;
console.log('Spec        Criteria  Covered  Missing  E2E tests  Pending');
for (const spec of specs) {
  const specTests = tests.filter((t) => t.tags.includes(spec.id) || t.ids.some((id) => spec.criteria.includes(id)));
  const covered = new Set(specTests.flatMap((t) => t.ids));
  const missing = spec.criteria.filter((id) => !covered.has(id));
  const pending = specTests.filter((t) => t.pending).length;
  const col = (v, w) => String(v).padStart(w);
  console.log(`${spec.id} (${spec.feature})${col(spec.criteria.length, 6)}${col(spec.criteria.length - missing.length, 9)}${col(missing.length, 9)}${col(specTests.length, 11)}${col(pending, 9)}`);
  if (missing.length) {
    failed = true;
    console.log(`      missing: ${missing.join(', ')}`);
  }
}

const unknown = [...new Set(tests.flatMap((t) => t.ids))].filter((id) => !known.has(id));
if (unknown.length && !arg) {
  failed = true;
  console.log(`\nTests cite criteria that do not exist in the specs: ${unknown.join(', ')}`);
}

if (!arg) {
  const app = tests.filter((t) => t.tags.includes('APP'));
  console.log(`\n${specs.length} story specs, ${specs.reduce((n, s) => n + s.criteria.length, 0)} criteria`);
  console.log(`App-wide tests (APP, release gate): ${app.length}, pending ${app.filter((t) => t.pending).length}`);
}

console.log(failed ? '\nE2E traceability: FAIL' : '\nE2E traceability: OK');
process.exit(failed ? 1 : 0);

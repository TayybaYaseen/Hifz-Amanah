// Checks that every acceptance criterion in docs/specs/F*.md has at least one E2E test,
// and that no E2E test cites a criterion that does not exist.
// Usage: node e2e/scripts/traceability.mjs [F05]
import { loadSpecs, loadTests } from './lib.mjs';

const only = process.argv[2]?.toUpperCase();
const specs = loadSpecs().filter((s) => !only || s.id === only);
const tests = loadTests();
const known = new Set(loadSpecs().flatMap((s) => s.criteria));

let failed = false;
console.log('Spec  Criteria  Covered  Missing  E2E tests  Pending');
for (const spec of specs) {
  const specTests = tests.filter((t) => t.tags.includes(spec.id) || t.ids.some((id) => id.startsWith(`${spec.id}-`)));
  const covered = new Set(specTests.flatMap((t) => t.ids));
  const missing = spec.criteria.filter((id) => !covered.has(id));
  const pending = specTests.filter((t) => t.pending).length;
  console.log(
    `${spec.id}   ${String(spec.criteria.length).padStart(8)}  ${String(spec.criteria.length - missing.length).padStart(7)}  ${String(missing.length).padStart(7)}  ${String(specTests.length).padStart(9)}  ${String(pending).padStart(7)}`,
  );
  if (missing.length) {
    failed = true;
    console.log(`      missing: ${missing.join(', ')}`);
  }
}

const unknown = [...new Set(tests.flatMap((t) => t.ids))].filter((id) => !known.has(id) && (!only || id.startsWith(only)));
if (unknown.length) {
  failed = true;
  console.log(`\nTests cite criteria that do not exist in the specs: ${unknown.join(', ')}`);
}

if (!only) {
  const app = tests.filter((t) => t.tags.includes('APP'));
  console.log(`\nApp-wide tests (@APP, release gate): ${app.length}, pending ${app.filter((t) => t.pending).length}`);
}

console.log(failed ? '\nTraceability: FAIL' : '\nTraceability: OK');
process.exit(failed ? 1 : 0);

// Spec completion gate. One spec = one user story. A story spec is complete only when:
//   1. every acceptance criterion in it has an E2E test the gate can run (traceability),
//   2. none of its E2E tests is still pending (test.fixme / tag "pending"),
//   3. all its API E2E tests pass, and
//   4. all its mobile E2E flows pass.
// A layer with no tests for the selection is skipped (some stories are API-only or mobile-only).
// Usage: node e2e/scripts/spec-gate.mjs US-022   (one story spec)
//        node e2e/scripts/spec-gate.mjs F05      (every story in a feature)
//        node e2e/scripts/spec-gate.mjs APP      (app-wide release gate)
// Steps 3–4 need a reachable API (E2E_API_URL, default http://localhost:3000), the Maestro CLI, and APP_ID.
//
// Result and exit code. Only PASS exits 0, so nothing but a full pass completes a spec.
//   PASS        0  every test for the selection ran and passed
//   FAIL        1  a test ran and failed, or the run did not match the tests the gate found
//   (usage)     2  bad argument
//   INCOMPLETE  3  an acceptance criterion has no E2E test the gate can run
//   PENDING     4  tests exist but are still pending: the feature is not implemented yet
//   BLOCKED     5  tests are ready but the environment to run them is missing
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadTests, selectSpecs } from './lib.mjs';

const arg = process.argv[2]?.toUpperCase();
if (!arg || !/^(US-\d{3}|F\d{2}|APP)$/.test(arg)) {
  console.error('Usage: node e2e/scripts/spec-gate.mjs <US-001…US-073 | F01…F17 | APP>');
  process.exit(2);
}

const run = (cmd, args) => spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
const RESULT = { FAIL: 1, INCOMPLETE: 3, PENDING: 4, BLOCKED: 5 };
const stop = (result, why) => {
  console.error(`\n${arg} gate: ${result} — ${why}`);
  process.exit(RESULT[result]);
};

const stories = arg === 'APP' ? [] : selectSpecs(arg).map((s) => s.id);
if (arg !== 'APP' && !stories.length) {
  console.error(`No story spec matches ${arg}`);
  process.exit(2);
}

// 1. Traceability
if (arg !== 'APP' && run('node', ['e2e/scripts/traceability.mjs', arg]).status !== 0) {
  stop('INCOMPLETE', 'some acceptance criteria have no E2E test the gate can run');
}

// 2. Pending
const tests = loadTests().filter((t) => (arg === 'APP' ? t.tags.includes('APP') : stories.some((s) => t.tags.includes(s))));
const apiTests = tests.filter((t) => t.layer === 'api');
const mobileFlows = tests.filter((t) => t.layer === 'mobile');
console.log(`\nE2E tests for ${arg}: ${apiTests.length} API, ${mobileFlows.length} mobile`);
for (const t of tests) console.log(`  [${t.layer}]${t.pending ? ' (pending)' : ''} ${t.file} — ${t.title}`);
if (!tests.length) stop('INCOMPLETE', `no E2E test is tagged ${arg}`);
const pending = tests.filter((t) => t.pending);
if (pending.length) {
  stop('PENDING', `${pending.length} of ${tests.length} E2E tests are still pending; implement the feature, then turn them into real tests`);
}

// 3–4 need an environment. Check it before running anything, so a missing setup is not reported as a test failure.
const apiUrl = process.env.E2E_API_URL ?? 'http://localhost:3000';
const missing = [];
if (apiTests.length) {
  try {
    await fetch(apiUrl, { signal: AbortSignal.timeout(5000) });
  } catch {
    missing.push(`no API answers at ${apiUrl} (set E2E_API_URL)`);
  }
}
if (mobileFlows.length) {
  if (!process.env.APP_ID) missing.push('APP_ID is not set (DEFERRED: DEC-B55)');
  if (spawnSync('maestro', ['--version'], { shell: process.platform === 'win32', stdio: 'ignore' }).status !== 0) {
    missing.push('the Maestro CLI is not installed');
  }
}
if (missing.length) stop('BLOCKED', missing.join('; '));

// 3. API E2E — story IDs appear in test titles; APP uses its tag.
let passedApi = 0;
if (apiTests.length) {
  const grep = arg === 'APP' ? '@APP' : stories.map((s) => `\\(${s}\\)`).join('|');
  const report = join(ROOT, 'test-results', 'e2e-api.json');
  rmSync(report, { force: true }); // never read a previous run's results
  const api = run('npx', ['playwright', 'test', '-c', 'e2e/api/playwright.config.ts', '--grep', grep]);
  const stats = existsSync(report) ? JSON.parse(readFileSync(report, 'utf8')).stats : null;
  if (!stats) stop('FAIL', 'Playwright wrote no report');
  if (api.status !== 0 || stats.unexpected > 0 || stats.flaky > 0 || stats.skipped > 0) {
    stop('FAIL', `API E2E: ${stats.unexpected} failed, ${stats.flaky} flaky, ${stats.skipped} skipped`);
  }
  if (stats.expected !== apiTests.length) {
    stop('FAIL', `Playwright ran ${stats.expected} API tests, but the gate found ${apiTests.length}`);
  }
  passedApi = stats.expected;
}

// 4. Mobile E2E — flows carry one tag per story they cover.
if (mobileFlows.length) {
  const tags = arg === 'APP' ? 'APP' : stories.join(',');
  const mobile = run('maestro', ['test', 'e2e/mobile', '--include-tags', tags, '-e', `APP_ID=${process.env.APP_ID}`]);
  if (mobile.status !== 0) stop('FAIL', 'mobile E2E flows failed');
}

console.log(`\n${arg} gate: PASS — ${passedApi} API tests and ${mobileFlows.length} mobile flows passed`);

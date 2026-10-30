// Spec completion gate. One spec = one user story. A story spec is complete only when:
//   1. every acceptance criterion in it has an E2E test (traceability),
//   2. none of its E2E tests is still pending (test.fixme / tag "pending"),
//   3. all its API E2E tests pass, and
//   4. all its mobile E2E flows pass.
// Usage: node e2e/scripts/spec-gate.mjs US-022   (one story spec)
//        node e2e/scripts/spec-gate.mjs F05      (every story in a feature)
//        node e2e/scripts/spec-gate.mjs APP      (app-wide release gate)
// Needs E2E_API_URL and APP_ID for steps 3–4.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadTests, selectSpecs } from './lib.mjs';

const arg = process.argv[2]?.toUpperCase();
if (!arg || !/^(US-\d{3}|F\d{2}|APP)$/.test(arg)) {
  console.error('Usage: node e2e/scripts/spec-gate.mjs <US-001…US-070 | F01…F17 | APP>');
  process.exit(2);
}

const run = (cmd, args) => spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
const fail = (why) => {
  console.error(`\n${arg} gate: FAIL — ${why}`);
  process.exit(1);
};

const stories = arg === 'APP' ? [] : selectSpecs(arg).map((s) => s.id);
if (arg !== 'APP' && !stories.length) fail(`no story spec matches ${arg}`);

// 1. Traceability
if (arg !== 'APP' && run('node', ['e2e/scripts/traceability.mjs', arg]).status !== 0) {
  fail('some acceptance criteria have no E2E test');
}

// 2. Pending
const tests = loadTests().filter((t) => (arg === 'APP' ? t.tags.includes('APP') : stories.some((s) => t.tags.includes(s))));
const pending = tests.filter((t) => t.pending);
if (pending.length) {
  console.error(`\n${pending.length} of ${tests.length} E2E tests for ${arg} are still pending:`);
  for (const t of pending) console.error(`  [${t.layer}] ${t.file} — ${t.title}`);
  fail('pending E2E tests');
}

// 3. API E2E — story IDs appear in test titles; APP uses its tag.
const grep = arg === 'APP' ? '@APP' : stories.map((s) => `\\(${s}\\)`).join('|');
const api = run('npx', ['playwright', 'test', '-c', 'e2e/api/playwright.config.ts', '--grep', grep]);
const report = join(ROOT, 'test-results', 'e2e-api.json');
const stats = existsSync(report) ? JSON.parse(readFileSync(report, 'utf8')).stats : null;
if (api.status !== 0 || !stats || stats.unexpected > 0 || stats.skipped > 0) {
  fail('API E2E tests failed or were skipped');
}

// 4. Mobile E2E — flows carry one tag per story they cover.
if (!process.env.APP_ID) fail('APP_ID is not set, so mobile E2E flows cannot run');
const tags = arg === 'APP' ? 'APP' : stories.join(',');
const mobile = run('maestro', ['test', 'e2e/mobile', '--include-tags', tags, '-e', `APP_ID=${process.env.APP_ID}`]);
if (mobile.status !== 0) fail('mobile E2E flows failed');

console.log(`\n${arg} gate: PASS — ${stats.expected} API tests and all mobile flows passed`);

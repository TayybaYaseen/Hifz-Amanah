// Documentation traceability check for HifzAmanah specs.
//   1. Every spec file holds exactly one user story.
//   2. No user story appears in more than one spec.
//   3. Every story in docs/user-stories.md has a spec.
//   4. Story criteria match docs/user-stories.md word for word; detailed criteria are tagged with the
//      spec's own story, and criterion IDs are unique and gap-free per feature.
//   5. Every requirement ID cited exists in docs/SRS.md, and every ID in a feature's requirement set
//      is mapped to at least one story (unmapped IDs are warnings).
//   6. No relative Markdown link is broken.
// Usage: node scripts/check-traceability.mjs [--links-only]
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DOCS = join(ROOT, 'docs');
const SPECS = join(DOCS, 'specs');
const SKIP_DIRS = new Set(['node_modules', '.git', '.backup', 'test-results']);

const errors = [];
const warnings = [];
const rel = (p) => relative(ROOT, p).replaceAll('\\', '/');

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    if (SKIP_DIRS.has(name)) return [];
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

// ---------- 6. Links ----------
function checkLinks() {
  let count = 0;
  for (const file of walk(ROOT).filter((f) => f.endsWith('.md'))) {
    const text = readFileSync(file, 'utf8').replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
    for (const m of text.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      const target = m[1];
      if (/^(https?:|mailto:|#)/.test(target)) continue;
      const path = resolve(dirname(file), decodeURI(target.split('#')[0]));
      if (!existsSync(path)) {
        count++;
        errors.push(`[links] ${rel(file)} → ${target}`);
      }
    }
  }
  return count;
}

const linksOnly = process.argv.includes('--links-only');
const broken = checkLinks();
if (linksOnly) {
  for (const e of errors) console.log(e);
  console.log(`\nBroken relative links: ${broken}`);
  process.exit(broken ? 1 : 0);
}

// ---------- Sources ----------
const srs = readFileSync(join(DOCS, 'SRS.md'), 'utf8');
const srsIds = new Set(srs.match(/\b(?:N?FR)-[A-Z0-9]+-\d{3}[A-Z]?\b/g));

function parseUserStories() {
  const text = readFileSync(join(DOCS, 'user-stories.md'), 'utf8');
  const stories = new Map();
  for (const block of text.split(/^#### /m).slice(1)) {
    const head = block.match(/^(US-\d{3}) — (.+)$/m);
    if (!head) continue;
    const criteria = (block.split('**Acceptance criteria**')[1] ?? '')
      .split(/^#{2,3} /m)[0]
      .split('\n')
      .filter((l) => /^\d+\.\s/.test(l))
      .map((l) => l.replace(/^\d+\.\s+/, '').trim());
    stories.set(head[1], { title: head[2].trim(), criteria });
  }
  return stories;
}

/** Expands "FR-AUTH-001…011, FR-SEC-002/003" into individual IDs. */
export function expandIds(text) {
  const ids = [];
  for (const m of text.matchAll(/\b(N?FR-[A-Z0-9]+-)(\d{3}[A-Z]?)((?:\s*[…/]\s*\d{3}[A-Z]?)*)/g)) {
    const [, prefix, first, rest] = m;
    ids.push(prefix + first);
    let prev = first;
    for (const part of rest.matchAll(/([…/])\s*(\d{3}[A-Z]?)/g)) {
      if (part[1] === '…') {
        for (let n = parseInt(prev, 10) + 1; n <= parseInt(part[2], 10); n++) ids.push(prefix + String(n).padStart(3, '0'));
      } else ids.push(prefix + part[2]);
      prev = part[2];
    }
  }
  return ids;
}

// ---------- Specs ----------
const stories = parseUserStories();
const featureDirs = readdirSync(SPECS).filter((n) => /^\d{2}-f\d{2}-/.test(n) && statSync(join(SPECS, n)).isDirectory());
const specFiles = featureDirs.flatMap((d) =>
  readdirSync(join(SPECS, d)).filter((n) => /^us-\d{3}-.*\.md$/.test(n)).map((n) => join(SPECS, d, n)),
);
const strayOld = readdirSync(SPECS).filter((n) => /^F\d{2}-.*\.md$/.test(n));
for (const f of strayOld) errors.push(`[layout] old multi-story spec still present: docs/specs/${f}`);

const storyToSpec = new Map();
const acIds = new Map(); // F05-AC3 → spec file
const mappedIds = new Set();

for (const file of specFiles) {
  const text = readFileSync(file, 'utf8');
  const name = rel(file);

  // 1. Exactly one story per spec
  const declared = [...text.matchAll(/^\| \*\*User story\*\* \| (US-\d{3}) \|$/gm)].map((m) => m[1]);
  const statements = [...text.matchAll(/^\*\*(US-\d{3}) — /gm)].map((m) => m[1]);
  if (declared.length !== 1 || statements.length !== 1 || declared[0] !== statements[0]) {
    errors.push(`[one-story] ${name}: expected exactly one story, found declared=${declared} statements=${statements}`);
    continue;
  }
  const us = declared[0];
  if (!name.includes(`/${us.toLowerCase()}-`)) errors.push(`[one-story] ${name}: file name does not match ${us}`);

  // 2. No story in several specs
  if (storyToSpec.has(us)) errors.push(`[duplicate] ${us} is in ${rel(storyToSpec.get(us))} and ${name}`);
  storyToSpec.set(us, file);

  // 4a. Story criteria match user-stories.md
  const source = stories.get(us);
  if (!source) {
    errors.push(`[stories] ${name}: ${us} is not in docs/user-stories.md`);
    continue;
  }
  if (!text.includes(`**${us} — ${source.title}**`)) errors.push(`[stories] ${name}: title differs from user-stories.md`);
  const section = text.split('### Story acceptance criteria')[1]?.split(/^#{2,3} /m)[0] ?? '';
  const got = section.split('\n').filter((l) => /^\d+\.\s/.test(l)).map((l) => l.replace(/^\d+\.\s+/, '').trim());
  if (JSON.stringify(got) !== JSON.stringify(source.criteria)) {
    errors.push(`[criteria] ${name}: story criteria differ from user-stories.md (${got.length} vs ${source.criteria.length})`);
  }

  // 4b. Detailed criteria
  for (const m of text.matchAll(/^- \*\*(F\d{2}-AC\d+)\*\* — (.+)$/gm)) {
    const [, id, body] = m;
    if (acIds.has(id)) errors.push(`[criteria] ${id} appears in ${rel(acIds.get(id))} and ${name}`);
    acIds.set(id, file);
    const tag = body.match(/\((US-\d{3})\)/)?.[1];
    if (tag !== us) errors.push(`[criteria] ${name}: ${id} is tagged ${tag}, not ${us}`);
  }

  // 5a. Requirement IDs exist
  const reqSection = text.split('## Related functional requirements')[1]?.split('## Acceptance criteria')[0] ?? '';
  const primary = reqSection.split('Feature requirement set')[0];
  for (const id of expandIds(primary)) {
    mappedIds.add(id);
    if (!srsIds.has(id)) errors.push(`[requirements] ${name}: ${id} does not exist in SRS.md`);
  }
}

// 3. Every story has a spec
for (const us of stories.keys()) if (!storyToSpec.has(us)) errors.push(`[stories] ${us} has no spec`);

// 4c. Criterion IDs gap-free per feature
const byFeature = new Map();
for (const id of acIds.keys()) {
  const [f, n] = id.split('-AC');
  byFeature.set(f, [...(byFeature.get(f) ?? []), Number(n)]);
}
for (const [f, nums] of byFeature) {
  nums.sort((a, b) => a - b);
  nums.forEach((n, i) => n !== i + 1 && errors.push(`[criteria] ${f}: criterion numbering has a gap near ${f}-AC${i + 1}`));
}

// 5b. Feature requirement sets are mapped to stories
for (const d of featureDirs) {
  const readme = join(SPECS, d, 'README.md');
  if (!existsSync(readme)) {
    errors.push(`[layout] ${d} has no README.md`);
    continue;
  }
  const line = readFileSync(readme, 'utf8').match(/^\*\*Requirements:\*\* (.+)$/m)?.[1] ?? '';
  for (const id of expandIds(line)) {
    if (!srsIds.has(id)) warnings.push(`[requirements] ${d}: feature set lists ${id}, which is not defined in SRS.md`);
    else if (!mappedIds.has(id)) warnings.push(`[requirements] ${d}: ${id} is in the feature set but mapped to no story`);
  }
}

// ---------- Report ----------
console.log(`Specs: ${specFiles.length} · Stories in user-stories.md: ${stories.size} · Detailed criteria: ${acIds.size}`);
console.log(`Story criteria in user-stories.md: ${[...stories.values()].reduce((n, s) => n + s.criteria.length, 0)}`);
console.log(`Broken relative links: ${broken}`);
for (const w of warnings) console.log(`warning ${w}`);
for (const e of errors) console.log(`ERROR ${e}`);
console.log(errors.length ? `\nTraceability: FAIL (${errors.length} errors, ${warnings.length} warnings)` : `\nTraceability: OK (${warnings.length} warnings)`);
process.exit(errors.length ? 1 : 0);

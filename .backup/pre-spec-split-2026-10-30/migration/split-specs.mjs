// One-time migration: split docs/specs/F*.md (one feature, several stories) into
// docs/specs/<feature>/us-NNN-*.md (one story each) + docs/specs/<feature>/README.md (feature-level content).
// Usage: node split-specs.mjs <repo root> [--write]
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';

const ROOT = process.argv[2];
const WRITE = process.argv.includes('--write');
const DOCS = join(ROOT, 'docs');
const OLD = join(DOCS, 'specs');
const read = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const posix = (p) => p.replaceAll('\\', '/');

// ---------------- Derived mappings (SRS has no story-to-requirement table) ----------------
const REQ = {
  'US-001': 'FR-AUTH-001, FR-AUTH-002, FR-AUTH-003, FR-SEC-001, NFR-SEC-003',
  'US-002': 'FR-AUTH-007, NFR-SEC-003',
  'US-003': 'FR-AUTH-008, FR-AUTH-009',
  'US-004': 'FR-AUTH-009, FR-AUTH-010, FR-AUD-003',
  'US-005': 'FR-SEC-010, FR-AUTH-007, FR-AUTH-009',
  'US-006': 'FR-AUTH-011, FR-ORG-006',
  'US-007': 'FR-ORG-001, FR-ORG-002, FR-SEC-002, FR-CAL-006',
  'US-008': 'FR-ORG-003, FR-ORG-004, FR-ORG-005, FR-SEC-003, FR-SEC-008, FR-SEC-009',
  'US-009': 'FR-SEC-007, FR-AUD-001, FR-AUD-002, FR-AUD-003',
  'US-010': 'FR-CLS-001, FR-CLS-002',
  'US-011': 'FR-STU-001, FR-STU-003, FR-STU-004, NFR-PERF-001, NFR-PRV-001',
  'US-012': 'FR-STU-002',
  'US-013': 'FR-CAL-001, FR-CAL-006',
  'US-014': 'FR-CAL-002, FR-CAL-004, FR-CAL-005',
  'US-015': 'FR-DAY-002A, FR-DAY-007, FR-CAL-003, FR-ATT-002, NFR-UX-004',
  'US-016': 'FR-ATT-002, FR-CAL-003',
  'US-017': 'FR-CAL-005',
  'US-018': 'FR-DAY-001, FR-DAY-002, FR-DAY-002B, FR-DAY-003, FR-DAY-005, FR-DAY-006, FR-DAY-009, FR-ATT-001, FR-ATT-002, FR-ATT-007',
  'US-019': 'FR-DAY-008',
  'US-020': 'FR-SAB-001, FR-SAB-002, FR-SAB-003, FR-SAB-004',
  'US-021': 'FR-SBQ-001, FR-SBQ-002, FR-SBQ-003, FR-SBQ-004, FR-DAY-004',
  'US-022': 'FR-MNZ-001, FR-MNZ-002, FR-MNZ-003, FR-MNZ-004, FR-DAY-004, FR-QTY-007',
  'US-023': 'FR-ATT-003, FR-ATT-004, FR-ATT-005, FR-ATT-006',
  'US-024': 'FR-SAB-005, FR-I18N-006, NFR-MNT-003',
  'US-025': 'FR-SAB-001, FR-SAB-002',
  'US-026': 'FR-SAB-006, FR-QTY-002, FR-QTY-005',
  'US-027': 'FR-QTY-001, FR-QTY-002, FR-QTY-003, FR-QTY-004, FR-QTY-005, FR-QTY-006',
  'US-028': 'FR-ATT-010',
  'US-029': 'FR-ATT-010',
  'US-030': 'FR-ATT-010',
  'US-031': 'FR-ATT-008, FR-ATT-009, FR-RPT-004, FR-AI-004, FR-QTY-008',
  'US-032': 'FR-ATT-009',
  'US-033': 'FR-HW-001, FR-HW-002, FR-HW-003, FR-HW-004',
  'US-034': 'FR-HW-005, FR-QTY-005',
  'US-035': 'FR-HW-006, FR-HW-013, FR-HW-014',
  'US-036': 'FR-HW-007, FR-HW-008',
  'US-037': 'FR-HW-008, FR-HW-009, NFR-PERF-003, NFR-REL-003',
  'US-038': 'FR-HW-010, FR-HW-011, FR-HW-012, FR-HW-015',
  'US-039': 'FR-WKR-001, FR-WKR-002, FR-WKR-003, FR-WKR-004, FR-WKR-005, FR-WKR-006, FR-WKR-007, FR-WKR-008, FR-RPT-001, FR-RPT-002, FR-RPT-003, FR-RPT-004, FR-RPT-005, FR-RPT-006, FR-RPT-007, FR-RPT-008, FR-RPT-009, NFR-PERF-002, NFR-PERF-004, NFR-OFF-008',
  'US-040': 'FR-MNR-001, FR-MNR-002, FR-MNR-003, FR-MNR-004, FR-MNR-005, FR-MNR-006, FR-MNR-007',
  'US-041': 'FR-CAL-005, FR-WKR-006, FR-MNR-002',
  'US-042': 'FR-CAL-005',
  'US-043': 'FR-MNZ-003, FR-WKR-002, FR-WKR-004',
  'US-044': 'FR-PORT-001, FR-SEC-004, NFR-PORT-001, NFR-PORT-002, NFR-PORT-005',
  'US-045': 'FR-PORT-002, FR-PORT-005, FR-SEC-005, NFR-PORT-003, NFR-PORT-006',
  'US-046': 'FR-PORT-003, FR-PORT-004, FR-SEC-006, NFR-PORT-004, NFR-PRV-004',
  'US-047': 'FR-I18N-001, FR-I18N-002, FR-I18N-003, FR-I18N-004, FR-AUTH-004, FR-AUTH-005, NFR-UX-002, NFR-UX-005',
  'US-048': 'FR-I18N-001, FR-I18N-002, FR-I18N-003, FR-I18N-005, NFR-MNT-003, NFR-UX-005',
  'US-049': 'FR-I18N-001, FR-I18N-002, FR-I18N-008',
  'US-050': 'FR-I18N-006, FR-I18N-007, NFR-COMP-002',
  'US-051': 'NFR-OFF-001, NFR-OFF-002, NFR-OFF-009, NFR-OFF-010, FR-SYNC-006',
  'US-052': 'NFR-OFF-004, NFR-OFF-005, NFR-OFF-007, FR-SYNC-006, FR-SYNC-007, FR-SYNC-009',
  'US-053': 'NFR-OFF-003, NFR-OFF-007, FR-SYNC-007',
  'US-054': 'NFR-OFF-006, FR-SYNC-008, FR-SYNC-009',
  'US-055': 'FR-PDF-001, FR-EXP-001, FR-EXP-002, FR-EXP-005',
  'US-056': 'FR-PDF-002',
  'US-057': 'FR-PDF-003, FR-EXP-003',
  'US-058': 'FR-XLS-001, FR-XLS-003, FR-XLS-008, FR-XLS-009, FR-XLS-010, FR-XLS-013, FR-XLS-015, FR-XLS-016, FR-XLS-017, NFR-XLS-001',
  'US-059': 'FR-XLS-002, FR-XLS-004, FR-XLS-015, NFR-XLS-002',
  'US-060': 'FR-XLS-003, FR-XLS-004, FR-XLS-005, FR-XLS-011, FR-XLS-012, FR-XLS-014, NFR-XLS-003',
  'US-061': 'FR-XLS-006, FR-XLS-007, FR-XLS-009, FR-EXP-004, NFR-XLS-004',
  'US-062': 'FR-AI-001, NFR-AI-002, NFR-OFF-008',
  'US-063': 'FR-AI-002, FR-AI-003, FR-AI-004, FR-AI-005, FR-AI-007, FR-AI-009, FR-AI-010, FR-AI-011, NFR-AI-001, NFR-AI-004',
  'US-064': 'FR-AI-011, FR-AI-012',
  'US-065': 'FR-AI-006, FR-AI-008, NFR-AI-003',
  'US-066': 'FR-NOT-001, FR-NOT-002, FR-NOT-003, FR-SEC-006',
  'US-067': 'FR-NOT-001, FR-NOT-002',
  'US-068': 'FR-SEC-001, FR-SEC-002, FR-SEC-008, FR-SEC-009, FR-ORG-005, NFR-SEC-001, NFR-SEC-002, NFR-SEC-004, NFR-SEC-005, NFR-SEC-006, NFR-SEC-007',
  'US-069': 'FR-AUD-001, FR-AUD-002, FR-AUD-003, FR-AUD-004, NFR-PORT-006',
  'US-070': 'FR-AUTH-007, NFR-SEC-003',
};

// Feature-level edge-case rows and open questions → stories (1-based row numbers).
const EDGE = {
  F01: { 1: ['US-001'], 2: ['US-001'], 3: ['US-002'], 4: ['US-002'], 5: ['US-001'], 6: ['US-001', 'US-006'] },
  F02: { 1: ['US-008'], 2: ['US-008'], 3: ['US-007'], 4: ['US-008'], 5: ['US-007'] },
  F03: { 1: ['US-011'], 2: ['US-011'], 3: ['US-012'], 4: ['US-010'], 5: ['US-011'] },
  F04: { 1: ['US-013'], 2: ['US-015'], 3: ['US-014'], 4: ['US-017'], 5: ['US-015'] },
  F05: { 1: ['US-018'], 2: ['US-018'], 3: ['US-018'], 4: ['US-018'], 5: ['US-023'], 6: ['US-018'] },
  F06: { 1: ['US-024'], 2: ['US-025'], 3: ['US-024', 'US-025'], 4: ['US-027'], 5: ['US-025'] },
  F07: { 1: ['US-028'], 2: ['US-028'], 3: ['US-031'], 4: ['US-031'], 5: ['US-031'] },
  F08: { 1: ['US-037'], 2: ['US-035'], 3: ['US-035'], 4: ['US-038'], 5: ['US-033'] },
  F09: { 1: ['US-039', 'US-040'], 2: ['US-040', 'US-041'], 3: ['US-039'], 4: ['US-039'], 5: ['US-040'] },
  F10: { 1: ['US-045'], 2: ['US-044'], 3: ['US-044', 'US-045'], 4: ['US-046'], 5: ['US-044', 'US-045'] },
  F11: { 1: ['US-047'], 2: ['US-048'], 3: ['US-048'], 4: ['US-047'], 5: ['US-049'] },
  F12: { 1: ['US-051'], 2: ['US-052'], 3: ['US-052'], 4: ['US-053'], 5: ['US-053'] },
  F13: { 1: ['US-055'], 2: ['US-055'], 3: ['US-055'], 4: ['US-056'], 5: ['US-055'] },
  F14: { 1: ['US-058', 'US-059'], 2: ['US-058', 'US-059'], 3: ['US-059'], 4: ['US-058'], 5: ['US-059', 'US-061'] },
  F15: { 1: ['US-062', 'US-063'], 2: ['US-063'], 3: ['US-064'], 4: ['US-063'], 5: ['US-063'] },
  F16: { 1: ['US-066'], 2: ['US-066'], 3: ['US-066'], 4: ['US-066'], 5: ['US-066'] },
  F17: { 1: ['US-069'], 2: ['US-069'], 3: ['US-069'], 4: ['US-070'], 5: ['US-068'] },
};
const OPEN = {
  F01: { 1: ['US-001', 'US-002'], 2: ['US-004'], 3: ['US-001', 'US-003'], 4: ['US-001', 'US-002'], 5: ['US-002'], 6: ['US-001'] },
  F02: { 1: ['US-008'], 2: ['US-007'], 3: ['US-007'], 4: ['US-008'] },
  F03: { 1: ['US-011'], 2: ['US-012'], 3: ['US-011'], 4: ['US-010'], 5: ['US-011'] },
  F04: { 1: ['US-015'], 2: ['US-015'], 3: ['US-014'], 4: ['US-016'] },
  F05: { 1: ['US-018'], 2: ['US-018'], 3: ['US-018'], 4: ['US-018'] },
  F06: { 1: ['US-024'], 2: ['US-024'], 3: ['US-027'], 4: ['US-027'] },
  F07: { 1: ['US-028'], 2: ['US-028'] },
  F08: { 1: ['US-037'], 2: ['US-038'], 3: ['US-033'] },
  F09: { 1: ['US-039', 'US-040'], 2: ['US-040'], 3: ['US-039', 'US-040'] },
  F10: { 1: ['US-044', 'US-045'], 2: ['US-045'], 3: ['US-046'] },
  F11: { 1: ['US-048'], 2: ['US-049'], 3: ['US-048'] },
  F12: { 1: ['US-051'], 2: ['US-054'], 3: ['US-051'] },
  F13: { 1: ['US-055'], 2: ['US-056'], 3: ['US-057'] },
  F14: { 1: ['US-058'], 2: ['US-058', 'US-060'], 3: ['US-058'] },
  F15: { 1: ['US-064'], 2: ['US-065'], 3: ['US-063'], 4: ['US-065'] },
  F16: { 1: ['US-066', 'US-067'], 2: ['US-066'], 3: ['US-067'] },
  F17: { 1: ['US-069'], 2: ['US-070'], 3: ['US-069'] },
};
// SRS §9 business rule numbers per story.
const RULES = {
  'US-013': [7], 'US-014': [7], 'US-015': [6, 7], 'US-016': [6], 'US-017': [6],
  'US-018': [1, 6, 17], 'US-020': [1], 'US-021': [1, 2], 'US-022': [1, 2], 'US-023': [10, 16],
  'US-024': [15], 'US-025': [15], 'US-026': [4], 'US-027': [3, 4, 5],
  'US-028': [17], 'US-031': [17], 'US-033': [2], 'US-034': [5], 'US-035': [6, 9], 'US-036': [9], 'US-037': [9], 'US-038': [10, 11],
  'US-039': [8, 16, 17], 'US-040': [8, 16, 17], 'US-041': [6, 7], 'US-042': [6], 'US-043': [1, 2],
  'US-044': [12, 13], 'US-045': [12], 'US-046': [13], 'US-047': [14], 'US-048': [14], 'US-049': [14], 'US-050': [15],
  'US-055': [14, 15], 'US-057': [13], 'US-061': [13], 'US-062': [8, 17], 'US-063': [17], 'US-066': [13],
};
const AI_DONE_STORIES = ['US-063'];

// ---------------- Sources ----------------
const DEPENDS = {};
for (const line of read(join(OLD, 'README.md')).split('\n')) {
  const m = line.match(/^\| \[(F\d{2})\]\([^)]+\) \| [^|]+ \| [^|]+ \| (.+) \|$/);
  if (m) DEPENDS[m[1]] = m[2].trim();
}

const userStories = new Map();
{
  let epic = '';
  for (const block of read(join(DOCS, 'user-stories.md')).split(/^(?=### EPIC|#### US-)/m)) {
    const e = block.match(/^### (EPIC \d+ — .+)$/m);
    if (e) epic = e[1];
    const h = block.match(/^#### (US-\d{3}) — (.+)$/m);
    if (!h) continue;
    const statement = block.split('\n').find((l) => /^As (a|an) /.test(l));
    const criteria = (block.split('**Acceptance criteria**')[1] ?? '').split('\n').filter((l) => /^\d+\.\s/.test(l));
    userStories.set(h[1], { title: h[2].trim(), statement, criteria, epic });
  }
}

const srsRules = {};
for (const chunk of read(join(DOCS, 'SRS.md')).split(/^## 9\. Business rules/m)[1].split(/^## 10/m)[0].split(/\n(?=\d+\.\s)/)) {
  const m = chunk.match(/^(\d+)\.\s+([\s\S]+)$/);
  if (m) srsRules[m[1]] = m[2].replace(/\s+/g, ' ').trim();
}

const design = read(join(DOCS, 'design.md'));
const designHeader = design.match(/^\| Story \| Screen.+$/m)[0];
const designRows = design.split('\n').filter((l) => /^\| US-\d{3}/.test(l));
function storiesInCell(cell) {
  const ids = new Set();
  for (const m of cell.matchAll(/US-(\d{3}) to US-(\d{3})/g)) for (let n = +m[1]; n <= +m[2]; n++) ids.add(`US-${String(n).padStart(3, '0')}`);
  for (const m of cell.matchAll(/US-\d{3}/g)) ids.add(m[0]);
  return ids;
}
const archRows = read(join(DOCS, 'ARCHITECTURE.md')).split(/^## 18\./m)[1].split(/^## 19/m)[0].split('\n').filter((l) => /^\| \d+ /.test(l));

// Test inventory (E2E API, E2E mobile, unit)
function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));
}
const testFiles = [...walk(join(ROOT, 'e2e')), ...walk(join(ROOT, 'apps')), ...walk(join(ROOT, 'packages'))].filter((f) => /\.(spec|test)\.ts$|e2e[\\/]mobile[\\/].+\.yaml$/.test(f) && !f.endsWith('config.yaml'));
function testsFor(us, acIds) {
  const out = { api: [], mobile: [], unit: [] };
  const hit = (s) => s.includes(`(${us})`) || acIds.some((id) => new RegExp(`\\b${id}\\b`).test(s));
  for (const f of testFiles) {
    const text = read(f);
    const r = posix(relative(ROOT, f));
    if (r.startsWith('e2e/mobile/')) {
      if (acIds.some((id) => new RegExp(`\\b${id}\\b`).test(text))) out.mobile.push({ file: r, title: text.match(/^name:\s*(.+)$/m)[1] });
    } else {
      for (const m of text.matchAll(/(?:test|it)(?:\.fixme|\.todo|\.skip)?\(\s*'([^']+)'/g)) {
        if (hit(m[1])) (r.startsWith('e2e/') ? out.api : out.unit).push({ file: r, title: m[1] });
      }
    }
  }
  return out;
}

// ---------------- Old spec parsing ----------------
function parseOld(file) {
  const text = read(join(OLD, file));
  const id = file.slice(0, 3);
  const title = text.match(/^# (.+)$/m)[1];
  const headerLines = text.split(/^## /m)[0].split('\n').filter((l) => l.startsWith('**'));
  const sections = {};
  for (const part of text.split(/^## /m).slice(1)) {
    const name = part.split('\n')[0].trim();
    sections[name] = part.slice(part.indexOf('\n') + 1).replace(/^\n+/, '').replace(/\n+$/, '');
  }
  const acs = sections['Acceptance criteria'].split('\n').filter((l) => /^\d+\.\s/.test(l)).map((l) => {
    const [, n, body] = l.match(/^(\d+)\.\s(.*)$/);
    return { id: `${id}-AC${n}`, n: +n, body, us: body.match(/\((US-\d{3})\)/)[1] };
  });
  const storyLines = sections['User story'].split('\n').filter((l) => l.startsWith('- **US-'));
  const tableLines = (sections['Edge cases'] ?? '').split('\n').filter((l) => l.startsWith('|'));
  const edgeHeader = tableLines.slice(0, 2);
  const edgeRows = tableLines.slice(2);
  const openQs = (sections['Open questions'] ?? '').split('\n').filter((l) => l.startsWith('- [ ]'));
  return { file, id, title, headerLines, sections, acs, storyLines, edgeHeader, edgeRows, openQs, text };
}

// Re-points links written for the old layout at the right files from a new directory.
const DOC_FILES = ['design.md', 'ARCHITECTURE.md', 'SRS.md', 'user-stories.md', '00-product-brief.md', 'AGENTS.md'];
function fixLinks(text, fromDir) {
  return text.replace(/\]\(([^)\s]+)\)/g, (all, target) => {
    if (/^(https?:|mailto:|#)/.test(target)) return all;
    const [path, anchor] = target.split('#');
    const name = basename(path);
    let abs;
    if (DOC_FILES.includes(name)) abs = join(DOCS, name);
    else abs = resolve(OLD, path);
    const r = posix(relative(fromDir, abs)) || '.';
    return `](${r}${anchor ? `#${anchor}` : ''})`;
  });
}
const slug = (s) => s.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ---------------- Build ----------------
const oldFiles = readdirSync(OLD).filter((n) => /^F\d{2}-.*\.md$/.test(n)).sort();
const features = oldFiles.map(parseOld);
const before = { specs: features.length, stories: [], acs: {}, storyLines: {} };
for (const f of features) {
  for (const l of f.storyLines) before.stories.push(l.match(/US-\d{3}/)[0]);
  for (const a of f.acs) before.acs[a.id] = a.body;
}
const outputs = new Map(); // path → content
const index = [];

for (const f of features) {
  const dirName = f.file.replace(/\.md$/, '').toLowerCase();
  const dir = join(OLD, dirName);
  const featureStories = f.storyLines.map((l) => l.match(/US-\d{3}/)[0]);
  const reqLine = f.headerLines.find((l) => l.startsWith('**Stories:**'));
  const flowLine = f.headerLines.find((l) => l.startsWith('**Brief:**'));
  const statusLine = f.headerLines.find((l) => l.startsWith('**Status:**'));
  const reqSet = reqLine.split('**Requirements:**')[1].trim();
  const arch = archRows.find((r) => r.match(/\| (US-\d{3})…(\d{3}) \|/) && featureStories.includes(r.match(/\| (US-\d{3})…/)[1]));
  const files = {};
  for (const us of featureStories) files[us] = `${us.toLowerCase()}-${slug(userStories.get(us).title)}.md`;

  // ----- Story specs -----
  for (const us of featureStories) {
    const src = userStories.get(us);
    const acs = f.acs.filter((a) => a.us === us);
    const acIds = acs.map((a) => a.id);
    const specLine = f.storyLines.find((l) => l.includes(`**${us}:**`));
    const edges = f.edgeRows.filter((_, i) => (EDGE[f.id][i + 1] ?? []).includes(us));
    const opens = f.openQs.filter((_, i) => (OPEN[f.id][i + 1] ?? []).includes(us));
    const corpus = [specLine, ...acs.map((a) => a.body), ...edges].join('\n');
    const srsAcRefs = [...new Set(corpus.match(/AC-(?:QTY|ATT|HW|RPT|SEC|I18N|AI|XLS)-\d+(?:…\d+)?/g) ?? [])];
    const validation = acs.filter((a) => /error|reject|invalid|required|forbidden|refused|blocked|not accepted|cannot|no control/i.test(a.body)).map((a) => a.id);
    const offline = [...acs.filter((a) => /offline|sync|internet|connection|on this device|device/i.test(a.body)).map((a) => a.id)];
    const offlineEdges = edges.filter((e) => /offline|sync|device/i.test(e));
    const refFeatures = [...new Set(corpus.match(/\bF\d{2}\b/g) ?? [])].filter((x) => x !== f.id);
    const refStories = [...new Set(corpus.match(/US-\d{3}/g) ?? [])].filter((x) => x !== us);
    const reqs = REQ[us].split(', ');
    const frs = reqs.filter((r) => r.startsWith('FR-'));
    const nfrs = reqs.filter((r) => r.startsWith('NFR-'));
    const designMatches = designRows.filter((r) => storiesInCell(r.split('|')[1]).has(us));
    const tests = testsFor(us, acIds);
    const up = '../../../';
    const L = [];
    L.push(`# SPEC-${us} · ${src.title}`, '');
    L.push('| | |', '|---|---|');
    L.push(`| **Spec ID** | SPEC-${us} |`);
    L.push(`| **User story** | ${us} |`);
    L.push(`| **Feature** | [${f.title}](README.md) |`);
    L.push(`| **Epic** | ${src.epic} ([user-stories.md](../../user-stories.md)) |`);
    L.push(`| ${statusLine.replace('**Status:** ', '**Status** | ')} |`);
    L.push('| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |');
    L.push(`| **Split from** | \`docs/specs/${f.file}\` on 2026-10-30 |`);
    L.push('');
    L.push('## User story', '');
    L.push(`**${us} — ${src.title}**`, '');
    L.push(`${src.statement}`, '');
    L.push(`Spec wording (from ${f.id}):`, '', specLine, '');
    L.push(`**Feature context** (shared by every story in ${f.id}, copied from the feature spec):`, '');
    L.push(fixLinks(f.sections['Context'], dir).split('\n').map((l) => (l ? `> ${l}` : '>')).join('\n'), '');
    L.push('## Related functional requirements', '');
    L.push('Requirements this story covers. SRS.md has no story-to-requirement table, so this list is derived from the requirement text and the criteria below.', '');
    L.push(`- **Functional:** ${frs.join(', ') || 'None'}`);
    L.push(`- **Non-functional:** ${nfrs.join(', ') || 'Not applicable'}`);
    L.push(`- **SRS acceptance tests cited:** ${srsAcRefs.join(', ') || 'None'}`);
    L.push('');
    L.push(`Feature requirement set (verbatim from ${f.id}): ${reqSet}`, '');
    L.push('## Acceptance criteria', '');
    L.push('### Story acceptance criteria', '', 'Verbatim from [user-stories.md](../../user-stories.md).', '');
    L.push(...src.criteria, '');
    L.push('### Detailed acceptance criteria', '', `Verbatim from the ${f.id} feature spec. The original IDs are kept because tests cite them.`, '');
    if (acs.length) L.push(...acs.map((a) => `- **${a.id}** — ${a.body}`));
    else L.push('None in the feature spec.');
    L.push('');
    L.push('## Business rules', '');
    const rules = RULES[us] ?? [];
    if (rules.length) L.push('From SRS §9 (verbatim):', '', ...rules.map((n) => `- **BR-${n}:** ${srsRules[n]}`));
    else L.push('No SRS §9 business rule is specific to this story. The rules it follows are stated in the criteria above.');
    L.push('');
    L.push('## Validation rules', '');
    L.push(validation.length ? `Stated in these criteria: ${validation.join(', ')}.` : 'No validation rule beyond the criteria above.');
    L.push('');
    L.push('## Edge cases and error handling', '');
    if (edges.length) L.push(`Rows from the ${f.id} edge-case table that apply to this story (verbatim):`, '', ...f.edgeHeader, ...edges);
    else L.push(`No ${f.id} edge case is specific to this story. See the [feature edge cases](README.md#edge-cases).`);
    L.push('', `**Out of scope for the whole feature** (verbatim from ${f.id}):`, '', fixLinks(f.sections['Out of scope'], dir), '');
    L.push('## Dependencies', '');
    L.push(`- **Feature ${f.id} depends on:** ${DEPENDS[f.id] ?? '—'} (from the spec index)`);
    L.push(`- **Features referenced by this story's criteria and edge cases:** ${refFeatures.join(', ') || 'None'}`);
    L.push(`- **Other stories referenced:** ${refStories.join(', ') || 'None'}`);
    L.push(`- **Other stories in ${f.id}:** ${featureStories.filter((s) => s !== us).map((s) => `[${s}](${files[s]})`).join(', ') || 'None'}`);
    L.push('');
    L.push('## Related screens and UI', '');
    L.push(`- **Feature flow** (from ${f.id}): ${fixLinks(flowLine.split('**Flow:**')[1].trim(), dir)}`);
    if (designMatches.length) L.push('', `[design.md §13](../../design.md) story-to-screen map (verbatim):`, '', designHeader, '|---|---|---|---|---|---|', ...designMatches);
    else L.push(`- design.md §13 has no row for ${us}${us === 'US-068' ? ' (tenant isolation has no screen beyond the permission-denied state)' : ''}.`);
    L.push('');
    L.push('## Related API and data model', '');
    L.push(`- **Modules** ([ARCHITECTURE.md §18](../../ARCHITECTURE.md)): ${arch ? arch.split('|')[3].trim() : 'not listed'}`);
    L.push(`- Tables and services are described in the feature context above and in [ARCHITECTURE.md](../../ARCHITECTURE.md). Concrete API routes are not defined yet (SRS §13 #1).`);
    L.push('');
    L.push('## Offline and sync behavior', '');
    if (offline.length || offlineEdges.length) {
      if (offline.length) L.push(`Stated in these criteria: ${offline.join(', ')}.`);
      if (offlineEdges.length) L.push('', 'And in these edge cases (see above):', '', ...offlineEdges.map((e) => `- ${e.split('|')[1].trim()}`));
    } else L.push('Nothing specific to this story in the source documents.');
    L.push('');
    L.push('## Related E2E test scenarios', '');
    L.push(`**Completion gate:** this spec is complete only when \`npm run e2e:gate -- ${us}\` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](${up}e2e/README.md)).`, '');
    const list = (arr) => arr.map((t) => `- [${t.file}](${up}${t.file}) — ${t.title}`);
    L.push('**API (Playwright):**', '', ...(tests.api.length ? list(tests.api) : ['- None']), '');
    L.push('**Mobile (Maestro):**', '', ...(tests.mobile.length ? list(tests.mobile) : ['- None']), '');
    L.push('**Unit (Vitest):**', '', ...(tests.unit.length ? list(tests.unit) : ['- None']), '');
    if (AI_DONE_STORIES.includes(us) && f.sections['For AI features only: what "done" means']) {
      L.push('### For AI features only: what "done" means', '', `Verbatim from ${f.id}.`, '', fixLinks(f.sections['For AI features only: what "done" means'], dir).replace(/^\*\*/gm, '**'), '');
    }
    L.push('## Open decisions and blockers', '');
    if (opens.length) L.push(`Open questions from ${f.id} that apply to this story (verbatim):`, '', ...opens.map((q) => fixLinks(q, dir)));
    else L.push(`None specific to this story. See the [feature open questions](README.md#open-questions).`);
    L.push('');
    L.push('## Traceability', '');
    L.push(`- **Story:** ${us} → SPEC-${us} (this file)`);
    L.push(`- **Detailed criteria:** ${acIds.join(', ') || 'None'}`);
    L.push(`- **Requirements:** ${reqs.join(', ')}`);
    L.push(`- **SRS acceptance tests:** ${srsAcRefs.join(', ') || 'None'}`);
    L.push(`- **Business rules:** ${rules.map((n) => `SRS §9 #${n}`).join(', ') || 'None'}`);
    L.push(`- **Design:** ${designMatches.length ? 'design.md §13' : 'none'}; **Architecture:** ARCHITECTURE.md §18 epic ${src.epic.match(/EPIC (\d+)/)[1]}`);
    L.push(`- **Previous location:** \`docs/specs/${f.file}\``);
    L.push('');
    outputs.set(join(dir, files[us]), L.join('\n'));
    index.push({ f, us, file: `${dirName}/${files[us]}`, title: src.title, acIds });
  }

  // ----- Feature README -----
  const R = [];
  R.push(`# ${f.title}`, '');
  R.push(statusLine);
  R.push(fixLinks(flowLine, dir));
  R.push(reqLine.replace(/^\*\*Stories:\*\* .+? · /, '**Requirements:** ').replace(/^\*\*Requirements:\*\* \*\*Requirements:\*\* /, '**Requirements:** '));
  R.push(`**Stories:** ${reqLine.match(/\*\*Stories:\*\* (.+?) ·/)[1]} · **Depends on:** ${DEPENDS[f.id] ?? '—'}`, '');
  R.push(`This folder has one spec per user story. This page keeps what applies to the whole feature: context, scope, edge cases, open questions, the feature test plan, and its definition of done. Story specs repeat the edge cases and open questions that apply to them.`, '');
  R.push('## Story specs', '', '| Spec | Story | Detailed criteria |', '|---|---|---|');
  for (const us of featureStories) R.push(`| [SPEC-${us}](${files[us]}) | ${us} — ${userStories.get(us).title} | ${f.acs.filter((a) => a.us === us).map((a) => a.id).join(', ')} |`);
  R.push('');
  for (const name of Object.keys(f.sections)) {
    if (name === 'User story' || name === 'Acceptance criteria') continue;
    R.push(`## ${name}`, '', fixLinks(f.sections[name], dir), '');
  }
  outputs.set(join(dir, 'README.md'), R.join('\n'));
}

// ---------------- Verify against the before-inventory ----------------
const after = { stories: [], acs: {} };
for (const [path, content] of outputs) {
  if (basename(path) === 'README.md') continue;
  after.stories.push(content.match(/^\| \*\*User story\*\* \| (US-\d{3}) \|$/m)[1]);
  for (const m of content.matchAll(/^- \*\*(F\d{2}-AC\d+)\*\* — (.+)$/gm)) after.acs[m[1]] = m[2];
}
const problems = [];
if (JSON.stringify([...before.stories].sort()) !== JSON.stringify([...after.stories].sort())) problems.push('story inventory differs');
if (new Set(after.stories).size !== after.stories.length) problems.push('duplicate stories');
for (const [id, body] of Object.entries(before.acs)) if (after.acs[id] !== body) problems.push(`criterion ${id} not preserved verbatim`);
if (Object.keys(after.acs).length !== Object.keys(before.acs).length) problems.push('criterion count differs');
for (const us of userStories.keys()) if (!after.stories.includes(us)) problems.push(`${us} has no spec`);
const allEdge = features.reduce((n, f) => n + f.edgeRows.length, 0);
const unmappedEdge = features.flatMap((f) => f.edgeRows.filter((_, i) => !(EDGE[f.id][i + 1] ?? []).length).map(() => f.id));
const unmappedOpen = features.flatMap((f) => f.openQs.filter((_, i) => !(OPEN[f.id][i + 1] ?? []).length).map(() => f.id));
if (unmappedEdge.length || unmappedOpen.length) problems.push(`unmapped edge cases ${unmappedEdge} / open questions ${unmappedOpen}`);

const report = {
  before: { specFiles: before.specs, stories: before.stories.length, storyIds: before.stories, detailedCriteria: Object.keys(before.acs).length, edgeCaseRows: allEdge, openQuestions: features.reduce((n, f) => n + f.openQs.length, 0) },
  after: { storySpecs: after.stories.length, featureReadmes: features.length, detailedCriteria: Object.keys(after.acs).length },
  problems,
};
console.log(JSON.stringify({ ...report, before: { ...report.before, storyIds: undefined } }, null, 2));
if (WRITE) {
  if (problems.length) {
    console.error('Not writing: problems found');
    process.exit(1);
  }
  for (const [path, content] of outputs) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
  writeFileSync(join(process.cwd(), 'split-index.json'), JSON.stringify(index.map(({ f, ...r }) => ({ feature: f.id, featureTitle: f.title, ...r })), null, 2));
  writeFileSync(join(process.cwd(), 'split-audit.json'), JSON.stringify({ ...report, beforeCriteria: before.acs }, null, 2));
  console.log(`Wrote ${outputs.size} files`);
}

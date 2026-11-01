// Shared helpers for the E2E traceability and gate scripts. No dependencies beyond Node.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SPECS_DIR = join(ROOT, 'docs', 'specs');
const E2E_DIR = join(ROOT, 'e2e');

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

/**
 * One entry per story spec (docs/specs/<NN>-us-<nnn>-*.md), in implementation order:
 * { id: 'US-022', feature: 'F05', file, criteria: ['F05-AC13', 'F05-AC14'] }
 */
export function loadSpecs() {
  return walk(SPECS_DIR)
    .filter((path) => /[\\/]\d{2}-us-\d{3}-[^\\/]+\.md$/.test(path))
    .sort()
    .map((path) => {
      const text = readFileSync(path, 'utf8');
      const id = text.match(/^\| \*\*User story\*\* \| (US-\d{3}) \|$/m)[1];
      const criteria = [...text.matchAll(/^- \*\*(F\d{2}-AC\d+)\*\* — /gm)].map((m) => m[1]);
      const feature = text.match(/^\| \*\*Feature\*\* \| \[(F\d{2})/m)[1];
      return { id, feature, file: relative(ROOT, path).replaceAll('\\', '/'), criteria };
    });
}

/** Spec IDs a gate argument selects: a story (US-022), a feature (F05), or APP. */
export function selectSpecs(arg) {
  const specs = loadSpecs();
  if (/^US-\d{3}$/.test(arg)) return specs.filter((s) => s.id === arg);
  if (/^F\d{2}$/.test(arg)) return specs.filter((s) => s.feature === arg);
  return [];
}

function parseYamlTags(text) {
  const match = text.match(/^tags:\s*\n((?:\s+-\s*.+\n?)+)/m);
  return match ? match[1].split('\n').map((l) => l.replace(/^\s*-\s*/, '').trim()).filter(Boolean) : [];
}

const TAG = /^(F\d{2}|APP|US-\d{3})$/;

/** Every E2E test with the criterion IDs it cites, its spec/story tags, and whether it is still pending. */
export function loadTests() {
  const tests = [];
  for (const path of walk(E2E_DIR)) {
    const rel = relative(ROOT, path).replaceAll('\\', '/');
    const text = readFileSync(path, 'utf8');
    if (rel.startsWith('e2e/mobile/') && rel.endsWith('.yaml') && !rel.endsWith('/config.yaml')) {
      const tags = parseYamlTags(text);
      tests.push({
        file: rel,
        layer: 'mobile',
        title: text.match(/^name:\s*(.+)$/m)?.[1] ?? rel,
        ids: [...new Set(text.match(/F\d{2}-AC\d+/g) ?? [])],
        tags: tags.filter((t) => TAG.test(t)),
        pending: tags.includes('pending'),
      });
    } else if (rel.startsWith('e2e/api/') && rel.endsWith('.spec.ts')) {
      const fileTags = [...new Set((text.match(/'@(F\d{2}|APP)'/g) ?? []).map((t) => t.slice(2, -1)))];
      for (const m of text.matchAll(/test(\.fixme|\.skip)?\(\s*(['"`])((?:(?!\2).)+)\2/g)) {
        const title = m[3];
        const story = title.match(/\((US-\d{3})\)/)?.[1];
        tests.push({
          file: rel,
          layer: 'api',
          title,
          ids: [...new Set(title.match(/F\d{2}-AC\d+/g) ?? [])],
          tags: story ? [...fileTags, story] : fileTags,
          pending: Boolean(m[1]),
        });
      }
    }
  }
  return tests;
}

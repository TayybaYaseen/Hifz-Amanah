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

/** Acceptance criteria per spec, read from each spec's "## Acceptance criteria" numbered list. */
export function loadSpecs() {
  return readdirSync(SPECS_DIR)
    .filter((name) => /^F\d{2}-.*\.md$/.test(name))
    .sort()
    .map((name) => {
      const text = readFileSync(join(SPECS_DIR, name), 'utf8');
      const id = name.slice(0, 3);
      const section = text.split(/^## Acceptance criteria\s*$/m)[1]?.split(/^## /m)[0] ?? '';
      const count = section.split('\n').filter((line) => /^\d+\.\s/.test(line)).length;
      const criteria = Array.from({ length: count }, (_, i) => `${id}-AC${i + 1}`);
      return { id, file: name, criteria };
    });
}

function parseYamlTags(text) {
  const match = text.match(/^tags:\s*\n((?:\s+-\s*.+\n?)+)/m);
  return match ? match[1].split('\n').map((l) => l.replace(/^\s*-\s*/, '').trim()).filter(Boolean) : [];
}

/** Every E2E test with the criterion IDs it mentions, its spec tags, and whether it is still pending. */
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
        tags: tags.filter((t) => /^(F\d{2}|APP)$/.test(t)),
        pending: tags.includes('pending'),
      });
    } else if (rel.startsWith('e2e/api/') && rel.endsWith('.spec.ts')) {
      const fileTags = [...new Set((text.match(/'@(F\d{2}|APP)'/g) ?? []).map((t) => t.slice(2, -1)))];
      for (const m of text.matchAll(/test(\.fixme|\.skip)?\(\s*'([^']+)'/g)) {
        tests.push({
          file: rel,
          layer: 'api',
          title: m[2],
          ids: [...new Set(m[2].match(/F\d{2}-AC\d+/g) ?? [])],
          tags: fileTags,
          pending: Boolean(m[1]),
        });
      }
    }
  }
  return tests;
}

// Re-points test-file headers at the new spec folders and adds story tags (US-nnn) to Maestro flows.
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'D:/AI working/Hifz Amanah';
const idx = JSON.parse(readFileSync(new URL('./split-index.json', import.meta.url), 'utf8'));
const acToStory = new Map(idx.flatMap((r) => r.acIds.map((id) => [id, r.us])));

const walk = (d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
const files = ['e2e', 'apps', 'packages'].flatMap((d) => walk(join(ROOT, d))).filter((f) => /\.(ts|yaml)$/.test(f));

let paths = 0;
let tagged = 0;
for (const f of files) {
  let text = readFileSync(f, 'utf8');
  const before = text;
  text = text.replace(/docs\/specs\/F(\d{2})-([a-z-]+)\.md/g, (_, n, s) => `docs/specs/f${n}-${s}/`);
  if (text !== before) paths++;

  if (/[\\/]e2e[\\/]mobile[\\/]f\d{2}-/.test(f)) {
    const stories = [...new Set((text.match(/F\d{2}-AC\d+/g) ?? []).map((id) => acToStory.get(id)))].filter(Boolean).sort();
    const tagBlock = text.match(/^tags:\n((?:  - .+\n)+)/m);
    const existing = tagBlock[1].split('\n').map((l) => l.replace(/^\s*-\s*/, '')).filter(Boolean);
    const add = stories.filter((s) => !existing.includes(s));
    if (add.length) {
      text = text.replace(tagBlock[0], tagBlock[0] + add.map((s) => `  - ${s}\n`).join(''));
      tagged++;
    }
  }
  if (text !== before) writeFileSync(f, text);
}
console.log({ headerPathsUpdated: paths, flowsTagged: tagged });

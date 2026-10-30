import { readFileSync, writeFileSync } from 'node:fs';

const idx = JSON.parse(readFileSync(new URL('./split-index.json', import.meta.url), 'utf8'));
const feats = [
  ['F01', 'Identity and authentication', 'US-001 – US-006', '—'],
  ['F02', 'Organization and roles', 'US-007 – US-009', 'F01'],
  ['F03', 'Classes and students', 'US-010 – US-012', 'F02'],
  ['F04', 'Calendar and attendance', 'US-013 – US-017', 'F03, F12'],
  ['F05', 'Daily Hifz entry', 'US-018 – US-023', 'F03, F06, F07, F12'],
  ['F06', 'Quran portions and metadata', 'US-024 – US-027', 'F02'],
  ['F07', 'Mistakes and quality', 'US-028 – US-032', 'F05'],
  ['F08', 'Homework and carry forward', 'US-033 – US-038', 'F05, F06'],
  ['F09', 'Weekly and monthly reports', 'US-039 – US-043', 'F04, F05, F07, F08'],
  ['F10', 'Student and Parent access', 'US-044 – US-046', 'F09'],
  ['F11', 'Localization and accessibility', 'US-047 – US-050', '— (cross-cutting)'],
  ['F12', 'Offline and synchronization', 'US-051 – US-054', 'F01, F02'],
  ['F13', 'PDF and print', 'US-055 – US-057', 'F09, F10'],
  ['F14', 'Excel import and export', 'US-058 – US-061', 'F03, F05, F09'],
  ['F15', 'Analytics and AI recommendations', 'US-062 – US-065', 'F09'],
  ['F16', 'Notifications', 'US-066 – US-067', 'F01, F10'],
  ['F17', 'Security, audit, and administration', 'US-068 – US-070', 'F01, F02'],
];
const dirOf = (f) => idx.find((r) => r.feature === f).file.split('/')[0];

let o = `# HifzAmanah specs

**One spec = one user story.** Each of the 70 stories in [user-stories.md](../user-stories.md) has exactly one spec file. Specs are grouped into 17 feature folders, one per epic. Each folder README holds what applies to the whole feature: context, out of scope, edge cases, open questions, the feature test plan, and its definition of done.

- **Spec ID:** \`SPEC-US-<nnn>\`, in \`docs/specs/<feature>/us-<nnn>-<title>.md\`.
- **Sections in every spec:** header (spec ID, story, feature, epic, status, priority, origin) · User story · Related functional requirements · Acceptance criteria · Business rules · Validation rules · Edge cases and error handling · Dependencies · Related screens and UI · Related API and data model · Offline and sync behavior · Related E2E test scenarios · Open decisions and blockers · Traceability.
- **Acceptance criteria** come in two parts:
  - **Story criteria:** verbatim from user-stories.md.
  - **Detailed criteria:** Given/When/Then, tagged with the story, e.g. \`(US-015)\`. They keep their original IDs (\`F<nn>-AC<k>\`), and every test cites one in its name.
- **Requirement mapping:** SRS.md has no story-to-requirement table. Each spec lists the requirement IDs derived for its story, plus the feature's full requirement set verbatim.
- **Priority:** none of the source documents assigns one, so no spec states a priority.
- **Status:** all specs are **draft**. A spec moves to *ready for tickets* when its open questions are answered.
- **Completion:** a spec is complete only when \`npm run e2e:gate -- US-<nnn>\` passes. That means every criterion has an E2E test in [\`e2e/\`](../../e2e/README.md), none is pending, and all of them pass. \`npm run e2e:gate -- F<nn>\` gates a whole feature.
- **Checks:** \`npm run docs:check\` (\`scripts/check-traceability.mjs\`) verifies:
  - one story per spec and no duplicates
  - verbatim story criteria
  - requirement IDs
  - internal links
- **Test file paths** follow the proposed layout in [ARCHITECTURE.md §4](../ARCHITECTURE.md) and may change at scaffolding time.

## Features

| Feature | Stories | Depends on |
|---|---|---|
`;
for (const [f, n, s, d] of feats) o += `| [${f} · ${n}](${dirOf(f)}/README.md) | ${s} | ${d} |\n`;
o += `
**Suggested build order** (follows SRS §12): F01 → F02 → F11 → F03 → F12 → F04 → F06 → F05 → F07 → F08 → F09 → F17 → F10 → F13 → F14 → F15 → F16.

## All specs

| Spec | Story | Feature | Detailed criteria |
|---|---|---|---|
`;
for (const r of idx) o += `| [SPEC-${r.us}](${r.file}) | ${r.us} — ${r.title} | ${r.feature} | ${r.acIds.length} |\n`;
writeFileSync('D:/AI working/Hifz Amanah/docs/specs/README.md', o);
console.log(idx.length, idx.reduce((n, r) => n + r.acIds.length, 0));

import { defineConfig } from 'vitest/config';

// Integration tests start one embedded Postgres (PGlite, WASM) per test file and hash passwords with Argon2id.
// Running one per CPU at once exhausted memory on a 4-core / 13 GB machine with the Android emulator open: workers
// died with exit code 0x80000003 (V8 fatal error). They run in their own project with a small worker cap; the
// pure unit tests stay fully parallel. Override with VITEST_API_WORKERS when a machine has more headroom.
const apiWorkers = Number(process.env.VITEST_API_WORKERS ?? 2);

export default defineConfig({
  test: {
    // Specs are written ahead of implementation as it.todo; todos must not fail the run.
    passWithNoTests: true,
    projects: [
      {
        test: {
          name: 'unit',
          sequence: { groupOrder: 0 },
          // Unit tests live next to the code (including the E2E tooling scripts).
          include: ['packages/**/*.test.ts', 'apps/**/src/**/*.test.ts', 'e2e/scripts/**/*.test.mjs'],
          testTimeout: 30_000,
        },
      },
      {
        test: {
          name: 'api-integration',
          // Runs after the unit group, so the two pools never compete for memory.
          sequence: { groupOrder: 1 },
          // API integration tests (real Postgres) live in apps/api/test.
          include: ['apps/api/test/**/*.test.ts'],
          maxWorkers: apiWorkers,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});

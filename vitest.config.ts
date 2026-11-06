import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Unit tests live next to the code; API integration tests (real Postgres) live in apps/api/test.
    include: ['packages/**/*.test.ts', 'apps/**/src/**/*.test.ts', 'apps/api/test/**/*.test.ts'],
    // Specs are written ahead of implementation as it.todo; todos must not fail the run.
    passWithNoTests: true,
    // Integration tests start embedded Postgres and hash passwords with Argon2id.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});

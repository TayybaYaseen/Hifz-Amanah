import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'apps/**/src/**/*.test.ts'],
    // Specs are written ahead of implementation as it.todo; todos must not fail the run.
    passWithNoTests: true,
  },
});

import { defineConfig } from '@playwright/test';

// Black-box API E2E. Runs against a deployed test environment seeded with e2e/fixtures/personas.ts.
export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  // Tests share seeded server state, so they run one at a time.
  workers: 1,
  fullyParallel: false,
  reporter: [['list'], ['json', { outputFile: '../../test-results/e2e-api.json' }]],
  use: {
    // OPEN: SRS §13 #9/#10 — test environment URL is not decided.
    baseURL: process.env.E2E_API_URL ?? 'http://localhost:3000',
    extraHTTPHeaders: { 'Accept-Language': 'en' },
  },
});

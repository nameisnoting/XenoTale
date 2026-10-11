import { defineConfig } from '@playwright/test';
const baseURL = process.env.XENOTALE_TEST_URL || 'http://127.0.0.1:5174';
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL,
    channel: 'msedge',
    headless: true,
    trace: 'retain-on-failure',
    storageState: '.test-tmp/e2e-state.json',
  },
  webServer: {
    command: 'node scripts/serve.mjs',
    env: { XENOTALE_PORT: new URL(baseURL).port },
    url: baseURL,
    reuseExistingServer: true,
  },
  reporter: 'list',
});

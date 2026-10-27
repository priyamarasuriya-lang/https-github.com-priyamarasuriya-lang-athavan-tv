import { defineConfig } from '@playwright/test';
import { configureTestDatabase } from './tests/setup/env';

// E2E runs the app on its own port against the isolated test database (never the development database).
const testDbUrl = configureTestDatabase();
const PORT = 3100;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 240_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  globalSetup: './tests/e2e/global-setup.ts',
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Uses the installed Microsoft Edge; set PW_CHANNEL=chromium to use Playwright's bundled browser instead.
    channel: process.env.PW_CHANNEL ?? 'msedge',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    acceptDownloads: true,
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
  },
  // Production build + start: deterministic timings (no on-demand dev compilation) and closer to real use.
  webServer: {
    command: `node node_modules/next/dist/bin/next build && node node_modules/next/dist/bin/next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 600_000,
    env: { DATABASE_URL: testDbUrl, APP_URL: `http://localhost:${PORT}`, NEXT_DIST_DIR: '.next-e2e' },
  },
});

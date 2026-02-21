// @ts-check
const { defineConfig, devices } = require('@playwright/test');

/**
 * Desktop Simulation Config — runs all Playwright tests with
 * window.__TAURI_INTERNALS__ injected, exercising Tauri-specific
 * code paths (server-setup screen, updater UI, etc.).
 *
 * Usage:
 *   DESKTOP_SIMULATION=1 BASE_URL=https://nexus.example.com \
 *     npx playwright test --config=playwright.desktop.config.js
 */
module.exports = defineConfig({
  testDir: './specs',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'on',
    video: 'on-first-retry',
  },

  projects: [
    {
      name: 'desktop-simulation',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  outputDir: './test-results-desktop',

  // No webServer block — tests run against a live deployment via BASE_URL
});

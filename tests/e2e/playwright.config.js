// @ts-check
const { defineConfig, devices } = require('@playwright/test');

/**
 * Nexus UI Uptime Test Suite — Playwright Configuration
 *
 * Tests verify that all UI components render correctly, input fields are
 * functional, and the interface behaves as expected on desktop and mobile.
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
    // ── Desktop browsers ──
    {
      name: 'desktop-chrome',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'desktop-firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    // ── Mobile viewports ──
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 13'] },
    },

    // ── Tablet ──
    {
      name: 'tablet',
      use: { ...devices['iPad (gen 7)'] },
    },
  ],

  outputDir: './test-results',

  /* Start the client dev server before running tests */
  webServer: {
    command: 'npm start',
    cwd: '../../client',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});

// @ts-check
const { test, expect } = require('@playwright/test');
const { takeScreenshot, navigateToApp, showServerSetupScreen } = require('../helpers/test-utils');
const { captureScreenshot } = require('../helpers/screenshots');

test.describe('Server Setup Screen — Uptime Tests', () => {
  test.beforeEach(async ({ page }) => {
    await navigateToApp(page);
    await showServerSetupScreen(page);
    await page.waitForSelector('.server-setup-screen', { timeout: 15000 });
  });

  test('renders the server setup screen', async ({ page }) => {
    await expect(page.locator('.server-setup-screen')).toBeVisible();
    await captureScreenshot(page, 'server-setup', 'initial-render');
  });

  test('displays the Nexus logo and branding', async ({ page }) => {
    await expect(page.locator('.login-logo-icon')).toBeVisible();
    await expect(page.locator('.login-logo-text')).toHaveText('NEXUS');
  });

  test('displays title and subtitle text', async ({ page }) => {
    await expect(page.locator('.server-setup-title')).toHaveText('Connect to a Server');
    await expect(page.locator('.server-setup-subtitle')).toContainText('Enter the URL');
  });

  test('server URL input field is present and functional', async ({ page }) => {
    const input = page.locator('.login-input');
    await expect(input).toBeVisible();
    await expect(input).toBeEditable();
    await expect(input).toHaveAttribute('placeholder', 'nexus.example.com');

    // Type a URL
    await input.fill('test.example.com');
    await expect(input).toHaveValue('test.example.com');
    await captureScreenshot(page, 'server-setup', 'url-filled');
  });

  test('server URL input clears correctly', async ({ page }) => {
    const input = page.locator('.login-input');
    await input.fill('some-url.com');
    await expect(input).toHaveValue('some-url.com');

    await input.fill('');
    await expect(input).toHaveValue('');
  });

  test('connect button is present and disabled when empty', async ({ page }) => {
    const btn = page.locator('.login-btn');
    await expect(btn).toBeVisible();
    await expect(btn).toHaveText('Connect');
    await expect(btn).toBeDisabled();
  });

  test('connect button enables when URL is entered', async ({ page }) => {
    const input = page.locator('.login-input');
    const btn = page.locator('.login-btn');

    await input.fill('nexus.example.com');
    await expect(btn).toBeEnabled();
    await captureScreenshot(page, 'server-setup', 'button-enabled');
  });

  test('shows hint text with URL examples', async ({ page }) => {
    const hint = page.locator('.server-setup-hint');
    await expect(hint).toBeVisible();
    await expect(hint).toContainText('https://nexus.example.com');
    await expect(hint).toContainText('192.168.1.100:3001');
  });

  test('form submits on Enter key', async ({ page }) => {
    const input = page.locator('.login-input');
    await input.fill('invalid.test.local');
    await input.press('Enter');

    // Should show connecting state or error
    const btn = page.locator('.login-btn');
    // Button should show 'Connecting...' briefly or an error appears
    await expect(
      btn.filter({ hasText: 'Connecting...' })
        .or(page.locator('.login-error'))
    ).toBeVisible({ timeout: 10000 });

    await captureScreenshot(page, 'server-setup', 'after-submit');
  });

  test('shows error for unreachable server URL', async ({ page }) => {
    const input = page.locator('.login-input');
    await input.fill('https://nonexistent.invalid.test');
    await page.locator('.login-btn').click();

    // Wait for error message
    await expect(page.locator('.login-error')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.login-error')).toContainText(/Could not connect|timed out/);
    await captureScreenshot(page, 'server-setup', 'error-state');
  });

  test('input field has autofocus', async ({ page }) => {
    const input = page.locator('.login-input');
    await expect(input).toHaveAttribute('type', 'text');
    // Autofocus should be set
    await expect(input).toBeFocused();
  });

  test('connect button shows loading state during connection attempt', async ({ page }) => {
    await page.locator('.login-input').fill('https://nonexistent.test');
    await page.locator('.login-btn').click();

    // Button should enter loading state
    await expect(page.locator('.login-btn')).toHaveText('Connecting...');
    // Input should be disabled during connection
    await expect(page.locator('.login-input')).toBeDisabled();
    await captureScreenshot(page, 'server-setup', 'loading-state');
  });
});

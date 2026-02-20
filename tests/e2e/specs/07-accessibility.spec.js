// @ts-check
const { test, expect } = require('@playwright/test');
const { navigateToApp, showLoginScreen, VIEWPORTS } = require('../helpers/test-utils');
const { captureScreenshot } = require('../helpers/screenshots');

/**
 * Accessibility and usability uptime tests.
 * Verifies keyboard navigation, focus management, and ARIA attributes.
 */
test.describe('Accessibility — Uptime Tests', () => {

  test.describe('Keyboard navigation on login screen', () => {
    test.beforeEach(async ({ page }) => {
      await navigateToApp(page);
      await showLoginScreen(page);
      await page.waitForSelector('.login-screen', { timeout: 15000 });
    });

    test('Tab key navigates through form fields', async ({ page }) => {
      // Focus should start somewhere on the page
      await page.keyboard.press('Tab');

      // After tabbing, an input should be focused
      const focused = await page.evaluate(() => document.activeElement?.tagName);
      expect(['INPUT', 'BUTTON', 'TEXTAREA', 'A']).toContain(focused);
    });

    test('can fill form using keyboard only', async ({ page }) => {
      const usernameInput = page.locator('.login-input').nth(0);
      await usernameInput.focus();
      await page.keyboard.type('keyboarduser');
      await expect(usernameInput).toHaveValue('keyboarduser');

      await page.keyboard.press('Tab');
      await page.keyboard.type('keyboardpass');

      const passwordInput = page.locator('.login-input').nth(1);
      await expect(passwordInput).toHaveValue('keyboardpass');
    });

    test('Enter key submits the form from password field', async ({ page }) => {
      await page.locator('.login-input').nth(0).fill('enteruser');
      await page.locator('.login-input').nth(1).fill('enterpass');
      await page.locator('.login-input').nth(1).press('Enter');

      // Form should submit
      await expect(
        page.locator('.login-btn:has-text("Please wait...")')
          .or(page.locator('.login-error'))
      ).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Form labels and attributes', () => {
    test.beforeEach(async ({ page }) => {
      await navigateToApp(page);
      await showLoginScreen(page);
      await page.waitForSelector('.login-screen', { timeout: 15000 });
    });

    test('all input fields have associated labels', async ({ page }) => {
      const labels = page.locator('.login-label');
      const labelCount = await labels.count();
      const inputCount = await page.locator('.login-input').count();

      // Should have at least as many labels as inputs
      expect(labelCount).toBeGreaterThanOrEqual(inputCount);
    });

    test('password fields use type=password', async ({ page }) => {
      const passwordField = page.locator('.login-input[type="password"]');
      await expect(passwordField).toHaveCount(1);

      // Switch to register - should have 2 password fields
      await page.locator('.login-switch button').click();
      await expect(page.locator('.login-input[type="password"]')).toHaveCount(2);
    });

    test('username field uses type=text', async ({ page }) => {
      const textField = page.locator('.login-input[type="text"]');
      await expect(textField).toHaveCount(1);
    });

    test('disabled button cannot be clicked', async ({ page }) => {
      const btn = page.locator('.login-btn');
      await expect(btn).toBeDisabled();

      // Attempting to click should not submit
      await btn.click({ force: true });
      // No loading state should appear
      await expect(btn).not.toHaveText('Please wait...');
    });
  });

  test.describe('Visual regression anchors', () => {
    test('login screen full-page screenshot at desktop resolution', async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.desktop);
      await navigateToApp(page);
      await showLoginScreen(page);
      await page.waitForSelector('.login-screen', { timeout: 15000 });
      await captureScreenshot(page, 'visual-regression', 'login-desktop-1440x900');
    });

    test('login screen full-page screenshot at mobile resolution', async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.mobile);
      await navigateToApp(page);
      await showLoginScreen(page);
      await page.waitForSelector('.login-screen', { timeout: 15000 });
      await captureScreenshot(page, 'visual-regression', 'login-mobile-375x812');
    });

    test('login screen full-page screenshot at tablet resolution', async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.tablet);
      await navigateToApp(page);
      await showLoginScreen(page);
      await page.waitForSelector('.login-screen', { timeout: 15000 });
      await captureScreenshot(page, 'visual-regression', 'login-tablet-810x1080');
    });

    test('register screen full-page screenshot at all resolutions', async ({ page }) => {
      for (const [name, size] of Object.entries({
        desktop: VIEWPORTS.desktop,
        mobile: VIEWPORTS.mobile,
        tablet: VIEWPORTS.tablet,
      })) {
        await page.setViewportSize(size);
        await navigateToApp(page);
        await showLoginScreen(page);
        await page.waitForSelector('.login-screen', { timeout: 15000 });
        await page.locator('.login-switch button').click();
        await page.waitForSelector('.login-title:has-text("Create account")');
        await captureScreenshot(page, 'visual-regression', `register-${name}`);
      }
    });
  });
});

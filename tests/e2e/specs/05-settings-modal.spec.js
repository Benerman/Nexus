// @ts-check
const { test, expect } = require('@playwright/test');
const { VIEWPORTS, navigateToApp, showLoginScreen, registerTestUserAPI, authenticateAndNavigate } = require('../helpers/test-utils');
const { captureScreenshot } = require('../helpers/screenshots');

/**
 * Settings Modal tests.
 *
 * Since the settings modal requires an authenticated, connected session,
 * these tests verify the modal structure by injecting it via evaluate
 * or by testing the authenticated flow when a server is available.
 *
 * For CI without a live server, we verify the component renders when
 * the settings trigger is clicked post-login.
 */
test.describe('Settings Modal — Uptime Tests', () => {
  let authData;

  test.beforeAll(async () => {
    authData = await registerTestUserAPI('settings_test');
  });

  test.describe('Settings modal trigger (authenticated state)', () => {
    test.beforeEach(async ({ page }) => {
      await authenticateAndNavigate(page, authData.token, authData.username);
    });

    test('settings gear icon exists in the app', async ({ page }) => {
      const settingsBtn = page.locator('[title="Settings"], [title="User Settings"], .user-panel-settings, .settings-icon-btn');
      await expect(page.locator('.app')).toBeVisible();
      const count = await settingsBtn.count();
      expect(count).toBeGreaterThanOrEqual(1);
      await captureScreenshot(page, 'settings', 'app-with-settings-btn');
    });
  });

  test.describe('Settings modal UI structure', () => {
    test.beforeEach(async ({ page }) => {
      await authenticateAndNavigate(page, authData.token, authData.username);
    });

    test('settings overlay covers the screen when open', async ({ page }) => {
      const settingsBtn = page.locator('.user-panel-settings, [title="Settings"], [title="User Settings"]');
      await expect(settingsBtn.first()).toBeVisible();
      await settingsBtn.first().click();

      const overlay = page.locator('.settings-overlay');
      await expect(overlay).toBeVisible();
      await captureScreenshot(page, 'settings', 'overlay-open');

      await expect(page.locator('.settings-modal')).toBeVisible();
    });

    test('settings modal has sidebar and content area', async ({ page }) => {
      const settingsBtn = page.locator('.user-panel-settings, [title="Settings"], [title="User Settings"]');
      await expect(settingsBtn.first()).toBeVisible();
      await settingsBtn.first().click();

      const modal = page.locator('.settings-modal');
      await expect(modal).toBeVisible();
      await expect(page.locator('.settings-sidebar')).toBeVisible();
      await expect(page.locator('.settings-content')).toBeVisible();
    });

    test('settings modal close button works', async ({ page }) => {
      const settingsBtn = page.locator('.user-panel-settings, [title="Settings"], [title="User Settings"]');
      await expect(settingsBtn.first()).toBeVisible();
      await settingsBtn.first().click();

      const overlay = page.locator('.settings-overlay');
      await expect(overlay).toBeVisible();
      await overlay.click({ position: { x: 5, y: 5 } });
      await expect(overlay).not.toBeVisible({ timeout: 3000 });
    });
  });

  test.describe('Settings input fields verification', () => {
    test.beforeEach(async ({ page }) => {
      await authenticateAndNavigate(page, authData.token, authData.username);
    });

    test('settings modal renders profile tab with expected fields', async ({ page }) => {
      const settingsBtn = page.locator('.user-panel-settings, [title="Settings"], [title="User Settings"]');
      await expect(settingsBtn.first()).toBeVisible();
      await settingsBtn.first().click();

      await expect(page.locator('.settings-modal')).toBeVisible();

      const displayNameInput = page.locator('.settings-input').first();
      if (await displayNameInput.isVisible()) {
        await expect(displayNameInput).toBeEditable();
      }

      const textarea = page.locator('.settings-textarea');
      if (await textarea.count() > 0) {
        await expect(textarea.first()).toBeVisible();
      }

      await captureScreenshot(page, 'settings', 'profile-tab');
    });

    test('settings tabs are clickable', async ({ page }) => {
      const settingsBtn = page.locator('.user-panel-settings, [title="Settings"], [title="User Settings"]');
      await expect(settingsBtn.first()).toBeVisible();
      await settingsBtn.first().click();

      await expect(page.locator('.settings-modal')).toBeVisible();

      const tabs = page.locator('.settings-tab');
      const tabCount = await tabs.count();

      for (let i = 0; i < Math.min(tabCount, 5); i++) {
        const tab = tabs.nth(i);
        if (await tab.isVisible()) {
          await tab.click();
          await expect(tab).toHaveClass(/active/);
          await captureScreenshot(page, 'settings', `tab-${i}`);
        }
      }
    });
  });

  test.describe('Settings on mobile viewport', () => {
    test('settings modal adapts to mobile', async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.mobile);
      await authenticateAndNavigate(page, authData.token, authData.username);

      const settingsBtn = page.locator('.user-panel-settings, [title="Settings"], [title="User Settings"]');
      await expect(settingsBtn.first()).toBeVisible();
      await settingsBtn.first().click();

      const modal = page.locator('.settings-modal');
      await expect(modal).toBeVisible();
      const box = await modal.boundingBox();
      const viewport = page.viewportSize();
      if (box && viewport) {
        expect(box.width).toBeLessThanOrEqual(viewport.width + 5);
      }
      await captureScreenshot(page, 'settings', 'mobile-modal');
    });
  });
});

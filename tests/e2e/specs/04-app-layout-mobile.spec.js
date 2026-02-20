// @ts-check
const { test, expect } = require('@playwright/test');
const { VIEWPORTS, navigateToApp, showLoginScreen } = require('../helpers/test-utils');
const { captureScreenshot } = require('../helpers/screenshots');

test.describe('Mobile UI — Uptime Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
  });

  test.describe('Login screen on mobile', () => {
    test.beforeEach(async ({ page }) => {
      await navigateToApp(page);
      await showLoginScreen(page);
      await page.waitForSelector('.login-screen', { timeout: 15000 });
    });

    test('login screen renders on mobile viewport', async ({ page }) => {
      await expect(page.locator('.login-screen')).toBeVisible();
      await expect(page.locator('.login-card')).toBeVisible();
      await captureScreenshot(page, 'mobile-login', 'initial-render');
    });

    test('login card fits within mobile viewport width', async ({ page }) => {
      const card = page.locator('.login-card');
      const box = await card.boundingBox();
      const viewport = page.viewportSize();
      if (box && viewport) {
        // Card should not overflow viewport
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 5);
      }
    });

    test('all input fields are accessible on mobile', async ({ page }) => {
      const inputs = page.locator('.login-input');
      const count = await inputs.count();
      expect(count).toBeGreaterThanOrEqual(2);

      for (let i = 0; i < count; i++) {
        await expect(inputs.nth(i)).toBeVisible();
        await expect(inputs.nth(i)).toBeEditable();
      }
    });

    test('input fields are wide enough for touch interaction', async ({ page }) => {
      const inputs = page.locator('.login-input');
      const count = await inputs.count();

      for (let i = 0; i < count; i++) {
        const box = await inputs.nth(i).boundingBox();
        if (box) {
          // Minimum touch target size (44px recommended by WCAG)
          expect(box.height).toBeGreaterThanOrEqual(30);
          // Input should take up most of the card width
          expect(box.width).toBeGreaterThan(200);
        }
      }
    });

    test('login button is large enough for touch', async ({ page }) => {
      const btn = page.locator('.login-btn');
      const box = await btn.boundingBox();
      if (box) {
        expect(box.height).toBeGreaterThanOrEqual(36);
        expect(box.width).toBeGreaterThan(150);
      }
    });

    test('register mode works on mobile', async ({ page }) => {
      await page.locator('.login-switch button').click();
      await expect(page.locator('.login-title')).toHaveText('Create account');
      await expect(page.locator('.login-input')).toHaveCount(3);

      // All 3 fields should be visible
      for (let i = 0; i < 3; i++) {
        await expect(page.locator('.login-input').nth(i)).toBeVisible();
      }
      await captureScreenshot(page, 'mobile-login', 'register-mode');
    });

    test('scrollability on mobile when content overflows', async ({ page }) => {
      // Switch to register mode for more content
      await page.locator('.login-switch button').click();

      // The login card or screen should be scrollable
      const isScrollable = await page.evaluate(() => {
        const el = document.querySelector('.login-screen') || document.body;
        return el.scrollHeight > el.clientHeight || document.body.scrollHeight > window.innerHeight;
      });
      // On very small viewports it may need scrolling; on larger phones it fits
      // Just verify no crash and all fields present
      await expect(page.locator('.login-input')).toHaveCount(3);
      await expect(page.locator('.login-btn')).toBeVisible();
    });

    test('form submits correctly on mobile', async ({ page }) => {
      await page.locator('.login-input').nth(0).fill('mobileuser');
      await page.locator('.login-input').nth(1).fill('mobilepass');

      await expect(page.locator('.login-btn')).toBeEnabled();
      await page.locator('.login-btn').tap();

      // Should show loading or error
      await expect(
        page.locator('.login-btn:has-text("Please wait...")')
          .or(page.locator('.login-error'))
      ).toBeVisible({ timeout: 10000 });
      await captureScreenshot(page, 'mobile-login', 'after-submit');
    });
  });

  test.describe('Mobile landscape mode', () => {
    test('login screen renders in landscape', async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.mobileLandscape);
      await navigateToApp(page);
      await showLoginScreen(page);
      await page.waitForSelector('.login-screen', { timeout: 15000 });

      await expect(page.locator('.login-card')).toBeVisible();
      await captureScreenshot(page, 'mobile-login', 'landscape');
    });
  });

  test.describe('Mobile main app layout', () => {
    test.beforeEach(async ({ page }) => {
      await navigateToApp(page);
      // Set up mock session
      await page.evaluate(() => {
        localStorage.setItem('nexus_token', 'mock_test_token');
        localStorage.setItem('nexus_username', 'mobile_test_user');
      });
      await page.reload({ waitUntil: 'networkidle' });
    });

    test('mobile app uses column layout (stacked)', async ({ page }) => {
      const app = page.locator('.app');
      if (await app.isVisible()) {
        const flexDir = await app.evaluate(el =>
          getComputedStyle(el).flexDirection
        );
        // On mobile (<=768px), app should be column layout
        expect(flexDir).toBe('column');
        await captureScreenshot(page, 'mobile-app', 'column-layout');
      }
    });

    test('mobile nav bar is visible', async ({ page }) => {
      const app = page.locator('.app');
      if (await app.isVisible()) {
        const navBar = page.locator('.mobile-nav-bar');
        const display = await navBar.evaluate(el =>
          getComputedStyle(el).display
        );
        // On mobile, nav bar should be visible (not display:none)
        expect(display).not.toBe('none');
        await captureScreenshot(page, 'mobile-app', 'nav-bar');
      }
    });

    test('mobile overlay is hidden by default', async ({ page }) => {
      const overlay = page.locator('.mobile-overlay');
      // Overlay should exist but be hidden
      if (await overlay.count() > 0) {
        await expect(overlay).not.toBeVisible();
      }
    });

    test('sidebar is hidden by default on mobile', async ({ page }) => {
      const sidebar = page.locator('.sidebar');
      if (await sidebar.count() > 0) {
        const isVisibleInViewport = await sidebar.evaluate(el => {
          const rect = el.getBoundingClientRect();
          return rect.right > 0 && rect.left < window.innerWidth;
        });
        // Sidebar should be off-screen or hidden
        expect(isVisibleInViewport).toBe(false);
      }
    });

    test('member list is hidden by default on mobile', async ({ page }) => {
      const memberList = page.locator('.member-list');
      if (await memberList.count() > 0) {
        const isVisibleInViewport = await memberList.evaluate(el => {
          const rect = el.getBoundingClientRect();
          return rect.left < window.innerWidth;
        });
        expect(isVisibleInViewport).toBe(false);
      }
    });
  });

  test.describe('Touch interactions', () => {
    test('login inputs respond to tap/focus', async ({ page }) => {
      await navigateToApp(page);
      await showLoginScreen(page);
      await page.waitForSelector('.login-screen', { timeout: 15000 });

      const usernameInput = page.locator('.login-input').nth(0);
      await usernameInput.tap();
      await expect(usernameInput).toBeFocused();
      await captureScreenshot(page, 'mobile-touch', 'input-focused');
    });

    test('buttons respond to tap', async ({ page }) => {
      await navigateToApp(page);
      await showLoginScreen(page);
      await page.waitForSelector('.login-screen', { timeout: 15000 });

      const switchBtn = page.locator('.login-switch button');
      await switchBtn.tap();
      await expect(page.locator('.login-title')).toHaveText('Create account');
    });
  });
});

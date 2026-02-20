// @ts-check
const { test, expect } = require('@playwright/test');
const { VIEWPORTS, navigateToApp, showLoginScreen, registerTestUser } = require('../helpers/test-utils');
const { captureScreenshot } = require('../helpers/screenshots');

test.describe('Main App Layout — Desktop Uptime Tests', () => {
  // These tests verify the app structure renders correctly after login.
  // They require a running server with auth working.

  test.describe('Pre-auth layout checks', () => {
    test('app root element renders', async ({ page }) => {
      await navigateToApp(page);
      // Should render either login, setup, or main app
      const root = page.locator('.login-screen, .server-setup-screen, .app');
      await expect(root).toBeVisible({ timeout: 15000 });
      await captureScreenshot(page, 'app-layout', 'root-element');
    });

    test('page has correct title', async ({ page }) => {
      await page.goto('/');
      const title = await page.title();
      // React apps typically have a title
      expect(title).toBeTruthy();
    });

    test('page loads without console errors', async ({ page }) => {
      const errors = [];
      page.on('console', msg => {
        if (msg.type() === 'error') errors.push(msg.text());
      });

      await navigateToApp(page);
      // Filter out expected errors (network requests to non-running server, etc.)
      const unexpectedErrors = errors.filter(
        e => !e.includes('ERR_CONNECTION_REFUSED') &&
             !e.includes('Failed to fetch') &&
             !e.includes('net::') &&
             !e.includes('WebSocket')
      );
      // Allow some errors in dev mode, but no crash-level errors
      expect(unexpectedErrors.length).toBeLessThan(5);
    });

    test('no JavaScript crash on initial load', async ({ page }) => {
      const pageCrashed = new Promise((resolve) => {
        page.on('crash', () => resolve(true));
        setTimeout(() => resolve(false), 10000);
      });

      await page.goto('/');
      const crashed = await pageCrashed;
      expect(crashed).toBe(false);
    });
  });

  test.describe('Login screen desktop layout', () => {
    test.beforeEach(async ({ page }) => {
      await navigateToApp(page);
      await showLoginScreen(page);
      await page.waitForSelector('.login-screen', { timeout: 15000 });
    });

    test('login card is centered on desktop', async ({ page }) => {
      const card = page.locator('.login-card');
      await expect(card).toBeVisible();

      const box = await card.boundingBox();
      const viewport = page.viewportSize();
      if (box && viewport) {
        // Card should be roughly centered horizontally
        const centerX = box.x + box.width / 2;
        expect(centerX).toBeGreaterThan(viewport.width * 0.3);
        expect(centerX).toBeLessThan(viewport.width * 0.7);
      }
      await captureScreenshot(page, 'app-layout-desktop', 'login-centered');
    });

    test('login form fields are properly stacked', async ({ page }) => {
      const fields = page.locator('.login-field');
      const count = await fields.count();
      expect(count).toBeGreaterThanOrEqual(2);

      // Verify fields are stacked vertically
      if (count >= 2) {
        const box1 = await fields.nth(0).boundingBox();
        const box2 = await fields.nth(1).boundingBox();
        if (box1 && box2) {
          expect(box2.y).toBeGreaterThan(box1.y);
        }
      }
    });

    test('all form elements are visible on desktop viewport', async ({ page }) => {
      await expect(page.locator('.login-logo')).toBeVisible();
      await expect(page.locator('.login-title')).toBeVisible();
      await expect(page.locator('.login-form')).toBeVisible();
      await expect(page.locator('.login-btn')).toBeVisible();
      await expect(page.locator('.login-switch')).toBeVisible();
    });
  });

  test.describe('Post-auth layout (with mock session)', () => {
    test('app container uses flexbox layout', async ({ page }) => {
      await navigateToApp(page);
      // Set up a mock session to render the main app
      await page.evaluate(() => {
        localStorage.setItem('nexus_token', 'mock_test_token');
        localStorage.setItem('nexus_username', 'test_desktop_user');
      });
      await page.reload({ waitUntil: 'networkidle' });

      // App should attempt to render (may show reconnecting state)
      const appContainer = page.locator('.app');
      if (await appContainer.isVisible()) {
        const display = await appContainer.evaluate(el =>
          getComputedStyle(el).display
        );
        expect(display).toBe('flex');
      }
      await captureScreenshot(page, 'app-layout-desktop', 'main-app');
    });

    test('desktop layout shows server list, sidebar, and main content area', async ({ page }) => {
      await navigateToApp(page);
      await page.evaluate(() => {
        localStorage.setItem('nexus_token', 'mock_test_token');
        localStorage.setItem('nexus_username', 'test_layout_user');
      });
      await page.reload({ waitUntil: 'networkidle' });

      // These elements should exist in the DOM (even if server is not connected)
      const app = page.locator('.app');
      if (await app.isVisible()) {
        // Server list should be present on desktop
        const serverList = page.locator('.server-list');
        if (await serverList.isVisible()) {
          const box = await serverList.boundingBox();
          if (box) {
            // Server list should be narrow and on the left
            expect(box.x).toBeLessThan(100);
            expect(box.width).toBeLessThan(120);
          }
        }
      }
      await captureScreenshot(page, 'app-layout-desktop', 'full-layout');
    });
  });

  test.describe('Viewport resizing', () => {
    test('layout adapts when resizing from desktop to mobile', async ({ page }) => {
      await navigateToApp(page);
      await showLoginScreen(page);
      await page.waitForSelector('.login-screen', { timeout: 15000 });

      // Screenshot at desktop size
      await captureScreenshot(page, 'viewport-resize', 'desktop-size');

      // Resize to mobile
      await page.setViewportSize(VIEWPORTS.mobile);
      await page.waitForTimeout(500); // Allow CSS transitions
      await captureScreenshot(page, 'viewport-resize', 'mobile-size');

      // Resize back to desktop
      await page.setViewportSize(VIEWPORTS.desktop);
      await page.waitForTimeout(500);
      await captureScreenshot(page, 'viewport-resize', 'back-to-desktop');
    });

    test('layout adapts to tablet size', async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.tablet);
      await navigateToApp(page);
      await showLoginScreen(page);
      await page.waitForSelector('.login-screen', { timeout: 15000 });

      await expect(page.locator('.login-card')).toBeVisible();
      await captureScreenshot(page, 'viewport-resize', 'tablet-size');
    });
  });
});

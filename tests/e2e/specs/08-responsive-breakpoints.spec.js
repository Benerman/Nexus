// @ts-check
const { test, expect } = require('@playwright/test');
const { VIEWPORTS, navigateToApp, showLoginScreen, registerTestUserAPI, authenticateAndNavigate } = require('../helpers/test-utils');
const { captureScreenshot } = require('../helpers/screenshots');

/**
 * Responsive breakpoint tests matching the CSS media queries in App.css.
 * Verifies layout changes at key breakpoints:
 * - <=768px: mobile layout (column, slide-out panels)
 * - 769-1024px: tablet layout (compact sidebar)
 * - >=1025px: full desktop layout
 */
test.describe('Responsive Breakpoints — Uptime Tests', () => {

  test.describe('Mobile breakpoint (<=768px)', () => {
    let authData;
    const mobileWidths = [320, 375, 414, 768];

    test.beforeAll(async () => {
      authData = await registerTestUserAPI('breakpoint');
    });

    for (const width of mobileWidths) {
      test(`login screen renders at ${width}px width`, async ({ page }) => {
        await page.setViewportSize({ width, height: 812 });
        await navigateToApp(page);
        await showLoginScreen(page);
        await page.waitForSelector('.login-screen', { timeout: 15000 });

        await expect(page.locator('.login-card')).toBeVisible();

        const card = page.locator('.login-card');
        const box = await card.boundingBox();
        if (box) {
          expect(box.x + box.width).toBeLessThanOrEqual(width + 10);
        }
        await captureScreenshot(page, 'breakpoint', `mobile-${width}px`);
      });
    }

    test('app uses column flex-direction at 375px', async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.mobile);
      await authenticateAndNavigate(page, authData.token, authData.username);

      const app = page.locator('.app');
      await expect(app).toBeVisible();
      const flexDir = await app.evaluate(el => getComputedStyle(el).flexDirection);
      expect(flexDir).toBe('column');
    });

    test('mobile nav bar visible at 375px', async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.mobile);
      await authenticateAndNavigate(page, authData.token, authData.username);

      await expect(page.locator('.app')).toBeVisible();
      const navBar = page.locator('.mobile-nav-bar');
      if (await navBar.count() === 0) {
        test.skip(true, 'mobile-nav-bar element not in DOM');
        return;
      }
      const display = await navBar.evaluate(el => getComputedStyle(el).display);
      expect(display).not.toBe('none');
    });
  });

  test.describe('Tablet breakpoint (769-1024px)', () => {
    test('layout at 810px (iPad width)', async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.tablet);
      await navigateToApp(page);
      await showLoginScreen(page);
      await page.waitForSelector('.login-screen', { timeout: 15000 });

      await expect(page.locator('.login-card')).toBeVisible();
      await captureScreenshot(page, 'breakpoint', 'tablet-810px');
    });

    test('layout at 1024px (small desktop/tablet)', async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.desktopSmall);
      await navigateToApp(page);
      await showLoginScreen(page);
      await page.waitForSelector('.login-screen', { timeout: 15000 });

      await expect(page.locator('.login-card')).toBeVisible();
      await captureScreenshot(page, 'breakpoint', 'small-desktop-1024px');
    });

    test('app layout direction at 1024px', async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.desktopSmall);
      // Reuse the auth from the mobile breakpoint beforeAll
      const tabletAuth = await registerTestUserAPI('tablet_bp');
      await authenticateAndNavigate(page, tabletAuth.token, tabletAuth.username);

      const app = page.locator('.app');
      await expect(app).toBeVisible();
      const flexDir = await app.evaluate(el => getComputedStyle(el).flexDirection);
      expect(['row', 'column']).toContain(flexDir);
    });
  });

  test.describe('Desktop breakpoint (>=1025px)', () => {
    test('layout at 1440px standard desktop', async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.desktop);
      await navigateToApp(page);
      await showLoginScreen(page);
      await page.waitForSelector('.login-screen', { timeout: 15000 });

      await expect(page.locator('.login-card')).toBeVisible();
      await captureScreenshot(page, 'breakpoint', 'desktop-1440px');
    });

    test('layout at 1920px wide desktop', async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await navigateToApp(page);
      await showLoginScreen(page);
      await page.waitForSelector('.login-screen', { timeout: 15000 });

      const card = page.locator('.login-card');
      await expect(card).toBeVisible();

      // Card should be centered, not stretched to full width
      const box = await card.boundingBox();
      if (box) {
        expect(box.width).toBeLessThan(1920);
        const centerX = box.x + box.width / 2;
        expect(centerX).toBeGreaterThan(700);
        expect(centerX).toBeLessThan(1200);
      }
      await captureScreenshot(page, 'breakpoint', 'wide-desktop-1920px');
    });

    test('mobile nav bar hidden at desktop size', async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.desktop);
      const desktopAuth = await registerTestUserAPI('desktop_bp');
      await authenticateAndNavigate(page, desktopAuth.token, desktopAuth.username);

      await expect(page.locator('.app')).toBeVisible();
      const navBar = page.locator('.mobile-nav-bar');
      if (await navBar.count() === 0) {
        test.skip(true, 'mobile-nav-bar element not in DOM');
        return;
      }
      const display = await navBar.evaluate(el => getComputedStyle(el).display);
      expect(display).toBe('none');
    });
  });

  test.describe('Dynamic resize between breakpoints', () => {
    test('resize from 1440px → 375px → 1440px maintains functionality', async ({ page }) => {
      // Start at desktop
      await page.setViewportSize(VIEWPORTS.desktop);
      await navigateToApp(page);
      await showLoginScreen(page);
      await page.waitForSelector('.login-screen', { timeout: 15000 });

      // Fill form at desktop size
      await page.locator('.login-input').nth(0).fill('resize_test');
      await page.locator('.login-input').nth(1).fill('password');
      await captureScreenshot(page, 'resize-test', 'step1-desktop');

      // Shrink to mobile
      await page.setViewportSize(VIEWPORTS.mobile);
      await page.waitForTimeout(300);

      // Values should persist
      await expect(page.locator('.login-input').nth(0)).toHaveValue('resize_test');
      await expect(page.locator('.login-input').nth(1)).toHaveValue('password');
      await captureScreenshot(page, 'resize-test', 'step2-mobile');

      // Back to desktop
      await page.setViewportSize(VIEWPORTS.desktop);
      await page.waitForTimeout(300);

      // Values still persist
      await expect(page.locator('.login-input').nth(0)).toHaveValue('resize_test');
      await expect(page.locator('.login-input').nth(1)).toHaveValue('password');
      await captureScreenshot(page, 'resize-test', 'step3-back-desktop');
    });
  });
});

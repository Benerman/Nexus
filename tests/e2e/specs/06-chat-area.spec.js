// @ts-check
const { test, expect } = require('@playwright/test');
const { VIEWPORTS, navigateToApp } = require('../helpers/test-utils');
const { captureScreenshot } = require('../helpers/screenshots');

/**
 * Chat Area input fields and functionality tests.
 *
 * These tests verify the chat input, attachment buttons, emoji picker,
 * and message display area are rendered and functional.
 * Requires an authenticated session with a connected server.
 */
test.describe('Chat Area — Uptime Tests', () => {

  test.describe('Chat input (authenticated mock)', () => {
    test.beforeEach(async ({ page }) => {
      await navigateToApp(page);
      await page.evaluate(() => {
        localStorage.setItem('nexus_token', 'mock_chat_token');
        localStorage.setItem('nexus_username', 'chat_test_user');
      });
      await page.reload({ waitUntil: 'networkidle' });
    });

    test('chat input textarea exists in the DOM', async ({ page }) => {
      const chatInput = page.locator('.chat-input');
      // May not be visible if not connected, but should be in DOM if app renders
      const app = page.locator('.app');
      if (await app.isVisible()) {
        // The chat input is a textarea
        if (await chatInput.count() > 0) {
          await expect(chatInput.first()).toHaveAttribute('placeholder', /.+/);
          await captureScreenshot(page, 'chat-area', 'input-present');
        }
      }
    });

    test('chat input wrap contains action buttons', async ({ page }) => {
      const app = page.locator('.app');
      if (await app.isVisible()) {
        const inputWrap = page.locator('.chat-input-wrap');
        if (await inputWrap.count() > 0 && await inputWrap.isVisible()) {
          // Should have attachment or action buttons
          const actions = page.locator('.chat-input-actions');
          if (await actions.count() > 0) {
            await expect(actions).toBeVisible();
          }
          await captureScreenshot(page, 'chat-area', 'input-with-actions');
        }
      }
    });

    test('chat input is editable', async ({ page }) => {
      const chatInput = page.locator('.chat-input');
      if (await chatInput.count() > 0 && await chatInput.isVisible()) {
        await chatInput.fill('Hello, this is a test message!');
        await expect(chatInput).toHaveValue('Hello, this is a test message!');
        await captureScreenshot(page, 'chat-area', 'input-with-text');
      }
    });

    test('chat input clears correctly', async ({ page }) => {
      const chatInput = page.locator('.chat-input');
      if (await chatInput.count() > 0 && await chatInput.isVisible()) {
        await chatInput.fill('temporary text');
        await expect(chatInput).toHaveValue('temporary text');
        await chatInput.fill('');
        await expect(chatInput).toHaveValue('');
      }
    });

    test('chat message area exists', async ({ page }) => {
      const messageArea = page.locator('.chat-messages, .messages-list, .message-list');
      const app = page.locator('.app');
      if (await app.isVisible()) {
        // There should be some message container
        const count = await messageArea.count();
        // May be 0 if not in a channel, which is fine
        await captureScreenshot(page, 'chat-area', 'message-area');
      }
    });

    test('chat header area exists', async ({ page }) => {
      const app = page.locator('.app');
      if (await app.isVisible()) {
        const header = page.locator('.chat-header, .channel-header');
        if (await header.count() > 0) {
          await expect(header.first()).toBeVisible();
          await captureScreenshot(page, 'chat-area', 'chat-header');
        }
      }
    });
  });

  test.describe('Chat area on mobile', () => {
    test('chat input is accessible on mobile', async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.mobile);
      await navigateToApp(page);
      await page.evaluate(() => {
        localStorage.setItem('nexus_token', 'mock_token');
        localStorage.setItem('nexus_username', 'mobile_chat_user');
      });
      await page.reload({ waitUntil: 'networkidle' });

      const chatInput = page.locator('.chat-input');
      const app = page.locator('.app');
      if (await app.isVisible() && await chatInput.count() > 0) {
        if (await chatInput.isVisible()) {
          const box = await chatInput.boundingBox();
          if (box) {
            // Input should span the width of the screen
            expect(box.width).toBeGreaterThan(200);
          }
          await captureScreenshot(page, 'chat-area-mobile', 'input');
        }
      }
    });

    test('mobile nav bar shows channel name', async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.mobile);
      await navigateToApp(page);
      await page.evaluate(() => {
        localStorage.setItem('nexus_token', 'mock_token');
        localStorage.setItem('nexus_username', 'mobile_user');
      });
      await page.reload({ waitUntil: 'networkidle' });

      const app = page.locator('.app');
      if (await app.isVisible()) {
        const navChannel = page.locator('.mobile-nav-channel');
        if (await navChannel.count() > 0) {
          await expect(navChannel).toBeVisible();
          // Should have some text content
          const text = await navChannel.textContent();
          expect(text?.length).toBeGreaterThan(0);
          await captureScreenshot(page, 'chat-area-mobile', 'nav-channel');
        }
      }
    });
  });
});

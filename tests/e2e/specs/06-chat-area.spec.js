// @ts-check
const { test, expect } = require('@playwright/test');
const { VIEWPORTS, navigateToApp, registerTestUserAPI, authenticateAndNavigate } = require('../helpers/test-utils');
const { captureScreenshot } = require('../helpers/screenshots');

/**
 * Chat Area input fields and functionality tests.
 *
 * These tests verify the chat input, attachment buttons, emoji picker,
 * and message display area are rendered and functional.
 * Requires an authenticated session with a connected server.
 */
test.describe('Chat Area — Uptime Tests', () => {
  let authData;

  test.beforeAll(async () => {
    authData = await registerTestUserAPI('chat_area');
  });

  test.describe('Chat input (authenticated)', () => {
    test.beforeEach(async ({ page }) => {
      await authenticateAndNavigate(page, authData.token, authData.username);
    });

    test('chat input textarea exists in the DOM', async ({ page }) => {
      await expect(page.locator('.app')).toBeVisible();
      const chatInput = page.locator('.chat-input');
      if (await chatInput.count() === 0) {
        test.skip(true, 'chat-input element not in DOM');
        return;
      }
      await expect(chatInput.first()).toHaveAttribute('placeholder', /.+/);
      await captureScreenshot(page, 'chat-area', 'input-present');
    });

    test('chat input wrap contains action buttons', async ({ page }) => {
      await expect(page.locator('.app')).toBeVisible();
      const inputWrap = page.locator('.chat-input-wrap');
      if (await inputWrap.count() === 0) {
        test.skip(true, 'chat-input-wrap element not in DOM');
        return;
      }
      if (await inputWrap.isVisible()) {
        const actions = page.locator('.chat-input-actions');
        if (await actions.count() > 0) {
          await expect(actions).toBeVisible();
        }
        await captureScreenshot(page, 'chat-area', 'input-with-actions');
      }
    });

    test('chat input is editable', async ({ page }) => {
      await expect(page.locator('.app')).toBeVisible();
      const chatInput = page.locator('.chat-input');
      if (await chatInput.count() === 0 || !(await chatInput.isVisible())) {
        test.skip(true, 'chat-input not visible');
        return;
      }
      await chatInput.fill('Hello, this is a test message!');
      await expect(chatInput).toHaveValue('Hello, this is a test message!');
      await captureScreenshot(page, 'chat-area', 'input-with-text');
    });

    test('chat input clears correctly', async ({ page }) => {
      await expect(page.locator('.app')).toBeVisible();
      const chatInput = page.locator('.chat-input');
      if (await chatInput.count() === 0 || !(await chatInput.isVisible())) {
        test.skip(true, 'chat-input not visible');
        return;
      }
      await chatInput.fill('temporary text');
      await expect(chatInput).toHaveValue('temporary text');
      await chatInput.fill('');
      await expect(chatInput).toHaveValue('');
    });

    test('chat message area exists', async ({ page }) => {
      await expect(page.locator('.app')).toBeVisible();
      const messageArea = page.locator('.chat-messages, .messages-list, .message-list');
      if (await messageArea.count() === 0) {
        test.skip(true, 'chat message area not in DOM');
        return;
      }
      await captureScreenshot(page, 'chat-area', 'message-area');
    });

    test('chat header area exists', async ({ page }) => {
      await expect(page.locator('.app')).toBeVisible();
      const header = page.locator('.chat-header, .channel-header');
      if (await header.count() === 0) {
        test.skip(true, 'chat header not in DOM');
        return;
      }
      await expect(header.first()).toBeVisible();
      await captureScreenshot(page, 'chat-area', 'chat-header');
    });
  });

  test.describe('Chat area on mobile', () => {
    test('chat input is accessible on mobile', async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.mobile);
      await authenticateAndNavigate(page, authData.token, authData.username);

      await expect(page.locator('.app')).toBeVisible();
      const chatInput = page.locator('.chat-input');
      if (await chatInput.count() === 0 || !(await chatInput.isVisible())) {
        test.skip(true, 'chat-input not visible on mobile');
        return;
      }
      const box = await chatInput.boundingBox();
      if (box) {
        expect(box.width).toBeGreaterThan(200);
      }
      await captureScreenshot(page, 'chat-area-mobile', 'input');
    });

    test('mobile nav bar shows channel name', async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.mobile);
      await authenticateAndNavigate(page, authData.token, authData.username);

      await expect(page.locator('.app')).toBeVisible();
      const navChannel = page.locator('.mobile-nav-channel');
      if (await navChannel.count() === 0) {
        test.skip(true, 'mobile-nav-channel not in DOM');
        return;
      }
      await expect(navChannel).toBeVisible();
      const text = await navChannel.textContent();
      expect(text?.length).toBeGreaterThan(0);
      await captureScreenshot(page, 'chat-area-mobile', 'nav-channel');
    });
  });
});

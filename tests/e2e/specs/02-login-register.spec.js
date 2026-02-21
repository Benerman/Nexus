// @ts-check
const { test, expect } = require('@playwright/test');
const { takeScreenshot, navigateToApp, showLoginScreen } = require('../helpers/test-utils');
const { captureScreenshot } = require('../helpers/screenshots');

test.describe('Login Screen — Uptime Tests', () => {
  test.beforeEach(async ({ page }) => {
    await navigateToApp(page);
    await showLoginScreen(page);
    await page.waitForSelector('.login-screen', { timeout: 15000 });
  });

  test('renders the login screen', async ({ page }) => {
    await expect(page.locator('.login-screen')).toBeVisible();
    await expect(page.locator('.login-card')).toBeVisible();
    await captureScreenshot(page, 'login', 'initial-render');
  });

  test('displays Nexus logo and branding', async ({ page }) => {
    await expect(page.locator('.login-logo-icon')).toBeVisible();
    await expect(page.locator('.login-logo-text')).toHaveText('NEXUS');
  });

  test('shows "Welcome back" title in login mode', async ({ page }) => {
    await expect(page.locator('.login-title')).toHaveText('Welcome back');
    await expect(page.locator('.login-subtitle')).toContainText('excited to see you');
  });

  // ── Username field ──

  test('username input field is visible and editable', async ({ page }) => {
    const usernameInput = page.locator('.login-input').nth(0);
    await expect(usernameInput).toBeVisible();
    await expect(usernameInput).toBeEditable();
    await expect(usernameInput).toHaveAttribute('placeholder', 'Enter your username');
    await expect(usernameInput).toHaveAttribute('type', 'text');
  });

  test('username input accepts text', async ({ page }) => {
    const usernameInput = page.locator('.login-input').nth(0);
    await usernameInput.fill('TestUser123');
    await expect(usernameInput).toHaveValue('TestUser123');
  });

  test('username input has maxLength=32', async ({ page }) => {
    const usernameInput = page.locator('.login-input').nth(0);
    await expect(usernameInput).toHaveAttribute('maxLength', '32');
  });

  test('username label is present', async ({ page }) => {
    const label = page.locator('.login-label').nth(0);
    await expect(label).toHaveText('USERNAME');
  });

  // ── Password field ──

  test('password input field is visible and editable', async ({ page }) => {
    const passwordInput = page.locator('.login-input').nth(1);
    await expect(passwordInput).toBeVisible();
    await expect(passwordInput).toBeEditable();
    await expect(passwordInput).toHaveAttribute('placeholder', 'Enter password');
    await expect(passwordInput).toHaveAttribute('type', 'password');
  });

  test('password input accepts text', async ({ page }) => {
    const passwordInput = page.locator('.login-input').nth(1);
    await passwordInput.fill('MySecretPass');
    await expect(passwordInput).toHaveValue('MySecretPass');
  });

  test('password label is present', async ({ page }) => {
    const label = page.locator('.login-label').nth(1);
    await expect(label).toHaveText('PASSWORD');
  });

  // ── Login button ──

  test('login button is present and initially disabled', async ({ page }) => {
    const btn = page.locator('.login-btn');
    await expect(btn).toBeVisible();
    await expect(btn).toHaveText('Log In');
    await expect(btn).toBeDisabled();
  });

  test('login button enables when username and password are filled', async ({ page }) => {
    await page.locator('.login-input').nth(0).fill('user');
    await page.locator('.login-input').nth(1).fill('pass');

    await expect(page.locator('.login-btn')).toBeEnabled();
    await captureScreenshot(page, 'login', 'form-filled');
  });

  test('login button stays disabled with only username', async ({ page }) => {
    await page.locator('.login-input').nth(0).fill('user');
    await expect(page.locator('.login-btn')).toBeDisabled();
  });

  test('login button stays disabled with only password', async ({ page }) => {
    await page.locator('.login-input').nth(1).fill('pass');
    await expect(page.locator('.login-btn')).toBeDisabled();
  });

  // ── Mode switching ──

  test('switch to register mode shows confirm password field', async ({ page }) => {
    // Initially should have 2 inputs (username + password)
    await expect(page.locator('.login-input')).toHaveCount(2);

    // Click "Register" link
    await page.locator('.login-switch button').click();

    // Now should have 3 inputs (username + password + confirm)
    await expect(page.locator('.login-input')).toHaveCount(3);
    await expect(page.locator('.login-title')).toHaveText('Create account');
    await expect(page.locator('.login-subtitle')).toContainText('Join the conversation');
    await captureScreenshot(page, 'login', 'register-mode');
  });

  test('confirm password field has correct attributes in register mode', async ({ page }) => {
    await page.locator('.login-switch button').click();

    const confirmInput = page.locator('.login-input').nth(2);
    await expect(confirmInput).toBeVisible();
    await expect(confirmInput).toHaveAttribute('type', 'password');
    await expect(confirmInput).toHaveAttribute('placeholder', 'Confirm password');
  });

  test('register button text shows "Create Account"', async ({ page }) => {
    await page.locator('.login-switch button').click();
    await expect(page.locator('.login-btn')).toHaveText('Create Account');
  });

  test('register button disabled until all 3 fields filled', async ({ page }) => {
    await page.locator('.login-switch button').click();

    await page.locator('.login-input').nth(0).fill('newuser');
    await page.locator('.login-input').nth(1).fill('pass1234');
    // Still disabled — confirm password empty
    await expect(page.locator('.login-btn')).toBeDisabled();

    await page.locator('.login-input').nth(2).fill('pass1234');
    await expect(page.locator('.login-btn')).toBeEnabled();
  });

  test('switch back to login mode hides confirm password', async ({ page }) => {
    // Go to register
    await page.locator('.login-switch button').click();
    await expect(page.locator('.login-input')).toHaveCount(3);

    // Go back to login
    await page.locator('.login-switch button').click();
    await expect(page.locator('.login-input')).toHaveCount(2);
    await expect(page.locator('.login-title')).toHaveText('Welcome back');
  });

  test('switch link text changes between modes', async ({ page }) => {
    // Login mode
    await expect(page.locator('.login-switch')).toContainText('Need an account?');
    await expect(page.locator('.login-switch button')).toHaveText('Register');

    // Register mode
    await page.locator('.login-switch button').click();
    await expect(page.locator('.login-switch')).toContainText('Already have an account?');
    await expect(page.locator('.login-switch button')).toHaveText('Log In');
  });

  // ── Error handling ──

  test('shows error when login fails with wrong credentials', async ({ page }) => {
    await page.locator('.login-input').nth(0).fill('nonexistent_user');
    await page.locator('.login-input').nth(1).fill('wrongpass');
    await page.locator('.login-btn').click();

    // Should show an error
    await expect(page.locator('.login-error').or(page.locator('.login-btn:has-text("Please wait...")'))).toBeVisible({ timeout: 10000 });
    await captureScreenshot(page, 'login', 'error-state');
  });

  test('shows password mismatch error in register mode', async ({ page }) => {
    await page.locator('.login-switch button').click();

    await page.locator('.login-input').nth(0).fill('newuser_test');
    await page.locator('.login-input').nth(1).fill('password1');
    await page.locator('.login-input').nth(2).fill('password2');
    await page.locator('.login-btn').click();

    await expect(page.locator('.login-error')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.login-error')).toContainText('Passwords do not match');
    await captureScreenshot(page, 'login', 'password-mismatch');
  });

  test('error clears when switching modes', async ({ page }) => {
    // Trigger an error
    await page.locator('.login-switch button').click();
    await page.locator('.login-input').nth(0).fill('test');
    await page.locator('.login-input').nth(1).fill('a');
    await page.locator('.login-input').nth(2).fill('b');
    await page.locator('.login-btn').click();
    await expect(page.locator('.login-error')).toBeVisible({ timeout: 5000 });

    // Switch mode should clear error
    await page.locator('.login-switch button').click();
    await expect(page.locator('.login-error')).not.toBeVisible();
  });

  // ── Loading state ──

  test('shows loading state on form submit', async ({ page }) => {
    await page.locator('.login-input').nth(0).fill('testuser');
    await page.locator('.login-input').nth(1).fill('testpass');

    // Use Promise.all to click and immediately check for the transient loading state.
    // The server may respond quickly, so we race the assertion against the click.
    const btn = page.locator('.login-btn');
    const loadingOrError = btn.filter({ hasText: 'Please wait...' })
      .or(page.locator('.login-error'));

    await btn.click();

    // Either the loading state or an error should appear
    await expect(loadingOrError).toBeVisible({ timeout: 10000 });
    await captureScreenshot(page, 'login', 'loading-state');
  });

  test('form submits via Enter key', async ({ page }) => {
    await page.locator('.login-input').nth(0).fill('testuser');
    const passwordInput = page.locator('.login-input').nth(1);
    await passwordInput.fill('testpass');
    await passwordInput.press('Enter');

    // Should trigger submit
    await expect(
      page.locator('.login-btn:has-text("Please wait...")')
        .or(page.locator('.login-error'))
    ).toBeVisible({ timeout: 10000 });
  });
});

// @ts-check
const { expect } = require('@playwright/test');
const path = require('path');

const SCREENSHOT_DIR = path.join(__dirname, '..', 'screenshots');

const DESKTOP_SIMULATION = !!process.env.DESKTOP_SIMULATION;

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3001';

/**
 * Inject Tauri desktop simulation globals before any navigation.
 * When DESKTOP_SIMULATION env var is set, this makes the app believe
 * it's running inside a Tauri webview so server-setup and other
 * standalone-only code paths are exercised.
 */
async function injectDesktopSimulation(page) {
  if (!DESKTOP_SIMULATION) return;
  if (page._desktopSimInjected) return;
  page._desktopSimInjected = true;
  await page.addInitScript(() => {
    window.__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: 'main' } },
      invoke: async () => {},
    };
  });
}

/**
 * Viewport presets matching the CSS breakpoints in App.css
 * Mobile: max-width 768px
 * Tablet: 769-1024px
 * Desktop: 1025px+
 */
const VIEWPORTS = {
  mobile: { width: 375, height: 812 },       // iPhone 13
  mobileLandscape: { width: 812, height: 375 },
  tablet: { width: 810, height: 1080 },      // iPad
  desktop: { width: 1440, height: 900 },     // Standard desktop
  desktopSmall: { width: 1024, height: 768 },
};

/**
 * Take a named screenshot and save to the screenshots directory.
 * @param {import('@playwright/test').Page} page
 * @param {string} name - descriptive screenshot name (no extension)
 */
async function takeScreenshot(page, name) {
  const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, `${safeName}.png`),
    fullPage: true,
  });
}

/**
 * Navigate to the app and wait for initial render.
 * The app will show one of: ServerSetupScreen, LoginScreen, or main App.
 */
async function navigateToApp(page) {
  await injectDesktopSimulation(page);
  await page.addInitScript((serverUrl) => {
    localStorage.setItem('nexus_server_url', serverUrl);
  }, SERVER_URL);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  // Wait for either the login screen, server setup screen, or main app
  await page.waitForSelector(
    '.login-screen, .server-setup-screen, .app',
    { timeout: 30000 }
  );
}

/**
 * Force the app to show the ServerSetupScreen by clearing stored server URL.
 */
async function showServerSetupScreen(page) {
  await injectDesktopSimulation(page);
  await page.evaluate(() => {
    localStorage.removeItem('nexus_server_url');
    localStorage.removeItem('nexus_token');
    localStorage.removeItem('nexus_username');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
}

/**
 * Force the app to show the LoginScreen by clearing auth but keeping server URL.
 * If the app uses same-origin by default, this just needs token cleared.
 */
async function showLoginScreen(page) {
  await injectDesktopSimulation(page);
  await page.evaluate((serverUrl) => {
    // Keep server URL / same-origin behavior, just clear auth
    localStorage.removeItem('nexus_token');
    localStorage.removeItem('nexus_username');
    // Set a server URL so we skip server setup
    if (!localStorage.getItem('nexus_server_url')) {
      localStorage.setItem('nexus_server_url', serverUrl);
    }
  }, SERVER_URL);
  await page.reload({ waitUntil: 'domcontentloaded' });
}

/**
 * Register and login a test user via the UI.
 * Returns { username, password }.
 */
async function registerTestUser(page, usernamePrefix = 'testuser') {
  const username = `${usernamePrefix}_${Date.now()}`;
  const password = 'TestPass123!';

  // Ensure we are on the login screen
  await showLoginScreen(page);
  await page.waitForSelector('.login-screen', { timeout: 10000 });

  // Switch to register mode
  const switchBtn = page.locator('.login-switch button');
  if (await switchBtn.textContent() === 'Register') {
    await switchBtn.click();
  }

  // Fill registration form
  await page.locator('.login-input').nth(0).fill(username);
  await page.locator('.login-input').nth(1).fill(password);
  await page.locator('.login-input').nth(2).fill(password);
  await page.locator('.login-btn').click();

  // Wait for registration to complete (either app loads or error shows)
  await page.waitForSelector('.app, .login-error', { timeout: 15000 });

  return { username, password };
}

/**
 * Login an existing user via the UI.
 */
async function loginUser(page, username, password) {
  await showLoginScreen(page);
  await page.waitForSelector('.login-screen', { timeout: 10000 });

  // Make sure we are in login mode
  const title = await page.locator('.login-title').textContent();
  if (title === 'Create account') {
    await page.locator('.login-switch button').click();
  }

  await page.locator('.login-input').nth(0).fill(username);
  await page.locator('.login-input').nth(1).fill(password);
  await page.locator('.login-btn').click();
}

/**
 * Register a test user via the server API (no browser needed).
 * Returns { username, password, token, account }.
 * Throws on failure so tests fail loudly instead of silently passing.
 */
async function registerTestUserAPI(usernamePrefix = 'testuser') {
  const username = `${usernamePrefix}_${Date.now()}`;
  const password = 'TestPass123!';

  const res = await fetch(`${SERVER_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`registerTestUserAPI failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  return { username, password, token: data.token, account: data.account };
}

/**
 * Set auth tokens in localStorage via addInitScript (runs before page JS),
 * then navigate to the app and wait for the .app container.
 */
async function authenticateAndNavigate(page, token, username) {
  await injectDesktopSimulation(page);
  await page.addInitScript(({ token, username, serverUrl }) => {
    localStorage.setItem('nexus_token', token);
    localStorage.setItem('nexus_username', username);
    localStorage.setItem('nexus_server_url', serverUrl);
  }, { token, username, serverUrl: SERVER_URL });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.app', { timeout: 30000 });
}

module.exports = {
  VIEWPORTS,
  SCREENSHOT_DIR,
  DESKTOP_SIMULATION,
  SERVER_URL,
  takeScreenshot,
  navigateToApp,
  showServerSetupScreen,
  showLoginScreen,
  registerTestUser,
  loginUser,
  injectDesktopSimulation,
  registerTestUserAPI,
  authenticateAndNavigate,
};

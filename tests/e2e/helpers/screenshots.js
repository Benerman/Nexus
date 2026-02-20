// @ts-check
const path = require('path');

const SCREENSHOT_DIR = path.join(__dirname, '..', 'screenshots');

/**
 * Capture a screenshot with viewport info embedded in the name.
 * @param {import('@playwright/test').Page} page
 * @param {string} testName
 * @param {string} stepName
 */
async function captureScreenshot(page, testName, stepName) {
  const viewport = page.viewportSize();
  const viewportLabel = viewport
    ? `${viewport.width}x${viewport.height}`
    : 'unknown';
  const safeName = `${testName}_${stepName}_${viewportLabel}`
    .replace(/[^a-zA-Z0-9_-]/g, '_');

  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, `${safeName}.png`),
    fullPage: true,
  });
}

/**
 * Capture a screenshot of a specific element.
 * @param {import('@playwright/test').Locator} locator
 * @param {string} name
 */
async function captureElementScreenshot(locator, name) {
  const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
  await locator.screenshot({
    path: path.join(SCREENSHOT_DIR, `${safeName}.png`),
  });
}

module.exports = { captureScreenshot, captureElementScreenshot, SCREENSHOT_DIR };

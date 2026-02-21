// @ts-check
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const VERIFY_BINARY = !!process.env.VERIFY_BINARY;
const BUILD_DIR = process.env.BUILD_DIR || path.resolve(__dirname, '../../../desktop/src-tauri/target/release/bundle/appimage');

test.describe('Desktop Binary Verification', () => {
  test.skip(!VERIFY_BINARY, 'Set VERIFY_BINARY=1 to run binary verification tests');

  let appImagePath;

  test.beforeAll(() => {
    // Find the AppImage in the build output directory
    if (!fs.existsSync(BUILD_DIR)) {
      throw new Error(`Build directory not found: ${BUILD_DIR}`);
    }
    const files = fs.readdirSync(BUILD_DIR).filter(f => f.endsWith('.AppImage'));
    if (files.length === 0) {
      throw new Error(`No AppImage found in ${BUILD_DIR}`);
    }
    appImagePath = path.join(BUILD_DIR, files[0]);
  });

  test('AppImage exists in build output', () => {
    expect(fs.existsSync(appImagePath)).toBe(true);
  });

  test('AppImage is executable', () => {
    const stats = fs.statSync(appImagePath);
    // Check owner execute bit (0o100)
    expect(stats.mode & 0o100).toBeTruthy();
  });

  test('AppImage file size is reasonable (>10MB)', () => {
    const stats = fs.statSync(appImagePath);
    const sizeMB = stats.size / (1024 * 1024);
    expect(sizeMB).toBeGreaterThan(10);
  });

  test('App launches and creates a window', () => {
    test.skip(!process.env.DISPLAY && !process.env.XVFB, 'Requires display server (set DISPLAY or XVFB=1)');

    try {
      // Launch the app in background, give it time to start, check for window
      const result = execSync(
        `timeout 15 bash -c '
          "${appImagePath}" &
          APP_PID=$!
          sleep 5
          # Check if a window was created using xdotool
          if command -v xdotool >/dev/null 2>&1; then
            WINDOW=$(xdotool search --pid $APP_PID --name "" 2>/dev/null | head -1)
            kill $APP_PID 2>/dev/null || true
            if [ -n "$WINDOW" ]; then
              echo "WINDOW_FOUND"
            else
              echo "NO_WINDOW"
            fi
          else
            kill $APP_PID 2>/dev/null || true
            echo "XDOTOOL_MISSING"
          fi
        '`,
        { encoding: 'utf-8', timeout: 20000 }
      ).trim();

      if (result === 'XDOTOOL_MISSING') {
        test.skip(true, 'xdotool not installed — cannot verify window creation');
      }
      expect(result).toBe('WINDOW_FOUND');
    } catch (e) {
      // Cleanup any lingering process
      try { execSync(`pkill -f "${path.basename(appImagePath)}" 2>/dev/null`); } catch {}
      throw e;
    }
  });
});

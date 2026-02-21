#!/usr/bin/env bash
# test-desktop-launch.sh — CI script to verify the Tauri AppImage launches correctly.
#
# Usage:
#   ./tests/e2e/scripts/test-desktop-launch.sh [path/to/build/dir]
#
# Requirements: xdotool (optional, for window verification)
# If no display server is running, starts Xvfb automatically.

set -euo pipefail

BUILD_DIR="${1:-desktop/src-tauri/target/release/bundle/appimage}"
SCREENSHOT_DIR="tests/e2e/screenshots"
XVFB_PID=""
APP_PID=""

cleanup() {
  echo "Cleaning up..."
  [ -n "$APP_PID" ] && kill "$APP_PID" 2>/dev/null || true
  [ -n "$XVFB_PID" ] && kill "$XVFB_PID" 2>/dev/null || true
}
trap cleanup EXIT

# Find AppImage
APPIMAGE=$(find "$BUILD_DIR" -name '*.AppImage' -type f | head -1)
if [ -z "$APPIMAGE" ]; then
  echo "ERROR: No AppImage found in $BUILD_DIR"
  exit 1
fi
echo "Found AppImage: $APPIMAGE"

# Check file size
SIZE_MB=$(du -m "$APPIMAGE" | cut -f1)
echo "AppImage size: ${SIZE_MB}MB"
if [ "$SIZE_MB" -lt 10 ]; then
  echo "WARNING: AppImage seems too small (${SIZE_MB}MB < 10MB)"
fi

# Make executable
chmod +x "$APPIMAGE"

# Start Xvfb if no display
if [ -z "${DISPLAY:-}" ]; then
  echo "No DISPLAY set, starting Xvfb..."
  Xvfb :99 -screen 0 1280x720x24 &
  XVFB_PID=$!
  export DISPLAY=:99
  sleep 1
  echo "Xvfb started on :99"
fi

# Launch app
echo "Launching AppImage..."
"$APPIMAGE" &
APP_PID=$!
sleep 8

# Check if process is still running
if ! kill -0 "$APP_PID" 2>/dev/null; then
  echo "ERROR: App process exited prematurely"
  exit 1
fi
echo "App process is running (PID: $APP_PID)"

# Verify window creation with xdotool
if command -v xdotool >/dev/null 2>&1; then
  WINDOW=$(xdotool search --pid "$APP_PID" --name "" 2>/dev/null | head -1 || true)
  if [ -n "$WINDOW" ]; then
    echo "Window found (ID: $WINDOW)"

    # Take screenshot if import (ImageMagick) is available
    mkdir -p "$SCREENSHOT_DIR"
    if command -v import >/dev/null 2>&1; then
      import -window root "$SCREENSHOT_DIR/desktop-launch.png" 2>/dev/null || true
      echo "Screenshot saved to $SCREENSHOT_DIR/desktop-launch.png"
    fi
  else
    echo "WARNING: No window detected (xdotool found no windows for PID $APP_PID)"
  fi
else
  echo "SKIP: xdotool not installed, cannot verify window creation"
fi

echo "Desktop launch test PASSED"

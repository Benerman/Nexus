/**
 * Tests for client/src/config.js — centralized server URL resolution.
 *
 * We mock window/localStorage/process.env to test each priority path.
 */

// Save originals
const originalWindow = global.window;
const originalProcess = global.process;

function setupWindow(overrides = {}) {
  const storage = {};
  global.window = {
    __NEXUS_CONFIG__: overrides.__NEXUS_CONFIG__ || undefined,
    __NEXUS_SERVER_URL__: overrides.__NEXUS_SERVER_URL__ || undefined,
    __TAURI_INTERNALS__: overrides.__TAURI_INTERNALS__ || undefined,
    __TAURI__: overrides.__TAURI__ || undefined,
    Capacitor: overrides.Capacitor || undefined,
    ...overrides,
  };
  global.localStorage = {
    getItem: jest.fn(key => storage[key] || null),
    setItem: jest.fn((key, val) => { storage[key] = val; }),
    removeItem: jest.fn(key => { delete storage[key]; }),
  };
  return { storage };
}

function cleanupWindow() {
  global.window = originalWindow;
  delete global.localStorage;
}

beforeEach(() => {
  jest.resetModules();
  delete process.env.REACT_APP_SERVER_URL;
});

afterAll(() => {
  cleanupWindow();
});

describe('getServerUrl', () => {
  test('returns localStorage value when present (priority 1)', () => {
    const { storage } = setupWindow();
    storage.nexus_server_url = 'http://my-server:3001';
    const { getServerUrl } = require('../../../client/src/config');
    expect(getServerUrl()).toBe('http://my-server:3001');
    cleanupWindow();
  });

  test('returns __NEXUS_CONFIG__.serverUrl when no localStorage (priority 2)', () => {
    setupWindow({ __NEXUS_CONFIG__: { serverUrl: 'http://electron-url' } });
    const { getServerUrl } = require('../../../client/src/config');
    expect(getServerUrl()).toBe('http://electron-url');
    cleanupWindow();
  });

  test('returns __NEXUS_SERVER_URL__ when no config bridge (priority 3)', () => {
    setupWindow({ __NEXUS_SERVER_URL__: 'http://tauri-url' });
    const { getServerUrl } = require('../../../client/src/config');
    expect(getServerUrl()).toBe('http://tauri-url');
    cleanupWindow();
  });

  test('returns REACT_APP_SERVER_URL when window has nothing (priority 4)', () => {
    setupWindow();
    process.env.REACT_APP_SERVER_URL = 'http://env-url';
    const { getServerUrl } = require('../../../client/src/config');
    expect(getServerUrl()).toBe('http://env-url');
    cleanupWindow();
  });

  test('returns empty string as final fallback (priority 5)', () => {
    setupWindow();
    const { getServerUrl } = require('../../../client/src/config');
    expect(getServerUrl()).toBe('');
    cleanupWindow();
  });
});

describe('setServerUrl', () => {
  test('saves url to localStorage and strips trailing slashes', () => {
    setupWindow();
    const { setServerUrl } = require('../../../client/src/config');
    setServerUrl('http://server.com///');
    expect(global.localStorage.setItem).toHaveBeenCalledWith('nexus_server_url', 'http://server.com');
    cleanupWindow();
  });

  test('removes from localStorage when called with null/empty', () => {
    setupWindow();
    const { setServerUrl } = require('../../../client/src/config');
    setServerUrl('');
    expect(global.localStorage.removeItem).toHaveBeenCalledWith('nexus_server_url');
    setServerUrl(null);
    expect(global.localStorage.removeItem).toHaveBeenCalledWith('nexus_server_url');
    cleanupWindow();
  });
});

describe('isStandaloneApp', () => {
  test('returns false when window is undefined', () => {
    // Don't set up window
    global.window = undefined;
    jest.resetModules();
    const { isStandaloneApp } = require('../../../client/src/config');
    expect(isStandaloneApp()).toBe(false);
    global.window = originalWindow;
  });

  test('returns true for Electron (isDesktop)', () => {
    setupWindow({ __NEXUS_CONFIG__: { isDesktop: true } });
    const { isStandaloneApp } = require('../../../client/src/config');
    expect(isStandaloneApp()).toBe(true);
    cleanupWindow();
  });

  test('returns true for Tauri (__TAURI_INTERNALS__)', () => {
    setupWindow({ __TAURI_INTERNALS__: {} });
    const { isStandaloneApp } = require('../../../client/src/config');
    expect(isStandaloneApp()).toBe(true);
    cleanupWindow();
  });

  test('returns true for Capacitor', () => {
    setupWindow({ Capacitor: { isNativePlatform: () => true } });
    const { isStandaloneApp } = require('../../../client/src/config');
    expect(isStandaloneApp()).toBe(true);
    cleanupWindow();
  });

  test('returns false for plain browser', () => {
    setupWindow();
    const { isStandaloneApp } = require('../../../client/src/config');
    expect(isStandaloneApp()).toBe(false);
    cleanupWindow();
  });
});

describe('hasServerUrl', () => {
  test('returns true when getServerUrl returns non-empty', () => {
    const { storage } = setupWindow();
    storage.nexus_server_url = 'http://somewhere';
    const { hasServerUrl } = require('../../../client/src/config');
    expect(hasServerUrl()).toBe(true);
    cleanupWindow();
  });

  test('returns false when getServerUrl returns empty', () => {
    setupWindow();
    const { hasServerUrl } = require('../../../client/src/config');
    expect(hasServerUrl()).toBe(false);
    cleanupWindow();
  });
});

describe('needsServerSetup', () => {
  test('returns true for standalone app without server URL', () => {
    setupWindow({ __NEXUS_CONFIG__: { isDesktop: true } });
    const { needsServerSetup } = require('../../../client/src/config');
    expect(needsServerSetup()).toBe(true);
    cleanupWindow();
  });

  test('returns false for standalone app with server URL', () => {
    const { storage } = setupWindow({ __NEXUS_CONFIG__: { isDesktop: true } });
    storage.nexus_server_url = 'http://configured';
    const { needsServerSetup } = require('../../../client/src/config');
    expect(needsServerSetup()).toBe(false);
    cleanupWindow();
  });

  test('returns false for plain browser', () => {
    setupWindow();
    const { needsServerSetup } = require('../../../client/src/config');
    expect(needsServerSetup()).toBe(false);
    cleanupWindow();
  });
});

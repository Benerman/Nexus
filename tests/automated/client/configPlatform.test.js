/**
 * Tests for the platform-detection and native-bridge helpers in
 * client/src/config.js — isTauriApp / isCapacitorApp / isElectronApp,
 * getPlatform, and the notification + external-URL wrappers that prefer a
 * Tauri plugin and fall back to the Web API.
 *
 * The Tauri/Capacitor plugins are loaded by config.js through dynamic
 * import(), so we stub them by their resolved paths (the same trick the
 * server config test uses for dotenv) before requiring config.js.
 */

const path = require('path');

// Absolute paths so jest.doMock keys match what config.js resolves to
const clientDir = path.resolve(__dirname, '../../../client');
const resolveFromClient = name => require.resolve(name, { paths: [clientDir] });
const tauriNotificationPath = resolveFromClient('@tauri-apps/plugin-notification');
const tauriOpenerPath = resolveFromClient('@tauri-apps/plugin-opener');
const capacitorBrowserPath = resolveFromClient('@capacitor/browser');

// Save originals
const originalWindow = global.window;
const originalNavigator = Object.getOwnPropertyDescriptor(global, 'navigator');
const originalNotification = global.Notification;

// Plugin stubs, re-created by loadConfig() for each test
let tauriNotification;
let tauriOpener;
let capacitorBrowser;

function setNavigator(userAgent) {
  Object.defineProperty(global, 'navigator', {
    value: { userAgent },
    configurable: true,
    writable: true,
  });
}

/**
 * Build a fake window. Overrides are merged in, so a test can add
 * __TAURI__, Capacitor, Notification, etc.
 */
function setupWindow(overrides = {}) {
  global.window = {
    __NEXUS_CONFIG__: undefined,
    __TAURI_INTERNALS__: undefined,
    __TAURI__: undefined,
    Capacitor: undefined,
    Notification: undefined,
    open: jest.fn(),
    ...overrides,
  };
  return global.window;
}

function cleanupWindow() {
  global.window = originalWindow;
  delete global.Notification;
}

/** Stub the native plugins, then require a fresh copy of config.js. */
function loadConfig() {
  jest.resetModules();
  tauriNotification = {
    isPermissionGranted: jest.fn().mockResolvedValue(true),
    requestPermission: jest.fn().mockResolvedValue('granted'),
    sendNotification: jest.fn(),
  };
  tauriOpener = { openUrl: jest.fn().mockResolvedValue(undefined) };
  capacitorBrowser = { Browser: { open: jest.fn().mockResolvedValue(undefined) } };
  jest.doMock(tauriNotificationPath, () => tauriNotification);
  jest.doMock(tauriOpenerPath, () => tauriOpener);
  jest.doMock(capacitorBrowserPath, () => capacitorBrowser);
  return require('../../../client/src/config');
}

/** A Notification stand-in; config.js reads it off window and constructs the global. */
function installNotification(permission) {
  const instances = [];
  function MockNotification(title, options) {
    this.title = title;
    this.options = options;
    instances.push(this);
  }
  MockNotification.permission = permission;
  MockNotification.requestPermission = jest.fn();
  global.Notification = MockNotification;
  return { MockNotification, instances };
}

beforeEach(() => {
  jest.resetModules();
  setNavigator('');
});

afterEach(() => {
  cleanupWindow();
  jest.restoreAllMocks();
});

afterAll(() => {
  if (originalNavigator) {
    Object.defineProperty(global, 'navigator', originalNavigator);
  } else {
    delete global.navigator;
  }
  global.Notification = originalNotification;
});

describe('isTauriApp', () => {
  test('returns false when window is undefined', () => {
    global.window = undefined;
    const { isTauriApp } = loadConfig();
    expect(isTauriApp()).toBe(false);
  });

  test('returns true for __TAURI_INTERNALS__', () => {
    setupWindow({ __TAURI_INTERNALS__: {} });
    const { isTauriApp } = loadConfig();
    expect(isTauriApp()).toBe(true);
  });

  test('returns true for the legacy __TAURI__ global', () => {
    setupWindow({ __TAURI__: {} });
    const { isTauriApp } = loadConfig();
    expect(isTauriApp()).toBe(true);
  });

  test('returns false for Electron and Capacitor', () => {
    setupWindow({
      __NEXUS_CONFIG__: { isDesktop: true },
      Capacitor: { isNativePlatform: () => true },
    });
    const { isTauriApp } = loadConfig();
    expect(isTauriApp()).toBe(false);
  });
});

describe('isCapacitorApp', () => {
  test('returns false when window is undefined', () => {
    global.window = undefined;
    const { isCapacitorApp } = loadConfig();
    expect(isCapacitorApp()).toBe(false);
  });

  test('returns true when Capacitor reports a native platform', () => {
    setupWindow({ Capacitor: { isNativePlatform: () => true } });
    const { isCapacitorApp } = loadConfig();
    expect(isCapacitorApp()).toBe(true);
  });

  test('returns false when Capacitor reports a web platform', () => {
    setupWindow({ Capacitor: { isNativePlatform: () => false } });
    const { isCapacitorApp } = loadConfig();
    expect(isCapacitorApp()).toBe(false);
  });

  test('returns false when Capacitor is absent', () => {
    setupWindow();
    const { isCapacitorApp } = loadConfig();
    expect(isCapacitorApp()).toBe(false);
  });

  test('returns false for Tauri', () => {
    setupWindow({ __TAURI_INTERNALS__: {} });
    const { isCapacitorApp } = loadConfig();
    expect(isCapacitorApp()).toBe(false);
  });
});

describe('isElectronApp', () => {
  test('returns false when window is undefined', () => {
    global.window = undefined;
    const { isElectronApp } = loadConfig();
    expect(isElectronApp()).toBe(false);
  });

  test('returns true when the preload bridge reports isDesktop', () => {
    setupWindow({ __NEXUS_CONFIG__: { isDesktop: true } });
    const { isElectronApp } = loadConfig();
    expect(isElectronApp()).toBe(true);
  });

  test('returns false when the bridge exists without isDesktop', () => {
    setupWindow({ __NEXUS_CONFIG__: { serverUrl: 'http://x' } });
    const { isElectronApp } = loadConfig();
    expect(isElectronApp()).toBe(false);
  });

  test('returns false for Tauri', () => {
    setupWindow({ __TAURI__: {} });
    const { isElectronApp } = loadConfig();
    expect(isElectronApp()).toBe(false);
  });
});

describe('getPlatform', () => {
  test('returns unknown when window is undefined', () => {
    global.window = undefined;
    const { getPlatform } = loadConfig();
    expect(getPlatform()).toBe('unknown');
  });

  test('prefers the Electron preload platform over the user agent', () => {
    setupWindow({ __NEXUS_CONFIG__: { platform: 'darwin' } });
    setNavigator('mozilla/5.0 (x11; linux x86_64)');
    const { getPlatform } = loadConfig();
    expect(getPlatform()).toBe('darwin');
  });

  test.each([
    ['linux', 'Mozilla/5.0 (X11; Linux x86_64)'],
    ['win32', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'],
    ['win32', 'Mozilla/5.0 (Win64)'],
    ['win32', 'Mozilla/5.0 (Win32)'],
    ['darwin', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'],
    ['darwin', 'Mozilla/5.0 (Something Mac OS 14)'],
    ['unknown', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)'],
  ])('returns %s for user agent %s', (expected, userAgent) => {
    setupWindow();
    setNavigator(userAgent);
    const { getPlatform } = loadConfig();
    expect(getPlatform()).toBe(expected);
  });

  test('falls back to the user agent when the bridge has no platform', () => {
    setupWindow({ __NEXUS_CONFIG__: { isDesktop: true } });
    setNavigator('Mozilla/5.0 (X11; Linux x86_64)');
    const { getPlatform } = loadConfig();
    expect(getPlatform()).toBe('linux');
  });
});

describe('requestNotificationPermission', () => {
  test('requests permission through the Tauri plugin when not yet granted', async () => {
    setupWindow({ __TAURI_INTERNALS__: {} });
    const { requestNotificationPermission } = loadConfig();
    tauriNotification.isPermissionGranted.mockResolvedValue(false);
    await expect(requestNotificationPermission()).resolves.toBeUndefined();
    expect(tauriNotification.requestPermission).toHaveBeenCalled();
  });

  test('does not re-request when Tauri permission is already granted', async () => {
    setupWindow({ __TAURI_INTERNALS__: {} });
    const { requestNotificationPermission } = loadConfig();
    tauriNotification.isPermissionGranted.mockResolvedValue(true);
    await requestNotificationPermission();
    expect(tauriNotification.requestPermission).not.toHaveBeenCalled();
  });

  test('warns and falls back to the Web API when the Tauri plugin throws', async () => {
    const { MockNotification } = installNotification('default');
    setupWindow({ __TAURI_INTERNALS__: {}, Notification: MockNotification });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { requestNotificationPermission } = loadConfig();
    tauriNotification.isPermissionGranted.mockRejectedValue(new Error('no plugin'));
    await requestNotificationPermission();
    expect(warn).toHaveBeenCalled();
    expect(MockNotification.requestPermission).toHaveBeenCalled();
  });

  test('uses the Web API when permission is still default outside Tauri', async () => {
    const { MockNotification } = installNotification('default');
    setupWindow({ Notification: MockNotification });
    const { requestNotificationPermission } = loadConfig();
    await requestNotificationPermission();
    expect(MockNotification.requestPermission).toHaveBeenCalled();
    expect(tauriNotification.isPermissionGranted).not.toHaveBeenCalled();
  });

  test('does nothing when the Web API already decided', async () => {
    const { MockNotification } = installNotification('denied');
    setupWindow({ Notification: MockNotification });
    const { requestNotificationPermission } = loadConfig();
    await requestNotificationPermission();
    expect(MockNotification.requestPermission).not.toHaveBeenCalled();
  });

  test('does nothing when the Notification API is unavailable', async () => {
    setupWindow();
    const { requestNotificationPermission } = loadConfig();
    await expect(requestNotificationPermission()).resolves.toBeUndefined();
  });
});

describe('sendNotification', () => {
  test('sends through the Tauri plugin when permission is granted', async () => {
    setupWindow({ __TAURI_INTERNALS__: {} });
    const { sendNotification } = loadConfig();
    tauriNotification.isPermissionGranted.mockResolvedValue(true);
    await expect(sendNotification('Hi', { body: 'there' })).resolves.toBeUndefined();
    expect(tauriNotification.sendNotification).toHaveBeenCalledWith({ title: 'Hi', body: 'there' });
  });

  test('defaults the Tauri body to an empty string', async () => {
    setupWindow({ __TAURI_INTERNALS__: {} });
    const { sendNotification } = loadConfig();
    tauriNotification.isPermissionGranted.mockResolvedValue(true);
    await sendNotification('Hi');
    expect(tauriNotification.sendNotification).toHaveBeenCalledWith({ title: 'Hi', body: '' });
  });

  test('falls back to the Web API when Tauri permission is not granted', async () => {
    const { MockNotification, instances } = installNotification('granted');
    setupWindow({ __TAURI_INTERNALS__: {}, Notification: MockNotification });
    const { sendNotification } = loadConfig();
    tauriNotification.isPermissionGranted.mockResolvedValue(false);
    const n = await sendNotification('Hi', { body: 'there' });
    expect(tauriNotification.sendNotification).not.toHaveBeenCalled();
    expect(instances).toHaveLength(1);
    expect(n.title).toBe('Hi');
  });

  test('warns and falls back to the Web API when the Tauri plugin throws', async () => {
    const { MockNotification, instances } = installNotification('granted');
    setupWindow({ __TAURI_INTERNALS__: {}, Notification: MockNotification });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { sendNotification } = loadConfig();
    tauriNotification.isPermissionGranted.mockRejectedValue(new Error('no plugin'));
    await sendNotification('Hi');
    expect(warn).toHaveBeenCalled();
    expect(instances).toHaveLength(1);
  });

  test('attaches an onclick handler when one is supplied', async () => {
    const { MockNotification } = installNotification('granted');
    setupWindow({ Notification: MockNotification });
    const { sendNotification } = loadConfig();
    const onclick = jest.fn();
    const n = await sendNotification('Hi', { body: 'b', onclick });
    expect(n.onclick).toBe(onclick);
  });

  test('returns the notification when no onclick handler is supplied', async () => {
    const { MockNotification } = installNotification('granted');
    setupWindow({ Notification: MockNotification });
    const { sendNotification } = loadConfig();
    const n = await sendNotification('Hi');
    expect(n).toBeDefined();
    expect(n.onclick).toBeUndefined();
  });

  test('returns undefined when Web permission is not granted', async () => {
    const { MockNotification, instances } = installNotification('denied');
    setupWindow({ Notification: MockNotification });
    const { sendNotification } = loadConfig();
    await expect(sendNotification('Hi')).resolves.toBeUndefined();
    expect(instances).toHaveLength(0);
  });

  test('returns undefined when the Notification API is unavailable', async () => {
    setupWindow();
    const { sendNotification } = loadConfig();
    await expect(sendNotification('Hi')).resolves.toBeUndefined();
  });
});

describe('openExternalUrl', () => {
  test('uses the Tauri opener plugin', async () => {
    const win = setupWindow({ __TAURI_INTERNALS__: {} });
    const { openExternalUrl } = loadConfig();
    await openExternalUrl('https://example.com');
    expect(tauriOpener.openUrl).toHaveBeenCalledWith('https://example.com');
    expect(win.open).not.toHaveBeenCalled();
  });

  test('uses the Capacitor Browser plugin', async () => {
    const win = setupWindow({ Capacitor: { isNativePlatform: () => true } });
    const { openExternalUrl } = loadConfig();
    await openExternalUrl('https://example.com');
    expect(capacitorBrowser.Browser.open).toHaveBeenCalledWith({ url: 'https://example.com' });
    expect(win.open).not.toHaveBeenCalled();
  });

  test('falls back to window.open on web and Electron', async () => {
    const win = setupWindow({ __NEXUS_CONFIG__: { isDesktop: true } });
    const { openExternalUrl } = loadConfig();
    await openExternalUrl('https://example.com');
    expect(win.open).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer');
    expect(tauriOpener.openUrl).not.toHaveBeenCalled();
    expect(capacitorBrowser.Browser.open).not.toHaveBeenCalled();
  });
});

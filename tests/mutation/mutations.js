/**
 * Mutation definitions.
 *
 * Each entry breaks one specific behaviour in a source file the way a careless
 * refactor would, and names the test file that is expected to notice. Scoping
 * `tests` narrowly matters: it makes a kill attributable to those tests rather
 * than to coverage that happens to exist elsewhere in the suite.
 *
 * Adding one: pick a decision the code makes, invert or weaken it, and point
 * `tests` at the suite that should care. `find` must match the file exactly
 * once — the runner aborts the entry otherwise rather than reporting a kill it
 * never earned. Write `find`/`repl` with \n; the runner rewrites them to the
 * file's own line endings.
 */

const CLIENT_CONFIG = 'client/src/config.js';
const SERVER_CONFIG = 'server/config.js';

// Test-path patterns, as passed to jest --testPathPattern.
const CLIENT_CONFIG_TESTS = 'automated/client/configPlatform\\.test\\.js';
const SERVER_CONFIG_TESTS = 'automated/config\\.test\\.js';

module.exports = [
  // ---- client/src/config.js: runtime detection ------------------------------
  {
    id: 'isTauriApp: drop the legacy __TAURI__ fallback',
    file: CLIENT_CONFIG,
    tests: CLIENT_CONFIG_TESTS,
    find:
      "return !!(window.__TAURI_INTERNALS__ || window.__TAURI__);\n}\n\n/**\n * Detect if the app is running inside a Capacitor",
    repl:
      "return !!window.__TAURI_INTERNALS__;\n}\n\n/**\n * Detect if the app is running inside a Capacitor",
  },
  {
    id: 'isCapacitorApp: treat the presence of Capacitor as native',
    file: CLIENT_CONFIG,
    tests: CLIENT_CONFIG_TESTS,
    find: '  return !!window.Capacitor?.isNativePlatform?.();',
    repl: '  return !!window.Capacitor;',
  },
  {
    id: 'isElectronApp: treat the presence of the preload bridge as desktop',
    file: CLIENT_CONFIG,
    tests: CLIENT_CONFIG_TESTS,
    find: '  return !!window.__NEXUS_CONFIG__?.isDesktop;',
    repl: '  return !!window.__NEXUS_CONFIG__;',
  },

  // ---- client/src/config.js: getPlatform -----------------------------------
  {
    id: 'getPlatform: consult the user agent before the preload platform',
    file: CLIENT_CONFIG,
    tests: CLIENT_CONFIG_TESTS,
    find:
      "  if (window.__NEXUS_CONFIG__?.platform) return window.__NEXUS_CONFIG__.platform;\n  // User agent heuristic for Tauri and browser\n  const ua = navigator.userAgent.toLowerCase();",
    repl:
      "  const ua = navigator.userAgent.toLowerCase();\n  if (ua.includes('linux')) return 'linux';\n  if (window.__NEXUS_CONFIG__?.platform) return window.__NEXUS_CONFIG__.platform;",
  },
  {
    id: 'getPlatform: drop win64 from the Windows check',
    file: CLIENT_CONFIG,
    tests: CLIENT_CONFIG_TESTS,
    find: "ua.includes('windows') || ua.includes('win64') || ua.includes('win32')",
    repl: "ua.includes('windows') || ua.includes('win32')",
  },
  {
    id: "getPlatform: drop the bare 'mac os' check",
    file: CLIENT_CONFIG,
    tests: CLIENT_CONFIG_TESTS,
    find: "if (ua.includes('macintosh') || ua.includes('mac os')) return 'darwin';",
    repl: "if (ua.includes('macintosh')) return 'darwin';",
  },

  // ---- client/src/config.js: notifications ---------------------------------
  {
    id: 'requestNotificationPermission: always re-request on Tauri',
    file: CLIENT_CONFIG,
    tests: CLIENT_CONFIG_TESTS,
    find:
      '      if (!(await isPermissionGranted())) {\n        await requestPermission();\n      }',
    repl: '      await isPermissionGranted();\n      await requestPermission();',
  },
  {
    id: "requestNotificationPermission: request even when permission is not 'default'",
    file: CLIENT_CONFIG,
    tests: CLIENT_CONFIG_TESTS,
    find: "  if (window.Notification && Notification.permission === 'default') {",
    repl: '  if (window.Notification) {',
  },
  {
    id: 'sendNotification: send via Tauri without checking permission',
    file: CLIENT_CONFIG,
    tests: CLIENT_CONFIG_TESTS,
    find:
      "      if (await isPermissionGranted()) {\n        tauriNotify({ title, body: options.body || '' });\n        return;\n      }",
    repl:
      "      await isPermissionGranted();\n      tauriNotify({ title, body: options.body || '' });\n      return;",
  },
  {
    id: 'sendNotification: drop the empty-string body default',
    file: CLIENT_CONFIG,
    tests: CLIENT_CONFIG_TESTS,
    find: "tauriNotify({ title, body: options.body || '' });",
    repl: 'tauriNotify({ title, body: options.body });',
  },
  {
    id: 'sendNotification: drop the onclick wiring',
    file: CLIENT_CONFIG,
    tests: CLIENT_CONFIG_TESTS,
    find: '    if (options.onclick) n.onclick = options.onclick;\n',
    repl: '',
  },
  {
    id: 'sendNotification: construct a notification regardless of permission',
    file: CLIENT_CONFIG,
    tests: CLIENT_CONFIG_TESTS,
    find: "  if (window.Notification?.permission === 'granted') {",
    repl: '  if (window.Notification) {',
  },

  // ---- client/src/config.js: openExternalUrl -------------------------------
  {
    id: 'openExternalUrl: drop the Capacitor branch',
    file: CLIENT_CONFIG,
    tests: CLIENT_CONFIG_TESTS,
    find:
      "  if (isCapacitorApp()) {\n    const { Browser } = await import('@capacitor/browser');\n    return Browser.open({ url });\n  }\n",
    repl: '',
  },
  {
    // Guards against reverse tabnabbing, so worth a standing mutation.
    id: 'openExternalUrl: drop noopener,noreferrer from window.open',
    file: CLIENT_CONFIG,
    tests: CLIENT_CONFIG_TESTS,
    find: "window.open(url, '_blank', 'noopener,noreferrer');",
    repl: "window.open(url, '_blank');",
  },

  // ---- server/config.js: production fail-fast guard ------------------------
  {
    id: 'guard: misspell the production env name',
    file: SERVER_CONFIG,
    tests: SERVER_CONFIG_TESTS,
    find: "const isProduction = process.env.NODE_ENV === 'production';",
    repl: "const isProduction = process.env.NODE_ENV === 'prod';",
  },
  {
    id: 'guard: stop requiring POSTGRES_PASSWORD',
    file: SERVER_CONFIG,
    tests: SERVER_CONFIG_TESTS,
    find: "const required = ['JWT_SECRET', 'DATABASE_URL', 'POSTGRES_PASSWORD'];",
    repl: "const required = ['JWT_SECRET', 'DATABASE_URL'];",
  },
  {
    id: 'guard: invert the missing-var filter',
    file: SERVER_CONFIG,
    tests: SERVER_CONFIG_TESTS,
    find: 'const missing = required.filter(key => !process.env[key]);',
    repl: 'const missing = required.filter(key => process.env[key]);',
  },
  {
    id: 'guard: never trip the missing-vars branch',
    file: SERVER_CONFIG,
    tests: SERVER_CONFIG_TESTS,
    find: '  if (missing.length > 0) {',
    repl: '  if (missing.length > 99) {',
  },
  {
    id: 'guard: exit 0 instead of 1 on missing vars',
    file: SERVER_CONFIG,
    tests: SERVER_CONFIG_TESTS,
    find:
      "    console.error(`Missing required environment variables for production: ${missing.join(', ')}`);\n    process.exit(1);",
    repl:
      "    console.error(`Missing required environment variables for production: ${missing.join(', ')}`);\n    process.exit(0);",
  },
  {
    id: 'guard: stop rejecting the default JWT_SECRET',
    file: SERVER_CONFIG,
    tests: SERVER_CONFIG_TESTS,
    find: "  if (process.env.JWT_SECRET === 'dev-secret-key') {",
    repl: "  if (process.env.JWT_SECRET === 'some-other-placeholder') {",
  },
];

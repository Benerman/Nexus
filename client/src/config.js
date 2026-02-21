/**
 * Centralized server URL resolution for all platforms.
 *
 * Priority:
 *   1. localStorage nexus_server_url   (user-configured, for standalone apps)
 *   2. window.__NEXUS_CONFIG__.serverUrl  (Electron preload bridge)
 *   3. window.__NEXUS_SERVER_URL__        (Tauri/Capacitor runtime injection)
 *   4. process.env.REACT_APP_SERVER_URL   (CRA build-time env var)
 *   5. ''                                 (same-origin, for web/Docker)
 */
export function getServerUrl() {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('nexus_server_url');
    if (saved) return saved;
    if (window.__NEXUS_CONFIG__?.serverUrl) return window.__NEXUS_CONFIG__.serverUrl;
    if (window.__NEXUS_SERVER_URL__) return window.__NEXUS_SERVER_URL__;
  }
  return process.env.REACT_APP_SERVER_URL || '';
}

/**
 * Save user-configured server URL to localStorage.
 * Pass empty string or null to clear.
 */
export function setServerUrl(url) {
  if (url) {
    localStorage.setItem('nexus_server_url', url.replace(/\/+$/, ''));
  } else {
    localStorage.removeItem('nexus_server_url');
  }
}

/**
 * Detect if the app is running as a standalone (non-web) application.
 * Returns true for Electron, Tauri, or Capacitor builds.
 */
export function isStandaloneApp() {
  if (typeof window === 'undefined') return false;
  // Electron
  if (window.__NEXUS_CONFIG__?.isDesktop) return true;
  // Tauri
  if (window.__TAURI_INTERNALS__ || window.__TAURI__) return true;
  // Capacitor
  if (window.Capacitor?.isNativePlatform?.()) return true;
  return false;
}

/**
 * Detect if the app is running inside a Tauri webview specifically.
 * Unlike isStandaloneApp(), this does NOT match Electron or Capacitor.
 */
export function isTauriApp() {
  if (typeof window === 'undefined') return false;
  return !!(window.__TAURI_INTERNALS__ || window.__TAURI__);
}

/**
 * Check if a server URL has been configured (either by user or build-time).
 */
export function hasServerUrl() {
  return !!getServerUrl();
}

/**
 * Check if the standalone app needs server URL configuration.
 */
export function needsServerSetup() {
  return isStandaloneApp() && !hasServerUrl();
}

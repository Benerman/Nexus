/**
 * Centralized server URL resolution for all platforms.
 *
 * Priority:
 *   1. window.__NEXUS_CONFIG__.serverUrl  (Electron preload bridge)
 *   2. window.__NEXUS_SERVER_URL__        (Tauri/Capacitor runtime injection)
 *   3. process.env.REACT_APP_SERVER_URL   (CRA build-time env var)
 *   4. ''                                 (same-origin, for web/Docker)
 */
export function getServerUrl() {
  if (typeof window !== 'undefined') {
    if (window.__NEXUS_CONFIG__?.serverUrl) return window.__NEXUS_CONFIG__.serverUrl;
    if (window.__NEXUS_SERVER_URL__) return window.__NEXUS_SERVER_URL__;
  }
  return process.env.REACT_APP_SERVER_URL || '';
}

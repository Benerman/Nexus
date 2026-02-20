/**
 * Tauri auto-updater integration.
 *
 * Checks for updates on startup (if running in Tauri) and via
 * the Help > "Check for Updates" menu item.
 *
 * Requires:
 *   - tauri-plugin-updater configured with a valid pubkey + endpoint in tauri.conf.json
 *   - @tauri-apps/plugin-updater and @tauri-apps/plugin-process npm packages
 */

let checkFn = null;
let relaunchFn = null;

async function loadPlugins() {
  if (checkFn) return true;
  try {
    const updater = await import('@tauri-apps/plugin-updater');
    const process = await import('@tauri-apps/plugin-process');
    checkFn = updater.check;
    relaunchFn = process.relaunch;
    return true;
  } catch {
    return false;
  }
}

/**
 * Check for updates. Returns update info or null if up to date.
 * Shows UI feedback via the provided callbacks.
 */
export async function checkForUpdates({ onStatus, onUpdateAvailable, onError } = {}) {
  const loaded = await loadPlugins();
  if (!loaded) {
    onError?.('Updater not available');
    return null;
  }

  onStatus?.('Checking for updates...');

  try {
    const update = await checkFn();

    if (update) {
      onUpdateAvailable?.({
        version: update.version,
        notes: update.body,
        date: update.date,
        install: async (onProgress) => {
          onStatus?.(`Downloading v${update.version}...`);
          await update.downloadAndInstall((event) => {
            if (event.event === 'Progress' && onProgress) {
              onProgress(event.data);
            }
          });
          onStatus?.('Update installed! Restarting...');
          await relaunchFn();
        }
      });
      return update;
    } else {
      onStatus?.('You are on the latest version.');
      return null;
    }
  } catch (err) {
    onError?.(err?.message || 'Failed to check for updates');
    return null;
  }
}

/**
 * Register the global callback for the "Check for Updates" menu item.
 * Call this once on app startup.
 */
export function registerMenuUpdateCheck(callbacks) {
  if (typeof window !== 'undefined') {
    window.__NEXUS_CHECK_UPDATES = () => checkForUpdates(callbacks);
  }
}

/**
 * Auto-check for updates on startup (silent — only notifies if update found).
 * Waits a few seconds after app load to avoid blocking startup.
 */
export function autoCheckOnStartup(callbacks) {
  if (!window.__TAURI_INTERNALS__ && !window.__TAURI__) return;

  setTimeout(async () => {
    const loaded = await loadPlugins();
    if (!loaded) return;

    try {
      const update = await checkFn();
      if (update) {
        callbacks?.onUpdateAvailable?.({
          version: update.version,
          notes: update.body,
          date: update.date,
          install: async (onProgress) => {
            await update.downloadAndInstall((event) => {
              if (event.event === 'Progress' && onProgress) {
                onProgress(event.data);
              }
            });
            await relaunchFn();
          }
        });
      }
    } catch {
      // Silent failure on auto-check
    }
  }, 10000);
}

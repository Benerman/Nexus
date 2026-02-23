/**
 * Capacitor update checker via GitHub Releases API.
 *
 * Checks for a newer version by comparing the latest release tag
 * against the build-time REACT_APP_VERSION. On update, opens the
 * APK download URL in the system browser — the OS handles installation.
 */

import { openExternalUrl } from '../config';

const RELEASES_URL = 'https://api.github.com/repos/Benerman/Nexus/releases/latest';

function compareVersions(current, latest) {
  const parse = (v) => v.replace(/^v/, '').split('.').map(Number);
  const a = parse(current);
  const b = parse(latest);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const av = a[i] || 0;
    const bv = b[i] || 0;
    if (bv > av) return 1;
    if (bv < av) return -1;
  }
  return 0;
}

/**
 * Check for updates. Same callback interface as updater.js.
 */
export async function checkForCapacitorUpdate({ onStatus, onUpdateAvailable, onError } = {}) {
  const currentVersion = process.env.REACT_APP_VERSION;
  if (!currentVersion) {
    onError?.('Version info not available');
    return null;
  }

  onStatus?.('Checking for updates...');

  try {
    const res = await fetch(RELEASES_URL, {
      headers: { 'Accept': 'application/vnd.github.v3+json' },
    });

    if (!res.ok) {
      onError?.('Could not reach update server');
      return null;
    }

    const release = await res.json();
    const latestVersion = (release.tag_name || '').replace(/^v/, '');

    if (!latestVersion || compareVersions(currentVersion, latestVersion) <= 0) {
      onStatus?.('You are on the latest version.');
      return null;
    }

    // Find APK asset
    const apkAsset = (release.assets || []).find(a => a.name.endsWith('.apk'));
    const downloadUrl = apkAsset?.browser_download_url || release.html_url;

    onUpdateAvailable?.({
      version: latestVersion,
      notes: release.body,
      date: release.published_at,
      install: () => openExternalUrl(downloadUrl),
    });

    return { version: latestVersion };
  } catch (err) {
    onError?.(err?.message || 'Failed to check for updates');
    return null;
  }
}

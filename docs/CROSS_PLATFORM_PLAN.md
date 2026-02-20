# Cross-Platform Build Pipeline for Nexus

## Context
The Nexus client is currently a web-only React app served via nginx/Docker. This plan adds deployment to **all 5 platforms**: Android, iOS, Windows, macOS, and Linux using **Capacitor** (mobile), **Tauri** (primary desktop), and **Electron** (fallback desktop).

---

## Step 1: Create `client/src/config.js` — Centralized Server URL

All 6 files that reference `process.env.REACT_APP_SERVER_URL` use a shared resolver that supports runtime injection from native shells.

**Refactor files:** App.js, SocketContext.js, LoginScreen.js, URLEmbed.js, GifPicker.js, SettingsModal.js

## Step 2: Relax CSP in `client/public/index.html`

Add `https: http:` to `connect-src` for native app origins.

## Step 3: Update Server CORS (`server/index.js`)

Accept native app origins: `capacitor://localhost`, `tauri://localhost`, `null` (Electron)

## Step 4: Set `"homepage": "./"` in `client/package.json`

Relative paths for Electron file:// loading compatibility.

## Step 5: Capacitor (Android + iOS)

Install @capacitor/core, cli, status-bar, splash-screen, app, keyboard. Init with appId `com.nexus.app`.

## Step 6: Tauri (Desktop Primary — Windows, macOS, Linux)

Install @tauri-apps/cli@^2, @tauri-apps/api@^2. Configure window 1280x800, bundle targets for all 3 OS.

## Step 7: Electron (Desktop Fallback)

Install electron@^33, electron-builder@^25. Main process loads build/index.html, preload injects server config.

## Step 8: Build Scripts

- `build:web`, `build:mobile`, `build:android`, `build:ios`
- `tauri:dev`, `build:desktop-tauri`
- `electron:dev`, `build:desktop-electron`
- `build:all`

## Step 9: App Icon

1024x1024 source icon → generate all platform sizes via `npx tauri icon` and `npx capacitor-assets generate`.

## App Store Distribution

### Google Play Store
1. Create Google Play Developer account ($25 one-time)
2. Sign AAB with keystore: `keytool -genkey -v -keystore nexus.keystore -alias nexus -keyalg RSA -keysize 2048 -validity 10000`
3. Build release AAB: `cd android && ./gradlew bundleRelease`
4. Upload to Play Console, fill listing, submit for review (1-3 days)

### Apple App Store
1. Enroll in Apple Developer Program ($99/year)
2. Create App ID + provisioning profile in developer.apple.com
3. Archive in Xcode, upload to App Store Connect
4. Submit for review (1-2 days)
5. Use TestFlight for beta distribution

### Desktop (no store required)
- Distribute .exe/.msi, .dmg/.app, .AppImage/.deb directly
- macOS: notarize with Apple Developer account to avoid "unidentified developer" warning
- Windows: optional Authenticode code-signing certificate ($70-200/year)

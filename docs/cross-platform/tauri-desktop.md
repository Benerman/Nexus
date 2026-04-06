# Tauri Desktop App

Nexus ships a lightweight desktop app built with Tauri for Windows, macOS, and Linux.

## Development

```bash
cd client
npm run tauri:dev
```

## Building

Desktop builds are produced via the CI release workflow (`release.yml`). Tauri generates platform-specific installers.

## Configuration

Tauri configuration lives in `client/src-tauri/tauri.conf.json`. The version field must match `client/package.json`.

## Icons

Desktop icons are generated from `client/scripts/icon-master.svg`:

| File | Platform |
|------|----------|
| `icon.png` | Linux |
| `icon.ico` | Windows |
| `icon.icns` | macOS |
| `32x32.png`, `128x128.png`, `128x128@2x.png` | All |
| `Square*.png`, `StoreLogo.png` | Windows Store |

Generate with: `node scripts/generate-icons.mjs` from `client/`.

## Related

- [Web](web.md) — Web client
- [Electron Desktop](electron-desktop.md) — Alternative desktop app

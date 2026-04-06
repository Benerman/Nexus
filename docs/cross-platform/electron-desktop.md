# Electron Desktop App

Nexus includes an Electron build as a fallback desktop option.

## Development

```bash
cd client
npm run electron:dev
```

## When to Use Electron

Tauri is the preferred desktop platform. Use Electron when:
- Tauri doesn't support a required native API
- You need Node.js integration in the renderer process
- Platform-specific Tauri builds are unavailable

## Related

- [Web](web.md) — Web client
- [Tauri Desktop](tauri-desktop.md) — Primary desktop app

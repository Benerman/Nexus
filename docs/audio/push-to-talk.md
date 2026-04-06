# Push to Talk

Push to Talk (PTT) keeps your microphone muted until you hold a key.

## Configuration

Enable PTT in **Settings → Audio → Push to Talk**.

Set a keybinding for the PTT key. While the key is held, your microphone transmits. Releasing the key mutes your mic.

## Platform Support

PTT works on all platforms:

- **Web** — Keyboard-based PTT
- **Desktop (Tauri/Electron)** — Global hotkey support (works even when Nexus is not focused)
- **Mobile (Capacitor)** — On-screen PTT button

## Tips

- Choose a key that's easy to reach and won't interfere with typing
- PTT overrides mute state — holding the PTT key transmits even if you're muted
- Combine with noise gate for extra noise prevention

## Related

- [Audio Settings](audio-settings.md) — Overview
- [Voice & Video](../user-guide/voice-and-video.md) — Voice channels

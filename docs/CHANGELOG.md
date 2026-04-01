# Changelog

All notable changes to Nexus are documented here. Versions follow [Semantic Versioning](https://semver.org/).

---

## [1.0.12] — 2026-03-27

### Fixed
- Auto-enter fullscreen when watching screen share in mobile landscape orientation
- Screen share viewer watch button was a no-op due to early return
- DM section showing server channel info in mobile navigation
- Reactions on thread reply messages not persisting correctly
- Reaction event name mismatch: `message:reacted` corrected to `message:reaction`
- Data leaking between accounts on logout
- White screen on `/invite/*` routes caused by relative asset path

### Added
- Reaction action bar on thread reply messages
- Context menu on thread messages
- SSE (Server-Sent Events) debug endpoint for diagnostics
- Voice event logging for diagnostics
- SSE event bridge now intercepts `socket.to()`, `socket.broadcast`, and `io.to().emit()` for full event coverage

### Changed
- SSE bridge extracts room context, eliminating duplicate events

---

## [1.0.11] — 2026-03-16

### Added
- Multi-sharer screen share with thumbnail previews (multiple users can share simultaneously)
- Android APK published alongside AAB in release workflow

### Fixed
- Tauri v2 API global-shortcut plugin initialization

---

## [1.0.10] — 2026-03-12

### Added
- **AutoMod system**: keyword filtering, spam detection, configurable actions (warn/delete/timeout/ban), per-channel bypass rules, audit logging of all actions
- **E2E Encryption**: libsodium-based end-to-end encryption for DMs with key exchange handshake
- **LAN Mode**: local-network discovery and direct connection without external server
- **MCP (Model Context Protocol) Bot Integration**: 20+ server management tools via AI assistant; supports read-only and destructive scopes; rate limited
- **Themes**: full CSS variable-based theme system with multiple built-in themes (Dark, Light, AMOLED, etc.)
- **Push-to-Talk (PTT)**: hold-key voice activation with configurable global shortcut (Tauri/Electron)
- **Noise gate with attack smoothing**: configurable threshold and inter-word pause detection
- **RNNoise ML noise cancellation**: three aggressiveness levels (Low/Medium/High), WASM fallback
- **AGC (Automatic Gain Control)**: leveler, limiter, VAD-gating, noise floor tracking
- **Voice persistence**: voice channel rejoins automatically after page reload/navigation
- **Audio levels meter**: real-time mic input level display in settings
- **Structured logging**: Winston with daily log rotation, structured JSON output, domain-prefixed log parsing
- **Performance/stress test suite**: load testing and latency benchmarking
- NEW messages divider for unread channel messages
- Context menu moderation actions with granular permissions (timeout, kick, ban from chat)
- Offline resilience: smart session restore, error boundary, disconnected UX state

### Fixed
- Orphaned stats query column name
- GIF picker positioning in theme system
- Deploy failures from root-owned logs directory in checkout path

---

## [1.0.9] — 2026-03-02

### Added
- **Message Threads**: full-screen thread view with rich previews, thread browser panel in channel header, named threads, thread navigation bar on mobile
- **Message Pins & Bookmarks**: pin messages in channels (admin), bookmark messages personally, pin/bookmark browser panel
- **Message Search**: Gmail-style filters (`from:`, `in:`, `has:`, `before:`, `after:`, `is:`)
- **Audit Log**: per-server log of moderation and admin actions
- Resume last server and channel on app load
- Voice audio persists when navigating away from voice channel
- Context menu pin, bookmark, and thread actions
- Android release builds switched to AAB format

### Fixed
- macOS release build race condition on `latest.json`
- DM creation for non-friends
- Mobile long-press context menu

---

## [1.0.7] — 2026-03-01

### Fixed
- DM creation for non-friends and mobile long-press context menu interactions
- macOS dock icon restore after hide

---

## [1.0.6] — 2026-03-01

### Added
- In-app ConfirmModal replacing `window.confirm` system dialogs

### Fixed
- Webhook message loading when not in server memory
- Webhook deletion
- Server pill position in sidebar
- Dock click behavior on macOS

---

## [1.0.5] — 2026-02-28

### Added
- **AudioWorklet audio processing pipeline**: moves noise gate, AGC, and cancellation off the main thread
- **RNNoise ML noise cancellation** (initial integration)

### Fixed
- Notification content formatting
- Webhook deletion edge case
- Server pill position

---

## [1.0.4] — 2026-02-28

### Fixed
- Linux DMA-BUF gray screen (disabled WebKitGTK DMA-BUF renderer)
- Linux and Windows release build failures
- macOS screen sharing picker showing default Tauri icon
- Keep real-time connection alive when Tauri app is backgrounded

---

## [1.0.3] — 2026-02-27

### Added
- **Webhook embeds**: Discord-compatible embed format in webhook messages (`embeds` field with title, description, color)
- **Mute channels & categories**: per-user mute with visual indicators in sidebar
- Consolidated release CI/CD builds

### Fixed
- Webhook message persistence
- Linux gray screen on Tauri
- CI/CD cross-platform build issues

---

## [1.0.2] — 2026-02-25

### Added
- Custom emoji support (per-server emoji upload and usage)
- Message requests (accept/decline DMs from non-friends)
- DM calls (voice calls in direct messages)
- Recovery codes for account security (2FA backup)
- Server ICE configuration (custom STUN/TURN servers per server)
- Soundboard (per-server audio clips playable in voice channels)

### Fixed
- Various DM and social system stability fixes

---

## [1.0.1] — 2026-02-21

### Added
- Desktop app improvements (Tauri macOS, Electron, Capacitor mobile)
- Improved cross-platform build support

---

## [1.0.0] — 2026-02-20

### Initial Release

- Real-time messaging with Socket.IO
- Voice/video channels with WebRTC P2P mesh
- Server/channel/category management
- Roles & permissions system (12 permission types, channel-level overrides)
- Direct messaging (1-on-1 and group DMs)
- Friend system (requests, blocks, reports)
- Webhooks with cryptographic token authentication
- File/image attachments (drag-drop, paste, up to 4 per message, 10MB limit)
- GIF search via Giphy integration
- Message reactions (8 quick-pick emoji)
- Message edit and delete
- Typing indicators
- Online status (online, idle, DND, invisible)
- Custom avatars and server icons (base64 upload)
- Screen sharing
- Per-user volume controls in voice
- Speaking indicators
- User profiles with bio and color
- Guest mode (no registration required)
- bcrypt password hashing (12 rounds)
- JWT session management (7-day access + 30-day refresh)
- Helmet.js security headers, CORS whitelist, rate limiting, input sanitization
- Docker Compose multi-container deployment (Postgres 15, Redis 7, Nginx)
- 9 database migrations
- 13 Socket.IO handler modules
- 299 automated tests

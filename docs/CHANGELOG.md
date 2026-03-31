# Changelog

All notable changes to Nexus are documented here.

---

## [1.0.12] — March 2026

### Added
- **Redis hot-channel message cache** — latest messages for active channels stored in Redis sorted sets; reduces PostgreSQL load on high-traffic channels while keeping the DB as authoritative source
- **MCP bot framework** — full bot integration system:
  - Bot accounts (`is_bot` flag on accounts) with owner and description
  - Bot tokens with scopes, per-server restrictions, and expiry (stored as SHA-256 hashes)
  - MCP connections: register external MCP-compliant servers (SSE or HTTP transport) with encrypted auth config
  - Agent configurations: tie a bot account to an MCP connection with system prompt, trigger mode (`mention`, `keyword`, `all`), trigger channels/keywords, and response length cap
  - Streaming responses via `mcp:stream:start` / `mcp:stream:chunk` / `mcp:stream:end`
  - Agent activity log (`agent_activity_log` table) tracking tool calls, token usage, and errors
  - Settings UI for managing tokens, bots, connections, and agents per server
- **Image and thumbnail URL embeds** — paste a URL with an image/video to render a thumbnail embed card
- **SSE event bridge** — server-sent event bridge for MCP clients to receive real-time channel events
- 9 new moderation socket events: `channel:update`, `channel:delete`, `server:unban-user`, `server:remove-timeout`, `moderation:get-bans`, `moderation:get-timeouts`, and more

### Fixed
- DM section incorrectly showing server channel info
- Mobile navigation UX improvements
- Reactions on thread reply messages
- Extra blank lines in tools module after SSE cleanup

---

## [1.0.11] — February 2026

### Added
- **Multi-sharer screen sharing** — multiple users in the same voice channel can share screens simultaneously; each gets a dedicated tile
- **Screen share thumbnails** — compact thumbnail tiles for inactive sharers via `screen:thumbnail`

### Fixed
- `setScreenSharerSocketId` → `setScreenSharerSocketIds` for multi-sharer state
- White screen on `/invite/*` routes (absolute asset paths in production build)
- Data leaking between accounts on logout (state cleared properly on disconnect)
- 47 MCP security and usability issues from comprehensive audit
- 12 MCP integration security hardening fixes

---

## [1.0.10] — January 2026

### Added
- **NEW messages divider** — red "NEW" line marks the first unread message when switching to a channel with unread messages
- **Context menu moderation** — right-click users in the member list, voice tiles, or on chat messages to access kick, ban, timeout, voice mute/deafen/move/kick actions with granular permission checks
- **Offline resilience** — smart session restore on reconnect; error boundary prevents full-app crash

### Fixed
- Mobile action button pointer-events timing (reduced from 300 ms to 200 ms)
- Thread nav bar and full-width mobile panels
- Synthesized click events triggering mobile quick action buttons

---

## [1.0.9] — December 2025

### Added
- **Push-to-Talk (PTT)** — hold a configurable key to transmit; works on desktop (global shortcut via Tauri) and mobile; keybind persisted in `localStorage`
- **Voice channel persistence** — auto-rejoin on page reload; recovers voice state from `localStorage`
- **Advanced audio processing pipeline** (in `AudioWorkletProcessor`):
  - Noise gate with attack/release envelope and sidechain filtering
  - RNNoise WASM ML noise cancellation — Low / Medium / High aggressiveness levels
  - Dual-stage AGC: leveler + limiter tracking noise floor; only updates when gate is `open` (prevents pumping)
  - Dynamics compressor for peak limiting
- **AutoMod system**:
  - Rule types: `keyword` (word/phrase filter), `spam` (duplicate message throttle), `invite_link` (block invite URLs)
  - Actions: `block`, `warn`, `timeout`, `ban`
  - Exempt roles and channels per rule; `automod:test-rule` for live testing
- **Structured logging** — Winston with daily log rotation, JSON format, domain-prefixed log parsing, separate audit log stream; files in `server/data/logs/`
- **Runtime metrics** — `GET /api/metrics` (admin-only) returns connection counts, message/API rates, error counts, system stats
- Performance optimizations: batched DB queries, O(1) user-to-socket Map (`userIdToSocketId`), indexed queries

### Fixed
- Voice persistence edge cases for web, desktop, and mobile
- Duplicate back button in mobile thread view
- Deploy failures from root-owned logs directory

---

## [1.0.8] — November 2025

### Added
- **Themes** — 11 built-in themes: Dark (default), Retro, Terminal, Light, Neon, Blue, Cherry, Amber, Synthwave, Vaporwave, Forest, Cyberpunk; all pass WCAG AA contrast checks
- **Custom theme editor** — color pickers for all CSS custom properties with live preview; exportable as JSON
- **End-to-end encryption for 1:1 DMs** — X25519 key exchange + NaCl/libsodium (XSalsa20-Poly1305); server stores only ciphertext; private key never leaves the client
- **E2E key backup/recovery** — passphrase-encrypted export/import of private key; device verification via key fingerprints
- **LAN mode** — per-server toggle disabling GIF picker, URL previews, and external STUN servers; bundled self-hosted fonts; service worker for offline app shell
- **Self-hosted STUN/TURN** — bundled coturn option via `docker-compose.coturn.yml` overlay
- **Service worker** — caches React app shell for offline availability

### Fixed
- CSP updated to allow WASM compilation for libsodium and RNNoise
- Theme contrast fixes and semantic CSS variable cleanup
- GIF picker positioning in consolidated theme CSS system

---

## [1.0.7] — October 2025

### Added
- **DM voice/video calls** — initiate calls from any 1:1 DM; incoming call overlay with accept/decline
- **Mobile pull-to-refresh** — pull down in chat to reload messages

### Fixed
- Mobile thread UI: nav bar controls, full-width panels
- Mobile touch triggering hidden quick action buttons

---

## [1.0.6] — September 2025

### Added
- **Message request system** — non-friend users' first DM lands in Message Requests; recipient can accept, reject, or block

---

## [1.0.5] — August 2025

### Added
- **Message pinning** — pin/unpin via context menu (requires `manageMessages`); pinned messages panel per channel; max 50 pins
- **Message bookmarks** — any member can save messages; accessible from DM sidebar "Saved Messages"
- **Full-text message search** with Gmail-style operators: `from:`, `in:`, `has:`, `before:`, `after:`, `is:`
- **Audit log** — moderation actions recorded in `audit_log` table; accessible via `audit:get-logs`
- **Capacitor mobile builds** — Android APK and iOS builds from CI

---

## [1.0.4] — July 2025

### Added
- **Mobile long-press context menu** — long-press messages and users to open context menu on touch devices
- **Full thread panel** — dedicated thread panel slides in from the right; shows parent message and all replies with optional thread name
- **bcrypt password hashing** — migrated from HMAC-SHA256 to bcrypt (12 rounds); auto-migration on first login for existing accounts

### Fixed
- Message grouping edge cases
- Mobile blur overlay removed for side panels

---

## [1.0.3] — June 2025

### Added
- **Soundboard** — 16 procedurally generated built-in sounds; custom upload per server; play to voice channel or targeted user (requires `sendTargetedSounds` permission)
- **Custom intro/exit voice sounds** — per-user join and leave sounds configurable in Settings
- **DM pinnable conversations** — pin DM channels to the server list for quick access
- **Tauri desktop app** — Windows/macOS/Linux with auto-update, tray icon, native menus

---

## [1.0.2] — May 2025

### Added
- **Polls** — `/poll` slash command opens creation modal; up to 10 options; real-time vote count updates
- **Voice moderation** — force mute, force deafen, move to channel, kick from voice (with granular permission checks)
- **User reports** — `report:user` with review/action/dismiss workflow; `moderation:update-report`

---

## [1.0.1] — April 2025

### Added
- **Group DMs** — create group DM channels with 3+ participants; add/remove participants
- **Friend system** — friend requests, accept/reject, remove; friend list with pending and blocked views
- **User blocking** — block/unblock users; hides presence and prevents DM creation
- **Custom emoji** — upload up to 50 per server; 2–32 char name; available in composer emoji picker

---

## [1.0.0] — March 2025

Initial release of Nexus.

### Features
- User registration and login (bcrypt, minimum 8-char passwords)
- Token-based sessions (JWT, 7-day expiry, logout revocation)
- Multi-server support with custom names, icons, and descriptions
- Channel categories (collapsible) with drag-and-drop reordering
- Text and voice channel types
- Private channels with per-role permission overrides
- Role system with 18 permissions and channel-level overrides; server owner bypasses all checks
- Text messaging: send, edit, delete, reactions, replies, grouping, date separators
- Image and GIF attachments (paste, drag-drop, upload; up to 4 per message; 10 MB limit)
- GIF picker (Giphy integration; requires `GIPHY_API_KEY`)
- Typing indicators
- Message history pagination (50 per page)
- URL preview cards (Open Graph metadata, SSRF protected)
- Slash commands: `/roll`, `/coinflip`, `/8ball`, `/choose`, `/rps`, `/serverinfo`, `/remindme`, `/criticize`, `/quack`
- Voice channels: WebRTC peer-to-peer, speaking detection, mute/deafen, join/leave cues, per-user volume
- Screen sharing
- 1:1 Direct messages
- Webhooks (64-char cryptographic token, rate-limited, BOT badge, webhook docs in UI)
- Server invite links with optional expiry and usage limits
- User profiles: custom avatar, bio, display color, status (online/idle/dnd/invisible)
- Kick, ban, timeout with granular permission checks
- Platform admin panel (set via `PLATFORM_ADMIN` env var)
- Mobile responsive layout (768 px breakpoint, swipe navigation)
- Rate limiting (10 req/10 s on API; per-user message rate limiting)
- Helmet.js security headers (CSP, HSTS, X-Frame-Options)
- CORS restricted to `CLIENT_URL`
- Input validation and sanitization on all user input
- SSRF protection on URL preview endpoint
- Docker multi-container deployment (PostgreSQL 15, Redis 7, Node.js, Nginx)
- Database schema applied via migration files on container startup

# Nexus

A self-hosted, real-time communication platform built with React, Node.js, Socket.IO, and WebRTC. Supports servers, channels, voice chat, direct messaging, end-to-end encryption, AI noise cancellation, AutoMod, custom themes, and more.

[![Download](https://img.shields.io/badge/download-v1.0.9-blue)](https://github.com/Benerman/Nexus/releases/latest)
![Docker](https://img.shields.io/badge/docker-ready-blue)
![License](https://img.shields.io/badge/license-MIT-green)

> **[Download the latest release](https://github.com/Benerman/Nexus/releases/latest)** — available for Windows, macOS, Linux, Android, and iOS.

---

## Quick Start

```bash
# Clone and start all services
git clone https://github.com/Benerman/Nexus.git
cd Nexus
docker compose -p nexus-prod -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Access the app
open http://localhost:3000
```

This starts PostgreSQL, Redis, the Node.js backend, and the Nginx-served React frontend. The database schema is applied automatically on first run.

See [docs/deployment/DOCKER_DEPLOYMENT.md](docs/deployment/DOCKER_DEPLOYMENT.md) for production deployment details.

---

## Features

### Messaging
- Text channels with message editing, deletion, and replies
- **Threads** — create named discussion threads on any message with nested replies
- **Message pinning** — pin up to 50 messages per channel for quick reference
- **Bookmarks** — save messages for personal reference across servers
- **Polls** — create Yes/No, True/False, or multiple choice polls via `/poll`
- Markdown rendering with sanitized HTML
- Image and GIF attachments (paste, drag-drop, or upload; up to 4 per message)
- GIF picker with Giphy integration
- Emoji reactions (8 quick-pick emoji per message)
- @user, @role, and @everyone mentions with highlighting
- URL previews with Open Graph metadata
- Message link embeds (cross-channel message previews)
- Typing indicators with debounced "[user] is typing..." display
- Infinite scroll with message history pagination
- Message grouping by author with date separators
- **Message requests** — non-friends must send a message request before DMing

### Search Operators

Use Gmail-style filters in the search panel to narrow results:

| Operator | Example | Description |
|----------|---------|-------------|
| `from:` | `from:alice` | Messages from a specific user |
| `in:` | `in:general` | Messages in a specific channel |
| `has:` | `has:link`, `has:image`, `has:attachment` | Messages containing links, images, or any attachment |
| `before:` | `before:2025-06-01` | Messages before a date |
| `after:` | `after:2025-01-01` | Messages after a date |
| `is:` | `is:pinned` | Pinned messages |

Combine operators with free text: `hello world from:alice in:general has:link`

### Slash Commands
| Command | Description |
|---------|-------------|
| `/roll [NdN]` | Dice roll (default d6, up to d1000) |
| `/coinflip` | Heads or tails |
| `/8ball [question]` | Magic 8-Ball |
| `/choose [opt1\|opt2\|...]` | Random choice from options |
| `/rps [rock\|paper\|scissors]` | Rock Paper Scissors vs bot |
| `/poll` | Create a poll (opens modal) |
| `/serverinfo` | Server stats |
| `/remindme [duration] [message]` | Set a reminder (max 1 week) |
| `/criticize [@user]` | Daily roast |
| `/quack` | Random duck image |

### Voice Chat
- WebRTC peer-to-peer audio with STUN/TURN server support
- **Push-to-Talk (PTT)** — configurable key binding with adjustable delay; global shortcuts on Tauri/Electron
- **AI Noise Cancellation** — RNNoise ML-based noise suppression via WASM AudioWorklet with Low/Medium/High aggressiveness levels
- **Advanced audio pipeline** — industry-standard processing order: noise suppression → noise gate (with attack smoothing, soft floor, band-pass sidechain) → AGC (separate leveler + limiter, VAD-gated, dB-domain gain) → limiter
- **Adaptive noise floor** — automatic gate threshold and AGC gain ceiling based on background noise estimation
- Screen sharing with dedicated video tiles and fullscreen viewing
- Speaking detection with visual indicators
- Per-user volume controls and local mute
- Mute and deafen controls with state persistence
- **Voice persistence** — automatically rejoin voice channel on page reload (web/desktop)
- Custom intro/exit sounds per user
- Soundboard with 16 built-in sounds and custom upload support (trimming, categories, emoji assignment)
- Self-hosted STUN/TURN support with bundled coturn option
- **Mic test meter** in audio settings for input level validation

### End-to-End Encryption
- **Encrypted DMs** — X25519 + XSalsa20-Poly1305 encryption via libsodium; server never sees plaintext
- **Key backup/recovery** — export and import private keys encrypted with a passphrase (Argon2id KDF)
- **Device verification** — human-readable key fingerprints in user profiles for MITM detection
- Lock icon displayed on encrypted conversations

### Direct Messaging
- 1-on-1 and group DMs (3+ participants)
- Real-time DM creation with instant recipient notification
- Unread count badges and last message previews
- DM search and filtering
- Pinnable DM conversations to the server list
- DM voice/video calls with incoming call overlay and call persistence

### Servers and Channels
- Multi-server support with custom names, icons, and descriptions
- Channels organized in collapsible categories
- Text and voice channel types
- Private channels with per-role permission overrides
- Server invite system with optional expiration and usage limits
- Channel reordering within and across categories

### Roles and Permissions
Granular permissions with role hierarchy:

`viewChannel` `sendMessages` `attachFiles` `joinVoice` `readHistory` `addReactions` `mentionEveryone` `manageMessages` `manageChannels` `manageRoles` `manageServer` `muteMembers` `deafenMembers` `moveMembers` `kickMembers` `banMembers` `moderateMembers` `admin`

Permissions resolve through role stacking with channel-level overrides. Server owner bypasses all checks.

### Moderation
- **AutoMod** — configurable content filtering rules per server:
  - Keyword filter (substring or whole-word matching)
  - Spam detection (rate-based)
  - Invite link filter
  - Mention spam (threshold-based)
  - Configurable actions: warn, delete, timeout, ban
  - Per-rule role and channel exemptions
  - Test messages against rules before saving
- **Context menu moderation** — right-click users anywhere (member list, voice tiles, chat) for permission-gated actions:
  - Voice: kick from VC, server mute, server deafen, move to channel
  - Server: timeout (60s to 1 week), kick, ban (with message purge option)
- Kick, ban, and timeout users with duration picker
- Server bans persisted in database
- User reports with review/action/dismiss workflow
- Message deletion by author or moderator
- **Audit log** — track moderation actions and server changes (admin-only)

### Appearance
- **12 built-in themes**: Midnight, Retro OS, Terminal, Clean Light, Neon Green, Midnight Blue, Cherry Red, Amber CRT, Synthwave, Vaporwave, Forest, Cyberpunk
- **Custom theme editor** — create themes with color pickers for backgrounds, text, accents, and status colors
- WCAG AA contrast compliance across all themes
- Distinct visual identity per theme (3D borders for Retro, monospace for Terminal, neon glow for Neon, etc.)
- Configurable sidebar width

### Notifications
- Global and per-server/channel/category notification muting
- Sound controls for messages
- Notification pause timer

### Social
- Friend system with requests, accept/reject, and removal
- User blocking
- User profiles with custom avatars, bios, status, and display color
- Online/idle/DND/invisible status indicators
- Context menus on right-click (users and messages)

### Custom Emoji
- Upload custom emoji per server (up to 50)
- Emoji names validated (2-32 alphanumeric characters)
- Available in message composer across the server

### Webhooks
- Create webhooks per channel with auto-generated URLs containing a secret token
- Token-authenticated HTTP POST endpoint: `POST /api/webhooks/:webhookId/:token`
- Support for embeds and attachments
- Messages display with BOT badge
- Built-in documentation with cURL, JavaScript, and Python examples
- Rate limited (10 requests per 10 seconds)

```bash
curl -X POST http://localhost:3001/api/webhooks/WEBHOOK_ID/TOKEN \
  -H "Content-Type: application/json" \
  -d '{"content": "Hello!", "username": "MyBot", "avatar": "robot"}'
```

> **Security:** The webhook URL contains a cryptographic token. Keep it secret — anyone with the full URL can post to your channel. The token is only shown once at creation time.

### Platform Administration
- Dedicated admin panel for the designated platform admin user
- View and manage all servers and users across the platform
- Delete servers, delete/reset user accounts
- Orphaned data cleanup and server ownership reassignment
- Real-time metrics dashboard (connections, message rates, error counts, memory, uptime)

### Mobile
- Responsive layout with 768px breakpoint
- Swipe navigation (left for sidebar, right for member list)
- Touch-friendly context menus via long-press
- Horizontal server list on mobile
- Pull-to-refresh for chat

---

## Architecture

```
                    +-------------------+
                    |   Nginx (Client)  |  :3000
                    |  React SPA Build  |
                    +--------+----------+
                             |
                    +--------v----------+
                    | Express + Socket.IO|  :3001
                    |   (Backend Server) |
                    +---+----------+----+
                        |          |
               +--------v--+  +---v--------+
               | PostgreSQL |  |   Redis    |
               |   :5432    |  |   :6379    |
               +------------+  +------------+
```

| Service | Container | Port | Purpose |
|---------|-----------|------|---------|
| PostgreSQL 15 | `nexus-postgres` | 5432 | Primary database (accounts, messages, servers, DMs) |
| Redis 7 | `nexus-redis` | 6379 | Session cache, rate limiting |
| Node.js | `nexus-server` | 3001 | Backend API + Socket.IO + WebRTC signaling |
| Nginx | `nexus-client` | 3000 | Static React build with WebSocket proxy |
| Coturn | `nexus-coturn` | 3478 | Self-hosted STUN/TURN (optional overlay) |

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Socket.IO Client, WebRTC, libsodium (E2E encryption), RNNoise WASM |
| Backend | Express, Socket.IO, Node.js, Winston (structured logging) |
| Database | PostgreSQL 15 (JSONB), 18 migration files |
| Cache | Redis 7 (AOF persistence) |
| Proxy | Nginx with WebSocket upgrade support |
| Deployment | Docker Compose (base + prod/dev overlays) |

---

## Project Structure

```
nexus/
+-- client/                    # React frontend
|   +-- src/
|   |   +-- components/        # 32 UI components
|   |   |   +-- ChatArea.js        Messages, input, attachments, threads
|   |   |   +-- VoiceArea.js       WebRTC tiles, controls, soundboard
|   |   |   +-- Sidebar.js         Channels (server) / DMs (personal)
|   |   |   +-- ServerList.js      Server icon rail
|   |   |   +-- MemberList.js      Online/offline member list
|   |   |   +-- SettingsModal.js   Settings (profile, appearance, audio,
|   |   |   |                      notifications, security, friends,
|   |   |   |                      servers, server settings, channels,
|   |   |   |                      roles, members, webhooks, soundboard,
|   |   |   |                      emojis, moderation, audit log,
|   |   |   |                      platform admin, about)
|   |   |   +-- UserContextMenu.js Context menu with moderation actions
|   |   |   +-- GifPicker.js       Giphy integration
|   |   |   +-- PollCreator.js     Poll creation modal
|   |   |   +-- URLEmbed.js        URL preview cards
|   |   |   +-- UserProfileModal.js  User profile popup
|   |   |   +-- IncomingCallOverlay.js  DM call notifications
|   |   |   +-- WelcomeTour.js     New user onboarding
|   |   |   +-- icons/             SVG icon components
|   |   +-- hooks/
|   |   |   +-- useWebRTC.js       Voice, screen share, PTT, persistence
|   |   |   +-- useLongPress.js    Mobile long-press gesture
|   |   +-- utils/
|   |   |   +-- encryption.js      E2E encryption (libsodium)
|   |   +-- App.js                 Root state management, socket handlers
|   |   +-- config.js              Server URL resolver (web/native)
|   +-- public/
|   |   +-- audio-processor.js     AudioWorklet (gate, AGC, limiter)
|   |   +-- rnnoise-processor.js   RNNoise AudioWorklet
|   |   +-- rnnoise.wasm           ML noise suppression model
|   |   +-- fonts/                 Bundled DM Sans + Space Grotesk (WOFF2)
|   +-- Dockerfile                 Multi-stage: Node build + Nginx serve
|   +-- nginx.conf                 Reverse proxy with WSS support
|
+-- server/                    # Node.js backend
|   +-- index.js               # Express + Socket.IO (~136 socket events)
|   +-- handlers/              # 14 Socket.IO handler modules
|   |   +-- auth.js                Join, disconnect, user updates
|   |   +-- messages.js            Send, edit, delete, reactions, pins, search, threads
|   |   +-- servers.js             Server CRUD, kick/ban/timeout
|   |   +-- channels.js           Channel/category CRUD
|   |   +-- roles.js               Role CRUD, member role assignment
|   |   +-- dms.js                 DM create/list, group DMs, calls
|   |   +-- social.js              Friends, blocks, reports, invites
|   |   +-- voice.js               Voice/WebRTC, soundboard, screen sharing, moderation
|   |   +-- automod.js             AutoMod rule CRUD
|   |   +-- webhooks.js            Webhook management
|   |   +-- emoji.js               Custom emoji CRUD
|   |   +-- admin.js               Platform admin operations
|   |   +-- bookmarks.js           Saved messages
|   |   +-- audit.js               Audit log retrieval
|   +-- db.js                  # PostgreSQL queries (100+ functions)
|   +-- logger.js              # Winston structured logging with daily rotation
|   +-- metrics.js             # Connection, message, and API rate tracking
|   +-- config.js              # Environment configuration
|   +-- validation.js          # Input validation and sanitization
|   +-- default-sounds.js      # 16 procedurally generated WAV sounds
|   +-- migrations/            # Database schema (18 files)
|   +-- Dockerfile
|
+-- tests/                     # Automated + integration + manual tests
|   +-- automated/             # 12 unit test suites
|   +-- integration/           # 26 integration test specs
|   +-- e2e/                   # Playwright E2E tests
|   +-- performance/           # Stress and load testing
|   +-- manual/                # 8 categories of manual test cases
+-- docs/                      # Documentation
+-- docker-compose.yml         # Base service definitions
+-- docker-compose.prod.yml    # Production overrides
+-- docker-compose.dev.yml     # Development overrides
+-- docker-compose.coturn.yml  # Self-hosted STUN/TURN overlay
```

---

## Configuration

Copy `.env.example` to `.env` and configure:

| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_SECRET` | `change-this-secret` | Token signing key (change in production) |
| `CLIENT_URL` | `http://localhost:3000` | Frontend URL for CORS |
| `POSTGRES_PASSWORD` | `postgres` | Database password |
| `GIPHY_API_KEY` | _(optional)_ | Giphy API key for GIF picker |
| `PLATFORM_ADMIN` | _(optional)_ | Username for platform-level admin panel |
| `MAX_MESSAGE_LENGTH` | `2000` | Max characters per message |
| `MAX_ATTACHMENTS` | `4` | Max files per message |
| `MAX_ATTACHMENT_SIZE` | `10485760` | Max file size (10MB) |
| `SESSION_EXPIRY` | `604800000` | Token TTL (7 days) |
| `RATE_LIMIT_MESSAGES` | `10` | Messages per rate window |
| `RATE_LIMIT_WINDOW` | `10000` | Rate window (10 seconds) |
| `LOG_LEVEL` | `info` | Winston log level (error, warn, info, debug) |
| `STUN_URLS` | `stun:stun.l.google.com:19302,...` | STUN server URLs (comma-separated) |
| `TURN_URL` | _(empty)_ | TURN server URL for relay |
| `TURN_SECRET` | _(empty)_ | Shared secret for ephemeral TURN credentials |

---

## API

### Authentication

```bash
# Register
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username": "alice", "password": "password123"}'

# Login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "alice", "password": "password123"}'

# Account recovery (via recovery code)
curl -X POST http://localhost:3001/api/auth/recover \
  -H "Content-Type: application/json" \
  -d '{"username": "alice", "recoveryCode": "CODE", "newPassword": "newpass123"}'
```

### Uploads

```bash
# User avatar
curl -X POST http://localhost:3001/api/user/avatar \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"avatar": "data:image/png;base64,..."}'

# Server icon
curl -X POST http://localhost:3001/api/server/:serverId/icon \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"icon": "data:image/png;base64,..."}'
```

### Other Endpoints

| Route | Method | Description |
|-------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/metrics` | GET | Server metrics (admin-only) |
| `/api/gifs/search` | GET | Giphy search (auth required) |
| `/api/gifs/trending` | GET | Giphy trending (auth required) |
| `/api/og` | GET | URL preview with SSRF protection |
| `/api/webhooks/:id/:token` | POST | Webhook message posting |
| `/api/client-logs` | POST | Client-side log ingestion |

Global rate limit: 10 requests per 10 seconds on `/api`.

---

## Database

18 migration files manage the schema across 20+ tables:

| Table | Purpose |
|-------|---------|
| `accounts` | Users, credentials, profiles, E2E public keys |
| `tokens` | Authentication sessions |
| `servers` | Server definitions and ICE configuration |
| `server_members` | Membership records with JSONB roles |
| `categories` | Channel groupings |
| `channels` | Text and voice channels |
| `roles` | Role definitions with position and permissions |
| `messages` | Chat messages with JSONB reactions/attachments/mentions, encryption flag |
| `dm_channels` / `dm_participants` | Direct message channels |
| `dm_read_states` | Per-user read positions |
| `friendships` | Friend relationships |
| `webhooks` | Webhook configurations (with token auth) |
| `invites` | Server invite links |
| `custom_emojis` | Per-server custom emoji |
| `server_bans` / `server_timeouts` | Moderation records |
| `reports` | User reports |
| `pins` | Pinned messages per channel |
| `threads` | Message thread metadata |
| `bookmarks` | User-saved messages |
| `audit_logs` | Server action audit trail |
| `automod_rules` | AutoMod content filtering rules |

---

## Testing

Automated tests run with `npm test` from `server/` — no full server stack required.

- **Unit tests** — 12 suites covering validation, utils, permissions, config, security, automod, soundboard, search filters, platform admin, ownership transfer, coturn compose, and default sounds
- **Integration tests** — 26 specs covering auth, messaging, channels, servers, roles, invites, DMs, friends, moderation, typing, webhooks, security, blocking, emoji, reports, platform admin, pins, search, threads, bookmarks, audit logs, and voice/LAN/ICE
- **E2E tests** — Playwright browser tests
- **Performance tests** — stress and load testing suite
- **Manual tests** — 8 categories (auth, messaging, channels, emoji, voice, social, moderation, UI) in `tests/manual/`

---

## Security

- **End-to-end encryption** for DMs using X25519 + XSalsa20-Poly1305 (libsodium)
- Password hashing: bcrypt (12 rounds) with auto-migration from legacy hashes
- Minimum 8-character passwords enforced
- **Account recovery codes** generated at registration
- Token-based authentication with configurable expiration and logout revocation
- Rate limiting on messages, API routes, socket events, and webhook endpoints
- SSRF protection on URL preview endpoint (private IP blocking)
- Input validation and sanitization on all user input
- Helmet.js security headers (CSP, X-Frame-Options, HSTS)
- CORS restricted to configured client origin
- Markdown sanitized via rehype-sanitize

---

## LAN Mode

Nexus can run fully offline on a local network with no external dependencies.

- **Per-server toggle** in Server Settings → Channels (owner/admin only)
- **Disables** GIF picker, URL previews, and external STUN servers
- **Self-hosted fonts** — no Google Fonts dependency (fonts are bundled)
- **Voice on LAN** works out of the box on the same subnet; for cross-subnet voice, pair with self-hosted coturn

For full STUN/TURN configuration options, see [docs/STUN_TURN.md](docs/STUN_TURN.md).

```bash
# Start with self-hosted STUN/TURN for offline voice across subnets
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.coturn.yml up -d --build
```

---

## Cross-Platform

Build pipeline configured for:
- **Web** (primary) — Docker + Nginx
- **Android / iOS** — Capacitor (`capacitor.config.ts` present)
- **Windows / macOS / Linux** — Tauri (`src-tauri/` configured) and Electron (`electron/` configured)

See [docs/CROSS_PLATFORM_PLAN.md](docs/CROSS_PLATFORM_PLAN.md) for details.

---

## Documentation

- [FEATURES.md](docs/FEATURES.md) — Complete feature documentation with socket event reference
- [DOCKER_DEPLOYMENT.md](docs/deployment/DOCKER_DEPLOYMENT.md) — Docker deployment guide
- [DATA_PERSISTENCE.md](docs/DATA_PERSISTENCE.md) — Database and persistence details
- [PRODUCTION_HARDENING.md](docs/PRODUCTION_HARDENING.md) — Security hardening checklist
- [STUN_TURN.md](docs/STUN_TURN.md) — STUN/TURN and LAN mode configuration
- [THEMES.md](docs/THEMES.md) — Theme system documentation
- [CROSS_PLATFORM_PLAN.md](docs/CROSS_PLATFORM_PLAN.md) — Cross-platform build strategy
- [CHANGELOG.md](docs/CHANGELOG.md) — Version history
- [IMPLEMENTATION.md](docs/IMPLEMENTATION.md) — Implementation notes

---

## License

MIT License - see [LICENSE](LICENSE)

---

**Version**: 1.0.9 | **Last Updated**: March 2026

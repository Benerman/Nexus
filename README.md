# Nexus

A self-hosted, real-time communication platform built with React, Node.js, Socket.IO, and WebRTC. Supports servers, channels, voice chat, direct messaging, custom emoji, soundboard, and more.

[![Download](https://img.shields.io/badge/download-v1.0.5-blue)](https://github.com/Benerman/Nexus/releases/latest)
![Docker](https://img.shields.io/badge/docker-ready-blue)
![License](https://img.shields.io/badge/license-MIT-green)

> **[Download the latest release](https://github.com/Benerman/Nexus/releases/latest)** — available for Windows, macOS, Linux, Android, and iOS.

---

## Quick Start

```bash
# Clone and start all services
git clone https://github.com/Benerman/Nexus.git
cd Nexus
docker-compose up -d --build

# Access the app
open http://localhost:3000
```

This starts PostgreSQL, Redis, the Node.js backend, and the Nginx-served React frontend. The database schema is applied automatically on first run.

See [docs/deployment/DOCKER_DEPLOYMENT.md](docs/deployment/DOCKER_DEPLOYMENT.md) for production deployment details.

---

## Features

### Messaging
- Text channels with message editing, deletion, and replies
- Markdown rendering with sanitized HTML
- Image and GIF attachments (paste, drag-drop, or upload; up to 4 per message)
- GIF picker with Giphy integration
- Emoji reactions (8 quick-pick emoji per message)
- @user, @role, and @everyone mentions with highlighting
- URL previews with Open Graph metadata
- Message link embeds (cross-channel message previews)
- Typing indicators
- Infinite scroll with message history pagination
- Message grouping by author with date separators

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
- WebRTC peer-to-peer audio with STUN server support
- Screen sharing with dedicated video tiles
- Speaking detection with visual indicators
- Per-user volume controls and local mute
- Mute and deafen controls with state persistence
- Custom intro/exit sounds per user
- Soundboard with 16 built-in sounds and custom upload support

### Direct Messaging
- 1-on-1 and group DMs (3+ participants)
- Real-time DM creation with instant recipient notification
- Unread count badges and last message previews
- DM search and filtering
- Pinnable DM conversations to the server list
- DM voice/video calls with incoming call overlay

### Servers and Channels
- Multi-server support with custom names, icons, and descriptions
- Channels organized in collapsible categories
- Text and voice channel types
- Private channels with per-role permission overrides
- Server invite system with optional expiration and usage limits
- Channel reordering within and across categories

### Roles and Permissions
12 granular permissions with role hierarchy:

`viewChannel` `sendMessages` `attachFiles` `joinVoice` `readHistory` `addReactions` `mentionEveryone` `manageMessages` `manageChannels` `manageRoles` `manageServer` `admin`

Permissions resolve through role stacking with channel-level overrides.

### Moderation
- Kick, ban, and timeout users (admin only)
- Server bans persisted in database
- User reports with review/action/dismiss workflow
- Message deletion by author or admin

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
- Webhooks are persisted to the database and survive server restarts
- Messages display with BOT badge
- Built-in documentation with cURL, JavaScript, and Python examples
- Rate limited (10 requests per 10 seconds)

```bash
curl -X POST http://localhost:3001/api/webhooks/WEBHOOK_ID/TOKEN \
  -H "Content-Type: application/json" \
  -d '{"content": "Hello!", "username": "MyBot", "avatar": "robot"}'
```

> **Security:** The webhook URL contains a cryptographic token. Keep it secret — anyone with the full URL can post to your channel. The token is only shown once at creation time.

### Mobile
- Responsive layout with 768px breakpoint
- Swipe navigation (left for sidebar, right for member list)
- Touch-friendly context menus via long-press
- Horizontal server list on mobile

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

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Socket.IO Client, WebRTC |
| Backend | Express, Socket.IO, Node.js |
| Database | PostgreSQL 15 (JSONB), 10 migration files |
| Cache | Redis 7 (AOF persistence) |
| Proxy | Nginx with WebSocket upgrade support |
| Deployment | Docker Compose |

---

## Project Structure

```
nexus/
+-- client/                    # React frontend
|   +-- src/
|   |   +-- components/        # 26 UI components
|   |   |   +-- ChatArea.js        Messages, input, attachments
|   |   |   +-- VoiceArea.js       WebRTC tiles, controls, soundboard
|   |   |   +-- Sidebar.js         Channels (server) / DMs (personal)
|   |   |   +-- ServerList.js      Server icon rail
|   |   |   +-- MemberList.js      Online/offline member list
|   |   |   +-- SettingsModal.js   16-tab settings (profile, appearance,
|   |   |   |                      audio, notifications, friends, servers,
|   |   |   |                      server settings, channels, roles, members,
|   |   |   |                      webhooks, soundboard, emojis, moderation,
|   |   |   |                      platform admin, about)
|   |   |   +-- GifPicker.js       Giphy integration
|   |   |   +-- CommandMessage.js  Slash command output renderer
|   |   |   +-- PollCreator.js     Poll creation modal
|   |   |   +-- URLEmbed.js        URL preview cards
|   |   |   +-- UserProfileModal.js  User profile popup
|   |   |   +-- IncomingCallOverlay.js  DM call notifications
|   |   |   +-- icons/             SVG icon components
|   |   +-- hooks/
|   |   |   +-- useWebRTC.js       Voice, screen share, peer management
|   |   |   +-- useLongPress.js    Mobile long-press gesture
|   |   +-- App.js                 Root state management, socket handlers
|   |   +-- config.js              Server URL resolver (web/native)
|   +-- Dockerfile                 Multi-stage: Node build + Nginx serve
|   +-- nginx.conf                 Reverse proxy with WSS support
|
+-- server/                    # Node.js backend
|   +-- index.js               # Express + Socket.IO (103 socket events)
|   +-- db.js                  # PostgreSQL queries (100+ functions)
|   +-- config.js              # Environment configuration
|   +-- validation.js          # Input validation and sanitization
|   +-- default-sounds.js      # 16 procedurally generated WAV sounds
|   +-- migrations/            # Database schema (10 files)
|   +-- Dockerfile
|
+-- tests/                     # 299 automated tests + 40 manual test cases
+-- docs/                      # Documentation
+-- docker-compose.yml         # Production orchestration
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

---

## Database

10 migration files manage the schema across 18 tables:

| Table | Purpose |
|-------|---------|
| `accounts` | Users, credentials, profiles |
| `tokens` | Authentication sessions |
| `servers` | Server definitions |
| `server_members` | Membership records with JSONB roles |
| `categories` | Channel groupings |
| `channels` | Text and voice channels |
| `roles` | Role definitions with position and permissions |
| `messages` | Chat messages with JSONB reactions/attachments/mentions |
| `dm_channels` / `dm_participants` | Direct message channels |
| `dm_read_states` | Per-user read positions |
| `friendships` | Friend relationships |
| `webhooks` | Webhook configurations (with token auth) |
| `invites` | Server invite links |
| `custom_emojis` | Per-server custom emoji |
| `server_bans` / `server_timeouts` | Moderation records |
| `reports` | User reports |

---

## Testing

299 automated tests across 13 suites covering validation, utils, permissions, config, and security. Run with `npm test` from `server/`. Tests run standalone without the full server stack.

40 manual test cases across 8 categories (auth, messaging, channels, emoji, voice, social, moderation, UI) in `tests/manual/`.

---

## Security

- Password hashing: bcrypt (12 rounds) with auto-migration from legacy hashes
- Minimum 8-character passwords enforced
- Token-based authentication with configurable expiration and logout revocation
- Rate limiting on messages, API routes, socket events, and webhook endpoints
- SSRF protection on URL preview endpoint (private IP blocking)
- Input validation and sanitization on all user input
- Helmet.js security headers (CSP, X-Frame-Options, HSTS)
- CORS restricted to configured client origin
- Markdown sanitized via rehype-sanitize

---

## Cross-Platform (Planned)

Build pipeline configured for:
- **Web** (current) - Docker + Nginx
- **Android / iOS** - Capacitor (`capacitor.config.ts` present)
- **Windows / macOS / Linux** - Tauri (`src-tauri/` configured) and Electron (`electron/` configured)

See [docs/CROSS_PLATFORM_PLAN.md](docs/CROSS_PLATFORM_PLAN.md) for details.

---

## Documentation

- [FEATURES.md](docs/FEATURES.md) - Complete feature documentation with socket event reference
- [DOCKER_DEPLOYMENT.md](docs/deployment/DOCKER_DEPLOYMENT.md) - Docker deployment guide
- [DATA_PERSISTENCE.md](docs/DATA_PERSISTENCE.md) - Database and persistence details
- [PRODUCTION_HARDENING.md](docs/PRODUCTION_HARDENING.md) - Security hardening checklist
- [CHANGELOG.md](docs/CHANGELOG.md) - Version history
- [IMPLEMENTATION.md](docs/IMPLEMENTATION.md) - Implementation notes

---

## License

MIT License - see [LICENSE](LICENSE)

---

**Version**: 1.0.1 | **Last Updated**: February 2026

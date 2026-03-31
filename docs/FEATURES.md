# Nexus — Complete Feature Documentation

**Version**: 1.0.12 | **Last Updated**: March 2026

---

## Table of Contents

1. [Project Overview & Tech Stack](#1-project-overview--tech-stack)
2. [Infrastructure & Deployment](#2-infrastructure--deployment)
3. [Authentication System](#3-authentication-system)
4. [Messaging System](#4-messaging-system)
5. [Threads](#5-threads)
6. [Message Search](#6-message-search)
7. [Pins & Bookmarks](#7-pins--bookmarks)
8. [Voice & Audio System](#8-voice--audio-system)
9. [Screen Sharing](#9-screen-sharing)
10. [Direct Messaging & Calls](#10-direct-messaging--calls)
11. [End-to-End Encryption](#11-end-to-end-encryption)
12. [Server Management](#12-server-management)
13. [Categories & Channels](#13-categories--channels)
14. [Roles & Permissions](#14-roles--permissions)
15. [Moderation](#15-moderation)
16. [AutoMod](#16-automod)
17. [Friend & Social System](#17-friend--social-system)
18. [Custom Emoji & Soundboard](#18-custom-emoji--soundboard)
19. [Webhooks](#19-webhooks)
20. [MCP Bot Framework](#20-mcp-bot-framework)
21. [Themes & Appearance](#21-themes--appearance)
22. [LAN Mode](#22-lan-mode)
23. [User Profiles & Settings](#23-user-profiles--settings)
24. [Platform Admin](#24-platform-admin)
25. [Slash Commands](#25-slash-commands)
26. [Audit Log](#26-audit-log)
27. [Metrics & Observability](#27-metrics--observability)
28. [Security](#28-security)
29. [Cross-Platform Support](#29-cross-platform-support)
30. [Socket.IO Events Reference](#30-socketio-events-reference)
31. [REST API Endpoints](#31-rest-api-endpoints)
32. [Database Schema](#32-database-schema)
33. [Performance Optimizations](#33-performance-optimizations)
34. [File Structure](#34-file-structure)
35. [Feature Status Summary](#35-feature-status-summary)

---

## 1. Project Overview & Tech Stack

Nexus is a self-hosted, real-time communication platform with text channels, voice/video, direct messaging, and a bot framework. It targets full feature parity with Discord for small-to-medium communities.

### Technology Stack

| Layer | Technology | Details |
|-------|-----------|---------|
| Frontend | React 18 | Socket.IO client, WebRTC, NaCl/libsodium |
| Backend | Node.js + Express | Socket.IO server, 15 handler modules |
| Real-time | Socket.IO | 151 registered socket events |
| Voice/Video | WebRTC (native) | STUN/TURN, multi-sharer screen share |
| Database | PostgreSQL 15 | JSONB columns, 24 tables, 19 migrations |
| Cache | Redis 7 | AOF persistence, hot-channel message cache |
| Proxy | Nginx | WebSocket upgrade, SPA routing, gzip |
| Logging | Winston | Structured JSON, daily rotation, audit trail |
| Audio | Web Audio API + RNNoise WASM | Noise gate, AGC, ML noise cancellation |
| Encryption | NaCl/libsodium | X25519 key exchange, XSalsa20-Poly1305 |
| Deployment | Docker Compose | Multi-container, production + dev overrides |

---

## 2. Infrastructure & Deployment

### 2.1 Container Architecture

```
Browser (Port 3000) → Nginx → Express + Socket.IO (Port 3001) → PostgreSQL + Redis
```

| Container | Port | Purpose |
|-----------|------|---------|
| `nexus-postgres` | 5432 | Primary database |
| `nexus-redis` | 6379 | Session cache, hot-channel message cache |
| `nexus-server` | 3001 | Backend API + Socket.IO + WebRTC signaling |
| `nexus-client` | 3000 | Nginx serving the React SPA |

### 2.2 Docker Compose Profiles

- **Production**: `docker compose -p nexus-prod -f docker-compose.yml -f docker-compose.prod.yml up -d --build`
- **Development**: `docker compose -p nexus-dev --env-file .env.dev -f docker-compose.yml -f docker-compose.dev.yml up -d --build`
- **Self-hosted STUN/TURN**: add `-f docker-compose.coturn.yml` overlay for bundled coturn

### 2.3 Database Migrations

19 sequential SQL files applied idempotently on container startup via `docker-entrypoint.sh`. Each migration uses `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` patterns to be safe for re-runs.

### 2.4 Environment Variables

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `JWT_SECRET` | — | Yes | Token signing key |
| `DATABASE_URL` | — | Yes | PostgreSQL connection string |
| `POSTGRES_PASSWORD` | `postgres` | Yes | DB password |
| `CLIENT_URL` | `http://localhost:3000` | No | Frontend URL for CORS |
| `GIPHY_API_KEY` | — | No | Enables GIF picker |
| `PLATFORM_ADMIN` | — | No | Username for platform admin panel |
| `MAX_MESSAGE_LENGTH` | `2000` | No | Max chars per message |
| `MAX_ATTACHMENTS` | `4` | No | Max files per message |
| `MAX_ATTACHMENT_SIZE` | `10485760` | No | Max file size (10 MB) |
| `SESSION_EXPIRY` | `604800000` | No | Token TTL (7 days) |
| `RATE_LIMIT_MESSAGES` | `10` | No | Messages per rate window |
| `RATE_LIMIT_WINDOW` | `10000` | No | Rate window in ms |
| `STUN_URLS` | Google STUN | No | Comma-separated STUN server URLs |
| `TURN_URL` | — | No | TURN server URL |
| `TURN_SECRET` | — | No | Shared secret for ephemeral TURN credentials |

### 2.5 CI/CD Pipelines

| Workflow | Trigger | Action |
|----------|---------|--------|
| `deploy-prod.yml` | Push to `main` | Deploy to production (ports 3000/3001) |
| `deploy-dev.yml` | Push to `develop` | Deploy to dev stack (ports 3002/3003) |
| `unit-tests.yml` | PR / push | npm audit + Jest (90% coverage threshold) |
| `dev.yml` | Manual | Pre-release builds (Tauri, Electron, Capacitor) |
| `release.yml` | Manual | Versioned release from `client/package.json` |

---

## 3. Authentication System

### 3.1 Registration & Login

- **Endpoint**: `POST /api/auth/register` and `POST /api/auth/login`
- Username: 3–32 characters, alphanumeric plus `_` and `-`
- Password: minimum 8 characters
- Password hashing: bcrypt (12 rounds) with auto-migration from legacy HMAC-SHA256 hashes
- Auto-assigned on creation: random emoji avatar, random display color
- Token-based sessions stored in browser `localStorage`
- Logout clears localStorage and revokes token in database

### 3.2 Session Management

- JWT tokens with configurable TTL (default 7 days)
- Token stored in `localStorage` as `nexus_token`
- Auto-restored on page reload via `join` socket event
- Session restore recovers voice channel state, DMs, and UI position
- Offline resilience: smart reconnection with error boundary

### 3.3 Account Recovery

- Recovery codes generated at registration (stored as bcrypt hashes)
- Passphrase-protected E2E key backup uses separate mechanism (see §11)

---

## 4. Messaging System

### 4.1 Core Message Operations

| Operation | Socket Event | Permission |
|-----------|-------------|-----------|
| Send message | `message:send` | `sendMessages` |
| Edit message | `message:edit` | Author only |
| Delete message | `message:delete` | Author or `manageMessages` |
| React | `message:react` | `addReactions` |
| Pin message | `message:pin` | `manageMessages` |
| Unpin | `message:unpin` | `manageMessages` |
| Save/bookmark | `message:save` | Any member |
| Unsave | `message:unsave` | Any member |

### 4.2 Message Features

- **Length limit**: 2000 characters (configurable)
- **Editing**: sets `editedAt` timestamp, shows "(edited)" label
- **Grouping**: consecutive messages from the same author within 5 minutes are visually grouped (reduced padding, no repeated avatar)
- **Date separators**: "Today", "Yesterday", or formatted date between groups
- **NEW divider**: red "NEW" line marks the first unread message when switching to a channel with unread messages
- **Mentions**: `@username`, `@rolename`, and `@everyone` with client-side highlighting
- **Typing indicators**: `typing:start` / `typing:stop` events, cleared on send or 1500 ms inactivity
- **Infinite scroll**: 50 messages per page, `messages:fetch-older` loads previous history
- **URL previews**: Open Graph metadata fetched server-side with SSRF protection
- **Message link embeds**: paste a message link to get a cross-channel message preview card
- **Markdown rendering**: react-markdown with rehype-sanitize (no raw HTML)
- **Image/GIF attachments**: paste, drag-drop, or upload; up to 4 per message, 10 MB limit
- **GIF picker**: Giphy integration (requires `GIPHY_API_KEY`)
- **Thumbnail embeds**: image and video URL thumbnails
- **8 quick-pick emoji reactions**: like, heart, laugh, wow, sad, fire, party, 100

### 4.3 Redis Message Cache

Hot-channel messages are cached in Redis (`channel:{id}:messages`) as a sorted set keyed by timestamp. The cache is populated on first load and invalidated on send/edit/delete. This offloads PostgreSQL on high-traffic channels while keeping the database the authoritative source.

---

## 5. Threads

Threads allow focused side-conversations branching off a parent message without cluttering the main channel.

- **Create**: right-click a message → "Reply in thread" → opens thread panel
- **Thread panel**: slides in from the right, shows parent message and all replies
- **Reply count**: parent message shows reply count badge (e.g., "3 replies")
- **Thread names**: optional title stored in `thread_names` table
- **Mobile**: full-width thread panel with back navigation
- **Events**: `thread:create`, `thread:reply`, `thread:get`, `thread:list`

---

## 6. Message Search

Full-text search across all channels a user can access, with Gmail-style operators.

### 6.1 Search Operators

| Operator | Example | Description |
|----------|---------|-------------|
| `from:` | `from:alice` | Messages from a specific user |
| `in:` | `in:general` | Messages in a specific channel |
| `has:` | `has:link`, `has:image`, `has:attachment` | Filter by attachment type |
| `before:` | `before:2025-06-01` | Messages before a date |
| `after:` | `after:2025-01-01` | Messages after a date |
| `is:` | `is:pinned` | Pinned messages only |

Operators can be combined with free text: `hello world from:alice in:general has:link`

### 6.2 Search Implementation

- Socket event: `messages:search`
- PostgreSQL full-text search with `to_tsvector` / `to_tsquery`
- Results respect channel-level view permissions
- Returns message with author, channel, and surrounding context

---

## 7. Pins & Bookmarks

### 7.1 Pinned Messages

- Pin/unpin via message context menu (requires `manageMessages` permission)
- Pinned messages panel accessible from channel header
- Maximum 50 pinned messages per channel
- Socket events: `message:pin`, `message:unpin`, `messages:get-pinned`

### 7.2 Bookmarks (Saved Messages)

- Any member can save/unsave messages via context menu
- Saved messages accessible from DM sidebar "Saved Messages" section
- Socket events: `message:save`, `message:unsave`, `bookmarks:list`, `bookmarks:get-ids`
- Bookmarks are per-user and cross-server

---

## 8. Voice & Audio System

### 8.1 WebRTC Architecture

- Peer-to-peer audio with STUN/TURN support
- ICE server configuration per-server via `server:get-ice-config`
- Signaling via Socket.IO: `webrtc:offer`, `webrtc:answer`, `webrtc:ice`
- AudioContext: 48 kHz sample rate

### 8.2 Voice Controls

| Control | Behavior |
|---------|---------|
| Mute | Silences local mic; others can still hear each other |
| Deafen | Silences mic AND speaker; restores previous mute state on undeafen |
| Push-to-Talk | Hold configured key to transmit; configurable keybind (desktop and mobile) |
| Per-user volume | Local volume slider per voice participant |
| Server mute/deafen | Moderator-applied, overrides user controls |

State (mute, deafen, PTT keybind) persists across reloads in `localStorage`.

### 8.3 Audio Processing Pipeline

The pipeline runs in an `AudioWorkletProcessor` (`audio-processor.js`) in a dedicated thread:

1. **Noise Gate** — attack/release envelope with configurable threshold; suppresses silence between words
2. **RNNoise ML Noise Cancellation** — WASM-compiled RNNoise model; aggressiveness levels: Off / Low / Medium / High
3. **AGC (Automatic Gain Control)** — dual-stage leveler + limiter; tracks noise floor; only active when gate is `open` (prevents pumping)
4. **Dynamics Compressor** — soft knee compressor for peak limiting
5. **Sidechain filtering** — separates voice from background noise for more accurate gate decisions

### 8.4 Voice Channel Features

- **Speaking detection**: AnalyserNode FFT, 100 ms updates, threshold > 15 marks user as speaking; green border on tile
- **Join/leave cues**: rising/falling two-tone beep via Web Audio API oscillators
- **Voice persistence**: auto-rejoin on page reload; recovers channel state from `localStorage`
- **User presence**: voice channel members shown in sidebar with real-time join/leave

### 8.5 STUN/TURN Configuration

- Default: Google public STUN servers
- Custom STUN/TURN via environment variables `STUN_URLS`, `TURN_URL`, `TURN_SECRET`
- Per-server ICE config override in Server Settings → Advanced
- Bundled coturn option: `docker compose -f docker-compose.yml -f docker-compose.coturn.yml up`
- See `docs/STUN_TURN.md` for full configuration guide

---

## 9. Screen Sharing

- Uses `navigator.mediaDevices.getDisplayMedia()`
- **Multi-sharer**: multiple users can share simultaneously; each gets its own tile
- **Thumbnail previews**: compact thumbnail tiles for inactive sharers
- **Watch/unwatch**: `screen:watch` / `screen:unwatch` to subscribe to a specific sharer's stream
- **Full-screen view**: click any share tile to expand
- Socket events: `screen:start`, `screen:stop`, `screen:watch`, `screen:unwatch`, `screen:thumbnail`

---

## 10. Direct Messaging & Calls

### 10.1 DM Channels

- 1-on-1 and group DMs (3+ participants)
- Group DM: add/remove participants via `group-dm:add-participant` / `group-dm:remove-participant`
- Unread count badges and last message preview in DM list
- DM search and filtering
- Pin DM conversations to the server list for quick access
- Mark-read tracking via `dm:mark-read`

### 10.2 Message Requests

Non-friend users cannot DM directly; their first message lands in Message Requests.

- `dm:message-requests` — list pending requests
- `dm:message-request:accept` — accept and open DM
- `dm:message-request:reject` — decline (message discarded)
- `dm:message-request:block` — decline and block sender

### 10.3 DM Calls

- Initiate voice/video call in any 1:1 DM
- Incoming call overlay with accept/decline buttons
- Events: `dm:call-start`, `dm:call-decline`
- Peer connections managed by the same WebRTC stack as voice channels

---

## 11. End-to-End Encryption

1:1 DMs can be encrypted end-to-end. The server never sees plaintext content.

### 11.1 Key Exchange

- Algorithm: X25519 (Curve25519 Diffie-Hellman)
- Implementation: `libsodium-wrappers` (NaCl)
- Each user generates a keypair on first use; public key stored in `accounts` table
- Private key never leaves the client
- Socket events: `encryption:set-public-key`, `encryption:get-public-key`

### 11.2 Message Encryption

- Encryption: XSalsa20-Poly1305 (NaCl `secretbox`)
- Shared secret derived from X25519 key exchange
- Encrypted payload stored in `messages.content` as base64-encoded ciphertext

### 11.3 Key Backup & Recovery

- Export: passphrase-based AES-GCM encryption of the private key
- Import: decrypt backup with passphrase on a new device
- Device verification: compare key fingerprints (first 8 hex chars of the public key) out-of-band

---

## 12. Server Management

### 12.1 Server Operations

| Operation | Socket Event | Permission |
|-----------|-------------|-----------|
| Create server | `server:create` | Any user |
| Update (name, icon, description) | `server:update` | `manageServer` |
| Delete server | `server:delete` | Owner |
| Leave server | `server:leave` | Member |
| Transfer ownership | `server:transfer-ownership` | Owner |
| Join via invite | `invite:use` | Public |
| Join default server | `server:join-default` | Any user |

### 12.2 Invite Links

- Create: `invite:create` with optional `maxUses` and `expiresAt`
- Revoke: `invite:revoke` (requires `createInvite` permission)
- Peek: `invite:peek` — preview server info before joining
- List: `invite:list`

---

## 13. Categories & Channels

### 13.1 Categories

- Channels are organized in collapsible categories
- `category:create`, `category:update`, `category:delete`, `category:reorder`
- Drag-and-drop reordering within and across categories via `channel:reorder`

### 13.2 Channel Types

| Type | Description |
|------|-------------|
| Text (`text`) | Standard message channel |
| Voice (`voice`) | WebRTC audio/video channel |

### 13.3 Channel Properties

- Name, topic/description, position
- `isPrivate`: restricts visibility to roles with explicit `viewChannel` override
- Per-role permission overrides (JSONB column)
- Channel create/update/delete: `channel:create`, `channel:update`, `channel:delete`

---

## 14. Roles & Permissions

### 14.1 Permission System

Permissions resolve through a three-layer hierarchy:

1. **@everyone defaults** — base permissions for all server members
2. **Role stacking** — each role grants additional permissions; highest position wins on conflicts
3. **Channel-level overrides** — per-role allow/deny overrides per channel

Server owners bypass all permission checks.

### 14.2 Permission List (18 permissions)

| Permission | Description |
|-----------|-------------|
| `viewChannel` | See and read a channel |
| `sendMessages` | Post messages |
| `attachFiles` | Upload images and files |
| `joinVoice` | Connect to voice channels |
| `readHistory` | Access message history |
| `addReactions` | Add emoji reactions |
| `mentionEveryone` | Use `@everyone` and `@here` |
| `manageMessages` | Delete/pin others' messages |
| `manageChannels` | Create, edit, delete channels |
| `manageRoles` | Create and assign roles |
| `manageServer` | Edit server settings |
| `manageEmojis` | Upload/delete custom emoji |
| `createInvite` | Create invite links |
| `sendTargetedSounds` | Play soundboard to specific users |
| `kickMembers` | Kick members from server |
| `banMembers` | Ban/unban members |
| `muteMembers` / `deafenMembers` / `moveMembers` | Voice moderation |
| `moderateMembers` | Apply timeouts |
| `admin` | All permissions (bypass checks) |

### 14.3 Role Operations

- `role:create`, `role:update`, `role:delete`
- `member:role` — assign or remove a role from a member
- Roles have `name`, `color`, `position`, and `permissions` (JSONB)

---

## 15. Moderation

### 15.1 Member Moderation

| Action | Socket Event | Permission |
|--------|-------------|-----------|
| Kick | `server:kick-user` | `kickMembers` |
| Ban | `server:ban-user` | `banMembers` |
| Unban | `server:unban-user` | `banMembers` |
| Timeout | `server:timeout-user` | `moderateMembers` |
| Remove timeout | `server:remove-timeout` | `moderateMembers` |

**Timeout durations**: 60 s, 5 min, 10 min, 1 h, 1 day, 1 week

### 15.2 Voice Moderation

| Action | Socket Event | Permission |
|--------|-------------|-----------|
| Server mute | `voice:force-mute` | `muteMembers` |
| Server deafen | `voice:force-deafen` | `deafenMembers` |
| Move to channel | `voice:move` | `moveMembers` |
| Kick from voice | `voice:kick` | `kickMembers` |

### 15.3 Context Menu Moderation

Right-click a user in the member list, voice tiles, or on a chat message to access:
- Kick, ban, timeout
- Voice mute, deafen, move, kick
- View profile, send DM, copy user ID

### 15.4 User Reports

- `report:user` — submit a report with reason and evidence
- `moderation:get-reports` — list pending/reviewed reports (admin)
- `moderation:update-report` — mark as reviewed, take action, or dismiss

---

## 16. AutoMod

Automatic moderation rules that run before messages are delivered.

### 16.1 Rule Types

| Rule Type | Description |
|-----------|-------------|
| `keyword` | Block messages containing specific words or phrases |
| `spam` | Detect and throttle duplicate message bursts |
| `invite_link` | Block server invite link patterns |

### 16.2 Rule Actions

| Action | Effect |
|--------|--------|
| `block` | Silently delete the message (not sent) |
| `warn` | Delete message and send a warning DM |
| `timeout` | Delete + apply a temporary timeout |
| `ban` | Delete + ban the user |

### 16.3 Rule Configuration

- `exempt_roles`: array of role IDs that bypass the rule
- `exempt_channels`: array of channel IDs excluded from the rule
- `timeout_duration`: seconds (for `timeout` action)
- Rules are per-server and loaded at startup

### 16.4 Socket Events

`automod:create-rule`, `automod:update-rule`, `automod:delete-rule`, `automod:get-rules`, `automod:test-rule`

Requires `manageServer` permission.

---

## 17. Friend & Social System

### 17.1 Friend Requests

- `friend:request` — send a request to a user
- `friend:accept` / `friend:reject` — respond to incoming requests
- `friend:remove` — unfriend
- `friend:list` — all friends, pending, and blocked

### 17.2 Blocking

- `block:user` — block; blocks DM creation and hides from presence
- `unblock:user` — unblock
- `blocked:list` — list blocked users

### 17.3 User Search

- `user:search` — find users by username for DMs and friend requests

---

## 18. Custom Emoji & Soundboard

### 18.1 Custom Emoji

- Upload per-server emoji (up to 50)
- Name validation: 2–32 alphanumeric characters
- `emoji:upload`, `emoji:get`, `emoji:update`, `emoji:delete`
- Emoji images stored as base64, served via `emoji:get-image`
- Available in the message composer emoji picker across the server

### 18.2 Soundboard

- 16 built-in sounds (procedurally generated WAV, `default-sounds.js`)
- Custom sound upload per server
- `soundboard:play` — play to everyone in the voice channel
- `soundboard:play-targeted` — play to a specific user (requires `sendTargetedSounds` permission)
- Per-user custom intro/exit sounds: `user:update-sounds`, `user:get-sounds`
- Events: `soundboard:get-sounds`, `soundboard:get-sound`, `soundboard:update`, `soundboard:delete`

---

## 19. Webhooks

### 19.1 Overview

Each webhook gets a unique token-authenticated URL. Anyone with the full URL can POST messages to the channel.

```bash
curl -X POST http://localhost:3001/api/webhooks/WEBHOOK_ID/TOKEN \
  -H "Content-Type: application/json" \
  -d '{"content": "Hello!", "username": "MyBot", "avatar": "robot"}'
```

### 19.2 Payload Format

```json
{
  "content": "Message text (required)",
  "username": "Display name (optional, max 80 chars)",
  "avatar": "Avatar string (optional)"
}
```

### 19.3 Features

- Token is a 64-char cryptographic hex string, shown only once at creation
- Messages display with a `BOT` badge
- Rate limited: 10 requests per 10 seconds
- Stored in the `webhooks` table; survive server restarts
- `webhook:create`, `webhook:delete`

### 19.4 Embed Support

POST a `url` field alongside `content` to render a link embed card (image, title, description from Open Graph metadata).

---

## 20. MCP Bot Framework

Nexus includes a full bot framework based on the Model Context Protocol (MCP), enabling AI agents to participate in channels.

### 20.1 Bot Accounts

Each bot is a first-class account with `is_bot = true`, an owner, and a description.

- `mcp:bot:create` — create a bot account within a server (requires `manageServer`)
- `mcp:bot:list` — list bots in a server
- `mcp:bot:delete` — delete bot account

### 20.2 Bot Tokens

Bot tokens authenticate external clients to the Nexus API.

- `mcp:token:create` — create a token with scopes (`read`, `write`) and optional server/expiry restrictions
- `mcp:token:list` — list your tokens
- `mcp:token:delete` — revoke a token

Tokens are stored as SHA-256 hashes in `bot_tokens` table (plaintext shown only once).

### 20.3 MCP Connections

An MCP connection points Nexus at an external MCP-compliant server that exposes tools.

- `mcp:connection:create` — register an MCP server URL (SSE or HTTP transport)
- `mcp:connection:list` / `mcp:connection:delete` / `mcp:connection:toggle`
- `auth_config` stored encrypted in the database
- `enabled_tools` JSONB array restricts which tools the agent can call

### 20.4 Agent Configurations

An agent config ties a bot account to an MCP connection with trigger rules and a system prompt.

| Field | Description |
|-------|-------------|
| `bot_account_id` | The bot that will post responses |
| `system_prompt` | Instructions prepended to every LLM call |
| `trigger_mode` | `mention` (responds when @-mentioned), `keyword` (any matching keyword), `all` (every message) |
| `trigger_channels` | Restrict to specific channels |
| `trigger_keywords` | Keywords for `keyword` mode |
| `mcp_connection_id` | The MCP server providing tools |
| `max_response_length` | Cap on response characters |

Events: `mcp:agent:create`, `mcp:agent:list`, `mcp:agent:update`, `mcp:agent:delete`

### 20.5 Streaming Responses

Agents stream responses token-by-token via:

- `mcp:stream:start` — begin a streaming message
- `mcp:stream:chunk` — append content chunk
- `mcp:stream:end` — finalize and persist message

### 20.6 Agent Activity Log

All agent invocations are logged to `agent_activity_log`:
- Action performed, input/output summaries
- Tool calls made (JSONB), tokens used, duration
- Errors recorded for debugging

---

## 21. Themes & Appearance

### 21.1 Built-in Themes (11)

| Theme | Aesthetic |
|-------|----------|
| Dark (default) | Discord-style dark slate |
| Retro | 3D borders, chunky UI |
| Terminal | Monospace, green-on-black |
| Light | Clean white background |
| Neon | Neon glow effects |
| Blue | Corporate blue |
| Cherry | Pink/rose palette |
| Amber | Warm amber tones |
| Synthwave | Purple/pink gradient |
| Vaporwave | Pastel retrowave |
| Forest | Earthy greens |
| Cyberpunk | High-contrast yellow/black |

All themes pass WCAG AA contrast compliance checks.

### 21.2 Custom Theme Editor

- Color pickers for all semantic CSS variables
- Live preview while editing
- Themes saved to `localStorage`
- Exportable as JSON for sharing

### 21.3 CSS Custom Properties

```css
--bg-primary         /* Main content background */
--bg-secondary       /* Sidebar background */
--bg-tertiary        /* Inputs and nested elements */
--bg-floating        /* Floating menus and modals */
--text-primary       /* Primary text */
--text-normal        /* Normal text */
--text-muted         /* Dimmed/secondary text */
--header-primary     /* Header text */
--red                /* Errors, danger */
--green              /* Success, online */
--blue               /* Primary brand */
--yellow             /* Warnings */
--brand-500          /* Primary action buttons */
--font-primary       /* UI font family */
```

---

## 22. LAN Mode

Nexus can run fully offline on a local network with no external dependencies.

- **Toggle**: per-server setting in Server Settings → Channels (owner/admin only)
- **Stored**: `lan_mode` boolean column in `servers` table (migration 016)
- **Effects when enabled**:
  - GIF picker disabled (no Giphy calls)
  - URL preview disabled (no external fetches)
  - External STUN servers disabled
- **Self-hosted fonts**: bundled locally; no Google Fonts
- **Service worker**: caches the React app shell for offline availability
- **Voice on LAN**: works on the same subnet without any STUN/TURN; cross-subnet voice requires coturn

See `docs/STUN_TURN.md` for detailed LAN + coturn setup.

---

## 23. User Profiles & Settings

### 23.1 Profile Fields

- Username, display name
- Custom avatar (base64 PNG/JPG/GIF)
- Bio / about me text
- Display color (hex)
- Status: `online`, `idle`, `dnd` (Do Not Disturb), `invisible`

### 23.2 Settings Tabs (16 tabs in SettingsModal)

| Tab | Contents |
|-----|---------|
| Profile | Avatar, bio, display color |
| Appearance | Theme selector, custom theme editor |
| Audio | Input/output device, noise cancellation level, PTT keybind, mic test meter |
| Notifications | Channel-level notification preferences |
| Friends | Friend list, pending requests |
| Servers | Joined servers list |
| Server Settings | Name, icon, description, LAN mode, ICE config |
| Channels | Create/edit/delete channels and categories |
| Roles | Create/edit/delete roles, set permissions |
| Members | View members, assign roles |
| Webhooks | Create/delete webhooks, documentation |
| Soundboard | Upload/manage server sounds |
| Emoji | Upload/manage custom emoji |
| Moderation | AutoMod rules, reports, bans, timeouts |
| Platform Admin | (Admin only) User/server management |
| About | Version, licenses |

---

## 24. Platform Admin

Accessible only to the user set in the `PLATFORM_ADMIN` environment variable.

| Operation | Socket Event |
|-----------|-------------|
| List all users | `admin:get-users` |
| List all servers | `admin:get-servers` |
| Delete a server | `admin:delete-server` |
| Delete a user | `admin:delete-user` |
| Reset password | `admin:reset-password` |
| Orphaned stats | `admin:get-orphaned-stats` |
| Assign ownerless servers | `admin:assign-ownerless-servers` |
| Clean up empty DMs | `admin:cleanup-empty-dms` |

The Platform Admin tab is hidden in the Settings UI for non-admin users.

---

## 25. Slash Commands

Available in any text channel by typing `/`.

| Command | Description |
|---------|-------------|
| `/roll [NdN]` | Dice roll (default d6, supports up to d1000) |
| `/coinflip` | Heads or tails |
| `/8ball [question]` | Magic 8-Ball |
| `/choose [opt1\|opt2\|...]` | Random choice from pipe-separated options |
| `/rps [rock\|paper\|scissors]` | Rock Paper Scissors vs bot |
| `/poll` | Opens poll creation modal |
| `/serverinfo` | Posts server stats (members, channels, created date) |
| `/remindme [duration] [message]` | Set a reminder (max 1 week) |
| `/criticize [@user]` | Daily roast of a user |
| `/quack` | Random duck image |

Commands render via the `CommandMessage` component.

### Poll Features

- Create a poll with `/poll` (opens modal with up to 10 options)
- `poll:vote` socket event for vote casting
- Real-time vote count updates broadcast to channel

---

## 26. Audit Log

All moderation actions are recorded in the `audit_log` table.

- Logged events: kick, ban, unban, timeout, message delete, channel create/delete, role changes
- `audit:get-logs` — fetch paginated audit log (requires `manageServer`)
- Log entries include: action type, actor ID, target ID, reason, timestamp

---

## 27. Metrics & Observability

### 27.1 Metrics Endpoint

`GET /api/metrics` — admin-only, returns:
- Active WebSocket connections
- Message rate (per second, rolling window)
- API request rate
- Error counts by category
- System stats (memory, uptime)

### 27.2 Structured Logging (Winston)

- JSON-formatted logs with domain prefixes
- Log levels: `error`, `warn`, `info`, `verbose`, `debug`
- Daily rotation via `winston-daily-rotate-file`
- Log files in `server/data/logs/`
- Separate audit log stream for moderation events
- Request context included in log lines (user ID, socket ID, server ID)

---

## 28. Security

### 28.1 Authentication & Authorization

- bcrypt password hashing (12 rounds) with automatic migration from legacy hashes
- JWT sessions with configurable expiry; revoked on logout (token deleted from DB)
- Every socket event validates the session token before processing
- Server-side permission checks mirror client-side UI gating

### 28.2 Input Validation

- All user input validated in `validation.js` before reaching the database
- Username, server name, channel name, message content — each has length/character constraints
- Markdown rendered through `rehype-sanitize` (no raw HTML)

### 28.3 Network Security

- CORS restricted to `CLIENT_URL` origin
- Helmet.js: CSP, `X-Frame-Options`, HSTS, and other headers
- Rate limiting: 10 requests/10 s on `/api/*`, per-user message rate limiting via Socket.IO
- Webhook endpoint rate limited separately: 10 requests/10 s per webhook
- SSRF protection on `/api/og` URL preview (blocks private/loopback IP ranges)

### 28.4 End-to-End Encryption

See §11 for details. The server stores only ciphertext for E2E-encrypted DMs.

### 28.5 Additional

- CSP allows WASM compilation for libsodium and RNNoise
- Service worker uses cache-first strategy (no network requests for app shell)
- Error boundary prevents full-app crash on uncaught component errors

---

## 29. Cross-Platform Support

| Platform | Method | Notes |
|----------|--------|-------|
| Web | Docker + Nginx | Primary target |
| Windows / macOS / Linux | Tauri 2 | Auto-update, tray icon, native menus, global PTT shortcut |
| Android | Capacitor | APK from CI releases |
| iOS | Capacitor | Requires code-signing setup |
| Desktop (fallback) | Electron | Secondary desktop option |

Download pre-built binaries from the releases page.

See `docs/CROSS_PLATFORM_PLAN.md` for build details.

---

## 30. Socket.IO Events Reference

### Client → Server

#### Auth & User
| Event | Payload | Description |
|-------|---------|-------------|
| `join` | `{ token, username }` | Authenticate and register socket |
| `user:update` | `{ avatar, bio, color, status }` | Update profile fields |
| `user:settings-update` | `{ settings }` | Save user preferences |
| `user:change-password` | `{ currentPassword, newPassword }` | Change password |
| `user:search` | `{ query }` | Find users by username |
| `user:update-sounds` | `{ joinSoundId, leaveSoundId }` | Set intro/exit voice sounds |
| `data:refresh` | — | Force-refresh all server data |

#### Messaging
| Event | Payload | Description |
|-------|---------|-------------|
| `message:send` | `{ channelId, content, attachments, replyTo }` | Send a message |
| `message:edit` | `{ messageId, content }` | Edit own message |
| `message:delete` | `{ messageId }` | Delete message |
| `message:react` | `{ messageId, emoji }` | Toggle reaction |
| `message:pin` | `{ messageId, channelId }` | Pin message |
| `message:unpin` | `{ messageId, channelId }` | Unpin message |
| `message:save` | `{ messageId }` | Bookmark message |
| `message:unsave` | `{ messageId }` | Remove bookmark |
| `message:get-preview` | `{ messageId }` | Fetch message embed preview |
| `messages:fetch-older` | `{ channelId, before }` | Paginate history |
| `messages:get-pinned` | `{ channelId }` | Fetch pinned messages |
| `messages:search` | `{ query, serverId, ... }` | Full-text search |
| `typing:start` | `{ channelId }` | Start typing indicator |
| `typing:stop` | `{ channelId }` | Stop typing indicator |
| `poll:vote` | `{ messageId, optionIndex }` | Cast poll vote |

#### Threads
| Event | Payload | Description |
|-------|---------|-------------|
| `thread:create` | `{ messageId }` | Start a thread on a message |
| `thread:reply` | `{ threadId, content, attachments }` | Reply in thread |
| `thread:get` | `{ threadId }` | Fetch thread and replies |
| `thread:list` | `{ channelId }` | List threads in channel |

#### Channels & Servers
| Event | Payload | Description |
|-------|---------|-------------|
| `channel:create` | `{ serverId, name, type, categoryId }` | Create channel |
| `channel:update` | `{ channelId, ... }` | Edit channel |
| `channel:delete` | `{ channelId }` | Delete channel |
| `channel:join` | `{ channelId }` | Join a Socket.IO room |
| `channel:reorder` | `{ serverId, channels }` | Reorder channels |
| `category:create` | `{ serverId, name }` | Create category |
| `category:update` | `{ categoryId, name }` | Rename category |
| `category:delete` | `{ categoryId }` | Delete category |
| `category:reorder` | `{ serverId, categories }` | Reorder categories |
| `server:create` | `{ name }` | Create server |
| `server:update` | `{ serverId, ... }` | Edit server |
| `server:delete` | `{ serverId }` | Delete server |
| `server:leave` | `{ serverId }` | Leave server |
| `server:transfer-ownership` | `{ serverId, newOwnerId }` | Transfer ownership |
| `server:get-ice-config` | `{ serverId }` | Get ICE server config |
| `invite:create` | `{ serverId, maxUses, expiresAt }` | Create invite |
| `invite:revoke` | `{ inviteCode }` | Revoke invite |
| `invite:list` | `{ serverId }` | List invites |
| `invite:peek` | `{ inviteCode }` | Preview server info |
| `invite:use` | `{ inviteCode }` | Join via invite |

#### Voice
| Event | Payload | Description |
|-------|---------|-------------|
| `voice:join` | `{ channelId }` | Join voice channel |
| `voice:leave` | `{ channelId }` | Leave voice channel |
| `voice:mute` | `{ muted }` | Set local mute |
| `voice:deafen` | `{ deafened }` | Set local deafen |
| `voice:force-mute` | `{ userId, serverId }` | Server-mute a user |
| `voice:force-deafen` | `{ userId, serverId }` | Server-deafen a user |
| `voice:move` | `{ userId, channelId }` | Move user to channel |
| `voice:kick` | `{ userId }` | Kick from voice |
| `voice:ice-config` | `{ serverId }` | Get ICE config |
| `webrtc:offer` | `{ targetId, offer }` | WebRTC SDP offer |
| `webrtc:answer` | `{ targetId, answer }` | WebRTC SDP answer |
| `webrtc:ice` | `{ targetId, candidate }` | ICE candidate |
| `screen:start` | `{ channelId }` | Begin screen share |
| `screen:stop` | `{ channelId }` | End screen share |
| `screen:watch` | `{ sharerId }` | Subscribe to a share stream |
| `screen:unwatch` | `{ sharerId }` | Unsubscribe |
| `screen:thumbnail` | `{ channelId, thumbnail }` | Send share thumbnail |

#### DMs
| Event | Payload | Description |
|-------|---------|-------------|
| `dm:create` | `{ userId }` | Open or get 1:1 DM |
| `dm:list` | — | List all DM channels |
| `dm:close` | `{ channelId }` | Close DM |
| `dm:delete` | `{ channelId }` | Delete DM |
| `dm:mark-read` | `{ channelId }` | Mark DM as read |
| `dm:unread-counts` | — | Get unread counts |
| `dm:message-requests` | — | List message requests |
| `dm:message-request:accept` | `{ channelId }` | Accept request |
| `dm:message-request:reject` | `{ channelId }` | Reject request |
| `dm:message-request:block` | `{ channelId }` | Block sender |
| `dm:call-start` | `{ channelId }` | Initiate DM call |
| `dm:call-decline` | `{ channelId }` | Decline incoming call |
| `group-dm:create` | `{ userIds }` | Create group DM |
| `group-dm:add-participant` | `{ channelId, userId }` | Add member |
| `group-dm:remove-participant` | `{ channelId, userId }` | Remove member |

#### Social
| Event | Payload | Description |
|-------|---------|-------------|
| `friend:request` | `{ username }` | Send friend request |
| `friend:accept` | `{ userId }` | Accept request |
| `friend:reject` | `{ userId }` | Reject request |
| `friend:remove` | `{ userId }` | Remove friend |
| `friend:list` | — | List friends + pending |
| `block:user` | `{ userId }` | Block user |
| `unblock:user` | `{ userId }` | Unblock user |
| `blocked:list` | — | List blocked users |
| `report:user` | `{ userId, reason }` | Report user |

#### Moderation
| Event | Payload | Description |
|-------|---------|-------------|
| `server:kick-user` | `{ serverId, userId }` | Kick member |
| `server:ban-user` | `{ serverId, userId }` | Ban member |
| `server:unban-user` | `{ serverId, userId }` | Unban member |
| `server:timeout-user` | `{ serverId, userId, duration }` | Apply timeout |
| `server:remove-timeout` | `{ serverId, userId }` | Remove timeout |
| `automod:create-rule` | `{ serverId, rule }` | Create AutoMod rule |
| `automod:update-rule` | `{ ruleId, updates }` | Update rule |
| `automod:delete-rule` | `{ ruleId }` | Delete rule |
| `automod:get-rules` | `{ serverId }` | List rules |
| `automod:test-rule` | `{ ruleId, content }` | Test rule against text |
| `moderation:get-bans` | `{ serverId }` | List bans |
| `moderation:get-timeouts` | `{ serverId }` | List active timeouts |
| `moderation:get-reports` | `{ serverId }` | List reports |
| `moderation:update-report` | `{ reportId, status }` | Resolve report |
| `audit:get-logs` | `{ serverId, limit }` | Fetch audit log |

#### Roles
| Event | Payload | Description |
|-------|---------|-------------|
| `role:create` | `{ serverId, name, color, permissions }` | Create role |
| `role:update` | `{ roleId, ... }` | Update role |
| `role:delete` | `{ roleId }` | Delete role |
| `member:role` | `{ serverId, userId, roleId, action }` | Assign/remove role |

#### Custom Emoji & Soundboard
| Event | Payload | Description |
|-------|---------|-------------|
| `emoji:upload` | `{ serverId, name, image }` | Upload emoji |
| `emoji:get` | `{ serverId }` | List emoji |
| `emoji:get-image` | `{ emojiId }` | Fetch image |
| `emoji:update` | `{ emojiId, name }` | Rename emoji |
| `emoji:delete` | `{ emojiId }` | Delete emoji |
| `soundboard:upload` | `{ serverId, name, sound }` | Upload sound |
| `soundboard:get-sounds` | `{ serverId }` | List sounds |
| `soundboard:get-sound` | `{ soundId }` | Fetch sound |
| `soundboard:play` | `{ soundId, channelId }` | Play to voice channel |
| `soundboard:play-targeted` | `{ soundId, userId }` | Play to specific user |
| `soundboard:update` | `{ soundId, name }` | Rename sound |
| `soundboard:delete` | `{ soundId }` | Delete sound |
| `user:update-sounds` | `{ joinSoundId, leaveSoundId }` | Set intro/exit sounds |
| `user:get-sounds` | — | Get configured sounds |

#### Webhooks
| Event | Payload | Description |
|-------|---------|-------------|
| `webhook:create` | `{ channelId, name }` | Create webhook |
| `webhook:delete` | `{ webhookId }` | Delete webhook |

#### Encryption
| Event | Payload | Description |
|-------|---------|-------------|
| `encryption:set-public-key` | `{ publicKey }` | Store E2E public key |
| `encryption:get-public-key` | `{ userId }` | Retrieve user's public key |

#### Bookmarks
| Event | Payload | Description |
|-------|---------|-------------|
| `bookmarks:list` | — | List saved messages |
| `bookmarks:get-ids` | — | List bookmarked message IDs |

#### MCP
| Event | Payload | Description |
|-------|---------|-------------|
| `mcp:token:create` | `{ name, scopes, serverIds, expiresInDays }` | Create bot token |
| `mcp:token:list` | — | List tokens |
| `mcp:token:delete` | `{ tokenId }` | Revoke token |
| `mcp:bot:create` | `{ name, avatar, serverId }` | Create bot account |
| `mcp:bot:list` | `{ serverId }` | List bots |
| `mcp:bot:delete` | `{ botId }` | Delete bot |
| `mcp:connection:create` | `{ serverId, ... }` | Register MCP server |
| `mcp:connection:list` | `{ serverId }` | List connections |
| `mcp:connection:delete` | `{ serverId, connectionId }` | Remove connection |
| `mcp:connection:toggle` | `{ serverId, connectionId, enabled }` | Enable/disable |
| `mcp:agent:create` | `{ serverId, ... }` | Create agent config |
| `mcp:agent:list` | `{ serverId }` | List agents |
| `mcp:agent:update` | `{ serverId, agentId, updates }` | Update agent |
| `mcp:agent:delete` | `{ serverId, agentId }` | Delete agent |
| `mcp:stream:start` | `{ channelId, messageId }` | Start streaming response |
| `mcp:stream:chunk` | `{ channelId, messageId, content }` | Append chunk |
| `mcp:stream:end` | `{ channelId, messageId, finalContent }` | Finalize stream |

#### Admin
| Event | Payload | Description |
|-------|---------|-------------|
| `admin:get-users` | — | List all platform users |
| `admin:get-servers` | — | List all servers |
| `admin:delete-server` | `{ serverId }` | Delete any server |
| `admin:delete-user` | `{ userId }` | Delete any user |
| `admin:reset-password` | `{ userId, newPassword }` | Force password reset |
| `admin:get-orphaned-stats` | — | Stats on ownerless servers |
| `admin:assign-ownerless-servers` | `{ userId }` | Reassign orphaned servers |
| `admin:cleanup-empty-dms` | — | Remove empty DM channels |

---

## 31. REST API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/auth/register` | None | Register new account |
| `POST` | `/api/auth/login` | None | Login |
| `POST` | `/api/auth/logout` | Token | Logout (revoke token) |
| `POST` | `/api/user/avatar` | Token | Upload profile avatar |
| `POST` | `/api/server/:serverId/icon` | Token | Upload server icon |
| `POST` | `/api/webhooks/:webhookId/:token` | Webhook token | Post webhook message |
| `GET` | `/api/gifs/search` | Token | Giphy search |
| `GET` | `/api/gifs/trending` | Token | Giphy trending |
| `GET` | `/api/og` | Token | Open Graph URL preview |
| `GET` | `/api/health` | None | Health check |
| `GET` | `/api/metrics` | Admin | Runtime metrics |

---

## 32. Database Schema

19 migration files manage the schema across 24+ tables.

| Table | Purpose |
|-------|---------|
| `accounts` | Users and bot accounts; E2E public keys; bcrypt hashes |
| `tokens` | JWT session records |
| `recovery_codes` | Account recovery codes (bcrypt hashed) |
| `servers` | Server definitions; LAN mode flag; ICE config |
| `server_members` | Membership with JSONB roles array |
| `server_bans` | Persistent ban records |
| `server_timeouts` | Timeout records with expiry |
| `categories` | Channel groupings with position |
| `channels` | Text and voice channels; permission overrides (JSONB) |
| `roles` | Role definitions: name, color, position, permissions (JSONB) |
| `messages` | Chat messages; reactions, attachments, mentions (JSONB) |
| `threads` | Thread parent references |
| `thread_names` | Optional thread titles |
| `pins` | Pinned message records per channel |
| `bookmarks` | Per-user saved messages |
| `dm_channels` | DM and group DM channels |
| `dm_participants` | DM membership records |
| `dm_read_states` | Per-user last-read position in DMs |
| `friendships` | Friend relationships and requests |
| `invites` | Server invite codes with usage tracking |
| `webhooks` | Webhook configurations (token stored as hash) |
| `custom_emojis` | Per-server emoji definitions |
| `automod_rules` | AutoMod rule configs per server |
| `moderation_rules` | (alias for automod_rules in some contexts) |
| `reports` | User reports with review status |
| `audit_log` | Moderation action log |
| `bot_tokens` | MCP bot API tokens (SHA-256 hashed) |
| `mcp_connections` | External MCP server registrations |
| `agent_configs` | AI agent configurations |
| `agent_activity_log` | Per-invocation agent activity |

---

## 33. Performance Optimizations

### 33.1 Frontend

- `React.memo()` on all major components
- `useCallback()` for event handlers, `useMemo()` for expensive derivations (message grouping, filtering)
- Per-channel message cache in React state
- Infinite scroll with 50-message pages
- WebRTC audio processing offloaded to `AudioWorklet` (dedicated thread)

### 33.2 Backend

- PostgreSQL connection pooling (max 20 clients)
- Batch queries with JOINs (`getChannelMessagesWithAuthors`, `getDMChannelsWithDetails`) — no N+1 patterns
- Indexed queries: `idx_messages_channel_id`, `idx_server_members_server_id`, `idx_audit_log_server_id`, etc.
- Socket.IO room-based broadcasting — messages only sent to users in the relevant channel

### 33.3 Redis Message Cache

- Hot channels (high-traffic) have their latest messages cached in Redis sorted sets
- Cache key: `channel:{channelId}:messages`
- On send: message appended to cache and trimmed to last N messages
- On edit/delete: cache invalidated for the channel
- Cache miss: falls through to PostgreSQL

### 33.4 Network

- WebSocket transport (lower overhead than HTTP polling)
- Gzip compression in Nginx and Express
- Static asset caching with `Cache-Control` headers
- Base64 for small images (avoids extra HTTP round-trips)

---

## 34. File Structure

```
Nexus/
├── client/
│   ├── src/
│   │   ├── App.js                     Root state management (77 KB)
│   │   ├── config.js                  Server URL resolver (web/Capacitor/Tauri/Electron)
│   │   ├── components/
│   │   │   ├── ChatArea.js            Message display, input, attachments (65 KB)
│   │   │   ├── VoiceArea.js           WebRTC tiles, soundboard, controls
│   │   │   ├── Sidebar.js             Channel list (servers) or DM list (personal)
│   │   │   ├── ServerList.js          Server icon rail
│   │   │   ├── MemberList.js          Online/offline member list
│   │   │   ├── SettingsModal.js       16-tab settings panel
│   │   │   ├── GifPicker.js           Giphy integration
│   │   │   ├── CommandMessage.js      Slash command renderer
│   │   │   ├── PollCreator.js         Poll creation modal
│   │   │   ├── URLEmbed.js            Open Graph preview cards
│   │   │   ├── UserProfileModal.js    User profile popup
│   │   │   ├── IncomingCallOverlay.js DM call notifications
│   │   │   ├── ErrorBoundary.js       Graceful error recovery
│   │   │   └── icons/                 SVG icon components
│   │   ├── hooks/
│   │   │   ├── useWebRTC.js           Voice, video, screen share (53 KB)
│   │   │   └── useLongPress.js        Mobile long-press gesture
│   │   └── utils/
│   │       └── encryption.js          E2E encryption (NaCl/libsodium)
│   ├── public/
│   │   ├── service-worker.js          Offline app shell
│   │   └── audio-processor.js         AudioWorklet (noise gate, AGC, RNNoise)
│   ├── scripts/
│   │   ├── icon-master.svg            Master icon source
│   │   └── generate-icons.mjs         Icon generation script
│   ├── src-tauri/                     Tauri desktop app
│   ├── nginx.conf                     Nginx config
│   └── Dockerfile                     Multi-stage build
│
├── server/
│   ├── index.js                       Express + Socket.IO (~920 lines)
│   ├── state.js                       Shared in-memory state + user index
│   ├── helpers.js                     Utility functions (serializeServer, getUserPerms, etc.)
│   ├── db.js                          PostgreSQL queries (100+ functions)
│   ├── config.js                      Environment config with validation
│   ├── validation.js                  Input validation and sanitization
│   ├── metrics.js                     Runtime metrics
│   ├── default-sounds.js              16 built-in WAV sounds
│   ├── handlers/
│   │   ├── auth.js                    join, disconnect, user updates
│   │   ├── servers.js                 Server CRUD, kick/ban/timeout
│   │   ├── channels.js                Channel/category CRUD
│   │   ├── messages.js                Message send/edit/delete/reactions/pins/search/threads
│   │   ├── roles.js                   Role CRUD, member assignment
│   │   ├── dms.js                     DM channels, group DMs, message requests, calls
│   │   ├── social.js                  Friends, blocks, reports, invites
│   │   ├── voice.js                   Voice/WebRTC signaling, soundboard, screen sharing
│   │   ├── webhooks.js                Webhook CRUD
│   │   ├── emoji.js                   Custom emoji CRUD
│   │   ├── automod.js                 AutoMod rule engine
│   │   ├── bookmarks.js               Bookmark operations
│   │   ├── audit.js                   Audit log retrieval
│   │   ├── admin.js                   Platform admin operations
│   │   └── mcp.js                     MCP bot framework
│   └── migrations/                    19 sequential SQL files
│
├── tests/
│   ├── automated/                     378 Jest tests (13+ suites)
│   ├── manual/                        93 test cases (8 categories)
│   └── stress/                        Performance and load tests
│
├── docs/
│   ├── FEATURES.md                    This file
│   ├── CHANGELOG.md                   Version history
│   ├── THEMES.md                      Theme documentation
│   ├── STUN_TURN.md                   STUN/TURN and LAN mode guide
│   ├── CROSS_PLATFORM_PLAN.md         Build instructions for all platforms
│   ├── DATA_PERSISTENCE.md            Database and storage details
│   ├── PRODUCTION_HARDENING.md        Security hardening checklist
│   ├── IMPLEMENTATION.md              Implementation notes
│   └── deployment/
│       └── DOCKER_DEPLOYMENT.md       Docker deployment guide
│
├── asc/                               ASC development framework artifacts
├── docker-compose.yml                 Base orchestration
├── docker-compose.prod.yml            Production overrides
├── docker-compose.dev.yml             Development overrides
├── docker-compose.coturn.yml          Self-hosted STUN/TURN overlay
├── CLAUDE.md                          Developer guide for Claude Code
└── NEXUS_ROADMAP.md                   Enhancement roadmap
```

---

## 35. Feature Status Summary

| # | Feature | Status | Since |
|---|---------|--------|-------|
| 1 | User registration & login (bcrypt) | Complete | 1.0.0 |
| 2 | Token-based session management | Complete | 1.0.0 |
| 3 | Text messaging (send, edit, delete) | Complete | 1.0.0 |
| 4 | Emoji reactions (8 quick-pick) | Complete | 1.0.0 |
| 5 | Reply / thread system | Complete | 1.0.0 |
| 6 | Full thread panel with replies | Complete | 1.0.4 |
| 7 | Image & GIF attachments | Complete | 1.0.0 |
| 8 | GIF picker (Giphy) | Complete | 1.0.0 |
| 9 | Typing indicators | Complete | 1.0.0 |
| 10 | Message history pagination (50/page) | Complete | 1.0.0 |
| 11 | Message grouping & date separators | Complete | 1.0.0 |
| 12 | NEW messages divider | Complete | 1.0.10 |
| 13 | URL previews (Open Graph) | Complete | 1.0.0 |
| 14 | Message link embeds | Complete | 1.0.11 |
| 15 | Message pinning | Complete | 1.0.5 |
| 16 | Message bookmarks (saved messages) | Complete | 1.0.5 |
| 17 | Full-text message search with operators | Complete | 1.0.5 |
| 18 | Slash commands (10 commands) | Complete | 1.0.0 |
| 19 | Polls | Complete | 1.0.2 |
| 20 | Voice channels (WebRTC) | Complete | 1.0.0 |
| 21 | Speaking detection | Complete | 1.0.0 |
| 22 | Mute / deafen controls | Complete | 1.0.0 |
| 23 | Push-to-Talk (PTT) | Complete | 1.0.9 |
| 24 | Voice persistence (auto-rejoin) | Complete | 1.0.9 |
| 25 | Per-user volume controls | Complete | 1.0.0 |
| 26 | Audio processing pipeline | Complete | 1.0.9 |
| 27 | RNNoise ML noise cancellation | Complete | 1.0.9 |
| 28 | AGC (leveler + limiter) | Complete | 1.0.9 |
| 29 | Noise gate | Complete | 1.0.9 |
| 30 | Join/leave audio cues | Complete | 1.0.0 |
| 31 | Custom intro/exit sounds per user | Complete | 1.0.3 |
| 32 | Soundboard (16 built-in + custom upload) | Complete | 1.0.3 |
| 33 | Targeted soundboard | Complete | 1.0.3 |
| 34 | Screen sharing | Complete | 1.0.0 |
| 35 | Multi-sharer screen sharing | Complete | 1.0.11 |
| 36 | Screen share thumbnails | Complete | 1.0.11 |
| 37 | Direct messages (1:1) | Complete | 1.0.0 |
| 38 | Group DMs | Complete | 1.0.1 |
| 39 | DM message requests | Complete | 1.0.6 |
| 40 | DM pinnable conversations | Complete | 1.0.3 |
| 41 | DM voice/video calls | Complete | 1.0.7 |
| 42 | End-to-end encryption (1:1 DMs) | Complete | 1.0.8 |
| 43 | E2E key backup/recovery | Complete | 1.0.8 |
| 44 | Multi-server support | Complete | 1.0.0 |
| 45 | Server invite links | Complete | 1.0.0 |
| 46 | Channel categories (collapsible) | Complete | 1.0.0 |
| 47 | Private channels | Complete | 1.0.0 |
| 48 | Channel reordering (drag & drop) | Complete | 1.0.0 |
| 49 | Role system (18 permissions) | Complete | 1.0.0 |
| 50 | Channel-level permission overrides | Complete | 1.0.0 |
| 51 | Kick, ban, timeout | Complete | 1.0.0 |
| 52 | Voice moderation (force mute/deafen/move/kick) | Complete | 1.0.2 |
| 53 | Context menu moderation | Complete | 1.0.10 |
| 54 | AutoMod (keyword, spam, invite link) | Complete | 1.0.9 |
| 55 | User reports & review workflow | Complete | 1.0.2 |
| 56 | Audit log | Complete | 1.0.5 |
| 57 | Friend system | Complete | 1.0.1 |
| 58 | User blocking | Complete | 1.0.1 |
| 59 | Custom emoji (up to 50 per server) | Complete | 1.0.1 |
| 60 | Webhooks (token-authenticated) | Complete | 1.0.0 |
| 61 | MCP bot framework | Complete | 1.0.12 |
| 62 | Bot accounts | Complete | 1.0.12 |
| 63 | AI agent configurations | Complete | 1.0.12 |
| 64 | Streaming bot responses | Complete | 1.0.12 |
| 65 | 11 built-in themes + custom editor | Complete | 1.0.8 |
| 66 | LAN mode (per-server offline toggle) | Complete | 1.0.8 |
| 67 | Self-hosted STUN/TURN (coturn) | Complete | 1.0.8 |
| 68 | Structured logging (Winston) | Complete | 1.0.9 |
| 69 | Redis hot-channel message cache | Complete | 1.0.12 |
| 70 | Platform admin panel | Complete | 1.0.0 |
| 71 | Mobile responsive layout | Complete | 1.0.0 |
| 72 | Mobile swipe navigation | Complete | 1.0.0 |
| 73 | Mobile long-press context menu | Complete | 1.0.4 |
| 74 | Mobile pull-to-refresh | Complete | 1.0.7 |
| 75 | Tauri desktop app | Complete | 1.0.3 |
| 76 | Capacitor mobile (Android/iOS) | Complete | 1.0.5 |
| 77 | Service worker (offline app shell) | Complete | 1.0.8 |
| 78 | Offline resilience & error boundary | Complete | 1.0.10 |
| 79 | bcrypt password hashing (12 rounds) | Complete | 1.0.4 |
| 80 | Rate limiting (API + messages + webhooks) | Complete | 1.0.0 |
| 81 | SSRF protection on URL preview | Complete | 1.0.0 |
| 82 | Helmet.js security headers | Complete | 1.0.0 |
| 83 | Input validation & sanitization | Complete | 1.0.0 |
| 84 | Runtime metrics endpoint | Complete | 1.0.9 |

---

*Generated: March 2026 | Version: 1.0.12 | Total Features Documented: 84*

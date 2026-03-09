# Architecture

## System Overview

```
┌─────────────┐     ┌─────────┐     ┌──────────────────┐     ┌────────────┐
│   Browser    │────▶│  Nginx  │────▶│  Express Server   │────▶│ PostgreSQL │
│  (Port 3000) │     │  Proxy  │     │  + Socket.IO      │     │  (Port 5432)│
└─────────────┘     └─────────┘     │  (Port 3001)      │     └────────────┘
                                     └────────┬─────────┘
┌─────────────┐                               │              ┌────────────┐
│ Tauri/Electron│──────────────────────────────┘              │   Redis    │
│   Desktop    │                                              │  (Port 6379)│
└─────────────┘                                              └────────────┘

┌─────────────┐     ┌──────────┐
│  Capacitor   │     │  Coturn  │  (Self-hosted STUN/TURN)
│   Mobile     │     │ (3478)   │
└─────────────┘     └──────────┘
```

## Server Architecture

**Monolithic Express + Socket.IO** (server/index.js, ~1012 lines)

```
index.js (wiring)
├── config.js          — Environment validation & loading
├── db.js              — PostgreSQL queries (100+ functions, pool max 20)
├── state.js           — In-memory runtime state with O(1) indexes
├── helpers.js         — Utility functions (serialization, permissions, rate limiting)
├── validation.js      — Input sanitization for all user data
├── utils.js           — Permission checking with role hierarchy
├── logger.js          — Winston structured logging with domain prefixes
├── metrics.js         — Application metrics collection (connections, rates, errors)
└── handlers/          — 13 Socket.IO event handler modules
    ├── auth.js        — Join, disconnect, user updates
    ├── servers.js     — Server CRUD, kick/ban/timeout
    ├── channels.js    — Channel/category CRUD
    ├── messages.js    — Message send/edit/delete, reactions, pins, threads
    ├── roles.js       — Role CRUD, member assignment
    ├── dms.js         — DM channels, group DMs, message requests, calls
    ├── social.js      — Friends, blocks, reports, invites
    ├── voice.js       — Voice/WebRTC signaling, soundboard, screen sharing
    ├── webhooks.js    — Webhook CRUD
    ├── emoji.js       — Custom emoji CRUD
    ├── admin.js       — Platform admin operations
    ├── bookmarks.js   — Bookmark management
    └── audit.js       — Audit log retrieval
```

## Client Architecture

**React SPA** (Create React App)

```
App.js (77KB — central state hub)
├── components/
│   ├── ChatArea.js        — Message display, input, attachments (65KB)
│   ├── SettingsModal.js   — 10-tab settings panel
│   └── ...                — Channel list, member list, voice UI, etc.
├── hooks/
│   └── useWebRTC.js       — WebRTC peer management (53KB)
└── config.js              — Server URL resolution per platform
```

## Data Flow

1. **Authentication**: REST (`POST /api/auth/*`) → JWT issued → stored client-side
2. **Real-time events**: Socket.IO with JWT auth on handshake → handler modules
3. **File uploads**: REST (`POST /api/user/avatar`, etc.) → base64 processing
4. **Voice/Video**: Socket.IO signaling → WebRTC P2P connections via Coturn STUN/TURN
5. **External APIs**: REST proxy for Giphy (`/api/gifs/*`), URL previews (`/api/og`)

## Database

PostgreSQL 15 with 16+ tables. Key patterns:
- UUIDs for account IDs
- JSONB for reactions, attachments, permissions, role data
- Foreign keys with `ON DELETE CASCADE`
- Indexes on username, server_id, channel_id
- Sequential migrations applied on container startup

## Caching & State

- **Redis**: Session store only
- **In-memory (state.js)**: Users, servers, messages, voice channels with O(1) index maps
- **Client**: React component state in App.js; localStorage for settings and E2E encryption keys

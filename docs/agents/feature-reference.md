# Nexus — Agent Feature Reference

Quick-start reference for any agent working on Nexus. Read this before picking up a task to orient yourself without re-reading all of CLAUDE.md.

---

## Current Feature Set

### Servers & Channels
- Multi-server support — users join any number of servers
- Server CRUD, member management (kick/ban/timeout), custom icons
- Channel types: **text**, **voice**; organized into named categories
- Channel-level permission overrides on top of role-based permissions
- Custom emoji per server

### Messaging
- Real-time text messaging via Socket.IO (`message:send`, `message:edit`, `message:delete`)
- Reactions (emoji), message pins, message threads
- Full-text search within channels
- GIF search via Giphy integration
- URL previews (with SSRF protection)
- File/image attachments (base64 upload via REST)
- Webhooks — external systems can POST messages to a channel (`/api/webhooks/:webhookId/:token`)
- Bookmarks per user

### Voice & Video (WebRTC)
- P2P WebRTC mesh for voice and video calls
- Voice channels — join/leave, mute/deafen, per-user volume
- Push-to-talk, noise gate, AI noise cancellation (RNNoise/WASM), AGC
- Video calling (camera on/off)
- Screen sharing with system audio (per-channel, multiple sharers)
- DM voice/video calls (1:1)
- Soundboard — server-defined audio clips playable into voice
- Speaking indicators, connection quality monitoring

### Direct Messages
- 1:1 DMs and group DMs (multi-party)
- Message requests (accept/decline from non-friends)
- Persistent DM history

### Social / User Graph
- Friend requests and friend list
- User blocking
- User reports

### Roles & Permissions
- Server-level roles with position-based hierarchy (highest position wins)
- Per-channel permission overrides
- `@everyone` defaults as baseline
- Server owner has all permissions unconditionally
- `PLATFORM_ADMIN` env var designates a platform-wide superadmin

### Audit Log
- Server-scoped audit trail of moderation actions

### Cross-Platform
- **Web** (primary) — served via Nginx + React
- **Mobile** — Capacitor (iOS/Android)
- **Desktop** — Tauri (preferred), Electron (fallback)
- Source config auto-detects environment (`client/src/config.js`)

---

## Planned Features (Prioritized)

### High Priority — Competitive Gaps
| Feature | Notes |
|---|---|
| **Forum channels** | New channel type `forum`. Post-based threads with title + body. Tags, sort by activity or creation date. |

### Medium Priority — Competitive Gaps
| Feature | Notes |
|---|---|
| **Scheduled messages** | `scheduled_messages` table + delivery job/interval. Date-time picker in message input. |
| **Message edit history** | `message_edits` table. "(edited)" badge, click to view versions. |
| **Keyboard shortcuts** | Navigation, message actions, voice controls. Configurable bindings. Ctrl+/ modal. |
| **Stage channels** | Speaker queue for town halls/AMAs. Audience raises hand; moderator approves. |
| **Server onboarding** | Customizable welcome screen for new members — role selection, rules, channel picker. |

### Infrastructure
| Feature | Notes |
|---|---|
| **Automated DB backups** | Daily `pg_dump` via sidecar or cron. Compressed, 30-day retention. |
| **SSO/OAuth support** | OAuth2 login for Google/GitHub. Important for org deployments. |
| **Data retention policies** | Configurable per-server message retention. Auto-purge. |

### Voice & Audio
- Full manual test pass required: 55 test cases in `tests/manual/05-voice-and-soundboard.md` (TC-025 to TC-079)

### Accessibility
- ARIA labels on all interactive elements
- Full keyboard navigation (context menus, emoji picker, settings, channel list)
- `prefers-reduced-motion` support

---

## Architecture Reference

### Stack
```
Browser (3000) → Nginx → Express + Socket.IO (3001) → PostgreSQL + Redis
```

### Key Server Files
| File | Role |
|---|---|
| `server/index.js` | Express setup, REST routes, Socket.IO wiring — delegates to `handlers/` |
| `server/state.js` | In-memory state: `users`, `servers`, `messages`, `voiceChannels`, `userIdToSocketId` |
| `server/helpers.js` | Shared utilities: `serializeServer`, `getUserPerms`, `leaveVoice`, rate limiters |
| `server/db.js` | All PostgreSQL queries (100+ functions). Pool max 20. Use `getClient()` for transactions. |
| `server/utils.js` | Permission checking — role hierarchy, channel overrides, owner bypass |
| `server/validation.js` | Input validation and sanitization for all user inputs |
| `server/config.js` | Env var loading with validation. Fails fast if `JWT_SECRET` or `DATABASE_URL` missing. |
| `server/migrations/` | 9 sequential SQL files, applied idempotently on container start |

### Handler Modules (`server/handlers/`)
Each exports `function(io, socket)`. Do not cross-import between handlers — shared logic goes in `helpers.js`.

| Handler | Domain |
|---|---|
| `auth.js` | join, disconnect, user updates, password change |
| `servers.js` | server CRUD, kick/ban/timeout |
| `channels.js` | channel/category CRUD, moderation queries |
| `messages.js` | send/edit/delete, reactions, pins, search, threads |
| `roles.js` | role CRUD, member role assignment |
| `dms.js` | DM create/list/messages, group DMs, message requests, calls |
| `social.js` | friends, blocks, reports, invites |
| `voice.js` | voice/WebRTC signaling, soundboard, screen sharing |
| `webhooks.js` | webhook create/delete |
| `emoji.js` | custom emoji CRUD |
| `admin.js` | platform admin operations |
| `bookmarks.js` | bookmark list/IDs |
| `audit.js` | audit log retrieval |

### Key Client Files
| File | Role |
|---|---|
| `client/src/App.js` (~77KB) | Root component — all global state (servers, channels, messages, voice, DMs, user) |
| `client/src/components/ChatArea.js` (~65KB) | Message display, input, attachments, reactions, URL previews |
| `client/src/hooks/useWebRTC.js` (~53KB) | WebRTC peer connection management for voice/video/screen share |
| `client/src/components/SettingsModal.js` | 10-tab settings panel |
| `client/src/config.js` | Server URL resolution for web/Capacitor/Tauri/Electron |

### Real-Time Event Naming
All Socket.IO events are domain-prefixed:
- `message:send`, `message:edit`, `message:delete`, `message:react`
- `channel:create`, `channel:update`, `channel:delete`
- `voice:join`, `voice:leave`, `voice:signal`
- `dm:create`, `dm:message`
- `friend:request`, `friend:accept`
- `server:create`, `server:update`, `server:delete`
- `admin:get-servers`

### REST API (Non-Socket)
| Route | Purpose |
|---|---|
| `POST /api/auth/register\|login\|logout` | Authentication |
| `POST /api/user/avatar` | Avatar upload |
| `POST /api/server/:serverId/icon` | Server icon upload |
| `POST /api/webhooks/:webhookId/:token` | Webhook message ingestion |
| `GET /api/gifs/search\|trending` | Giphy (auth required) |
| `GET /api/og` | URL preview with SSRF protection |
| `GET /api/health` | Health check |
| `GET /api/metrics` | Admin-only metrics |

Global rate limit: 10 req / 10s on `/api`.

### Database
- PostgreSQL 15, 16+ tables defined in `server/migrations/001_initial_schema.sql`
- UUIDs for account IDs
- JSONB for reactions, attachments, permissions, role data
- Foreign keys with `ON DELETE CASCADE`
- Avoid N+1 — use batch query functions (`getChannelMessagesWithAuthors`, `getDMChannelsWithDetails`)

---

## Development Conventions

### Commits
- Imperative mood: `Add forum channel type`, `Fix voice reconnect on mobile`, `Remove deprecated webhook endpoint`
- Must include co-author line when automated: `Co-Authored-By: Paperclip <noreply@paperclip.ing>`

### Git Workflow
- `develop` — primary development branch; all feature branches branch from and merge into here
- `main` — production branch; only receives merges from `develop` for releases
- Never commit directly to `main` or `develop`

### Security Practices
- bcrypt with 12 rounds for password hashing
- Helmet.js middleware for HTTP headers
- CORS whitelist — origins must be explicitly allowed
- Input sanitization via `validation.js` on **all** user-supplied data
- Permissions checked on both client **and** server side
- SSRF protection on URL preview endpoint

### Cross-Platform Notes
- Web is primary target; Capacitor/Tauri/Electron are secondary
- Any changes to WebRTC or audio processing must be tested across platforms
- `client/src/config.js` handles URL resolution per environment automatically

### Version Bumping
When bumping the version, update all three locations:
1. `client/package.json` — `"version"`
2. `client/src-tauri/tauri.conf.json` — `"version"`
3. `README.md` — download badge and footer version

Then run `npm install` in `client/` to sync `package-lock.json`.

### Testing
- 299 automated Jest tests in `server/tests/automated/` — run `npm test` from `server/`
- 40 manual test cases in `server/tests/manual/` (8 categories)
- Tests can run without the full Docker stack

### Adding DB Queries
- All queries go in `server/db.js` — no inline SQL in handlers
- Multi-step operations use `getClient()` + explicit transaction
- New data that must survive server restart must be in the database (in-memory `state.js` is wiped on restart)

### Adding Migrations
- Migrations are sequential SQL files in `server/migrations/`
- Applied idempotently on container start — use `IF NOT EXISTS`, `DO $$ ... $$` guards
- Must be additive-safe — existing data must survive the migration
- Never drop columns or tables in a migration without a coordinated deploy plan

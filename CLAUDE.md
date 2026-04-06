# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Nexus is a real-time communication platform with text/voice channels, DMs, WebRTC voice/video, and cross-platform support. It uses a Docker-based architecture:

```
Browser (Port 3000) → Nginx → Express + Socket.IO (Port 3001) → PostgreSQL + Redis
```

## Build & Run Commands

```bash
# Production (base + prod override, project name: nexus-prod)
docker compose -p nexus-prod -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose -p nexus-prod -f docker-compose.yml -f docker-compose.prod.yml down
docker compose -p nexus-prod -f docker-compose.yml -f docker-compose.prod.yml logs -f server

# Dev (base + dev override, project name: nexus-dev)
docker compose -p nexus-dev --env-file .env.dev -f docker-compose.yml -f docker-compose.dev.yml up -d --build
docker compose -p nexus-dev --env-file .env.dev -f docker-compose.yml -f docker-compose.dev.yml down

# Quick start / deploy (production)
./start.sh
./deploy.sh
```

### Server (from `server/`)
```bash
npm start          # Run server
npm run dev        # Dev mode with nodemon
npm run migrate    # Run database migrations
npm test           # Run Jest tests (299 tests: validation, utils, permissions, config, security)
```

### Client (from `client/`)
```bash
npm start              # React dev server
npm run build          # Production build
npm run build:web      # Web build (no sourcemap)
npm run tauri:dev      # Tauri desktop dev
npm run electron:dev   # Electron desktop dev
```

### Database access
```bash
docker exec nexus-postgres psql -U postgres -d nexus_db
```

## Architecture

### Server (`server/`)
- **`index.js`** (~920 lines) — Express server, REST routes, middleware, and Socket.IO connection wiring. Delegates all socket event handlers to modules in `handlers/`. All real-time communication goes through Socket.IO; REST is only used for auth, file uploads, GIF search, and URL previews.
- **`state.js`** — Shared in-memory state (`users`, `servers`, `messages`, `voiceChannels`) and O(1) user-to-socket index (`userIdToSocketId` Map). Exports `addUser`/`removeUser`/`getSocketIdForUser`/`isUserOnline`.
- **`helpers.js`** — Extracted utility functions: `convertDbMessagesToRuntime` (synchronous, uses JOIN data), `serializeServer`, `getUserPerms`, `leaveVoice`, `handleSlashCommand`, rate limiters, etc.
- **`handlers/`** — 13 Socket.IO handler modules, each exporting `function(io, socket)`:
  - `auth.js` — join, disconnect, user updates, password change
  - `servers.js` — server CRUD, kick/ban/timeout (server:create uses DB transaction)
  - `channels.js` — channel/category CRUD, moderation queries
  - `messages.js` — message send/edit/delete, reactions, pins, search, threads
  - `roles.js` — role CRUD, member role assignment (DB-first pattern)
  - `dms.js` — DM create/list/message, group DMs, message requests, calls
  - `social.js` — friends, blocks, reports, invites
  - `voice.js` — voice/WebRTC signaling, soundboard, screen sharing
  - `webhooks.js` — webhook create/delete
  - `emoji.js` — custom emoji CRUD
  - `admin.js` — platform admin operations
  - `bookmarks.js` — bookmark list/IDs
  - `audit.js` — audit log retrieval
- **`db.js`** (100+ functions) — All PostgreSQL queries. Uses connection pooling (max 20 clients). Use `getClient()` for explicit transactions on multi-step operations. Includes batch queries with JOINs (`getChannelMessagesWithAuthors`, `getDMChannelsWithDetails`) to avoid N+1 patterns.
- **`config.js`** — Environment variable loading with validation. Production fails fast if `JWT_SECRET` or `DATABASE_URL` are missing. Also loads `PLATFORM_ADMIN` for platform-level admin designation.
- **`validation.js`** — Input validation and sanitization for all user inputs.
- **`utils.js`** — Permission checking with complex role hierarchy: @everyone defaults → role stacking (highest position wins) → channel-level overrides. Server owner has all permissions.
- **`migrations/`** — 9 sequential SQL files applied idempotently on container startup via `docker-entrypoint.sh`.

### Client (`client/`)
- **`src/App.js`** (77KB) — Root component managing all global state (servers, channels, messages, voice, DMs, user). This is the central state hub.
- **`src/components/ChatArea.js`** (65KB) — Message display, input, attachments, reactions, URL previews.
- **`src/hooks/useWebRTC.js`** (53KB) — WebRTC peer connection management for voice/video/screen sharing.
- **`src/components/SettingsModal.js`** — 10-tab settings panel (profile, server, channels, roles, members, webhooks, audio, friends, emoji, platform admin). Platform Admin tab is only visible to the user designated by the `PLATFORM_ADMIN` env var.
- **`src/config.js`** — Server URL resolution for web, Capacitor, Tauri, and Electron environments.
- **`nginx.conf`** — WebSocket upgrade support, SPA fallback routing, static asset caching.

### Database (PostgreSQL 15)
16+ tables defined in `server/migrations/001_initial_schema.sql`. Key patterns:
- UUIDs for account IDs
- JSONB columns for reactions, attachments, permissions, and role data
- Foreign keys with `ON DELETE CASCADE`
- Indexes on frequently queried fields (username, server_id, channel_id)

### Socket.IO Event Naming
All events use domain-prefixed names: `message:send`, `channel:create`, `voice:join`, `dm:create`, `friend:request`, `admin:get-servers`, etc.

### REST API Routes
- `POST /api/auth/register|login|logout` — Authentication
- `POST /api/user/avatar`, `POST /api/server/:serverId/icon` — File uploads (base64)
- `POST /api/webhooks/:webhookId/:token` — Webhook messages (rate limited: 10/10s)
- `GET /api/gifs/search|trending` — Giphy integration (auth required)
- `GET /api/og` — URL preview with SSRF protection
- `GET /health`, `GET /api/health` — Health checks
- Global rate limit: 10 requests per 10 seconds on `/api`

## Testing

**Automated:** 299 Jest tests in `tests/automated/` — run with `npm test` from `server/`. Tests cover validation, utils, permissions, config, and security. Can run without the full server stack.

**Manual:** 40 test cases in `tests/manual/` (8 categories: auth, messaging, channels, emoji, voice, social, moderation, UI).

## Key Environment Variables

Required: `JWT_SECRET`, `DATABASE_URL`, `POSTGRES_PASSWORD`

Important: `CLIENT_URL` (default `http://localhost:3000`), `GIPHY_API_KEY` (optional), `PLATFORM_ADMIN` (username for platform-level admin panel, optional)

See `.env.example` and `server/.env.example` for full list.

## Conventions

- Commit messages: imperative mood, concise description of the change
- No strict linting — ESLint via React Scripts with `exhaustive-deps` disabled
- No Prettier config
- Permissions must be checked on both client and server side
- Security: bcrypt (12 rounds), Helmet.js, CORS whitelist, input sanitization on all user data
- Cross-platform: web is primary; Capacitor (mobile), Tauri (desktop), Electron (fallback) are secondary
- Git workflow: `develop` is the primary development branch. Feature branches should be created from and merged into `develop` via PR. `main` is the production branch — merge `develop` into `main` for releases. Never commit directly to `main` or `develop`.

## Documentation Updates

When making codebase changes, keep the `docs/` directory in sync:

- **Adding or changing a feature** — Update the relevant file in `docs/user-guide/`, `docs/server-admin/`, or `docs/audio/`. If no file exists for the feature, create one following the existing structure.
- **Changing configuration options or environment variables** — Update `docs/deployment/environment-variables.md` and any other affected deployment docs.
- **Changing REST API endpoints** — Update `docs/api-reference/rest-api.md`.
- **Changing Socket.IO events** — Update `docs/api-reference/socket-events.md`.
- **Changing webhook behavior** — Update `docs/api-reference/webhook-api.md` and `docs/server-admin/webhooks.md`.
- **Changing Docker/deployment setup** — Update `docs/deployment/docker.md` and related deployment guides.
- **Changing database schema** — Update `docs/api-reference/database-schema.md`.
- **Changing the permission system** — Update `docs/server-admin/roles-and-permissions.md`.
- **Changing theme/CSS variables** — Update `docs/customization/css-variable-reference.md`.
- **Changing validation rules or limits** — Update `docs/security/input-validation.md`.

The docs index is `docs/README.md` — update it if you add or remove documentation files.

## Version Bumping

When bumping the version, update all of these locations:

| File | Field |
|------|-------|
| `client/package.json` | `"version"` |
| `client/src-tauri/tauri.conf.json` | `"version"` |
| `README.md` | Download badge (`download-vX.Y.Z-blue`) and footer version |

After updating, run `npm install` in `client/` to sync `package-lock.json`.

## Icon Generation

All application icons are generated from a single master SVG (`client/scripts/icon-master.svg`) — a red `#ed4245` hexagon outline on a dark `#2b2d31` background, matching the in-app `HexagonIcon` component.

```bash
# From client/
node scripts/generate-icons.mjs
```

Requires `sharp` (listed as a devDependency). On macOS, `iconutil` (bundled with Xcode CLI tools) is used for `.icns` generation.

### Output files

| Directory | Files | Purpose |
|---|---|---|
| `client/public/` | `favicon.ico`, `favicon-16x16.png`, `favicon-32x32.png`, `apple-touch-icon.png`, `logo192.png`, `logo512.png` | Web favicons & PWA icons |
| `client/src-tauri/icons/` | `icon.png`, `icon.ico`, `icon.icns`, `32x32.png`, `128x128.png`, `128x128@2x.png`, `Square*.png`, `StoreLogo.png` | Tauri desktop builds (macOS, Windows, Linux) |

### Updating the logo

1. Edit `client/scripts/icon-master.svg` (1024x1024 viewBox)
2. Run `node scripts/generate-icons.mjs` from `client/`
3. Rebuild the client — `build/` icons are regenerated automatically during `npm run build`

## CI/CD

- **`deploy-prod.yml`** — Auto-deploys on push to `main`/`master` via self-hosted runner (`-p nexus-prod`, ports 3000/3001)
- **`deploy-dev.yml`** — Auto-deploys on push to `develop` via self-hosted runner (`-p nexus-dev`, ports 3002/3003)
- **`dev.yml`** — Manual trigger for pre-release builds (Tauri, Electron, Capacitor)
- **`release.yml`** — Manual trigger for versioned releases (reads version from `client/package.json`)

## Development Cycle (ASC)

Nexus follows the Autonomous Software Creation (ASC) framework with 8 phases. All artifacts live in `asc/`:

| Phase | Directory | Purpose |
|-------|-----------|---------|
| 00 | `asc/00_intent_extraction/` | Problem statement, assumptions, stakeholders, priorities |
| 01 | `asc/01_intent_and_constraints/` | Intent statement, constraints, acceptance contract |
| 02 | `asc/02_design_generation/` | Architecture, technical contracts, design decisions |
| 03 | `asc/03_parallel_implementation/` | Component map, build verification |
| 04 | `asc/04_continuous_verification/` | Test strategy, security, performance |
| 05 | `asc/05_zero_touch_deployment/` | Pipeline docs, rollback procedures, post-deploy checks |
| 06 | `asc/06_autonomous_operations/` | Observability, incident playbooks, capacity management |
| 07 | `asc/07_feedback_synthesis/` | Signal sources, development cycle process |

**Gate validation** is enforced in CI:
- `unit-tests.yml`: npm audit (`--audit-level=high`, blocking) + coverage threshold (90%)
- `deploy-prod.yml` / `deploy-dev.yml`: Post-deploy metrics verification + deployment event logging

**Metrics endpoint**: `GET /api/metrics` (admin-only) returns connection counts, message/API rates, error counts, and system stats. See `server/metrics.js`.

## TODO — Competitive Feature Gaps (High Priority)

- [ ] **Forum channels** — New channel type `forum` with post-based threads. Each post has a title + initial message. Tags for categorization. Sort by recent activity or creation date.

## TODO — Competitive Feature Gaps (Medium Priority)

- [ ] **Scheduled messages** — Store in `scheduled_messages` table with delivery timestamp. Job queue or interval check for reliable delivery. Calendar icon in message input with date/time picker.
- [ ] **Message edit history** — Add `message_edits` table tracking old content + edit timestamp. Show "(edited)" badge on messages. Click to view previous versions.
- [ ] **Keyboard shortcuts** — Comprehensive shortcut system for navigation, message actions, voice controls. Configurable bindings. Document in a shortcuts modal (Ctrl+/).
- [ ] **Stage channels** — Speaker queue model for town halls, AMAs, presentations. Audience can "raise hand" to request speaking. Moderator approves/denies.
- [ ] **Server onboarding** — Customizable welcome screen for new members. Select roles, read rules, pick channels. Improves new-member experience significantly.

## TODO — Documentation / Knowledge Base

- [x] **Build KB from docs** — Existing docs (`DOCKER_DEPLOYMENT.md`, `TRAEFIK.md`, `STUN_TURN.md`, `THEMES.md`, `ios-signing-setup.md`) absorbed into structured `docs/` section with 60 files across 12 categories. `COMPETITIVE_ANALYSIS.md` excluded per plan.

## TODO — Infrastructure Gaps

- [x] **Structured logging** — Winston with daily rotation, structured JSON logs, domain-prefixed log parsing, request context. Log files in `server/data/logs/`.
- [ ] **Automated database backups** — Daily pg_dump via sidecar container or cron. Compress with 30-day retention.
- [ ] **SSO/OAuth support** — Add OAuth2 login flow for Google/GitHub. Important for team/org deployments.
- [ ] **Data retention policies** — Configurable per-server message retention. Auto-purge messages older than N days.

## TODO — Voice & Audio UX Testing

- [ ] **Manual voice UX test pass** — Execute all 55 test cases in `tests/manual/05-voice-and-soundboard.md` (TC-025 through TC-079). Covers: voice join/leave/presence, mute/deafen state broadcasting, push-to-talk (all platforms), noise gate (attack smoothing, threshold, sidechain filtering, inter-word pauses), AI noise cancellation (RNNoise aggressiveness levels, WASM fallback), AGC (leveler, limiter, VAD-gating, noise floor tracking), audio device selection, per-user volume, mic test meter, screen sharing & stream viewing (start/stop, fullscreen, system audio, late joiners, sharer leaves), voice persistence & auto-rejoin (web/desktop/mobile, expiry, edge cases), DM calls (initiate, decline, persistence), soundboard (playback, targeting, rate limits), speaking indicators, connection quality & reconnection, and combined processing pipeline validation. Requires 2-3 browser windows with different accounts.

## TODO — Accessibility

- [ ] **ARIA labels** — Add aria-label, aria-live, role attributes to all interactive elements. Screen reader announcements for new messages.
- [ ] **Keyboard navigation** — Full keyboard support for context menus, emoji picker, settings modal, channel list. Focus management and tab order.
- [ ] **Reduced motion** — Respect `prefers-reduced-motion` media query. Disable animations for users who need it.

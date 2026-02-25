# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Nexus is a real-time communication platform (Discord-like) with text/voice channels, DMs, WebRTC voice/video, and cross-platform support. It uses a Docker-based architecture:

```
Browser (Port 3000) → Nginx → Express + Socket.IO (Port 3001) → PostgreSQL + Redis
```

## Build & Run Commands

```bash
# Start entire stack (PostgreSQL, Redis, server, client)
docker-compose up -d --build

# Stop
docker-compose down

# View logs
docker-compose logs -f server
docker-compose logs -f client

# Quick start / deploy
./start.sh
./deploy.sh
```

### Server (from `server/`)
```bash
npm start          # Run server
npm run dev        # Dev mode with nodemon
npm run migrate    # Run database migrations
npm test           # Run Jest tests (225 tests: validation, utils, permissions, config, security)
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
- **`index.js`** (4649 lines) — Express server with 89+ Socket.IO event handlers. All real-time communication goes through Socket.IO; REST is only used for auth, file uploads, GIF search, and URL previews.
- **`db.js`** (100+ functions) — All PostgreSQL queries. Uses connection pooling (max 20 clients). Use `getClient()` for explicit transactions on multi-step operations.
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

**Automated:** 225 Jest tests in `tests/automated/` — run with `npm test` from `server/`. Tests cover validation, utils, permissions, config, and security. Can run without the full server stack.

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
- Git workflow: always work on feature branches — never commit directly to main. Create a PR to merge changes.

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

- **`deploy.yml`** — Auto-deploys on push to `main`/`master` via self-hosted runner (Docker rebuild + health checks)
- **`dev.yml`** — Manual trigger for pre-release builds (Tauri, Electron, Capacitor)
- **`release.yml`** — Manual trigger for versioned releases (reads version from `client/package.json`)

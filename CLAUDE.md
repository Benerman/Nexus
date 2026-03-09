# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Nexus is a real-time communication platform (Discord-like) with text/voice channels, DMs, WebRTC voice/video, and cross-platform support. It uses a Docker-based architecture:

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

## TODO — Audio Processing Improvements

Current state: AudioWorklet processor (`client/public/audio-processor.js`) handles noise gate, AGC, and output gain on the audio thread. The items below bring the pipeline closer to industry standard (Discord/Teams/Zoom level).

### Noise Gate

- [x] **Add Attack state to gate FSM** — Current gate has 4 states (closed/open/hold/closing). Add explicit Attack state so gain ramps from 0→1 over 1-2ms instead of jumping. Prevents click artifacts on gate open.
- [x] **Use soft gate floor instead of hard mute** — Instead of attenuating to 0.0 when closed, attenuate to -40dB (0.01). Sounds more natural in conversation — a downward expander approach. Make floor configurable.
- [x] **Reduce hold time from 150ms to 50ms** — Industry standard for voice VoIP is 25-50ms. 150ms lets too much noise through after speech ends. Keep the hysteresis (6dB) which handles inter-word pauses better than long hold times.
- [x] **Band-pass sidechain filtering** — Run the envelope detector on a filtered version of the signal (300Hz-3kHz) so the gate responds to speech frequencies, not low-frequency rumble or high-frequency hiss that happen to exceed the threshold.

### Auto Gain Control (AGC)

- [x] **VAD-gated gain updates** — Only update AGC gain during frames classified as speech (gate open + signal > noise floor). Currently freezes when gate is closed, but should also freeze during non-speech noise that passes through the gate. Prevents the "pumping" artifact.
- [x] **Separate leveler + limiter stages** — Replace single AGC with two stages: (1) slow leveler (500ms attack, 2s release, high ratio) that brings all levels to target, (2) fast limiter (5ms attack, 200ms release, 4:1 ratio) that catches transients. Current single-speed approach can't handle both gradual drift and sudden changes well.
- [x] **Compute gain in dB domain** — Current AGC uses linear multiplication (`1 + diff * 0.03`) which makes the time constant dependent on signal level. Switch to `desired_gain = 10^((target - baseline) / 20)` with exponential smoothing in dB domain for level-independent behavior. (Worklet already does this correctly; fallback path does not.)
- [x] **Limit max gain based on noise floor** — Track noise floor estimate and cap AGC gain so it never boosts more than `target - noise_floor - 6dB_margin`. Prevents noise amplification even without gate interaction.
- [x] **Tune DynamicsCompressor** — Current compressor threshold is -6dB with 4:1 ratio. Consider -12dB threshold with soft knee of 10dB for more transparent limiting. Current settings can audibly squash loud speech.

### Background Noise Cancellation

- [x] **Integrate RNNoise via WASM** — RNNoise (Xiph.org) is the industry standard open-source ML noise suppression. Runs in ~1ms per 10ms frame, MIT licensed. Compile to WASM and run as a second AudioWorklet processor in the chain before the gate/AGC worklet. Processes 22 frequency bands with a GRU neural network to separate speech from noise.
- [x] **Add noise suppression toggle to Audio Settings** — New setting `nexus_noise_cancellation_enabled` (default: true). Separate from the existing browser-level `noiseSuppression` constraint. Label: "AI Noise Cancellation" with hint "Uses machine learning to remove background noise (keyboard, fans, etc.)"
- [x] **Noise suppression aggressiveness levels** — Offer Low/Medium/High like Zoom. Controls the RNNoise output gain floor (how aggressively it attenuates non-speech bands). Low = more natural but some noise leaks; High = cleaner but can affect voice quality.

### Pipeline Architecture

- [x] **Correct processing order** — Industry standard is: AEC → Noise Suppression → Noise Gate → AGC → Limiter. Current order (highpass → gate → AGC → compressor) is missing the noise suppression stage. When RNNoise is added, insert it between highpass and gate.
- [x] **Adaptive noise floor estimation** — Continuously estimate background noise level using minimum statistics (track the minimum RMS over a sliding 2-5 second window during non-speech frames). Use this to auto-adjust gate threshold and AGC gain ceiling. Eliminates the need for users to manually tune the gate threshold for different environments.

## TODO — Theme Visual Polish

- [x] **Improve theme contrast** — Audited all 12 themes for WCAG AA contrast. Fixed `--text-muted` and `--interactive-muted` across all theme blocks to meet 4.5:1 (normal text) and 3:1 (UI components) contrast ratios.
- [x] **More drastic style differentiation between themes** — Added beveled 3D borders throughout retro (channel items, modals, panels), monospace font extension and dashed borders for terminal, animated neon glow pulse on active channels for neon, shadow-based depth for light theme, warm-tinted shadows for cherry. Each theme now has distinct visual identity beyond color swaps.

## TODO — Theme System Preparation

- [x] **Audit CSS naming consistency** — All CSS files use kebab-case consistently. No changes needed.
- [x] **Consolidate CSS custom properties** — Replaced ~200 hardcoded color values across 15+ component files with semantic CSS variables (`--status-online/idle/dnd/offline`, `--voice-good/fair/poor`, `--badge-danger`, `--overlay-bg/dim`, `--mention-bg/color`, `--code-bg`). Status colors, overlay backgrounds, danger/success indicators now flow through theme-aware variables.
- [x] **Normalize variable naming scheme** — Added semantic naming layer (`--status-*`, `--voice-*`, `--overlay-*`, `--badge-*`, `--mention-*`, `--code-*`) on top of existing `--bg-*`/`--text-*`/`--brand-*` variables. Each theme block overrides semantic vars where needed (e.g., terminal uses green status colors, light theme uses lighter overlays).
- [x] **Extract root variable definitions** — Already centralized in `:root` and `[data-theme]` blocks in `index.css`. Semantic variables added to same location.
- [x] **Identify component-specific overrides** — Refactored StatusDot.js to read CSS variables via getComputedStyle. Replaced inline style hardcoded colors in ChatArea.js and SettingsModal.js with `var()` references. MemberList.css was already using variables (good pattern).

## TODO — Competitive Feature Gaps (High Priority)

- [x] **AutoMod system** — Add `moderation_rules` table with keyword filter, spam detection, and invite filter. Process rules on `message:send` before broadcast. Configurable actions (warn, delete, timeout, ban). UI in server settings. Every competitor has content filtering; Nexus only has rate limiting.
- [ ] **Forum channels** — New channel type `forum` with post-based threads. Each post has a title + initial message. Tags for categorization. Sort by recent activity or creation date. Discord's most successful channel type for communities.
- [x] **Typing indicators** — Add `typing:start` / `typing:stop` socket events. Show "[user] is typing..." in chat footer. Debounce with 3-second timeout. Basic UX expectation in all messaging platforms.

- [x] **Persist call state across reloads** — Save active voice channel ID and server ID to localStorage/sessionStorage on join, clear on leave. On page reload or app relaunch (web, Tauri, Electron — not mobile), automatically rejoin the voice channel the user was in. Handle edge cases: channel deleted while away, user kicked/banned, server removed. Do not apply to Capacitor mobile builds. **Needs testing:** auto-rejoin for DM calls, Tauri/Electron desktop apps, and verify PTT mode persists correctly on mobile (Capacitor should have no persistence).

- [x] **Context menu moderation actions** — Add moderation actions to the user right-click/context menu throughout the app (member list, voice tiles, chat messages). Actions gated by role permissions: **Kick from Voice** (disconnect user from current VC, requires `MOVE_MEMBERS`), **Server Mute** (force-mute in VC, requires `MUTE_MEMBERS`), **Server Deafen** (force-deafen in VC, requires `DEAFEN_MEMBERS`), **Move to Channel** (move user to a different VC, requires `MOVE_MEMBERS`), **Timeout** (temporarily restrict sending messages/joining VC, requires `MODERATE_MEMBERS`, with duration picker: 60s, 5m, 10m, 1h, 1d, 1w), **Kick from Server** (remove from server, can rejoin via invite, requires `KICK_MEMBERS`), **Ban from Server** (permanent removal with optional message purge duration, requires `BAN_MEMBERS`). Add corresponding permissions to role editor UI. Server owner bypasses all permission checks. Ensure all actions are enforced server-side with proper permission validation. Show only actions the current user has permission to perform.

## TODO — Competitive Feature Gaps (Medium Priority)

- [ ] **Scheduled messages** — Store in `scheduled_messages` table with delivery timestamp. Job queue or interval check for reliable delivery. Calendar icon in message input with date/time picker.
- [ ] **Message edit history** — Add `message_edits` table tracking old content + edit timestamp. Show "(edited)" badge on messages. Click to view previous versions. No competitor does this well — opportunity to lead.
- [ ] **Keyboard shortcuts** — Comprehensive shortcut system for navigation, message actions, voice controls. Configurable bindings. Document in a shortcuts modal (Ctrl+/).
- [ ] **Stage channels** — Speaker queue model for town halls, AMAs, presentations. Audience can "raise hand" to request speaking. Moderator approves/denies.
- [ ] **Server onboarding** — Customizable welcome screen for new members. Select roles, read rules, pick channels. Discord's onboarding flow significantly improves new-member experience.

## TODO — End-to-End Encryption

- [x] **E2E encryption for DMs** — Implement Signal Protocol-style encryption for direct messages. Each user generates an X25519 keypair on registration (stored encrypted in localStorage, public key synced to server). DM messages encrypted client-side before sending; server stores only ciphertext. Key exchange on DM channel creation. Decrypt on receive using recipient's private key. Server never sees plaintext. Show lock icon on encrypted conversations. Consider using `libsodium.js` (NaCl) for crypto primitives — well-audited, fast WASM build, simpler than full Signal Protocol for 1:1 DMs.
- [x] **Key backup / recovery** — Allow users to export/import their private key (encrypted with a passphrase). Without this, losing localStorage means losing access to message history. Warn users clearly during setup.
- [x] **Device verification** — Show key fingerprints in user profiles so users can verify they're talking to the right person (no MITM). Similar to Signal's safety numbers.

## TODO — LAN Mode / Offline-Ready

- [x] **Remove Google Fonts dependency** — Download `DM Sans` (weights 300-700) and `Space Grotesk` (weights 400-700) as WOFF2 files. Bundle in `client/public/fonts/`. Add `@font-face` declarations in `index.css`. Remove `<link>` tags from `client/public/index.html`. Remove `fonts.googleapis.com` and `fonts.gstatic.com` from CSP headers in `nginx.conf`, `nginx.dev.conf`, and `client/src-tauri/tauri.conf.json`.
- [x] **Self-hosted STUN/TURN** — Replace default Google STUN servers (`stun.l.google.com`) with a bundled `coturn` container in `docker-compose.yml`. On LAN, WebRTC can often connect without STUN (same subnet), but STUN is needed for NAT traversal across subnets. Coturn handles both STUN and TURN. Add `STUN_URLS=stun:coturn:3478` and `TURN_URL=turn:coturn:3478` to default env.
- [x] **Disable external API calls in LAN mode** — Per-server `lanMode` toggle in server settings. When enabled: hides GIF picker, suppresses URL previews, returns empty ICE servers (direct LAN connections only). Server enforces on `/api/og` and `/api/gifs/*` routes.
- [ ] **Service worker for offline shell** — Register a service worker that caches the app shell (HTML, CSS, JS, fonts, icons) so the client loads even if the server is temporarily unreachable. Not full offline messaging, but prevents blank page on network hiccup.

## TODO — Infrastructure Gaps

- [ ] **Structured logging** — Replace all console.log/error/warn with Winston or Pino. Add log levels, timestamps, request context. Redact sensitive data.
- [ ] **Automated database backups** — Daily pg_dump via sidecar container or cron. Compress with 30-day retention.
- [ ] **SSO/OAuth support** — Add OAuth2 login flow for Google/GitHub. Important for team/org deployments.
- [ ] **Data retention policies** — Configurable per-server message retention. Auto-purge messages older than N days.

## TODO — UI Bugs

- [x] **GIF picker positioning** — GIF popup now renders inside `.chat-input-box` (the positioning context) instead of inside the small button wrapper. Floats above the input bar without displacing layout. Stays within viewport bounds via `max-width: min(420px, calc(100vw - 32px))`.

## TODO — Voice & Audio UX Testing

- [ ] **Manual voice UX test pass** — Execute all 55 test cases in `tests/manual/05-voice-and-soundboard.md` (TC-025 through TC-079). Covers: voice join/leave/presence, mute/deafen state broadcasting, push-to-talk (all platforms), noise gate (attack smoothing, threshold, sidechain filtering, inter-word pauses), AI noise cancellation (RNNoise aggressiveness levels, WASM fallback), AGC (leveler, limiter, VAD-gating, noise floor tracking), audio device selection, per-user volume, mic test meter, screen sharing & stream viewing (start/stop, fullscreen, system audio, late joiners, sharer leaves), voice persistence & auto-rejoin (web/desktop/mobile, expiry, edge cases), DM calls (initiate, decline, persistence), soundboard (playback, targeting, rate limits), speaking indicators, connection quality & reconnection, and combined processing pipeline validation. Requires 2-3 browser windows with different accounts.

## TODO — Accessibility

- [ ] **ARIA labels** — Add aria-label, aria-live, role attributes to all interactive elements. Screen reader announcements for new messages.
- [ ] **Keyboard navigation** — Full keyboard support for context menus, emoji picker, settings modal, channel list. Focus management and tab order.
- [ ] **Reduced motion** — Respect `prefers-reduced-motion` media query. Disable animations for users who need it.

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

- **`deploy.yml`** — Auto-deploys on push to `main`/`master` via self-hosted runner (Docker rebuild + health checks)
- **`dev.yml`** — Manual trigger for pre-release builds (Tauri, Electron, Capacitor)
- **`release.yml`** — Manual trigger for versioned releases (reads version from `client/package.json`)

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

- [ ] **Improve theme contrast** — Audit all 7 themes for sufficient contrast ratios on text/background combinations. Ensure readability meets WCAG AA standards especially for muted text and interactive elements.
- [ ] **More drastic style differentiation between themes** — Current themes only swap CSS variables (colors). Explore WinAmp-level visual differentiation: unique border-radius per theme (sharp corners for retro, rounded for light), distinct shadow styles, different spacing/padding, custom scrollbar styles per theme, unique button shapes. Terminal theme should feel like a real terminal (scanlines, blinking cursor). Retro should have beveled 3D borders throughout, not just in elevation vars.

## TODO — Theme System Preparation

- [ ] **Audit CSS naming consistency** — Review all CSS files across every component. Identify inconsistent naming conventions (camelCase vs kebab-case, abbreviations vs full names) and standardize to a single convention. Document the chosen convention.
- [ ] **Consolidate CSS custom properties** — Audit all hardcoded color values (`#hex`, `rgb()`, `rgba()`) across all stylesheets. Replace with CSS custom properties (`var(--name)`). Ensure every color, spacing, shadow, and border used in the app flows through a centralized set of variables.
- [ ] **Normalize variable naming scheme** — Review existing `--bg-*`, `--text-*`, `--brand-*` variables for completeness and consistency. Establish a semantic naming convention (e.g. `--color-surface-primary`, `--color-text-secondary`, `--color-accent`) that can map to different themes.
- [ ] **Extract root variable definitions** — Move all CSS custom property definitions into a single dedicated file/section (e.g. `:root` block or `theme.css`) so theme switching only needs to swap one set of values.
- [ ] **Identify component-specific overrides** — Find components that define their own colors outside the variable system (inline styles, component-scoped hardcoded values) and refactor them to use the centralized variables.

## TODO — Competitive Feature Gaps (High Priority)

- [ ] **AutoMod system** — Add `moderation_rules` table with keyword filter, spam detection, and invite filter. Process rules on `message:send` before broadcast. Configurable actions (warn, delete, timeout, ban). UI in server settings. Every competitor has content filtering; Nexus only has rate limiting.
- [ ] **Two-factor authentication (2FA)** — TOTP support using `speakeasy` or `otpauth`. QR code setup flow in security settings. Backup codes for recovery. Table-stakes security feature missing from Nexus.
- [ ] **Push-to-talk** — Spacebar hotkey (configurable) to transmit only when pressed. Mute mic track when PTT key released. Setting toggle in Audio Settings.
- [ ] **Forum channels** — New channel type `forum` with post-based threads. Each post has a title + initial message. Tags for categorization. Sort by recent activity or creation date. Discord's most successful channel type for communities.
- [ ] **Typing indicators** — Add `typing:start` / `typing:stop` socket events. Show "[user] is typing..." in chat footer. Debounce with 3-second timeout. Basic UX expectation in all messaging platforms.

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

## TODO — Accessibility

- [ ] **ARIA labels** — Add aria-label, aria-live, role attributes to all interactive elements. Screen reader announcements for new messages.
- [ ] **Keyboard navigation** — Full keyboard support for context menus, emoji picker, settings modal, channel list. Focus management and tab order.
- [ ] **Reduced motion** — Respect `prefers-reduced-motion` media query. Disable animations for users who need it.

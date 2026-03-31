# Global Conventions

## Architecture

- **Real-time layer:** Socket.IO only. All real-time events use Socket.IO. REST is reserved for auth, file uploads, GIF search, and URL previews.
- **Handler pattern:** `server/handlers/*.js` — each file exports `function(io, socket)`. Handlers must NOT import from each other. Shared logic lives in `helpers.js`.
- **DB pattern:** All queries live in `db.js`. Multi-step operations use `getClient()` for explicit transactions. Prefer JOINs via batch query functions to avoid N+1 patterns.
- **State pattern:** Online user state, voice channel membership, and message caches live in `state.js`. Anything in memory is lost on restart — persist if it matters.
- **Permission checks:** Must happen on BOTH client and server side. Server is the authority.

## Event Naming

All Socket.IO events use domain-prefixed names: `message:send`, `channel:create`, `voice:join`, `dm:create`, `friend:request`, `admin:get-servers`, etc.

## REST Routes

REST endpoints are only for: `POST /api/auth/*`, file uploads (`POST /api/user/avatar`, `POST /api/server/:serverId/icon`), `POST /api/webhooks/:webhookId/:token`, `GET /api/gifs/*`, `GET /api/og`, health checks.

## Error Handling

- Socket.IO handlers emit errors back to the client via `socket.emit('error', { message: '...' })`.
- REST routes use standard HTTP status codes with JSON error bodies `{ "error": "..." }`.

## Security Defaults

- bcrypt with 12 rounds for password hashing.
- Helmet.js middleware on all routes.
- CORS whitelist — only `CLIENT_URL` is allowed.
- Input sanitization on ALL user-provided data (see `validation.js`).
- JWT for session auth — required on all Socket.IO connections and authenticated REST routes.
- `PLATFORM_ADMIN` env var designates platform-wide superadmin by username.

## Commit Style

- Imperative mood: "Add feature" not "Added feature"
- Concise description of the change
- Git workflow: `develop` → feature branches → PRs → merge into `develop`. `main` is production only.
- **Never commit directly to `main` or `develop`.**

## Cross-Platform

- Web is primary. Mobile (Capacitor), Desktop Tauri (preferred), Electron (fallback) are secondary.
- `client/src/config.js` auto-detects environment — don't hardcode server URLs.

## Files to Watch (Cross-Cutting Impact)

Changes to these files affect the entire system and require Reviewer, Tester, and SecurityAuditor coverage across all features:

| File | Impact |
|------|--------|
| `server/utils.js` | Permission checking — role hierarchy, channel overrides |
| `server/helpers.js` | Shared utilities used by all handlers |
| `server/db.js` | All queries — N+1 risk, transaction safety |
| `server/state.js` | In-memory state — restart-safe semantics |
| `client/src/App.js` | Root state hub — all global state |
| `client/src/hooks/useWebRTC.js` | Voice/video/screen share — peer connections |

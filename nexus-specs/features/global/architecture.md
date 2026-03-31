# Nexus Architecture

## Deployment Model

```
Internet → Traefik (TLS termination) → Nginx (Port 3000) → Browser (React SPA)
                                      → Express + Socket.IO (Port 3001)
                                            → PostgreSQL (Port 5432)
                                            → Redis (Port 6379, for rate limiting + sessions)
```

Self-hosted via Docker Compose. Operators deploy using:
- `docker-compose.yml` (base) + `docker-compose.prod.yml` (production)
- `docker-compose.yml` + `docker-compose.dev.yml` (development, ports 3002/3003)
- Traefik handles TLS — operators configure their own certs/Let's Encrypt.

## Real-Time Layer

- **Socket.IO** for all real-time communication. Rooms map to channels (by channelId).
- **WebRTC P2P mesh** for voice/video. Signaling goes through Socket.IO. No SFU — all peers connect directly. This limits voice rooms to ~8 participants before quality degrades.
- Screen share state is maintained in-memory in `state.js` (`screenSharers` arrays per channel).
- Voice channel membership tracked in `state.js` (`voiceChannels` map).

## Database

- PostgreSQL 15.
- 9 sequential migrations in `server/migrations/` applied idempotently on container start.
- Max 20 DB pool connections (`db.js`).
- Key tables: `users`, `servers`, `members`, `channels`, `categories`, `messages`, `roles`, `role_members`, `channel_permissions`, `dms`, `dm_participants`, `dm_messages`, `friends`, `blocks`, `reports`, `webhooks`, `custom_emoji`, `audit_log`, `bookmarks`, `message_threads`.
- JSONB columns for: reactions, attachments, permissions, role data.
- UUIDs for user/server IDs (other IDs are integers).

## Authentication

- JWT-based. Token issued on login, validated on every Socket.IO connection and REST request.
- Session token stored in `localStorage` on client. Sent as query param on Socket.IO connect: `io({ query: { token } })`.
- No refresh tokens — token expiry handled by re-login.
- Password hashing: bcrypt 12 rounds.

## In-Memory State (`state.js`)

All state below is lost on server restart:

| Key | Type | Purpose |
|-----|------|---------|
| `users` | Map<socketId, user> | Online users by socket ID |
| `userIdToSocketId` | Map<userId, socketId> | O(1) user→socket lookup |
| `voiceChannels` | Map<channelId, member[]> | Voice channel membership |
| `screenSharers` | per-channel array | Active screen share sessions |

## Security Considerations for Self-Hosting

- JWT_SECRET must be set — if missing in production, server fails fast.
- DATABASE_URL and POSTGRES_PASSWORD must be set.
- CORS whitelist enforced via CLIENT_URL env var. Wildcard CORS is a misconfiguration risk.
- Traefik-based deployments: TLS termination at Traefik. Internal traffic (Traefik→Nginx, Nginx→Express) is unencrypted — acceptable only if all services are on the same host/private network.
- Rate limiting: 10 req/10s on `/api`; webhooks: 10/10s per webhook.
- File uploads: base64 encoded, stored on disk. No virus scanning. Operators should be aware of storage growth.

## CI/CD

- `.github/workflows/deploy-prod.yml` — Auto-deploys on push to `main`/`master`.
- `.github/workflows/deploy-dev.yml` — Auto-deploys on push to `develop`.
- Self-hosted runner on the deployment machine.
- Post-deploy health check via `GET /api/health`.

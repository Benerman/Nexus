# Environment Variables

Complete reference for all Nexus configuration options.

## Required Variables

These must be set for production. The server will refuse to start without them.

| Variable | Description | Example |
|----------|-------------|---------|
| `JWT_SECRET` | Secret key for signing JWT tokens. Must be a long random string. | `openssl rand -base64 64` |
| `DATABASE_URL` | PostgreSQL connection string. Auto-constructed from `POSTGRES_PASSWORD` if not set. | `postgresql://postgres:pass@localhost:5432/nexus_db` |
| `POSTGRES_PASSWORD` | Database password. Used by both the PostgreSQL container and the server. | `your-strong-password` |

## Server Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server listening port |
| `NODE_ENV` | `development` | Environment mode (`development` or `production`) |
| `CLIENT_URL` | `http://localhost:3000` | Frontend URL. Must match the URL users access in their browser. Used for CORS. |
| `ALLOWED_ORIGINS` | — | Additional CORS origins, comma-separated. Optional. |
| `LOG_LEVEL` | `info` | Logging level (`info` or `debug`) |
| `PLATFORM_ADMIN` | — | Username of the platform administrator. Grants access to the Platform Admin tab. |

## Database

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://postgres:{POSTGRES_PASSWORD}@localhost:5432/nexus_db` | Full PostgreSQL connection string |
| `DATABASE_SSL` | `false` | Enable SSL for database connections |
| `POSTGRES_USER` | `postgres` | PostgreSQL username |
| `POSTGRES_PASSWORD` | `postgres` | PostgreSQL password (must change in production) |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string |

## Authentication

| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_SECRET` | `dev-secret-key` | JWT signing secret. **Must change in production.** |
| `SESSION_EXPIRY` | `604800000` (7 days) | Access token expiry in milliseconds |
| `REFRESH_EXPIRY` | `2592000000` (30 days) | Refresh token expiry in milliseconds |
| `ENABLE_GUEST_MODE` | `false` | Allow anonymous guest access |

## Messages & Content

| Variable | Default | Description |
|----------|---------|-------------|
| `MAX_MESSAGE_LENGTH` | `2000` | Maximum message content length in characters |
| `MAX_ATTACHMENTS` | `4` | Maximum attachments per message |
| `MAX_ATTACHMENT_SIZE` | `10485760` (10 MB) | Maximum single attachment size in bytes |
| `GIPHY_API_KEY` | — | Giphy API key. Enables GIF picker in message input. |

## Rate Limiting

| Variable | Default | Description |
|----------|---------|-------------|
| `RATE_LIMIT_MESSAGES` | `10` | Messages allowed per rate limit window |
| `RATE_LIMIT_WINDOW` | `10000` (10s) | Rate limit window in milliseconds |

The global API rate limit is 10 requests per 10 seconds per IP on all `/api` routes.

## Voice & WebRTC

| Variable | Default | Description |
|----------|---------|-------------|
| `STUN_URLS` | `stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302` | Comma-separated STUN server URLs |
| `TURN_URL` | — | TURN relay server URL (e.g., `turn:turn.example.com:3478`) |
| `TURN_SECRET` | — | Shared secret for ephemeral TURN credentials (HMAC-SHA1) |
| `TURN_HOST` | `localhost` | Public hostname/IP for self-hosted coturn |

## Example `.env` File

```bash
# Required
JWT_SECRET=your-random-secret-here
POSTGRES_PASSWORD=strong-database-password

# Server
CLIENT_URL=https://nexus.example.com
PLATFORM_ADMIN=admin_username

# Optional
GIPHY_API_KEY=your-giphy-key
ALLOWED_ORIGINS=https://app.example.com

# Voice (optional — needed for cross-network voice chat)
TURN_URL=turn:turn.example.com:3478
TURN_SECRET=your-turn-secret
```

## Security Notes

- `JWT_SECRET` must **not** be `dev-secret-key` in production — the server will exit.
- `POSTGRES_PASSWORD` should be long and random.
- `CLIENT_URL` must exactly match the domain users access (including `https://`). Mismatches cause CORS errors.
- Database and Redis ports (5432, 6379) should never be exposed to the internet.

## Related

- [Docker Deployment](docker.md) — Container setup
- [Traefik & SSL](traefik-ssl.md) — Reverse proxy configuration
- [STUN/TURN](../audio/stun-turn.md) — Voice server setup
- [Rate Limiting](../security/rate-limiting.md) — Detailed rate limit reference

# Docker Deployment

Nexus uses Docker Compose with a base config and environment-specific overrides.

## Architecture

```
Browser (Port 3000) → Nginx → Express + Socket.IO (Port 3001) → PostgreSQL + Redis
```

Four containers:

| Container | Image | Purpose |
|-----------|-------|---------|
| nexus-prod-client | Nginx + React build | Frontend, static assets, WebSocket proxy |
| nexus-prod-server | Node.js 18 | API, Socket.IO, business logic |
| nexus-prod-postgres | PostgreSQL 15 Alpine | Primary database |
| nexus-prod-redis | Redis 7 Alpine | Session cache, pub/sub |

## Production Deployment

### 1. Configure Environment

```bash
cp .env.example .env
```

Set required variables:

```bash
JWT_SECRET=$(openssl rand -base64 64)
POSTGRES_PASSWORD=your-strong-password
CLIENT_URL=https://nexus.example.com    # Must match user-facing URL
```

See [Environment Variables](environment-variables.md) for the full reference.

### 2. Start Production

```bash
docker compose -p nexus-prod -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Or use the deploy script:

```bash
./deploy.sh    # Pulls latest, rebuilds, restarts with zero downtime
```

### 3. Verify

```bash
# Check all containers are healthy
docker compose -p nexus-prod -f docker-compose.yml -f docker-compose.prod.yml ps

# Check server health
curl http://localhost:3001/health

# View logs
docker compose -p nexus-prod -f docker-compose.yml -f docker-compose.prod.yml logs -f server
```

## Development Deployment

Dev runs alongside production on different ports:

| Service | Production Port | Development Port |
|---------|----------------|-----------------|
| Client | 3000 | 3002 |
| Server | 3001 | 3003 |
| PostgreSQL | 5432 | 5433 |
| Redis | 6379 | 6380 |

```bash
# Start dev
docker compose -p nexus-dev --env-file .env.dev -f docker-compose.yml -f docker-compose.dev.yml up -d --build

# Stop dev
docker compose -p nexus-dev --env-file .env.dev -f docker-compose.yml -f docker-compose.dev.yml down
```

Dev auto-deploys on push to the `develop` branch via CI.

## Database Operations

### Migrations

Migrations run automatically on container startup via `docker-entrypoint.sh`. There are 9 sequential SQL migration files applied idempotently.

To run manually:

```bash
docker exec nexus-prod-server npm run migrate
```

### Database Shell

```bash
docker exec nexus-prod-postgres psql -U postgres -d nexus_db
```

### Backup

```bash
docker exec nexus-prod-postgres pg_dump -U postgres nexus_db > backup_$(date +%Y%m%d_%H%M%S).sql
```

### Restore

```bash
# Stop the server first
docker compose -p nexus-prod -f docker-compose.yml -f docker-compose.prod.yml stop server

# Restore
docker exec -i nexus-prod-postgres psql -U postgres -d nexus_db < backup_file.sql

# Restart
docker compose -p nexus-prod -f docker-compose.yml -f docker-compose.prod.yml start server
```

## Resource Limits

| Container | Memory | CPU |
|-----------|--------|-----|
| PostgreSQL | 2 GB | 2.0 |
| Redis | 256 MB | 0.5 |
| Server | 512 MB | 1.0 |
| Client | 128 MB | 0.5 |

## Health Checks

All containers have health checks configured:

| Service | Check | Interval | Retries |
|---------|-------|----------|---------|
| PostgreSQL | `pg_isready` | 5s | 10 |
| Redis | `redis-cli ping` | 10s | 5 |
| Server | `curl /health` | 10s | 3 |
| Client | Depends on server | — | — |

## Production Security Checklist

- [ ] `JWT_SECRET` set to a long random string (not the default)
- [ ] `POSTGRES_PASSWORD` changed from default
- [ ] `CLIENT_URL` set to your actual domain (with `https://`)
- [ ] Ports 5432 and 6379 **not** exposed externally
- [ ] HTTPS configured via [Traefik](traefik-ssl.md) or another reverse proxy
- [ ] Database backups scheduled
- [ ] Firewall configured to only expose ports 3000/3001 (or 80/443 behind proxy)

## Volumes

Nexus uses three Docker-managed volumes:

| Volume | Purpose |
|--------|---------|
| `postgres-data` | PostgreSQL data files |
| `redis-data` | Redis AOF persistence |
| `server-logs` | Application log files |

## Voice Chat (STUN/TURN)

For voice chat to work across different networks, you need a TURN server. See [STUN/TURN setup](../audio/stun-turn.md) for adding coturn via Docker Compose overlay.

## Related

- [Environment Variables](environment-variables.md) — Full configuration reference
- [Traefik & SSL](traefik-ssl.md) — Reverse proxy with HTTPS
- [Database](database.md) — PostgreSQL details
- [Updating](updating.md) — Version updates

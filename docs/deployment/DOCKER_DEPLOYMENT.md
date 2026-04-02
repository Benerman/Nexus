# Docker Deployment Guide

Nexus runs as four Docker containers managed by Docker Compose. Two named deployments coexist on the same host: **production** (ports 3000/3001) and **dev** (ports 3002/3003).

## Architecture

```
Browser → Nginx (client container) → Express + Socket.IO (server container)
                                                ↓
                                    PostgreSQL + Redis (data containers)
```

---

## Production Deployment

### Quick deploy

```bash
./deploy.sh
```

This pulls the latest code, rebuilds images, and restarts the stack with zero-downtime.

### Manual commands

```bash
# Start / rebuild
docker compose -p nexus-prod -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Stop
docker compose -p nexus-prod -f docker-compose.yml -f docker-compose.prod.yml down

# Logs (all services)
docker compose -p nexus-prod -f docker-compose.yml -f docker-compose.prod.yml logs -f

# Logs (server only)
docker compose -p nexus-prod -f docker-compose.yml -f docker-compose.prod.yml logs -f server
```

### Container names (prod)

| Container | Role | Port |
|-----------|------|------|
| `nexus-prod-client` | Nginx + React build | 3000 → 80 |
| `nexus-prod-server` | Node.js + Socket.IO | 3001 → 3001 |
| `nexus-prod-postgres` | PostgreSQL 15 | internal only |
| `nexus-prod-redis` | Redis 7 | internal only |

---

## Dev Deployment

```bash
# Start / rebuild
docker compose -p nexus-dev --env-file .env.dev -f docker-compose.yml -f docker-compose.dev.yml up -d --build

# Stop
docker compose -p nexus-dev --env-file .env.dev -f docker-compose.yml -f docker-compose.dev.yml down
```

Dev runs on ports **3002** (client) and **3003** (server). CI auto-deploys on push to `develop`.

---

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `JWT_SECRET` | Token signing secret — use a long random string in production |
| `DATABASE_URL` | PostgreSQL connection string |
| `POSTGRES_PASSWORD` | Database password |

### Important optional

| Variable | Default | Description |
|----------|---------|-------------|
| `CLIENT_URL` | `http://localhost:3000` | Allowed CORS origin for the frontend |
| `GIPHY_API_KEY` | — | Enables the GIF picker |
| `PLATFORM_ADMIN` | — | Username that can access the platform admin panel |
| `STUN_URLS` | Google STUN servers | Custom STUN server URLs (comma-separated) |
| `TURN_URL` | — | TURN relay URL (needed for cross-NAT voice) |
| `TURN_SECRET` | — | Shared secret for ephemeral TURN credentials |

Copy `.env.example` (root) and `server/.env.example` for full variable lists.

---

## Common Operations

### View logs

```bash
# Production server logs
docker compose -p nexus-prod -f docker-compose.yml -f docker-compose.prod.yml logs -f server

# Dev server logs
docker compose -p nexus-dev -f docker-compose.yml -f docker-compose.dev.yml logs -f server
```

### Database shell

```bash
# Production
docker exec nexus-prod-postgres psql -U postgres -d nexus_db

# Dev
docker exec nexus-dev-postgres psql -U postgres -d nexus_dev_db
```

Useful psql commands: `\dt` list tables, `\d accounts` describe table, `\q` quit.

### Backup database

```bash
docker exec nexus-prod-postgres pg_dump -U postgres nexus_db > backup_$(date +%Y%m%d_%H%M%S).sql
```

### Restore database

```bash
# Stop server first to avoid conflicts
docker compose -p nexus-prod -f docker-compose.yml -f docker-compose.prod.yml stop server

docker exec -i nexus-prod-postgres psql -U postgres -d nexus_db < backup_20260101_120000.sql

docker compose -p nexus-prod -f docker-compose.yml -f docker-compose.prod.yml start server
```

### Reset database (destructive)

```bash
docker exec nexus-prod-postgres psql -U postgres -c "DROP DATABASE IF EXISTS nexus_db;"
docker exec nexus-prod-postgres psql -U postgres -c "CREATE DATABASE nexus_db;"
# Restart server — migrations run automatically on startup
```

### Check resource usage

```bash
docker stats nexus-prod-server nexus-prod-client nexus-prod-postgres nexus-prod-redis
```

---

## Database Migrations

Migrations run automatically on container startup via `server/docker-entrypoint.sh`. They are idempotent — safe to re-run.

To run manually:

```bash
docker exec nexus-prod-server npm run migrate
```

Migration files live in `server/migrations/` and are numbered sequentially (`001_initial_schema.sql`, `002_...`, etc.).

---

## Troubleshooting

### Server won't start

```bash
docker compose -p nexus-prod -f docker-compose.yml -f docker-compose.prod.yml logs server
```

Common causes:
- **Missing env vars** — `JWT_SECRET` and `DATABASE_URL` are required; server fails fast if missing
- **Database not ready** — healthcheck retries handle this, but check `logs postgres` if it persists
- **Port conflict** — another process on 3001; change port mapping in `docker-compose.prod.yml`

### Client can't reach server

```bash
# Verify nginx config inside container
docker exec nexus-prod-client cat /etc/nginx/conf.d/default.conf

# Check server is reachable from client container
docker exec nexus-prod-client wget -O- http://server:3001/health
```

### Rebuild from scratch (keeps data volumes)

```bash
docker compose -p nexus-prod -f docker-compose.yml -f docker-compose.prod.yml down
docker rmi nexus-prod-server nexus-prod-client
docker compose -p nexus-prod -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

### Rebuild + wipe all data (destructive)

```bash
docker compose -p nexus-prod -f docker-compose.yml -f docker-compose.prod.yml down -v
docker compose -p nexus-prod -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

---

## Production Security Checklist

- [ ] `JWT_SECRET` set to a long random string (`openssl rand -base64 64`)
- [ ] `POSTGRES_PASSWORD` changed from default
- [ ] `CLIENT_URL` set to your actual domain (not `*`)
- [ ] Ports 5432 and 6379 not exposed externally (handled by docker-compose — they're internal only)
- [ ] HTTPS configured (via Traefik — see `TRAEFIK.md`)
- [ ] Automated database backups scheduled

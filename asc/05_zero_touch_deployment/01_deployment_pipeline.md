# Deployment Pipeline

## Overview

```
Push to main ──▶ deploy-prod.yml ──▶ Docker Compose build ──▶ Health checks ──▶ Metrics verify
Push to develop ──▶ deploy-dev.yml ──▶ Docker Compose build ──▶ Health checks ──▶ Metrics verify
```

Both pipelines run on a self-hosted Linux runner with a 15-minute timeout.

## Production Deployment (deploy-prod.yml)

### Trigger
Push to `main` or `master` branch.

### Steps
1. **Checkout** — Clean working directory
2. **Link environment** — Symlink `.env` from `/opt/nexus/.env`
3. **Verify prerequisites** — Docker and Docker Compose available
4. **Stop containers** — `docker compose -p nexus-prod ... down`
5. **Build and start** — `docker compose -p nexus-prod ... up -d --build`
6. **Sync DB password** — Update PostgreSQL password from .env
7. **Server health** — Poll `GET /api/health` on port 3001 (20 attempts × 5s = 100s max)
8. **Client health** — Poll `GET /` on port 3000 (10 attempts × 3s = 30s max)
9. **Metrics verification** — Verify `/api/metrics` returns valid data
10. **Cleanup** — Remove old Docker images

### Ports
- Client: 3000
- Server: 3001
- PostgreSQL: 5432
- Redis: 6379

## Development Deployment (deploy-dev.yml)

### Trigger
Push to `develop`, merged PR to develop, or manual dispatch.

### Safety Checks
- Skip unmerged PRs
- Verify production is running before starting
- Re-verify production health after dev deploy completes

### Steps
Same as production with additional safety checks. Uses separate project name (`nexus-dev`) and ports.

### Ports
- Client: 3002
- Server: 3003
- PostgreSQL: 5433
- Redis: 6380

## Manual Deployment

```bash
# Production
./deploy.sh          # or ./start.sh

# Or directly:
docker compose -p nexus-prod -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

## Deployment Artifacts

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Base service definitions |
| `docker-compose.prod.yml` | Production overrides (ports, restart policies) |
| `docker-compose.dev.yml` | Development overrides (dev ports, volumes) |
| `.env` / `.env.dev` | Environment variables (not in repo) |
| `deploy.sh` / `start.sh` | Manual deployment scripts |
| `server/docker-entrypoint.sh` | Container startup (migrations, server start) |

# Database

Nexus uses PostgreSQL 15 as its primary database.

## Connection

Default connection parameters:

| Parameter | Default |
|-----------|---------|
| Host | `localhost` (or `postgres` inside Docker) |
| Port | `5432` (prod), `5433` (dev) |
| Database | `nexus_db` |
| User | `postgres` |
| Max connections | 20 |
| Idle timeout | 30,000 ms |
| Connection timeout | 2,000 ms |

Configure via the `DATABASE_URL` environment variable:

```
postgresql://postgres:password@localhost:5432/nexus_db
```

Enable SSL with `DATABASE_SSL=true`.

## Migrations

Nexus has 9 sequential SQL migration files in `server/migrations/`. Migrations run automatically on container startup via `docker-entrypoint.sh` and are idempotent (safe to re-run).

To run manually:

```bash
docker exec nexus-prod-server npm run migrate
```

### Migration Rules

- Migrations must be **additive-safe** — existing data must survive
- New migrations are sequential (numbered files)
- Applied idempotently using `IF NOT EXISTS` / `CREATE OR REPLACE` patterns

## Schema Overview

16+ tables with UUIDs for account IDs, JSONB columns for flexible data (reactions, attachments, permissions, roles), foreign keys with `ON DELETE CASCADE`, and indexes on frequently queried fields.

Key tables: `accounts`, `servers`, `channels`, `messages`, `roles`, `dm_channels`, `dm_messages`, `tokens`, `invites`, `bans`, `timeouts`, `friendships`, `webhooks`, `custom_emoji`, `audit_logs`.

See [Database Schema](../api-reference/database-schema.md) for the full reference.

## Backups

### Manual Backup

```bash
docker exec nexus-prod-postgres pg_dump -U postgres nexus_db > backup_$(date +%Y%m%d_%H%M%S).sql
```

### Restore from Backup

```bash
# Stop the server first to prevent writes
docker compose -p nexus-prod -f docker-compose.yml -f docker-compose.prod.yml stop server

# Restore
docker exec -i nexus-prod-postgres psql -U postgres -d nexus_db < backup_file.sql

# Restart
docker compose -p nexus-prod -f docker-compose.yml -f docker-compose.prod.yml start server
```

### Automated Backups

Consider setting up daily pg_dump via a cron job or sidecar container with 30-day retention. Compress backups with gzip:

```bash
docker exec nexus-prod-postgres pg_dump -U postgres nexus_db | gzip > backup_$(date +%Y%m%d).sql.gz
```

## Database Shell

```bash
docker exec nexus-prod-postgres psql -U postgres -d nexus_db
```

## Performance

- Connection pool: max 20 clients
- Slow query logging: queries over 100ms are logged in development
- Batch queries with JOINs are used to avoid N+1 patterns

## Data Volumes

PostgreSQL data is stored in the `postgres-data` Docker volume. This volume persists across container restarts and rebuilds.

## Related

- [Docker Deployment](docker.md) — Container setup
- [Environment Variables](environment-variables.md) — Database configuration
- [Database Schema](../api-reference/database-schema.md) — Full schema reference

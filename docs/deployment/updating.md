# Updating Nexus

## Quick Update (Production)

The deploy script handles pulling, rebuilding, and restarting:

```bash
./deploy.sh
```

This pulls the latest code, rebuilds Docker images, and performs a zero-downtime restart.

## Manual Update

```bash
# Pull latest code
git pull origin main

# Rebuild and restart
docker compose -p nexus-prod -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

## Database Migrations

Migrations run automatically on container startup. If a new version includes schema changes, they are applied when the server container starts.

To run migrations manually:

```bash
docker exec nexus-prod-server npm run migrate
```

## Backup Before Updating

Always backup your database before updating to a new version:

```bash
docker exec nexus-prod-postgres pg_dump -U postgres nexus_db > backup_before_update_$(date +%Y%m%d).sql
```

## Rollback

If an update causes issues:

1. Stop the current containers
2. Check out the previous version: `git checkout v{previous-version}`
3. Restore the database backup if needed
4. Rebuild: `docker compose -p nexus-prod -f docker-compose.yml -f docker-compose.prod.yml up -d --build`

## Version Locations

When releasing a new version, update these files:

| File | Field |
|------|-------|
| `client/package.json` | `"version"` |
| `client/src-tauri/tauri.conf.json` | `"version"` |
| `README.md` | Download badge and footer version |

Then run `npm install` in `client/` to sync `package-lock.json`.

## Related

- [Docker Deployment](docker.md) — Container setup
- [Database](database.md) — Backup and restore

# Rollback Procedures

## Quick Rollback (Git Revert + Redeploy)

The fastest rollback for a bad deployment:

```bash
# 1. Identify the bad commit
git log --oneline -5

# 2. Revert the commit on main
git revert <bad-commit-sha>
git push origin main

# 3. deploy-prod.yml triggers automatically
# Wait for CI to complete and verify health
```

**Time to recovery**: ~3-5 minutes (build + health check)

## Manual Container Rollback

If CI is unavailable or the revert approach isn't suitable:

```bash
# 1. Stop current containers
docker compose -p nexus-prod -f docker-compose.yml -f docker-compose.prod.yml down

# 2. Checkout the last known good commit
git checkout <good-commit-sha>

# 3. Rebuild and start
docker compose -p nexus-prod -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# 4. Verify health
curl http://localhost:3001/api/health
curl http://localhost:3000/
```

## Database Rollback

Migrations are applied sequentially and idempotently on startup. There is no automated migration rollback.

### If a migration caused issues:
1. Stop the server container
2. Connect to PostgreSQL directly:
   ```bash
   docker exec nexus-postgres psql -U postgres -d nexus_db
   ```
3. Manually reverse the migration SQL
4. Restart the server container

### Prevention:
- Test migrations on dev instance first
- Back up the database before deploying schema changes:
  ```bash
  docker exec nexus-postgres pg_dump -U postgres nexus_db > backup_$(date +%Y%m%d).sql
  ```

## Rollback Decision Matrix

| Symptom | Action |
|---------|--------|
| Server returns 500s | Check logs first → if code regression, git revert |
| Client blank page | Check nginx logs → if build issue, redeploy previous commit |
| Database errors | Check migration status → manual SQL fix if needed |
| High memory usage | Restart server container → investigate leak if recurring |
| WebSocket failures | Check nginx config → restart server if config unchanged |

## Post-Rollback Verification

After any rollback:
1. `curl http://localhost:3001/api/health` returns 200
2. `curl http://localhost:3000/` returns HTML
3. `curl http://localhost:3001/api/metrics` returns valid JSON with connections > 0 (after users reconnect)
4. Check Docker logs: `docker compose -p nexus-prod ... logs -f server --tail=50`

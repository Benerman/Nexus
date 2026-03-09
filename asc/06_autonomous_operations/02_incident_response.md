# Incident Response Playbooks

## INC-001: Server Unresponsive

**Symptoms**: Health endpoint not responding, users disconnected, blank client page

**Diagnosis**:
```bash
# 1. Check container status
docker compose -p nexus-prod ps

# 2. Check server logs for crash
docker compose -p nexus-prod -f docker-compose.yml -f docker-compose.prod.yml logs --tail=100 server

# 3. Check container resource usage
docker stats nexus-server --no-stream
```

**Resolution**:
```bash
# Restart server container only (preserves DB/Redis)
docker compose -p nexus-prod -f docker-compose.yml -f docker-compose.prod.yml restart server

# If restart fails, full rebuild
docker compose -p nexus-prod -f docker-compose.yml -f docker-compose.prod.yml up -d --build server
```

**Verify**: `curl http://localhost:3001/api/health`

---

## INC-002: Database Connection Failures

**Symptoms**: Server logs show "Connection refused" or "too many clients", API returns 500s

**Diagnosis**:
```bash
# 1. Check PostgreSQL container
docker exec nexus-postgres pg_isready

# 2. Check active connections (pool max is 20)
docker exec nexus-postgres psql -U postgres -d nexus_db -c "SELECT count(*) FROM pg_stat_activity;"

# 3. Check for long-running queries
docker exec nexus-postgres psql -U postgres -d nexus_db -c "SELECT pid, now() - pg_stat_activity.query_start AS duration, query FROM pg_stat_activity WHERE state != 'idle' ORDER BY duration DESC LIMIT 5;"
```

**Resolution**:
```bash
# If pool exhaustion, restart server to release connections
docker compose -p nexus-prod -f docker-compose.yml -f docker-compose.prod.yml restart server

# If PostgreSQL unresponsive, restart it (causes brief outage)
docker compose -p nexus-prod -f docker-compose.yml -f docker-compose.prod.yml restart postgres

# If data corruption suspected, restore from backup
docker exec nexus-postgres psql -U postgres -d nexus_db < backup_YYYYMMDD.sql
```

**Prevention**: Monitor connection count via `/api/metrics`

---

## INC-003: Redis Connection Failures

**Symptoms**: Session creation fails, login issues, server logs show Redis connection errors

**Diagnosis**:
```bash
# 1. Check Redis container
docker exec nexus-redis redis-cli ping
# Expected: PONG

# 2. Check memory usage
docker exec nexus-redis redis-cli info memory

# 3. Check if maxmemory reached
docker exec nexus-redis redis-cli config get maxmemory
```

**Resolution**:
```bash
# Restart Redis (sessions will be invalidated — users must re-login)
docker compose -p nexus-prod -f docker-compose.yml -f docker-compose.prod.yml restart redis

# Then restart server to reconnect
docker compose -p nexus-prod -f docker-compose.yml -f docker-compose.prod.yml restart server
```

**Impact**: All active sessions invalidated. Users must log in again.

---

## INC-004: High Memory Usage

**Symptoms**: Slow responses, OOM kills, metrics show memory > 512MB

**Diagnosis**:
```bash
# 1. Check container memory
docker stats nexus-server --no-stream

# 2. Check metrics endpoint
curl http://localhost:3001/api/metrics | jq '.system'

# 3. Check Node.js heap
docker exec nexus-server node -e "console.log(process.memoryUsage())"
```

**Likely causes**:
- `state.messages` cache growing unbounded (most common)
- Large number of concurrent voice connections
- Memory leak in socket handlers

**Resolution**:
```bash
# Restart server (clears in-memory state; clients reconnect)
docker compose -p nexus-prod -f docker-compose.yml -f docker-compose.prod.yml restart server
```

**Prevention**: Monitor memory via metrics endpoint. Implement message cache eviction if recurring.

---

## INC-005: Deployment Failure

**Symptoms**: CI workflow fails, containers won't start, health checks fail after deploy

**Diagnosis**:
```bash
# 1. Check CI workflow logs in GitHub Actions

# 2. Check Docker build errors
docker compose -p nexus-prod -f docker-compose.yml -f docker-compose.prod.yml logs --tail=50

# 3. Check if port is already in use
lsof -i :3001
```

**Resolution**:
```bash
# Option A: Git revert and redeploy
git revert HEAD
git push origin main
# CI auto-deploys the revert

# Option B: Manual rollback to previous commit
git checkout HEAD~1
docker compose -p nexus-prod -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

See `asc/05_zero_touch_deployment/02_rollback_procedures.md` for full rollback steps.

---

## INC-006: WebSocket Storm / Connection Flood

**Symptoms**: CPU spike, thousands of connections in metrics, server sluggish

**Diagnosis**:
```bash
# 1. Check connection count
curl http://localhost:3001/api/metrics | jq '.connections'

# 2. Check for reconnection loops in server logs
docker compose -p nexus-prod -f docker-compose.yml -f docker-compose.prod.yml logs --tail=200 server | grep -c "connection"

# 3. Check rate limiting
docker compose -p nexus-prod -f docker-compose.yml -f docker-compose.prod.yml logs server | grep "rate limit"
```

**Resolution**:
```bash
# 1. If from a specific IP, block at nginx level
# Add to nginx.conf: deny <IP>;

# 2. Restart to clear all connections
docker compose -p nexus-prod -f docker-compose.yml -f docker-compose.prod.yml restart server

# 3. If persistent, add connection rate limiting to nginx:
# limit_conn_zone $binary_remote_addr zone=ws:10m;
# limit_conn ws 10;
```

**Prevention**: Monitor connection count and rate via metrics. Set up nginx connection limits.

---

## Escalation Path

1. **Self-resolve**: Use playbook above
2. **Check logs**: `docker compose logs` + Winston log files in `server/logs/`
3. **Check metrics**: `/api/metrics` for system state
4. **Database access**: Direct PostgreSQL access for data issues
5. **Full restart**: `docker compose down && docker compose up -d --build`

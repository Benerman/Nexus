# Post-Deploy Checklist

## Automated Checks (CI Pipeline)

These run automatically after every deployment:

- [ ] Server health: `GET /api/health` returns 200 (port 3001)
- [ ] Client health: `GET /` returns 200 (port 3000)
- [ ] Metrics collecting: `GET /api/metrics` returns valid JSON
- [ ] Deployment event logged with version, commit SHA, timestamp

## Manual Smoke Test (Production Releases)

Perform after deploying to production for significant changes:

### Core Functionality
- [ ] Login with existing account
- [ ] Send a text message in a channel
- [ ] Message appears in real-time for other users
- [ ] Join a voice channel (audio works)
- [ ] Open DM conversation

### Infrastructure
- [ ] Docker containers all running: `docker compose -p nexus-prod ps`
- [ ] No error-level logs in last 2 minutes: `docker compose -p nexus-prod logs --tail=50 server`
- [ ] PostgreSQL accepting connections: `docker exec nexus-postgres pg_isready`
- [ ] Redis responding: `docker exec nexus-redis redis-cli ping`

### Metrics
- [ ] Connection count matches expected users
- [ ] Error count is 0 or stable (not climbing)
- [ ] Memory usage within expected range (<512MB)
- [ ] Uptime counter is low (just deployed)

## Dev Deploy Additional Checks

After deploying to dev environment:

- [ ] Production remains healthy (re-verified by deploy-dev.yml)
- [ ] Dev instance accessible on port 3002 (client) / 3003 (server)
- [ ] No port conflicts with production

## Failure Response

If any check fails:
1. Check container logs: `docker compose -p nexus-prod logs -f server --tail=100`
2. Check container status: `docker compose -p nexus-prod ps`
3. If server unhealthy: See `asc/06_autonomous_operations/02_incident_response.md`
4. If persistent failure: Rollback per `asc/05_zero_touch_deployment/02_rollback_procedures.md`

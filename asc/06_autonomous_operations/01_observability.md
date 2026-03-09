# Observability

## Logging (Winston)

### Configuration
- **Logger**: Winston with domain-based structured logging (`server/logger.js`)
- **Console transport**: Human-readable with `[Domain]` prefix for Docker log viewing
- **Combined file**: JSON format, daily rotation, 14-day retention, gzip compression
- **Error file**: Error-level only, daily rotation, 14-day retention
- **Log level**: Configurable via `LOG_LEVEL` env var (default: `info`)

### Domain Prefixes
Messages are tagged with semantic domains for filtering:
- `[Auth]` — Authentication events
- `[Voice]` — WebRTC signaling, voice join/leave
- `[Message]` — Message operations
- `[Server]` — Server CRUD
- `[DB]` — Database queries and errors
- `[WebSocket]` — Connection events

### Viewing Logs
```bash
# Real-time Docker logs
docker compose -p nexus-prod -f docker-compose.yml -f docker-compose.prod.yml logs -f server

# Filter by domain
docker compose -p nexus-prod logs server | grep "\[Auth\]"

# Error logs only (file)
# Located in server/logs/error-YYYY-MM-DD.log
```

## Metrics (server/metrics.js)

### Endpoint
`GET /api/metrics` — Protected by admin authentication.

### Collected Metrics

| Category | Metric | Type |
|----------|--------|------|
| Connections | Current active | Gauge |
| Connections | Peak since startup | High watermark |
| Messages | Total sent | Counter |
| Messages | Rate (1m/5m/15m) | Rolling average |
| API | Total requests | Counter |
| API | Rate (1m/5m/15m) | Rolling average |
| API | Error count | Counter |
| API | Errors by type | Counter map |
| System | Memory (RSS, heap) | Gauge |
| System | Uptime | Counter |
| System | CPU usage | Gauge |

### Rolling Windows
Rate calculations use sliding windows:
- **1 minute**: Real-time spike detection
- **5 minutes**: Short-term trend analysis
- **15 minutes**: Baseline comparison

### Integration Points
- Socket.IO `connection`/`disconnect` → connection counter
- `message:send` handler → message counter
- Express middleware → API request counter
- Error handlers → error counter with type classification

## Health Checks

| Endpoint | Purpose | Response |
|----------|---------|----------|
| `GET /health` | Server process alive | 200 OK |
| `GET /api/health` | API layer functional | 200 OK |
| `GET /api/metrics` | Full system metrics | JSON payload |

## Alerting

Currently manual — operators monitor via:
1. Docker logs (real-time or rotated files)
2. Metrics endpoint (poll or browser check)
3. Health endpoint monitoring (external or CI-based)

Future: Integrate with webhook-based alerting (PagerDuty, Discord webhook, email).

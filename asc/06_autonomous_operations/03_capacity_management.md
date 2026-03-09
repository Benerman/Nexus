# Capacity Management

## Current Resource Profile

### Server Container
| Resource | Expected | Limit (recommended) |
|----------|----------|-------------------|
| Memory | 200-400MB typical | 1GB |
| CPU | Low (<10% idle) | 2 cores |
| Disk | Logs + uploads | 10GB |

### PostgreSQL Container
| Resource | Expected | Limit (recommended) |
|----------|----------|-------------------|
| Memory | 100-256MB | 512MB |
| CPU | Low | 1 core |
| Disk | Database files | 20GB (depends on message volume) |
| Connections | Up to 20 (pool max) | 100 (PostgreSQL default) |

### Redis Container
| Resource | Expected | Limit (recommended) |
|----------|----------|-------------------|
| Memory | 50-100MB | 256MB |
| CPU | Minimal | 0.5 core |
| Disk | Minimal (session data) | 1GB |

### Nginx Container
| Resource | Expected | Limit (recommended) |
|----------|----------|-------------------|
| Memory | 20-50MB | 128MB |
| CPU | Minimal | 0.5 core |

### Coturn Container
| Resource | Expected | Limit (recommended) |
|----------|----------|-------------------|
| Memory | 50-100MB | 256MB |
| CPU | Low-Medium (relay traffic) | 1 core |
| Network | Depends on voice users | Scales with concurrent calls |

## Scaling Guidelines

### Vertical Scaling (Current Architecture)

The single-server architecture scales vertically:

| Users | Recommended Server | Notes |
|-------|-------------------|-------|
| 1-50 | 2 CPU, 4GB RAM | Comfortable for most self-hosted |
| 50-200 | 4 CPU, 8GB RAM | Monitor memory for message cache |
| 200-500 | 8 CPU, 16GB RAM | May need PostgreSQL tuning |
| 500+ | Consider architecture changes | P2P WebRTC degrades; SFU needed |

### Bottleneck Order
1. **WebRTC P2P** — Degrades at 8+ users per voice channel (no SFU)
2. **In-memory state** — Memory grows linearly with users and cached messages
3. **PostgreSQL pool** — 20 connections may bottleneck under heavy write load
4. **Single-threaded Node.js** — CPU-bound operations (bcrypt, serialization) block event loop

### Docker Resource Limits

Add to `docker-compose.prod.yml` when needed:
```yaml
services:
  server:
    deploy:
      resources:
        limits:
          memory: 1G
          cpus: '2.0'
  postgres:
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '1.0'
```

## Growth Indicators

Monitor these metrics to anticipate capacity needs:

| Metric | Warning Threshold | Action |
|--------|-------------------|--------|
| Memory usage | >75% of limit | Investigate cache size, consider restart |
| Connection count | >200 concurrent | Monitor for degradation |
| Message rate (1m) | >100/min sustained | Check DB write performance |
| API error rate | >1% of requests | Investigate error types |
| PostgreSQL connections | >15 active (of 20 pool) | Consider increasing pool size |
| Disk usage | >80% | Clean logs, archive old data |

## Backup Strategy

Currently manual. Recommended automation:

```bash
# Daily database backup
docker exec nexus-postgres pg_dump -U postgres nexus_db | gzip > /backups/nexus_$(date +%Y%m%d).sql.gz

# Retention: 30 days
find /backups/ -name "nexus_*.sql.gz" -mtime +30 -delete
```

Future: Automated backup via sidecar container or cron job (see CLAUDE.md TODO).

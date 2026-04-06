# Redis

Nexus uses Redis 7 for session caching and pub/sub.

## Configuration

| Parameter | Default |
|-----------|---------|
| Image | redis:7-alpine |
| Port | 6379 (prod), 6380 (dev) |
| Persistence | AOF (append-only file) |
| Memory limit | 256 MB |
| CPU limit | 0.5 |

Configure via the `REDIS_URL` environment variable:

```
redis://localhost:6379
```

## Persistence

Redis is configured with `--appendonly yes` for AOF persistence. Data is stored in the `redis-data` Docker volume.

## Health Check

Redis health is monitored with `redis-cli ping` at 10-second intervals with 5 retries.

## Security

Redis is not exposed externally — it's only accessible within the Docker network. Do not expose port 6379 to the internet.

## Related

- [Docker Deployment](docker.md) — Container setup
- [Environment Variables](environment-variables.md) — Redis configuration

# Metrics

Nexus exposes a metrics endpoint for monitoring.

## Endpoint

```
GET /api/metrics
```

Requires platform admin authentication.

## Available Metrics

| Metric | Description |
|--------|-------------|
| Connection counts | Active Socket.IO connections |
| Message rates | Messages sent per time period |
| API request rates | HTTP API requests per time period |
| Error counts | Server-side errors |
| System stats | Memory, CPU, uptime |

## Usage

Access the metrics endpoint via the Platform Admin panel or directly:

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" https://nexus.example.com/api/metrics
```

## Monitoring Integration

Use the metrics endpoint with external monitoring tools (Grafana, Prometheus exporters, uptime monitors) to track the health of your Nexus instance.

## Related

- [Overview](overview.md) — Platform admin setup
- [Docker Deployment](../deployment/docker.md) — Health checks

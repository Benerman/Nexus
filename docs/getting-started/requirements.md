# System Requirements

## Minimum Requirements

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| RAM | 2 GB | 4 GB |
| CPU | 2 cores | 4 cores |
| Disk | 5 GB | 20 GB+ |
| Docker | 20.10+ | Latest |
| Docker Compose | v2.0+ | Latest |

## Container Resource Allocation

Nexus runs four containers with these resource limits:

| Container | Memory Limit | CPU Limit |
|-----------|-------------|-----------|
| PostgreSQL 15 | 2 GB | 2.0 |
| Redis 7 | 256 MB | 0.5 |
| Server (Node.js) | 512 MB | 1.0 |
| Client (Nginx) | 128 MB | 0.5 |

## Network Requirements

- **Port 3000** — Client (HTTP/WebSocket)
- **Port 3001** — Server (API/Socket.IO)
- **Ports 5432, 6379** — Database and cache (internal only, do not expose)

For voice chat across different networks, you also need:
- **Port 3478** (UDP+TCP) — STUN/TURN signaling
- **Ports 49152–49252** (UDP) — Media relay

See [STUN/TURN setup](../audio/stun-turn.md) for details.

## Browser Support

Nexus works in any modern browser with WebRTC support:

- Chrome / Chromium 80+
- Firefox 78+
- Safari 14.1+
- Edge 80+

## Optional Requirements

- **Domain name** — Required for HTTPS (recommended for production)
- **Giphy API key** — Enables GIF picker in message input
- **TURN server** — Required for voice chat when users are behind restrictive NATs or firewalls

# Traefik & SSL

Set up Traefik as a reverse proxy with automatic HTTPS for Nexus.

## Overview

Traefik handles TLS termination, routes traffic to the correct container, and manages Let's Encrypt certificates automatically.

Two deployment options:
- **Option A:** Traefik on the same host as Nexus (Docker labels)
- **Option B:** Traefik on a separate machine (file provider)

## Option A: Same Host (Docker Labels)

Add Traefik labels to your `docker-compose.prod.yml` override:

### Client Service Labels

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.nexus-client.rule=Host(`nexus.example.com`)"
  - "traefik.http.routers.nexus-client.entrypoints=websecure"
  - "traefik.http.routers.nexus-client.tls.certresolver=letsencrypt"
  - "traefik.http.routers.nexus-client.priority=1"
  - "traefik.http.services.nexus-client.loadbalancer.server.port=80"
```

### Server Service Labels

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.nexus-api.rule=Host(`nexus.example.com`) && (PathPrefix(`/socket.io`) || PathPrefix(`/api`))"
  - "traefik.http.routers.nexus-api.entrypoints=websecure"
  - "traefik.http.routers.nexus-api.tls.certresolver=letsencrypt"
  - "traefik.http.routers.nexus-api.priority=10"
  - "traefik.http.services.nexus-api.loadbalancer.server.port=3001"
  - "traefik.http.services.nexus-api.loadbalancer.sticky.cookie=true"
  - "traefik.http.services.nexus-api.loadbalancer.sticky.cookie.name=nexus_sticky_lb"
  - "traefik.http.services.nexus-api.loadbalancer.sticky.cookie.secure=true"
  - "traefik.http.services.nexus-api.loadbalancer.sticky.cookie.httpOnly=true"
```

### Key Settings

- **Priority:** API router (10) takes precedence over client catch-all (1)
- **Sticky sessions:** Required for Socket.IO — the WebSocket connection must stay on the same backend
- **WebSocket headers:** Add middleware for `X-Forwarded-Proto: https` and `X-Forwarded-Host`

## Option B: Separate Machine (File Provider)

### On the Nexus Server

```bash
# .env
CLIENT_URL=https://nexus.example.com
```

Firewall ports 3000 and 3001 to accept connections only from the Traefik server's IP.

### On the Traefik Server

Create `/etc/traefik/dynamic/nexus.yml`:

```yaml
http:
  routers:
    nexus-api:
      rule: "Host(`nexus.example.com`) && (PathPrefix(`/socket.io`) || PathPrefix(`/api`))"
      service: nexus-api
      entryPoints: [websecure]
      tls:
        certResolver: letsencrypt
      priority: 10

    nexus-client:
      rule: "Host(`nexus.example.com`)"
      service: nexus-client
      entryPoints: [websecure]
      tls:
        certResolver: letsencrypt
      priority: 1

  services:
    nexus-api:
      loadBalancer:
        servers:
          - url: "http://nexus-server-ip:3001"
        sticky:
          cookie:
            name: nexus_sticky_lb
            secure: true
            httpOnly: true
        healthCheck:
          path: /health
          interval: 10s
          timeout: 3s

    nexus-client:
      loadBalancer:
        servers:
          - url: "http://nexus-server-ip:3000"
        healthCheck:
          path: /
          interval: 30s
          timeout: 5s
```

## Traefik Static Configuration

```yaml
# traefik.yml
entryPoints:
  web:
    address: ":80"
    http:
      redirections:
        entryPoint:
          to: websecure
          scheme: https
  websecure:
    address: ":443"

certificatesResolvers:
  letsencrypt:
    acme:
      email: admin@example.com
      storage: /letsencrypt/acme.json
      httpChallenge:
        entryPoint: web

providers:
  docker:
    network: traefik-public
    exposedByDefault: false
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| 502 Bad Gateway | Check containers are running. Test direct access to port 3001. Check Traefik logs. |
| WebSocket falls back to polling | Verify sticky sessions enabled, WebSocket headers applied, HTTPS active. |
| SSL certificate not issued | Check DNS points to Traefik IP. Verify ACME logs. |
| CORS errors | Verify `CLIENT_URL` matches your domain exactly (including `https://`). |

## Port Reference

| Service | Production | Development |
|---------|-----------|-------------|
| Client (Nginx) | 3000 | 3002 |
| Server (Node.js) | 3001 | 3003 |
| PostgreSQL | 5432 (localhost only) | 5433 |
| Redis | 6379 (localhost only) | 6380 |

## Related

- [Docker Deployment](docker.md) — Container setup
- [Nginx Configuration](nginx.md) — Nginx reference
- [Environment Variables](environment-variables.md) — Configuration

# Traefik Reverse Proxy

Nexus is designed to run behind Traefik, which handles SSL termination, HTTP→HTTPS redirects, and WebSocket proxying. Traefik can run on the same host as Nexus or on a separate machine.

## Prerequisites

- Traefik v2.x or v3.x running with a `traefik-public` Docker network
- Let's Encrypt configured for SSL
- Domain pointing to your Traefik server

---

## Option A: Traefik on the Same Host (Docker Labels)

Add these labels to the `client` and `server` services in `docker-compose.prod.yml`:

```yaml
services:
  server:
    networks:
      - nexus-internal
      - traefik-public
    labels:
      - "traefik.enable=true"
      - "traefik.docker.network=traefik-public"
      # Socket.IO and API — higher priority
      - "traefik.http.routers.nexus-api.rule=Host(`nexus.example.com`) && PathPrefix(`/socket.io`, `/api`)"
      - "traefik.http.routers.nexus-api.entrypoints=websecure"
      - "traefik.http.routers.nexus-api.tls.certresolver=letsencrypt"
      - "traefik.http.routers.nexus-api.priority=10"
      - "traefik.http.routers.nexus-api.middlewares=nexus-websocket-headers"
      - "traefik.http.services.nexus-api.loadbalancer.server.port=3001"
      - "traefik.http.services.nexus-api.loadbalancer.sticky.cookie=true"
      - "traefik.http.services.nexus-api.loadbalancer.sticky.cookie.name=nexus_sticky_lb"
      - "traefik.http.services.nexus-api.loadbalancer.sticky.cookie.secure=true"
      - "traefik.http.services.nexus-api.loadbalancer.sticky.cookie.httpOnly=true"
      # WebSocket headers middleware
      - "traefik.http.middlewares.nexus-websocket-headers.headers.customrequestheaders.X-Forwarded-Proto=https"
      - "traefik.http.middlewares.nexus-websocket-headers.headers.customrequestheaders.X-Forwarded-Host=nexus.example.com"

  client:
    networks:
      - nexus-internal
      - traefik-public
    labels:
      - "traefik.enable=true"
      - "traefik.docker.network=traefik-public"
      # Frontend — lower priority (catches everything else)
      - "traefik.http.routers.nexus-client.rule=Host(`nexus.example.com`)"
      - "traefik.http.routers.nexus-client.entrypoints=websecure"
      - "traefik.http.routers.nexus-client.tls.certresolver=letsencrypt"
      - "traefik.http.routers.nexus-client.priority=1"
      - "traefik.http.services.nexus-client.loadbalancer.server.port=80"

networks:
  nexus-internal:
    driver: bridge
  traefik-public:
    external: true
```

---

## Option B: Traefik on a Separate Machine (File Provider)

When Traefik runs on a different server, use the file provider with static service URLs.

### 1. On the Nexus server

Set `CLIENT_URL` to your domain in your `.env`:

```env
CLIENT_URL=https://nexus.example.com
NODE_ENV=production
```

Ensure ports 3000 and 3001 are reachable from the Traefik server (and blocked from the internet):

```bash
# Allow Traefik IP only
sudo ufw allow from TRAEFIK_IP to any port 3000
sudo ufw allow from TRAEFIK_IP to any port 3001
sudo ufw deny 3000
sudo ufw deny 3001
```

### 2. On the Traefik server

Create `/etc/traefik/dynamic/nexus.yml` (replace `YOUR_IP` and `nexus.example.com`):

```yaml
http:
  routers:
    nexus-api:
      rule: "Host(`nexus.example.com`) && PathPrefix(`/socket.io`, `/api`)"
      entrypoints: [websecure]
      tls:
        certResolver: letsencrypt
      service: nexus-api-service
      middlewares: [nexus-websocket-headers]
      priority: 10

    nexus-client:
      rule: "Host(`nexus.example.com`)"
      entrypoints: [websecure]
      tls:
        certResolver: letsencrypt
      service: nexus-client-service
      priority: 1

  services:
    nexus-api-service:
      loadBalancer:
        servers:
          - url: "http://YOUR_IP:3001"
        sticky:
          cookie:
            name: nexus_sticky_lb
            secure: true
            httpOnly: true
            sameSite: lax
        healthCheck:
          path: /health
          interval: 10s
          timeout: 3s

    nexus-client-service:
      loadBalancer:
        servers:
          - url: "http://YOUR_IP:3000"
        healthCheck:
          path: /
          interval: 30s

  middlewares:
    nexus-websocket-headers:
      headers:
        customRequestHeaders:
          X-Forwarded-Proto: "https"
          X-Forwarded-Host: "nexus.example.com"
```

Enable the file provider in `traefik.yml`:

```yaml
providers:
  file:
    directory: /etc/traefik/dynamic
    watch: true
```

---

## Why These Settings Matter

### Sticky sessions

Socket.IO requires the same backend server for the full connection lifetime. Without sticky sessions, WebSocket upgrades fail when multiple server replicas are running.

### WebSocket headers

Socket.IO needs to know it's behind HTTPS (`X-Forwarded-Proto: https`) or it falls back to polling.

### Router priority

`/socket.io` and `/api` must resolve to the backend (port 3001). The client router (`priority: 1`) is the catch-all — it gets everything else.

---

## Traefik Static Configuration

Minimal `traefik.yml` if you're setting up a new Traefik instance:

```yaml
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
      email: your-email@example.com
      storage: /letsencrypt/acme.json
      httpChallenge:
        entryPoint: web

providers:
  docker:
    endpoint: "unix:///var/run/docker.sock"
    exposedByDefault: false
    network: traefik-public
```

---

## Troubleshooting

### 502 Bad Gateway

1. Containers are running: `docker ps | grep nexus-prod`
2. Direct health check: `curl http://YOUR_IP:3001/health` (from Traefik server if remote)
3. Traefik logs: `docker logs traefik 2>&1 | grep -i nexus`

### WebSocket falls back to polling

Check browser console for `transport: polling` instead of `transport: websocket`.

1. Sticky sessions must be enabled on the API service
2. `X-Forwarded-Proto: https` middleware must be applied to the API router
3. HTTPS must be active (WebSocket upgrade requires matching protocol)

### SSL certificate not issued

```bash
docker logs traefik 2>&1 | grep -i acme
```

DNS must point to the Traefik server before Let's Encrypt can issue. Verify with `nslookup nexus.example.com`.

### CORS errors in browser console

`CLIENT_URL` in the server environment must match the domain exactly (including `https://`). Check:

```bash
docker exec nexus-prod-server printenv CLIENT_URL
```

---

## Security Hardening

```bash
# Generate strong secrets
openssl rand -base64 64   # for JWT_SECRET
openssl rand -base64 32   # for POSTGRES_PASSWORD
```

Add rate limiting to the Traefik config:

```yaml
middlewares:
  nexus-ratelimit:
    rateLimit:
      average: 100
      burst: 50

# Apply to routers:
# middlewares: [nexus-websocket-headers, nexus-ratelimit]
```

---

## Port Reference

| Service | Port | Accessible from |
|---------|------|-----------------|
| Client (Nginx) | 3000 (prod) / 3002 (dev) | Traefik / local |
| Server (Node.js) | 3001 (prod) / 3003 (dev) | Traefik / local |
| PostgreSQL | 5432 (prod) / 5433 (dev) | localhost only |
| Redis | 6379 (prod) / 6380 (dev) | localhost only |

# Traefik Reverse Proxy Setup Guide

This guide explains how to deploy Nexus Nexus Chat behind a Traefik reverse proxy with automatic SSL certificates.

## Prerequisites

1. **Traefik already running** with:
   - Docker network named `traefik-public`
   - Let's Encrypt configured for SSL certificates
   - WebSocket support enabled

2. **Domain name** pointing to your server (e.g., `nexus.example.com`)

3. **Docker and Docker Compose** installed

---

## Quick Setup

### 1. Create Environment File

```bash
cp .env.traefik.example .env
nano .env
```

Update these values:
```env
DOMAIN=nexus.yourdomain.com
POSTGRES_PASSWORD=your-secure-db-password
JWT_SECRET=your-long-random-secret-key
LETSENCRYPT_EMAIL=your-email@example.com
```

### 2. Create Traefik Network (if not exists)

```bash
docker network create traefik-public
```

### 3. Deploy with Traefik

```bash
docker-compose -f docker-compose.traefik.yml up -d
```

### 4. Check Logs

```bash
docker-compose -f docker-compose.traefik.yml logs -f
```

---

## Configuration Details

### Network Architecture

```
Internet
    ↓
Traefik (ports 80, 443)
    ├── nexus.example.com → client (Nginx on port 80)
    └── nexus.example.com/socket.io → server (Node.js on port 3001)
            ↓
    Internal Network (nexus-internal)
        ├── PostgreSQL (port 5432)
        └── Redis (port 6379)
```

### Key Traefik Labels Explained

#### Server (WebSocket/API)
```yaml
# Match Socket.io and API paths
- "traefik.http.routers.nexus-api.rule=Host(`nexus.example.com`) && PathPrefix(`/socket.io`, `/api`)"

# WebSocket headers - CRITICAL for Socket.io
- "traefik.http.middlewares.nexus-headers.headers.customrequestheaders.X-Forwarded-Proto=https"

# Sticky sessions for WebSocket connections
- "traefik.http.services.nexus-api.loadbalancer.sticky.cookie=true"
```

#### Client (Frontend)
```yaml
# Match all other requests
- "traefik.http.routers.nexus-client.rule=Host(`nexus.example.com`)"

# Lower priority so API/Socket.io takes precedence
- "traefik.http.routers.nexus-client.priority=1"
```

---

## Traefik Configuration Requirements

Your Traefik instance must support WebSockets. Here's a minimal Traefik configuration:

### traefik.yml (Static Configuration)

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
    http:
      tls:
        certResolver: letsencrypt

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

# Enable WebSocket support (important!)
serversTransport:
  insecureSkipVerify: false
```

### Traefik docker-compose.yml Example

```yaml
version: '3.8'

services:
  traefik:
    image: traefik:v2.10
    container_name: traefik
    command:
      - "--api.dashboard=true"
      - "--providers.docker=true"
      - "--providers.docker.exposedbydefault=false"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
      - "--certificatesresolvers.letsencrypt.acme.httpchallenge=true"
      - "--certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web"
      - "--certificatesresolvers.letsencrypt.acme.email=${LETSENCRYPT_EMAIL}"
      - "--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json"
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - "/var/run/docker.sock:/var/run/docker.sock:ro"
      - "./letsencrypt:/letsencrypt"
    networks:
      - traefik-public
    restart: unless-stopped

networks:
  traefik-public:
    external: true
```

---

## Socket.io WebSocket Configuration

### Critical Settings for Socket.io to Work

1. **Sticky Sessions** (already configured in docker-compose.traefik.yml):
   ```yaml
   - "traefik.http.services.nexus-api.loadbalancer.sticky.cookie=true"
   ```

2. **Protocol Headers**:
   ```yaml
   - "traefik.http.middlewares.nexus-headers.headers.customrequestheaders.X-Forwarded-Proto=https"
   ```

3. **No Timeout on WebSocket Connections**:
   Traefik v2.10+ handles this automatically, but if you have issues, add:
   ```yaml
   - "traefik.http.services.nexus-api.loadbalancer.responseForwarding.flushInterval=100ms"
   ```

### Server CORS Configuration

Ensure your server's CORS is configured for your domain. In `server/index.js`:

```javascript
const corsOptions = {
  origin: process.env.CLIENT_URL || 'https://nexus.example.com',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE']
};

app.use(cors(corsOptions));
```

---

## Testing

### 1. Check DNS Resolution
```bash
nslookup nexus.example.com
```

### 2. Test HTTPS Connection
```bash
curl -I https://nexus.example.com
```

### 3. Test WebSocket Connection
```bash
# Install wscat if needed: npm install -g wscat
wscat -c wss://nexus.example.com/socket.io/?EIO=4&transport=websocket
```

### 4. Check Docker Logs
```bash
# Traefik logs
docker logs traefik -f

# Nexus server logs
docker logs nexus-server -f

# Nexus client logs
docker logs nexus-client -f
```

---

## Troubleshooting

### Issue: WebSocket Connection Fails

**Symptoms:** Client connects but Socket.io shows polling fallback

**Solutions:**
1. Check sticky sessions are enabled
2. Verify Traefik is forwarding WebSocket upgrade headers
3. Check server logs for connection errors

```bash
# Enable debug logging in server
docker-compose -f docker-compose.traefik.yml exec server sh
export LOG_LEVEL=debug
```

### Issue: SSL Certificate Not Generated

**Symptoms:** 404 or certificate errors

**Solutions:**
1. Check domain DNS points to server IP
2. Verify Let's Encrypt email is set
3. Check Traefik logs for ACME errors

```bash
docker logs traefik 2>&1 | grep -i acme
```

### Issue: CORS Errors

**Symptoms:** Browser console shows CORS policy errors

**Solutions:**
1. Verify CLIENT_URL in server environment matches your domain
2. Check server CORS configuration
3. Ensure credentials are allowed

### Issue: 502 Bad Gateway

**Symptoms:** Traefik returns 502 error

**Solutions:**
1. Check if containers are running: `docker ps`
2. Verify internal network connectivity
3. Check server health: `docker logs nexus-server`

---

## Security Hardening

### 1. Use Strong Secrets

Generate secure secrets:
```bash
# Generate JWT secret
openssl rand -base64 64

# Generate PostgreSQL password
openssl rand -base64 32
```

### 2. Enable Rate Limiting

Add to docker-compose.traefik.yml:
```yaml
labels:
  - "traefik.http.middlewares.nexus-ratelimit.ratelimit.average=100"
  - "traefik.http.middlewares.nexus-ratelimit.ratelimit.burst=50"
  - "traefik.http.routers.nexus-api.middlewares=nexus-headers,nexus-ratelimit"
```

### 3. Restrict Database Access

Ensure PostgreSQL and Redis are ONLY on internal network:
```yaml
postgres:
  networks:
    - nexus-internal  # NOT traefik-public!
```

### 4. Regular Updates

```bash
# Update images
docker-compose -f docker-compose.traefik.yml pull

# Restart with new images
docker-compose -f docker-compose.traefik.yml up -d
```

---

## Scaling Considerations

### Multiple Server Instances

For high availability, run multiple server instances with load balancing:

```yaml
server:
  deploy:
    replicas: 3
  labels:
    - "traefik.http.services.nexus-api.loadbalancer.sticky.cookie=true"
    - "traefik.http.services.nexus-api.loadbalancer.sticky.cookie.name=nexus_lb"
    - "traefik.http.services.nexus-api.loadbalancer.sticky.cookie.secure=true"
```

**Important:** Socket.io requires sticky sessions for multiple instances!

### External PostgreSQL/Redis

For production, consider managed database services:

```yaml
environment:
  - DATABASE_URL=postgresql://user:pass@external-db.com:5432/nexus_db
  - REDIS_URL=redis://external-redis.com:6379
```

---

## Monitoring

### Health Checks

Access Traefik dashboard at: `https://traefik.yourdomain.com/dashboard/`

Add dashboard to Traefik configuration:
```yaml
labels:
  - "traefik.http.routers.traefik-dashboard.rule=Host(`traefik.yourdomain.com`)"
  - "traefik.http.routers.traefik-dashboard.service=api@internal"
```

### Application Monitoring

Monitor container health:
```bash
docker stats nexus-server nexus-client
```

---

## Maintenance

### Backup Database

```bash
docker exec nexus-postgres pg_dump -U postgres nexus_db > backup.sql
```

### Restore Database

```bash
docker exec -i nexus-postgres psql -U postgres nexus_db < backup.sql
```

### Update Application

```bash
# Pull latest code
git pull

# Rebuild and restart
docker-compose -f docker-compose.traefik.yml up -d --build
```

---

## Support

For issues specific to:
- **Traefik**: https://doc.traefik.io/traefik/
- **Socket.io**: https://socket.io/docs/v4/
- **Docker**: https://docs.docker.com/

For Nexus Nexus Chat issues, check the main README.md

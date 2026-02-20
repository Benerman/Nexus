# Traefik Remote Configuration Guide

This guide is for when Traefik is running on a **separate device** from your Nexus application.

---

## Prerequisites

- Traefik v2.x or v3.x running on another device
- Network connectivity between Traefik and your Nexus server
- Domain name pointing to your Traefik server

---

## Configuration Steps

### 1. Update Your Server's Environment Variables

Edit your `.env` file on the Nexus server:

```env
# Use your public domain
CLIENT_URL=https://nexus.example.com

# Change NODE_ENV to production for SSL
NODE_ENV=production
```

### 2. Remove Port Mappings (Optional)

Since Traefik is handling external traffic, you can remove port mappings from `docker-compose.yml`:

```yaml
# BEFORE:
ports:
  - "3000:80"
  - "3001:3001"

# AFTER: (remove ports section entirely or keep for internal access)
# No ports needed if only accessing via Traefik
```

**OR** keep them for direct access but ensure your firewall blocks external access to these ports.

### 3. Add Configuration to Traefik

On your **Traefik server**, add the configuration from `traefik-config.yml`.

Replace these values:
- `nexus.example.com` → Your actual domain
- `YOUR_SERVER_IP:3001` → Your Nexus server IP and backend port
- `YOUR_SERVER_IP:3000` → Your Nexus server IP and frontend port

#### Where to Add Configuration

**Option A: File Provider (Recommended)**

Add to your Traefik `dynamic.yml` or create a new file:

```yaml
# /etc/traefik/dynamic/nexus.yml
http:
  routers:
    nexus-api:
      # ... copy from traefik-config.yml
  services:
    nexus-api-service:
      # ... copy from traefik-config.yml
  middlewares:
    nexus-websocket-headers:
      # ... copy from traefik-config.yml
```

Then in your Traefik `traefik.yml`:
```yaml
providers:
  file:
    directory: /etc/traefik/dynamic
    watch: true
```

**Option B: Docker Labels (if Traefik can reach your Docker)**

If Traefik can access your Docker socket over the network (not recommended for security), use Docker labels instead. Skip this if Traefik is on a different device.

---

## Critical Configuration Explained

### 1. Sticky Sessions (REQUIRED for Socket.io)

```yaml
sticky:
  cookie:
    name: nexus_sticky_lb
    secure: true      # HTTPS only
    httpOnly: true    # Prevents JavaScript access
    sameSite: lax     # CSRF protection
```

**Why:** Socket.io requires the same backend server for the entire session. Without sticky sessions, WebSocket upgrades will fail.

### 2. WebSocket Headers

```yaml
customRequestHeaders:
  X-Forwarded-Proto: "https"
  X-Forwarded-Host: "nexus.example.com"
```

**Why:** Socket.io needs to know the connection is over HTTPS when behind a reverse proxy.

### 3. Router Priority

```yaml
# API Router
priority: 10  # Higher priority (default)

# Client Router
priority: 1   # Lower priority
```

**Why:** Ensures `/socket.io` requests go to the API, not the static frontend.

### 4. Path Prefix Matching

```yaml
rule: "Host(`nexus.example.com`) && PathPrefix(`/socket.io`)"
```

**Why:** All Socket.io traffic uses the `/socket.io` path. This must route to your backend.

---

## IP Address Configuration

### Finding Your Server's IP

```bash
# On your Nexus server:
ip addr show | grep inet

# Or:
hostname -I
```

### Update traefik-config.yml

```yaml
services:
  nexus-api-service:
    loadBalancer:
      servers:
        - url: "http://YOUR_SERVER_IP:3001"

  nexus-client-service:
    loadBalancer:
      servers:
        - url: "http://YOUR_SERVER_IP:3000"
```

**Examples:**
- Local network: `http://YOUR_SERVER_IP:3001`
- VPN: `http://10.8.0.5:3001`
- Hostname: `http://nexus-server.local:3001`

---

## Testing Configuration

### 1. Verify Traefik Can Reach Your Server

```bash
# From Traefik server:
curl http://YOUR_SERVER_IP:3001/health
curl http://YOUR_SERVER_IP:3000/
```

### 2. Check Traefik Logs

```bash
# On Traefik server:
tail -f /var/log/traefik/traefik.log

# Or if using Docker:
docker logs traefik -f
```

Look for:
-  `Configuration loaded successfully`
-  `Server is ready`
-  `Cannot reach backend`

### 3. Test WebSocket Connection

```bash
# Install wscat: npm install -g wscat
wscat -c "wss://nexus.example.com/socket.io/?EIO=4&transport=websocket"
```

**Expected:** Connection established, Socket.io handshake

### 4. Browser Console

Visit `https://nexus.example.com` and open browser console:

```javascript
// Should see Socket.io connecting
// Look for:
[socket.io] transport: websocket
[socket.io] connected
```

---

## Firewall Configuration

### On Your Nexus Server

**Allow Traefik to connect:**
```bash
# UFW (Ubuntu/Debian)
sudo ufw allow from TRAEFIK_IP to any port 3000
sudo ufw allow from TRAEFIK_IP to any port 3001

# Or allow from subnet:
sudo ufw allow from 192.168.1.0/24 to any port 3000
sudo ufw allow from 192.168.1.0/24 to any port 3001
```

**Block external access (if not already blocked):**
```bash
# Only allow Traefik, block everyone else
sudo ufw deny 3000
sudo ufw deny 3001
```

### On Your Traefik Server

Ensure ports 80 and 443 are open:
```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

---

## Troubleshooting

### Issue: 502 Bad Gateway

**Possible Causes:**
1. Nexus server not running
2. Wrong IP address in Traefik config
3. Firewall blocking Traefik → Nexus connection
4. Port mismatch

**Solutions:**
```bash
# 1. Check Nexus is running
docker ps | grep nexus

# 2. Verify IP is correct
ping YOUR_SERVER_IP

# 3. Test direct connection from Traefik
curl http://YOUR_SERVER_IP:3001/health

# 4. Check Traefik logs
docker logs traefik 2>&1 | grep -i "nexus"
```

### Issue: WebSocket Connection Fails

**Symptoms:** Client connects but falls back to polling

**Solutions:**
1. Verify sticky sessions are enabled
2. Check headers middleware is applied
3. Ensure HTTPS is being used

```yaml
# Add to middleware:
customRequestHeaders:
  X-Forwarded-Proto: "https"
```

### Issue: CORS Errors

**Symptoms:** Browser console shows CORS policy errors

**Solutions:**

Update server CORS configuration in `server/index.js`:
```javascript
const corsOptions = {
  origin: 'https://nexus.example.com',  // Your actual domain
  credentials: true
};
```

### Issue: Certificate Errors

**Symptoms:** SSL certificate invalid or not found

**Solutions:**
1. Verify domain DNS points to Traefik server
2. Check Let's Encrypt logs on Traefik
3. Ensure certResolver is configured

```bash
# Check certificate
openssl s_client -connect nexus.example.com:443 -servername nexus.example.com
```

---

## Security Considerations

### 1. Restrict Access by IP

Only allow Traefik's IP to access backend:

```yaml
# In Traefik config, add IP whitelist middleware:
middlewares:
  nexus-ip-whitelist:
    ipWhiteList:
      sourceRange:
        - "TRAEFIK_IP/32"
```

### 2. Enable Rate Limiting

Already included in config:
```yaml
rateLimit:
  average: 100
  burst: 50
```

Adjust based on your needs.

### 3. Health Check Endpoints

Add a health endpoint to your server if not exists:

```javascript
// server/index.js
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: Date.now() });
});
```

---

## Multiple Server Instances (High Availability)

If running multiple Nexus instances:

```yaml
nexus-api-service:
  loadBalancer:
    servers:
      - url: "http://YOUR_SERVER_IP:3001"
      - url: "http://192.168.1.101:3001"
      - url: "http://192.168.1.102:3001"

    # CRITICAL: Must have sticky sessions
    sticky:
      cookie:
        name: nexus_sticky_lb
```

**Important:** Each instance must share the same PostgreSQL and Redis!

---

## Performance Tuning

### 1. Connection Timeouts

Add to service configuration:
```yaml
loadBalancer:
  responseForwarding:
    flushInterval: 100ms

  # Health check
  healthCheck:
    interval: 10s
    timeout: 3s
    followRedirects: false
```

### 2. Keep-Alive

```yaml
serversTransport:
  maxIdleConnsPerHost: 200
  forwardingTimeouts:
    dialTimeout: 30s
    responseHeaderTimeout: 0s
    idleConnTimeout: 90s
```

---

## Monitoring

### Traefik Dashboard

Access at `http://traefik-ip:8080/dashboard/` (if enabled)

Look for:
- Routers: `nexus-api`, `nexus-client`
- Services: Health status (green = healthy)
- Middlewares: Applied correctly

### Access Logs

Enable in Traefik config:
```yaml
accessLog:
  filePath: "/var/log/traefik/access.log"
  format: json
  filters:
    statusCodes: ["400-499", "500-599"]
```

---

## Quick Reference

### Required Settings Checklist

-  Sticky sessions enabled (`sticky.cookie`)
-  WebSocket headers middleware (`X-Forwarded-Proto: https`)
-  Path prefix `/socket.io` routes to backend
-  Priority set correctly (API > Client)
-  Server IPs correct in loadBalancer
-  Firewall allows Traefik → Nexus
-  HTTPS enforced (certResolver configured)
-  CORS matches domain in server config

### Port Reference

| Service | Default Port | Purpose |
|---------|--------------|---------|
| Client (Nginx) | 3000 | Frontend (React app) |
| Server (Node.js) | 3001 | Backend + Socket.io |
| PostgreSQL | 5432 | Database (internal only) |
| Redis | 6379 | Cache (internal only) |

---

## Need Help?

1. Check Traefik documentation: https://doc.traefik.io/traefik/
2. Socket.io behind proxy: https://socket.io/docs/v4/reverse-proxy/
3. Traefik file provider: https://doc.traefik.io/traefik/providers/file/

For Nexus-specific issues, see main README.md

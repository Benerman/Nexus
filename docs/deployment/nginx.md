# Nginx Configuration

Nexus uses Nginx as the frontend web server in its client container.

## Default Configuration

The `nginx.conf` in the client container handles:

- **SPA routing** — All non-file requests fall through to `index.html` for client-side routing
- **WebSocket proxy** — Upgrades connections for Socket.IO
- **Static asset caching** — Cache headers for built assets
- **Health check** — Responds to `GET /` for container health checks

## WebSocket Support

Nginx is configured to proxy WebSocket connections to the Node.js server on port 3001. The key headers are:

```nginx
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```

## Custom Configuration

If you need to modify Nginx settings, edit `client/nginx.conf` and rebuild the client container:

```bash
docker compose -p nexus-prod -f docker-compose.yml -f docker-compose.prod.yml up -d --build client
```

## Related

- [Docker Deployment](docker.md) — Container setup
- [Traefik & SSL](traefik-ssl.md) — Reverse proxy with HTTPS

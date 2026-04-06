# Quick Start

Get Nexus running in 5 minutes with Docker.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/) installed
- 2 GB RAM minimum
- Ports 3000 and 3001 available

## 1. Clone the Repository

```bash
git clone https://github.com/your-org/nexus.git
cd nexus
```

## 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and set these required values:

```bash
JWT_SECRET=your-random-secret-here        # Use: openssl rand -base64 64
POSTGRES_PASSWORD=a-strong-password-here
CLIENT_URL=http://localhost:3000           # Change to your domain in production
```

## 3. Start Nexus

```bash
docker compose -p nexus-prod -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Or use the quick start script:

```bash
./start.sh
```

This starts four containers:

| Container | Purpose | Port |
|-----------|---------|------|
| nexus-prod-client | Nginx + React frontend | 3000 |
| nexus-prod-server | Node.js + Socket.IO backend | 3001 |
| nexus-prod-postgres | PostgreSQL 15 database | Internal |
| nexus-prod-redis | Redis 7 cache | Internal |

## 4. Open Nexus

Navigate to [http://localhost:3000](http://localhost:3000) in your browser.

1. Click **Register** to create your first account
2. Create a server — it auto-generates default channels and roles
3. Share your server invite link with others

## Next Steps

- [Create Your First Server](first-server.md) — Detailed server setup walkthrough
- [Environment Variables](../deployment/environment-variables.md) — Full configuration reference
- [Traefik & SSL](../deployment/traefik-ssl.md) — Set up HTTPS for production
- [STUN/TURN](../audio/stun-turn.md) — Enable voice chat across networks

# Docker Deployment Guide - Nexus Nexus Chat

## 🐳 Complete Dockerized Setup

This deployment includes all services needed to run Nexus Chat:
- **PostgreSQL** - Persistent database storage
- **Redis** - Session management and caching
- **Server** - Node.js backend with Socket.io
- **Client** - React frontend served by Nginx

---

##  Prerequisites

- Docker Engine 20.10+
- Docker Compose 2.0+
- At least 2GB RAM available
- Ports 3000, 3001, 5432, 6379 available

---

##  Quick Start

### 1. Start All Services

```bash
cd nexus/

# Build and start all containers
docker-compose up -d --build
```

This will:
1. Start PostgreSQL and wait for it to be healthy
2. Start Redis and wait for it to be healthy
3. Build and start the server (automatically runs migrations)
4. Build and start the client

### 2. Verify Services

```bash
# Check all services are running
docker-compose ps

# Expected output:
# NAME              STATUS    PORTS
# nexus-client      Up        0.0.0.0:3000->80/tcp
# nexus-server      Up        0.0.0.0:3001->3001/tcp
# nexus-postgres    Up        0.0.0.0:5432->5432/tcp
# nexus-redis       Up        0.0.0.0:6379->6379/tcp
```

### 3. Access the Application

Open your browser to: **http://localhost:3000**

---

## 📦 Service Details

### PostgreSQL Database
- **Container**: `nexus-postgres`
- **Port**: 5432
- **Database**: `nexus_db`
- **User**: `postgres`
- **Password**: `postgres` (⚠ Change in production!)
- **Volume**: `postgres-data` (persists data)

### Redis Cache
- **Container**: `nexus-redis`
- **Port**: 6379
- **Volume**: `redis-data` (persists cache)
- **Configuration**: AOF persistence enabled

### Backend Server
- **Container**: `nexus-server`
- **Port**: 3001
- **Auto-migrations**: Yes (runs on startup)
- **Healthcheck**: Waits for PostgreSQL and Redis
- **Environment**: Production mode

### Frontend Client
- **Container**: `nexus-client`
- **Port**: 3000 (mapped to 80 inside)
- **Server**: Nginx
- **Proxy**: All API calls forwarded to backend

---

##  Configuration

### Environment Variables

All environment variables are set in `docker-compose.yml`:

```yaml
environment:
  - DATABASE_URL=postgresql://postgres:postgres@postgres:5432/nexus_db
  - REDIS_URL=redis://redis:6379
  - JWT_SECRET=production-secret-change-me-in-production
  - SESSION_EXPIRY=604800000  # 7 days
  - REFRESH_EXPIRY=2592000000 # 30 days
```

**⚠ Important for Production:**
1. Change `POSTGRES_PASSWORD` in postgres service
2. Change `JWT_SECRET` in server service
3. Update `DATABASE_URL` with new password
4. Use strong, random secrets

### Customizing Configuration

Create a `.env` file in the root directory:

```bash
# PostgreSQL
POSTGRES_DB=nexus_db
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_secure_password_here

# Server
JWT_SECRET=your_jwt_secret_here
SESSION_EXPIRY=604800000
REFRESH_EXPIRY=2592000000
MAX_MESSAGE_LENGTH=2000
```

Then update `docker-compose.yml` to use `.env` file:

```yaml
postgres:
  environment:
    - POSTGRES_DB=${POSTGRES_DB}
    - POSTGRES_USER=${POSTGRES_USER}
    - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
```

---

## 🛠 Common Operations

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f server
docker-compose logs -f postgres
docker-compose logs -f redis
docker-compose logs -f client

# Last 100 lines
docker-compose logs --tail=100 server
```

### Restart Services

```bash
# Restart all
docker-compose restart

# Restart specific service
docker-compose restart server
docker-compose restart client
```

### Stop Services

```bash
# Stop all (keeps data)
docker-compose stop

# Stop and remove containers (keeps data in volumes)
docker-compose down

# Stop and remove everything including volumes (⚠ DATA LOSS)
docker-compose down -v
```

### Rebuild After Code Changes

```bash
# Rebuild server only
docker-compose up -d --build server

# Rebuild client only
docker-compose up -d --build client

# Rebuild everything
docker-compose up -d --build
```

### Access Database Shell

```bash
# PostgreSQL
docker exec -it nexus-postgres psql -U postgres -d nexus_db

# Inside psql:
\dt              # List tables
\d accounts      # Describe accounts table
SELECT * FROM accounts LIMIT 5;
\q               # Quit

# Redis
docker exec -it nexus-redis redis-cli

# Inside redis-cli:
PING             # Test connection
KEYS *           # List all keys
GET key_name     # Get value
exit             # Quit
```

### Run Manual Migration

```bash
# Copy migration file to container
docker cp server/migrations/002_new_migration.sql nexus-server:/app/migrations/

# Execute migration
docker exec nexus-postgres psql -U postgres -d nexus_db -f /app/migrations/002_new_migration.sql
```

### Access Container Shell

```bash
# Server container
docker exec -it nexus-server sh

# Inside container:
ls -la           # List files
cat index.js     # View file
node --version   # Check Node version
exit             # Exit
```

---

## 📊 Database Management

### Backup Database

```bash
# Create backup
docker exec nexus-postgres pg_dump -U postgres nexus_db > backup_$(date +%Y%m%d_%H%M%S).sql

# Verify backup
ls -lh backup_*.sql
```

### Restore Database

```bash
# Stop server to prevent conflicts
docker-compose stop server

# Restore from backup
docker exec -i nexus-postgres psql -U postgres -d nexus_db < backup_20260213_120000.sql

# Restart server
docker-compose start server
```

### Reset Database

```bash
# ⚠ WARNING: This will delete ALL data!

# Stop server
docker-compose stop server

# Drop and recreate database
docker exec nexus-postgres psql -U postgres -c "DROP DATABASE IF EXISTS nexus_db;"
docker exec nexus-postgres psql -U postgres -c "CREATE DATABASE nexus_db;"

# Restart server (will run migrations automatically)
docker-compose start server
```

---

## 🔍 Troubleshooting

### Server Won't Start

**Check logs:**
```bash
docker-compose logs server
```

**Common issues:**
1. **Database not ready**: Server waits for PostgreSQL to be healthy
   - Solution: Wait longer, or check `docker-compose logs postgres`

2. **Migration failed**: SQL error in migration script
   - Check migration file syntax
   - View error in server logs
   - Fix and restart: `docker-compose restart server`

3. **Port already in use**:
   ```
   Error: bind: address already in use
   ```
   - Solution: Change port in docker-compose.yml or stop conflicting service

### Database Connection Issues

```bash
# Test PostgreSQL connection
docker exec nexus-postgres psql -U postgres -d nexus_db -c "SELECT 1;"

# Test Redis connection
docker exec nexus-redis redis-cli ping
```

### Client Can't Reach Server

**Check Nginx proxy:**
```bash
docker exec nexus-client cat /etc/nginx/conf.d/default.conf
```

**Verify server is accessible from client container:**
```bash
docker exec nexus-client wget -O- http://server:3001/health
```

### Rebuild from Scratch

If things are really broken:

```bash
# Stop everything
docker-compose down

# Remove images
docker rmi nexus-server nexus-client

# Remove volumes (⚠ deletes data)
docker volume rm nexus-chat_postgres-data
docker volume rm nexus-chat_redis-data

# Start fresh
docker-compose up -d --build
```

---

## 🔒 Production Deployment

### Security Checklist

- [ ] Change PostgreSQL password
- [ ] Change JWT_SECRET to random string
- [ ] Set NODE_ENV=production
- [ ] Configure CORS to specific domain (not `*`)
- [ ] Enable HTTPS/SSL
- [ ] Use environment secrets (not hardcoded)
- [ ] Set up firewall rules
- [ ] Enable database backups
- [ ] Set up monitoring and alerts

### Recommended Production Changes

1. **Use Docker Secrets** (instead of environment variables):
   ```yaml
   secrets:
     db_password:
       external: true

   services:
     postgres:
       secrets:
         - db_password
       environment:
         - POSTGRES_PASSWORD_FILE=/run/secrets/db_password
   ```

2. **Add Health Endpoints**:
   ```yaml
   server:
     healthcheck:
       test: ["CMD", "wget", "-q", "--spider", "http://localhost:3001/health"]
       interval: 30s
       timeout: 10s
       retries: 3
   ```

3. **Resource Limits**:
   ```yaml
   server:
     deploy:
       resources:
         limits:
           cpus: '1'
           memory: 512M
         reservations:
           cpus: '0.5'
           memory: 256M
   ```

4. **Use Managed Databases** (AWS RDS, DigitalOcean Managed DB):
   - Better performance
   - Automatic backups
   - High availability
   - Remove postgres container, update DATABASE_URL

---

## 📈 Monitoring

### Check Resource Usage

```bash
# All containers
docker stats

# Specific container
docker stats nexus-server
```

### Database Size

```bash
docker exec nexus-postgres psql -U postgres -d nexus_db -c "
  SELECT pg_size_pretty(pg_database_size('nexus_db')) as db_size;
"
```

### Active Connections

```bash
# PostgreSQL connections
docker exec nexus-postgres psql -U postgres -d nexus_db -c "
  SELECT count(*) FROM pg_stat_activity;
"

# Redis info
docker exec nexus-redis redis-cli INFO stats
```

---

## 🔄 Update & Maintenance

### Update Application Code

```bash
# Pull latest changes
git pull origin main

# Rebuild and restart
docker-compose up -d --build server client
```

### Update Dependencies

```bash
# Update server dependencies
cd server
npm update
docker-compose up -d --build server

# Update client dependencies
cd ../client
npm update
docker-compose up -d --build client
```

### Cleanup Old Images

```bash
# Remove unused images
docker image prune -a

# Remove unused volumes
docker volume prune

# Remove everything unused
docker system prune -a --volumes
```

---

##  Automated Startup Process

The server container automatically:

1.  Waits for PostgreSQL to be ready
2.  Waits for Redis to be ready
3.  Checks if database is initialized
4.  Runs migrations if needed (first startup)
5.  Starts the Node.js server

**See the initialization script**: `server/docker-entrypoint.sh`

---

##  Quick Commands Reference

```bash
# Start everything
docker-compose up -d

# View logs
docker-compose logs -f

# Restart server after code changes
docker-compose up -d --build server

# Access database
docker exec -it nexus-postgres psql -U postgres -d nexus_db

# Backup database
docker exec nexus-postgres pg_dump -U postgres nexus_db > backup.sql

# Stop everything
docker-compose down

# Remove everything (including data!)
docker-compose down -v
```

---

**Last Updated**: 2026-02-13
**Docker Compose Version**: 3.8

# Data Persistence in Nexus Chat

## Overview

Nexus Chat uses a **hybrid data persistence model** combining PostgreSQL for persistent data, Redis for caching, and in-memory structures for runtime state. This document explains how data persists across server restarts and container rebuilds.

## Architecture

### 1. PostgreSQL Database (Primary Persistent Storage)

**Location:** Docker volume `postgres-data` → `/var/lib/postgresql/data`

**Persists Across:** Server restarts, container rebuilds, system reboots

**Stores:**
- **User Accounts** - Usernames, password hashes, avatars, bios, status
- **Authentication Tokens** - Session tokens with expiration
- **Servers** - Server metadata (id, name, icon, owner, description)
- **Server Members** - Junction table linking users to servers with roles
- **Categories** - Channel organization groups
- **Channels** - Channel metadata (id, name, type, description)
- **Messages** - Chat message history with attachments and reactions
- **DM Channels** - Direct message conversations between users
- **Friendships** - Friend requests and relationships
- **Webhooks** - Webhook integrations for channels
- **Invites** - Server invite codes
- **Reports** - User reports for moderation

**Schema Location:** `server/migrations/001_initial_schema.sql`

### 2. Redis Cache (Session & Real-time Data)

**Location:** Docker volume `redis-data` → `/data`

**Persists Across:** Server restarts (when using AOF persistence)

**Stores:**
- Session data (future implementation)
- Rate limiting counters
- Online user presence indicators
- Temporary caching

**Note:** Currently not fully utilized but configured for future enhancements.

### 3. In-Memory State (Runtime Only)

**Persists Across:** NOTHING - Lost on server restart

**Stores:**
- **Server Structures** - Full server objects with channels, categories, roles
- **Online Users** - Currently connected users (by socket ID)
- **Voice Channel State** - Who's in which voice channel
- **Message Cache** - Recent messages per channel (loaded from database)
- **Typing Indicators** - Real-time typing status

## Data Persistence Guarantees

### ✅ Data That WILL Persist Across Restarts

| Data Type | Storage | Survives Restart? | Survives Rebuild? |
|-----------|---------|-------------------|-------------------|
| User Accounts | PostgreSQL | ✅ Yes | ✅ Yes |
| Server Metadata | PostgreSQL | ✅ Yes | ✅ Yes |
| Server Memberships | PostgreSQL | ✅ Yes | ✅ Yes |
| Messages | PostgreSQL | ✅ Yes | ✅ Yes |
| DM Channels | PostgreSQL | ✅ Yes | ✅ Yes |
| Friends/Blocks | PostgreSQL | ✅ Yes | ✅ Yes |
| Webhooks | PostgreSQL | ✅ Yes | ✅ Yes |
| Invites | PostgreSQL | ✅ Yes | ✅ Yes |

### ❌ Data That Will NOT Persist

| Data Type | Storage | Why Lost? |
|-----------|---------|-----------|
| Online Users | Memory | Socket connections close on restart |
| Voice State | Memory | WebRTC connections close on restart |
| Typing Indicators | Memory | Ephemeral real-time data |
| Active Sessions* | Memory | Need to re-login (tokens persist in DB) |

*Note: Tokens persist in the database, so users with valid tokens in localStorage can auto-reconnect.

## How It Works

### Server Startup Process

1. **Initialize Database Connection**
   ```javascript
   await db.initializeDatabase();
   ```

2. **Load or Create Default Server**
   ```javascript
   let defaultServer = await db.getServerById(DEFAULT_SERVER_ID);
   if (!defaultServer) {
     defaultServer = await db.createServer({...});
   }
   ```

3. **Build Server Structure in Memory**
   ```javascript
   const srv = makeServer(...defaultServer);
   state.servers[DEFAULT_SERVER_ID] = srv;
   ```

4. **Initialize Message Stores**
   - Message stores created empty in memory
   - Loaded from database when users join channels

### Server Creation Flow

1. User creates server via `socket.on('server:create')`
2. **Save to database:**
   ```javascript
   await db.createServer({ id, name, icon, ownerId, ... });
   await db.addServerMember(serverId, userId, ['everyone', 'admin']);
   ```
3. **Build structure in memory:**
   ```javascript
   const srv = makeServer(serverId, name, icon, userId);
   state.servers[serverId] = srv;
   ```
4. Server persists in database, structure rebuilt on restart

### Message Persistence Flow

1. User sends message via `socket.on('message:send')`
2. **Save to database:**
   ```javascript
   await db.saveMessage({ channelId, authorId, content, attachments });
   ```
3. **Broadcast to online users** (in-memory)
4. Messages reload from database when channel is joined

## Docker Volumes

### Volume Configuration (`docker-compose.yml`)

```yaml
volumes:
  postgres-data:  # PostgreSQL data directory
  redis-data:     # Redis persistence (AOF)
```

### Volume Locations

On the host system (Linux):
```
/var/lib/docker/volumes/nexus-chat_postgres-data/_data
/var/lib/docker/volumes/nexus-chat_redis-data/_data
```

### Managing Volumes

**List volumes:**
```bash
docker volume ls | grep nexus-chat
```

**Inspect volume:**
```bash
docker volume inspect nexus-chat_postgres-data
```

**Backup database:**
```bash
docker-compose exec postgres pg_dump -U postgres nexus_db > backup.sql
```

**Restore database:**
```bash
cat backup.sql | docker-compose exec -T postgres psql -U postgres -d nexus_db
```

**Delete all data (⚠️ DANGER):**
```bash
docker-compose down -v  # -v removes volumes
```

## Database Schema

### Core Tables

**accounts** - User authentication and profiles
```sql
CREATE TABLE accounts (
  id UUID PRIMARY KEY,
  username VARCHAR(32) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  salt VARCHAR(32) NOT NULL,
  avatar VARCHAR(10) DEFAULT '🐺',
  custom_avatar TEXT,
  color VARCHAR(7) DEFAULT '#3B82F6',
  bio VARCHAR(128) DEFAULT '',
  status VARCHAR(10) DEFAULT 'online',
  created_at TIMESTAMP DEFAULT NOW()
);
```

**servers** - Server metadata
```sql
CREATE TABLE servers (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(32) NOT NULL,
  icon VARCHAR(10) DEFAULT '⬡',
  custom_icon TEXT,
  description VARCHAR(256) DEFAULT '',
  owner_id UUID REFERENCES accounts(id),
  created_at TIMESTAMP DEFAULT NOW()
);
```

**messages** - Chat messages
```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY,
  channel_id VARCHAR(64) NOT NULL,
  author_id UUID REFERENCES accounts(id),
  content TEXT,
  attachments JSONB DEFAULT '[]',
  reactions JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_messages_channel ON messages(channel_id, created_at DESC);
```

See `server/migrations/001_initial_schema.sql` for complete schema.

## Hybrid Approach Rationale

### Why Not Store Everything in Database?

**Channels, Categories, Roles** are created as **template structures** in memory because:

1. **Performance** - Frequently accessed, better to keep in memory
2. **Simplicity** - Server structure is relatively static
3. **Consistency** - Single source of truth per server
4. **Future Enhancement** - Can migrate to full database storage later

### Migration Path to Full Database Persistence

To make channels/categories/roles fully persistent:

1. Add database functions in `server/db.js`:
   - `createChannel()`
   - `updateChannel()`
   - `createCategory()`
   - `createRole()`

2. Update socket event handlers to save to database

3. Load server structure from database on startup instead of using templates

4. Update `serializeServer()` to pull from database

This is **not currently implemented** to keep complexity low.

## Common Issues & Solutions

### Issue: Servers disappear after `docker-compose down`

**Cause:** Data is in memory only, not saved to database

**Solution:** ✅ **FIXED** - Servers now save to PostgreSQL database

### Issue: Messages lost after restart

**Cause:** Messages not being saved to database

**Check:** Verify database connection:
```bash
docker-compose logs server | grep DB
```

**Solution:** Ensure `db.saveMessage()` is called on message send

### Issue: Can't login after restart

**Cause:** Token in localStorage expired or invalid

**Solution:** Tokens now persist in database with expiration. Clear localStorage and re-login if needed.

### Issue: Docker volumes taking up too much space

**Check volume size:**
```bash
docker system df -v
```

**Clean old messages:**
```javascript
await db.cleanupOldMessages(channelId, keepCount);
```

## Environment Variables

**Database:**
```bash
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/nexus_db
REDIS_URL=redis://redis:6379
```

**Session:**
```bash
SESSION_EXPIRY=604800000  # 7 days in ms
REFRESH_EXPIRY=2592000000 # 30 days in ms
```

## Monitoring Data

### Check database contents:

```bash
# List all servers
docker-compose exec postgres psql -U postgres -d nexus_db -c "SELECT * FROM servers"

# Count messages
docker-compose exec postgres psql -U postgres -d nexus_db -c "SELECT COUNT(*) FROM messages"

# Check online users (in-memory, via HTTP)
curl http://localhost:3001/health
```

### Database statistics:

```bash
docker-compose exec postgres psql -U postgres -d nexus_db -c "
SELECT schemaname, tablename, n_live_tup as rows
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC"
```

## Backup Strategy

### Automatic Backups (Recommended)

Add to your crontab:
```bash
# Daily backup at 2 AM
0 2 * * * cd /path/to/nexus-chat && docker-compose exec -T postgres pg_dump -U postgres nexus_db | gzip > backups/nexus_$(date +\%Y\%m\%d).sql.gz
```

### Manual Backup

```bash
# Full backup
docker-compose exec postgres pg_dump -U postgres nexus_db > nexus_backup.sql

# Backup with compression
docker-compose exec postgres pg_dump -U postgres nexus_db | gzip > nexus_backup.sql.gz
```

### Restore from Backup

```bash
# Stop server first
docker-compose stop server

# Restore database
cat nexus_backup.sql | docker-compose exec -T postgres psql -U postgres -d nexus_db

# Or from compressed
gunzip -c nexus_backup.sql.gz | docker-compose exec -T postgres psql -U postgres -d nexus_db

# Restart server
docker-compose start server
```

## Future Enhancements

Planned improvements to data persistence:

1. **Full Database Persistence** - Move channels/categories/roles to database
2. **Message Pagination** - Load older messages on demand
3. **Attachment Storage** - Store file uploads in S3/MinIO instead of database
4. **Redis Session Management** - Use Redis for active sessions
5. **Read Replicas** - Add read-only database replicas for scaling
6. **Automated Backups** - Built-in backup scheduling
7. **Data Export** - Export user data in portable format

## Summary

**✅ Your data IS safe** - User accounts, servers, messages, and relationships all persist in PostgreSQL with Docker volumes.

**⚠️ What's NOT saved** - Active connections, voice state, and server structures (rebuilt from database on startup).

**🔄 On Restart:** Database data loads automatically, users reconnect with tokens, server structures rebuild from templates.

**💾 Backups:** Always back up the `postgres-data` Docker volume before major changes.

For more information, see:
- `/server/db.js` - Database functions
- `/server/migrations/001_initial_schema.sql` - Complete schema
- `/server/index.js` - Server initialization code

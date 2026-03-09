# Technical Contracts

## Socket.IO Events

All events use domain-prefixed naming: `domain:action`.

### Authentication & Users
| Event | Direction | Payload | Handler |
|-------|-----------|---------|---------|
| `join` | Client→Server | `{ token }` | auth.js |
| `disconnect` | Client→Server | — | auth.js |
| `user:update` | Client→Server | `{ field, value }` | auth.js |
| `user:change-password` | Client→Server | `{ currentPassword, newPassword }` | auth.js |

### Servers
| Event | Direction | Payload | Handler |
|-------|-----------|---------|---------|
| `server:create` | Client→Server | `{ name, icon? }` | servers.js |
| `server:update` | Client→Server | `{ serverId, updates }` | servers.js |
| `server:delete` | Client→Server | `{ serverId }` | servers.js |
| `server:join` | Client→Server | `{ inviteCode }` | servers.js |
| `server:leave` | Client→Server | `{ serverId }` | servers.js |
| `server:kick` | Client→Server | `{ serverId, userId }` | servers.js |
| `server:ban` | Client→Server | `{ serverId, userId, reason? }` | servers.js |
| `server:timeout` | Client→Server | `{ serverId, userId, duration }` | servers.js |

### Channels
| Event | Direction | Payload | Handler |
|-------|-----------|---------|---------|
| `channel:create` | Client→Server | `{ serverId, name, type, categoryId? }` | channels.js |
| `channel:update` | Client→Server | `{ channelId, updates }` | channels.js |
| `channel:delete` | Client→Server | `{ channelId }` | channels.js |

### Messages
| Event | Direction | Payload | Handler |
|-------|-----------|---------|---------|
| `message:send` | Client→Server | `{ channelId, content, attachments? }` | messages.js |
| `message:edit` | Client→Server | `{ messageId, content }` | messages.js |
| `message:delete` | Client→Server | `{ messageId }` | messages.js |
| `message:react` | Client→Server | `{ messageId, emoji }` | messages.js |
| `message:pin` | Client→Server | `{ messageId }` | messages.js |
| `message:search` | Client→Server | `{ query, filters }` | messages.js |

### Voice & WebRTC
| Event | Direction | Payload | Handler |
|-------|-----------|---------|---------|
| `voice:join` | Client→Server | `{ channelId }` | voice.js |
| `voice:leave` | Client→Server | — | voice.js |
| `voice:signal` | Client→Server | `{ targetUserId, signal }` | voice.js |
| `voice:mute` | Client→Server | `{ muted }` | voice.js |
| `voice:deafen` | Client→Server | `{ deafened }` | voice.js |

### Direct Messages
| Event | Direction | Payload | Handler |
|-------|-----------|---------|---------|
| `dm:create` | Client→Server | `{ recipientId }` | dms.js |
| `dm:message` | Client→Server | `{ channelId, content }` | dms.js |
| `dm:call` | Client→Server | `{ channelId }` | dms.js |

### Social
| Event | Direction | Payload | Handler |
|-------|-----------|---------|---------|
| `friend:request` | Client→Server | `{ targetUserId }` | social.js |
| `friend:accept` | Client→Server | `{ requestId }` | social.js |
| `typing:start` | Client→Server | `{ channelId }` | messages.js |
| `typing:stop` | Client→Server | `{ channelId }` | messages.js |

## REST API

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/auth/register` | No | Create account |
| POST | `/api/auth/login` | No | Authenticate |
| POST | `/api/auth/logout` | Yes | Invalidate session |
| POST | `/api/user/avatar` | Yes | Upload avatar (base64) |
| POST | `/api/server/:serverId/icon` | Yes | Upload server icon |
| POST | `/api/webhooks/:id/:token` | Token | Webhook message (10/10s limit) |
| GET | `/api/gifs/search` | Yes | Giphy search proxy |
| GET | `/api/gifs/trending` | Yes | Giphy trending proxy |
| GET | `/api/og` | Yes | URL preview with SSRF protection |
| GET | `/api/metrics` | Admin | Application metrics |
| GET | `/health` | No | Server health check |
| GET | `/api/health` | No | API health check |

## Database Schema (Key Tables)

| Table | Primary Key | Key Columns |
|-------|------------|-------------|
| accounts | id (UUID) | username, email, password_hash, public_key |
| servers | id (UUID) | name, owner_id, icon_url |
| channels | id (UUID) | server_id, name, type, category_id, position |
| messages | id (UUID) | channel_id, author_id, content, attachments (JSONB) |
| roles | id (UUID) | server_id, name, permissions (JSONB), position |
| dm_channels | id (UUID) | type (dm/group), participants (JSONB) |
| voice_channels | — | Managed in-memory via state.js |
| moderation_rules | id (UUID) | server_id, type, config (JSONB), action |

Global rate limit: 10 requests per 10 seconds on `/api/*`

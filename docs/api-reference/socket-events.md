# Socket.IO Events

Nexus uses Socket.IO for all real-time communication. Events are domain-prefixed.

## Connection

Connect to the Socket.IO server at port 3001 (production) or 3003 (development):

```javascript
const socket = io('https://nexus.example.com:3001', {
  auth: { token: 'your-jwt-token' }
});
```

## Event Domains

Events are organized by handler module:

### Authentication (`auth.js`)

| Event | Direction | Description |
|-------|-----------|-------------|
| `join` | Client → Server | Authenticate and join with token |
| `disconnect` | Bidirectional | User disconnected |
| `user:update` | Client → Server | Update profile (username, avatar, color, bio) |
| `user:password-change` | Client → Server | Change password |
| `user:settings-update` | Client → Server | Update user settings (theme, etc.) |

### Servers (`servers.js`)

| Event | Direction | Description |
|-------|-----------|-------------|
| `server:create` | Client → Server | Create a new server |
| `server:update` | Client → Server | Update server settings |
| `server:delete` | Client → Server | Delete a server |
| `server:join` | Client → Server | Join via invite |
| `server:leave` | Client → Server | Leave a server |
| `server:kick` | Client → Server | Kick a member |
| `server:ban` | Client → Server | Ban a member |
| `server:timeout` | Client → Server | Timeout a member |

### Channels (`channels.js`)

| Event | Direction | Description |
|-------|-----------|-------------|
| `channel:create` | Client → Server | Create a channel |
| `channel:update` | Client → Server | Update channel settings |
| `channel:delete` | Client → Server | Delete a channel |
| `category:create` | Client → Server | Create a category |

### Messages (`messages.js`)

| Event | Direction | Description |
|-------|-----------|-------------|
| `message:send` | Client → Server | Send a message |
| `message:edit` | Client → Server | Edit a message |
| `message:delete` | Client → Server | Delete a message |
| `message:react` | Client → Server | Add/remove reaction |
| `message:pin` | Client → Server | Pin/unpin a message |
| `message:search` | Client → Server | Search messages |
| `typing:start` | Client → Server | Start typing indicator |
| `typing:stop` | Client → Server | Stop typing indicator |

### Roles (`roles.js`)

| Event | Direction | Description |
|-------|-----------|-------------|
| `role:create` | Client → Server | Create a role |
| `role:update` | Client → Server | Update role permissions/settings |
| `role:delete` | Client → Server | Delete a role |
| `role:assign` | Client → Server | Assign role to member |
| `role:remove` | Client → Server | Remove role from member |

### Direct Messages (`dms.js`)

| Event | Direction | Description |
|-------|-----------|-------------|
| `dm:create` | Client → Server | Start a DM conversation |
| `dm:list` | Client → Server | List DM conversations |
| `dm:message` | Client → Server | Send a DM |
| `dm:group-create` | Client → Server | Create a group DM |
| `dm:call` | Client → Server | Start a DM call |

### Social (`social.js`)

| Event | Direction | Description |
|-------|-----------|-------------|
| `friend:request` | Client → Server | Send friend request |
| `friend:accept` | Client → Server | Accept friend request |
| `friend:remove` | Client → Server | Remove friend |
| `block:add` | Client → Server | Block a user |
| `block:remove` | Client → Server | Unblock a user |
| `report:create` | Client → Server | Report a user |

### Voice (`voice.js`)

| Event | Direction | Description |
|-------|-----------|-------------|
| `voice:join` | Client → Server | Join a voice channel |
| `voice:leave` | Client → Server | Leave voice channel |
| `voice:signal` | Bidirectional | WebRTC signaling (offer/answer/ICE) |
| `voice:mute` | Client → Server | Toggle mute state |
| `voice:deafen` | Client → Server | Toggle deafen state |
| `voice:screen-share` | Client → Server | Start/stop screen sharing |

### Other Handlers

| Handler | Event Prefix | Description |
|---------|-------------|-------------|
| `webhooks.js` | `webhook:*` | Webhook CRUD |
| `emoji.js` | `emoji:*` | Custom emoji CRUD |
| `admin.js` | `admin:*` | Platform admin operations |
| `bookmarks.js` | `bookmark:*` | Bookmark management |
| `audit.js` | `audit:*` | Audit log retrieval |

## Related

- [REST API](rest-api.md) — HTTP endpoints
- [Webhook API](webhook-api.md) — Webhook reference

# Nexus v2.0 - Complete Overhaul

## 🔐 Authentication System
- **User registration** with secure password hashing
- **Login system** with token-based sessions
- Guest mode still available for quick testing
- Passwords are salted and hashed with HMAC-SHA256

## 🎨 Custom Avatars & Icons
- Upload custom profile pictures (base64 images)
- Upload custom server icons
- HTTP endpoints: POST `/api/user/avatar` and POST `/api/server/:id/icon`

##  Categories & Channel Organization
- Channels grouped into collapsible categories (e.g., GENERAL, VOICE)
- Create/rename/delete categories
- Drag channels between categories (via channel:reorder event)
- Channels have position property for custom ordering

## 🔒 Advanced Permissions
- **Channel-level permission overrides** per role
- Permissions: viewChannel, sendMessages, attachFiles, joinVoice, readHistory, addReactions, mentionEveryone, manageMessages
- Private channels (isPrivate flag)
- First server creator automatically gets admin role

## 👥 Role Management
- Assign/remove roles from members via Settings
- Role hierarchy with position property
- manageRoles permission required to edit roles

## 🖼 Image Handling
- **GIF support** - Animated GIFs play in chat
- **Image modal** - Click images to view fullscreen
- Paste/drag-drop up to 4 images per message
- Images sent as base64 data URLs

##  Webhooks (FIXED + SECURED)
- Endpoint now at `/api/webhooks/:id/:token` (token-authenticated)
- Cryptographic token (64-char hex) generated at creation, shown once
- Webhooks persisted to PostgreSQL `webhooks` table (survive restarts)
- Loaded from DB on server startup and attached to channel objects
- Proper CORS and express.json middleware
- POST with `{"content":"message", "username":"BotName"}`
- Messages show with BOT badge
- 401 response for invalid/missing token (previously anyone with UUID could post)

##  UI Improvements
- **Toggle right sidebar** to hide member list
- Category collapse/expand
- Voice cue sounds on join/leave
- Improved screen share (no more black screen)
- Server list shows custom icons
- Channel webhook indicator ()

##  Technical Fixes
- Screen share: removed audio:true from getDisplayMedia for window captures
- WebRTC: proper sender track management
- Auth tokens stored in localStorage
- Multi-server state management
- ESLint exhaustive-deps disabled properly

##  Server State Structure
```javascript
state = {
  accounts: {},      // username -> account with passwordHash
  tokens: {},        // token -> accountId
  users: {},         // socketId -> online user session
  servers: {         // serverId -> server
    categories: {},  // categoryId -> {name, position, channels:[]}
    roles: {},       // roleId -> {name, color, position, permissions}
    members: {},     // userId -> {roles:[], joinedAt}
    channels: {
      text: [],      // with permissionOverrides, isPrivate
      voice: []
    }
  },
  messages: {},
  voiceChannels: {}
}
```

##  Quick Start
```bash
cd nexus
./start.sh
# Visit http://localhost:3000
# Register a new account or join as guest
```

## Known Limitations
- No persistent database (in-memory only)
- Avatar uploads limited to base64 (no file server)
- Drag-drop channel reorder requires UI implementation (backend ready)
- No DMs yet (server-wide only)

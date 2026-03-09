# Component Map

## Server Components

### Core Infrastructure
| Component | File(s) | Responsibility | Dependencies |
|-----------|---------|----------------|-------------|
| Express App | index.js | HTTP server, REST routes, middleware, Socket.IO wiring | All below |
| Config | config.js | Environment loading & validation | None |
| Database | db.js | PostgreSQL queries (100+ functions), connection pooling | config.js |
| State | state.js | In-memory runtime state, O(1) user/channel indexes | None |
| Logger | logger.js | Winston structured logging, daily rotation | config.js |
| Metrics | metrics.js | Application metrics collection, rolling windows | None |
| Validation | validation.js | Input sanitization for all user data | None |
| Permissions | utils.js | Role hierarchy, channel overrides, permission checks | db.js |
| Helpers | helpers.js | Serialization, slash commands, rate limiting | db.js, state.js, utils.js |

### Handler Modules (server/handlers/)
Each exports `function(io, socket)` and registers Socket.IO event listeners.

| Handler | Events | DB Tables Touched | State Modified |
|---------|--------|-------------------|----------------|
| auth.js | join, disconnect, user:* | accounts | users, userIdToSocketId |
| servers.js | server:* | servers, server_members, server_bans | servers |
| channels.js | channel:* | channels, categories | channelToServer |
| messages.js | message:*, typing:* | messages | messages |
| roles.js | role:* | roles, member_roles | — |
| dms.js | dm:* | dm_channels, dm_messages | — |
| social.js | friend:*, block:*, report:* | friends, blocks, reports, invites | — |
| voice.js | voice:*, soundboard:* | soundboard_sounds | voiceChannels |
| webhooks.js | webhook:* | webhooks | — |
| emoji.js | emoji:* | custom_emoji | — |
| admin.js | admin:* | accounts, servers | — |
| bookmarks.js | bookmark:* | bookmarks | — |
| audit.js | audit:* | audit_log | — |

### Handler Dependencies
```
auth.js ──▶ state.js (addUser/removeUser)
         ──▶ helpers.js (leaveVoice)
         ──▶ db.js (account queries)

messages.js ──▶ state.js (messages cache)
            ──▶ helpers.js (slash commands)
            ──▶ validation.js (input sanitization)

voice.js ──▶ state.js (voiceChannels)
         ──▶ helpers.js (leaveVoice)

servers.js ──▶ state.js (servers, channelToServer)
           ──▶ helpers.js (serializeServer)
           ──▶ db.js (transaction for server:create)
```

## Client Components

### Core
| Component | File | Size | Responsibility |
|-----------|------|------|----------------|
| App | App.js | 77KB | Global state hub, routing, all state management |
| ChatArea | ChatArea.js | 65KB | Message display, input, attachments, reactions |
| useWebRTC | useWebRTC.js | 53KB | WebRTC peer management, voice/video/screen |
| SettingsModal | SettingsModal.js | — | 10-tab settings panel |
| Config | config.js | — | Server URL resolution per platform |

### Component Boundaries

The client has a hub-and-spoke architecture centered on App.js:
- App.js manages all global state and passes it down as props
- ChatArea.js manages its own message rendering state
- useWebRTC.js manages WebRTC connections independently
- SettingsModal.js is a self-contained settings UI

No shared state library (Redux, Context) — all state flows through App.js props.

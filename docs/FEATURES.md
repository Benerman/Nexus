# Nexus Chat - Complete Feature Documentation

**Version**: 1.0.0 | **Last Updated**: February 16, 2026

---

## Table of Contents

1. [Project Overview & Tech Stack](#1-project-overview--tech-stack)
2. [Infrastructure & Deployment](#2-infrastructure--deployment)
3. [Authentication System](#3-authentication-system)
4. [Messaging System](#4-messaging-system)
5. [Voice & Video System](#5-voice--video-system)
6. [Server Management](#6-server-management)
7. [Categories & Channels](#7-categories--channels)
8. [Roles & Permissions](#8-roles--permissions)
9. [Webhooks](#9-webhooks)
10. [Direct Messaging](#10-direct-messaging)
11. [Friend System](#11-friend-system)
12. [User Management & Profiles](#12-user-management--profiles)
13. [User Interface Components](#13-user-interface-components)
14. [Socket.IO Events Reference](#14-socketio-events-reference)
15. [REST API Endpoints](#15-rest-api-endpoints)
16. [Database Schema](#16-database-schema)
17. [Security Features](#17-security-features)
18. [Styling & Theming](#18-styling--theming)
19. [Performance Optimizations](#19-performance-optimizations)
20. [File Structure](#20-file-structure)
21. [Feature Status Summary](#21-feature-status-summary)

---

## 1. Project Overview & Tech Stack

Nexus Chat is a modern, real-time communication platform with full messaging, voice, video, and server management capabilities.

### Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend | React | 18.x |
| Real-time Communication | Socket.IO | Latest |
| Voice/Video | WebRTC | Native Browser API |
| Backend | Express (Node.js) | Latest |
| Database | PostgreSQL | 15 |
| Cache/Sessions | Redis | 7 |
| Reverse Proxy | Nginx | Alpine |
| Containerization | Docker Compose | Multi-container |
| Markdown Rendering | react-markdown | With rehype-sanitize |

---

## 2. Infrastructure & Deployment

### 2.1 Multi-Container Docker Setup

1. **PostgreSQL Container** (`nexus-chat-postgres`)
   - Port: 5432
   - Database name: `nexus_db`
   - Persistent volume: `postgres-data`
   - Health checks enabled with `pg_isready`

2. **Redis Container** (`nexus-chat-redis`)
   - Port: 6379
   - Persistence: AOF (Append Only File) enabled
   - Persistent volume: `redis-data`
   - Health checks enabled with `redis-cli ping`

3. **Backend Server** (`nexus-chat-server`)
   - Port: 3001
   - Framework: Express + Socket.IO
   - Custom docker-entrypoint.sh for startup sequencing
   - Depends on PostgreSQL and Redis health checks

4. **Frontend Client** (`nexus-chat-client`)
   - Port: 3000 (maps to internal port 80)
   - Multi-stage build: Node.js builder + Nginx runtime
   - Custom nginx.conf with WebSocket proxy support
   - Serves optimized React production build

### 2.2 Nginx Reverse Proxy Configuration

- WebSocket upgrade support for Socket.IO
- Proxy pass to backend server for `/api/` and `/socket.io/` routes
- Content Security Policy headers enforced
- Gzip compression enabled
- Static file caching with proper MIME types
- SPA fallback: all routes serve `index.html`

### 2.3 Environment Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3001 | Server port |
| `NODE_ENV` | development | Environment mode |
| `DATABASE_URL` | postgresql://... | PostgreSQL connection string |
| `REDIS_URL` | redis://localhost:6379 | Redis connection string |
| `CLIENT_URL` | http://localhost:3000 | Frontend URL for CORS |
| `JWT_SECRET` | (required) | Token signing secret |
| `SESSION_EXPIRY` | 604800000 | Token TTL (7 days in ms) |
| `REFRESH_EXPIRY` | 2592000000 | Refresh TTL (30 days in ms) |
| `MAX_MESSAGE_LENGTH` | 2000 | Max message character count |
| `MAX_ATTACHMENTS` | 4 | Max attachments per message |
| `MAX_ATTACHMENT_SIZE` | 10485760 | Max file size (10MB) |
| `ENABLE_GUEST_MODE` | true | Allow guest access |
| `RATE_LIMIT_MESSAGES` | 10 | Messages per rate window |
| `RATE_LIMIT_WINDOW` | 10000 | Rate window (10s in ms) |
| `LOG_LEVEL` | info | Logging verbosity |

---

## 3. Authentication System

### 3.1 User Registration

- **Endpoint**: `POST /api/auth/register`
- Username validation: 3-32 characters, alphanumeric plus underscore/hyphen
- Password requirement: Minimum 8 characters
- Password hashing: HMAC-SHA256 with random 16-byte salt
- Auto-assigned on creation:
  - Random avatar emoji from curated set
  - Random display color from palette (#3B82F6, #57F287, #FEE75C, #ED4245, #EB459E, etc.)
  - Unique UUID identifier
- Returns: Authentication token + account object

### 3.2 User Login

- **Endpoint**: `POST /api/auth/login`
- Credential validation against stored hash + salt
- Returns: Authentication token + full account object (including custom avatar)
- Error handling: 401 for invalid credentials

### 3.3 Session Management

- Token storage in browser `localStorage` (`nexus_token`, `nexus_username`)
- Auto-restoration on page refresh (checks localStorage and reconnects via Socket.IO)
- Token expiration: 7 days (configurable)
- Backend validates token against database for active/non-expired status
- Logout clears localStorage and disconnects socket

### 3.4 Guest Mode

- Username-only access (no password required)
- Token remains null
- Can read messages and participate in real-time
- Can send messages
- Cannot create servers or perform persistent modifications

---

## 4. Messaging System

### 4.1 Message Structure

```
Message Object:
  - id: UUID (unique identifier)
  - channelId: UUID (parent channel)
  - content: String (max 2000 characters)
  - author: Object
    - id: UUID
    - username: String
    - avatar: Emoji character
    - color: Hex color code
    - customAvatar: Base64 image (optional)
    - isWebhook: Boolean
  - timestamp: Milliseconds since epoch
  - reactions: Object (emoji -> array of user IDs)
  - attachments: Array of attachment objects
  - replyTo: Message ID (optional, for threaded replies)
  - editedAt: Timestamp (optional, set on edit)
  - isWebhook: Boolean
  - isGrouped: Boolean (UI grouping flag)
```

### 4.2 Sending Messages

- Socket event: `message:send`
- Payload includes channelId, content, attachments, and optional replyTo
- Server-side rate limiting per user
- Broadcasts `message:new` to all users in channel
- Auto-scroll to bottom on new message in active channel

### 4.3 Message Reactions

- 8 quick-pick emoji: like, heart, laugh, wow, sad, fire, party, 100
- Socket event: `message:react`
- Toggle logic: adds or removes user based on presence in reaction array
- Broadcasts `message:reaction` with updated reaction state
- Visual: emoji badges with count, highlighted if current user reacted

### 4.4 Message Editing

- Socket event: `message:edit`
- Only the message author can edit
- Sets `editedAt` timestamp (displayed as "(edited)" in UI)
- Broadcasts `message:edited` to channel
- Inline edit mode with text input replacement

### 4.5 Message Deletion

- Socket event: `message:delete`
- Permitted by: message author or server admin
- Broadcasts `message:deleted` to channel
- Message removed from UI immediately

### 4.6 Reply / Thread System

- Reply context preserved in message via `replyTo` field
- Replied message shown as collapsed preview above the reply
- Click on reply preview to jump to and highlight original message
- Highlight animation: 2-second yellow fade on target message
- Click username anywhere in chat opens user context menu

### 4.7 Image & GIF Attachments

- Supported formats: PNG, JPG, JPEG, GIF, WebP
- Storage method: Base64 data URLs (in-memory)
- Upload methods:
  - File picker button in chat input
  - Drag-and-drop onto chat area
- Limits:
  - 4 attachments per message
  - GIFs: 5MB max
  - Other images: 10MB max
- GIF handling: Native `<img>` animation
- Lightbox modal: Click any image to expand fullscreen with download button
- Attachment validation: Extension/MIME type checking, size validation

### 4.8 Typing Indicators

- Socket event: `typing:start` emitted on input activity
- Socket event: `typing:stop` emitted after 1500ms of inactivity
- Display: "Username is typing..." below message list
- Real-time sync across all channel members
- Auto-clears when message is sent

### 4.9 Message History

- Last 50 messages loaded on channel join via `channel:history`
- Messages sorted chronologically
- Grouped by author: consecutive messages from same user within 5 minutes are visually grouped
- Per-channel cache in React state
- In-memory on server (cleared on restart)

### 4.10 Message Grouping & Date Separators

- Same-author grouping: messages within 5 minutes show without repeated avatar/name
- Date separators: "Today", "Yesterday", or formatted date between message groups
- Visual: grouped messages have reduced top padding, no avatar shown

---

## 5. Voice & Video System

### 5.1 WebRTC Configuration

- STUN servers: Google public STUN (`stun.l.google.com:19302`, `stun1.l.google.com:19302`)
- Codec negotiation: Automatic browser selection
- Audio context: 48kHz sample rate or system default
- FFT buffer size: 256 for speaking detection analysis

### 5.2 Voice Channels

- Channel type: `voice`
- Properties: id, name, serverId, categoryId, isPrivate, permissionOverrides
- Real-time user list displayed below channel name in sidebar
- User avatars and status shown in channel listing
- Voice channel state tracking: `{users: [...], screenSharerId: null}`

### 5.3 Microphone & Audio Controls

- **Mute**: Disables local microphone (can still hear others)
- **Deafen**: Disables both microphone AND speaker output (complete isolation)
- State persistence: saved in localStorage (`nexus_voice_muted`, `nexus_voice_deafened`)
- Deafen remembers previous mute state and restores on undeafen
- Visual indicators: muted/deafened icons on user tiles

### 5.4 Audio Join/Leave Cues

- Join cue: Rising two-tone beep (600Hz to 900Hz)
- Leave cue: Falling two-tone beep (900Hz to 600Hz)
- Duration: 300ms per tone with exponential fade-out
- Volume: 15% to prevent distortion
- Generated via Web Audio API oscillators

### 5.5 Speaking Detection

- Real-time frequency analysis using Web Audio API AnalyserNode
- FFT size: 256
- Update interval: 100ms
- Threshold: average frequency data > 15 marks user as "speaking"
- Visual indicator: green border on speaking user's video tile

### 5.6 Screen Sharing

- Uses `navigator.mediaDevices.getDisplayMedia()` API
- Socket events: `screen:start`, `screen:stop`, `screen:started`, `screen:stopped`
- Creates separate RTCRtpSender for screen stream
- Supports both video (screen) and audio (microphone) simultaneously
- Separate, larger video tile labeled "SCREEN" for screen shares
- Click to toggle fullscreen on screen share tiles

### 5.7 Per-User Audio Controls

- Volume slider: 0-100% per remote user
- Local mute button: mute individual remote users locally
- State persistence in localStorage (`nexus_user_volumes`, `nexus_local_muted`)
- Controls visible on hover/touch over user tile

### 5.8 Video Tile Layout

- CSS Grid layout: auto-fills available space
- Base tile size: 240x240px
- Speaking users: green border highlight animation
- Screen share tiles: larger, with "SCREEN" label
- Name label at bottom of each tile
- Mute/deafen status icons at top-right of tile
- Responsive: adapts to number of participants

### 5.9 WebRTC Peer Management

- ICE candidates exchanged via Socket.IO signaling
- Standard offer/answer SDP negotiation
- Connection state monitoring: watches for 'disconnected', 'failed', 'closed'
- Automatic cleanup on user leave
- Per-peer audio element management via AudioPlayer components
- Individual audio elements with volume control per remote user

---

## 6. Server Management

### 6.1 Server Creation

- Socket event: `server:create`
- Payload: `{name, icon, customIcon}`
- Creator automatically becomes owner + admin
- Default categories auto-created:
  - **GENERAL** category with channels: `#general`, `#announcements`
  - **VOICE** category with channels: `Lounge`, `Gaming`
- Server appears in all members' server lists immediately

### 6.2 Server Object Structure

```
Server:
  - id: UUID
  - name: String
  - icon: Emoji character
  - customIcon: Base64 image (optional)
  - ownerId: UUID
  - description: String
  - createdAt: Timestamp
  - categories: Object (categoryId -> category object)
  - categoryOrder: Array of category IDs (for ordering)
  - roles: Object (roleId -> role object)
  - members: Object (userId -> {roles: [...], joinedAt: timestamp})
  - channels: {text: [...], voice: [...]}
```

### 6.3 Server Editing

- Socket event: `server:update`
- Editable fields: name, icon, description, customIcon
- Permissions: owner or admin only
- Broadcasts `server:updated` to all server members

### 6.4 Server Icon Upload

- REST endpoint: `POST /api/server/:serverId/icon`
- Authorization: Bearer token in header
- Accepts base64 data URL images
- Owner or admin permission required
- Returns updated `customIcon` field

### 6.5 Server Deletion

- Owner only permission
- Socket event: `server:delete`
- Cascading: removes server from all members' server lists
- All channels, messages, roles, and categories deleted

### 6.6 Server Membership

- **Join**: Automatic on server creation; added to @everyone role; join timestamp recorded
- **Leave**: Socket event `server:leave`; removed from all roles; broadcasts member removal
- **Kick/Ban/Timeout**: Admin-only context menu options (moderation tools)

---

## 7. Categories & Channels

### 7.1 Categories

- Organizational containers for channels within a server
- Properties: id, name, position, channel list
- Collapsible in sidebar UI
- Collapse state persisted in localStorage
- Operations: create, rename, delete, reorder
- Position-based ordering for drag-drop readiness

### 7.2 Text Channels

- Type: `text`
- Properties: id, name, description, topic, serverId, categoryId, NSFW flag, slowMode, isPrivate
- Channel name convention: lowercase with hyphens
- Default channels: `#general`, `#announcements`
- Private channels show lock icon in sidebar
- Channels with webhooks show "LINK" indicator

### 7.3 Voice Channels

- Type: `voice`
- Same base properties as text channels
- Joining triggers WebRTC peer connection setup
- Real-time user list displayed in sidebar below channel name
- Default channels: `Lounge`, `Gaming`
- User count displayed next to channel name

### 7.4 Channel Operations

| Operation | Socket Event | Details |
|-----------|-------------|---------|
| Create | `channel:create` | Specify name, type, serverId, categoryId |
| Update | `channel:update` | Edit name, description, category, private flag |
| Delete | `channel:delete` | Removes channel and all messages |
| Reorder | `channel:reorder` | Change position and/or parent category |
| Join | `channel:join` | Subscribe to channel events, receive history |

### 7.5 Channel Permissions

- `isPrivate` boolean flag
- Per-channel permission overrides per role
- Three override states: inherit (null), allow (true), deny (false)
- Backend enforcement via `getUserPerms(userId, serverId, channelId)`

---

## 8. Roles & Permissions

### 8.1 Default Roles

1. **@everyone** (base role)
   - ID: `everyone`
   - Position: 0 (lowest priority)
   - Default permissions: viewChannel, sendMessages, attachFiles, joinVoice, readHistory, addReactions

2. **Admin** (auto-created for server owner)
   - ID: `admin`
   - Position: 1
   - Color: #ED4245 (red)
   - All permissions enabled

### 8.2 Permission Types (12 Total)

| Permission | Description |
|-----------|-------------|
| `viewChannel` | Can see channel in sidebar |
| `sendMessages` | Can send text messages |
| `attachFiles` | Can upload images/attachments |
| `joinVoice` | Can join voice channels |
| `readHistory` | Can read message history |
| `addReactions` | Can react to messages |
| `mentionEveryone` | Can use @everyone mentions |
| `manageMessages` | Can delete others' messages |
| `manageChannels` | Can create/edit/delete channels |
| `manageRoles` | Can create/edit roles |
| `manageServer` | Can edit server settings |
| `admin` | Full unrestricted access (overrides all) |

### 8.3 Role Operations

| Operation | Socket Event | Permissions Required |
|-----------|-------------|---------------------|
| Create Role | `role:create` | Admin or manageRoles |
| Update Role | `role:update` | Admin or manageRoles |
| Delete Role | `role:delete` | Admin or manageRoles (cannot delete @everyone) |
| Assign Role | `member:role` | Admin or owner |
| Remove Role | `member:role` | Admin or owner |

### 8.4 Permission Resolution

- Owner and admin: all permissions automatically granted
- Role hierarchy: higher position number = higher priority
- Channel overrides applied after server-level permissions
- Backend function: `getUserPerms(userId, serverId, channelId?)` resolves final permissions

---

## 9. Webhooks

### 9.1 Webhook Management

- Created via Settings Modal, Webhooks tab
- Socket event: `webhook:create` with `{serverId, channelId, name}`
- Auto-generated unique webhook ID and cryptographic token (32 random bytes, hex-encoded)
- URL format: `/api/webhooks/:webhookId/:token`
- Token is shown only once at creation time — copy-to-clipboard button provided
- Webhooks are persisted to the PostgreSQL `webhooks` table and survive server restarts
- Loaded from DB on server startup and attached to their channel objects
- Delete webhook via settings (removes from both in-memory state and DB)

### 9.2 Webhook Object

```
Webhook (in-memory):
  - id: UUID
  - name: String (max 32 chars)
  - channelId: UUID
  - createdBy: UUID (user who created it)
  - createdAt: Timestamp

Webhook (database row — additional fields):
  - token: String (64-char hex, used for authentication)
  - avatar: String (optional default avatar)
```

> **Note:** The token is never sent to clients or included in `channel:updated` events.
> It is only returned once in the `webhook:created` response as part of the full URL.

### 9.3 Webhook HTTP Endpoint

- **URL**: `POST /api/webhooks/:webhookId/:token`
- **Authentication**: The `:token` path parameter authenticates the request. No other auth headers needed.
- **Rate Limit**: 10 requests per 10 seconds (shared `/api` rate limiter)

**Request Payload**:
```json
{
  "content": "Message text (max 2000 chars). Required if no embeds.",
  "username": "Optional bot name (max 32 chars)",
  "avatar": "Optional emoji (default: 🤖)",
  "avatar_url": "Optional avatar image URL",
  "embeds": [{"title": "...", "description": "...", "color": 5763719}],
  "tts": false,
  "attachments": [
    {
      "url": "https://example.com/image.png",
      "name": "image.png",
      "type": "image/png"
    }
  ]
}
```

**Response Codes**:
- 200: Success — `{id, success: true, username}`
- 400: Missing or invalid content / invalid payload
- 401: Invalid webhook ID or token
- 429: Rate limited

**Example**:
```bash
curl -X POST http://localhost:3001/api/webhooks/WEBHOOK_ID/TOKEN \
  -H "Content-Type: application/json" \
  -d '{"content": "Hello!", "username": "MyBot"}'
```

### 9.4 Webhook Message Display

- Messages show with "BOT" badge in chat
- Custom username displayed instead of real user
- Avatar emoji or image URL shown on message
- Supports up to 4 validated attachments
- Supports up to 10 embeds (Discord-compatible format)
- Content trimmed to 2000 characters
- @mentions, @roles, and #channel references are parsed and rendered

### 9.5 Built-in Documentation

- WebhookDocs component with usage examples
- Code samples for cURL, JavaScript (fetch), and Python (requests)
- Accessible from the Webhooks settings tab via "View Documentation" button

### 9.6 Security

- Webhook authentication uses a 64-character cryptographic token (32 bytes from `crypto.randomBytes`)
- Tokens are stored in the database alongside the webhook, never exposed to other clients
- The full URL (including token) is only shown once at creation time
- Webhook messages are saved to the database with `is_webhook = true` and `author_id = null`
- Keep your webhook URL secret — anyone with the full URL can post to the channel

---

## 10. Direct Messaging

### 10.1 DM Infrastructure

- Virtual "Personal Server" created per user
  - ID format: `personal:{userId}`
  - Server name: "Direct Messages"
  - Icon: speech bubble emoji
  - Private to owner only

### 10.2 DM Channel Types

**1-on-1 DM**:
```
  - id: UUID
  - type: 'dm'
  - isDM: true
  - name: Other user's username
  - participant: {id, username, avatar, color, status, bio}
  - lastMessage: {id, content, timestamp, authorId}
  - unreadCount: Number
  - createdAt: Timestamp
```

**Group DM** (3+ participants):
```
  - id: UUID
  - type: 'group-dm'
  - isDM: true
  - isGroup: true
  - name: Custom name or comma-separated usernames
  - participants: Array of user objects
  - lastMessage: Object
  - unreadCount: Number
  - createdAt: Timestamp
```

### 10.3 DM Features

- **New Conversation Button**: Prominent button below DM search to start new conversations
- **New Conversation Modal**: Popup to enter username, verify user exists, and create DM
  - Username validation (exists check, self-DM prevention, duplicate check)
  - Error messages for invalid states
  - Enter key to submit, click outside to close
- **DM Search**: Filter conversations by name or username with clear button
- **Autocomplete**: Search suggestions showing online users, friends prioritized
- **Unread Tracking**: Per-channel unread message counts with badge display
- **Last Message Preview**: Shows truncated last message and timestamp in DM list
- **Sorting**: DMs sorted by most recent activity
- **Status Indicators**: Online/offline status shown for each participant

### 10.4 DM Socket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `dm:create` | Client -> Server | Create DM channel |
| `dm:list` | Client -> Server | List all DM channels |
| `dm:close` | Client -> Server | Close/archive DM |
| `dm:created` | Server -> Client | New DM created |
| `dm:unread-counts` | Server -> Client | Unread counts per channel |
| `dm:updated` | Server -> Client | DM info changed |

---

## 11. Friend System

### 11.1 Friend Operations

| Operation | Socket Event | Description |
|-----------|-------------|-------------|
| Send Request | `friend:request` | Send friend request by user ID |
| Accept Request | `friend:accept` | Accept incoming request |
| Reject Request | `friend:reject` | Decline incoming request |
| Remove Friend | `friend:remove` | Unfriend a user |
| List Friends | `friend:list` | Get friends and pending requests |
| Block User | `friend:block` | Block a user |
| Unblock User | `friend:unblock` | Remove block |
| Report User | `friend:report` | Report user for violations |

### 11.2 Friend Object

```
Friend:
  - id: UUID
  - friendId: UUID
  - username: String
  - avatar: Emoji
  - customAvatar: Base64 image
  - color: Hex color
  - status: 'online' | 'offline'
  - bio: String
```

### 11.3 Friend UI (Settings Tab)

- Current friends list with online status
- Pending friend requests with accept/reject buttons
- Add friend by username input
- Remove friend button per entry
- Search/filter friends
- Toast notifications for friend events

---

## 12. User Management & Profiles

### 12.1 User Object

```
User:
  - id: UUID
  - username: String
  - avatar: Emoji character
  - customAvatar: Base64 image (optional)
  - color: Hex color code
  - bio: String
  - status: 'online' | 'offline' | 'idle' | 'dnd' | 'invisible'
  - socketId: String (when connected)
  - roles: Array of role IDs (per-server)
  - isGuest: Boolean
  - isWebhook: Boolean
```

### 12.2 Profile Customization

- **Avatar Upload**: `POST /api/user/avatar` with base64 data URL
  - Accepted formats: PNG, JPG, GIF, WebP
  - Max display: 128x128px
- **Color Selection**: 12 preset colors for username display
- **Bio**: Short profile description text
- **Status**: Dropdown with online, offline, idle, DND options

### 12.3 User Status Types

| Status | Color | Description |
|--------|-------|-------------|
| Online | Green | User is active |
| Offline | Gray | User not connected |
| Idle | Yellow | Away from keyboard |
| DND | Red | Do Not Disturb |
| Invisible | Gray | Hidden but connected |

### 12.4 Online User Tracking

- Real-time tracking via `user:joined` and `user:left` socket events
- Per-server member lists maintained
- Used for: member sidebar, DM status indicators, voice user lists
- Full user objects broadcast including status updates

---

## 13. User Interface Components

### 13.1 Main Application Layout

```
+--------------------------------------------------+
|                      App                          |
+--------+---------------------------+--------------+
| Server |                           | Member       |
| List   |   Main Content Area       | List         |
| (left) |   (Chat / Voice)          | (right)      |
|        |                           |              |
+--------+---------------------------+--------------+
|        |      User Panel           |              |
+--------+---------------------------+--------------+
```

### 13.2 Server List (Left Rail)

- Vertical list of server icons
- Home/Personal server button at top (hexagon icon)
- Visual separator between personal and other servers
- Active server indicator: pill/highlight on right side
- Hover tooltips with server names
- "+" button at bottom to create new server
- Custom server icons displayed (emoji or uploaded image)

### 13.3 Sidebar (Channel List)

**Server Mode**:
- Server name and icon in header
- Settings button (gear icon)
- Collapsible categories
- Channels listed under categories with type icons:
  - `#` hashtag for text channels
  - Speaker icon for voice channels
- Lock icon for private channels
- "LINK" indicator for channels with webhooks
- Voice user avatars shown under voice channels

**DM Mode (Personal Server)**:
- "Direct Messages" header
- Search bar with clear button to filter conversations
- "New Conversation" button with modal popup
- DM list entries showing:
  - User avatar with online status dot
  - Username
  - Last message preview (truncated)
  - Timestamp (Today, Yesterday, weekday, or date)
  - Unread count badge
- Empty state: "No conversations yet" message

### 13.4 Chat Area

**Header**:
- Channel name with type icon
- Channel description/topic
- Toggle member sidebar button (chevron)
- Settings/info button

**Message List**:
- Scrollable message history with auto-scroll
- Message grouping (same author within 5 minutes)
- Date separators ("Today", "Yesterday", formatted dates)
- Message components:
  - User avatar (custom image or emoji)
  - Colored username (by top role color)
  - Message content
  - Attachments (images with lightbox)
  - Reactions (emoji badges with count)
  - Edit indicator "(edited)"
  - Reply preview (collapsible)
- Hover actions: emoji picker, reply, edit, delete

**Image Lightbox Modal**:
- Click image to expand fullscreen
- Close button (X) and escape key
- Download button
- GIF animation support
- Click outside to dismiss

**Message Input**:
- Auto-expanding textarea
- Keyboard shortcuts: Enter to send, Shift+Enter for newline
- Emoji picker with 8 quick reactions
- Attachment upload button
- Drag-and-drop file support
- Typing indicator display

### 13.5 Member List (Right Sidebar)

- "ONLINE - N" header with count
- Shows non-offline users only
- Users grouped by top role color
- Each entry shows:
  - User avatar with status dot (green/yellow/red/gray)
  - Username (self marked with "(you)")
  - Top role badge(s)
- Click user to open context menu

### 13.6 Voice Area

- CSS Grid of video/audio tiles
- Speaking users: green border highlight
- Screen share: larger tile labeled "SCREEN"
- User tiles show:
  - Video stream (if available) or avatar
  - Username label at bottom
  - Mute/deafen icons at top-right
  - Per-user volume slider on hover
- Control bar:
  - Mute toggle (microphone icon)
  - Deafen toggle (headphones icon)
  - Screen share toggle
  - Leave voice button
- Current voice channel name in header

### 13.7 Settings Modal

**8 Tabs**:

1. **Profile**: Username, avatar (emoji or upload), color picker (12 options), bio, status dropdown, save button
2. **Server Settings**: Server name, description, icon upload, save/delete/leave buttons
3. **Channels**: List/create/edit/delete channels, type selector (text/voice), category assignment, private flag, drag-drop reorder handles
4. **Roles**: Create/edit/delete roles, name and color inputs, permission checkboxes grid (12 permissions)
5. **Members**: Member list with username search (with clear button), role assignment checkboxes per member
6. **Webhooks**: Create/delete webhooks, generated URL with copy button, built-in documentation with code examples
7. **Audio Settings**: Input/output device selectors, input/output volume sliders, test audio button, persistent preferences
8. **Friends**: Current friends list, pending requests with accept/reject, add friend by username, remove friend buttons

### 13.8 User Panel (Bottom Bar)

- User avatar (custom or emoji)
- Username display
- Status indicator dot
- Settings button (gear icon)
- Logout button (registered users only)

### 13.9 Context Menus

**Message Context Menu** (right-click message):
- Reply to Message
- Edit Message (author only)
- Copy Message URL
- Delete Message (author or admin)

**User Context Menu** (right-click username):
- View Profile
- Send Message (opens DM)
- Timeout User (admin only)
- Kick from Server (admin only)
- Ban from Server (admin only)

### 13.10 Search Inputs with Clear Buttons

All search/filter inputs across the application include a clear (X) button that appears when text is entered:
- DM search in DMList component
- DM search in Sidebar component
- Member search in Settings Modal

### 13.11 Login Screen

- Tab switch between Login and Register
- Username input field
- Password input field
- Guest mode option (username only)
- Error message display
- Form validation feedback

### 13.12 Mobile / Responsive Design

- Breakpoint: 768px
- Mobile features:
  - Swipe left: opens sidebar
  - Swipe right: opens member list
  - Fixed server list at top
  - Fixed user panel at bottom
  - Full-height main content area
  - Touch-friendly controls

---

## 14. Socket.IO Events Reference

### 14.1 Connection & Session

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `join` | C->S | `{token, username}` | Authenticate on connect |
| `disconnect` | C->S | - | Clean up session |
| `init` | S->C | `{user, server, servers, onlineUsers, voiceState}` | Initialize client state |
| `user:joined` | S->C | User object | User came online |
| `user:left` | S->C | `{id}` | User went offline |
| `user:updated` | S->C | User object | Profile/status changed |

### 14.2 Messaging

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `message:send` | C->S | `{channelId, content, attachments, replyTo}` | Send message |
| `message:new` | S->C | Message object | New message received |
| `message:react` | C->S | `{messageId, emoji}` | Toggle reaction |
| `message:reaction` | S->C | `{messageId, reactions}` | Reactions updated |
| `message:edit` | C->S | `{messageId, content}` | Edit message |
| `message:edited` | S->C | `{messageId, content, editedAt}` | Message edited |
| `message:delete` | C->S | `{messageId}` | Delete message |
| `message:deleted` | S->C | `{messageId}` | Message removed |
| `channel:join` | C->S | `{channelId}` | Subscribe to channel |
| `channel:history` | S->C | `{channelId, messages}` | Message history (50) |
| `typing:start` | C->S/S->C | `{channelId, user}` | User typing |
| `typing:stop` | C->S/S->C | `{channelId, userId}` | User stopped typing |

### 14.3 Voice & WebRTC

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `voice:join` | C->S | `{channelId}` | Join voice channel |
| `voice:leave` | C->S | `{channelId}` | Leave voice channel |
| `voice:joined` | S->C | `{peers}` | List of existing peers |
| `voice:left` | S->C | `{userId}` | Peer left voice |
| `voice:channel:update` | S->C | State object | Voice state changed |
| `voice:cue` | S->C | `{type}` | Join/leave audio cue |
| `voice:user:state` | S->C | `{userId, isMuted, isDeafened}` | Mute/deafen state |
| `peer:joined` | S->C | `{peerId}` | New peer entered |
| `peer:left` | S->C | `{peerId}` | Peer disconnected |
| `webrtc:offer` | C->S/S->C | `{to, offer}` | SDP offer |
| `webrtc:answer` | C->S/S->C | `{to, answer}` | SDP answer |
| `webrtc:ice` | C->S/S->C | `{to, candidate}` | ICE candidate |
| `screen:start` | C->S | - | Begin screen share |
| `screen:stop` | C->S | - | End screen share |
| `screen:started` | S->C | `{socketId}` | Screen share active |
| `screen:stopped` | S->C | - | Screen share ended |

### 14.4 Servers & Channels

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `server:create` | C->S | `{name, icon, customIcon}` | Create server |
| `server:created` | S->C | Server object | Server created |
| `server:update` | C->S | `{serverId, ...fields}` | Update server |
| `server:updated` | S->C | Server object | Server changed |
| `server:delete` | C->S | `{serverId}` | Delete server |
| `server:deleted` | S->C | `{serverId}` | Server removed |
| `server:leave` | C->S | `{serverId}` | Leave server |
| `channel:create` | C->S | `{name, type, serverId, categoryId}` | Create channel |
| `channel:update` | C->S | `{channelId, ...fields}` | Update channel |
| `channel:delete` | C->S | `{channelId}` | Delete channel |
| `channel:reorder` | C->S | `{channelId, position, categoryId}` | Move channel |
| `channels:updated` | S->C | Channel list | Channels refreshed |

### 14.5 Roles

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `role:create` | C->S | `{serverId, name, color}` | Create role |
| `role:update` | C->S | `{serverId, roleId, ...fields}` | Update role |
| `role:delete` | C->S | `{serverId, roleId}` | Delete role |
| `member:role` | C->S | `{serverId, targetUserId, roleId, action}` | Assign/remove role |

### 14.6 Direct Messages & Friends

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `dm:create` | C->S | `{userId}` | Create DM |
| `dm:list` | C->S | - | List DMs |
| `dm:close` | C->S | `{dmId}` | Close DM |
| `dm:created` | S->C | DM object | DM created |
| `dm:unread-counts` | S->C | Counts object | Unread per DM |
| `friend:list` | C->S | - | Get friends |
| `friend:request` | C->S | `{userId}` | Send request |
| `friend:accept` | C->S | `{requestId}` | Accept request |
| `friend:reject` | C->S | `{requestId}` | Reject request |
| `friend:remove` | C->S | `{friendId}` | Remove friend |
| `friend:block` | C->S | `{userId}` | Block user |
| `friend:unblock` | C->S | `{userId}` | Unblock user |

### 14.7 Webhooks

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `webhook:create` | C->S | `{serverId, channelId, name}` | Create webhook |
| `webhook:created` | S->C | Webhook object | Webhook ready |
| `webhook:delete` | C->S | `{webhookId}` | Delete webhook |

---

## 15. REST API Endpoints

### 15.1 Authentication

| Method | Endpoint | Auth | Request Body | Response |
|--------|----------|------|-------------|----------|
| POST | `/api/auth/register` | None | `{username, password}` | `{token, account}` |
| POST | `/api/auth/login` | None | `{username, password}` | `{token, account}` |

### 15.2 User

| Method | Endpoint | Auth | Request Body | Response |
|--------|----------|------|-------------|----------|
| POST | `/api/user/avatar` | Bearer token | `{avatar: "data:image/..."}` | `{customAvatar}` |

### 15.3 Server

| Method | Endpoint | Auth | Request Body | Response |
|--------|----------|------|-------------|----------|
| POST | `/api/server/:serverId/icon` | Bearer token | `{icon: "data:image/..."}` | `{customIcon}` |

### 15.4 Webhooks

| Method | Endpoint | Auth | Request Body | Response |
|--------|----------|------|-------------|----------|
| POST | `/api/webhooks/:webhookId/:token` | Token in URL path | `{content, username?, avatar?, avatar_url?, embeds?, tts?, attachments?}` | `{id, success, username}` |

---

## 16. Database Schema

### 16.1 Tables

1. **accounts** - User accounts with credentials and profile data
   - `id` (UUID, PK), `username` (unique), `password_hash`, `salt`, `avatar`, `custom_avatar`, `color`, `bio`, `status`, `created_at`

2. **tokens** - Authentication tokens
   - `token` (PK), `account_id` (FK), `expires_at`, `created_at`

3. **servers** - Server/guild definitions
   - `id` (UUID, PK), `name`, `icon`, `custom_icon`, `owner_id` (FK), `description`, `created_at`

4. **server_members** - Server membership records
   - `id` (UUID, PK), `server_id` (FK), `account_id` (FK), `joined_at`

5. **categories** - Channel categories within servers
   - `id` (UUID, PK), `server_id` (FK), `name`, `position`

6. **channels** - Text and voice channels
   - `id` (UUID, PK), `server_id` (FK), `category_id` (FK), `name`, `type`, `description`, `topic`, `nsfw`, `is_private`, `created_at`

7. **roles** - Server roles with permissions
   - `id` (UUID, PK), `server_id` (FK), `name`, `color`, `position`, `permissions` (JSONB)

8. **member_roles** - Role assignments
   - `id` (UUID, PK), `server_id` (FK), `member_id` (FK), `role_id` (FK)

9. **messages** - Chat messages with metadata
   - `id` (UUID, PK), `channel_id` (FK), `author_id` (FK), `content`, `created_at`, `edited_at`, `reactions` (JSONB), `attachments` (JSONB)

10. **dm_channels** - Direct message channel definitions
    - `id` (UUID, PK), `participant_1` (FK), `participant_2` (FK), `name`, `is_group`, `created_at`

11. **friendships** - Friend relationships and states
    - `id` (UUID, PK), `user_id` (FK), `friend_id` (FK), `status` ('accepted'|'pending'|'blocked'), `created_at`

12. **webhooks** - Webhook configurations
    - `id` (UUID, PK), `channel_id` (FK), `name`, `avatar`, `token` (64-char hex, NOT NULL), `created_by` (FK), `created_at`

13. **reports** - User reports
    - `id` (UUID, PK), `reporter_id` (FK), `reported_id` (FK), `reason`, `created_at`

---

## 17. Security Features

### 17.1 Input Validation (validation.js)

| Validator | Rules |
|-----------|-------|
| `validateUsername()` | 3-32 chars, alphanumeric + underscore/hyphen |
| `validatePassword()` | Minimum 8 characters |
| `validateMessage()` | Max 2000 chars, newline limiting |
| `validateServerName()` | 3-32 characters |
| `validateChannelName()` | 2-32 chars, lowercase + hyphen |
| `validateRoleName()` | 2-32 characters |
| `validateEmail()` | Standard email regex |
| `validateColor()` | Hex format #RRGGBB |
| `validateUUID()` | UUID format validation |
| `validateAttachment()` | URL format checking |
| `validateParticipantIds()` | Array of 2-50 valid UUIDs |
| `sanitizeInput()` | Trim and length limiting |
| `sanitizeGroupDMName()` | HTML escaping, character validation |

### 17.2 Password Security

- Hashing algorithm: HMAC-SHA256
- Salt: 16 random bytes per password via `crypto.randomBytes(16)`
- Passwords never stored or transmitted in plaintext after registration

### 17.3 Rate Limiting

| Limiter | Limit | Window |
|---------|-------|--------|
| API routes | 10 requests | 10 seconds (per IP) |
| Messages | 30 messages | 10 seconds (per socket) |
| Group DM creation | 5 | 1 minute |
| Participant management | 20 | 1 minute |
| Mark as read | 100 | 1 minute |

### 17.4 CORS Configuration

- Origin: restricted to CLIENT_URL only
- Methods: GET, POST, PUT, DELETE, OPTIONS
- Credentials: enabled
- Allowed headers: Content-Type, Authorization

### 17.5 HTTP Security Headers (Helmet.js)

- Content Security Policy with strict source directives
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Strict-Transport-Security (HTTPS environments)
- X-XSS-Protection: enabled
- Referrer-Policy: no-referrer
- Cross-Origin Embedder Policy: disabled for media compatibility

### 17.6 Content Sanitization

- Markdown rendered via react-markdown with rehype-sanitize
- XSS prevention in user-generated content
- HTML escaping for group DM names and user input
- No eval() or dynamic code execution

---

## 18. Styling & Theming

### 18.1 CSS Custom Properties (Theme Variables)

```css
--bg-primary: #36393F        /* Main content background */
--bg-secondary: #2F3136      /* Sidebar background */
--bg-tertiary: #202225       /* Inputs and nested elements */
--bg-floating: #18191C       /* Floating menus and modals */
--bg-modifier-hover: ...     /* Hover state backgrounds */
--text-primary: #DCDDDE      /* Primary text */
--text-normal: #DCDDDE       /* Normal text */
--text-muted: #72767D        /* Dimmed/secondary text */
--header-primary: #FFFFFF    /* Header text */
--header-secondary: #B9BBBE  /* Subheader text */
--red: #ED4245               /* Errors and danger */
--green: #57F287             /* Success and online */
--blue: #3B82F6              /* Primary brand color */
--yellow: #FEE75C            /* Warnings */
--brand-500: ...             /* Primary action buttons */
--brand-600: ...             /* Hover state for brand */
--font-primary: ...          /* Primary font family */
--font-display: ...          /* Display/heading font */
```

### 18.2 CSS Animations

- `fadeIn`: Opacity 0 -> 1 (modal overlays)
- `slideUp`: Translate Y + opacity (modal content)
- Message highlight: 2-second yellow fade on scroll-to
- Typing indicator animation
- Status dot pulse animation
- Hover transitions on buttons and interactive elements (0.15s ease)

### 18.3 Responsive Breakpoints

- **Desktop** (> 768px): Full 3-column layout
- **Mobile** (768px and below): Single column with swipe navigation

---

## 19. Performance Optimizations

### 19.1 Frontend Optimizations

- `React.memo()` on major components to prevent unnecessary re-renders
- `useCallback()` for event handlers with proper dependency arrays
- `useMemo()` for expensive computations (message grouping, filtering)
- Message grouping logic reduces DOM elements (same author within 5 minutes)
- Per-channel message caching in React state
- Lazy loading ready for images
- Position properties on channels prepared for virtualization

### 19.2 Backend Optimizations

- PostgreSQL connection pooling (max 20 clients)
- Indexed database queries with LIMIT clauses
- Socket.IO room-based broadcasting (only to relevant users)
- Rate limiting prevents abuse and resource exhaustion
- In-memory state for fast lookups (messages, users, voice state)

### 19.3 Network Optimizations

- WebSocket transport for real-time (lower overhead than HTTP polling)
- Base64 encoding for small images (avoids extra HTTP round-trips)
- Message history pagination (50 messages per load)
- Gzip compression support in Express/Nginx

---

## 20. File Structure

```
nexus-chat/
├── client/                              # React Frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── App.js                  # Root component, state management
│   │   │   ├── LoginScreen.js          # Authentication UI
│   │   │   ├── ChatArea.js             # Message display + input
│   │   │   ├── VoiceArea.js            # WebRTC video tiles + controls
│   │   │   ├── ServerList.js           # Server icon rail
│   │   │   ├── Sidebar.js              # Channel/DM sidebar
│   │   │   ├── MemberList.js           # Online user list
│   │   │   ├── SettingsModal.js        # Multi-tab settings
│   │   │   ├── UserPanel.js            # User info bottom bar
│   │   │   ├── DMList.js              # DM conversations list
│   │   │   ├── MessageContextMenu.js   # Right-click message menu
│   │   │   ├── UserContextMenu.js      # Right-click user menu
│   │   │   ├── WebhookDocs.js          # Webhook documentation
│   │   │   ├── ImageModal.js           # Image lightbox
│   │   │   ├── icons/                  # SVG icon components
│   │   │   │   ├── ChatIcon.js
│   │   │   │   ├── MicrophoneIcon.js
│   │   │   │   ├── FriendsIcon.js
│   │   │   │   ├── SettingsIcon.js
│   │   │   │   └── ... (additional icons)
│   │   │   ├── App.css                 # Main application styles
│   │   │   ├── Sidebar.css             # Sidebar-specific styles
│   │   │   ├── DMList.css              # DM list styles
│   │   │   ├── SettingsModal.css       # Settings modal styles
│   │   │   └── ... (additional CSS)
│   │   ├── hooks/
│   │   │   └── useWebRTC.js            # Voice/video/screen share hook
│   │   └── index.js                    # React entry point
│   ├── public/
│   │   └── index.html                  # HTML template with CSP meta
│   ├── nginx.conf                      # Production Nginx config
│   ├── Dockerfile                      # Multi-stage client build
│   └── package.json
│
├── server/                              # Node.js Backend
│   ├── index.js                        # Express + Socket.IO server
│   ├── config.js                       # Environment configuration
│   ├── db.js                           # PostgreSQL connection + queries
│   ├── validation.js                   # Input validation & sanitization
│   ├── docker-entrypoint.sh            # Container startup script
│   ├── test-security.js                # Security test suite
│   ├── migrations/
│   │   └── 001_initial_schema.sql      # Full database schema
│   ├── Dockerfile                      # Server container build
│   ├── package.json
│   ├── .env                            # Environment variables
│   └── .env.example                    # Environment template
│
├── docker-compose.yml                   # Production orchestration
├── start.sh                            # Quick start script
├── README.md                           # Project readme
├── IMPLEMENTATION.md                   # Implementation details
├── DOCKER_DEPLOYMENT.md                # Deployment guide
├── STATUS.md                           # Project status
└── FEATURES.md                         # This file
```

---

## 21. Feature Status Summary

| # | Feature | Status | Key Files |
|---|---------|--------|-----------|
| 1 | User Registration & Login | Complete | LoginScreen.js, server/index.js |
| 2 | Guest Mode | Complete | LoginScreen.js, server/index.js |
| 3 | Session Persistence (localStorage + token) | Complete | App.js |
| 4 | Text Messaging (send, edit, delete) | Complete | ChatArea.js |
| 5 | Message Reactions (8 emoji) | Complete | ChatArea.js |
| 6 | Reply / Thread System | Complete | ChatArea.js |
| 7 | Image & GIF Attachments | Complete | ChatArea.js |
| 8 | Image Lightbox Modal | Complete | ImageModal.js |
| 9 | Drag-and-Drop File Upload | Complete | ChatArea.js |
| 10 | Typing Indicators | Complete | ChatArea.js |
| 11 | Message History (50 per channel) | Complete | server/index.js |
| 12 | Message Grouping & Date Separators | Complete | ChatArea.js |
| 13 | Voice Channels (WebRTC) | Complete | VoiceArea.js, useWebRTC.js |
| 14 | Screen Sharing | Complete | useWebRTC.js |
| 15 | Speaking Detection | Complete | useWebRTC.js |
| 16 | Audio Join/Leave Cues | Complete | useWebRTC.js |
| 17 | Per-User Volume Controls | Complete | VoiceArea.js |
| 18 | Mute / Deafen Controls | Complete | VoiceArea.js |
| 19 | Audio Device Selection | Complete | SettingsModal.js |
| 20 | Server Creation with Defaults | Complete | SettingsModal.js |
| 21 | Server Editing & Deletion | Complete | SettingsModal.js |
| 22 | Custom Server Icons | Complete | SettingsModal.js |
| 23 | Server Membership (join/leave) | Complete | server/index.js |
| 24 | Channel Categories (collapsible) | Complete | Sidebar.js |
| 25 | Text & Voice Channel Management | Complete | SettingsModal.js |
| 26 | Private Channels | Complete | server/index.js |
| 27 | Role System (12 permissions) | Complete | SettingsModal.js |
| 28 | Role Assignment to Members | Complete | SettingsModal.js |
| 29 | Permission Checking (server + channel level) | Complete | server/index.js |
| 30 | Webhooks (create, delete, HTTP API) | Complete | SettingsModal.js, WebhookDocs.js |
| 31 | Webhook Documentation (cURL, JS, Python) | Complete | WebhookDocs.js |
| 32 | Direct Messaging (1-on-1) | Complete | DMList.js, Sidebar.js |
| 33 | Group DMs | Foundation Ready | server/index.js |
| 34 | New Conversation Button & Modal | Complete | DMList.js |
| 35 | DM Search with Clear Button | Complete | DMList.js, Sidebar.js |
| 36 | DM Unread Count Badges | Complete | DMList.js |
| 37 | Friend System (add, accept, reject, remove) | Foundation Ready | server/index.js |
| 38 | Block & Report Users | Foundation Ready | server/index.js |
| 39 | User Profile Customization | Complete | SettingsModal.js |
| 40 | Custom Avatar Upload | Complete | SettingsModal.js |
| 41 | User Status (online, idle, dnd, invisible) | Complete | App.js |
| 42 | Online User Tracking | Complete | MemberList.js |
| 43 | Member List with Status Dots | Complete | MemberList.js |
| 44 | Message Context Menu (right-click) | Complete | MessageContextMenu.js |
| 45 | User Context Menu (right-click) | Complete | UserContextMenu.js |
| 46 | Mobile Responsive Design | Complete | App.css |
| 47 | Swipe Navigation (mobile) | Complete | App.js |
| 48 | Search Inputs with Clear Buttons | Complete | DMList.css, Sidebar.css, SettingsModal.css |
| 49 | Docker Multi-Container Deployment | Complete | docker-compose.yml |
| 50 | PostgreSQL Database Schema | Complete | migrations/001_initial_schema.sql |
| 51 | Redis Session/Cache Layer | Complete | docker-compose.yml |
| 52 | Nginx Reverse Proxy with WSS | Complete | nginx.conf |
| 53 | Rate Limiting (API + messages) | Complete | server/index.js |
| 54 | Input Validation & Sanitization | Complete | validation.js |
| 55 | Helmet.js Security Headers | Complete | server/index.js |
| 56 | CORS Configuration | Complete | server/index.js |
| 57 | Password Hashing (HMAC-SHA256) | Complete | server/index.js |

---

*Generated: February 16, 2026*
*Total Features Documented: 57*

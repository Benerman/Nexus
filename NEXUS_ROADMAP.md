# Nexus Enhancement Roadmap

Comprehensive analysis of the Nexus codebase compared against Discord, Slack, and Microsoft Teams. Organized into prioritized phases with actionable items.

---

## Current State Summary

Nexus implements ~48/71 features compared to Discord/Slack/Teams (~67% parity). Core communication, voice/video, moderation, and custom content are solid. Key gaps are in messaging features (threads, search, pinning), platform ecosystem (bots, integrations), and infrastructure maturity (monitoring, scaling, testing).

**Voice quality: 7.5/10** — RNNoise ML noise cancellation and dual-stage AGC are strong differentiators. Compressor tuning is the easiest quality win.

**Architecture concern:** `server/index.js` (5400+ lines) and `client/src/App.js` (2300+ lines, 53 useState hooks) are monolithic and need modularization for maintainability.

---

## Phase 1: Quick Wins & Audio Tuning

_Low effort, immediate impact. Can be done in a few days._

### 1.1 Tune DynamicsCompressor (5 min)
**File:** `client/src/hooks/useWebRTC.js` ~line 697
- Change threshold from `-6dB` to `-12dB`
- Change ratio from `4:1` to `2:1`
- Change attack from `0.003` (3ms) to `0.010` (10ms)
- Add soft knee of `10dB`
- **Why:** Current settings audibly squash loud speech. Discord/Zoom use softer compression. Improves perceived voice quality by ~1 point.

### 1.2 Fix AGC gate-state check (10 min)
**File:** `client/public/audio-processor.js` ~line 233
- Only update leveler gain when gate state is `'open'`, not during `'hold'` or `'closing'`
- **Why:** Prevents "pumping" artifact when background noise spikes during hold state.

### 1.3 Remove render count logging (5 min)
**File:** `client/src/App.js` lines 51-53
- Wrap `renderCount` / `console.log` in `process.env.NODE_ENV === 'development'` check
- **Why:** Runs on every render in production, pollutes console.

### 1.4 Add Docker resource limits (15 min)
**File:** `docker-compose.yml`
- Server: `memory: 512M`, `cpus: 1.0`
- Redis: `memory: 256M`, `cpus: 0.5`
- PostgreSQL: `memory: 2G`, `cpus: 2.0`
- **Why:** Prevents any single container from consuming all host resources.

### 1.5 Add npm audit to CI (15 min)
**File:** `.github/workflows/unit-tests.yml`
- Add step: `npm audit --audit-level=critical`
- **Why:** Catches known vulnerabilities in dependencies before merge.

---

## Phase 2: Critical Feature Gaps

_High-impact features missing from every competitor. 1-2 weeks each._

### 2.1 Message Pinning
**Effort:** Low (1-2 days)

**Server changes:**
- Add `pinned_messages` JSONB array column to `channels` table (migration)
- Add socket events: `message:pin`, `message:unpin`, `messages:get-pinned`
- Cap at 50 pinned messages per channel
- Permission check: `manageMessages`

**Client changes:**
- Pin/unpin button in message context menu
- Pinned messages panel (slide-out or modal) in ChatArea header
- Pin indicator on pinned messages in chat

### 2.2 Message Search
**Effort:** Medium (3-5 days)

**Server changes:**
- Add PostgreSQL full-text search index: `CREATE INDEX idx_messages_fts ON messages USING gin(to_tsvector('english', content))`
- Add socket event: `messages:search` with params `{ query, serverId, channelId?, authorId?, before?, after?, limit }`
- Return results with surrounding context (message before/after)

**Client changes:**
- Search bar in server header (Ctrl+F / Cmd+F shortcut)
- Search results panel with filters (by user, channel, date range)
- Click result to jump to message in context

### 2.3 Message Threads
**Effort:** Medium-High (5-7 days)

**Server changes:**
- Add `thread_id` column to `messages` table (self-referencing, nullable)
- Add `thread_message_count` and `thread_last_message_at` to parent messages
- Thread messages loaded separately via `messages:fetch-thread`
- Thread participants tracked for notifications

**Client changes:**
- "Reply in thread" option in message context menu
- Thread panel (right sidebar, similar to Discord/Slack)
- Thread indicator on parent message showing reply count
- Thread notifications in sidebar

### 2.4 Bookmarks / Saved Messages
**Effort:** Low (1-2 days)

**Server changes:**
- Add `saved_messages` table: `user_id`, `message_id`, `channel_id`, `server_id`, `saved_at`
- Socket events: `message:save`, `message:unsave`, `messages:get-saved`

**Client changes:**
- Bookmark icon on message hover
- Saved messages section accessible from user menu
- Group by server/channel with jump-to-message

### 2.5 Audit Log
**Effort:** Medium (3-4 days)

**Server changes:**
- Add `audit_logs` table: `id`, `server_id`, `action` (enum), `actor_id`, `target_id`, `changes` (JSONB before/after), `created_at`
- Log all moderation actions: ban, kick, timeout, role change, channel create/delete/update, permission change, member join/leave
- Socket event: `audit:get-logs` with pagination and filters
- Permission: `viewAuditLog`

**Client changes:**
- Audit Log tab in server settings (visible to admins)
- Filterable table with action type, actor, target, timestamp
- Expandable rows showing before/after changes

---

## Phase 3: Performance & Architecture

_Structural improvements for scalability and maintainability. 2-4 weeks._

### 3.1 Message Virtual Scrolling
**Effort:** 3-4 days

**File:** `client/src/components/ChatArea.js`
- Integrate `react-window` or `react-virtuoso` for message list
- Reduces DOM nodes from 500 to ~20 visible at any time
- Implement sticky date dividers, scroll-to-bottom button, intersection observer for lazy loading
- Clean up `messageRefs` on channel switch to prevent memory leak
- **Why:** Current flat rendering of all messages causes jank on channels with 200+ messages.

### 3.2 Fix N+1 Query Issues
**Effort:** 2-3 days

**File:** `server/db.js`, `server/index.js`
- Add batch query: `getAccountsByIds(ids[])` using `WHERE id = ANY($1::uuid[])`
- Replace per-message author lookups with batch load + Map
- Add user-ID-to-socket index (`Map<userId, Set<socketId>>`) to replace O(n) linear scans
- Add JOINs for message loading: `SELECT m.*, a.username, a.avatar FROM messages m LEFT JOIN accounts a ON m.author_id = a.id`
- **Impact:** Loading 50 messages goes from 50+ queries to 2 queries.

### 3.3 Lazy Message Loading (Remove In-Memory Cache)
**Effort:** 2-3 days

**File:** `server/index.js` (state.messages)
- Stop keeping 500 messages per channel in memory
- Load messages from DB on demand (paginated, last 50)
- Use Redis for hot channel cache (last 50 messages, TTL 5 min)
- **Impact:** Reduces server memory from ~500MB (1000 channels) to ~50MB. Messages survive restarts.

### 3.4 Database Transactions for Multi-Step Operations
**Effort:** 2-3 days

**File:** `server/index.js`, `server/db.js`
- Wrap multi-step operations in explicit transactions using `db.getClient()` + `BEGIN/COMMIT/ROLLBACK`
- Key operations: server creation, channel creation with categories, DM creation, role updates
- Don't broadcast state changes until DB persistence succeeds
- **Why:** Currently, if DB write fails after in-memory update, state diverges. On restart, the change is lost.

### 3.5 State Management Consolidation (Client)
**Effort:** 3-5 days

**File:** `client/src/App.js`
- Consolidate 53 `useState` calls into 5-6 logical state objects:
  - `auth` — token, username, currentUser, restoringSession
  - `ui` — settingsOpen, activeChannel, contextMenus, modals
  - `social` — friends, pendingRequests, messageRequests, dmUnreadCounts
  - `notifications` — mutedServers, mutedChannels, sounds, pausedUntil
  - `connection` — connectionState, showBanner, reconnecting
- Use `useReducer` for connection state machine
- Eliminates 11 ref-syncing useEffect calls (lines 390-408)
- **Why:** Reduces re-renders, eliminates stale closure bugs, makes component testable.

### 3.6 Server Code Modularization
**Effort:** 1-2 weeks

**File:** `server/index.js` (5400+ lines) → split into:
- `server/handlers/messages.js` — message:send, edit, delete, react, pin
- `server/handlers/channels.js` — channel:create, update, delete, join
- `server/handlers/voice.js` — voice:join, leave, offer, answer, ice-candidate
- `server/handlers/dms.js` — dm:create, message, mark-read
- `server/handlers/moderation.js` — ban, kick, timeout, report
- `server/handlers/admin.js` — platform admin operations
- `server/routes/auth.js` — registration, login, logout
- `server/middleware/validation.js` — socket event validation wrapper
- `server/middleware/permissions.js` — permission checking middleware
- **Why:** 5400-line file is unmaintainable. Each domain becomes independently testable.

---

## Phase 4: Infrastructure & Operations

_Production hardening. 2-4 weeks._

### 4.1 Structured Logging
**Effort:** 1-2 days

- Replace all `console.log/error/warn` with Winston or Pino
- Add log levels (info, warn, error, debug), timestamps, request context
- Rotate log files or stream to cloud aggregator
- Redact sensitive data (tokens, passwords) from logs

### 4.2 Error Tracking (Sentry)
**Effort:** 1 day

- Server: `@sentry/node` — wrap async handlers, capture unhandled rejections
- Client: `@sentry/react` — error boundary integration, performance traces
- Free tier: 5K errors/month

### 4.3 Metrics & Monitoring (Prometheus)
**Effort:** 2-3 days

- Expose `/metrics` endpoint with `prom-client`
- Track: active socket connections, messages/sec, voice channel occupancy, DB pool utilization, memory/CPU
- Add Grafana dashboard (docker container) for visualization
- Set up alerts: error rate spike, memory >80%, DB pool exhaustion

### 4.4 Automated Database Backups
**Effort:** 1 day

- Daily `pg_dump` via sidecar container or cron job
- Compress and store with 30-day retention
- Monthly restore test on staging
- Alert on backup failure

### 4.5 Re-enable Playwright E2E Tests
**Effort:** 2-3 days

- Uncomment Playwright workflow in CI
- Fix flaky tests (increase timeouts, add proper waits)
- Cover critical paths: login, message send, channel create, voice join
- Run on PR merge to main

### 4.6 Socket.IO Redis Adapter
**Effort:** 1-2 days

- Install `@socket.io/redis-adapter`
- Configure pub/sub clients pointing to existing Redis
- Enables horizontal scaling (multiple Node.js server instances)
- Required before adding load balancer

### 4.7 Secrets Management
**Effort:** 1-2 days

- Move JWT_SECRET, POSTGRES_PASSWORD to Docker Secrets
- Add pre-commit hook (`git-secrets` or `talisman`) to prevent accidental secret commits
- Document secret rotation procedure

---

## Phase 5: Moderation & Community Features

_Features that improve community management. 1-2 weeks each._

### 5.1 Auto-Moderation
**Effort:** Medium (3-4 days)

- Add `moderation_rules` table: `server_id`, `type` (keyword_filter, spam_detection, invite_filter), `config` (JSONB), `action` (warn, delete, timeout, ban)
- Process rules on `message:send` before broadcast
- Keyword filter: regex matching with configurable word list
- Spam detection: duplicate message detection, rate-based
- Invite filter: block external server invite links
- UI: Auto-mod settings tab in server settings

### 5.2 Custom User Status
**Effort:** Low (1-2 days)

- Add `status_text` (128 chars) and `status_emoji` columns to accounts
- Socket event: `user:set-status`
- Display in member list and user profile popover
- Clear after configurable duration (1h, 4h, today, custom)

### 5.3 Scheduled Events
**Effort:** Medium (3-4 days)

- Add `server_events` table: `server_id`, `title`, `description`, `start_time`, `end_time`, `channel_id`, `created_by`, `interested_users` (JSONB)
- Socket events: `event:create`, `event:update`, `event:delete`, `event:interest`
- UI: Events panel in server sidebar, event cards with RSVP
- Notification 15 min before event start (via job queue)

---

## Phase 6: WebRTC & Voice Improvements

_Voice quality and scalability improvements._

### 6.1 Codec Preferences
**Effort:** 30 min

**File:** `client/src/hooks/useWebRTC.js`
- After `addTrack()`, call `setCodecPreferences()` to enforce Opus for audio
- Remove unsupported codecs from negotiation
- **Why:** Prevents fallback to lower-quality codecs on some browsers.

### 6.2 Bandwidth Constraints
**Effort:** 1 hour

- Add SDP modification to set `b=TIAS:128000` (128kbps max for audio)
- Add screen share cap: 2Mbps (1920x1080@15fps)
- **Why:** Prevents quality degradation on congested networks.

### 6.3 Opus DTX (Discontinuous Transmission)
**Effort:** 30 min

- Enable Opus DTX to save bandwidth during silence
- Pass `maxAverageBitrate: 24000` in RTP params
- **Impact:** ~20% bandwidth savings on quiet channels.

### 6.4 Push-to-Talk
**Effort:** 1-2 hours

- Spacebar hotkey (configurable) to transmit only when pressed
- Mute mic track when PTT key is released
- Setting toggle in Audio Settings
- **Why:** Reduces background noise and bandwidth for users who prefer it.

### 6.5 Device Change Detection
**Effort:** 1 hour

- Listen for `navigator.mediaDevices.ondevicechange`
- If active microphone disconnects mid-call, prompt user to select new device
- Auto-fallback to default device if available

### 6.6 RNNoise Aggressiveness Levels
**Effort:** 2 hours

- Expose Low/Medium/High control (like Zoom)
- Controls RNNoise output gain floor: Low = 0.9, Medium = 0.5, High = 0.1
- Setting in Audio Settings panel

### 6.7 SFU Architecture (Long-term)
**Effort:** 2-3 weeks

- For 6+ users in a voice channel, switch from P2P mesh to SFU (Selective Forwarding Unit)
- Evaluate Mediasoup or LiveKit as SFU servers
- Each peer uploads one stream to SFU, SFU forwards to all others
- **Why:** P2P mesh at 10 peers means each user uploads 9 copies of their stream. CPU and bandwidth scale quadratically.

---

## Phase 7: Code Quality & Developer Experience

_Maintainability improvements._

### 7.1 ESLint for Server
- Add `eslint` + `eslint-config-airbnb-base` to server
- Configure rules: `no-console: warn`, `no-unused-vars: error`, `prefer-const: error`
- Add lint step to CI

### 7.2 Prettier for Codebase
- Add `.prettierrc` (2-space indent, semicolons, trailing comma es5)
- Run on all files once, commit as formatting-only change
- Add to pre-commit hook

### 7.3 Code Splitting (Client)
- Lazy load heavy components: `SettingsModal`, `EmojiPicker`, `GifPicker`
- `const SettingsModal = React.lazy(() => import('./SettingsModal'))`
- Reduces initial bundle by ~30%

### 7.4 Accessibility
- Add ARIA labels to all interactive elements
- `aria-live="polite"` on typing indicator
- Keyboard navigation for context menus, emoji picker
- `role="main"` on chat area, proper heading hierarchy
- Screen reader announcements for new messages

### 7.5 SettingsModal Split
**File:** `client/src/components/SettingsModal.js` (4247 lines)
- Split into separate tab components: `ProfileTab`, `ServerTab`, `ChannelsTab`, `RolesTab`, `MembersTab`, `WebhooksTab`, `AudioTab`, `FriendsTab`, `EmojiTab`, `AdminTab`
- Each independently testable and lazy-loadable

---

## Phase 8: Database & Schema Improvements

### 8.1 Add Missing Indexes
```sql
CREATE INDEX idx_messages_author_channel ON messages(author_id, channel_id, created_at DESC);
CREATE INDEX idx_dm_read_states_user_channel ON dm_read_states(user_id, channel_id);
CREATE INDEX idx_server_members_account ON server_members(account_id);
CREATE INDEX idx_friendships_both ON friendships(requester_id, addressee_id) WHERE status = 'accepted';
CREATE INDEX idx_messages_fts ON messages USING gin(to_tsvector('english', content));
```

### 8.2 Message Soft-Delete
- Add `deleted_at` timestamp column to messages (nullable)
- Change delete to set `deleted_at = NOW()` instead of hard delete
- Filter in queries: `WHERE deleted_at IS NULL`
- Admin can view deleted messages for moderation

### 8.3 Message Edit History
```sql
CREATE TABLE message_edits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  old_content TEXT NOT NULL,
  edited_at TIMESTAMP DEFAULT NOW()
);
```
- Show "(edited)" badge on messages with edit history
- Click to view previous versions

### 8.4 JSONB Validation Constraints
```sql
ALTER TABLE server_members ADD CONSTRAINT roles_must_be_array CHECK (jsonb_typeof(roles) = 'array');
```

---

## Phase 9: Nice-to-Have Features

_Lower priority, high polish._

### 9.1 Forum Channels
- New channel type `forum` with topic-based threads
- Each post is a thread with title + initial message
- Tags for categorization
- Sort by recent activity, creation date, or popularity

### 9.2 Scheduled Messages
- `scheduled_messages` table with delivery timestamp
- Job queue (BullMQ + Redis) for reliable delivery
- UI: Calendar icon in message input, date/time picker
- Cancel/edit before delivery

### 9.3 Bot/App API
- OAuth2 server for app authentication
- Bot user type with API token
- Scoped permissions (read messages, send messages, manage server, etc.)
- Rate-limited REST API for bots
- Webhook-based event subscriptions
- **Effort:** Very High — this is essentially building a developer platform

### 9.4 2FA / MFA
- TOTP support using `speakeasy` npm package
- QR code setup flow in security settings
- Backup codes for recovery
- Required for admin accounts (configurable)

---

## Feature Parity Summary

| Category | Current | Target (Phase 1-5) | Discord |
|----------|---------|---------------------|---------|
| Messaging | 80% | 95% | 100% |
| Voice/Video | 88% | 95% | 100% |
| Social | 80% | 90% | 100% |
| Moderation | 71% | 90% | 100% |
| Organization | 80% | 95% | 100% |
| Customization | 75% | 85% | 100% |
| Integration | 25% | 35% | 100% |
| Admin/Enterprise | 40% | 70% | 100% |
| **Overall** | **67%** | **85%** | **100%** |

---

## Nexus Strengths to Double Down On

These are areas where Nexus already meets or exceeds competitors:

1. **Audio processing quality** — RNNoise ML noise cancellation + dual-stage AGC exceeds Discord's built-in processing
2. **Soundboard** — Full-featured with trimming, per-sound volume, targeted playback, user intro/exit sounds
3. **Cross-platform** — Web, Tauri, Electron, Capacitor (iOS/Android) from single codebase
4. **Self-hosted** — Full control over data, no vendor lock-in
5. **Lightweight moderation** — Granular timeout system with configurable durations
6. **Custom emoji sharing** — Cross-server emoji usage (configurable per server)

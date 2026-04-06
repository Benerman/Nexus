# Database Schema

Nexus uses PostgreSQL 15 with 16+ tables. UUIDs for account IDs, JSONB for flexible data.

## Core Tables

### accounts

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | Account identifier |
| `username` | VARCHAR(32) UNIQUE | Display name |
| `password_hash` | VARCHAR(255) | bcrypt hash |
| `salt` | VARCHAR(32) | Password salt |
| `avatar` | VARCHAR(10) | Emoji avatar (default: 🐺) |
| `custom_avatar` | TEXT | Custom avatar image (base64) |
| `color` | VARCHAR(7) | Username color (default: #3B82F6) |
| `bio` | VARCHAR(128) | User bio |
| `status` | VARCHAR(10) | Online status (default: online) |
| `public_key` | TEXT | E2E encryption public key |
| `settings` | JSONB | User settings |
| `created_at` | TIMESTAMP | Account creation time |
| `updated_at` | TIMESTAMP | Last update time |

### servers

| Column | Type | Description |
|--------|------|-------------|
| `id` | VARCHAR(64) PK | Server identifier |
| `name` | VARCHAR(32) | Server name |
| `icon` | VARCHAR(10) | Emoji icon (default: ⬡) |
| `custom_icon` | TEXT | Custom icon image |
| `description` | VARCHAR(256) | Server description |
| `owner_id` | UUID FK | Server owner |
| `created_at` | TIMESTAMP | Creation time |
| `updated_at` | TIMESTAMP | Last update time |

### channels

| Column | Type | Description |
|--------|------|-------------|
| `id` | VARCHAR(64) PK | Channel identifier |
| `server_id` | VARCHAR(64) FK | Parent server |
| `category_id` | UUID FK | Parent category |
| `name` | VARCHAR(32) | Channel name |
| `type` | TEXT | `text` or `voice` |
| `description` | VARCHAR(128) | Channel description |
| `topic` | VARCHAR(256) | Channel topic |
| `position` | INT | Sort position |
| `is_private` | BOOLEAN | Private channel flag |
| `nsfw` | BOOLEAN | Age-restricted flag |
| `slow_mode` | INT | Slow mode (seconds) |
| `permission_overrides` | JSONB | Per-role overrides |

### messages

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | Message identifier |
| `channel_id` | VARCHAR(64) FK | Parent channel |
| `author_id` | UUID FK | Message author |
| `content` | TEXT | Message content (max 2000) |
| `attachments` | JSONB | File attachments |
| `reactions` | JSONB | Emoji reactions |
| `is_webhook` | BOOLEAN | From webhook |
| `webhook_username` | TEXT | Webhook display name |
| `webhook_avatar` | TEXT | Webhook avatar |
| `reply_to` | UUID FK | Thread parent |
| `mentions` | JSONB | Mentioned users |
| `embeds` | JSONB | Rich embeds |
| `command_data` | JSONB | Slash command data |
| `pinned` | BOOLEAN | Pinned flag |
| `pinned_at` | TIMESTAMP | Pin time |
| `pinned_by` | UUID | Who pinned |
| `thread_id` | UUID | Thread identifier |
| `encrypted` | BOOLEAN | E2E encrypted |
| `created_at` | TIMESTAMP | Send time |
| `edited_at` | TIMESTAMP | Last edit time |

### roles

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | Role identifier |
| `server_id` | VARCHAR(64) FK | Parent server |
| `name` | VARCHAR(32) | Role name |
| `color` | VARCHAR(7) | Display color |
| `position` | INT | Hierarchy position |
| `permissions` | JSONB | Permission flags |

### dm_channels

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | DM channel identifier |
| `participant_1` | UUID FK | First participant |
| `participant_2` | UUID FK | Second participant |
| `is_group` | BOOLEAN | Group DM flag |
| `name` | VARCHAR(64) | Group DM name |
| `created_by` | UUID FK | Creator |
| `created_at` | TIMESTAMP | Creation time |

## Other Tables

- `tokens` — JWT tokens with expiration
- `invites` — Server invite links with uses/expiration
- `bans` — Server bans (unique per server+user)
- `timeouts` — Server timeouts (unique per server+user)
- `friendships` — Friend relationships and requests
- `webhooks` — Webhook configuration
- `custom_emoji` — Server custom emoji
- `audit_logs` — Server audit trail
- `dm_messages` — DM message storage
- `dm_read_states` — DM read tracking
- `categories` — Channel categories

## Indexes

| Table | Index | Purpose |
|-------|-------|---------|
| `accounts` | `username` (case-insensitive) | Login lookup |
| `tokens` | `account_id`, `expires_at` | Token validation |
| `messages` | `(channel_id, created_at DESC)` | Message history |
| `messages` | `author_id` | User message lookup |
| `servers` | `owner_id` | Owner's servers |
| `dm_channels` | `participant_1`, `participant_2` | DM lookup |
| `dm_read_states` | `user_id`, `channel_id` | Read state lookup |
| `friendships` | `requester_id`, `addressee_id`, `status` | Friend lookup |

## Constraints

- Foreign keys use `ON DELETE CASCADE`
- `bans`: UNIQUE(server_id, user_id)
- `timeouts`: UNIQUE(server_id, user_id)
- `dm_channels`: UNIQUE(participant_1, participant_2)

## Related

- [Database](../deployment/database.md) — Setup and backups
- [REST API](rest-api.md) — API endpoints

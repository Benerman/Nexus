# Channels

Channels are where conversations happen in Nexus. They live inside servers and are organized into categories.

## Channel Types

| Type | Prefix | Description |
|------|--------|-------------|
| Text | `#` | Text messaging, attachments, reactions, threads |
| Voice | 🔊 | Real-time voice and video communication |

## Creating Channels

1. Click the **+** next to a category name (requires `manageChannels` permission)
2. Enter a name (2–32 characters, lowercase alphanumeric with hyphens and underscores)
3. Select the channel type (text or voice)
4. Click **Create**

Channel names must match the pattern `a-z`, `0-9`, `-`, `_` (e.g., `general-chat`, `dev_updates`).

## Categories

Categories group channels together. Every server starts with two categories: **GENERAL** and **VOICE**.

### Creating Categories

1. Right-click in the channel list → **Create Category**
2. Enter a name
3. Drag channels into the category to organize them

### Reordering

Drag and drop channels and categories to reorder them. The position is saved server-side.

## Channel Settings

Click the gear icon next to a channel name to access settings (requires `manageChannels` permission):

| Setting | Description |
|---------|-------------|
| Name | Channel display name |
| Topic | Channel topic shown in the header (up to 256 characters) |
| Description | Channel description (up to 128 characters) |
| NSFW | Mark as age-restricted content |
| Slow Mode | Rate limit messages per user (in seconds, 0 = off) |
| Private | Hide channel from members without explicit access |

## Permission Overrides

Each channel can have per-role permission overrides that take precedence over server-level role permissions. See [Channel Permissions](../server-admin/channel-permissions.md).

Override values:
- **Allow** (true) — Grant the permission in this channel
- **Deny** (false) — Revoke the permission in this channel
- **Inherit** (null) — Use the server-level role setting

## Related

- [Messaging](messaging.md) — Sending messages in text channels
- [Voice & Video](voice-and-video.md) — Using voice channels
- [Channel Permissions](../server-admin/channel-permissions.md) — Per-channel access control

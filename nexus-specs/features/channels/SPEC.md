# Channels Feature Spec

## Source Files

- `server/handlers/channels.js` — Channel and category CRUD, moderation queries

## Behaviors

### Channel Types

- `text` — standard text messaging channel.
- `voice` — voice/video channel (no text messages). Members join/leave voice here.

### CRUD

- `channel:create` — requires Manage Channels. Fields: name (1–100 chars), type, categoryId (optional), position.
- `channel:update` — requires Manage Channels. Can update name, topic, position, category.
- `channel:delete` — requires Manage Channels. Cascades messages and permissions.
- `category:create`, `category:update`, `category:delete` — requires Manage Channels.

### Permission Overrides

- `channel:update-permissions` — sets per-role or per-member `allow`/`deny` permission bits for the channel.
- Requires Manage Channels.

### Moderation

- Channel-scoped moderation queries (audit log, timeout, etc.) available to mods.

## Edge Cases

- Channel name with special characters or very long name
- Deleting a category with channels in it — channels should be uncategorized, not deleted
- Channel position conflicts (two channels at same position)
- Viewing a channel the user doesn't have Read Messages permission for — must not emit history

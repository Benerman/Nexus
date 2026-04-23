# Messaging Feature Spec

## Source Files

- `server/handlers/messages.js` — Socket.IO messaging events
- `client/src/components/ChatArea.js` — Message display, input, attachments, reactions, previews

## Behaviors

### Sending

- Event: `message:send` — `{ channelId, content, attachments? }`
- Content max: 4000 characters.
- HTML is NOT rendered — content is plain text (XSS must be prevented on client render).
- Attachments: base64 encoded, stored on disk, referenced by URL in the message.
- Rate limited per user.

### Editing

- Event: `message:edit` — `{ messageId, content }`
- Only the message author can edit.
- Edited messages show "(edited)" indicator.
- Content validation same as send.

### Deletion

- Event: `message:delete` — `{ messageId }`
- Author can delete own messages. Moderators/admins can delete any message in their server.
- Soft or hard delete — message removed from channel view.

### Reactions

- Event: `message:reaction` — `{ messageId, emoji }`
- Standard Unicode emoji and custom server emoji supported.
- A user can add/remove their own reaction. Toggle behavior.
- Reactions stored as JSONB on the message row.

### Pins

- Event: `message:pin`, `message:unpin` — `{ messageId, channelId }`
- Requires Manage Messages permission.
- Pinned messages retrievable via `message:get-pins`.

### Threads

- `message:thread-create` — creates a thread on an existing message.
- Thread replies follow same send/edit/delete rules as regular messages.
- Threads are per-message, within the same channel.

### Search

- Event: `message:search` — `{ channelId, query }`
- Full-text search within a channel.
- Results ordered by relevance or recency.

### URL Previews

- Server-side fetch of URL metadata (title, description, image).
- SSRF protection: must not fetch internal/private IPs.
- `GET /api/og` — returns preview data for a URL.

## Edge Cases

See `edge-cases.md`.

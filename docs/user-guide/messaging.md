# Messaging

## Sending Messages

Type in the message input at the bottom of a text channel and press **Enter** to send. Messages can contain up to 2,000 characters and up to 20 newlines.

## Message Formatting

Nexus supports Markdown formatting:

| Syntax | Result |
|--------|--------|
| `**bold**` | **bold** |
| `*italic*` | *italic* |
| `~~strikethrough~~` | ~~strikethrough~~ |
| `` `inline code` `` | `inline code` |
| ` ```code block``` ` | Fenced code block |
| `> quote` | Block quote |
| `[link](url)` | Clickable link |

## Attachments

Attach files by clicking the **+** button or dragging files into the message input.

| Limit | Value |
|-------|-------|
| Max attachments per message | 4 |
| Max file size | 10 MB |
| Supported image formats | PNG, JPG, JPEG, GIF, WebP |

Images display inline with a lightbox viewer (click to expand, press Escape to close).

## Mentions

- `@username` — Mention a specific user
- `@everyone` — Mention all members (requires `mentionEveryone` permission)

## Reactions

Click the emoji button on a message or use the reaction picker to add reactions. Each message supports multiple reactions with 8 quick-pick emoji available.

See [Reactions & Emoji](reactions-and-emoji.md) for details.

## Replying

Click the **Reply** button on a message to start a threaded reply. The original message is shown as context above your reply.

## Editing Messages

Click the pencil icon on your own message to edit it. Edited messages show an "(edited)" indicator with the edit timestamp.

## Deleting Messages

Click the trash icon on your own message to delete it. Users with `manageMessages` permission can delete any message in the channel. Deletion cascades (removes reactions, thread references, etc.).

## Pinning Messages

Right-click a message → **Pin** to pin it to the channel (requires `manageMessages` permission). View pinned messages by clicking the pin icon in the channel header.

## GIF Picker

If `GIPHY_API_KEY` is configured, click the GIF button in the message input to search and send GIFs. Supports search and trending.

## Polls

Create polls using the `/poll` slash command. The client opens a modal to configure poll options.

## URL Previews

URLs in messages automatically generate Open Graph previews showing the page title, description, and thumbnail. The server fetches metadata with SSRF protection.

## Typing Indicators

When you're typing, other users in the channel see a typing indicator. The indicator clears after 1.5 seconds of inactivity.

## Message Grouping

Messages from the same author within a 5-minute window are grouped together (no repeated avatar/username). Date separators ("Today", "Yesterday", or the formatted date) appear between different days.

## Related

- [Search](search.md) — Find messages across channels
- [Threads](threads.md) — Threaded conversations
- [Slash Commands](slash-commands.md) — Built-in commands
- [Bookmarks & Pins](bookmarks-and-pins.md) — Saving messages

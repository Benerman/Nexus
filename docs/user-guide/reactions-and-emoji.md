# Reactions & Emoji

## Adding Reactions

Hover over a message and click the emoji button to add a reaction. You can also click an existing reaction to add your vote.

### Quick-Pick Emoji

8 frequently used emoji are available in the quick-pick bar for fast reactions.

### Emoji Picker

Click the full emoji picker to browse all available emoji, including:
- Standard Unicode emoji
- Custom server emoji (if any are uploaded)

## Custom Server Emoji

Server admins can upload custom emoji. See [Custom Emoji](../server-admin/custom-emoji.md).

Custom emoji are available to all members of that server in both the reaction picker and the message composer.

## Reaction Behavior

- Multiple reactions per message are supported
- Click a reaction to toggle your vote on/off
- Reactions are stored as JSONB in the message record
- Reaction data includes the emoji identifier and list of user IDs

## Rate Limits

- Reactions: 30 per 10 seconds

## Related

- [Messaging](messaging.md) — Sending messages
- [Custom Emoji](../server-admin/custom-emoji.md) — Uploading server emoji

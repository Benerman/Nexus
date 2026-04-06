# Search

Nexus supports message search with operators for filtering results.

## Basic Search

Click the search icon in the channel header and type your query. Results are ranked by relevance and displayed with context.

## Search Operators

| Operator | Example | Description |
|----------|---------|-------------|
| `from:` | `from:username` | Messages from a specific user |
| `in:` | `in:general` | Messages in a specific channel |
| `has:` | `has:link` | Messages containing links |
| `has:` | `has:attachment` | Messages with file attachments |
| `has:` | `has:embed` | Messages with embeds |
| `before:` | `before:2024-01-01` | Messages before a date |
| `after:` | `after:2024-01-01` | Messages after a date |

Operators can be combined:

```
from:alice in:general has:attachment after:2024-06-01
```

## Search Scope

Search queries run against the current server's channels that you have `viewChannel` permission for. DM search is scoped to the active conversation.

## Related

- [Messaging](messaging.md) — Message features
- [Bookmarks & Pins](bookmarks-and-pins.md) — Saving important messages

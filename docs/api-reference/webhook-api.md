# Webhook API

Post messages to Nexus channels from external services.

## Endpoint

```
POST /api/webhooks/:webhookId/:token
```

No authentication header required — the token in the URL serves as authentication.

## Request Body

```json
{
  "content": "Message text",
  "username": "Custom Bot Name",
  "avatar_url": "https://example.com/avatar.png",
  "embeds": [
    {
      "title": "Embed Title",
      "description": "Embed description text",
      "color": "#3B82F6",
      "url": "https://example.com"
    }
  ],
  "attachments": []
}
```

## Field Limits

| Field | Limit |
|-------|-------|
| `content` | 2,000 characters |
| `embeds` | Up to 10 per message |
| `attachments` | Up to 4 per message |
| `username` | Optional custom display name |
| `avatar_url` | Optional custom avatar URL |

## Rate Limits

**10 requests per 10 seconds** per webhook.

## Response

Success returns the created message object. Errors return a JSON error message.

## Webhook Token

The token is a 32-byte random string (64-character hex), generated when the webhook is created. It is shown only once at creation time — store it securely.

## Message Appearance

Webhook messages display in chat with:
- Custom username and avatar (if provided, otherwise webhook defaults)
- A **BOT** badge
- `is_webhook: true` flag

## Related

- [Webhooks](../server-admin/webhooks.md) — Creating and managing webhooks
- [REST API](rest-api.md) — All HTTP endpoints

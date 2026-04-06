# Webhooks

Webhooks allow external services to post messages into Nexus channels.

## Creating a Webhook

1. Go to **Server Settings → Webhooks**
2. Click **Create Webhook**
3. Set a name and select a target channel
4. Copy the webhook URL and token

The webhook token is a 32-byte random string (64-char hex), shown only once at creation.

## Webhook URL

```
POST /api/webhooks/:webhookId/:token
```

## Posting a Message

```bash
curl -X POST "https://nexus.example.com/api/webhooks/WEBHOOK_ID/TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Hello from a webhook!",
    "username": "CI Bot",
    "avatar_url": "https://example.com/bot-avatar.png"
  }'
```

## Payload Format

```json
{
  "content": "Message text (up to 2000 characters)",
  "username": "Custom display name (optional)",
  "avatar_url": "Custom avatar URL (optional)",
  "embeds": [
    {
      "title": "Embed title",
      "description": "Embed description",
      "color": "#3B82F6",
      "url": "https://example.com"
    }
  ],
  "attachments": []
}
```

| Field | Limit |
|-------|-------|
| `content` | 2,000 characters |
| `embeds` | Up to 10 per message |
| `attachments` | Up to 4 per message |

## Rate Limits

Webhook messages are rate limited to **10 requests per 10 seconds** per webhook.

## Webhook Messages in Chat

Webhook messages display with:
- Custom username and avatar (if provided)
- A **BOT** badge
- `is_webhook: true` flag in the database

## Integration Examples

### GitHub Push Notifications

Configure a GitHub webhook to POST to your Nexus webhook URL on push events.

### CI/CD Build Notifications

Post build status from your CI pipeline (GitHub Actions, GitLab CI, Jenkins) using curl.

## Deleting a Webhook

Go to **Server Settings → Webhooks** → click **Delete** on the webhook. This invalidates the webhook URL immediately.

## Related

- [Webhook API](../api-reference/webhook-api.md) — Detailed API reference
- [Bot Accounts](../bots-and-integrations/bot-accounts.md) — Bot integration

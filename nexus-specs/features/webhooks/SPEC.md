# Webhooks Feature Spec

## Source Files

- `server/handlers/webhooks.js` — webhook create/delete
- `server/index.js` — `POST /api/webhooks/:webhookId/:token` — receive webhook messages

## Behaviors

- `webhook:create` — create webhook for a channel. Requires Manage Webhooks.
- `webhook:delete` — delete webhook. Requires Manage Webhooks.
- External systems POST to `/api/webhooks/:webhookId/:token` with `{ content, username? }`.
- Webhook messages are rate limited: 10 per 10 seconds per webhook.
- Token is validated against DB — webhooks cannot be triggered with wrong token.
- Messages posted by webhook appear in the channel like normal messages, attributed to webhook name.

## Edge Cases

- Webhook with invalid/wrong token — must return 401, not 200
- Webhook message > content limit — must be rejected
- Webhook to deleted channel — must return 404 or 410
- Webhook rate limit exceeded — must return 429
- Webhook token brute force — rate limit applies per webhook ID

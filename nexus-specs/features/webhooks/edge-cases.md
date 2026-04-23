# Webhooks Edge Cases

- Wrong token — must return 401, not post message
- Rate limit exceeded — must return 429
- Webhook to deleted/non-existent channel — 404
- Message content > limit — rejected
- Token brute force (many failed attempts) — rate limit applies
- Webhook message containing XSS payload — must be sanitized same as user messages

# Webhooks Test Criteria

- [ ] Webhook POST with valid token posts message to channel
- [ ] Webhook POST with invalid token returns 401
- [ ] Webhook rate limit returns 429 after 10 requests in 10 seconds
- [ ] Webhook to non-existent webhook ID returns 404
- [ ] Webhook message content is sanitized (no XSS)
- [ ] Webhook create requires Manage Webhooks permission
- [ ] Webhook delete removes webhook from DB

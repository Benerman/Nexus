# Rate Limiting

Nexus applies rate limits at multiple layers to prevent abuse.

## API Rate Limits

| Scope | Limit | Window |
|-------|-------|--------|
| Global API (`/api/*`) | 10 requests | 10 seconds per IP |
| Webhook endpoint | 10 requests | 10 seconds per webhook |

## Socket.IO Rate Limits

| Operation | Limit | Window |
|-----------|-------|--------|
| Messages | 10 | 10 seconds per user |
| Server creation | 3 | 60 seconds |
| Channel create/delete | 10 | 60 seconds |
| Role creation | 10 | 60 seconds |
| Emoji upload | 5 | 60 seconds |
| DM creation | 10 | 60 seconds |
| Group DM creation | 5 | 60 seconds |
| User updates | 10 | 60 seconds |
| Typing indicators | 20 | 10 seconds |
| Reactions | 30 | 10 seconds |
| Soundboard | 10 | 10 seconds |
| Participant management | 20 | 60 seconds |
| Mark as read | 100 | 60 seconds |
| MCP messages | 30 | 10 seconds |
| MCP token creation | 5 | 60 seconds |
| MCP bot creation | 3 | 60 seconds |
| MCP streaming | 30 | 10 seconds |

## Configurable Limits

Message rate limiting can be adjusted via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `RATE_LIMIT_MESSAGES` | `10` | Messages per window |
| `RATE_LIMIT_WINDOW` | `10000` (10s) | Window in milliseconds |

## Channel Slow Mode

Individual channels can have slow mode enabled, which adds an additional per-user cooldown (in seconds) on top of the global rate limit. Configure in channel settings.

## Related

- [Environment Variables](../deployment/environment-variables.md) — Rate limit configuration
- [Input Validation](input-validation.md) — Input constraints

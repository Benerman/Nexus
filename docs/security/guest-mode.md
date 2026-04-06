# Guest Mode

Allow anonymous access to your Nexus instance.

## Enabling Guest Mode

Set the `ENABLE_GUEST_MODE` environment variable:

```bash
ENABLE_GUEST_MODE=true
```

Default: `false` (disabled).

## Guest Capabilities

Guest users can browse servers and read messages but have limited capabilities compared to registered users.

## Security Considerations

Enabling guest mode increases the attack surface. Consider:
- Rate limiting is still enforced for guests
- Guest actions are still validated
- Guests cannot perform privileged operations

## Related

- [Accounts](../user-guide/accounts.md) — Registration
- [Environment Variables](../deployment/environment-variables.md) — Configuration

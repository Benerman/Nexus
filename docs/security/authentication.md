# Authentication

## Token Lifecycle

Nexus uses JWT tokens for authentication:

| Token | Expiry | Purpose |
|-------|--------|---------|
| Access token | 7 days (604,800,000 ms) | API and Socket.IO authentication |
| Refresh token | 30 days (2,592,000,000 ms) | Refresh expired access tokens |

Configure via `SESSION_EXPIRY` and `REFRESH_EXPIRY` environment variables.

## Password Hashing

Passwords are hashed using bcrypt with 12 rounds. The hash and salt are stored in the `accounts` table. Plaintext passwords are never stored or logged.

## Session Management

- Tokens are stored in the browser (localStorage)
- Tokens are validated on every Socket.IO connection and API request
- Logout invalidates the token server-side
- `POST /api/auth/logout` clears the session

## Token Storage

Tokens are stored in the `tokens` table with:
- Token value
- Account ID
- Expiration timestamp

Expired tokens are not automatically cleaned up — consider periodic purging for long-running instances.

## Security Notes

- `JWT_SECRET` must be a long, random string in production
- The default `dev-secret-key` is rejected in production mode
- HTTPS is strongly recommended to protect tokens in transit

## Related

- [Accounts](../user-guide/accounts.md) — Registration and login
- [Environment Variables](../deployment/environment-variables.md) — Auth configuration
- [Rate Limiting](rate-limiting.md) — API rate limits

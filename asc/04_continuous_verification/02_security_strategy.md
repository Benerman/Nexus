# Security Strategy

## Current Security Measures

### Authentication & Authorization
- **Password hashing**: bcrypt with 12 rounds (OWASP recommended)
- **JWT tokens**: 7-day expiry, 30-day refresh tokens
- **Session management**: Redis-backed sessions
- **Permission checks**: Dual-sided (client + server) with role hierarchy
- **Platform admin**: Single designated user via `PLATFORM_ADMIN` env var

### Input Security
- **Validation**: All user input sanitized via validation.js
- **XSS prevention**: Helmet.js with Content Security Policy
- **SSRF protection**: URL preview endpoint (`/api/og`) guards against internal network access
- **SQL injection**: Parameterized queries throughout db.js
- **Rate limiting**: 10 req/10s on API, 10 msg/10s on chat

### Transport Security
- **E2E encryption**: X25519 + libsodium for DM messages
- **CORS**: Whitelist-based configuration
- **Nginx**: Reverse proxy with WebSocket upgrade support

### Production Safety
- **Fail-fast config**: Server exits if `JWT_SECRET`, `DATABASE_URL`, or `POSTGRES_PASSWORD` missing
- **Default secret prevention**: Rejects default JWT secret in production

## CI Security Gates

### Dependency Audit (Blocking)
```yaml
- name: Audit dependencies
  run: npm audit --audit-level=high
```
Blocks PR merge on any high or critical vulnerability.

### Security Test Suite
Part of the 299 automated tests. Covers:
- Injection attack vectors
- XSS payload handling
- Authentication bypass attempts
- Permission escalation scenarios

## Security Practices

| Practice | Status | Implementation |
|----------|--------|----------------|
| Input sanitization | Active | validation.js on all user data |
| Parameterized SQL | Active | All db.js queries |
| CSP headers | Active | Helmet.js configuration |
| CORS whitelist | Active | Express middleware |
| Rate limiting | Active | API + Socket.IO message limits |
| Dependency scanning | Active | npm audit in CI (blocking) |
| Secret rotation | Manual | JWT_SECRET via env var |
| Log redaction | Partial | Winston filters sensitive fields |

## Known Security Considerations

1. **In-memory state**: Not encrypted at rest (acceptable for self-hosted)
2. **No WAF**: Relies on application-level protections
3. **Single admin model**: No multi-factor or role-based admin access
4. **JWT in localStorage**: Standard web practice but vulnerable to XSS (mitigated by CSP)

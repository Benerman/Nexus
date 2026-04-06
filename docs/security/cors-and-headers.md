# CORS & Security Headers

## CORS Configuration

Nexus uses `CLIENT_URL` as the primary CORS origin. Additional origins can be added via `ALLOWED_ORIGINS` (comma-separated).

```bash
CLIENT_URL=https://nexus.example.com
ALLOWED_ORIGINS=https://app.example.com,https://mobile.example.com
```

CORS errors typically indicate a mismatch between `CLIENT_URL` and the actual domain users access.

## Helmet.js

Nexus uses Helmet.js to set security headers including:
- Content Security Policy (CSP)
- X-Content-Type-Options
- X-Frame-Options
- Strict-Transport-Security (HSTS)
- X-XSS-Protection

## Related

- [Environment Variables](../deployment/environment-variables.md) — CORS configuration
- [Input Validation](input-validation.md) — Input security

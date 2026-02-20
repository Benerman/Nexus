# Production Hardening TODO

These items need to be completed before production release.

## Pending Items

1. **Remove 'unsafe-inline' and 'unsafe-eval' from CSP** — Use nonce or hashes for inline scripts/styles
2. **Set NODE_ENV=production in docker-compose.yml** — Currently set to `development`
3. **Disable webContentsDebuggingEnabled in Capacitor** — Only for production builds
4. **Remove source maps** — Set `GENERATE_SOURCEMAP=false` in production builds
5. **Enforce HTTPS for API connections** — Native apps should reject non-HTTPS in production
6. **Tune rate limiting** — Review and adjust rate limit values for production traffic
7. **Add security headers to server responses** — X-Content-Type-Options, X-Frame-Options, etc.

## Already Completed

- Production env var validation in `server/config.js` (fails fast if JWT_SECRET, DATABASE_URL, POSTGRES_PASSWORD missing)
- Hardcoded passwords removed from `docker-entrypoint.sh` (uses `${POSTGRES_PASSWORD:-postgres}`)
- `.gitignore` covering all secrets, build artifacts, native projects
- `.env.example` templates for safe onboarding
- CORS multi-origin support for native app origins

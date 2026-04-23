# Auth Feature Context

Authentication is the trust anchor for all other features. Every Socket.IO connection and most REST requests are gated on a valid JWT.

The self-hosted deployment model means operators set their own `JWT_SECRET`. A missing or weak secret is the most common misconfiguration risk.

Login rate limiting (per IP) is the primary brute-force defense. There is no account lockout, no CAPTCHA, and no refresh token rotation.

The server does not maintain a token revocation list — logout is client-side. A stolen JWT is valid until expiry. This is an accepted trade-off for simplicity in a self-hosted tool.

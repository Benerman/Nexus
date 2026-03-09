# Assumption Registry

Each assumption is tagged: **Validated** (confirmed by implementation/testing), **Active** (believed true, not yet stress-tested), or **At Risk** (may need revisiting).

## Architecture Assumptions

| # | Assumption | Status | Evidence |
|---|-----------|--------|----------|
| A01 | In-memory state with O(1) indexing is sufficient for user presence | **Active** | Works for current scale; untested beyond ~500 concurrent users |
| A02 | Socket.IO handles all real-time needs without a dedicated message broker | **Validated** | Functioning in production; Redis adapter available if scaling needed |
| A03 | PostgreSQL is sufficient as the sole persistent datastore | **Validated** | 16+ tables, JSONB for flexible data, FTS for search |
| A04 | Single-server Docker Compose deployment meets target audience needs | **Active** | Self-hosted users typically run single machines; no clustering yet |
| A05 | WebRTC P2P is viable without an SFU for voice/video | **Active** | Works for small groups; will degrade at 8+ participants per channel |
| A06 | Monolithic server architecture is acceptable at current scale | **At Risk** | index.js at ~1012 lines, App.js at ~77KB; roadmap flags refactor |
| A07 | Redis is needed only for session caching, not as primary state | **Validated** | Used for session store; in-memory state.js handles runtime |

## Security Assumptions

| # | Assumption | Status | Evidence |
|---|-----------|--------|----------|
| A08 | bcrypt with 12 rounds is sufficient for password hashing | **Validated** | Industry standard; OWASP recommended |
| A09 | JWT with 7-day expiry balances security and UX | **Active** | Common choice; refresh tokens extend to 30 days |
| A10 | Input sanitization on all user data prevents injection | **Validated** | validation.js covers all inputs; 299 tests include security suite |
| A11 | E2E encryption with X25519 + libsodium is trustworthy for DMs | **Validated** | Implemented; NaCl/libsodium is well-audited |
| A12 | SSRF protection on URL previews is sufficient | **Validated** | /api/og route includes SSRF guards |

## User & Deployment Assumptions

| # | Assumption | Status | Evidence |
|---|-----------|--------|----------|
| A13 | Target users can run Docker Compose on their own hardware | **Active** | Simplest self-host story; may miss non-Docker users |
| A14 | Web is the primary client; desktop/mobile are secondary | **Validated** | Stated in CLAUDE.md conventions; Tauri/Electron/Capacitor are fallback |
| A15 | LAN mode users accept reduced features (no GIFs, no URL previews) | **Active** | Implemented as per-server toggle; user acceptance unknown |
| A16 | Single platform admin (env var) is sufficient access control | **Active** | Works for single-server deployments; no multi-admin yet |

## Scaling Assumptions

| # | Assumption | Status | Evidence |
|---|-----------|--------|----------|
| A17 | Connection pool of 20 PostgreSQL clients handles expected load | **Active** | Default in db.js; no load testing data beyond perf test suite |
| A18 | Rate limiting (10 req/10s API, 10 msg/10s chat) prevents abuse | **Validated** | Implemented and tested; sufficient for self-hosted scale |

# Acceptance Contract

Acceptance criteria mapped to verification methods. Each criterion references Phase 00 success criteria (SC-NN) where applicable.

## Automated Verification (CI-Enforced)

| ID | Criterion | Verification | Gate |
|----|-----------|-------------|------|
| AC-001 | All unit tests pass | `npm test` — 299 tests across validation, utils, permissions, config, security | PR merge blocked on failure |
| AC-002 | No critical/high npm vulnerabilities | `npm audit --audit-level=high` | PR merge blocked on failure |
| AC-003 | Server builds without error | `npm ci` in server/ | PR merge blocked on failure |
| AC-004 | Client builds without error | `npm ci` in client/ | PR merge blocked on failure |
| AC-005 | Test coverage ≥ 90% | Jest --coverage threshold | PR merge blocked on failure |

## Deployment Verification (Post-Deploy)

| ID | Criterion | Verification | Relates To |
|----|-----------|-------------|------------|
| AC-010 | Server health endpoint responds | `GET /api/health` returns 200 | SC-06 |
| AC-011 | Client loads successfully | `GET /` on port 3000 returns 200 | SC-06 |
| AC-012 | Metrics endpoint collecting data | `GET /api/metrics` returns valid JSON | SC-15, SC-16 |
| AC-013 | WebSocket connections accepted | Socket.IO handshake succeeds | SC-06 |
| AC-014 | Database migrations applied | Server starts without migration errors | SC-07 |

## Manual Verification (Release Gates)

| ID | Criterion | Verification | Relates To |
|----|-----------|-------------|------------|
| AC-020 | Voice join/leave works | Manual test TC-025 through TC-030 | SC-04 |
| AC-021 | Message send/receive works | Manual test TC-006 through TC-015 | SC-14 |
| AC-022 | Auth flow (register/login/logout) | Manual test TC-001 through TC-005 | SC-13 |
| AC-023 | DM creation and messaging | Manual test TC-034 through TC-038 | SC-01 |
| AC-024 | E2E encryption active on DMs | Lock icon visible; messages encrypted in DB | SC-12 |
| AC-025 | Voice audio quality acceptable | Subjective listening test with RNNoise active | SC-04 |

## Performance Targets

| ID | Criterion | Target | Verification |
|----|-----------|--------|-------------|
| AC-030 | Message delivery P95 latency | <100ms | Performance test suite |
| AC-031 | API response P95 latency | <200ms | Metrics endpoint |
| AC-032 | Memory usage at 100 concurrent users | <512MB | Metrics endpoint |
| AC-033 | Server startup time | <30s | Deploy workflow timing |
| AC-034 | Docker Compose build time | <5 min | CI workflow timing |

## Security Criteria

| ID | Criterion | Verification |
|----|-----------|-------------|
| AC-040 | No SQL injection vectors | Security test suite + input sanitization |
| AC-041 | No XSS vectors | Helmet.js CSP + input sanitization |
| AC-042 | SSRF protection on URL previews | /api/og route guards |
| AC-043 | JWT secrets not hardcoded | config.js fail-fast in production |
| AC-044 | Password hashing with bcrypt 12 rounds | Auth handler implementation |

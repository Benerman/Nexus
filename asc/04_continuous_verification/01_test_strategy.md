# Test Strategy

## Test Pyramid

```
         ┌─────────┐
         │  Manual  │  40 test cases (8 categories)
         │  Tests   │  Voice, auth, messaging, moderation, etc.
        ─┼─────────┼─
        │ Integration │  Performance/stress test suite
        │   Tests    │  Load testing, latency benchmarking
       ─┼───────────┼─
       │  Unit Tests  │  299 Jest tests
       │              │  Validation, utils, permissions, config, security
       └──────────────┘
```

## Automated Tests (CI-Enforced)

### Unit Tests — 299 tests in `tests/automated/`
- **Validation tests**: Input sanitization, field validation, edge cases
- **Utils tests**: Permission calculation, role hierarchy, channel overrides
- **Config tests**: Environment variable loading, fail-fast behavior
- **Security tests**: Injection prevention, XSS guards, SSRF protection
- **Run**: `npm test` from `server/`
- **Coverage target**: ≥ 90%
- **CI gate**: Blocking — PR cannot merge if tests fail

### Dependency Audit
- **Command**: `npm audit --audit-level=high`
- **CI gate**: Blocking — PR cannot merge with high/critical vulnerabilities
- **Frequency**: Every PR + scheduled (weekly recommended)

## Performance Tests

### Stress Test Suite (`tests/performance/`)
- Load testing with configurable concurrent connections
- Message throughput benchmarking
- Latency percentile tracking (P50, P95, P99)
- **Run**: Requires running server instance
- **CI gate**: Not blocking (run manually or on schedule)

## Manual Tests

### 8 Categories — 40 Test Cases in `tests/manual/`
| Category | File | Test Cases |
|----------|------|------------|
| Auth | 01-auth.md | TC-001 to TC-005 |
| Messaging | 02-messaging.md | TC-006 to TC-015 |
| Channels | 03-channels.md | TC-016 to TC-024 |
| Emoji | 04-emoji.md | TC-020 to TC-024 |
| Voice & Soundboard | 05-voice-and-soundboard.md | TC-025 to TC-079 |
| Social | 06-social.md | TC-030 to TC-035 |
| Moderation | 07-moderation.md | TC-036 to TC-040 |
| UI | 08-ui.md | TC-041 to TC-045 |

### Execution
- Required before production release
- Requires 2-3 browser windows with different accounts
- Voice tests require microphone access
- Document results in test run report

## Coverage Requirements

| Area | Target | Current |
|------|--------|---------|
| Server unit tests | ≥ 90% | ~96% |
| Validation module | 100% | ~100% |
| Permission utils | 100% | ~100% |
| Security tests | Complete coverage of OWASP top 10 | Covered |

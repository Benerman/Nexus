# Performance Strategy

## Performance Test Suite

Located in `tests/performance/`. Provides load testing and latency benchmarking.

### Test Categories
- **Connection load**: Concurrent WebSocket connections ramp-up
- **Message throughput**: Messages per second under load
- **API latency**: REST endpoint response times (P50, P95, P99)
- **Memory profiling**: Heap usage under sustained load

### Running Performance Tests
```bash
# Requires running server instance
cd tests/performance/
node stress-test.js
```

## Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| Message delivery P95 | <100ms | Socket.IO round-trip |
| API response P95 | <200ms | REST endpoint timing |
| Memory at 100 users | <512MB | `/api/metrics` memory stats |
| Server startup | <30s | Container start to healthy |
| Docker build | <5 min | CI workflow timing |

## Monitoring via Metrics Endpoint

`GET /api/metrics` provides real-time performance data:

```json
{
  "connections": { "current": 42, "peak": 128 },
  "messages": {
    "total": 15230,
    "rate_1m": 12.5,
    "rate_5m": 8.3,
    "rate_15m": 6.1
  },
  "api": {
    "total": 4521,
    "rate_1m": 3.2,
    "errors": 12
  },
  "system": {
    "memory_mb": 245,
    "uptime_hours": 72.4,
    "cpu_usage": 0.15
  }
}
```

### Rolling Windows
- **1 minute**: Real-time spike detection
- **5 minutes**: Short-term trend
- **15 minutes**: Baseline comparison

## Performance Regression Prevention

1. **CI**: Unit tests catch algorithmic regressions
2. **Manual**: Performance test suite run before major releases
3. **Runtime**: Metrics endpoint tracks live performance
4. **Alerts**: Incident playbook triggered if metrics exceed thresholds (see Phase 06)

## Known Performance Considerations

| Area | Current State | Risk |
|------|--------------|------|
| In-memory state (state.js) | O(1) lookups | Memory grows linearly with users |
| Message cache | Unbounded in state.messages | Can grow large; needs eviction policy |
| PostgreSQL pool | Max 20 connections | Bottleneck under heavy concurrent DB access |
| WebRTC P2P | No SFU | Bandwidth scales O(n²) with voice participants |
| App.js bundle | 77KB source | Large re-renders possible; no code splitting |

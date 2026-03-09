# Signal Sources

## Runtime Signals

| Source | Signal | Location | Frequency |
|--------|--------|----------|-----------|
| Metrics endpoint | Connection count, message rate, error rate, memory | `/api/metrics` | Continuous |
| Server logs | Error patterns, domain-tagged events | `server/logs/` | Continuous |
| Health checks | Server/client availability | `/health`, `/api/health` | Per deploy + monitoring |
| Docker stats | Container resource usage | `docker stats` | On demand |

## Development Signals

| Source | Signal | Location | Frequency |
|--------|--------|----------|-----------|
| CI test results | Test pass/fail, coverage delta | GitHub Actions | Every PR |
| npm audit | Dependency vulnerabilities | GitHub Actions | Every PR |
| Git history | Change velocity, file churn | `git log`, `git diff` | Per commit |
| Code size | File growth (monolith risk) | Line counts of key files | Periodic review |

## Quality Signals

| Source | Signal | Location | Frequency |
|--------|--------|----------|-----------|
| Manual test results | Feature verification status | `tests/manual/` execution | Pre-release |
| Performance tests | Latency regressions, throughput changes | `tests/performance/` | Pre-release |
| Competitive analysis | Feature gap changes | `docs/COMPETITIVE_ANALYSIS.md` | Quarterly |
| TODO tracking | Completion rate, new items added | `CLAUDE.md` TODO sections | Per development cycle |

## User Signals

| Source | Signal | Location | Frequency |
|--------|--------|----------|-----------|
| GitHub issues | Bug reports, feature requests | GitHub Issues | As filed |
| Deployment logs | Deploy success/failure patterns | CI workflow history | Per deploy |
| Voice quality feedback | Audio processing effectiveness | Manual testing | Per audio change |

## Signal Priority

Signals that should trigger immediate action:
1. **CI failure** on main/develop → investigate immediately
2. **Health check failure** post-deploy → incident response (Phase 06)
3. **Security vulnerability** in npm audit → patch within 24 hours
4. **Error rate spike** in metrics → investigate within 1 hour

Signals that inform planning cycles:
1. **Feature gap changes** in competitive analysis → update Phase 00 priority ranking
2. **TODO completion** → update roadmap and celebrate progress
3. **Performance regression** → add to next development cycle
4. **Code size growth** → consider refactoring in next cycle

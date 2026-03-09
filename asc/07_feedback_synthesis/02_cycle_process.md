# Cycle Process

## Development Cycle Structure

Each development cycle follows the ASC phases, with feedback from Phase 07 feeding back to Phase 00.

```
Phase 00 (Intent) ──▶ Phase 01 (Constraints) ──▶ Phase 02 (Design)
     ▲                                                    │
     │                                                    ▼
Phase 07 (Feedback) ◀── Phase 06 (Operations) ◀── Phase 03 (Implementation)
                                ▲                         │
                                │                         ▼
                         Phase 05 (Deploy) ◀──── Phase 04 (Verification)
```

## Cycle Triggers

A new development cycle is triggered by any of these conditions:

### Immediate Triggers
| Trigger | Source | Action |
|---------|--------|--------|
| Critical security vulnerability | npm audit / CVE report | Hotfix cycle: patch → test → deploy |
| Production incident | Metrics / health check | Fix cycle: diagnose → fix → test → deploy |
| CI failure on protected branch | GitHub Actions | Fix cycle: investigate → fix → verify |

### Planned Triggers
| Trigger | Source | Action |
|---------|--------|--------|
| Roadmap milestone reached | NEXUS_ROADMAP.md / CLAUDE.md TODOs | Plan next milestone; update Phase 00 priorities |
| Competitive gap identified | COMPETITIVE_ANALYSIS.md update | Evaluate priority; add to roadmap if warranted |
| Performance threshold exceeded | Metrics endpoint / perf tests | Plan optimization cycle |
| Quarterly review | Calendar | Full artifact review across all phases |

## Cycle Execution

### 1. Signal Collection
- Review all signal sources (see `01_signal_sources.md`)
- Identify items requiring action
- Categorize as immediate vs. planned

### 2. Priority Assessment
- Update `asc/00_intent_extraction/04_priority_ranking.md`
- Check against current constraints (`asc/01_intent_and_constraints/02_constraints.md`)
- Determine scope of cycle (hotfix, feature, refactor)

### 3. Design & Planning
- For new features: create or update design artifacts (Phase 02)
- For fixes: identify root cause and minimal change set
- For refactors: document target architecture

### 4. Implementation
- Create feature branch from `develop`
- Follow component boundaries (Phase 03)
- Write/update tests (Phase 04)

### 5. Verification
- All automated tests pass
- Manual testing for affected areas
- Security audit check clean
- Performance not regressed

### 6. Deployment
- Merge to `develop` → auto-deploy to dev
- Smoke test on dev instance
- Merge to `main` → auto-deploy to production
- Post-deploy verification (Phase 05 checklist)

### 7. Feedback Collection
- Monitor metrics for 24 hours post-deploy
- Update CLAUDE.md TODOs (mark completed items)
- Update competitive analysis if feature closes a gap
- Log any issues discovered for next cycle

## Artifact Maintenance

| Artifact | Update Frequency | Trigger |
|----------|-----------------|---------|
| Problem Statement (00/01) | Rare | Fundamental direction change |
| Assumption Registry (00/02) | Per cycle | New assumption or validation |
| Priority Ranking (00/04) | Per cycle | Completion or reprioritization |
| Success Criteria (00/05) | Per cycle | New targets or achieved targets |
| Architecture (02/01) | On architecture change | New component or pattern |
| Technical Contracts (02/02) | On API change | New endpoint or event |
| Test Strategy (04/01) | On test additions | New test category |
| Incident Playbooks (06/02) | On new incident type | New failure mode encountered |

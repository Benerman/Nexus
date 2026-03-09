# Phase 00 — Intent Extraction

## Purpose

Capture the fundamental "why" behind Nexus: what problem it solves, who it serves, and what success looks like. This phase converts scattered motivation (README, competitive analysis, roadmap) into structured artifacts that anchor all downstream decisions.

## Gate Criteria

- [ ] Problem statement reviewed and accepted
- [ ] All assumptions documented with validation status
- [ ] Stakeholder map covers all user types
- [ ] Priority ranking reflects current roadmap consensus
- [ ] Success criteria are measurable and testable

## Artifacts

| # | Artifact | Status |
|---|----------|--------|
| 01 | Problem Statement | Filled from README + competitive analysis |
| 02 | Assumption Registry | Filled from architecture decisions |
| 03 | Stakeholder Map | Filled from feature analysis |
| 04 | Priority Ranking | Filled from CLAUDE.md TODOs + NEXUS_ROADMAP.md |
| 05 | Success Criteria | Filled from test suites + roadmap targets |

## Process

1. Extract intent signals from existing docs (README, CLAUDE.md, NEXUS_ROADMAP.md, COMPETITIVE_ANALYSIS.md)
2. Validate extracted intent against implemented features
3. Document gaps between stated intent and current state
4. Review with project stakeholders (self-hosted deployment context)

## Revision Triggers

- New competitive feature emerges that shifts priorities
- User feedback invalidates a core assumption
- Roadmap reprioritization from Phase 07 feedback synthesis

# Priority Ranking

Derived from CLAUDE.md TODOs, NEXUS_ROADMAP.md phases, and competitive analysis gap assessment.

## Tier 1 — Critical (Blocks Growth or Reliability)

| # | Item | Source | Rationale |
|---|------|--------|-----------|
| P01 | Structured logging (Winston/Pino) | CLAUDE.md Infrastructure | Operational blindness without it; blocks metrics |
| P02 | Metrics endpoint & observability | ASC Phase 06 gap | No visibility into running system health |
| P03 | Context menu moderation actions | CLAUDE.md High Priority | Core UX gap; admins can't moderate efficiently |
| P04 | Forum channels | CLAUDE.md High Priority | Discord's most successful community channel type |
| P05 | Automated database backups | CLAUDE.md Infrastructure | Data loss risk without backup automation |

## Tier 2 — High (Competitive Parity)

| # | Item | Source | Rationale |
|---|------|--------|-----------|
| P06 | Service worker for offline shell | CLAUDE.md LAN Mode | Prevents blank page on network hiccup |
| P07 | Keyboard shortcuts | CLAUDE.md Medium Priority | Expected UX in any desktop communication app |
| P08 | Message edit history | CLAUDE.md Medium Priority | Transparency feature; opportunity to lead competitors |
| P09 | Scheduled messages | CLAUDE.md Medium Priority | Workflow feature expected by power users |
| P10 | Theme visual polish (contrast, differentiation) | CLAUDE.md TODO | Affects perceived quality across all themes |

## Tier 3 — Medium (Enhancement)

| # | Item | Source | Rationale |
|---|------|--------|-----------|
| P11 | Stage channels | CLAUDE.md Medium Priority | Events/AMA use case |
| P12 | Server onboarding flow | CLAUDE.md Medium Priority | Improves new-member retention |
| P13 | SSO/OAuth support | CLAUDE.md Infrastructure | Important for team/org deployments |
| P14 | Data retention policies | CLAUDE.md Infrastructure | Compliance and storage management |
| P15 | CSS theme system preparation | CLAUDE.md TODO | Foundation for visual differentiation |

## Tier 4 — Low (Future / Nice-to-Have)

| # | Item | Source | Rationale |
|---|------|--------|-----------|
| P16 | ARIA labels & accessibility | CLAUDE.md TODO | Important but large scope |
| P17 | Keyboard navigation (full) | CLAUDE.md TODO | Depends on P07 shortcuts system |
| P18 | Reduced motion support | CLAUDE.md TODO | Small user segment |
| P19 | GIF picker positioning fix | CLAUDE.md UI Bugs | Cosmetic issue |

## Completed (Removed from Active Priority)

Items marked `[x]` in CLAUDE.md TODOs: AutoMod system, typing indicators, voice persistence, E2E encryption (DMs + key backup + device verification), self-hosted STUN/TURN, LAN mode, font bundling, audio processing pipeline (noise gate, AGC, RNNoise, pipeline architecture, adaptive noise floor).

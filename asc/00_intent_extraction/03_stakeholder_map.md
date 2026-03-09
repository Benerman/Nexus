# Stakeholder Map

## Primary Stakeholders

### Self-Hosted Server Operators
- **Role**: Deploy and maintain Nexus instances
- **Needs**: Easy Docker setup, clear config, reliable upgrades, backup procedures
- **Pain points**: Complex debugging without structured logging, no built-in monitoring
- **Influence**: High — they choose to deploy and maintain the platform

### End Users (Community Members)
- **Role**: Daily communication via text, voice, and video
- **Needs**: Low-latency messaging, reliable voice, familiar UX (Discord-like), cross-platform access
- **Pain points**: Feature gaps vs. Discord (forum channels, stage channels, shortcuts)
- **Influence**: High — retention depends on feature parity and reliability

### Server Administrators
- **Role**: Manage servers, channels, roles, moderation within a Nexus instance
- **Needs**: Role permissions, moderation tools, AutoMod, audit logs, member management
- **Pain points**: Missing context menu moderation, no forum channels
- **Influence**: Medium — they shape community experience

### Platform Administrator
- **Role**: Single designated user (via `PLATFORM_ADMIN` env var) with platform-level control
- **Needs**: Admin panel, user management, server oversight, system metrics
- **Pain points**: No metrics dashboard, limited operational visibility
- **Influence**: Medium — manages the entire instance

## Secondary Stakeholders

### Contributors / Developers
- **Role**: Extend, customize, or contribute to the codebase
- **Needs**: Clear architecture docs, test suite, CI pipeline, coding conventions
- **Pain points**: Monolithic files (index.js, App.js), limited inline docs
- **Influence**: Low-Medium — quality of contributions depends on codebase clarity

### LAN / Air-Gapped Deployers
- **Role**: Run Nexus in environments without internet access
- **Needs**: No external dependencies, self-hosted STUN/TURN, bundled fonts, offline app shell
- **Pain points**: Missing service worker for offline shell, no automated backup
- **Influence**: Low — niche but important for project differentiation

## Stakeholder Needs Matrix

| Need | Operator | User | Admin | Platform Admin | Developer |
|------|----------|------|-------|----------------|-----------|
| Reliability | Critical | Critical | High | Critical | Medium |
| Feature parity | Medium | Critical | High | Medium | Low |
| Monitoring | Critical | Low | Low | Critical | Medium |
| Documentation | High | Low | Medium | Medium | Critical |
| Security | Critical | High | High | Critical | High |
| Performance | High | Critical | Medium | High | Medium |

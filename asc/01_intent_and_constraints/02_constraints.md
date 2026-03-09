# Constraints

## Technical Constraints

| ID | Constraint | Rationale |
|----|-----------|-----------|
| TC-01 | Single Docker Compose deployment | Target audience runs single machines; no Kubernetes/Swarm |
| TC-02 | PostgreSQL as sole persistent datastore | Simplicity; JSONB covers flexible schema needs |
| TC-03 | Redis for session caching only | Avoid Redis as primary state; in-memory state.js for runtime |
| TC-04 | Socket.IO for all real-time communication | Established; REST only for auth, uploads, GIF search, URL previews |
| TC-05 | WebRTC P2P for voice/video (no SFU) | Acceptable for small groups; simplifies deployment |
| TC-06 | Node.js 20+ runtime | LTS version; required by dependencies |
| TC-07 | React (CRA) for client | Established; no framework migration planned |
| TC-08 | Connection pool max 20 PostgreSQL clients | Default in db.js; increase requires config change |

## Resource Constraints

| ID | Constraint | Rationale |
|----|-----------|-----------|
| RC-01 | Single developer / small team | Limits feature velocity; prioritization is critical |
| RC-02 | Self-hosted runner for CI/CD | No cloud CI budget; deploy workflows run on same machine |
| RC-03 | No external monitoring service | Must build observability into the application itself |
| RC-04 | Docker resource limits not yet configured | Risk of one container starving others |

## Quality Constraints

| ID | Constraint | Rationale |
|----|-----------|-----------|
| QC-01 | All user input must be sanitized | OWASP top 10 prevention; validation.js enforces |
| QC-02 | bcrypt 12 rounds for passwords | Industry standard; OWASP recommended minimum |
| QC-03 | Permissions checked on both client and server | Defense in depth; stated in CLAUDE.md conventions |
| QC-04 | No strict linting / no Prettier | Convention by choice; ESLint via CRA with exhaustive-deps disabled |
| QC-05 | Commit messages in imperative mood | Git convention from CLAUDE.md |
| QC-06 | Feature branches → develop → main | Git workflow; no direct commits to main or develop |

## Ethical Constraints

| ID | Constraint | Rationale |
|----|-----------|-----------|
| EC-01 | No telemetry or data collection | Core value proposition is privacy |
| EC-02 | E2E encryption: server never sees DM plaintext | Users must trust the platform with their private conversations |
| EC-03 | Open source (MIT license) | Transparency and auditability |
| EC-04 | No vendor lock-in in dependencies | Avoid proprietary APIs where possible (exception: Giphy, optional) |

## Operational Constraints

| ID | Constraint | Rationale |
|----|-----------|-----------|
| OC-01 | Zero-downtime deploys not guaranteed | Docker Compose stop + rebuild has a brief outage window |
| OC-02 | No horizontal scaling | Single-server architecture; no load balancing |
| OC-03 | Manual database migrations on schema changes | Applied via docker-entrypoint.sh on container start |
| OC-04 | Logs stored locally with 14-day rotation | Winston daily rotation; no external log aggregation |

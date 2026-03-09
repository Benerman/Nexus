# Design Decisions

## DD-001: Docker Compose for Deployment

**Decision**: Use Docker Compose with multi-file overrides (base + prod/dev) for all deployment.

**Alternatives considered**: Kubernetes, bare metal, single Dockerfile

**Rationale**: Target audience is self-hosters on single machines. Docker Compose is the simplest container orchestration that handles multi-service apps. K8s is overkill; bare metal is fragile.

**Consequences**: No horizontal scaling. Acceptable for target scale.

## DD-002: Socket.IO for Real-Time Communication

**Decision**: Use Socket.IO for all real-time features (messages, voice signaling, presence, typing).

**Alternatives considered**: Raw WebSockets, SSE, gRPC streaming

**Rationale**: Socket.IO provides automatic reconnection, room management, acknowledgements, and fallback transport. Reduces boilerplate significantly for a chat application.

**Consequences**: Tied to Socket.IO protocol. Redis adapter available for future multi-server scaling.

## DD-003: In-Memory State with O(1) Indexes

**Decision**: Maintain runtime state (online users, servers, voice channels) in memory with Map-based indexes.

**Alternatives considered**: Redis-backed state, database-only state

**Rationale**: Lowest latency for presence and socket routing. state.js provides O(1) lookups via `userIdToSocketId` and `channelToServer` Maps. Redis would add network hop; DB would be too slow for presence.

**Consequences**: State lost on server restart (acceptable — clients reconnect). Single-server limit.

## DD-004: PostgreSQL with JSONB

**Decision**: Use PostgreSQL as the sole persistent datastore with JSONB columns for flexible data.

**Alternatives considered**: MongoDB, SQLite, PostgreSQL + MongoDB hybrid

**Rationale**: PostgreSQL provides relational integrity (foreign keys, cascades) with JSONB flexibility for reactions, attachments, permissions. Full-text search built in. Single database simplifies deployment.

**Consequences**: JSONB queries can be slower than document databases at scale. Acceptable for target size.

## DD-005: Monolithic Server Architecture

**Decision**: Single Express server with handler modules (not microservices).

**Alternatives considered**: Microservices per domain, serverless functions

**Rationale**: Simplicity of deployment and development. Handler modules provide logical separation. Single process means no inter-service communication overhead.

**Consequences**: Large files (index.js ~1012 lines). Refactor to smaller modules is on roadmap but not yet critical.

## DD-006: WebRTC P2P (No SFU)

**Decision**: Use peer-to-peer WebRTC connections for voice/video rather than a Selective Forwarding Unit.

**Alternatives considered**: Janus SFU, mediasoup, Jitsi

**Rationale**: Simplifies deployment (no media server). Acceptable quality for small groups. Self-hosted Coturn provides STUN/TURN for NAT traversal.

**Consequences**: Quality degrades at 8+ participants. SFU would be needed for large voice channels.

## DD-007: E2E Encryption with libsodium

**Decision**: Use X25519 key exchange + NaCl box encryption via libsodium.js for DM encryption.

**Alternatives considered**: Full Signal Protocol, Web Crypto API, no encryption

**Rationale**: libsodium is well-audited, fast (WASM), and simpler than full Signal Protocol for 1:1 DMs. Provides strong encryption without the complexity of ratcheting (acceptable trade-off for self-hosted platform).

**Consequences**: No forward secrecy per-message (acceptable for self-hosted trust model). Key loss = message history loss (mitigated by key backup feature).

## DD-008: RNNoise for Voice Noise Suppression

**Decision**: Integrate RNNoise via WASM as an AudioWorklet processor for ML-based noise suppression.

**Alternatives considered**: Browser-native noise suppression only, Krisp SDK, custom ML model

**Rationale**: RNNoise is open-source (Xiph.org), MIT licensed, runs in ~1ms per 10ms frame, and is the industry standard for open-source noise cancellation. No external dependencies.

**Consequences**: WASM binary adds ~200KB to client. Fallback to browser-native suppression if WASM fails.

## DD-009: Winston for Structured Logging

**Decision**: Use Winston with domain-prefixed messages and daily file rotation.

**Alternatives considered**: Pino, console-only, external log aggregation

**Rationale**: Winston is mature, supports multiple transports, and domain prefixes (`[Auth]`, `[Voice]`) provide semantic structure in Docker logs. Daily rotation with compression keeps disk usage bounded.

**Consequences**: Console monkey-patching may interfere with debugging. Log-only observability (no metrics until metrics.js added).

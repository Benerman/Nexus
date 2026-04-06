# Glossary

Key terms used in Nexus.

| Term | Definition |
|------|-----------|
| **Server** | A community space containing channels, roles, and members. Each server is independent. |
| **Channel** | A communication space within a server. Can be text (messaging) or voice (audio/video). |
| **Category** | A group of channels for organizational purposes. |
| **Role** | A named set of permissions assigned to server members. Roles have a position in the hierarchy. |
| **Permission** | A boolean flag controlling what a user can do (e.g., send messages, manage channels). |
| **Permission override** | A per-channel modification to a role's permissions (allow, deny, or inherit). |
| **DM** | Direct message — a private conversation between two users. |
| **Group DM** | A direct message conversation with 3 or more participants. |
| **Message request** | A DM from someone you haven't messaged before, requiring acceptance. |
| **Soundboard** | A panel of sound effects playable in voice channels. |
| **STUN** | Session Traversal Utilities for NAT — helps WebRTC clients discover their public IP. |
| **TURN** | Traversal Using Relays around NAT — relays media when direct connections fail. |
| **ICE** | Interactive Connectivity Establishment — the process of finding the best path for WebRTC connections. |
| **WebRTC** | Web Real-Time Communication — browser technology for peer-to-peer audio/video. |
| **Socket.IO** | Real-time event library used for all Nexus communication (messages, voice signaling, presence). |
| **Platform Admin** | The user designated by `PLATFORM_ADMIN` env var with instance-wide management access. |
| **Webhook** | An HTTP endpoint that external services use to post messages into Nexus channels. |
| **E2E Encryption** | End-to-end encryption for 1:1 DMs using X25519 key exchange and NaCl. |
| **LAN Mode** | Per-server mode that disables external features for local network deployments. |
| **Slow mode** | Per-channel rate limit adding a cooldown between messages from the same user. |
| **Theme** | A set of CSS variables controlling the UI color scheme and appearance. |
| **MCP** | Model Context Protocol — integration protocol for AI agents and tools. |

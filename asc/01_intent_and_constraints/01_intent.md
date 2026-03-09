# Intent Statement

## One-Sentence Intent

Nexus provides a self-hosted, open-source, real-time communication platform with Discord-level features that users fully own and control.

## Jobs To Be Done

### Primary Jobs

1. **Communicate in real-time** — Users need to send text messages, share files, and talk via voice/video with low latency in organized channels
2. **Own their data** — Operators need full control over where data lives, who accesses it, and how long it's retained
3. **Self-host easily** — Operators need to deploy the full platform with a single Docker Compose command on their own hardware
4. **Manage communities** — Admins need roles, permissions, moderation tools, and organizational structures (servers, channels, categories)

### Secondary Jobs

5. **Communicate privately** — Users need end-to-end encrypted DMs where even the server operator cannot read messages
6. **Work offline / on LAN** — Users in air-gapped or LAN environments need the platform to function without internet access
7. **Use any device** — Users need cross-platform access via web browser, desktop app (Tauri/Electron), and mobile (Capacitor)
8. **Customize the experience** — Users want themes, custom emoji, soundboards, and configurable audio processing

## Non-Goals

- **Replacing enterprise platforms** — Nexus targets small-to-medium communities, not enterprise compliance (SOC2, HIPAA)
- **Federation** — No Matrix-style federation between instances; each deployment is standalone
- **Mobile-first** — Web and desktop are primary; mobile is a secondary target
- **Bot ecosystem** — Webhooks are supported, but a full bot API/SDK is not in scope

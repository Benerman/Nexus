# Problem Statement

## Core Problem

Existing real-time communication platforms (Discord, Slack, Teams) are closed-source, cloud-dependent, and controlled by third parties. Users cannot self-host, audit the code, own their data, or operate on private networks (LAN/air-gapped). Privacy-conscious individuals and organizations lack a viable alternative that matches the feature set of commercial platforms.

## Who Has This Problem

- **Privacy-conscious users** who want full data ownership and no telemetry
- **Organizations** needing internal communication without third-party data exposure
- **LAN/air-gapped environments** (labs, ships, remote sites) where cloud services are unavailable
- **Developers** who want to extend or customize their communication platform
- **Small communities** who want Discord-like features without platform risk (ToS changes, shutdowns)

## Why Existing Solutions Fall Short

| Platform | Limitation |
|----------|------------|
| Discord | Closed-source, cloud-only, data harvesting, ToS-gated |
| Slack | Expensive at scale, cloud-dependent, limited voice/video |
| Teams | Microsoft ecosystem lock-in, heavy resource usage |
| Matrix/Element | Complex setup, fragmented UX, voice/video still maturing |
| Rocket.Chat | Enterprise-focused, weaker real-time features |
| Mumble | Voice-only, dated UI, no text/messaging features |

## Solution Direction

A self-hosted, open-source communication platform that provides Discord-level feature parity (~67% currently) with:
- Full data ownership (PostgreSQL + local storage)
- LAN mode for offline/air-gapped operation
- End-to-end encryption for DMs
- Cross-platform clients (web, desktop via Tauri/Electron, mobile via Capacitor)
- Single Docker Compose deployment

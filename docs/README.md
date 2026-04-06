# Nexus Documentation

Nexus is a self-hosted, real-time communication platform with text channels, voice/video chat, direct messages, and cross-platform support.

## Getting Started

- [Quick Start](getting-started/quick-start.md) — Get Nexus running in 5 minutes
- [System Requirements](getting-started/requirements.md) — What you need before installing
- [Create Your First Server](getting-started/first-server.md) — Set up your first community

## Deployment

- [Docker Deployment](deployment/docker.md) — Full Docker Compose deployment guide
- [Environment Variables](deployment/environment-variables.md) — Complete configuration reference
- [Traefik & SSL](deployment/traefik-ssl.md) — Reverse proxy with HTTPS
- [Nginx Configuration](deployment/nginx.md) — Nginx reference
- [Database](deployment/database.md) — PostgreSQL setup, backups, and migrations
- [Redis](deployment/redis.md) — Redis configuration and persistence
- [Updating](deployment/updating.md) — How to update Nexus

## User Guide

- [Accounts & Profiles](user-guide/accounts.md) — Registration, login, profile customization
- [Servers](user-guide/servers.md) — Creating, joining, and managing servers
- [Channels](user-guide/channels.md) — Text channels, voice channels, and categories
- [Messaging](user-guide/messaging.md) — Sending messages, formatting, attachments, polls
- [Threads](user-guide/threads.md) — Threaded conversations
- [Search](user-guide/search.md) — Message search operators
- [Reactions & Emoji](user-guide/reactions-and-emoji.md) — Reactions and custom emoji
- [Direct Messages](user-guide/direct-messages.md) — 1:1 and group DMs
- [Friends & Social](user-guide/friends-and-social.md) — Friends, blocking, reporting
- [Voice & Video](user-guide/voice-and-video.md) — Voice chat, video, and DM calls
- [Screen Sharing](user-guide/screen-sharing.md) — Screen sharing and viewing
- [Slash Commands](user-guide/slash-commands.md) — Built-in commands
- [Bookmarks & Pins](user-guide/bookmarks-and-pins.md) — Saving and pinning messages
- [Notifications](user-guide/notifications.md) — Notification settings

## Audio Settings

- [Audio Settings](audio/audio-settings.md) — Mic/speaker selection and testing
- [Noise Suppression](audio/noise-suppression.md) — AI noise cancellation (RNNoise)
- [Noise Gate](audio/noise-gate.md) — Noise gate threshold and attack smoothing
- [AGC](audio/agc.md) — Automatic gain control
- [Push to Talk](audio/push-to-talk.md) — PTT configuration
- [Soundboard](audio/soundboard.md) — Built-in and custom sounds
- [Custom Sounds](audio/custom-sounds.md) — Per-user join/leave sounds
- [STUN/TURN](audio/stun-turn.md) — WebRTC server setup

## Server Administration

- [Roles & Permissions](server-admin/roles-and-permissions.md) — Role hierarchy and 19 permissions
- [Moderation](server-admin/moderation.md) — Kick, ban, timeout, audit logs
- [AutoMod](server-admin/automod.md) — Automated moderation rules
- [Webhooks](server-admin/webhooks.md) — Creating webhooks and integration
- [Invites](server-admin/invites.md) — Server invite links
- [Custom Emoji](server-admin/custom-emoji.md) — Managing server emoji
- [Server Settings](server-admin/server-settings.md) — Name, icon, description, LAN mode
- [Channel Permissions](server-admin/channel-permissions.md) — Per-channel overrides
- [ICE Configuration](server-admin/ice-config.md) — Per-server STUN/TURN settings

## Platform Administration

- [Overview](platform-admin/overview.md) — Platform admin role and access
- [User Management](platform-admin/user-management.md) — Managing platform users
- [Server Management](platform-admin/server-management.md) — Managing all servers
- [Metrics](platform-admin/metrics.md) — Monitoring and metrics endpoint

## Customization

- [Themes](customization/themes.md) — Built-in themes
- [Custom Themes](customization/custom-themes.md) — Theme creator and color system
- [Theme Import/Export](customization/theme-import-export.md) — Sharing themes
- [CSS Variable Reference](customization/css-variable-reference.md) — All 50+ CSS variables

## Cross-Platform

- [Web](cross-platform/web.md) — Web app and browser support
- [Tauri Desktop](cross-platform/tauri-desktop.md) — Windows, macOS, Linux desktop app
- [Electron Desktop](cross-platform/electron-desktop.md) — Electron desktop app
- [Capacitor Mobile](cross-platform/capacitor-mobile.md) — iOS and Android
- [iOS Signing](cross-platform/ios-signing.md) — iOS code signing setup

## Security

- [Authentication](security/authentication.md) — JWT, sessions, token lifecycle
- [Encryption](security/encryption.md) — E2E encryption for DMs
- [Rate Limiting](security/rate-limiting.md) — API and message rate limits
- [Input Validation](security/input-validation.md) — Validation rules and sanitization
- [CORS & Headers](security/cors-and-headers.md) — CORS, Helmet.js, CSP
- [Guest Mode](security/guest-mode.md) — Guest access configuration

## API Reference

- [REST API](api-reference/rest-api.md) — All HTTP endpoints
- [Socket.IO Events](api-reference/socket-events.md) — Real-time event reference
- [Webhook API](api-reference/webhook-api.md) — Webhook endpoint and payloads
- [Database Schema](api-reference/database-schema.md) — Tables, columns, and relationships

## Bots & Integrations

- [Bot Accounts](bots-and-integrations/bot-accounts.md) — Creating and managing bots
- [MCP Connections](bots-and-integrations/mcp-connections.md) — MCP server integration
- [Agent Configuration](bots-and-integrations/agent-config.md) — Agent setup

## Reference

- [FAQ](reference/faq.md) — Common issues and solutions
- [Glossary](reference/glossary.md) — Nexus terminology
- [Contributing](reference/contributing.md) — Development setup and contribution guide
- [Changelog](../docs/CHANGELOG.md) — Release history

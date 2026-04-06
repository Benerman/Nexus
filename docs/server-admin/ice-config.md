# Per-Server ICE Configuration

Server owners can override the global STUN/TURN configuration for their specific server.

## Configuration

Go to **Server Settings → Channels → Voice/WebRTC** to set custom ICE servers for your server.

This is useful for:
- Private networks with their own TURN server
- Organizations that need to route media through specific infrastructure
- Servers where the global TURN configuration doesn't work

## How It Works

When a user joins a voice channel in your server, Nexus uses your custom ICE configuration instead of the global STUN/TURN settings.

## Related

- [STUN/TURN](../audio/stun-turn.md) — Global WebRTC server setup
- [Voice & Video](../user-guide/voice-and-video.md) — Voice channel usage
- [Server Settings](server-settings.md) — Server configuration

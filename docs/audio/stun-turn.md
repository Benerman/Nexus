# STUN/TURN Server Setup

WebRTC requires STUN and optionally TURN servers for voice/video connections across networks.

## Overview

- **STUN** — Tells clients their public IP/port for direct peer connections. Needed when behind NAT.
- **TURN** — Relays media when direct connections fail (symmetric NAT, restrictive firewalls, VPNs, cross-subnet).

**Default:** Nexus uses Google's public STUN servers (`stun.l.google.com:19302`, `stun1.l.google.com:19302`).

## When You Need TURN

- Users behind symmetric NAT or corporate firewalls
- VPN users
- Cross-subnet voice calls
- Any scenario where direct peer connections fail

Without TURN, these users cannot connect to voice channels.

## Option 1: Self-Hosted Coturn (Recommended)

### Setup

1. Generate a TURN secret:

```bash
echo "TURN_SECRET=$(openssl rand -hex 32)" >> .env
```

2. Start with the coturn overlay:

```bash
# Production
docker compose -p nexus-prod -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.coturn.yml up -d --build

# Development
docker compose -p nexus-dev --env-file .env.dev -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.coturn.dev.yml up -d --build
```

### Ports

| Port | Protocol | Purpose | Production | Development |
|------|----------|---------|-----------|-------------|
| 3478 | UDP+TCP | STUN/TURN signaling | 3478 | 3479 |
| 49152–49252 | UDP | Media relay | 49152–49252 | 49253–49353 |

Coturn uses `network_mode: host` for UDP relay.

### Production Configuration

Set `TURN_HOST` to your server's public IP or hostname:

```bash
TURN_HOST=turn.example.com
```

### Verification

```bash
# Check coturn is running
docker logs nexus-coturn

# Test with turnutils (if installed)
turnadmin -k -u "$(date +%s):testuser" -r nexus -p "$TURN_SECRET"
turnutils_uclient -t -u "$(date +%s):testuser" -w "$TURN_SECRET" localhost
```

### Production Hardening

- **TLS:** Mount certificates and update TURN URLs to `turns:` / `stuns:`
- **Firewall:** Only expose ports 3478 and 49152–49252
- **Bandwidth limits:** Add `--max-bps` and `--total-quota` flags
- **Logging:** Use file path for log rotation instead of stdout

## Option 2: External TURN Providers

Set environment variables to use a third-party TURN service:

```bash
STUN_URLS=stun:stun.example.com:3478
TURN_URL=turn:turn.example.com:3478
TURN_SECRET=your-provider-secret
```

Compatible providers: Twilio, Cloudflare TURN, Metered TURN, Xirsys.

Nexus uses HMAC-SHA1 over the shared secret (RFC draft TURN REST API) for ephemeral credential generation. TURN credential TTL is 1 hour (3600 seconds).

## Option 3: Per-Server Custom ICE Configuration

Server owners can override ICE settings per server in **Server Settings → Channels → Voice/WebRTC**. Useful for private networks with their own TURN server.

## LAN Mode

Enable per-server in **Server Settings → Channels → LAN Mode**:

- Disables GIF picker, URL previews, and external ICE servers
- Relies on direct LAN connections only
- For multi-subnet voice, use coturn instead

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `STUN_URLS` | Google STUN servers | Comma-separated STUN URLs |
| `TURN_URL` | — | TURN server URL |
| `TURN_SECRET` | — | Shared secret for ephemeral credentials |
| `TURN_HOST` | `localhost` | Public hostname/IP for coturn |

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Voice works on LAN but not remotely | You need a TURN server |
| Coturn running but relay fails | Check ports are open, host networking enabled, review logs |
| Credentials rejected (401) | Verify `TURN_SECRET` is identical in coturn and Nexus |
| No audio after connecting | Check browser console for ICE state, try disabling VPN |

## Related

- [Voice & Video](../user-guide/voice-and-video.md) — Voice channel usage
- [Docker Deployment](../deployment/docker.md) — Container setup
- [ICE Configuration](../server-admin/ice-config.md) — Per-server settings

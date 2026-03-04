# STUN/TURN Configuration Guide

Nexus uses WebRTC for voice chat and screen sharing. WebRTC requires peers to discover each other's network addresses, which is where STUN and TURN servers come in.

## Overview

| Protocol | Purpose | When needed |
|----------|---------|-------------|
| **STUN** | Tells a client its public IP/port so peers can connect directly | Any time peers are behind NAT (most networks) |
| **TURN** | Relays media when direct connections fail | Symmetric NAT, restrictive firewalls, VPNs, cross-subnet without direct routing |
| **Neither** | Peers connect directly on the same subnet | Flat LAN with [LAN Mode](#lan-mode) enabled |

**Default behavior:** Nexus ships with Google's public STUN servers (`stun.l.google.com`). This works for most internet-connected setups but requires outbound internet access and provides no TURN relay.

---

## Option 1: Self-Hosted Coturn (Recommended for Private Networks)

Nexus includes compose override files that add a [coturn](https://github.com/coturn/coturn) container for self-hosted STUN/TURN. This eliminates the dependency on Google's STUN servers and adds TURN relay support.

### Prerequisites

- Docker and Docker Compose
- Ports available: **3478** (UDP+TCP) and **49152–49252** (UDP) for production
- A shared secret for ephemeral TURN credentials

### Quick Start

1. **Generate a TURN secret** and add it to your `.env`:

   ```bash
   echo "TURN_SECRET=$(openssl rand -hex 32)" >> .env
   ```

2. **Start with the coturn overlay:**

   ```bash
   # Production
   docker-compose -f docker-compose.yml -f docker-compose.coturn.yml up -d --build

   # Development (uses port 3479 to avoid conflicts)
   docker-compose -f docker-compose.yml -f docker-compose.coturn.dev.yml up -d --build
   ```

3. **Verify coturn is running:**

   ```bash
   docker logs nexus-coturn   # production
   docker logs nexus-dev-coturn  # development
   ```

   You should see `Listener opened on 0.0.0.0:3478` (or 3479 for dev).

### Compose Files

| File | Container | Ports | Secret default |
|------|-----------|-------|----------------|
| `docker-compose.coturn.yml` | `nexus-coturn` | 3478, 49152–49252 | **Required** (`TURN_SECRET` must be set) |
| `docker-compose.coturn.dev.yml` | `nexus-dev-coturn` | 3479, 49253–49353 | `nexus-dev-turn-secret` |

Both use `network_mode: host` so coturn can relay UDP media directly. The compose overlay also sets the server's `STUN_URLS`, `TURN_URL`, and `TURN_SECRET` environment variables automatically.

### Port Requirements

| Port | Protocol | Purpose |
|------|----------|---------|
| 3478 | UDP + TCP | STUN binding requests and TURN signaling |
| 49152–49252 | UDP | TURN relay media (100 ports, supports ~50 concurrent calls) |

Open these ports in your firewall. For development, the ports are 3479 and 49253–49353.

### Production Setup

For a server accessible from the internet, set `TURN_HOST` to your public IP or hostname:

```bash
# .env
TURN_SECRET=your-secret-here
TURN_HOST=turn.example.com
```

This ensures the STUN/TURN URLs sent to clients point to the correct address (instead of `localhost`).

### Verifying with turnutils

If you have `coturn` installed locally, you can test credential generation:

```bash
# Generate a test credential (username is timestamp:user)
turnadmin -k -u "$(date +%s):testuser" -r nexus -p "$TURN_SECRET"

# Test connectivity
turnutils_uclient -t -u "$(date +%s):testuser" -w "$TURN_SECRET" localhost
```

### Production Hardening

- **TLS**: Mount certificates and remove `--no-tls --no-dtls` from the command. Update URLs to `stuns:` and `turns:`.
- **Firewall**: Only expose ports 3478 and 49152–49252. Bind coturn to specific interfaces if needed.
- **Bandwidth limits**: Add `--max-bps` and `--total-quota` flags to limit relay bandwidth.
- **Logging**: Replace `--log-file=stdout` with a file path for production log rotation.

---

## Option 2: External TURN Providers

If you don't want to run coturn, you can use a third-party TURN service. Set the environment variables in your `.env` or `docker-compose.yml`:

```bash
# .env
STUN_URLS=stun:global.stun.twilio.com:3478
TURN_URL=turn:global.turn.twilio.com:3478
TURN_SECRET=your-twilio-auth-token
```

### Compatible Providers

| Provider | Notes |
|----------|-------|
| [Twilio Network Traversal](https://www.twilio.com/docs/stun-turn) | Uses API credentials for ephemeral tokens |
| [Cloudflare TURN](https://developers.cloudflare.com/calls/turn/) | Included with Cloudflare Calls |
| [Metered TURN](https://www.metered.ca/turn-server) | Free tier available |
| [Xirsys](https://xirsys.com/) | Free tier with 500MB/month |

> **Note:** Nexus generates ephemeral TURN credentials using HMAC-SHA1 over the shared secret. This is compatible with coturn and most providers that support the TURN REST API (RFC draft). Some providers use different auth mechanisms — check their documentation.

---

## Option 3: Per-Server Custom ICE Configuration

Server owners can override ICE settings per server in **Server Settings → Channels → Voice/WebRTC**. This is useful when:

- Different servers need different relay configurations
- A specific server operates on a private network with its own TURN server
- You want to test ICE changes without affecting all servers

Per-server settings override the global environment variables for that server only.

---

## LAN Mode

LAN Mode is a per-server toggle (Server Settings → Channels) that optimizes Nexus for air-gapped or offline networks:

- **Disables GIF picker** (requires internet for Giphy API)
- **Disables URL previews** (requires internet for fetching Open Graph data)
- **Returns empty ICE servers** (relies on direct LAN connections only)
- **Self-hosted fonts** are already bundled — no Google Fonts dependency

### When to Use

- Air-gapped networks with no internet access
- LAN parties or local events
- Privacy-sensitive environments that should not contact external services

### Voice Chat in LAN Mode

With LAN Mode enabled, WebRTC peers receive no ICE servers and rely on direct host candidates. This works when all users are on the **same subnet**.

For voice across **multiple subnets** (e.g., VLANs, office floors), disable LAN Mode and use a self-hosted coturn instance instead. Coturn provides STUN for NAT traversal and TURN relay when direct connections aren't possible.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `STUN_URLS` | `stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302` | Comma-separated STUN server URLs |
| `TURN_URL` | _(empty)_ | TURN server URL (enables relay) |
| `TURN_SECRET` | _(empty)_ | Shared secret for ephemeral TURN credential generation |
| `TURN_HOST` | `localhost` | Public hostname/IP for coturn URLs (used by compose overlays) |

---

## Troubleshooting

### Voice works on LAN but not remotely

You need a TURN server. Direct peer connections fail when either side is behind symmetric NAT or a restrictive firewall. Set up coturn (Option 1) or use an external provider (Option 2).

### Coturn is running but relay fails

1. **Check ports**: Ensure 3478 and 49152–49252 (UDP) are open in your firewall.
2. **Check host networking**: Coturn needs `network_mode: host` to relay UDP. Verify with `docker inspect nexus-coturn | grep NetworkMode`.
3. **Check logs**: `docker logs nexus-coturn` — look for `Allocation error` or `Cannot bind`.

### Credentials rejected (401)

The `TURN_SECRET` must be identical in coturn's config and the Nexus server's environment. The compose overlay sets both from the same env var, but if you configured them separately, verify they match:

```bash
# Check what the server sees
docker exec nexus-server printenv TURN_SECRET

# Check what coturn sees
docker exec nexus-coturn printenv TURN_SECRET
```

### No audio after connecting

- Check browser console for ICE connection state — `failed` means no network path was found.
- Try disabling VPN or firewall temporarily to isolate the issue.
- If using LAN Mode, ensure all users are on the same subnet.

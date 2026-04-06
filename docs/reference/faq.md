# FAQ

Common issues and solutions for Nexus.

## Installation & Setup

### Port 3000 or 3001 is already in use

Another service is using the port. Either stop that service or change the Nexus ports in your Docker Compose override file.

### "Cannot connect to server" error

- Verify the server container is running: `docker compose -p nexus-prod ps`
- Check `CLIENT_URL` matches the URL you're accessing in the browser
- Check server logs: `docker compose -p nexus-prod logs server`
- Ensure ports 3000 and 3001 are accessible

### Database migration failures

- Check the server logs for specific SQL errors
- Ensure PostgreSQL is healthy: `docker exec nexus-prod-postgres pg_isready`
- Migrations are idempotent — restarting the server retries them

## Voice & Video

### WebRTC not connecting

- Users behind symmetric NAT or corporate firewalls need a TURN server
- See [STUN/TURN setup](../audio/stun-turn.md)
- Check browser console for ICE connection state errors
- Try disabling VPN if active

### No audio after connecting

- Check browser microphone permissions
- Verify correct audio device in Settings → Audio
- Try the mic test to confirm your mic is working

### One-way audio

- Disconnect and reconnect to the voice channel
- Check firewall rules on both ends
- Consider setting up a TURN server

## Networking

### CORS errors

- Verify `CLIENT_URL` in your `.env` exactly matches the domain you access (including `https://`)
- Check `ALLOWED_ORIGINS` if using additional domains
- Clear browser cache and reload

### WebSocket falls back to long polling

- Ensure sticky sessions are enabled on your reverse proxy
- Verify WebSocket upgrade headers are being passed through
- Check that `X-Forwarded-Proto: https` is set (for HTTPS)

### 502 Bad Gateway behind Traefik

- Verify containers are running
- Test direct access to port 3001
- Check Traefik logs for routing errors

## General

### Messages not loading

- Check browser console for errors
- Verify you have `readHistory` permission in the channel
- Clear localStorage and log in again if persistent

### Custom theme not applying

- Custom themes are stored in localStorage — clearing it removes them
- Re-import your theme from the `.nexus-theme.json` file

## Related

- [Quick Start](../getting-started/quick-start.md) — Installation guide
- [Docker Deployment](../deployment/docker.md) — Container management
- [Environment Variables](../deployment/environment-variables.md) — Configuration

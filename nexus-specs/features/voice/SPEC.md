# Voice Feature Spec

## Source Files

- `server/handlers/voice.js` — Voice/WebRTC signaling, soundboard, screen sharing
- `server/state.js` — `voiceChannels` map, `screenSharers` per channel
- `client/src/hooks/useWebRTC.js` — P2P WebRTC peer connection management

## Behaviors

### Voice Join/Leave

- `voice:join` — join a voice channel. Adds user to `voiceChannels[channelId]`. Broadcasts presence to channel room.
- `voice:leave` — leave voice channel. Removes from state. Cleans up peer connections.
- `voice:mute`, `voice:deafen` — broadcast mute/deafen state to channel. No server enforcement — purely cosmetic/signaling.

### WebRTC Signaling

- `webrtc:offer`, `webrtc:answer`, `webrtc:ice-candidate` — relay signaling between peers.
- P2P mesh: each joining user connects to every existing user in the channel. Does not scale above ~8 participants.
- No SFU/MCU. All media flows directly between browsers.

### Screen Sharing

- `voice:screen-share-start` — adds user to `screenSharers[channelId]`. Broadcasts to room.
- `voice:screen-share-stop` — removes user from `screenSharers`.
- Multiple users can share simultaneously (each is a separate WebRTC stream).
- `dangerouslySkipPermissions` is false — user must have View Channel permission.

### Soundboard

- Server-defined audio clips playable into voice channel.
- `soundboard:play` — sends audio to all listeners in channel. Rate limited.

### DM Calls

- 1:1 voice/video calls via DMs. Same WebRTC signaling, scoped to DM context.
- `dm:call-start`, `dm:call-end`, `dm:call-accept`, `dm:call-decline`.

## Edge Cases

- User disconnects mid-call — must clean up voice state and notify peers
- Screen sharer leaves before stopping share — state must be cleaned up
- Voice state lost on server restart — clients must re-join
- Large channel (>8 peers) — P2P mesh degrades; no mitigation at current architecture

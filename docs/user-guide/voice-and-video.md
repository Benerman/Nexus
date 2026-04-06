# Voice & Video

Nexus uses WebRTC for peer-to-peer voice and video communication.

## Joining a Voice Channel

Click on a voice channel in the channel list to join. Your microphone activates automatically (you can mute before joining).

A voice panel appears at the bottom of the sidebar showing:
- Current voice channel name
- Connected users with speaking indicators
- Mute, deafen, and disconnect buttons

## Voice Controls

| Control | Description |
|---------|-------------|
| **Mute** | Toggle your microphone on/off |
| **Deafen** | Mute all incoming audio (also mutes your mic) |
| **Disconnect** | Leave the voice channel |

Mute and deafen states persist in localStorage and are restored when you rejoin.

## Speaking Indicators

Active speakers show a green border around their avatar tile. Speaking detection uses FFT analysis with a 256-sample buffer, 100ms update interval, and a threshold of 15.

## Voice Tiles

Connected users appear as tiles in the voice area:
- Base tile size: 240×240px (CSS Grid layout)
- Green border indicates active speaking
- Username and mute/deafen status shown per tile

## Per-User Volume

Right-click on a user in the voice channel to adjust their individual volume (0–100%) or mute them locally.

## Join/Leave Sounds

Audio cues play when users join or leave:
- **Join:** Two-tone beep (600Hz → 900Hz, 300ms)
- **Leave:** Two-tone beep (900Hz → 600Hz, 300ms)

## DM Calls

Start a voice call from any 1:1 DM conversation:

1. Open a DM conversation
2. Click the **Call** button in the header
3. The other user receives a call notification to accept or decline

DM calls use the same WebRTC infrastructure as voice channels.

## Video

Enable video by clicking the camera icon in the voice controls. Video streams appear in the voice tile grid alongside audio-only users.

## ICE Servers

Nexus uses STUN servers for NAT traversal and optionally TURN servers for relay:

- **Default STUN:** Google's public STUN servers
- **TURN:** Optional, configured via environment variables or per-server settings

See [STUN/TURN](../audio/stun-turn.md) for setup.

## Troubleshooting

- **No audio:** Check browser microphone permissions and selected audio device
- **Can't connect:** You may need a TURN server if behind a restrictive NAT/firewall
- **One-way audio:** Try disconnecting and reconnecting; check firewall settings
- **High latency:** Consider using a TURN server closer to your users

## Related

- [Screen Sharing](screen-sharing.md) — Share your screen
- [Audio Settings](../audio/audio-settings.md) — Mic/speaker configuration
- [STUN/TURN](../audio/stun-turn.md) — WebRTC server setup
- [Push to Talk](../audio/push-to-talk.md) — PTT configuration

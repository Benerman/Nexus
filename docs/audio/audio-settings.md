# Audio Settings

Configure your microphone, speakers, and audio processing in **Settings → Audio**.

## Device Selection

Choose your input (microphone) and output (speaker/headphones) devices from the dropdown menus. Nexus uses the Web Audio API and enumerates available devices via `navigator.mediaDevices.enumerateDevices()`.

## Microphone Test

Click **Test Mic** to see a real-time volume meter showing your microphone input level. Use this to verify your mic is working and adjust system volume before joining a voice channel.

## Audio Processing Pipeline

Nexus offers several audio processing features that can be combined:

| Feature | Description | Details |
|---------|-------------|---------|
| [Noise Suppression](noise-suppression.md) | AI-powered background noise removal | RNNoise with WASM fallback |
| [Noise Gate](noise-gate.md) | Cuts audio below a threshold | Adjustable threshold and attack |
| [AGC](agc.md) | Automatic gain control | Leveler, limiter, VAD-gating |
| [Push to Talk](push-to-talk.md) | Manual mic activation | Configurable key binding |

## Per-User Volume

In a voice channel, right-click any user to adjust their individual volume (0–100%) or locally mute them.

## Related

- [Voice & Video](../user-guide/voice-and-video.md) — Voice channel usage
- [STUN/TURN](stun-turn.md) — WebRTC server configuration

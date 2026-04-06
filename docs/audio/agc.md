# Automatic Gain Control (AGC)

AGC normalizes your microphone volume so you're heard consistently regardless of how close you are to the mic.

## Features

| Feature | Description |
|---------|-------------|
| **Leveler** | Gradually adjusts gain to target a consistent output level |
| **Limiter** | Prevents volume spikes from clipping |
| **VAD-gating** | Uses voice activity detection to only apply gain when speaking |
| **Noise floor tracking** | Adapts to background noise level to avoid amplifying it |

## Configuration

Toggle AGC on/off in **Settings → Audio → Automatic Gain Control**.

## Tips

- AGC works best when combined with noise suppression to avoid amplifying background noise
- If others say your volume fluctuates, try enabling AGC
- Disable AGC if you need precise manual control over your input level

## Related

- [Audio Settings](audio-settings.md) — Overview
- [Noise Suppression](noise-suppression.md) — AI noise cancellation
- [Noise Gate](noise-gate.md) — Threshold-based noise cutting

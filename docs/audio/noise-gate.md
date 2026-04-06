# Noise Gate

The noise gate cuts audio below a volume threshold, preventing low-level background noise from transmitting.

## Configuration

Access in **Settings → Audio → Noise Gate**:

| Setting | Description |
|---------|-------------|
| **Threshold** | Volume level below which audio is cut. Lower = more sensitive. |
| **Attack smoothing** | How quickly the gate opens when you start speaking. Prevents hard cutoffs. |

## How It Works

1. Audio input is analyzed in real-time
2. When volume is below the threshold, audio is muted
3. When volume exceeds the threshold, the gate opens with the configured attack smoothing
4. Sidechain filtering prevents false triggers from non-voice sounds
5. Inter-word pause handling prevents the gate from closing during natural speech pauses

## Tips

- Start with a medium threshold and adjust based on your environment
- Use with noise suppression for best results
- Test with the mic test meter in Audio Settings

## Related

- [Audio Settings](audio-settings.md) — Overview
- [Noise Suppression](noise-suppression.md) — AI noise cancellation
- [AGC](agc.md) — Automatic gain control

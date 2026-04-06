# Noise Suppression

Nexus includes AI-powered noise cancellation using RNNoise.

## How It Works

RNNoise is a recurrent neural network trained to suppress background noise (keyboard clicks, fans, traffic) while preserving voice. It runs entirely in the browser using WebAssembly.

## Aggressiveness Levels

Configure the suppression aggressiveness in **Settings → Audio → Noise Suppression**:

| Level | Description |
|-------|-------------|
| Off | No noise suppression |
| Low | Light suppression, preserves more audio detail |
| Medium | Balanced suppression (recommended) |
| High | Aggressive suppression, may clip quiet speech |

## WASM Fallback

If WebAssembly SIMD is not available in your browser, Nexus falls back to a standard WASM implementation with slightly higher CPU usage.

## Related

- [Audio Settings](audio-settings.md) — Overview
- [Noise Gate](noise-gate.md) — Threshold-based noise cutting
- [AGC](agc.md) — Automatic gain control

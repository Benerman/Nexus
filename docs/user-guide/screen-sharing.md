# Screen Sharing

Share your screen with others in a voice channel or DM call.

## Starting a Screen Share

1. Join a voice channel or DM call
2. Click the **Screen Share** button in the voice controls
3. Select the screen, window, or tab to share
4. Optionally enable system audio sharing (browser support varies)

Your screen share appears as a separate, larger tile labeled **"SCREEN"** in the voice area.

## Viewing a Screen Share

When someone shares their screen:
- A "SCREEN" tile appears in the voice grid
- Click the tile to expand to fullscreen
- Press **Escape** to exit fullscreen

Multiple users can share their screens simultaneously. Each screen share is tracked per-channel in the `screenSharers` array.

## Stopping a Screen Share

Click the **Stop Sharing** button in the voice controls, or close the browser's screen share prompt.

## Late Joiners

Users who join a voice channel after a screen share has started will automatically receive the active screen share streams.

## When the Sharer Leaves

If the user sharing their screen disconnects from the voice channel, the screen share stream ends for all viewers.

## Related

- [Voice & Video](voice-and-video.md) — Voice channel basics
- [Audio Settings](../audio/audio-settings.md) — Audio configuration

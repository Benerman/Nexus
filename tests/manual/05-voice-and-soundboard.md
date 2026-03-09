# Voice, Audio Processing, Streaming & Soundboard Tests

> **Setup:** Most tests require 2-3 browser windows (use incognito + regular, or different browsers) logged into different accounts on the same server. Label them User A, User B, User C.

---

## 1. Voice Channel — Join, Leave & Presence

### TC-025: Join and leave voice channel

**Preconditions:** User A and User B logged in, server has a voice channel

**Steps:**
1. User A clicks on a voice channel in the sidebar
2. Observe voice area appearing with connected indicator, user tile grid, and controls bar
3. User B joins the same voice channel
4. Observe User B's tile appears in User A's view (and vice versa)
5. User A clicks the red "Leave Voice" button
6. Observe User A's tile disappears from User B's view

**Expected Result:**
- Joining: voice area slides in, user tile shows avatar/initials with username, connection dot is green
- Both users see each other's tiles in the grid
- Leaving: voice area dismisses, tile removed from other users' views
- No audio artifacts or lingering connections after leaving

---

### TC-026: Voice quality indicator states

**Preconditions:** User A is in a voice channel

**Steps:**
1. Observe the connection quality dot in the voice header (should be green)
2. Simulate degraded connection (throttle network in DevTools to slow 3G)
3. Observe if the dot changes to yellow or red
4. Observe if a "Reconnect" button appears when connection degrades

**Expected Result:**
- Green dot: connected and healthy
- Yellow dot: connecting or degraded
- Red dot: poor connection
- Reconnect button appears when status is DEGRADED or RECONNECTING

---

### TC-027: Multi-user tile grid layout

**Preconditions:** 3+ users available

**Steps:**
1. Have 1 user join a voice channel — observe tile size (should be large, centered)
2. Have a 2nd user join — observe layout (2 tiles, centered, still large)
3. Have a 3rd user join — observe layout switches to smaller grid tiles
4. Have users leave one by one, observe grid adapts back

**Expected Result:**
- 1-2 users: larger centered tiles
- 3+ users: smaller grid tiles, responsive layout
- Grid transitions smoothly as users join/leave

---

## 2. Mute, Deafen & State Broadcasting

### TC-028: Mute/unmute toggle

**Preconditions:** User A and User B in the same voice channel

**Steps:**
1. User A clicks the mute button
2. Observe mute indicator on User A's tile in User B's view
3. User A speaks — verify User B hears nothing
4. User A clicks mute again to unmute
5. User A speaks — verify User B hears audio

**Expected Result:**
- Muted: mic icon shows muted state, red indicator on tile, other users see muted icon
- Unmuted: icon reverts, other users see indicator removed
- Audio is actually silenced when muted (not just visual)

---

### TC-029: Deafen/undeafen toggle

**Preconditions:** User A and User B in the same voice channel

**Steps:**
1. User A clicks the deafen button
2. Observe deafened indicator on User A's tile (both locally and on User B's view)
3. Verify User A's microphone is also muted (deafen implies mute)
4. User B speaks — verify User A hears nothing
5. User A clicks deafen again to undeafen
6. Verify User A's mute state returns to whatever it was before deafening

**Expected Result:**
- Deafening: headphone icon shows deafened, also mutes microphone
- Undeafening: restores previous mute state (if was unmuted before deafening, returns to unmuted)
- Other users see deafened indicator on the user's tile

---

### TC-030: Mute/deafen state persists across channel switches

**Preconditions:** Server has 2+ voice channels, User A is muted

**Steps:**
1. User A mutes, then leaves voice channel
2. User A joins a different voice channel
3. Observe mute state

**Expected Result:**
- Mute/deafen state is preserved via localStorage (`nexus_voice_muted`, `nexus_voice_deafened`)
- User joins new channel in the same mute state they left the previous one

---

## 3. Push-to-Talk (PTT)

### TC-031: Enable PTT mode and configure key

**Preconditions:** User A is in a voice channel

**Steps:**
1. Open Settings > Audio tab
2. Switch input mode from "Voice Activity" to "Push to Talk"
3. Observe PTT settings appear (shortcut key, release delay)
4. Click "Record Key" and press a key (e.g., V)
5. Verify the key name updates to "V"
6. Adjust release delay slider to 300ms

**Expected Result:**
- Mode toggle switches to PTT, additional settings section appears
- Key recording captures the pressed key and displays its name
- Release delay slider is adjustable (0-500ms, step 10ms)
- Settings stored: `nexus_ptt_key`, `nexus_ptt_delay`, `nexus_voice_input_mode`

---

### TC-032: PTT transmission behavior

**Preconditions:** User A in PTT mode in a voice channel with User B

**Steps:**
1. User A does NOT hold PTT key — speak into mic
2. Verify User B hears nothing
3. User A holds PTT key and speaks
4. Verify User B hears audio and User A's speaking indicator (green glow) activates
5. User A releases PTT key
6. Verify audio cuts after the configured release delay

**Expected Result:**
- Audio only transmits while PTT key is held
- Green speaking border appears on User A's tile during transmission
- After release, audio continues for the configured delay (e.g., 200ms default), then stops
- No audio leaks outside of PTT activation

---

### TC-033: PTT manual mute override

**Preconditions:** User A in PTT mode in a voice channel

**Steps:**
1. Click the mute button while in PTT mode
2. Observe "manual mute override" activates (lock icon or visual change)
3. Hold PTT key and speak — verify no audio transmits
4. Click mute button again to release override
5. Hold PTT key and speak — verify audio transmits normally

**Expected Result:**
- Manual mute override forces mute regardless of PTT key state
- Releasing override returns to normal PTT behavior
- Visual indicator distinguishes override mute from normal PTT-inactive state

---

### TC-034: Switch between PTT and Voice Activity while in call

**Preconditions:** User A in a voice channel, currently in PTT mode

**Steps:**
1. Open Settings > Audio, switch to "Voice Activity"
2. Speak without holding any key — verify audio transmits
3. Switch back to "Push to Talk"
4. Verify audio stops transmitting until PTT key is held

**Expected Result:**
- Mode switch takes effect immediately without leaving/rejoining
- PTT override state is cleared when switching modes
- No audio glitches or stuck states during transition

---

### TC-035: PTT platform behavior (web vs desktop)

**Preconditions:** Test on web browser AND Tauri desktop app if available

**Steps:**
1. On web: enable PTT, switch to a different browser tab, hold PTT key
2. On Tauri desktop: enable PTT, switch to a different application, hold PTT key

**Expected Result:**
- Web/Electron: PTT only works when the Nexus window is focused (yellow hint in settings)
- Tauri desktop: PTT works even when app is in background (green hint in settings)
- Settings modal correctly shows platform-appropriate hint text

---

## 4. Audio Processing — Noise Gate

### TC-036: Noise gate basic operation

**Preconditions:** User A in a voice channel with User B, noise gate enabled (default)

**Steps:**
1. Open Settings > Audio, verify "Enable Noise Gate" is checked (default: on, threshold: -50dB)
2. User A is silent — observe no audio bleeds to User B
3. User A speaks at normal volume — observe audio passes through cleanly
4. User A stops speaking — observe audio cuts after a brief hold period (~50ms)

**Expected Result:**
- Background noise below threshold is attenuated (soft floor at -40dB, not hard mute)
- Speech above threshold passes through immediately with no click/pop on open
- After speech stops, gate holds briefly then smoothly fades to floor
- The attenuation to -40dB (soft floor) should sound natural, not like hard silence

---

### TC-037: Noise gate threshold adjustment

**Preconditions:** User A in a voice channel, noise gate enabled

**Steps:**
1. Open Settings > Audio, find the noise gate threshold slider
2. Set threshold to -80dB (very sensitive) — observe that quiet sounds pass through
3. Set threshold to -20dB (aggressive) — observe that only loud speech passes through
4. Set threshold to -50dB (default) — observe normal operation
5. Observe the mic test meter: yellow threshold line should move with the slider

**Expected Result:**
- Lower threshold = more sensitive (more audio passes, including quiet sounds)
- Higher threshold = more aggressive (only loud speech passes)
- Threshold change takes effect immediately (no rejoin needed)
- Yellow line on mic test meter visually represents the threshold position

---

### TC-038: Noise gate attack smoothing (no click artifacts)

**Preconditions:** User A in a voice channel with User B, noise gate enabled

**Steps:**
1. Set noise gate threshold to a level just below normal speech
2. User A speaks sharply after silence (e.g., start a word abruptly)
3. Listen carefully on User B's side for any click or pop at the start of speech
4. Repeat 10+ times with different starting consonants (T, P, K, S)

**Expected Result:**
- No click or pop artifacts at speech onset
- Gate attack ramps gain from floor to unity over ~2ms, preventing hard transitions
- Speech start sounds natural, not "chopped"

---

### TC-039: Noise gate handles inter-word pauses

**Preconditions:** User A in a voice channel with User B, noise gate enabled

**Steps:**
1. User A speaks a sentence with natural pauses between words
2. Listen on User B's side for any chopping or gating between words
3. User A pauses for ~100ms between words (normal speech rhythm)
4. User A pauses for ~500ms (longer pause, like thinking)

**Expected Result:**
- Short inter-word pauses (~100ms): gate hold time (50ms) + hysteresis (6dB) keeps gate open — no chopping
- Longer pauses (500ms+): gate smoothly closes and reopens without artifacts
- Continuous speech sounds natural and uninterrupted

---

### TC-040: Noise gate rejects non-speech noise

**Preconditions:** User A in voice channel with User B, noise gate enabled at default threshold

**Steps:**
1. User A types on a mechanical keyboard near the microphone
2. User A runs a fan or has HVAC noise in the background
3. User A taps or bumps the desk/mic
4. Observe whether these sounds pass through to User B

**Expected Result:**
- Keyboard clicks: mostly blocked (bandpass sidechain filter at 300Hz-3kHz focuses on speech frequencies)
- Fan/HVAC rumble: blocked (low-frequency, outside sidechain bandpass)
- High-frequency hiss: blocked (above sidechain bandpass)
- Brief loud impacts may pass if they exceed threshold — this is expected

---

## 5. Audio Processing — AI Noise Cancellation (RNNoise)

### TC-041: Enable/disable AI noise cancellation

**Preconditions:** User A in a voice channel with User B

**Steps:**
1. Open Settings > Audio, find "AI Noise Cancellation" toggle (default: on)
2. With it enabled, create background noise (typing, fan, music) while speaking
3. Listen on User B's side — background noise should be significantly reduced
4. Disable AI Noise Cancellation
5. Create the same background noise while speaking
6. Listen on User B's side — background noise should be more audible

**Expected Result:**
- Enabled: RNNoise ML model removes keyboard clicks, fan noise, ambient sounds while preserving voice
- Disabled: raw audio passes through (noise gate still applies if enabled, but less effective against constant noise)
- Toggle takes effect immediately ("Takes effect immediately" per settings description)

---

### TC-042: Noise cancellation aggressiveness levels

**Preconditions:** User A in voice channel with User B, AI Noise Cancellation enabled

**Steps:**
1. Set aggressiveness to **Low** — speak with moderate background noise
2. Listen on User B's side — some background noise may leak, voice sounds very natural
3. Set aggressiveness to **Medium** — same conditions
4. Listen on User B's side — less background noise, voice still natural
5. Set aggressiveness to **High** — same conditions
6. Listen on User B's side — minimal background noise, voice may sound slightly processed

**Expected Result:**
- Low (70% denoised): preserves voice quality, some noise leaks through
- Medium (95% denoised): balanced — good noise removal with natural voice
- High (100% denoised): aggressive removal, cleanest output but may affect voice timbre
- Level change applies immediately via MessagePort to AudioWorklet

---

### TC-043: RNNoise graceful fallback

**Preconditions:** User A in voice channel

**Steps:**
1. Open browser DevTools console
2. Enable AI Noise Cancellation
3. Check console for any WASM initialization errors
4. If WASM fails to load, verify audio still passes through unchanged

**Expected Result:**
- If WASM init succeeds: noise cancellation works normally
- If WASM init fails: audio passes through unprocessed (no crash, no silence)
- Console should not show errors during normal operation

---

## 6. Audio Processing — Auto Gain Control (AGC)

### TC-044: Enable AGC and verify level normalization

**Preconditions:** User A in voice channel with User B, AGC disabled by default

**Steps:**
1. Open Settings > Audio, enable "Auto Gain" (default target: -20dB)
2. User A speaks very quietly — observe User B hears it at a reasonable level
3. User A speaks very loudly — observe User B hears it at a reasonable level (not blasting)
4. Disable Auto Gain
5. Repeat quiet/loud speech — observe the volume difference is much more dramatic

**Expected Result:**
- AGC enabled: quiet speech is boosted, loud speech is compressed — consistent output level
- AGC disabled: natural volume variation passes through
- No audible "pumping" artifacts (gain changes should be smooth)

---

### TC-045: AGC target level adjustment

**Preconditions:** User A in voice channel with User B, AGC enabled

**Steps:**
1. Set AGC target to -40dB (quieter) — speak normally
2. Listen on User B's side — output should be noticeably quieter
3. Set AGC target to -10dB (louder) — speak normally
4. Listen on User B's side — output should be noticeably louder
5. Return to -20dB (default)

**Expected Result:**
- Lower target = quieter normalized output
- Higher target = louder normalized output
- Changes apply immediately
- Leveler adjusts smoothly (500ms attack, 2s release) — no sudden jumps

---

### TC-046: AGC does not amplify background noise

**Preconditions:** User A in voice channel with User B, AGC enabled, noise gate enabled

**Steps:**
1. User A is silent with background noise (fan, etc.)
2. Observe User B does NOT hear amplified background noise
3. User A speaks quietly — observe AGC boosts speech but not noise

**Expected Result:**
- AGC gain updates are VAD-gated (only during speech, frozen when gate closed)
- Noise floor tracking caps gain ceiling to prevent noise amplification
- Gain never exceeds `target - noise_floor - 6dB_margin`

---

### TC-047: AGC limiter catches transients

**Preconditions:** User A in voice channel with User B, AGC enabled

**Steps:**
1. User A speaks normally, then suddenly shouts or claps near the mic
2. Listen on User B's side for clipping or distortion

**Expected Result:**
- Fast limiter (5ms attack, 4:1 ratio above -10dB threshold) catches transients
- Loud peaks are compressed, not clipped
- No harsh distortion on sudden loud sounds
- Limiter releases smoothly over ~200ms

---

## 7. Audio Processing — Browser-Level Settings

### TC-048: Browser noise suppression and echo cancellation

**Preconditions:** User A in voice channel

**Steps:**
1. Open Settings > Audio, find "Noise Suppression" toggle (default: off)
2. Enable it — note the hint: "Changes take effect next time you join a voice channel"
3. Leave and rejoin the voice channel
4. Enable "Echo Cancellation" toggle — leave and rejoin again
5. Test with speakers (not headphones) to verify echo cancellation works

**Expected Result:**
- Browser-level noise suppression applied via WebRTC constraints
- Echo cancellation prevents feedback loops when using speakers
- These are separate from AI Noise Cancellation (RNNoise) and can be used together
- Require rejoin to take effect (unlike gate/AGC which are immediate)

---

## 8. Audio Devices & Volume

### TC-049: Input device selection

**Preconditions:** Computer has 2+ microphones (or virtual audio devices)

**Steps:**
1. Open Settings > Audio, find input device dropdown
2. Select a different microphone
3. Leave and rejoin voice channel
4. Verify the new device is being used (speak into each mic to confirm)

**Expected Result:**
- Dropdown lists all available input devices plus "Default"
- Selected device stored in `nexus_audio_input`
- Takes effect on next voice join (not immediate)

---

### TC-050: Output device selection and test sound

**Preconditions:** Computer has 2+ output devices (e.g., speakers + headphones)

**Steps:**
1. Open Settings > Audio, find output device dropdown
2. Select a different output device
3. Click "Play Test Sound" — verify the 3-note rising tone plays on the selected device
4. Adjust output volume slider — click "Play Test Sound" again at different volumes

**Expected Result:**
- Dropdown lists all available output devices plus "Default"
- Test sound (C5-E5-G5, 0.8 seconds) plays on the selected output
- Volume slider affects test sound and voice chat output
- Output device change applies via `setSinkId()` if browser supports it

---

### TC-051: Input volume control

**Preconditions:** User A in voice channel with User B

**Steps:**
1. Open Settings > Audio, set input volume to 100% — speak
2. Set input volume to 50% — speak at same volume
3. Set input volume to 10% — speak at same volume
4. Listen on User B's side for volume differences

**Expected Result:**
- Lower input volume = quieter transmission to other users
- Volume slider updates AudioWorklet in real-time (no rejoin needed)
- At very low volume, speech may fall below noise gate threshold

---

### TC-052: Per-user volume control

**Preconditions:** User A and User B in voice channel, User C observing

**Steps:**
1. Hover over User B's tile — click the speaker icon (top-right)
2. Observe volume popup with mute toggle and volume slider (0-150%)
3. Drag slider to 50% — verify User B sounds quieter to User A only
4. Drag slider to 150% — verify User B sounds louder to User A only
5. Click the mute toggle — verify User B is silenced for User A only
6. Verify User C hears User B at normal volume throughout (unaffected)

**Expected Result:**
- Per-user volume is local only — doesn't affect other listeners
- Range 0-150% allows boosting quiet users
- Mute toggle silences that specific user locally
- Settings persist in localStorage

---

### TC-053: Microphone test meter

**Preconditions:** Settings > Audio tab open

**Steps:**
1. Click "Test Microphone"
2. Observe the blue level meter responding to mic input
3. Speak quietly — meter should show low level (green range, below -25dB)
4. Speak normally — meter should show moderate level (yellow range, -25 to -10dB)
5. Speak loudly — meter should show high level (red range, above -10dB)
6. If noise gate is enabled, observe the yellow threshold line on the meter
7. Click "Stop Test"

**Expected Result:**
- Meter shows real-time dBFS value
- Color coding: green (quiet) / yellow (moderate) / red (loud)
- Yellow threshold line position matches noise gate threshold setting
- Meter stops when test is stopped, displays "—"

---

## 9. Screen Sharing & Stream Viewing

### TC-054: Start and stop screen sharing

**Preconditions:** User A and User B in same voice channel, User A has screen share permission

**Steps:**
1. User A clicks the screen share button in voice controls
2. Browser prompts for screen/window/tab selection — choose a screen
3. Observe User A's screen share button shows active state ("Screen sharing" text)
4. User B sees a banner: "[User A] is sharing their screen" with a "Watch" button
5. User A clicks screen share button again to stop
6. User B's banner disappears

**Expected Result:**
- Screen share starts after browser permission granted
- Other users in the channel are notified
- Stopping share removes notification from all viewers
- Screen share button visually indicates active state

---

### TC-055: Watch and stop watching a screen share

**Preconditions:** User A is sharing screen in a voice channel with User B

**Steps:**
1. User B clicks "Watch" button on the screen share banner
2. Observe User A's screen appears in the stream viewing area
3. Verify the stream shows real-time screen content (move windows, type, etc.)
4. User B clicks "Stop Watching" button (top-right overlay)
5. Stream viewing area closes, banner returns

**Expected Result:**
- Stream loads and displays in real-time with minimal delay
- Video quality is reasonable (readable text, smooth motion)
- Stop watching returns to the banner state without affecting the sharer
- Other users can independently start/stop watching

---

### TC-056: Screen share with system audio

**Preconditions:** User A in voice channel, sharing a browser tab with audio

**Steps:**
1. User A starts screen share, selects a browser tab playing audio
2. Check the "Share audio" option in the browser's share dialog (if available)
3. User B watches the stream
4. Verify User B hears the tab's audio through the stream

**Expected Result:**
- System/tab audio is captured and sent alongside the video track
- User B can use the audio mute toggle (top-right overlay) to mute/unmute the screen audio
- Screen audio mute is independent from voice chat mute

---

### TC-057: Screen share fullscreen mode

**Preconditions:** User B is watching User A's screen share

**Steps:**
1. User B clicks the fullscreen button (bottom-right of stream area)
2. Observe fullscreen mode activates (100vw x 100vh)
3. Verify gradient header shows sharer's name + exit button
4. Verify bottom control bar shows: mute, deafen, PTT, leave, soundboard buttons
5. Press ESC or click exit button to leave fullscreen
6. Verify returns to normal view

**Expected Result:**
- Fullscreen covers entire viewport
- Voice controls remain accessible during fullscreen viewing
- ESC key and exit button both work to exit
- No layout glitches on enter/exit

---

### TC-058: Screen share — sharer leaves voice

**Preconditions:** User A sharing screen, User B and User C watching

**Steps:**
1. User A clicks "Leave Voice" while still sharing screen
2. Observe what happens to User B and User C's stream views

**Expected Result:**
- Screen share stops automatically when sharer leaves
- All viewers see stream end, viewing area closes
- `screen:stopped` event broadcast to all in the channel
- No frozen frames or stuck UI states

---

### TC-059: Multiple viewers join/leave stream independently

**Preconditions:** User A sharing screen, User B and User C in same voice channel

**Steps:**
1. User B clicks "Watch" — starts viewing
2. User C clicks "Watch" — starts viewing independently
3. User B clicks "Stop Watching" — stops viewing
4. Verify User C is still watching uninterrupted
5. User C clicks "Stop Watching"

**Expected Result:**
- Each viewer independently starts/stops watching
- One viewer leaving does not affect other viewers
- Sharer tracks viewers (`screen:add-viewer` / `screen:remove-viewer` events)

---

### TC-060: New user joins voice channel with active screen share

**Preconditions:** User A is sharing screen in a voice channel

**Steps:**
1. User B joins the voice channel after screen share is already active
2. Observe if User B sees the screen share banner with "Watch" button

**Expected Result:**
- Late joiners are notified of active screen share
- "Watch" button is available immediately
- No need for sharer to restart sharing

---

## 10. Voice Persistence & Auto-Rejoin

### TC-061: Auto-rejoin after page reload (web)

**Preconditions:** User A in a voice channel on web browser

**Steps:**
1. Note the voice channel User A is in
2. Reload the page (F5 or Ctrl+R)
3. After page loads, observe if User A automatically rejoins the voice channel

**Expected Result:**
- User A automatically rejoins the same voice channel after reload
- Uses `sessionStorage` on web (survives refresh, cleared on tab close)
- Connection re-establishes with peer connections to existing users
- Mute/deafen state preserved

---

### TC-062: Voice state expires after 5 minutes

**Preconditions:** User A in a voice channel on web

**Steps:**
1. Note the voice channel, then close the tab
2. Wait more than 5 minutes
3. Open a new tab and navigate to the app

**Expected Result:**
- Saved voice state has expired — no auto-rejoin
- App starts in normal disconnected state

---

### TC-063: Auto-rejoin edge case — channel deleted while away

**Preconditions:** User A in a voice channel, User B is server owner

**Steps:**
1. User A is in voice channel, then reloads the page
2. Before User A's page finishes loading, User B deletes that voice channel
3. Observe User A's auto-rejoin attempt

**Expected Result:**
- Rejoin attempt fails gracefully (channel no longer exists)
- Saved voice state is cleared
- User A sees normal disconnected state, no error loops

---

### TC-064: No voice persistence on mobile (Capacitor)

**Preconditions:** App running in Capacitor mobile build

**Steps:**
1. Join a voice channel on mobile
2. Close and reopen the app

**Expected Result:**
- No auto-rejoin on mobile (Capacitor skips persistence)
- User starts disconnected from voice

---

## 11. DM Calls

### TC-065: Initiate and receive a DM call

**Preconditions:** User A and User B are friends or have a DM open

**Steps:**
1. User A clicks the call button in a DM conversation with User B
2. Observe User B receives an incoming call notification
3. User B clicks "Accept"
4. Verify both users are now in a voice call with audio

**Expected Result:**
- `dm:call-start` creates a voice channel for the DM
- Recipient sees `dm:call-incoming` notification (ringtone/visual)
- After acceptance, both users connected via WebRTC
- Voice controls (mute, deafen, leave) available during DM call

---

### TC-066: Decline a DM call

**Preconditions:** User A and User B have a DM open

**Steps:**
1. User A initiates a call to User B
2. User B clicks "Decline"
3. Observe call notification dismissed for both users

**Expected Result:**
- `dm:call-declined` sent to caller
- No voice channel persists after decline
- Both users returned to normal DM state

---

### TC-067: DM call persistence across reload

**Preconditions:** User A and User B in an active DM call

**Steps:**
1. User A reloads the page while in the DM call
2. Observe if User A auto-rejoins the DM call

**Expected Result:**
- Voice state saved with `isDMCall: true`
- Auto-rejoin checks if the DM call is still active before reconnecting
- If User B has already left, rejoin is skipped and state is cleared

---

## 12. Soundboard

### TC-068: Play soundboard clip in voice channel

**Preconditions:** User A and User B in a voice channel, server has soundboard clips

**Steps:**
1. User A clicks the soundboard button (blue icon in voice controls)
2. Observe popup: volume slider, page tabs, 3-column sound grid
3. Click on a soundboard clip
4. Verify User B hears the sound

**Expected Result:**
- Sound clip plays for all users in the voice channel
- Soundboard popup shows emoji + name for each clip
- Volume slider (0-200%) controls soundboard playback volume

---

### TC-069: Re-trigger same clip restarts playback

**Preconditions:** User A in voice channel, soundboard open

**Steps:**
1. Play a long soundboard clip
2. While still playing, click the same clip again
3. Observe playback restarts from beginning (not stacked/layered)

**Expected Result:**
- Same clip re-triggers from start, previous playback stops
- No overlapping audio from the same clip
- Different clips can play simultaneously

---

### TC-070: Soundboard rate limiting

**Preconditions:** User A in voice channel, soundboard open

**Steps:**
1. Rapidly click different soundboard clips in quick succession (>10 in 10 seconds)
2. Observe if rate limiting kicks in

**Expected Result:**
- Rate limit: 10 sounds per 10 seconds per user
- Excess plays are rejected with an error or silently dropped
- Rate limit applies server-side

---

### TC-071: Targeted soundboard playback

**Preconditions:** User with `sendTargetedSounds` permission in voice channel with 3+ users

**Steps:**
1. Open soundboard popup
2. Find the target picker section
3. Select a specific user to target
4. Play a sound clip
5. Verify only the targeted user hears it (others do not)

**Expected Result:**
- Targeted sound only plays for selected user(s)
- Non-targeted users hear nothing
- `soundboard:play-targeted` event used instead of `soundboard:play`

---

### TC-072: Leaving voice stops all soundboard clips

**Preconditions:** User A in voice channel, soundboard clip playing

**Steps:**
1. Play a soundboard clip
2. While it's playing, click "Leave Voice"
3. Observe all audio stops

**Expected Result:**
- All soundboard playback stops immediately on voice leave
- No audio leaks or continues after disconnecting

---

## 13. Speaking Indicators & Audio Levels

### TC-073: Speaking indicator green glow

**Preconditions:** User A and User B in voice channel

**Steps:**
1. User A speaks — observe User A's tile on User B's screen
2. Verify green glow/border appears around User A's avatar while speaking
3. User A stops speaking — verify green glow fades
4. Observe the glow intensity varies with volume (louder = brighter)

**Expected Result:**
- Green glow border activates when audio level exceeds gate threshold
- Glow intensity scales with audio level (box-shadow based on speaking level)
- Glow deactivates within ~50-100ms after speech stops
- Updates at ~24fps (smooth, not flickering)

---

### TC-074: Speaking indicator respects noise gate

**Preconditions:** User A in voice channel with noise gate enabled

**Steps:**
1. Generate quiet background noise (below noise gate threshold)
2. Observe User A's tile — no speaking indicator
3. User A speaks (above threshold)
4. Observe speaking indicator activates only for speech

**Expected Result:**
- Speaking detection uses the full-bandwidth envelope but respects gate threshold
- Background noise below threshold does not trigger false speaking indicators
- Indicator accurately tracks speech presence

---

## 14. Connection Quality & Reconnection

### TC-075: Automatic reconnection on connection drop

**Preconditions:** User A in voice channel with User B

**Steps:**
1. Briefly disconnect User A's network (turn off Wi-Fi for 5 seconds, then reconnect)
2. Observe the voice quality indicator
3. Verify automatic reconnection attempt

**Expected Result:**
- Quality dot turns yellow/red during disconnection
- Reconnect button may appear if status reaches DEGRADED
- Up to 3 automatic reconnection attempts with exponential backoff
- If reconnection succeeds, audio resumes without manual intervention

---

### TC-076: Manual reconnect button

**Preconditions:** User A in voice channel, connection degraded

**Steps:**
1. If connection quality is poor and the yellow "Reconnect" button appears, click it
2. Observe reconnection process

**Expected Result:**
- Clicking reconnect forces a fresh connection attempt
- Peer connections are re-established
- Audio resumes if server is reachable

---

## 15. Combined Processing Pipeline

### TC-077: Full processing chain order

**Preconditions:** User A in voice channel with User B, all processing enabled

**Steps:**
1. Enable: AI Noise Cancellation (Medium), Noise Gate (threshold -50dB), Auto Gain (target -20dB)
2. User A speaks with moderate background noise (fan, etc.)
3. Listen on User B's side for overall quality

**Expected Result:**
- Processing order is: Input Volume → RNNoise → Noise Gate → AGC Leveler → AGC Limiter → Output Gain
- Background noise removed by RNNoise before reaching the gate
- Gate catches any residual noise RNNoise missed
- AGC normalizes output level without amplifying noise (VAD-gated)
- Final output is clean, consistent-volume speech

---

### TC-078: All processing disabled — raw passthrough

**Preconditions:** User A in voice channel with User B

**Steps:**
1. Disable: AI Noise Cancellation, Noise Gate, Auto Gain
2. Set input volume to 100%
3. User A speaks with background noise
4. Listen on User B's side

**Expected Result:**
- Raw audio passes through with all background noise
- Volume varies naturally with distance/position from mic
- No processing artifacts, but also no noise removal
- This is the baseline to compare processing quality against

---

### TC-079: Processing settings apply without rejoin

**Preconditions:** User A in voice channel, all processing options visible in Settings

**Steps:**
1. While in an active voice call, toggle noise gate on/off
2. Adjust noise gate threshold
3. Toggle AGC on/off
4. Adjust AGC target level
5. Change noise cancellation aggressiveness level

**Expected Result:**
- All AudioWorklet settings (gate, AGC, RNNoise aggressiveness) apply immediately
- No need to leave and rejoin voice channel
- Settings hint confirms: "Noise gate and auto gain settings apply immediately"
- Only device selection and browser-level suppression/echo cancellation require rejoin

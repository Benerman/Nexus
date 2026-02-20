# Voice & Soundboard Tests

## TC-025: Join and leave voice channel

**Preconditions:** User is logged in and server has voice channels

**Steps:**
1. Click on a voice channel in the sidebar
2. Observe voice channel UI appearing (connected indicator, user list)
3. Click the disconnect/leave button

**Expected Result:**
- User joins the voice channel; their name appears in the voice user list
- Other users in the channel see the new user join
- After leaving, user's name is removed from the voice user list
- Voice UI is dismissed after disconnecting

---

## TC-026: Mute/unmute and deafen/undeafen in voice

**Preconditions:** User is connected to a voice channel

**Steps:**
1. Click the mute button to mute microphone
2. Verify muted icon/indicator appears
3. Click mute button again to unmute
4. Click the deafen button to deafen (mute all audio)
5. Verify deafened icon/indicator appears
6. Click deafen button again to undeafen

**Expected Result:**
- Mute toggle: microphone icon shows muted/unmuted state
- Other users see the muted indicator on the user
- Deafen toggle: headphone icon shows deafened state
- Deafening also mutes the microphone
- Undeafening restores previous mute state

---

## TC-027: Play soundboard clip in voice channel

**Preconditions:** User is in a voice channel; server has soundboard clips configured

**Steps:**
1. Open the soundboard panel while in a voice channel
2. Click on a soundboard clip to play it
3. Observe the sound playing for all users in the voice channel

**Expected Result:**
- Sound clip plays for all users currently in the voice channel
- Visual feedback shows which clip is playing
- Sound respects rate limiting (5 plays per 10 seconds)

---

## TC-028: Re-trigger same soundboard clip restarts it; leaving voice stops all clips

**Preconditions:** User is in a voice channel with soundboard clips available

**Steps:**
1. Play a soundboard clip
2. While it's still playing, click the same clip again
3. Observe the clip restarting from the beginning
4. Play another clip
5. Leave the voice channel while a clip is playing

**Expected Result:**
- Re-triggering the same clip restarts playback from the beginning (not stacking)
- Leaving the voice channel stops all currently playing soundboard clips
- No audio leaks or continues after disconnecting

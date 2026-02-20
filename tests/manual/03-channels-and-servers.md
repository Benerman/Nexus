# Channels & Servers Tests

## TC-014: Create new text channel

**Preconditions:** User has manageChannels permission in a server

**Steps:**
1. Navigate to a server where you have channel management permissions
2. Click the "+" or "Create Channel" button in the sidebar
3. Enter a channel name (e.g., "test-channel")
4. Select "Text" as the channel type
5. Confirm channel creation

**Expected Result:**
- New text channel appears in the sidebar channel list
- Channel name is normalized to lowercase with hyphens (e.g., spaces → hyphens)
- Channel is immediately navigable
- Other server members see the new channel

---

## TC-015: Reject duplicate channel name in same server

**Preconditions:** Server already has a channel named "general"

**Steps:**
1. Attempt to create a new text channel
2. Enter the name "general" (same as existing channel)
3. Submit the creation

**Expected Result:**
- Channel creation is rejected
- Error message indicates channel name already exists
- No duplicate channel is created

---

## TC-016: Rename channel (special chars stripped, lowercased)

**Preconditions:** User has manageChannels permission; a text channel exists

**Steps:**
1. Right-click on a text channel or open channel settings
2. Change the channel name to something with uppercase and special chars (e.g., "My Cool Channel!")
3. Save the changes

**Expected Result:**
- Channel name is normalized: lowercased, special characters replaced with hyphens
- "My Cool Channel!" becomes "my-cool-channel-"
- The updated name appears in the sidebar for all users

---

## TC-017: Delete channel

**Preconditions:** User has manageChannels permission; a non-default channel exists

**Steps:**
1. Navigate to channel settings or right-click on a channel
2. Select the delete option
3. Confirm the deletion

**Expected Result:**
- Channel is removed from the sidebar
- All messages in the channel are no longer accessible
- Users currently viewing the channel are redirected to another channel
- Other members see the channel removed in real time

---

## TC-018: Create new server

**Preconditions:** User is logged in with a registered account

**Steps:**
1. Click the "+" button in the server list sidebar
2. Enter a server name (e.g., "Test Server")
3. Optionally choose a server icon
4. Confirm server creation

**Expected Result:**
- New server appears in the server list sidebar
- Server has default channels (general, announcements) and voice channels (Lounge, Gaming)
- User is automatically the owner with admin permissions
- Default roles (@everyone, Admin) are created

---

## TC-019: Create and use server invite link

**Preconditions:** User is in a server and has createInvite permission

**Steps:**
1. Open server settings or use an invite creation option
2. Generate an invite link/code
3. As a different user, use the invite link to join the server

**Expected Result:**
- Invite link/code is generated and copyable
- Second user can join the server using the invite
- New member appears in the server member list
- New member gets @everyone role by default

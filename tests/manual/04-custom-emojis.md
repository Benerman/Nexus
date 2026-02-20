# Custom Emojis Tests

## TC-020: Upload custom emoji via Settings > Emojis tab

**Preconditions:** User has manageEmojis permission in a server

**Steps:**
1. Open server settings
2. Navigate to the "Emojis" tab
3. Click "Upload Emoji" or the upload button
4. Select a valid image file (PNG/GIF, under size limit)
5. Enter an emoji name (e.g., "pepe")
6. Confirm the upload

**Expected Result:**
- Emoji is uploaded successfully
- Emoji appears in the emoji list in settings
- Emoji name follows format rules (alphanumeric + underscores)
- Success feedback is shown to the user

---

## TC-021: Custom emoji appears in emoji picker under server tab

**Preconditions:** Server has at least one custom emoji uploaded

**Steps:**
1. Open the emoji picker in a text channel
2. Navigate to the server's emoji section/tab
3. Look for the uploaded custom emoji

**Expected Result:**
- Custom emoji is visible in the emoji picker under the server's section
- Emoji shows the correct image and name
- Emoji is searchable by name in the picker

---

## TC-022: Send message with custom emoji (renders inline as image)

**Preconditions:** Server has a custom emoji; user is in a text channel

**Steps:**
1. Open the emoji picker
2. Click on a custom emoji to insert it
3. Send the message

**Expected Result:**
- Message is sent with the custom emoji
- Emoji renders as an inline image in the chat (not as text code)
- Emoji maintains correct aspect ratio and size
- Other users see the custom emoji rendered properly

---

## TC-023: Delete custom emoji from settings

**Preconditions:** Server has at least one custom emoji; user has manageEmojis permission

**Steps:**
1. Open server settings > Emojis tab
2. Find the custom emoji to delete
3. Click the delete button for that emoji
4. Confirm deletion

**Expected Result:**
- Emoji is removed from the server's emoji list
- Emoji no longer appears in the emoji picker
- Previously sent messages with this emoji may show fallback or broken image
- Deletion is reflected for all server members

---

## TC-024: Toggle emoji sharing off — emoji not visible in other servers

**Preconditions:** User is a member of at least two servers; one server has custom emojis with sharing enabled

**Steps:**
1. Open settings for the server with custom emojis
2. Find the "Emoji Sharing" toggle and turn it OFF
3. Navigate to a different server
4. Open the emoji picker and check for the first server's emojis

**Expected Result:**
- When sharing is OFF, the server's custom emojis do not appear in other servers' emoji pickers
- The emojis are still available within their own server
- Toggling sharing back ON makes them visible again in other servers

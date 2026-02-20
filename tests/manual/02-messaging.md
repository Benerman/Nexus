# Messaging Tests

## TC-006: Send text message and see it appear in chat

**Preconditions:** User is logged in and has joined a server with a text channel

**Steps:**
1. Navigate to a text channel
2. Type a message in the input field (e.g., "Hello world")
3. Press Enter to send

**Expected Result:**
- Message appears in the chat area immediately
- Message shows correct username, avatar, and timestamp
- Message input is cleared after sending
- Other users in the channel see the message in real time

---

## TC-007: Edit own message and see updated content

**Preconditions:** User has sent at least one message in a channel

**Steps:**
1. Right-click on a message you authored
2. Select "Edit Message" from the context menu
3. Modify the message text
4. Press Enter or click Save to confirm

**Expected Result:**
- Message content is updated in place
- An "(edited)" indicator appears next to the message
- Other users see the updated content
- Edit mode is exited after saving

---

## TC-008: Delete own message

**Preconditions:** User has sent at least one message in a channel

**Steps:**
1. Right-click on a message you authored
2. Select "Delete Message" from the context menu
3. Confirm the deletion if prompted

**Expected Result:**
- Message is removed from the chat
- Other users no longer see the message
- No empty gap is left where the message was

---

## TC-009: Send message with @username mention (highlight renders)

**Preconditions:** At least two users are members of the same server

**Steps:**
1. Navigate to a text channel
2. Type a message containing `@username` (an existing member's name)
3. Send the message

**Expected Result:**
- The @mention is rendered with a highlight/distinct color
- The mentioned user receives a notification or visual indicator
- The mention is clickable or visually distinct from normal text

---

## TC-010: Send message with #channel-name link (clickable link renders)

**Preconditions:** Server has multiple text channels

**Steps:**
1. Navigate to a text channel
2. Type a message containing `#channel-name` (an existing channel name)
3. Send the message

**Expected Result:**
- The #channel link is rendered as a clickable link
- Clicking the link navigates to the referenced channel
- The link is visually distinct (colored differently from normal text)

---

## TC-011: Add emoji reaction to message

**Preconditions:** At least one message exists in the channel

**Steps:**
1. Hover over a message in chat
2. Click the reaction/emoji button that appears
3. Select an emoji from the picker
4. Observe the reaction appearing on the message

**Expected Result:**
- Selected emoji appears as a reaction below the message
- Reaction count shows "1"
- Clicking the same reaction again removes it (toggle behavior)
- Other users see the reaction in real time

---

## TC-012: Reply to message (reply indicator shows)

**Preconditions:** At least one message exists in the channel

**Steps:**
1. Right-click on a message
2. Select "Reply to Message" from the context menu
3. Type a reply message in the input (which now shows a reply indicator)
4. Press Enter to send

**Expected Result:**
- The reply is sent with a reference to the original message
- A reply indicator bar shows above the reply message with the original author and content preview
- Clicking the reply indicator scrolls to/highlights the original message
- The reply input preview is cleared after sending

---

## TC-013: Create and vote on poll

**Preconditions:** User is logged in and in a text channel

**Steps:**
1. Use the poll command or poll UI to create a poll with 2+ options
2. Submit the poll
3. As the same or different user, click on a poll option to vote
4. Observe the vote count update

**Expected Result:**
- Poll is displayed with all options
- Vote is registered and count updates immediately
- Users can see aggregated vote results
- Poll is visually distinct from regular messages

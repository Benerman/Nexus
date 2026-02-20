# Social & DMs Tests

## TC-029: Send friend request and accept it

**Preconditions:** Two registered users exist who are not yet friends

**Steps:**
1. As User A, navigate to the friends/social panel
2. Search for User B by username
3. Send a friend request to User B
4. As User B, check pending friend requests
5. Accept the friend request

**Expected Result:**
- User A sees the request as "pending" after sending
- User B sees the incoming friend request notification
- After accepting, both users appear in each other's friend list
- Friend status is reflected in real time for both users

---

## TC-030: Create 1-on-1 DM conversation

**Preconditions:** Two users are friends or have mutual server membership

**Steps:**
1. Navigate to the DM / personal messages section
2. Click "New DM" or select a user from the member list
3. Choose a single user to message
4. Type and send a message

**Expected Result:**
- DM channel is created in the personal messages sidebar
- Message is delivered to the recipient
- Both users can see the conversation
- DM channel shows the other user's username and avatar
- Unread indicator appears for the recipient

---

## TC-031: Create group DM with multiple participants

**Preconditions:** User has at least 2 friends or mutual contacts

**Steps:**
1. Navigate to DM / personal messages section
2. Click "New Group DM" or equivalent
3. Select 2 or more participants
4. Optionally name the group DM
5. Send a message in the group

**Expected Result:**
- Group DM is created with all selected participants
- Group name shows participant names (or custom name if set)
- All participants can see and send messages
- Group DM appears in each participant's personal messages sidebar
- Group DM shows "group-dm" type indicator

---

## TC-032: Block user — messages hidden, DM blocked

**Preconditions:** Two users exist; one will block the other

**Steps:**
1. As User A, navigate to User B's profile or the member list
2. Click "Block User" option
3. Verify that User B's messages are hidden in shared channels
4. As User B, attempt to send a DM to User A

**Expected Result:**
- User B's messages are hidden from User A's view in shared channels
- User B cannot initiate a new DM with User A
- User A can unblock User B to restore visibility
- Block status persists across sessions

---

## TC-033: Webhook POST sends message with @mention and #channel rendering

**Preconditions:** A webhook is configured in a text channel. You have the full webhook URL including the secret token (shown once at creation time).

**Steps:**
1. Send a POST request to `/api/webhooks/:webhookId/:token` with:
   ```json
   {
     "content": "Hello @username check #general",
     "username": "TestBot"
   }
   ```
2. Observe the message in the channel

**Expected Result:**
- Webhook message appears in the channel with the specified username
- @mentions in the webhook content are parsed and rendered with highlight
- #channel links are parsed and rendered as clickable links
- Message shows webhook indicator (bot badge or distinct avatar)
- Attachments and embeds are supported if provided

## TC-034: Webhook token authentication

**Preconditions:** A webhook is configured in a text channel

**Steps:**
1. POST to `/api/webhooks/:webhookId` (no token in path) with valid content
2. POST to `/api/webhooks/:webhookId/invalid_token_here` with valid content
3. POST to `/api/webhooks/:webhookId/:correctToken` with valid content

**Expected Result:**
- Step 1: 404 (route doesn't match)
- Step 2: 401 `{"error": "Invalid webhook ID or token"}`
- Step 3: 200 with message delivered to channel

## TC-035: Webhook persistence across restart

**Preconditions:** A webhook exists in a text channel

**Steps:**
1. Note the webhook in Settings → Webhooks tab
2. Restart the server (docker-compose down && docker-compose up -d)
3. Check Settings → Webhooks tab again
4. POST to the webhook using the original URL

**Expected Result:**
- Webhook still appears in the channel's webhook list after restart
- POST still works with the original URL and token

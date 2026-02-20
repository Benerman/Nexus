# Moderation Tests

## TC-034: Admin kicks user from server

**Preconditions:** Admin user and a regular user are in the same server

**Steps:**
1. As an admin, open the member list or right-click on a regular user
2. Select "Kick" from the moderation options
3. Confirm the kick action

**Expected Result:**
- Target user is removed from the server
- Target user no longer sees the server in their server list
- Target user's messages remain visible in the server
- A system message or log indicates the user was kicked
- The kicked user can rejoin via an invite link

---

## TC-035: Admin bans user from server

**Preconditions:** Admin user and a regular user are in the same server

**Steps:**
1. As an admin, open moderation options for a regular user
2. Select "Ban" from the options
3. Confirm the ban action

**Expected Result:**
- Target user is removed from the server
- Target user cannot rejoin the server even with an invite link
- Ban is recorded and visible in server moderation settings
- Admin can unban the user later if needed

---

## TC-036: Admin times out user (cannot send messages during timeout)

**Preconditions:** Admin user and a regular user are in the same server

**Steps:**
1. As an admin, open moderation options for a regular user
2. Select "Timeout" and specify a duration (e.g., "5m")
3. Confirm the timeout
4. As the timed-out user, attempt to send a message

**Expected Result:**
- Target user receives a timeout notification
- Target user cannot send messages in the server during the timeout period
- A visual indicator shows the user is timed out
- After the timeout expires, the user can send messages again
- The timeout duration is correctly parsed (e.g., "5m" = 5 minutes)

---

## TC-037: Non-admin cannot access moderation actions

**Preconditions:** A regular user (no admin/moderator role) is in a server

**Steps:**
1. As a regular user, attempt to access moderation actions (kick, ban, timeout)
2. Try right-clicking on another user and checking available options
3. Try sending a moderation command if slash commands exist

**Expected Result:**
- Moderation options (kick, ban, timeout) are not visible or are greyed out
- If attempted via API/socket, the server rejects with a permission error
- Regular users can only manage their own messages (edit, delete own)
- Role hierarchy is enforced: users cannot moderate users with higher roles

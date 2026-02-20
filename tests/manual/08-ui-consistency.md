# UI Consistency Tests

## TC-038: Developer mode: Copy ID shows feedback in all 3 context menus

**Preconditions:** User has Developer Mode enabled in settings

**Steps:**
1. Right-click on a **message** → select "Copy Message ID"
2. Observe the button text changes to "✓ ID Copied to Clipboard" for ~1.2 seconds
3. Right-click on a **channel** → select "Copy Channel ID"
4. Observe the same feedback pattern
5. Right-click on a **server** icon → select "Copy Server ID"
6. Observe the same feedback pattern
7. In each case, paste from clipboard to verify the ID was copied

**Expected Result:**
- All three context menus (message, channel, server) show the same "✓ ID Copied to Clipboard" feedback
- Feedback displays for approximately 1.2 seconds before the menu closes
- The correct ID is placed on the clipboard in each case
- A divider separates the Copy ID option from other menu items
- Without Developer Mode enabled, the Copy ID option is not visible

---

## TC-039: Settings tab memory, sidebar collapse persistence, last-channel-per-server

**Preconditions:** User is logged in

**Steps:**
1. Open Settings modal and navigate to a non-default tab (e.g., "Emojis")
2. Close Settings, then reopen it
3. Verify the previously selected tab is remembered
4. Collapse the sidebar using the collapse button
5. Refresh the page
6. Verify the sidebar remains collapsed after refresh
7. Navigate to Server A, select a specific channel (e.g., "announcements")
8. Switch to Server B
9. Switch back to Server A
10. Verify you are returned to "announcements" (the last visited channel)

**Expected Result:**
- Settings tab preference persists across open/close cycles (stored in localStorage)
- Sidebar collapse state persists across page refreshes (stored in localStorage)
- Last visited channel per server is remembered when switching between servers (stored in localStorage)
- All persistence works independently for each feature

---

## TC-040: Emoji picker closes on select, stays open with shift+click

**Preconditions:** User is in a text channel with the emoji picker available

**Steps:**
1. Click the emoji picker button to open it
2. Click on an emoji (without holding Shift)
3. Observe the picker closes and the emoji is inserted
4. Open the emoji picker again
5. Hold Shift and click on an emoji
6. Observe the picker stays open and the emoji is inserted
7. While still holding Shift, click another emoji
8. Release Shift and click one more emoji
9. Observe the picker closes

**Expected Result:**
- Normal click: emoji is inserted into the message input, picker closes immediately
- Shift+click: emoji is inserted, picker remains open for additional selections
- Releasing Shift and clicking: picker closes after inserting the emoji
- Recent emojis section updates with the most recently used emojis
- Emoji picker position stays within viewport bounds (no overflow off screen)

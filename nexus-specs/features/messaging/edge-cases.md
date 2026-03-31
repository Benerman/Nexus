# Messaging Edge Cases

- **XSS in message content:** User sends `<script>alert(1)</script>` — must be escaped, not executed.
- **XSS via URL preview:** Preview renders user-supplied URL's open graph image/title — must sanitize.
- **SSRF via URL preview:** `GET /api/og?url=http://169.254.169.254/` — must block private/internal IPs.
- **Reaction race condition:** Two users add same reaction simultaneously — must not corrupt JSONB.
- **Edit/delete of another user's message:** Server must verify message authorship, not trust client.
- **Very long message content:** Content > 4000 chars must be rejected before DB insert.
- **Attachment size limit:** No unbounded base64 uploads — must enforce file size limit.
- **Message in channel user can't read:** Permission check required before emitting message history.
- **Thread reply to deleted parent:** Behavior must be defined (show tombstone or error).
- **Search injection:** Full-text search query must be parameterized.

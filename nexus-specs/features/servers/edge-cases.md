# Servers Edge Cases

- Server create transaction partial failure (channel or role creation fails)
- Owner attempts to leave — must be blocked
- Kick/ban of server owner by admin (should be blocked — owner is above all roles)
- Double-ban (ban already-banned user) — idempotent, no error
- Invite code collision (very unlikely but possible with short codes)
- Server delete while members are connected — must disconnect and clean up state

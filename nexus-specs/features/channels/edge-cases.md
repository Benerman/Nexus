# Channels Edge Cases

- Delete category with channels — channels uncategorized, not deleted
- User joins a private channel they don't have access to
- Channel position conflict (two channels with same position value)
- Channel name length limits (max 100 chars)
- Socket.IO room management on channel delete — members must leave the room
- Permission override for a role that no member holds (still valid, stored)
- Read Messages deny — user must not receive history or real-time messages

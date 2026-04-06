# Moderation

Nexus provides tools for managing members and enforcing server rules.

## Moderation Actions

### Kick

Remove a member from the server. They can rejoin with a new invite.

- **Permission required:** `kickMembers`
- Right-click a member → **Kick**

### Ban

Permanently prevent a member from rejoining the server. Bans are stored as a unique constraint per server+user.

- **Permission required:** `banMembers`
- Right-click a member → **Ban**
- Banned users cannot rejoin even with a valid invite

To unban: **Server Settings → Bans** → select the user → **Unban**

### Timeout

Temporarily restrict a member from sending messages or joining voice for a set duration.

- **Permission required:** `moderateMembers`
- One active timeout per user per server
- Right-click a member → **Timeout** → set duration

### Mute

Prevent a member from sending messages in the server.

- **Permission required:** `muteMembers`

## Message Management

With `manageMessages` permission you can:

- **Delete any message** — Click the trash icon on any message
- **Pin messages** — Right-click → Pin (or unpin)
- **Manage reactions** — Remove reactions from messages

## Audit Logs

Track moderation actions and server changes. Access via **Server Settings → Audit Log**.

Audit logs record:
- Who performed the action
- What action was taken
- When it happened
- Additional details (target user, channel, etc.)

## AutoMod

Nexus includes automated moderation rules. See [AutoMod](automod.md) for:
- Keyword filters
- Spam detection
- Invite link blocking

## Role Hierarchy in Moderation

Moderation actions respect role hierarchy:

- You can only kick/ban/timeout members whose **highest role** is below your own
- Server owners cannot be kicked, banned, or timed out
- Users with `admin` permission can moderate anyone except the owner

## Related

- [Roles & Permissions](roles-and-permissions.md) — Permission setup
- [AutoMod](automod.md) — Automated moderation
- [Channel Permissions](channel-permissions.md) — Per-channel access control

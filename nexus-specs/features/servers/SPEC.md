# Servers Feature Spec

## Source Files

- `server/handlers/servers.js` — Server CRUD, kick/ban/timeout, member management
- `server/helpers.js` — `serializeServer()` — server state serialization

## Behaviors

### Server CRUD

- `server:create` — creates server with name, owner. Uses DB transaction. Bootstraps #general channel and @everyone role.
- `server:update` — update name, icon. Requires Manage Server.
- `server:delete` — owner only. Cascades all channels, roles, members.
- `server:join` — user joins via invite link. Records as member.
- `server:leave` — user leaves server. Owner cannot leave (must transfer or delete).

### Member Management

- `server:kick` — remove member. Requires Kick Members permission.
- `server:ban` — ban member by userId. Requires Ban Members. Banned users cannot rejoin.
- `server:unban` — remove ban. Requires Ban Members.
- `server:timeout` — temporarily restrict member's ability to send messages. Requires Moderate Members.

### Invites

- `server:create-invite` — generates invite code. Requires Create Invite (or admin).
- Invite links are single-use or multi-use depending on settings.

## Edge Cases

- Server create DB transaction must roll back if any step fails
- Server owner leaving — must be blocked
- Kick/ban self — should be blocked
- Ban a user who is already banned — idempotent
- Server with no channels after channel deletion — valid state

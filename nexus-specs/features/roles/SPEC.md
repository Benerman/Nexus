# Roles Feature Spec

## Source Files

- `server/handlers/roles.js` — Role CRUD, member role assignment
- `server/utils.js` — `getUserPerms()` — permission resolution
- `server/handlers/channels.js` — Channel-level permission overrides

## Permission Model

1. `@everyone` defaults: baseline for all members.
2. Role stacking: user's effective permissions are the union of all assigned roles. Highest position wins on conflicts.
3. Channel overrides: per-channel `allow`/`deny` bits override role permissions for that channel.
4. Server owner: unconditionally has all permissions — bypasses all role checks.

## Behaviors

### Role CRUD

- `role:create` — create role with name, color, permissions bitmask, position. Requires Manage Roles.
- `role:update` — update role fields. Can only assign permissions you yourself hold (no privilege escalation).
- `role:delete` — delete role, cascade-remove member assignments.
- `role:reorder` — change position of roles in hierarchy.

### Member Assignment

- `role:assign` — assign role to member. Requires Manage Roles and that the assigner holds a role above the target.
- `role:remove` — remove role from member. Same constraints.

### Permission Resolution

- `getUserPerms(userId, serverId, channelId)` returns effective permissions for a user in a channel.
- Used in all handlers before performing privileged actions.

## Edge Cases

- **Privilege escalation via role update:** A user should not be able to grant a role permissions they don't hold themselves.
- **Role position manipulation:** Assigning a role above your own highest role should be blocked.
- **Channel override conflict:** `deny` bit takes precedence over role `allow` bit.
- **Server owner bypass:** Owner must always pass all permission checks regardless of role state.

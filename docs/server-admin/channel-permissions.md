# Channel Permissions

Override server-level role permissions on a per-channel basis.

## How Overrides Work

Each channel can have permission overrides for specific roles. Overrides take precedence over the role's server-level permissions.

### Override Values

| Value | Meaning |
|-------|---------|
| **Allow** (true) | Grant the permission in this channel |
| **Deny** (false) | Revoke the permission in this channel |
| **Inherit** (null) | Use the server-level role setting |

### Resolution Order

1. Check if user is server owner → all permissions granted
2. Check if user has `admin` role → all permissions granted
3. Start with @everyone role permissions
4. Apply assigned role permissions (highest position wins)
5. Apply channel-level overrides for each role the user has

## Configuring Overrides

1. Click the gear icon on a channel → **Permissions**
2. Select a role
3. Toggle permissions between Allow, Deny, and Inherit

Requires `manageChannels` permission.

## Private Channels

Set a channel as **Private** to hide it from members without explicit `viewChannel` access. Then use channel permission overrides to grant specific roles access.

## Common Patterns

### Read-only Announcements Channel

- @everyone: `sendMessages: Deny`
- Moderator role: `sendMessages: Allow`

### Staff-only Channel

- Set channel as Private
- @everyone: `viewChannel: Deny`
- Staff role: `viewChannel: Allow`

## Storage

Channel permission overrides are stored as JSONB in the `permission_overrides` column of the `channels` table.

## Related

- [Roles & Permissions](roles-and-permissions.md) — Server-level permissions
- [Channels](../user-guide/channels.md) — Channel management

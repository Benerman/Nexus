# Server Settings

Configure your server through **Server Settings** (requires `manageServer` permission).

## General Settings

| Setting | Limit | Description |
|---------|-------|-------------|
| Server name | 3–32 characters | Display name in the sidebar |
| Server icon | Emoji or image upload | Icon shown in the server list |
| Description | 0–256 characters | Server description |

## LAN Mode

Toggle LAN mode for local network deployments. When enabled:
- GIF picker is disabled
- URL previews are disabled
- External ICE servers are not used (direct LAN connections only)

For multi-subnet voice, use a [TURN server](../audio/stun-turn.md) instead of LAN mode.

## Settings Tabs

The Settings modal has multiple tabs (some require specific permissions):

| Tab | Permission | Content |
|-----|-----------|---------|
| Overview | `manageServer` | Name, icon, description |
| Channels | `manageChannels` | Channel/category management, LAN mode |
| Roles | `manageRoles` | Role management |
| Members | `manageRoles` | Member role assignment |
| Webhooks | `manageServer` | Webhook configuration |
| Emoji | `manageEmojis` | Custom emoji management |
| Invites | `createInvite` | Invite link management |
| Audit Log | `admin` | Server activity log |

## Related

- [Roles & Permissions](roles-and-permissions.md) — Access control
- [Channels](../user-guide/channels.md) — Channel management
- [Webhooks](webhooks.md) — Integration setup

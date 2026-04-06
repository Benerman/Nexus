# Servers

Servers are the top-level organizational unit in Nexus. Each server has its own channels, roles, members, and settings.

## Creating a Server

1. Click the **+** button in the server sidebar
2. Enter a name (3–32 characters)
3. Choose an icon (emoji or custom image)
4. Click **Create**

New servers include default channels and roles. See [Create Your First Server](../getting-started/first-server.md) for details.

The server creator is the **owner** and has all permissions automatically, regardless of roles assigned.

## Joining a Server

Join a server using an invite link shared by a member. Invite links look like:

```
https://nexus.example.com/invite/abc123
```

Click the link or paste it in the **Join Server** dialog.

## Server Settings

Access settings by clicking the server name → **Server Settings** (requires `manageServer` permission).

| Setting | Limit | Description |
|---------|-------|-------------|
| Name | 3–32 chars | Server display name |
| Icon | Emoji or image | Server icon shown in sidebar |
| Description | 0–256 chars | Server description |
| LAN Mode | Toggle | Disables external features (GIF picker, URL previews, external ICE servers) for local network deployments |

## Server Deletion

Only the server owner can delete a server. Deletion cascades to all channels, messages, roles, invites, and member data.

## Member List

The member list in the right sidebar shows all online and offline members, grouped by their highest-colored role. Each member shows:

- Username with role color
- Avatar
- Online status indicator
- Custom status (if set)

## Related

- [Channels](channels.md) — Create and organize channels
- [Roles & Permissions](../server-admin/roles-and-permissions.md) — Access control
- [Invites](../server-admin/invites.md) — Creating and managing invite links
- [Server Settings](../server-admin/server-settings.md) — Detailed settings reference

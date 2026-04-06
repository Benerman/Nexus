# Roles & Permissions

Nexus uses a hierarchical role-based permission system with channel-level overrides.

## Role Basics

Every server has at least two roles:

| Role | Position | Description |
|------|----------|-------------|
| **@everyone** | 0 | Default role assigned to all members. Cannot be deleted. |
| **Admin** | 1 | Full permissions. Created automatically with server. Color: `#ED4245` |

Roles have:
- **Name** — 2–32 characters
- **Color** — Hex color code displayed on usernames
- **Position** — Determines hierarchy (higher number = higher authority)
- **Permissions** — Set of boolean flags

## The 19 Permissions

| Permission | Default (@everyone) | Description |
|------------|---------------------|-------------|
| `viewChannel` | true | See the channel in the channel list |
| `sendMessages` | true | Post messages in text channels |
| `attachFiles` | true | Upload file attachments |
| `joinVoice` | true | Connect to voice channels |
| `readHistory` | true | View message history |
| `addReactions` | true | Add emoji reactions to messages |
| `createInvite` | true | Generate server invite links |
| `mentionEveryone` | false | Use @everyone mentions |
| `manageMessages` | false | Edit/delete any message, pin messages |
| `manageChannels` | false | Create, edit, delete channels and categories |
| `manageRoles` | false | Create, edit, delete roles and assign them |
| `manageServer` | false | Change server name, icon, description, settings |
| `manageEmojis` | false | Upload and delete custom server emoji |
| `sendTargetedSounds` | false | Play soundboard sounds to specific users |
| `kickMembers` | false | Remove members from the server |
| `banMembers` | false | Permanently ban members |
| `muteMembers` | false | Prevent members from sending messages |
| `moderateMembers` | false | Move or deafen users in voice channels |
| `admin` | false | Grants all permissions. Overrides all other checks. |

## Permission Resolution

Permissions are resolved in this order:

1. **Server owner** — Always has all permissions, regardless of roles
2. **Admin permission** — Any role with `admin: true` grants all permissions
3. **@everyone role** — Base permission set for all members
4. **Assigned roles** — Stacked on top of @everyone. When multiple roles set the same permission, the role with the highest position wins.
5. **Channel overrides** — Per-role overrides applied to specific channels. See [Channel Permissions](channel-permissions.md).

### Example

A user has roles: @everyone (position 0), Moderator (position 2), Artist (position 3).

- @everyone: `manageMessages: false`
- Moderator: `manageMessages: true`
- Artist: (does not set `manageMessages`)

Result: `manageMessages: true` — Moderator's explicit `true` applies because it's the highest-positioned role that sets this permission.

## Managing Roles

Go to **Server Settings → Roles** (requires `manageRoles` permission).

### Creating a Role

1. Click **Create Role**
2. Set name, color, and permissions
3. Position the role in the hierarchy by dragging

### Assigning Roles

1. Click on a member in the member list
2. Select **Manage Roles**
3. Toggle roles on/off

A user can only assign roles that are **below** their own highest role in the hierarchy.

## Rate Limits

- Role creation: 10 per 60 seconds
- Role updates: Handled per-operation

## Related

- [Channel Permissions](channel-permissions.md) — Per-channel permission overrides
- [Moderation](moderation.md) — Using permissions for moderation
- [Server Settings](server-settings.md) — Server-level configuration

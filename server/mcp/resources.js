/**
 * MCP Resources — Read-only data that AI agents can access from Nexus.
 *
 * Resources follow the MCP resource specification:
 *   nexus://server/{serverId}
 *   nexus://channel/{channelId}/messages
 *   etc.
 */

const db = require('../db');
const { state, isUserOnline, channelToServer } = require('../state');
const { hasServerAccess, hasScope } = require('./auth');
const { getUserPerms } = require('../helpers');

/**
 * Resource template definitions for MCP resource listing
 */
const resourceTemplates = [
  {
    uriTemplate: 'nexus://server/{serverId}',
    name: 'Server Info',
    description: 'Metadata about a Nexus server (name, members, channels)',
    mimeType: 'application/json'
  },
  {
    uriTemplate: 'nexus://server/{serverId}/channels',
    name: 'Server Channels',
    description: 'List of channels in a server',
    mimeType: 'application/json'
  },
  {
    uriTemplate: 'nexus://server/{serverId}/members',
    name: 'Server Members',
    description: 'List of members in a server with roles and online status',
    mimeType: 'application/json'
  },
  {
    uriTemplate: 'nexus://server/{serverId}/roles',
    name: 'Server Roles',
    description: 'Role hierarchy and permissions for a server',
    mimeType: 'application/json'
  },
  {
    uriTemplate: 'nexus://channel/{channelId}/messages',
    name: 'Channel Messages',
    description: 'Recent messages from a text channel (last 50)',
    mimeType: 'application/json'
  },
  {
    uriTemplate: 'nexus://channel/{channelId}/pins',
    name: 'Pinned Messages',
    description: 'Pinned messages in a channel',
    mimeType: 'application/json'
  },
  {
    uriTemplate: 'nexus://user/{userId}',
    name: 'User Profile',
    description: 'Public profile information for a user',
    mimeType: 'application/json'
  },
  {
    uriTemplate: 'nexus://server/{serverId}/audit-log',
    name: 'Audit Log',
    description: 'Recent audit log entries for a server',
    mimeType: 'application/json'
  }
];

/**
 * Parse a nexus:// URI into parts
 */
function parseResourceUri(uri) {
  const match = uri.match(/^nexus:\/\/(server|channel|user)\/([a-zA-Z0-9-]+)(?:\/([\w-]+))?$/);
  if (!match) return null;
  return { type: match[1], id: match[2], sub: match[3] || null };
}

/**
 * Resolve a resource URI to its content
 */
async function readResource(uri, tokenData) {
  if (!hasScope(tokenData, 'read')) return { error: 'Missing read scope' };
  const parsed = parseResourceUri(uri);
  if (!parsed) return { error: 'Invalid resource URI' };

  switch (parsed.type) {
    case 'server': return resolveServerResource(parsed, tokenData);
    case 'channel': return resolveChannelResource(parsed, tokenData);
    case 'user': return resolveUserResource(parsed, tokenData);
    default: return { error: `Unknown resource type: ${parsed.type}` };
  }
}

async function resolveServerResource(parsed, tokenData) {
  const serverId = parsed.id;
  if (!hasServerAccess(tokenData, serverId)) return { error: 'No access to this server' };

  const srv = state.servers[serverId];
  if (!srv) return { error: 'Server not found' };

  switch (parsed.sub) {
    case null:
    case undefined:
      return {
        contents: [{
          uri: `nexus://server/${serverId}`,
          mimeType: 'application/json',
          text: JSON.stringify({
            id: serverId, name: srv.name, icon: srv.icon,
            description: srv.description || '',
            ownerId: srv.ownerId,
            memberCount: Object.keys(srv.members).length,
            textChannels: srv.channels.text.length,
            voiceChannels: srv.channels.voice.length,
            lanMode: srv.lanMode || false,
            createdAt: srv.createdAt
          })
        }]
      };

    case 'channels':
      return {
        contents: [{
          uri: `nexus://server/${serverId}/channels`,
          mimeType: 'application/json',
          text: JSON.stringify({
            text: srv.channels.text.map(ch => ({
              id: ch.id, name: ch.name, categoryId: ch.categoryId,
              topic: ch.topic || '', isPrivate: ch.isPrivate || false
            })),
            voice: srv.channels.voice.map(ch => ({
              id: ch.id, name: ch.name, categoryId: ch.categoryId,
              isPrivate: ch.isPrivate || false,
              usersConnected: state.voiceChannels[ch.id]?.users?.length || 0
            })),
            categories: Object.values(srv.categories || {}).map(cat => ({
              id: cat.id, name: cat.name, position: cat.position
            }))
          })
        }]
      };

    case 'members': {
      // Limit to first 200 members to prevent huge payloads
      const memberEntries = Object.entries(srv.members).slice(0, 200);
      const totalMembers = Object.keys(srv.members).length;
      return {
        contents: [{
          uri: `nexus://server/${serverId}/members`,
          mimeType: 'application/json',
          text: JSON.stringify({
            members: memberEntries.map(([id, m]) => ({
              id, username: m.username, roles: m.roles,
              online: isUserOnline(id), joinedAt: m.joinedAt
            })),
            total: totalMembers,
            truncated: totalMembers > 200
          })
        }]
      };
    }

    case 'roles': {
      const rolePerms = getUserPerms(tokenData.accountId, serverId);
      const canViewPerms = rolePerms.manageRoles || rolePerms.manageServer || srv.ownerId === tokenData.accountId;
      return {
        contents: [{
          uri: `nexus://server/${serverId}/roles`,
          mimeType: 'application/json',
          text: JSON.stringify(
            Object.values(srv.roles).map(r => ({
              id: r.id, name: r.name, color: r.color,
              position: r.position,
              ...(canViewPerms && { permissions: r.permissions })
            }))
          )
        }]
      };
    }

    case 'audit-log': {
      const perms = getUserPerms(tokenData.accountId, serverId);
      if (!perms.manageServer && !perms.admin) return { error: 'Missing manageServer permission' };

      const logs = await db.getAuditLogs(serverId, 50);
      return {
        contents: [{
          uri: `nexus://server/${serverId}/audit-log`,
          mimeType: 'application/json',
          text: JSON.stringify(logs)
        }]
      };
    }

    default:
      return { error: `Unknown server sub-resource: ${parsed.sub}` };
  }
}

async function resolveChannelResource(parsed, tokenData) {
  const channelId = parsed.id;
  const serverId = channelToServer.get(channelId);
  if (!serverId) return { error: 'Channel not found' };
  if (!hasServerAccess(tokenData, serverId)) return { error: 'No access to this server' };

  const perms = getUserPerms(tokenData.accountId, serverId, channelId);

  switch (parsed.sub) {
    case 'messages': {
      if (!perms.readHistory) return { error: 'Missing readHistory permission' };

      const messages = await db.getChannelMessagesWithAuthors(channelId, 50);
      return {
        contents: [{
          uri: `nexus://channel/${channelId}/messages`,
          mimeType: 'application/json',
          text: JSON.stringify(
            messages.map(m => ({
              id: m.id, content: m.content,
              author: m.author_username || m.webhook_username || 'Unknown',
              authorId: m.author_id,
              timestamp: m.created_at,
              isBot: m.is_webhook || false
            }))
          )
        }]
      };
    }

    case 'pins': {
      if (!perms.readHistory) return { error: 'Missing readHistory permission' };

      const pins = await db.getPinnedMessages(channelId);
      return {
        contents: [{
          uri: `nexus://channel/${channelId}/pins`,
          mimeType: 'application/json',
          text: JSON.stringify(pins)
        }]
      };
    }

    default:
      return { error: `Unknown channel sub-resource: ${parsed.sub}` };
  }
}

async function resolveUserResource(parsed, tokenData) {
  const userId = parsed.id;
  const account = await db.getAccountById(userId);
  if (!account) return { error: 'User not found' };

  // Access control: require shared server membership
  const sharesServer = Object.values(state.servers).some(srv =>
    srv.members[tokenData.accountId] && srv.members[userId]
  );
  if (!sharesServer && tokenData.accountId !== userId) {
    return { error: 'No shared server with this user' };
  }

  return {
    contents: [{
      uri: `nexus://user/${userId}`,
      mimeType: 'application/json',
      text: JSON.stringify({
        id: account.id, username: account.username,
        avatar: account.avatar, color: account.color,
        bio: account.bio || '', status: account.status || 'online',
        isBot: account.is_bot || false,
        online: isUserOnline(account.id),
        createdAt: account.created_at
      })
    }]
  };
}

module.exports = {
  resourceTemplates,
  parseResourceUri,
  readResource,
};

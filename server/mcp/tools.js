/**
 * MCP Tools — Actions that AI agents can perform on Nexus.
 *
 * Each tool follows the MCP tool specification:
 *   { name, description, inputSchema, handler(params, context) }
 *
 * Context includes: accountId, scopes, serverIds, io (Socket.IO instance)
 */

const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { state, channelToServer } = require('../state');
const { getUserPerms, parseMentions, parseChannelLinks } = require('../helpers');
const { hasScope, hasServerAccess } = require('./auth');
const { notifySSE } = require('./events');

// ─── Tool Definitions ──────────────────────────────────────────────────────

const tools = [
  // ── Messaging ─────────────────────────────────────────────────────────────
  {
    name: 'send_message',
    description: 'Send a message to a text channel. Supports plain text and embeds.',
    inputSchema: {
      type: 'object',
      properties: {
        channel_id: { type: 'string', description: 'The channel ID to send to' },
        content: { type: 'string', description: 'Message text content (max 2000 chars). Returns error if exceeded.' },
        embeds: {
          type: 'array',
          description: 'Rich embed objects (max 10)',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Embed title (max 256 chars)' },
              description: { type: 'string', description: 'Embed description (max 4096 chars)' },
              color: { type: 'number', description: 'Integer color value' },
              image: {
                type: 'object',
                description: 'Embed image',
                properties: { url: { type: 'string', description: 'Image URL' } },
                required: ['url']
              },
              thumbnail: {
                type: 'object',
                description: 'Embed thumbnail',
                properties: { url: { type: 'string', description: 'Thumbnail URL' } },
                required: ['url']
              },
              fields: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    value: { type: 'string' },
                    inline: { type: 'boolean' }
                  },
                  required: ['name', 'value']
                }
              },
              footer: {
                type: 'object',
                properties: { text: { type: 'string' } }
              }
            }
          }
        }
      },
      required: ['channel_id']
    },
    scope: 'write',
    handler: async (params, ctx) => {
      const { channel_id, content, embeds } = params;
      if (!content && (!embeds || embeds.length === 0)) {
        return { error: 'Either content or embeds is required' };
      }

      const serverId = channelToServer.get(channel_id);
      if (!serverId) return { error: 'Channel not found' };
      if (!hasServerAccess(ctx.tokenData, serverId)) return { error: 'No access to this server' };

      const srv = state.servers[serverId];
      const perms = getUserPerms(ctx.tokenData.accountId, serverId, channel_id);
      if (!perms.sendMessages) return { error: 'Missing sendMessages permission' };

      const ch = srv.channels.text.find(c => c.id === channel_id);
      if (!ch) return { error: 'Text channel not found' };

      const account = await db.getAccountById(ctx.tokenData.accountId);
      if (content && String(content).length > 2000) {
        return { error: `Message content exceeds 2000 character limit (${String(content).length} chars)` };
      }
      const messageContent = content ? String(content) : '';
      const mentions = parseMentions(messageContent, serverId);
      const channelLinks = parseChannelLinks(messageContent, serverId);

      const validEmbeds = (embeds || []).slice(0, 10).map(embed => ({
        title: typeof embed.title === 'string' ? embed.title.slice(0, 256) : undefined,
        description: typeof embed.description === 'string' ? embed.description.slice(0, 4096) : undefined,
        color: typeof embed.color === 'number' ? embed.color : undefined,
        image: embed.image?.url ? { url: String(embed.image.url) } : undefined,
        thumbnail: embed.thumbnail?.url ? { url: String(embed.thumbnail.url) } : undefined,
        fields: Array.isArray(embed.fields) ? embed.fields.slice(0, 25).map(f => ({
          name: String(f.name).slice(0, 256),
          value: String(f.value).slice(0, 1024),
          inline: !!f.inline
        })) : undefined,
        footer: embed.footer ? { text: String(embed.footer.text || '').slice(0, 2048) } : undefined
      }));

      const msg = {
        id: uuidv4(),
        channelId: channel_id,
        content: messageContent,
        author: {
          id: ctx.tokenData.accountId,
          username: account.username,
          avatar: account.avatar,
          customAvatar: account.custom_avatar,
          color: account.color || '#60A5FA',
          isWebhook: account.is_bot || false,
          isBot: account.is_bot || false
        },
        timestamp: Date.now(),
        reactions: {},
        embeds: validEmbeds.length > 0 ? validEmbeds : undefined,
        mentions,
        channelLinks: channelLinks.channels,
        isBot: account.is_bot || false
      };

      // Store in memory
      if (!state.messages[channel_id]) state.messages[channel_id] = [];
      state.messages[channel_id].push(msg);
      if (state.messages[channel_id].length > 500) {
        state.messages[channel_id] = state.messages[channel_id].slice(-500);
      }

      // Broadcast
      ctx.io.to(`text:${channel_id}`).emit('message:new', msg);
      notifySSE('message:new', { ...msg, channelId: channel_id });

      // Persist to database
      try {
        await db.saveMessage({
          id: msg.id, channelId: channel_id, authorId: ctx.tokenData.accountId,
          content: msg.content, attachments: [],
          isWebhook: account.is_bot || false,
          webhookUsername: account.is_bot ? account.username : null,
          webhookAvatar: account.is_bot ? (account.custom_avatar || account.avatar) : null,
          replyTo: null, mentions, embeds: validEmbeds
        });
      } catch (err) {
        console.error('[MCP] Error saving message:', err.message);
      }

      return {
        content: [{ type: 'text', text: JSON.stringify({ id: msg.id, channelId: channel_id, sent: true }) }]
      };
    }
  },

  {
    name: 'read_messages',
    description: 'Read recent messages from a text channel.',
    inputSchema: {
      type: 'object',
      properties: {
        channel_id: { type: 'string', description: 'The channel ID to read from' },
        limit: { type: 'number', description: 'Number of messages (max 100, default 50)' },
        before: { type: 'string', description: 'Message ID to fetch messages before (pagination)' }
      },
      required: ['channel_id']
    },
    scope: 'read',
    handler: async (params, ctx) => {
      const { channel_id, limit = 50, before } = params;
      const serverId = channelToServer.get(channel_id);
      if (!serverId) return { error: 'Channel not found' };
      if (!hasServerAccess(ctx.tokenData, serverId)) return { error: 'No access to this server' };

      const perms = getUserPerms(ctx.tokenData.accountId, serverId, channel_id);
      if (!perms.readHistory) return { error: 'Missing readHistory permission' };

      const safeLimit = Math.min(Math.max(parseInt(limit) || 50, 1), 100);

      let messages;
      if (before) {
        messages = await db.getMessagesBeforeWithAuthors(channel_id, before, safeLimit);
      } else {
        messages = await db.getChannelMessagesWithAuthors(channel_id, safeLimit);
      }

      const formatted = messages.map(m => ({
        id: m.id,
        content: m.content,
        author: m.author_username || m.webhook_username || 'Unknown',
        authorId: m.author_id,
        timestamp: m.created_at,
        isBot: m.is_webhook || false,
        embeds: m.embeds || [],
        attachments: m.attachments || [],
        replyTo: m.reply_to
      }));

      return {
        content: [{ type: 'text', text: JSON.stringify({ channelId: channel_id, messages: formatted }) }]
      };
    }
  },

  {
    name: 'edit_message',
    description: 'Edit a message sent by this bot/agent. Can update content and/or embeds.',
    inputSchema: {
      type: 'object',
      properties: {
        channel_id: { type: 'string', description: 'Channel containing the message' },
        message_id: { type: 'string', description: 'Message ID to edit' },
        content: { type: 'string', description: 'New message content (max 2000 chars). Returns error if exceeded.' },
        embeds: {
          type: 'array',
          description: 'New embed objects (replaces existing embeds, max 10)',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Embed title (max 256 chars)' },
              description: { type: 'string', description: 'Embed description (max 4096 chars)' },
              color: { type: 'number', description: 'Integer color value' },
              image: {
                type: 'object',
                description: 'Embed image',
                properties: { url: { type: 'string', description: 'Image URL' } },
                required: ['url']
              },
              thumbnail: {
                type: 'object',
                description: 'Embed thumbnail',
                properties: { url: { type: 'string', description: 'Thumbnail URL' } },
                required: ['url']
              },
              fields: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    value: { type: 'string' },
                    inline: { type: 'boolean' }
                  },
                  required: ['name', 'value']
                }
              },
              footer: {
                type: 'object',
                properties: { text: { type: 'string' } }
              }
            }
          }
        }
      },
      required: ['channel_id', 'message_id']
    },
    scope: 'write',
    handler: async (params, ctx) => {
      const { channel_id, message_id, content, embeds } = params;
      if (content === undefined && !embeds) {
        return { error: 'Either content or embeds is required' };
      }
      const serverId = channelToServer.get(channel_id);
      if (!serverId) return { error: 'Channel not found' };
      if (!hasServerAccess(ctx.tokenData, serverId)) return { error: 'No access to this server' };

      const existing = await db.getMessageById(message_id);
      if (!existing) return { error: 'Message not found' };
      if (existing.author_id !== ctx.tokenData.accountId) {
        return { error: 'Can only edit own messages' };
      }

      const newContent = content !== undefined ? String(content) : existing.content;
      if (newContent.length > 2000) {
        return { error: `Message content exceeds 2000 character limit (${newContent.length} chars)` };
      }

      const validEmbeds = embeds ? (embeds || []).slice(0, 10).map(embed => ({
        title: typeof embed.title === 'string' ? embed.title.slice(0, 256) : undefined,
        description: typeof embed.description === 'string' ? embed.description.slice(0, 4096) : undefined,
        color: typeof embed.color === 'number' ? embed.color : undefined,
        image: embed.image?.url ? { url: String(embed.image.url) } : undefined,
        thumbnail: embed.thumbnail?.url ? { url: String(embed.thumbnail.url) } : undefined,
        fields: Array.isArray(embed.fields) ? embed.fields.slice(0, 25).map(f => ({
          name: String(f.name).slice(0, 256),
          value: String(f.value).slice(0, 1024),
          inline: !!f.inline
        })) : undefined,
        footer: embed.footer ? { text: String(embed.footer.text || '').slice(0, 2048) } : undefined
      })) : undefined;

      await db.updateMessage(message_id, newContent);

      // Update embeds in DB if provided
      if (validEmbeds !== undefined) {
        await db.query(
          'UPDATE messages SET embeds = $1 WHERE id = $2',
          [JSON.stringify(validEmbeds), message_id]
        );
      }

      // Update in-memory
      const channelMsgs = state.messages[channel_id];
      if (channelMsgs) {
        const msg = channelMsgs.find(m => m.id === message_id);
        if (msg) {
          msg.content = newContent;
          msg.edited = true;
          msg.editedAt = Date.now();
          if (validEmbeds !== undefined) msg.embeds = validEmbeds;
        }
      }

      const editedData = {
        messageId: message_id, channelId: channel_id,
        content: newContent, edited: true, editedAt: Date.now(),
        ...(validEmbeds !== undefined && { embeds: validEmbeds })
      };
      ctx.io.to(`text:${channel_id}`).emit('message:edited', editedData);
      notifySSE('message:edited', editedData);

      return { content: [{ type: 'text', text: JSON.stringify({ edited: true, messageId: message_id }) }] };
    }
  },

  {
    name: 'delete_message',
    description: 'Delete a message. Can delete own messages, or any message with manageMessages permission.',
    inputSchema: {
      type: 'object',
      properties: {
        channel_id: { type: 'string', description: 'Channel containing the message' },
        message_id: { type: 'string', description: 'Message ID to delete' }
      },
      required: ['channel_id', 'message_id']
    },
    scope: 'moderate',
    handler: async (params, ctx) => {
      const { channel_id, message_id } = params;
      const serverId = channelToServer.get(channel_id);
      if (!serverId) return { error: 'Channel not found' };
      if (!hasServerAccess(ctx.tokenData, serverId)) return { error: 'No access to this server' };

      const existing = await db.getMessageById(message_id);
      if (!existing) return { error: 'Message not found' };

      const isOwnMessage = existing.author_id === ctx.tokenData.accountId;
      if (!isOwnMessage) {
        const perms = getUserPerms(ctx.tokenData.accountId, serverId, channel_id);
        if (!perms.manageMessages) return { error: 'Missing manageMessages permission' };
      }

      await db.deleteMessage(message_id);

      // Remove from memory
      const channelMsgs = state.messages[channel_id];
      if (channelMsgs) {
        const idx = channelMsgs.findIndex(m => m.id === message_id);
        if (idx !== -1) channelMsgs.splice(idx, 1);
      }

      const deletedData = { messageId: message_id, channelId: channel_id };
      ctx.io.to(`text:${channel_id}`).emit('message:deleted', deletedData);
      notifySSE('message:deleted', deletedData);

      return { content: [{ type: 'text', text: JSON.stringify({ deleted: true, messageId: message_id }) }] };
    }
  },

  {
    name: 'search_messages',
    description: 'Search messages in a server by content.',
    inputSchema: {
      type: 'object',
      properties: {
        server_id: { type: 'string', description: 'Server to search in' },
        query: { type: 'string', description: 'Search query' },
        channel_id: { type: 'string', description: 'Optional: limit to a specific channel' },
        limit: { type: 'number', description: 'Max results (default 25, max 50)' }
      },
      required: ['server_id', 'query']
    },
    scope: 'read',
    handler: async (params, ctx) => {
      const { server_id, query: searchQuery, channel_id, limit = 25 } = params;
      if (!hasServerAccess(ctx.tokenData, server_id)) return { error: 'No access to this server' };

      const safeLimit = Math.min(Math.max(parseInt(limit) || 25, 1), 50);
      const results = await db.searchMessages(server_id, searchQuery, channel_id || null, safeLimit);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            serverId: server_id,
            query: searchQuery,
            results: results.map(r => ({
              id: r.id, content: r.content, author: r.author_username,
              channelId: r.channel_id, timestamp: r.created_at
            }))
          })
        }]
      };
    }
  },

  // ── Channel Operations ────────────────────────────────────────────────────
  {
    name: 'list_channels',
    description: 'List all channels in a server.',
    inputSchema: {
      type: 'object',
      properties: {
        server_id: { type: 'string', description: 'The server ID' }
      },
      required: ['server_id']
    },
    scope: 'read',
    handler: async (params, ctx) => {
      const { server_id } = params;
      if (!hasServerAccess(ctx.tokenData, server_id)) return { error: 'No access to this server' };

      const srv = state.servers[server_id];
      if (!srv) return { error: 'Server not found' };

      const channels = [
        ...srv.channels.text.map(ch => ({
          id: ch.id, name: ch.name, type: 'text',
          categoryId: ch.categoryId, topic: ch.topic || '',
          isPrivate: ch.isPrivate || false
        })),
        ...srv.channels.voice.map(ch => ({
          id: ch.id, name: ch.name, type: 'voice',
          categoryId: ch.categoryId,
          isPrivate: ch.isPrivate || false,
          usersConnected: state.voiceChannels[ch.id]?.users?.length || 0
        }))
      ];

      const categories = Object.values(srv.categories || {}).map(cat => ({
        id: cat.id, name: cat.name, position: cat.position
      }));

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ serverId: server_id, channels, categories })
        }]
      };
    }
  },

  {
    name: 'create_channel',
    description: 'Create a new text or voice channel in a server.',
    inputSchema: {
      type: 'object',
      properties: {
        server_id: { type: 'string', description: 'The server ID' },
        name: { type: 'string', description: 'Channel name' },
        type: { type: 'string', enum: ['text', 'voice'], description: 'Channel type' },
        category_id: { type: 'string', description: 'Category to place the channel in' },
        topic: { type: 'string', description: 'Channel topic (text only)' }
      },
      required: ['server_id', 'name', 'type']
    },
    scope: 'manage',
    handler: async (params, ctx) => {
      const { server_id, name, type, category_id, topic } = params;
      if (!hasServerAccess(ctx.tokenData, server_id)) return { error: 'No access to this server' };

      const perms = getUserPerms(ctx.tokenData.accountId, server_id);
      if (!perms.manageChannels) return { error: 'Missing manageChannels permission' };

      const srv = state.servers[server_id];
      if (!srv) return { error: 'Server not found' };

      const channelId = uuidv4();
      const catId = category_id || (srv.categoryOrder && srv.categoryOrder[0]) || null;

      const ch = {
        id: channelId, name: String(name).slice(0, 50).toLowerCase().replace(/\s+/g, '-'),
        type, serverId: server_id, categoryId: catId,
        topic: topic ? String(topic).slice(0, 1024) : '',
        description: '', nsfw: false, slowMode: 0,
        webhooks: [], position: 0, isPrivate: false,
        permissionOverrides: {}
      };

      if (type === 'voice') {
        srv.channels.voice.push(ch);
        state.voiceChannels[channelId] = { users: [], screenSharers: [] };
      } else {
        srv.channels.text.push(ch);
        state.messages[channelId] = [];
      }

      channelToServer.set(channelId, server_id);

      await db.saveChannel({
        id: channelId, serverId: server_id, categoryId: catId,
        name: ch.name, type, description: '', topic: ch.topic,
        position: 0, isPrivate: false, nsfw: false, slowMode: 0,
        permissionOverrides: {}
      });

      ctx.io.emit('channel:created', { serverId: server_id, channel: ch });

      return { content: [{ type: 'text', text: JSON.stringify({ created: true, channel: ch }) }] };
    }
  },

  // ── Server & Member Info ──────────────────────────────────────────────────
  {
    name: 'get_server_info',
    description: 'Get information about a server.',
    inputSchema: {
      type: 'object',
      properties: {
        server_id: { type: 'string', description: 'The server ID' }
      },
      required: ['server_id']
    },
    scope: 'read',
    handler: async (params, ctx) => {
      const { server_id } = params;
      if (!hasServerAccess(ctx.tokenData, server_id)) return { error: 'No access to this server' };

      const srv = state.servers[server_id];
      if (!srv) return { error: 'Server not found' };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            id: server_id, name: srv.name, icon: srv.icon,
            description: srv.description || '',
            ownerId: srv.ownerId,
            memberCount: Object.keys(srv.members).length,
            textChannels: srv.channels.text.length,
            voiceChannels: srv.channels.voice.length,
            roles: Object.values(srv.roles).map(r => ({ id: r.id, name: r.name, color: r.color, position: r.position })),
            lanMode: srv.lanMode || false
          })
        }]
      };
    }
  },

  {
    name: 'list_members',
    description: 'List members of a server with their roles and online status.',
    inputSchema: {
      type: 'object',
      properties: {
        server_id: { type: 'string', description: 'The server ID' },
        limit: { type: 'number', description: 'Max results (default 100)' }
      },
      required: ['server_id']
    },
    scope: 'read',
    handler: async (params, ctx) => {
      const { server_id, limit = 100 } = params;
      if (!hasServerAccess(ctx.tokenData, server_id)) return { error: 'No access to this server' };

      const srv = state.servers[server_id];
      if (!srv) return { error: 'Server not found' };

      const { isUserOnline } = require('../state');
      const members = Object.entries(srv.members)
        .slice(0, Math.min(limit, 200))
        .map(([id, m]) => ({
          id,
          username: m.username,
          roles: m.roles,
          online: isUserOnline(id),
          joinedAt: m.joinedAt
        }));

      return {
        content: [{ type: 'text', text: JSON.stringify({ serverId: server_id, members }) }]
      };
    }
  },

  {
    name: 'get_user_info',
    description: 'Get profile information for a user.',
    inputSchema: {
      type: 'object',
      properties: {
        user_id: { type: 'string', description: 'The user account ID' }
      },
      required: ['user_id']
    },
    scope: 'read',
    handler: async (params, ctx) => {
      const { user_id } = params;
      const account = await db.getAccountById(user_id);
      if (!account) return { error: 'User not found' };

      const { isUserOnline } = require('../state');

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            id: account.id,
            username: account.username,
            avatar: account.avatar,
            color: account.color,
            bio: account.bio || '',
            status: account.status || 'online',
            isBot: account.is_bot || false,
            online: isUserOnline(account.id),
            createdAt: account.created_at
          })
        }]
      };
    }
  },

  // ── Moderation ────────────────────────────────────────────────────────────
  {
    name: 'kick_member',
    description: 'Kick a member from a server.',
    inputSchema: {
      type: 'object',
      properties: {
        server_id: { type: 'string', description: 'The server ID' },
        user_id: { type: 'string', description: 'User to kick' },
        reason: { type: 'string', description: 'Reason for kick' }
      },
      required: ['server_id', 'user_id']
    },
    scope: 'moderate',
    handler: async (params, ctx) => {
      const { server_id, user_id, reason } = params;
      if (!hasServerAccess(ctx.tokenData, server_id)) return { error: 'No access to this server' };

      const perms = getUserPerms(ctx.tokenData.accountId, server_id);
      if (!perms.kickMembers) return { error: 'Missing kickMembers permission' };

      const srv = state.servers[server_id];
      if (!srv) return { error: 'Server not found' };
      if (srv.ownerId === user_id) return { error: 'Cannot kick server owner' };
      if (!srv.members[user_id]) return { error: 'User is not a member' };

      delete srv.members[user_id];
      await db.removeServerMember(server_id, user_id);

      try {
        await db.createAuditLog({
          serverId: server_id, actorId: ctx.tokenData.accountId,
          action: 'member_kick', targetId: user_id,
          details: { reason: reason || 'Kicked via MCP' }
        });
      } catch (e) { /* audit log failure is non-fatal */ }

      ctx.io.emit('server:member-kicked', { serverId: server_id, userId: user_id, reason });

      return { content: [{ type: 'text', text: JSON.stringify({ kicked: true, userId: user_id }) }] };
    }
  },

  {
    name: 'ban_member',
    description: 'Ban a member from a server.',
    inputSchema: {
      type: 'object',
      properties: {
        server_id: { type: 'string', description: 'The server ID' },
        user_id: { type: 'string', description: 'User to ban' },
        reason: { type: 'string', description: 'Reason for ban' }
      },
      required: ['server_id', 'user_id']
    },
    scope: 'moderate',
    handler: async (params, ctx) => {
      const { server_id, user_id, reason } = params;
      if (!hasServerAccess(ctx.tokenData, server_id)) return { error: 'No access to this server' };

      const perms = getUserPerms(ctx.tokenData.accountId, server_id);
      if (!perms.banMembers) return { error: 'Missing banMembers permission' };

      const srv = state.servers[server_id];
      if (!srv) return { error: 'Server not found' };
      if (srv.ownerId === user_id) return { error: 'Cannot ban server owner' };

      await db.banUser(server_id, user_id, ctx.tokenData.accountId, reason || 'Banned via MCP');
      delete srv.members[user_id];
      await db.removeServerMember(server_id, user_id);

      try {
        await db.createAuditLog({
          serverId: server_id, actorId: ctx.tokenData.accountId,
          action: 'member_ban', targetId: user_id,
          details: { reason: reason || 'Banned via MCP' }
        });
      } catch (e) { /* audit log failure is non-fatal */ }

      ctx.io.emit('server:member-banned', { serverId: server_id, userId: user_id, reason });

      return { content: [{ type: 'text', text: JSON.stringify({ banned: true, userId: user_id }) }] };
    }
  },

  {
    name: 'timeout_member',
    description: 'Timeout a member (temporarily restrict sending messages and joining voice).',
    inputSchema: {
      type: 'object',
      properties: {
        server_id: { type: 'string', description: 'The server ID' },
        user_id: { type: 'string', description: 'User to timeout' },
        duration_seconds: { type: 'number', description: 'Timeout duration in seconds (max 604800 = 1 week)' },
        reason: { type: 'string', description: 'Reason for timeout' }
      },
      required: ['server_id', 'user_id', 'duration_seconds']
    },
    scope: 'moderate',
    handler: async (params, ctx) => {
      const { server_id, user_id, duration_seconds, reason } = params;
      if (!hasServerAccess(ctx.tokenData, server_id)) return { error: 'No access to this server' };

      const perms = getUserPerms(ctx.tokenData.accountId, server_id);
      if (!perms.moderateMembers) return { error: 'Missing moderateMembers permission' };

      const duration = Math.min(Math.max(parseInt(duration_seconds) || 60, 1), 604800);
      const expiresAt = new Date(Date.now() + duration * 1000);

      await db.timeoutUser(server_id, user_id, ctx.tokenData.accountId, expiresAt, reason || 'Timed out via MCP');

      ctx.io.emit('server:member-timeout', {
        serverId: server_id, userId: user_id,
        expiresAt: expiresAt.toISOString(), reason
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ timedOut: true, userId: user_id, expiresAt: expiresAt.toISOString() })
        }]
      };
    }
  },

  // ── Reactions ─────────────────────────────────────────────────────────────
  {
    name: 'react_to_message',
    description: 'Add a reaction to a message.',
    inputSchema: {
      type: 'object',
      properties: {
        channel_id: { type: 'string', description: 'Channel containing the message' },
        message_id: { type: 'string', description: 'Message to react to' },
        emoji: { type: 'string', description: 'Emoji to react with' }
      },
      required: ['channel_id', 'message_id', 'emoji']
    },
    scope: 'write',
    handler: async (params, ctx) => {
      const { channel_id, message_id, emoji } = params;
      const serverId = channelToServer.get(channel_id);
      if (!serverId) return { error: 'Channel not found' };
      if (!hasServerAccess(ctx.tokenData, serverId)) return { error: 'No access to this server' };

      const perms = getUserPerms(ctx.tokenData.accountId, serverId, channel_id);
      if (!perms.addReactions) return { error: 'Missing addReactions permission' };

      // Update in-memory
      const channelMsgs = state.messages[channel_id];
      if (channelMsgs) {
        const msg = channelMsgs.find(m => m.id === message_id);
        if (msg) {
          if (!msg.reactions) msg.reactions = {};
          if (!msg.reactions[emoji]) msg.reactions[emoji] = [];
          if (!msg.reactions[emoji].includes(ctx.tokenData.accountId)) {
            msg.reactions[emoji].push(ctx.tokenData.accountId);
          }

          // Persist
          await db.updateMessageReactions(message_id, msg.reactions);

          const reactedData = {
            messageId: message_id, channelId: channel_id,
            reactions: msg.reactions
          };
          ctx.io.to(`text:${channel_id}`).emit('message:reacted', reactedData);
          notifySSE('message:reacted', reactedData);
        }
      }

      return { content: [{ type: 'text', text: JSON.stringify({ reacted: true }) }] };
    }
  },

  // ── Pins ──────────────────────────────────────────────────────────────────
  {
    name: 'pin_message',
    description: 'Pin a message in a channel.',
    inputSchema: {
      type: 'object',
      properties: {
        channel_id: { type: 'string', description: 'Channel containing the message' },
        message_id: { type: 'string', description: 'Message to pin' }
      },
      required: ['channel_id', 'message_id']
    },
    scope: 'manage',
    handler: async (params, ctx) => {
      const { channel_id, message_id } = params;
      const serverId = channelToServer.get(channel_id);
      if (!serverId) return { error: 'Channel not found' };
      if (!hasServerAccess(ctx.tokenData, serverId)) return { error: 'No access to this server' };

      const perms = getUserPerms(ctx.tokenData.accountId, serverId, channel_id);
      if (!perms.manageMessages) return { error: 'Missing manageMessages permission' };

      await db.pinMessage(channel_id, message_id, ctx.tokenData.accountId);

      const pinnedData = { channelId: channel_id, messageId: message_id };
      ctx.io.to(`text:${channel_id}`).emit('message:pinned', pinnedData);
      notifySSE('message:pinned', pinnedData);

      return { content: [{ type: 'text', text: JSON.stringify({ pinned: true }) }] };
    }
  },

  // ── Threads ───────────────────────────────────────────────────────────────
  {
    name: 'create_thread',
    description: 'Create a thread reply on a message.',
    inputSchema: {
      type: 'object',
      properties: {
        channel_id: { type: 'string', description: 'Channel containing the parent message' },
        message_id: { type: 'string', description: 'Parent message ID' },
        content: { type: 'string', description: 'Thread reply content (max 2000 chars)' }
      },
      required: ['channel_id', 'message_id', 'content']
    },
    scope: 'write',
    handler: async (params, ctx) => {
      const { channel_id, message_id, content } = params;
      const serverId = channelToServer.get(channel_id);
      if (!serverId) return { error: 'Channel not found' };
      if (!hasServerAccess(ctx.tokenData, serverId)) return { error: 'No access to this server' };

      const perms = getUserPerms(ctx.tokenData.accountId, serverId, channel_id);
      if (!perms.sendMessages) return { error: 'Missing sendMessages permission' };

      const account = await db.getAccountById(ctx.tokenData.accountId);
      if (String(content).length > 2000) {
        return { error: `Thread content exceeds 2000 character limit (${String(content).length} chars)` };
      }
      const threadContent = String(content);

      const threadMsg = await db.saveThreadMessage({
        parentMessageId: message_id, channelId: channel_id,
        authorId: ctx.tokenData.accountId, content: threadContent
      });

      ctx.io.to(`text:${channel_id}`).emit('thread:new-reply', {
        parentMessageId: message_id, channelId: channel_id,
        reply: {
          id: threadMsg.id, content: threadContent,
          author: { id: account.id, username: account.username, avatar: account.avatar, color: account.color },
          timestamp: Date.now()
        }
      });

      return { content: [{ type: 'text', text: JSON.stringify({ threadReplyId: threadMsg.id }) }] };
    }
  },

  // ── Audit Log ─────────────────────────────────────────────────────────────
  {
    name: 'get_audit_log',
    description: 'Retrieve the audit log for a server.',
    inputSchema: {
      type: 'object',
      properties: {
        server_id: { type: 'string', description: 'The server ID' },
        limit: { type: 'number', description: 'Max entries (default 50)' }
      },
      required: ['server_id']
    },
    scope: 'manage',
    handler: async (params, ctx) => {
      const { server_id, limit = 50 } = params;
      if (!hasServerAccess(ctx.tokenData, server_id)) return { error: 'No access to this server' };

      const perms = getUserPerms(ctx.tokenData.accountId, server_id);
      if (!perms.manageServer && !perms.admin) return { error: 'Missing manageServer permission' };

      const logs = await db.getAuditLogs(server_id, Math.min(limit, 100));

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ serverId: server_id, entries: logs })
        }]
      };
    }
  },

  // ── AutoMod ───────────────────────────────────────────────────────────────
  {
    name: 'create_automod_rule',
    description: 'Create an AutoMod content filtering rule.',
    inputSchema: {
      type: 'object',
      properties: {
        server_id: { type: 'string', description: 'The server ID' },
        name: { type: 'string', description: 'Rule name' },
        type: { type: 'string', enum: ['keyword', 'spam', 'invite_link', 'mention_spam'], description: 'Rule type' },
        config: { type: 'object', description: 'Rule configuration (keywords, threshold, etc.)' },
        action: { type: 'string', enum: ['warn', 'delete', 'timeout', 'ban'], description: 'Action on trigger' }
      },
      required: ['server_id', 'name', 'type', 'action']
    },
    scope: 'manage',
    handler: async (params, ctx) => {
      const { server_id, name, type, config, action } = params;
      if (!hasServerAccess(ctx.tokenData, server_id)) return { error: 'No access to this server' };

      const perms = getUserPerms(ctx.tokenData.accountId, server_id);
      if (!perms.manageServer) return { error: 'Missing manageServer permission' };

      const rule = await db.createAutomodRule({
        serverId: server_id, name, type,
        config: config || {}, action,
        createdBy: ctx.tokenData.accountId
      });

      // Update in-memory
      const srv = state.servers[server_id];
      if (srv) {
        if (!srv.automodRules) srv.automodRules = [];
        srv.automodRules.push(rule);
      }

      return { content: [{ type: 'text', text: JSON.stringify({ created: true, ruleId: rule.id }) }] };
    }
  }
];

/**
 * Get all tool definitions (for MCP tools/list)
 */
function getToolDefinitions() {
  return tools.map(t => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema
  }));
}

/**
 * Execute a tool by name
 */
async function executeTool(name, params, context) {
  const tool = tools.find(t => t.name === name);
  if (!tool) {
    return { error: `Unknown tool: ${name}` };
  }

  // Check scope
  if (!hasScope(context.tokenData, tool.scope)) {
    return { error: `Missing required scope: ${tool.scope}` };
  }

  try {
    const result = await tool.handler(params, context);
    if (result.error) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: result.error }) }], isError: true };
    }
    return result;
  } catch (err) {
    console.error(`[MCP] Tool execution error (${name}):`, err.message);
    return { content: [{ type: 'text', text: JSON.stringify({ error: 'Internal tool execution error' }) }], isError: true };
  }
}

module.exports = {
  tools,
  getToolDefinitions,
  executeTool,
};

/**
 * Bot & MCP Socket.IO handler — manages bot accounts, bot tokens,
 * MCP connections, and agent configurations via socket events.
 */

const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { state } = require('../state');
const { getUserPerms, serializeServer } = require('../helpers');
const { createBotToken, getBotTokens, deleteBotToken, VALID_SCOPES } = require('../mcp/auth');
const { hashPassword } = require('../utils');

module.exports = function(io, socket) {

  // ─── Bot Token Management ──────────────────────────────────────────────

  socket.on('mcp:token:create', async ({ name, scopes, serverIds, expiresInDays }) => {
    const user = state.users[socket.id];
    if (!user || user.isGuest) return socket.emit('error', { message: 'Authentication required' });

    if (!name || typeof name !== 'string') {
      return socket.emit('error', { message: 'Token name is required' });
    }

    try {
      const token = await createBotToken({
        accountId: user.id,
        name: String(name).slice(0, 64),
        scopes: Array.isArray(scopes) ? scopes.filter(s => VALID_SCOPES.includes(s)) : ['read', 'write'],
        serverIds: Array.isArray(serverIds) ? serverIds : [],
        expiresInDays: expiresInDays || null
      });

      socket.emit('mcp:token:created', { token });
      console.log(`[MCP] ${user.username} created bot token "${name}"`);
    } catch (err) {
      console.error('[MCP] Token creation error:', err.message);
      socket.emit('error', { message: 'Failed to create token' });
    }
  });

  socket.on('mcp:token:list', async () => {
    const user = state.users[socket.id];
    if (!user || user.isGuest) return;

    try {
      const tokens = await getBotTokens(user.id);
      socket.emit('mcp:token:list', { tokens });
    } catch (err) {
      socket.emit('error', { message: 'Failed to list tokens' });
    }
  });

  socket.on('mcp:token:delete', async ({ tokenId }) => {
    const user = state.users[socket.id];
    if (!user || user.isGuest) return;

    try {
      const deleted = await deleteBotToken(tokenId, user.id);
      if (deleted) {
        socket.emit('mcp:token:deleted', { tokenId });
        console.log(`[MCP] ${user.username} deleted bot token ${tokenId}`);
      } else {
        socket.emit('error', { message: 'Token not found' });
      }
    } catch (err) {
      socket.emit('error', { message: 'Failed to delete token' });
    }
  });

  // ─── Bot Account Management ────────────────────────────────────────────

  socket.on('mcp:bot:create', async ({ name, avatar, serverId }) => {
    const user = state.users[socket.id];
    if (!user || user.isGuest) return;

    // Must have manage server permission (or be owner) to create bots
    if (serverId) {
      const perms = getUserPerms(user.id, serverId);
      if (!perms.manageServer && !perms.admin) {
        return socket.emit('error', { message: 'Missing manageServer permission' });
      }
    }

    const botName = String(name || 'Bot').slice(0, 32);

    try {
      // Create bot account
      const dummyPassword = await hashPassword(uuidv4());
      const botAccount = await db.createAccount({
        username: `${botName} [BOT]`,
        passwordHash: dummyPassword,
        salt: 'bcrypt',
        avatar: avatar || '🤖',
        color: '#60A5FA'
      });

      // Mark as bot
      await db.query(
        'UPDATE accounts SET is_bot = true, bot_owner_id = $1, bot_description = $2 WHERE id = $3',
        [user.id, `Bot created by ${user.username}`, botAccount.id]
      );

      // Create a bot token automatically
      const token = await createBotToken({
        accountId: botAccount.id,
        name: `${botName} default token`,
        scopes: ['read', 'write'],
        serverIds: serverId ? [serverId] : []
      });

      // Add bot to server if specified
      if (serverId) {
        const srv = state.servers[serverId];
        if (srv) {
          srv.members[botAccount.id] = {
            roles: ['everyone'],
            joinedAt: Date.now(),
            username: botAccount.username,
            avatar: botAccount.avatar,
            color: botAccount.color
          };
          await db.addServerMember(serverId, botAccount.id, ['everyone']);
        }
      }

      socket.emit('mcp:bot:created', {
        bot: {
          id: botAccount.id,
          username: botAccount.username,
          avatar: botAccount.avatar,
          color: botAccount.color,
          isBot: true,
          ownerId: user.id
        },
        token: token.token,
        tokenId: token.id
      });

      console.log(`[MCP] ${user.username} created bot "${botName}" (${botAccount.id})`);
    } catch (err) {
      console.error('[MCP] Bot creation error:', err.message);
      socket.emit('error', { message: 'Failed to create bot' });
    }
  });

  socket.on('mcp:bot:list', async ({ serverId }) => {
    const user = state.users[socket.id];
    if (!user) return;

    try {
      let result;
      if (serverId) {
        // List bots in a specific server
        result = await db.query(
          `SELECT a.id, a.username, a.avatar, a.color, a.custom_avatar, a.bot_owner_id, a.bot_description
           FROM accounts a
           JOIN server_members sm ON a.id = sm.account_id
           WHERE a.is_bot = true AND sm.server_id = $1
           ORDER BY a.username`,
          [serverId]
        );
      } else {
        // List bots owned by this user
        result = await db.query(
          `SELECT id, username, avatar, color, custom_avatar, bot_description
           FROM accounts WHERE is_bot = true AND bot_owner_id = $1
           ORDER BY username`,
          [user.id]
        );
      }

      socket.emit('mcp:bot:list', {
        bots: result.rows.map(b => ({
          id: b.id, username: b.username, avatar: b.avatar,
          color: b.color, customAvatar: b.custom_avatar,
          description: b.bot_description || '', ownerId: b.bot_owner_id
        }))
      });
    } catch (err) {
      socket.emit('error', { message: 'Failed to list bots' });
    }
  });

  socket.on('mcp:bot:delete', async ({ botId }) => {
    const user = state.users[socket.id];
    if (!user) return;

    try {
      // Verify ownership
      const result = await db.query(
        'SELECT id, username FROM accounts WHERE id = $1 AND is_bot = true AND bot_owner_id = $2',
        [botId, user.id]
      );
      if (result.rows.length === 0) {
        return socket.emit('error', { message: 'Bot not found or not owned by you' });
      }

      await db.deleteAccount(botId);
      socket.emit('mcp:bot:deleted', { botId });
      console.log(`[MCP] ${user.username} deleted bot ${botId}`);
    } catch (err) {
      socket.emit('error', { message: 'Failed to delete bot' });
    }
  });

  // ─── MCP Connection Management ─────────────────────────────────────────

  socket.on('mcp:connection:create', async ({ serverId, channelId, name, serverUrl, transport, enabledTools }) => {
    const user = state.users[socket.id];
    if (!user) return;

    const perms = getUserPerms(user.id, serverId);
    if (!perms.manageServer && !perms.admin) {
      return socket.emit('error', { message: 'Missing manageServer permission' });
    }

    // Validate LAN mode — block external connections
    const srv = state.servers[serverId];
    if (srv?.lanMode) {
      return socket.emit('error', { message: 'External MCP connections are disabled in LAN mode' });
    }

    try {
      const result = await db.query(
        `INSERT INTO mcp_connections (server_id, channel_id, name, server_url, transport, enabled_tools, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, server_id, channel_id, name, server_url, transport, enabled_tools, enabled, created_at`,
        [serverId, channelId || null, String(name).slice(0, 128), serverUrl,
         transport || 'sse', JSON.stringify(enabledTools || []), user.id]
      );

      const connection = result.rows[0];
      socket.emit('mcp:connection:created', { connection });
      console.log(`[MCP] ${user.username} created MCP connection "${name}" for server ${serverId}`);
    } catch (err) {
      console.error('[MCP] Connection creation error:', err.message);
      socket.emit('error', { message: 'Failed to create MCP connection' });
    }
  });

  socket.on('mcp:connection:list', async ({ serverId }) => {
    const user = state.users[socket.id];
    if (!user) return;

    try {
      const result = await db.query(
        `SELECT id, server_id, channel_id, name, server_url, transport, enabled_tools, enabled, created_at
         FROM mcp_connections WHERE server_id = $1 ORDER BY created_at DESC`,
        [serverId]
      );

      socket.emit('mcp:connection:list', { connections: result.rows });
    } catch (err) {
      socket.emit('error', { message: 'Failed to list connections' });
    }
  });

  socket.on('mcp:connection:delete', async ({ serverId, connectionId }) => {
    const user = state.users[socket.id];
    if (!user) return;

    const perms = getUserPerms(user.id, serverId);
    if (!perms.manageServer && !perms.admin) {
      return socket.emit('error', { message: 'Missing manageServer permission' });
    }

    try {
      await db.query('DELETE FROM mcp_connections WHERE id = $1 AND server_id = $2', [connectionId, serverId]);
      socket.emit('mcp:connection:deleted', { connectionId });
      console.log(`[MCP] ${user.username} deleted MCP connection ${connectionId}`);
    } catch (err) {
      socket.emit('error', { message: 'Failed to delete connection' });
    }
  });

  socket.on('mcp:connection:toggle', async ({ serverId, connectionId, enabled }) => {
    const user = state.users[socket.id];
    if (!user) return;

    const perms = getUserPerms(user.id, serverId);
    if (!perms.manageServer && !perms.admin) {
      return socket.emit('error', { message: 'Missing manageServer permission' });
    }

    try {
      await db.query(
        'UPDATE mcp_connections SET enabled = $1, updated_at = NOW() WHERE id = $2 AND server_id = $3',
        [!!enabled, connectionId, serverId]
      );
      socket.emit('mcp:connection:toggled', { connectionId, enabled: !!enabled });
    } catch (err) {
      socket.emit('error', { message: 'Failed to toggle connection' });
    }
  });

  // ─── Agent Configuration ───────────────────────────────────────────────

  socket.on('mcp:agent:create', async ({ serverId, botAccountId, name, systemPrompt, triggerMode, triggerChannels, triggerKeywords, mcpConnectionId, maxResponseLength }) => {
    const user = state.users[socket.id];
    if (!user) return;

    const perms = getUserPerms(user.id, serverId);
    if (!perms.manageServer && !perms.admin) {
      return socket.emit('error', { message: 'Missing manageServer permission' });
    }

    try {
      const result = await db.query(
        `INSERT INTO agent_configs (server_id, bot_account_id, name, system_prompt, trigger_mode, trigger_channels, trigger_keywords, mcp_connection_id, max_response_length, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [serverId, botAccountId || null, String(name).slice(0, 64),
         systemPrompt || '', triggerMode || 'mention',
         JSON.stringify(triggerChannels || []),
         JSON.stringify(triggerKeywords || []),
         mcpConnectionId || null,
         maxResponseLength || 2000,
         user.id]
      );

      socket.emit('mcp:agent:created', { agent: result.rows[0] });
      console.log(`[MCP] ${user.username} created agent "${name}" for server ${serverId}`);
    } catch (err) {
      console.error('[MCP] Agent creation error:', err.message);
      socket.emit('error', { message: 'Failed to create agent' });
    }
  });

  socket.on('mcp:agent:list', async ({ serverId }) => {
    const user = state.users[socket.id];
    if (!user) return;

    try {
      const result = await db.query(
        `SELECT ac.*, a.username as bot_username, a.avatar as bot_avatar
         FROM agent_configs ac
         LEFT JOIN accounts a ON ac.bot_account_id = a.id
         WHERE ac.server_id = $1
         ORDER BY ac.created_at DESC`,
        [serverId]
      );

      socket.emit('mcp:agent:list', { agents: result.rows });
    } catch (err) {
      socket.emit('error', { message: 'Failed to list agents' });
    }
  });

  socket.on('mcp:agent:update', async ({ serverId, agentId, updates }) => {
    const user = state.users[socket.id];
    if (!user) return;

    const perms = getUserPerms(user.id, serverId);
    if (!perms.manageServer && !perms.admin) {
      return socket.emit('error', { message: 'Missing manageServer permission' });
    }

    const allowedFields = ['name', 'enabled', 'system_prompt', 'trigger_mode', 'trigger_channels', 'trigger_keywords', 'max_response_length'];
    const setClauses = [];
    const params = [];
    let paramIdx = 1;

    for (const [key, value] of Object.entries(updates || {})) {
      if (allowedFields.includes(key)) {
        setClauses.push(`${key} = $${paramIdx}`);
        params.push(typeof value === 'object' ? JSON.stringify(value) : value);
        paramIdx++;
      }
    }

    if (setClauses.length === 0) return socket.emit('error', { message: 'No valid fields to update' });

    setClauses.push(`updated_at = NOW()`);
    params.push(agentId, serverId);

    try {
      const result = await db.query(
        `UPDATE agent_configs SET ${setClauses.join(', ')} WHERE id = $${paramIdx} AND server_id = $${paramIdx + 1} RETURNING *`,
        params
      );

      if (result.rows.length === 0) return socket.emit('error', { message: 'Agent not found' });
      socket.emit('mcp:agent:updated', { agent: result.rows[0] });
    } catch (err) {
      socket.emit('error', { message: 'Failed to update agent' });
    }
  });

  socket.on('mcp:agent:delete', async ({ serverId, agentId }) => {
    const user = state.users[socket.id];
    if (!user) return;

    const perms = getUserPerms(user.id, serverId);
    if (!perms.manageServer && !perms.admin) {
      return socket.emit('error', { message: 'Missing manageServer permission' });
    }

    try {
      await db.query('DELETE FROM agent_configs WHERE id = $1 AND server_id = $2', [agentId, serverId]);
      socket.emit('mcp:agent:deleted', { agentId });
    } catch (err) {
      socket.emit('error', { message: 'Failed to delete agent' });
    }
  });

  // ─── Message Streaming (for AI agent responses) ────────────────────────

  socket.on('mcp:stream:start', async ({ channelId, messageId }) => {
    // Validate that the caller is a bot or has permission
    const user = state.users[socket.id];
    if (!user) return;

    // Create a placeholder message for streaming
    const msg = {
      id: messageId || uuidv4(),
      channelId,
      content: '',
      author: {
        id: user.id, username: user.username,
        avatar: user.avatar, customAvatar: user.customAvatar,
        color: user.color || '#60A5FA',
        isBot: true
      },
      timestamp: Date.now(),
      reactions: {},
      isStreaming: true,
      isBot: true
    };

    io.to(`text:${channelId}`).emit('message:stream-start', msg);
  });

  socket.on('mcp:stream:chunk', ({ channelId, messageId, content }) => {
    io.to(`text:${channelId}`).emit('message:stream-chunk', {
      messageId, channelId, content
    });
  });

  socket.on('mcp:stream:end', async ({ channelId, messageId, finalContent }) => {
    const user = state.users[socket.id];
    if (!user) return;

    const content = String(finalContent || '').slice(0, 2000);

    // Finalize the message
    io.to(`text:${channelId}`).emit('message:stream-end', {
      messageId, channelId, content
    });

    // Save to state and DB
    const msg = {
      id: messageId, channelId, content,
      author: {
        id: user.id, username: user.username,
        avatar: user.avatar, customAvatar: user.customAvatar,
        color: user.color, isBot: true
      },
      timestamp: Date.now(),
      reactions: {}, isBot: true
    };

    if (!state.messages[channelId]) state.messages[channelId] = [];
    state.messages[channelId].push(msg);
    if (state.messages[channelId].length > 500) {
      state.messages[channelId] = state.messages[channelId].slice(-500);
    }

    try {
      await db.saveMessage({
        id: messageId, channelId, authorId: user.id,
        content, attachments: [],
        isWebhook: true, webhookUsername: user.username,
        webhookAvatar: user.customAvatar || user.avatar,
        replyTo: null, mentions: {}, embeds: []
      });
    } catch (err) {
      console.error('[MCP] Error saving streamed message:', err.message);
    }
  });

};

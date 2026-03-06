const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const config = require('../config');
const { state, DEFAULT_SERVER_ID, getSocketIdForUser, isUserOnline, indexServerChannels, unindexServerChannels } = require('../state');
const { makeServer, serializeServer, getUserPerms, getUserHighestRolePosition, checkSocketRate, socketRateLimiters, getOnlineUsers } = require('../helpers');
const { getDefaultSounds } = require('../default-sounds');

module.exports = function(io, socket) {

  socket.on('server:create', async ({ name, icon, customIcon }) => {
    const user = state.users[socket.id];
    if (!user || user.isGuest) {
      return socket.emit('error', { message: 'Authentication required to create servers' });
    }
    if (!await checkSocketRate(socketRateLimiters.serverCreate, user.id, socket)) return;

    try {
      const serverId = uuidv4();
      const serverName = (name || 'New Server').slice(0, 32);

      // Build server structure in memory first (to get generated IDs)
      const srv = makeServer(serverId, serverName, icon || 'N', user.id, customIcon);
      srv.members[user.id] = { roles: ['everyone', 'admin'], joinedAt: Date.now(), username: user.username, avatar: user.avatar, customAvatar: user.customAvatar || null, color: user.color || '#3B82F6' };

      // Wrap all DB writes in a transaction
      const client = await db.getClient();
      try {
        await client.query('BEGIN');

        // Save server to database
        await client.query(
          'INSERT INTO servers (id, name, icon, custom_icon, owner_id, description) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
          [serverId, serverName, icon || 'N', customIcon || null, user.id, '']
        );

        // Add owner as member with admin role
        await client.query(
          'INSERT INTO server_members (server_id, account_id, roles) VALUES ($1, $2, $3) ON CONFLICT (server_id, account_id) DO UPDATE SET roles = $3 RETURNING *',
          [serverId, user.id, JSON.stringify(['everyone', 'admin'])]
        );

        // Persist default categories to database
        for (const [catId, cat] of Object.entries(srv.categories)) {
          await client.query(
            'INSERT INTO categories (id, server_id, name, position) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO UPDATE SET name = $3, position = $4',
            [catId, serverId, cat.name, cat.position]
          );
        }

        // Persist default channels to database
        for (const ch of [...srv.channels.text, ...srv.channels.voice]) {
          await client.query(
            'INSERT INTO channels (id, server_id, category_id, name, type, description, topic, position, is_private, nsfw, slow_mode, permission_overrides) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (id) DO UPDATE SET category_id=$3, name=$4, type=$5, description=$6, topic=$7, position=$8, is_private=$9, nsfw=$10, slow_mode=$11, permission_overrides=$12',
            [ch.id, serverId, ch.categoryId, ch.name, ch.type, ch.description || '', ch.topic || '', ch.position, ch.isPrivate || false, ch.nsfw || false, ch.slowMode || 0, JSON.stringify(ch.permissionOverrides || {})]
          );
        }

        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }

      // Update in-memory state only after commit
      state.servers[serverId] = srv;
      indexServerChannels(serverId, srv);

      // Initialize message stores and voice channels
      [...srv.channels.text, ...srv.channels.voice].forEach(ch => {
        state.messages[ch.id] = [];
        if (ch.type === 'voice') state.voiceChannels[ch.id] = { users:[], screenSharers:[] };
      });

      // Seed default soundboard clips (non-critical, outside transaction)
      srv.soundboard = [];
      const defaults = getDefaultSounds();
      for (const s of defaults) {
        try {
          const sound = await db.createSoundboardSound({
            serverId, name: s.name, emoji: s.emoji,
            originalAudio: s.originalAudio, trimmedAudio: s.trimmedAudio,
            trimStart: s.trimStart, trimEnd: s.trimEnd,
            duration: s.duration, volume: s.volume,
            isGlobal: s.isGlobal, createdBy: user.id
          });
          srv.soundboard.push({
            id: sound.id, name: sound.name, emoji: sound.emoji,
            trim_start: sound.trim_start, trim_end: sound.trim_end,
            duration: sound.duration, volume: sound.volume,
            is_global: sound.is_global, created_by: sound.created_by
          });
        } catch (err) {
          console.error(`[Soundboard] Failed to seed "${s.name}":`, err.message);
        }
      }

      socket.emit('server:created', { server: serializeServer(serverId) });
      console.log(`[Server] ${user.username} created server: ${serverName} (${serverId})`);
    } catch (error) {
      console.error('[Server] Error creating server:', error);
      socket.emit('error', { message: 'Failed to create server' });
    }
  });

  socket.on('server:update', async ({ serverId, name, icon, description, customIcon, emojiSharing, iceConfig, lanMode }) => {
    const user = state.users[socket.id];
    if (!user) return;
    const perms = getUserPerms(user.id, serverId);
    if (!perms.manageServer && !perms.admin) {
      return socket.emit('error', { message: 'No permission' });
    }

    const srv = state.servers[serverId];
    if (!srv) return;

    try {
      // Build update object for database
      const updates = {};
      if (name) {
        srv.name = String(name).slice(0, 32);
        updates.name = srv.name;
      }
      if (icon) {
        srv.icon = icon;
        updates.icon = icon;
      }
      if (description !== undefined) {
        srv.description = String(description).slice(0, 256);
        updates.description = srv.description;
      }
      if (customIcon !== undefined) {
        srv.customIcon = customIcon;
        updates.custom_icon = customIcon;
      }
      if (emojiSharing !== undefined) {
        srv.emojiSharing = !!emojiSharing;
        updates.emoji_sharing = srv.emojiSharing;
      }
      if (lanMode !== undefined) {
        srv.lanMode = !!lanMode;
        updates.lan_mode = srv.lanMode;
      }

      // ICE config — owner-only
      if (iceConfig !== undefined) {
        if (srv.ownerId !== user.id) {
          return socket.emit('error', { message: 'Only the server owner can configure STUN/TURN' });
        }

        if (iceConfig === null) {
          // Clear custom config — revert to instance defaults
          srv.iceConfig = null;
          updates.ice_config = null;
        } else {
          // Validate
          const stunPattern = /^(stun|stuns):/;
          const turnPattern = /^(turn|turns):/;

          if (iceConfig.stunUrls !== undefined) {
            if (!Array.isArray(iceConfig.stunUrls) || !iceConfig.stunUrls.every(u => typeof u === 'string' && stunPattern.test(u))) {
              return socket.emit('error', { message: 'Invalid STUN URLs — must start with stun: or stuns:' });
            }
          }
          if (iceConfig.turnUrl !== undefined && iceConfig.turnUrl !== '') {
            if (typeof iceConfig.turnUrl !== 'string' || !turnPattern.test(iceConfig.turnUrl)) {
              return socket.emit('error', { message: 'Invalid TURN URL — must start with turn: or turns:' });
            }
          }
          // Require a secret if setting a TURN URL and no existing secret is saved
          const existingSecret = srv.iceConfig?.turnSecret;
          if (iceConfig.turnUrl && !iceConfig.turnSecret && !existingSecret) {
            return socket.emit('error', { message: 'TURN shared secret is required when TURN URL is set' });
          }

          const validatedConfig = {};
          if (iceConfig.stunUrls?.length > 0) validatedConfig.stunUrls = iceConfig.stunUrls;
          if (iceConfig.turnUrl) validatedConfig.turnUrl = iceConfig.turnUrl;
          // Keep existing secret if not provided in this update
          if (iceConfig.turnSecret) {
            validatedConfig.turnSecret = iceConfig.turnSecret;
          } else if (existingSecret && iceConfig.turnUrl) {
            validatedConfig.turnSecret = existingSecret;
          }

          srv.iceConfig = Object.keys(validatedConfig).length > 0 ? validatedConfig : null;
          updates.ice_config = srv.iceConfig ? JSON.stringify(srv.iceConfig) : null;
        }
      }

      // Update in database
      if (Object.keys(updates).length > 0) {
        await db.updateServer(serverId, updates);
        console.log(`[Server] ${user.username} updated server: ${serverId}`);
      }

      // ICE config changes are NOT broadcast — only acknowledge to caller
      if (iceConfig !== undefined) {
        socket.emit('server:ice-config:updated', { serverId, success: true });
      }

      // Only broadcast server:updated if non-ICE fields changed
      const hasVisibleChanges = Object.keys(updates).some(k => k !== 'ice_config');
      if (hasVisibleChanges) {
        io.emit('server:updated', { server: serializeServer(serverId) });
      }
    } catch (error) {
      console.error('[Server] Error updating server:', error);
      socket.emit('error', { message: 'Failed to update server' });
    }
  });

  socket.on('server:leave', async ({ serverId }) => {
    const user = state.users[socket.id];
    if (!user || user.isGuest) {
      return socket.emit('error', { message: 'Authentication required' });
    }

    const srv = state.servers[serverId];
    if (!srv) return socket.emit('error', { message: 'Server not found' });

    // Can't leave if you're the owner
    if (srv.ownerId === user.id) {
      return socket.emit('error', { message: 'Owners cannot leave. Transfer ownership or delete the server instead.' });
    }

    try {
      // Remove from database
      await db.removeServerMember(serverId, user.id);

      // Remove from in-memory
      delete srv.members[user.id];

      socket.emit('server:left', { serverId });
      console.log(`[Server] ${user.username} left server: ${srv.name}`);

      // Notify other members
      io.to(serverId).emit('member:left', { serverId, userId: user.id });
    } catch (error) {
      console.error('[Server] Error leaving server:', error);
      socket.emit('error', { message: 'Failed to leave server' });
    }
  });

  socket.on('server:delete', async ({ serverId }) => {
    const user = state.users[socket.id];
    if (!user || user.isGuest) {
      return socket.emit('error', { message: 'Authentication required' });
    }

    const srv = state.servers[serverId];
    if (!srv) return socket.emit('error', { message: 'Server not found' });

    // Only owner can delete
    if (srv.ownerId !== user.id) {
      return socket.emit('error', { message: 'Only the server owner can delete the server' });
    }

    // Can't delete default server
    if (serverId === DEFAULT_SERVER_ID) {
      return socket.emit('error', { message: 'Cannot delete the default server' });
    }

    try {
      // Delete from database (cascades to members, channels, etc.)
      await db.deleteServer(serverId);

      // Remove from in-memory
      unindexServerChannels(serverId);
      delete state.servers[serverId];

      // Notify all users
      io.emit('server:deleted', { serverId });
      console.log(`[Server] ${user.username} deleted server: ${srv.name}`);
    } catch (error) {
      console.error('[Server] Error deleting server:', error);
      socket.emit('error', { message: 'Failed to delete server' });
    }
  });

  socket.on('server:transfer-ownership', async ({ serverId, newOwnerId }) => {
    const user = state.users[socket.id];
    if (!user || user.isGuest) {
      return socket.emit('error', { message: 'Authentication required' });
    }

    const srv = state.servers[serverId];
    if (!srv) return socket.emit('error', { message: 'Server not found' });

    // Only current owner can transfer
    if (srv.ownerId !== user.id) {
      return socket.emit('error', { message: 'Only the server owner can transfer ownership' });
    }

    // Can't transfer to guest
    if (newOwnerId.startsWith('guest:')) {
      return socket.emit('error', { message: 'Cannot transfer ownership to a guest user' });
    }

    // New owner must be a member
    if (!srv.members[newOwnerId]) {
      return socket.emit('error', { message: 'New owner must be a server member' });
    }

    try {
      // Update owner in database
      await db.updateServer(serverId, { owner_id: newOwnerId });

      // Update in-memory
      srv.ownerId = newOwnerId;

      // Ensure new owner has admin role
      if (!srv.members[newOwnerId].roles.includes('admin')) {
        srv.members[newOwnerId].roles.push('admin');
        await db.addServerMember(serverId, newOwnerId, srv.members[newOwnerId].roles);
      }

      // Notify all users
      io.emit('server:updated', { server: serializeServer(serverId) });
      socket.emit('ownership:transferred', { serverId, newOwnerId });
      console.log(`[Server] ${user.username} transferred ownership of ${srv.name} to ${newOwnerId}`);
    } catch (error) {
      console.error('[Server] Error transferring ownership:', error);
      socket.emit('error', { message: 'Failed to transfer ownership' });
    }
  });

  // ─── Server Moderation ────────────────────────────────────────────────────────
  socket.on('server:kick-user', async ({ serverId, userId }) => {
    const user = state.users[socket.id];
    if (!user || user.isGuest) {
      return socket.emit('error', { message: 'Authentication required' });
    }

    const srv = state.servers[serverId];
    if (!srv) return socket.emit('error', { message: 'Server not found' });

    // Check if user has admin permissions
    const perms = getUserPerms(user.id, serverId);
    if (!perms.admin) {
      return socket.emit('error', { message: 'Admin permission required to kick users' });
    }

    // Can't kick yourself
    if (userId === user.id) {
      return socket.emit('error', { message: 'You cannot kick yourself' });
    }

    // Can't kick the owner
    if (userId === srv.ownerId) {
      return socket.emit('error', { message: 'Cannot kick the server owner' });
    }

    try {
      const kickedUsername = srv.members[userId]?.username || 'Unknown';

      // Remove from database
      await db.removeServerMember(serverId, userId);

      // Remove from in-memory
      delete srv.members[userId];

      // Disconnect user from server's voice channels
      Object.keys(state.voiceChannels).forEach(channelId => {
        if (channelId.startsWith(serverId)) {
          state.voiceChannels[channelId].users = state.voiceChannels[channelId].users.filter(
            u => u.id !== userId
          );
        }
      });

      // Notify all users
      io.emit('server:updated', { server: serializeServer(serverId) });
      io.emit('user:kicked', { serverId, userId, username: kickedUsername, kickedBy: user.id });

      console.log(`[Moderation] ${user.username} kicked user ${userId} from ${srv.name}`);
      db.createAuditLog(serverId, 'member_kick', user.id, userId, { username: kickedUsername }).catch(() => {});
    } catch (error) {
      console.error('[Moderation] Error kicking user:', error);
      socket.emit('error', { message: 'Failed to kick user' });
    }
  });

  socket.on('server:ban-user', async ({ serverId, userId }) => {
    const user = state.users[socket.id];
    if (!user || user.isGuest) {
      return socket.emit('error', { message: 'Authentication required' });
    }

    const srv = state.servers[serverId];
    if (!srv) return socket.emit('error', { message: 'Server not found' });

    // Check if user has admin permissions
    const perms = getUserPerms(user.id, serverId);
    if (!perms.admin) {
      return socket.emit('error', { message: 'Admin permission required to ban users' });
    }

    // Can't ban yourself
    if (userId === user.id) {
      return socket.emit('error', { message: 'You cannot ban yourself' });
    }

    // Can't ban the owner
    if (userId === srv.ownerId) {
      return socket.emit('error', { message: 'Cannot ban the server owner' });
    }

    try {
      const bannedUsername = srv.members[userId]?.username || 'Unknown';

      // Add to bans table
      await db.banUser(serverId, userId, user.id, 'Banned by admin');

      // Remove from server (db.banUser already calls removeServerMember)

      // Remove from in-memory
      delete srv.members[userId];

      // Disconnect user from server's voice channels
      Object.keys(state.voiceChannels).forEach(channelId => {
        if (channelId.startsWith(serverId)) {
          state.voiceChannels[channelId].users = state.voiceChannels[channelId].users.filter(
            u => u.id !== userId
          );
        }
      });

      // Notify all users
      io.emit('server:updated', { server: serializeServer(serverId) });
      io.emit('user:banned', { serverId, userId, username: bannedUsername, bannedBy: user.id });

      console.log(`[Moderation] ${user.username} banned user ${userId} from ${srv.name}`);
      db.createAuditLog(serverId, 'member_ban', user.id, userId, { username: bannedUsername }).catch(() => {});
    } catch (error) {
      console.error('[Moderation] Error banning user:', error);
      socket.emit('error', { message: 'Failed to ban user' });
    }
  });

  socket.on('server:timeout-user', async ({ serverId, userId, duration }) => {
    const user = state.users[socket.id];
    if (!user || user.isGuest) {
      return socket.emit('error', { message: 'Authentication required' });
    }

    const srv = state.servers[serverId];
    if (!srv) return socket.emit('error', { message: 'Server not found' });

    // Check if user has admin permissions
    const perms = getUserPerms(user.id, serverId);
    if (!perms.admin) {
      return socket.emit('error', { message: 'Admin permission required to timeout users' });
    }

    // Can't timeout yourself
    if (userId === user.id) {
      return socket.emit('error', { message: 'You cannot timeout yourself' });
    }

    // Can't timeout the owner
    if (userId === srv.ownerId) {
      return socket.emit('error', { message: 'Cannot timeout the server owner' });
    }

    // Validate duration
    if (!duration || duration <= 0 || duration > 10080) { // Max 7 days
      return socket.emit('error', { message: 'Invalid timeout duration (must be 1-10080 minutes)' });
    }

    try {
      // Add to timeouts table
      await db.timeoutUser(serverId, userId, user.id, duration);

      // Notify all users
      io.emit('user:timedout', {
        serverId,
        userId,
        duration,
        expiresAt: new Date(Date.now() + duration * 60 * 1000),
        timedoutBy: user.id
      });

      console.log(`[Moderation] ${user.username} timed out user ${userId} in ${srv.name} for ${duration} minutes`);
      db.createAuditLog(serverId, 'member_timeout', user.id, userId, { duration }).catch(() => {});
    } catch (error) {
      console.error('[Moderation] Error timing out user:', error);
      socket.emit('error', { message: 'Failed to timeout user' });
    }
  });

};

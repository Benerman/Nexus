const db = require('../db');
const config = require('../config');
const { state, addUser, removeUser, getSocketIdForUser, isUserOnline } = require('../state');
const { serializeServer, getOnlineUsers, getVoiceChannelState, createPersonalServer, checkSocketRate, socketRateLimiters } = require('../helpers');
const utils = require('../utils');
const { hashPassword, hashPasswordLegacy, verifyPassword } = utils;

const DEFAULT_SERVER_ID = 'nexus-main';

module.exports = function(io, socket) {

  socket.on('join', async ({ token, username, serverId = DEFAULT_SERVER_ID }) => {
    try {
      let user;

      if (token) {
        // Authenticated user
        const accountId = await db.validateToken(token);
        if (!accountId) return socket.emit('error', { message: 'Invalid token' });

        const account = await db.getAccountById(accountId);
        if (!account) return socket.emit('error', { message: 'Account not found' });

        user = {
          id: account.id,
          socketId: socket.id,
          username: account.username,
          color: account.color,
          avatar: account.avatar,
          customAvatar: account.custom_avatar,
          status: account.status,
          bio: account.bio,
          settings: account.settings || {},
          isGuest: false,
          isPlatformAdmin: config.admin.platformAdminUsername &&
            account.username.toLowerCase() === config.admin.platformAdminUsername.toLowerCase(),
          joinedAt: Date.now()
        };
      } else {
        // Guest mode disabled - require authentication
        return socket.emit('error', { message: 'Authentication required. Please log in or create an account.' });
      }

      addUser(socket.id, user);

      // Load intro/exit sounds for voice cues
      try {
        const sounds = await db.getAccountSounds(user.id);
        if (sounds) {
          state.users[socket.id].introSound = sounds.intro_sound || null;
          state.users[socket.id].exitSound = sounds.exit_sound || null;
          state.users[socket.id].introSoundVolume = sounds.intro_sound_volume ?? 100;
          state.users[socket.id].exitSoundVolume = sounds.exit_sound_volume ?? 100;
        }
      } catch (err) {
        console.warn('[Sounds] Failed to load user sounds:', err.message);
      }

      // Update profile data for servers the user is already a member of
      Object.values(state.servers).forEach(s => {
        if (s.isPersonal || s.id.startsWith('personal:')) return;
        if (s.members[user.id]) {
          s.members[user.id].username = user.username;
          s.members[user.id].avatar = user.avatar;
          s.members[user.id].customAvatar = user.customAvatar || null;
          s.members[user.id].color = user.color || '#3B82F6';
        }
      });

      // Create Personal server with user's DM channels
      const dmChannels = await db.getDMChannelsForUser(user.id);
      const personalServer = await createPersonalServer(user.id, dmChannels);

      // Get regular servers where user is a member (excluding Personal)
      const regularServers = Object.values(state.servers)
        .filter(s => !s.isPersonal && !s.id.startsWith('personal:') && s.members[user.id])
        .map(s => serializeServer(s.id));

      // Combine: Personal server first, then regular servers
      const allServers = [personalServer, ...regularServers];

      // If user has regular servers, use the first one as active; otherwise use personal server
      const activeServer = regularServers.length > 0 ? regularServers[0] : personalServer;

      socket.emit('init', {
        user,
        serverId: activeServer.id,
        server: activeServer,
        servers: allServers,
        onlineUsers: getOnlineUsers(),
        voiceChannels: regularServers.length > 0 ? getVoiceChannelState(activeServer.id) : {}
      });

      socket.broadcast.emit('user:joined', { user, onlineUsers: getOnlineUsers() });

      // Broadcast updated server data for all servers this user is a member of
      // so other clients see the new/updated member in their member lists
      Object.entries(state.servers).forEach(([srvId, srvData]) => {
        if (!srvData.isPersonal && !srvId.startsWith('personal:') && srvData.members[user.id]) {
          socket.broadcast.emit('server:updated', { server: serializeServer(srvId) });
        }
      });

      console.log(`[~] ${user.username} joined`);
    } catch (error) {
      console.error('[Socket] Join error:', error);
      socket.emit('error', { message: 'Failed to join server' });
    }
  });

  // ─── Data Refresh (for visibility change / reconnection) ─────────────────────
  socket.on('data:refresh', async () => {
    const user = state.users[socket.id];
    if (!user) return;

    try {
      // Rebuild DM channels
      const dmChannels = await db.getDMChannelsForUser(user.id);
      const personalServer = await createPersonalServer(user.id, dmChannels);

      // Get regular servers where user is a member
      const regularServers = Object.values(state.servers)
        .filter(s => !s.isPersonal && !s.id.startsWith('personal:') && s.members[user.id])
        .map(s => serializeServer(s.id));

      const allServers = [personalServer, ...regularServers];

      // Collect voice state for all servers user is a member of
      const allVoiceChannels = {};
      regularServers.forEach(srv => {
        Object.assign(allVoiceChannels, getVoiceChannelState(srv.id));
      });

      socket.emit('data:refreshed', {
        user,
        servers: allServers,
        onlineUsers: getOnlineUsers(),
        voiceChannels: allVoiceChannels
      });

      console.log(`[~] ${user.username} refreshed data`);
    } catch (error) {
      console.error('[Socket] Data refresh error:', error);
    }
  });

  socket.on('user:update', ({ username, avatar, color, status, bio, customAvatar }) => {
    const user = state.users[socket.id];
    if (!user) return;

    // Sanitize username
    if (username) {
      const usernameRegex = /^[a-zA-Z0-9 _\-\.!@#$%^&*()+=]{1,32}$/;
      if (!usernameRegex.test(String(username))) return socket.emit('error', { message: 'Username can only contain letters, numbers, spaces, and standard special characters' });
    }

    // Update session
    if (username) user.username = String(username).slice(0, 32);
    if (avatar) user.avatar = avatar;
    if (color) user.color = color;
    if (status) user.status = status;
    if (bio !== undefined) user.bio = String(bio).slice(0, 128);
    if (customAvatar !== undefined) user.customAvatar = customAvatar;

    // Update account
    for (const acc of Object.values(state.accounts)) {
      if (acc.id === user.id) {
        if (username) acc.username = user.username;
        if (avatar) acc.avatar = user.avatar;
        if (color) acc.color = user.color;
        if (status) acc.status = user.status;
        if (bio !== undefined) acc.bio = user.bio;
        if (customAvatar !== undefined) acc.customAvatar = user.customAvatar;
        break;
      }
    }

    // Update profile in all servers the user is a member of
    for (const srv of Object.values(state.servers)) {
      if (srv.members[user.id]) {
        srv.members[user.id].username = user.username;
        srv.members[user.id].avatar = user.avatar;
        srv.members[user.id].customAvatar = user.customAvatar || null;
        srv.members[user.id].color = user.color || '#3B82F6';
      }
    }

    // Persist profile changes to database
    const dbUpdates = {};
    if (username) dbUpdates.username = user.username;
    if (avatar) dbUpdates.avatar = user.avatar;
    if (color) dbUpdates.color = user.color;
    if (status) dbUpdates.status = user.status;
    if (bio !== undefined) dbUpdates.bio = user.bio;
    if (Object.keys(dbUpdates).length > 0) {
      db.updateAccount(user.id, dbUpdates).catch(err => {
        console.error('[User] Failed to persist profile update:', err.message);
      });
    }

    io.emit('user:updated', { user, onlineUsers: getOnlineUsers() });
  });

  // ─── User settings sync ──────────────────────────────────────────────────────
  socket.on('user:settings-update', async ({ settings }, callback) => {
    const user = state.users[socket.id];
    if (!user || user.isGuest) {
      if (callback) callback({ success: false, error: 'Authentication required' });
      return;
    }

    try {
      const updated = await db.updateUserSettings(user.id, settings);
      if (callback) callback({ success: true, settings: updated });
    } catch (err) {
      console.error('[User] Failed to save settings:', err.message);
      if (callback) callback({ success: false, error: 'Failed to save settings' });
    }
  });

  // ─── User voice sounds ────────────────────────────────────────────────────────
  socket.on('user:get-sounds', async (callback) => {
    const user = state.users[socket.id];
    if (!user || user.isGuest) {
      if (typeof callback === 'function') callback({ error: 'Authentication required' });
      return;
    }
    try {
      const sounds = await db.getAccountSounds(user.id);
      if (typeof callback === 'function') callback({ sounds: sounds || {} });
    } catch (err) {
      console.error('[Sounds] Failed to get sounds:', err.message);
      if (typeof callback === 'function') callback({ error: 'Failed to load sounds' });
    }
  });

  socket.on('user:update-sounds', async (data, callback) => {
    const user = state.users[socket.id];
    if (!user || user.isGuest) {
      if (typeof callback === 'function') callback({ error: 'Authentication required' });
      return;
    }
    try {
      const updates = {};
      if (data.introSound !== undefined) updates.intro_sound = data.introSound;
      if (data.exitSound !== undefined) updates.exit_sound = data.exitSound;
      if (data.introSoundOriginal !== undefined) updates.intro_sound_original = data.introSoundOriginal;
      if (data.exitSoundOriginal !== undefined) updates.exit_sound_original = data.exitSoundOriginal;
      if (data.introSoundTrimStart !== undefined) updates.intro_sound_trim_start = data.introSoundTrimStart;
      if (data.introSoundTrimEnd !== undefined) updates.intro_sound_trim_end = data.introSoundTrimEnd;
      if (data.introSoundDuration !== undefined) updates.intro_sound_duration = data.introSoundDuration;
      if (data.exitSoundTrimStart !== undefined) updates.exit_sound_trim_start = data.exitSoundTrimStart;
      if (data.exitSoundTrimEnd !== undefined) updates.exit_sound_trim_end = data.exitSoundTrimEnd;
      if (data.exitSoundDuration !== undefined) updates.exit_sound_duration = data.exitSoundDuration;
      if (data.introSoundVolume !== undefined) updates.intro_sound_volume = data.introSoundVolume;
      if (data.exitSoundVolume !== undefined) updates.exit_sound_volume = data.exitSoundVolume;

      await db.updateAccount(user.id, updates);

      // Update in-memory cache
      if (updates.intro_sound !== undefined) state.users[socket.id].introSound = updates.intro_sound;
      if (updates.exit_sound !== undefined) state.users[socket.id].exitSound = updates.exit_sound;
      if (updates.intro_sound_volume !== undefined) state.users[socket.id].introSoundVolume = updates.intro_sound_volume;
      if (updates.exit_sound_volume !== undefined) state.users[socket.id].exitSoundVolume = updates.exit_sound_volume;

      if (typeof callback === 'function') callback({ success: true });
    } catch (err) {
      console.error('[Sounds] Failed to update sounds:', err.message);
      if (typeof callback === 'function') callback({ error: 'Failed to save sounds' });
    }
  });

  // ─── User search (for New Message flow) ──────────────────────────────────────
  socket.on('user:search', async ({ query }, callback) => {
    const user = state.users[socket.id];
    if (!user || user.isGuest) {
      if (typeof callback === 'function') callback({ error: 'Authentication required' });
      return;
    }
    if (!query || typeof query !== 'string' || !query.trim()) {
      if (typeof callback === 'function') callback({ users: [] });
      return;
    }
    try {
      const results = await db.searchAccountsByUsername(query.trim(), 20);
      const filtered = results.filter(a => a.id !== user.id);
      if (typeof callback === 'function') callback({ users: filtered });
    } catch (err) {
      console.error('[User] Search error:', err.message);
      if (typeof callback === 'function') callback({ error: 'Search failed' });
    }
  });

  socket.on('user:change-password', async ({ currentPassword, newPassword }) => {
    const user = state.users[socket.id];
    if (!user || user.isGuest) {
      return socket.emit('user:password-changed', { success: false, error: 'Authentication required' });
    }
    if (!currentPassword || !newPassword) {
      return socket.emit('user:password-changed', { success: false, error: 'Both current and new password are required' });
    }
    if (newPassword.length < 8) {
      return socket.emit('user:password-changed', { success: false, error: 'New password must be at least 8 characters' });
    }
    try {
      const account = await db.getAccountByUsername(user.username);
      if (!account) {
        return socket.emit('user:password-changed', { success: false, error: 'Account not found' });
      }
      // Verify current password (supports both bcrypt and legacy)
      let passwordValid = false;
      if (account.password_hash.startsWith('$2b$')) {
        passwordValid = await verifyPassword(currentPassword, account.password_hash);
      } else {
        passwordValid = account.password_hash === hashPasswordLegacy(currentPassword, account.salt);
      }
      if (!passwordValid) {
        return socket.emit('user:password-changed', { success: false, error: 'Current password is incorrect' });
      }
      const newHash = await hashPassword(newPassword);
      await db.updateAccountPassword(account.id, newHash, 'bcrypt');
      socket.emit('user:password-changed', { success: true });
    } catch (error) {
      console.error('[Auth] Password change error:', error);
      socket.emit('user:password-changed', { success: false, error: 'Failed to change password' });
    }
  });

};

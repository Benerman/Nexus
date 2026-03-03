const db = require('../db');
const { state, getSocketIdForUser, isUserOnline } = require('../state');
const { getUserPerms, buildIceServers, leaveVoice, soundboardLimiter, serializeServer } = require('../helpers');

module.exports = function(io, socket) {

  // ─── Soundboard ─────────────────────────────────────────────────────────────
  socket.on('soundboard:get-sounds', async ({ serverId }, callback) => {
    const user = state.users[socket.id];
    if (!user) return;
    const srv = state.servers[serverId];
    if (!srv || !srv.members[user.id]) return;
    try {
      const sounds = await db.getSoundboardSoundsWithAudio(serverId);
      if (typeof callback === 'function') callback({ sounds });
    } catch (err) {
      console.error('[Soundboard] Failed to get sounds:', err.message);
      if (typeof callback === 'function') callback({ error: 'Failed to load sounds' });
    }
  });

  socket.on('soundboard:upload', async ({ serverId, name, emoji, originalAudio, trimmedAudio, trimStart, trimEnd, duration, volume, isGlobal }, callback) => {
    const user = state.users[socket.id];
    if (!user) return;
    const perms = getUserPerms(user.id, serverId);
    if (!perms.manageServer && !perms.admin) return socket.emit('error', { message: 'No permission' });
    const srv = state.servers[serverId];
    if (!srv) return;
    if (duration > 8) return socket.emit('error', { message: 'Sound must be 8 seconds or less' });
    if (!name || !trimmedAudio) return socket.emit('error', { message: 'Name and audio are required' });

    const audioBase64 = trimmedAudio.split(',')[1] || trimmedAudio;
    const audioBytes = Math.ceil(audioBase64.length * 3 / 4);
    if (audioBytes > 5 * 1024 * 1024) return socket.emit('error', { message: 'Audio too large (max 5MB)' });
    if (originalAudio) {
      const origBase64 = originalAudio.split(',')[1] || originalAudio;
      const origBytes = Math.ceil(origBase64.length * 3 / 4);
      if (origBytes > 10 * 1024 * 1024) return socket.emit('error', { message: 'Original audio too large (max 10MB)' });
    }

    try {
      const sound = await db.createSoundboardSound({
        serverId,
        name: name.slice(0, 32),
        emoji: emoji || '🔊',
        originalAudio,
        trimmedAudio,
        trimStart: trimStart || 0,
        trimEnd: trimEnd || 0,
        duration: duration || 0,
        volume: Math.max(0, Math.min(2, volume || 1.0)),
        isGlobal: isGlobal || false,
        createdBy: user.id
      });
      srv.soundboard = srv.soundboard || [];
      srv.soundboard.push({
        id: sound.id, name: sound.name, emoji: sound.emoji,
        trim_start: sound.trim_start, trim_end: sound.trim_end,
        duration: sound.duration, volume: sound.volume, is_global: sound.is_global, created_by: sound.created_by
      });
      io.emit('server:updated', { server: serializeServer(serverId) });
      if (typeof callback === 'function') callback({ sound: { id: sound.id, name: sound.name, emoji: sound.emoji } });
    } catch (err) {
      console.error('[Soundboard] Failed to upload sound:', err.message);
      if (typeof callback === 'function') callback({ error: 'Failed to upload sound' });
    }
  });

  socket.on('soundboard:update', async ({ serverId, soundId, name, emoji, trimmedAudio, trimStart, trimEnd, duration, volume, isGlobal }, callback) => {
    const user = state.users[socket.id];
    if (!user) return;
    const perms = getUserPerms(user.id, serverId);
    if (!perms.manageServer && !perms.admin) return socket.emit('error', { message: 'No permission' });
    const srv = state.servers[serverId];
    if (!srv) return;
    if (duration > 8) return socket.emit('error', { message: 'Sound must be 8 seconds or less' });

    try {
      const updates = {};
      if (name) updates.name = name.slice(0, 32);
      if (emoji) updates.emoji = emoji;
      if (trimmedAudio) updates.trimmedAudio = trimmedAudio;
      if (trimStart !== undefined) updates.trimStart = trimStart;
      if (trimEnd !== undefined) updates.trimEnd = trimEnd;
      if (duration !== undefined) updates.duration = duration;
      if (volume !== undefined) updates.volume = Math.max(0, Math.min(2, volume));
      if (isGlobal !== undefined) updates.isGlobal = isGlobal;

      const sound = await db.updateSoundboardSound(soundId, updates);
      if (!sound) return socket.emit('error', { message: 'Sound not found' });

      const idx = (srv.soundboard || []).findIndex(s => s.id === soundId);
      if (idx !== -1) {
        srv.soundboard[idx] = {
          id: sound.id, name: sound.name, emoji: sound.emoji,
          trim_start: sound.trim_start, trim_end: sound.trim_end,
          duration: sound.duration, volume: sound.volume, is_global: sound.is_global, created_by: sound.created_by
        };
      }
      io.emit('server:updated', { server: serializeServer(serverId) });
      if (typeof callback === 'function') callback({ success: true });
    } catch (err) {
      console.error('[Soundboard] Failed to update sound:', err.message);
      if (typeof callback === 'function') callback({ error: 'Failed to update sound' });
    }
  });

  socket.on('soundboard:delete', async ({ serverId, soundId }, callback) => {
    const user = state.users[socket.id];
    if (!user) return;
    const srv = state.servers[serverId];
    if (!srv) return;
    const perms = getUserPerms(user.id, serverId);
    const isUploader = (srv.soundboard || []).some(s => s.id === soundId && s.created_by === user.id);
    if (!perms.manageServer && !perms.admin && !isUploader) return socket.emit('error', { message: 'No permission' });

    try {
      await db.deleteSoundboardSound(soundId);
      srv.soundboard = (srv.soundboard || []).filter(s => s.id !== soundId);
      io.emit('server:updated', { server: serializeServer(serverId) });
      if (typeof callback === 'function') callback({ success: true });
    } catch (err) {
      console.error('[Soundboard] Failed to delete sound:', err.message);
      if (typeof callback === 'function') callback({ error: 'Failed to delete sound' });
    }
  });

  socket.on('soundboard:play', async ({ channelId, soundId }) => {
    const user = state.users[socket.id];
    if (!user) return;
    const ch = state.voiceChannels[channelId];
    if (!ch || !ch.users.includes(socket.id)) return;

    try {
      await soundboardLimiter.consume(user.id);
    } catch (e) {
      return socket.emit('error', { message: 'Soundboard rate limited. Slow down!' });
    }

    io.to(`voice:${channelId}`).emit('soundboard:played', {
      soundId,
      userId: user.id,
      username: user.username
    });
  });

  socket.on('soundboard:play-targeted', async ({ soundId, targetUserIds, serverId }) => {
    const user = state.users[socket.id];
    if (!user) return;
    const srv = state.servers[serverId];
    if (!srv || !srv.members[user.id]) return;

    const perms = getUserPerms(user.id, serverId);
    if (!perms.sendTargetedSounds && !perms.admin) {
      return socket.emit('error', { message: 'You do not have permission to send targeted sounds' });
    }

    try {
      await soundboardLimiter.consume(user.id);
    } catch (e) {
      return socket.emit('error', { message: 'Soundboard rate limited. Slow down!' });
    }

    const sound = (srv.soundboard || []).find(s => s.id === soundId);
    if (!sound) return;

    if (sound.is_global && (!targetUserIds || targetUserIds.length === 0)) {
      for (const [socketId, socketUser] of Object.entries(state.users)) {
        if (srv.members[socketUser.id]) {
          io.to(socketId).emit('soundboard:played', {
            soundId, userId: user.id, username: user.username, targeted: true
          });
        }
      }
      return;
    }

    if (targetUserIds && targetUserIds.length > 0) {
      for (const [socketId, socketUser] of Object.entries(state.users)) {
        if (targetUserIds.includes(socketUser.id) && srv.members[socketUser.id]) {
          io.to(socketId).emit('soundboard:played', {
            soundId, userId: user.id, username: user.username, targeted: true
          });
        }
      }
    }
  });

  socket.on('soundboard:get-sound', async ({ soundId }, callback) => {
    const user = state.users[socket.id];
    if (!user) return;
    try {
      const sound = await db.getSoundboardSound(soundId);
      if (typeof callback === 'function') callback({ sound });
    } catch (err) {
      if (typeof callback === 'function') callback({ error: 'Failed to load sound' });
    }
  });

  // ─── Message Link Preview ──────────────────────────────────────────────────
  socket.on('message:get-preview', async ({ serverId, channelId, messageId }, callback) => {
    const user = state.users[socket.id];
    if (!user || typeof callback !== 'function') return;

    const srv = state.servers[serverId];
    if (!srv) return callback({ error: 'Server not found' });

    const perms = getUserPerms(user.id, serverId, channelId);
    if (!perms.viewChannel && !perms.admin) return callback({ error: 'No permission' });

    const channelMsgs = state.messages[channelId] || [];
    let msg = channelMsgs.find(m => m.id === messageId);

    if (!msg) {
      try {
        const dbMsg = await db.getMessageById(messageId);
        if (dbMsg && dbMsg.channel_id === channelId) {
          msg = {
            content: dbMsg.content,
            author: { username: dbMsg.author_username || 'Unknown', avatar: dbMsg.author_avatar },
            timestamp: new Date(dbMsg.created_at).getTime()
          };
        }
      } catch (err) { /* ignore */ }
    }

    if (!msg) return callback({ error: 'Message not found' });

    const allChannels = [...(srv.channels?.text || []), ...(srv.channels?.voice || [])];
    const ch = allChannels.find(c => c.id === channelId);

    callback({
      content: (msg.content || '').slice(0, 200),
      author: { username: msg.author?.username || 'Unknown', avatar: msg.author?.avatar || msg.author?.customAvatar },
      timestamp: msg.timestamp,
      channelName: ch?.name || 'unknown',
      serverName: srv.name
    });
  });

  // ─── ICE config ─────────────────────────────────────────────────────────────
  socket.on('voice:ice-config', ({ serverId }, callback) => {
    const user = state.users[socket.id];
    if (!user) return callback?.({ error: 'Not authenticated' });
    const iceServers = buildIceServers(serverId, user.id);
    callback?.({ iceServers });
  });

  socket.on('server:get-ice-config', ({ serverId }, callback) => {
    const user = state.users[socket.id];
    if (!user) return callback?.({ error: 'Not authenticated' });
    const srv = state.servers[serverId];
    if (!srv) return callback?.({ error: 'Server not found' });
    if (srv.ownerId !== user.id) return callback?.({ error: 'Owner only' });
    const iceConfig = srv.iceConfig || null;
    callback?.({
      iceConfig: iceConfig ? {
        stunUrls: iceConfig.stunUrls || [],
        turnUrl: iceConfig.turnUrl || '',
        hasSecret: !!iceConfig.turnSecret
      } : null
    });
  });

  // ─── Voice ──────────────────────────────────────────────────────────────────
  socket.on('voice:join', ({ channelId }) => {
    const user = state.users[socket.id];
    if (!user) return;

    for (const [chId, chData] of Object.entries(state.voiceChannels)) {
      const idx = chData.users.indexOf(socket.id);
      if (idx !== -1) {
        chData.users.splice(idx, 1);
        const ssIdx2 = chData.screenSharers ? chData.screenSharers.indexOf(socket.id) : -1;
        if (ssIdx2 !== -1) { chData.screenSharers.splice(ssIdx2, 1); io.to(`voice:${chId}`).emit('screen:stopped', { socketId: socket.id }); }
        socket.leave(`voice:${chId}`);
        socket.to(`voice:${chId}`).emit('peer:left', { socketId: socket.id });
        io.emit('voice:channel:update', { channelId: chId, channel: { ...chData, users: chData.users.map(s=>state.users[s]).filter(Boolean) } });
        io.to(`voice:${chId}`).emit('voice:cue', { type: 'leave', user, customSound: user.exitSound || null, customSoundVolume: user.exitSoundVolume ?? 100 });
      }
    }

    const ch = state.voiceChannels[channelId];
    if (!ch) {
      socket.emit('voice:join-failed', { channelId });
      return;
    }
    if (ch.endTimer) {
      clearTimeout(ch.endTimer);
      delete ch.endTimer;
    }
    const existingPeers = [...ch.users];
    ch.users.push(socket.id);
    socket.join(`voice:${channelId}`);
    socket.emit('voice:joined', {
      channelId,
      peers: existingPeers.map(s => {
        const u = state.users[s];
        return u ? { socketId: s, user: u, isMuted: u.isMuted || false, isDeafened: u.isDeafened || false } : null;
      }).filter(Boolean),
      screenSharerId: ch.screenSharers?.[0] || null
    });
    socket.to(`voice:${channelId}`).emit('peer:joined', { socketId: socket.id, user });
    io.emit('voice:channel:update', { channelId, channel: { ...ch, users: ch.users.map(s=>state.users[s]).filter(Boolean) } });
    io.to(`voice:${channelId}`).emit('voice:cue', { type: 'join', user, customSound: user.introSound || null, customSoundVolume: user.introSoundVolume ?? 100 });
  });

  socket.on('voice:leave', () => leaveVoice(socket, io));

  socket.on('voice:mute', ({ isMuted, channelId }) => {
    const user = state.users[socket.id];
    if (!user) return;
    user.isMuted = isMuted;
    socket.to(`voice:${channelId}`).emit('peer:mute:changed', { socketId: socket.id, isMuted });
  });

  socket.on('voice:deafen', ({ isDeafened, channelId }) => {
    const user = state.users[socket.id];
    if (!user) return;
    user.isDeafened = isDeafened;
    socket.to(`voice:${channelId}`).emit('peer:deafen:changed', { socketId: socket.id, isDeafened });
  });

  // ─── WebRTC signaling ───────────────────────────────────────────────────────
  socket.on('webrtc:offer', ({ targetId, offer }) => {
    if (!state.users[socket.id]) return;
    io.to(targetId).emit('webrtc:offer', { from: socket.id, offer });
  });
  socket.on('webrtc:answer', ({ targetId, answer }) => {
    if (!state.users[socket.id]) return;
    io.to(targetId).emit('webrtc:answer', { from: socket.id, answer });
  });
  socket.on('webrtc:ice', ({ targetId, candidate }) => {
    if (!state.users[socket.id]) return;
    io.to(targetId).emit('webrtc:ice', { from: socket.id, candidate });
  });

  // ─── Screen Share ───────────────────────────────────────────────────────────
  socket.on('screen:start', ({ channelId }) => {
    const ch = state.voiceChannels[channelId];
    if (!ch) return;
    if (!ch.screenSharers.includes(socket.id)) ch.screenSharers.push(socket.id);
    io.to(`voice:${channelId}`).emit('screen:started', { socketId: socket.id });
    io.emit('voice:channel:update', { channelId, channel: { ...ch, users: ch.users.map(s=>state.users[s]).filter(Boolean) } });
  });

  socket.on('screen:stop', ({ channelId }) => {
    const ch = state.voiceChannels[channelId];
    if (!ch) return;
    const idx = ch.screenSharers.indexOf(socket.id);
    if (idx === -1) return;
    ch.screenSharers.splice(idx, 1);
    io.to(`voice:${channelId}`).emit('screen:stopped', { socketId: socket.id });
    io.emit('voice:channel:update', { channelId, channel: { ...ch, users: ch.users.map(s=>state.users[s]).filter(Boolean) } });
  });

  socket.on('screen:watch', ({ sharerId }) => {
    io.to(sharerId).emit('screen:add-viewer', { viewerId: socket.id });
  });

  socket.on('screen:unwatch', ({ sharerId }) => {
    io.to(sharerId).emit('screen:remove-viewer', { viewerId: socket.id });
  });

};

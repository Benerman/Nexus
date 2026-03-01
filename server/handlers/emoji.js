const db = require('../db');
const { state } = require('../state');
const { getUserPerms, serializeServer, checkSocketRate, socketRateLimiters } = require('../helpers');

module.exports = function(io, socket) {

  socket.on('emoji:get', async ({ serverId }, callback) => {
    const user = state.users[socket.id];
    if (!user) return callback?.({ error: 'Not authenticated' });
    const srv = state.servers[serverId];
    if (!srv || !srv.members[user.id]) return callback?.({ error: 'Server not found or access denied' });
    try {
      const emojis = await Promise.all(
        (srv.customEmojis || []).map(async (e) => {
          const full = await db.getCustomEmoji(e.id);
          return full ? { id: full.id, name: full.name, imageData: full.image_data, contentType: full.content_type, animated: full.animated } : null;
        })
      );
      if (typeof callback === 'function') callback({ emojis: emojis.filter(Boolean) });
    } catch (err) {
      if (typeof callback === 'function') callback({ error: 'Failed to load emojis' });
    }
  });

  socket.on('emoji:upload', async ({ serverId, name, imageData, contentType, animated }, callback) => {
    const user = state.users[socket.id];
    if (!user) return;
    if (!await checkSocketRate(socketRateLimiters.emojiUpload, user.id, socket)) return;
    const perms = getUserPerms(user.id, serverId);
    if (!perms.manageEmojis && !perms.admin) return socket.emit('error', { message: 'No permission to manage emojis' });
    const srv = state.servers[serverId];
    if (!srv) return;
    if (!name || !imageData) return socket.emit('error', { message: 'Name and image are required' });
    if (!/^[a-zA-Z0-9_]{2,32}$/.test(name)) return socket.emit('error', { message: 'Emoji name must be 2-32 alphanumeric characters or underscores' });
    if ((srv.customEmojis || []).length >= 50) return socket.emit('error', { message: 'Server emoji limit reached (50)' });
    const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
    if (!imageData.startsWith('data:image/') || !ALLOWED_MIME.some(m => imageData.startsWith(`data:${m}`))) {
      return socket.emit('error', { message: 'Only PNG, JPEG, GIF, and WebP images are allowed' });
    }
    const base64Data = imageData.split(',')[1] || '';
    const actualBytes = Math.ceil(base64Data.length * 3 / 4);
    if (actualBytes > 350000) return socket.emit('error', { message: 'Image too large (max 350KB)' });

    try {
      const emoji = await db.createCustomEmoji({ serverId, name: name.slice(0, 32), imageData, contentType: contentType || 'image/png', animated: animated || false, createdBy: user.id });
      srv.customEmojis = srv.customEmojis || [];
      srv.customEmojis.push({ id: emoji.id, name: emoji.name, content_type: emoji.content_type, animated: emoji.animated, created_by: emoji.created_by });
      io.emit('server:updated', { server: serializeServer(serverId) });
      if (typeof callback === 'function') callback({ emoji: { id: emoji.id, name: emoji.name } });
    } catch (err) {
      console.error('[Emoji] Upload failed:', err.message);
      if (typeof callback === 'function') callback({ error: 'Failed to upload emoji' });
    }
  });

  socket.on('emoji:update', async ({ serverId, emojiId, name }, callback) => {
    const user = state.users[socket.id];
    if (!user) return;
    const perms = getUserPerms(user.id, serverId);
    if (!perms.manageEmojis && !perms.admin) return socket.emit('error', { message: 'No permission' });
    if (!name || !/^[a-zA-Z0-9_]{2,32}$/.test(name)) return socket.emit('error', { message: 'Invalid emoji name' });

    try {
      const emoji = await db.updateCustomEmoji(emojiId, { name: name.slice(0, 32) });
      if (!emoji) return socket.emit('error', { message: 'Emoji not found' });
      const srv = state.servers[serverId];
      if (srv) {
        const idx = (srv.customEmojis || []).findIndex(e => e.id === emojiId);
        if (idx !== -1) srv.customEmojis[idx].name = emoji.name;
        io.emit('server:updated', { server: serializeServer(serverId) });
      }
      if (typeof callback === 'function') callback({ success: true });
    } catch (err) {
      if (typeof callback === 'function') callback({ error: 'Failed to update emoji' });
    }
  });

  socket.on('emoji:delete', async ({ serverId, emojiId }, callback) => {
    const user = state.users[socket.id];
    if (!user) return;
    const perms = getUserPerms(user.id, serverId);
    if (!perms.manageEmojis && !perms.admin) return socket.emit('error', { message: 'No permission' });

    try {
      await db.deleteCustomEmoji(emojiId);
      const srv = state.servers[serverId];
      if (srv) {
        srv.customEmojis = (srv.customEmojis || []).filter(e => e.id !== emojiId);
        io.emit('server:updated', { server: serializeServer(serverId) });
      }
      if (typeof callback === 'function') callback({ success: true });
    } catch (err) {
      if (typeof callback === 'function') callback({ error: 'Failed to delete emoji' });
    }
  });

  socket.on('emoji:get-image', async ({ emojiId, serverId }, callback) => {
    const user = state.users[socket.id];
    if (!user) return callback?.({ error: 'Not authenticated' });
    if (serverId) {
      const srv = state.servers[serverId];
      if (srv && !srv.members[user.id]) return callback?.({ error: 'Access denied' });
    }
    try {
      const emoji = await db.getCustomEmoji(emojiId);
      if (!emoji) return callback?.({ error: 'Not found' });
      callback?.({ imageData: emoji.image_data, contentType: emoji.content_type });
    } catch (err) {
      callback?.({ error: 'Failed to load emoji image' });
    }
  });

};

const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { state } = require('../state');
const { serializeServer, findServerByChannelId, getUserPerms, checkSocketRate, socketRateLimiters } = require('../helpers');
const utils = require('../utils');

module.exports = function(io, socket) {

  // ─── Moderation: Bans, Timeouts, Reports ────────────────────────────────────

  socket.on('moderation:get-bans', async ({ serverId }, callback) => {
    const user = state.users[socket.id];
    if (!user || user.isGuest) return;
    const srv = state.servers[serverId];
    if (!srv) return;
    const perms = getUserPerms(user.id, serverId);
    if (!perms.admin) {
      if (typeof callback === 'function') callback({ error: 'Admin permission required' });
      return;
    }
    try {
      const bans = await db.getServerBans(serverId);
      if (typeof callback === 'function') callback({ bans });
    } catch (error) {
      console.error('[Moderation] Error fetching bans:', error);
      if (typeof callback === 'function') callback({ error: 'Failed to fetch bans' });
    }
  });

  socket.on('server:unban-user', async ({ serverId, userId }, callback) => {
    const user = state.users[socket.id];
    if (!user || user.isGuest) {
      if (typeof callback === 'function') callback({ error: 'Authentication required' });
      return;
    }
    const srv = state.servers[serverId];
    if (!srv) {
      if (typeof callback === 'function') callback({ error: 'Server not found' });
      return;
    }
    const perms = getUserPerms(user.id, serverId);
    if (!perms.admin) {
      if (typeof callback === 'function') callback({ error: 'Admin permission required' });
      return;
    }
    try {
      await db.unbanUser(serverId, userId);
      console.log(`[Moderation] ${user.username} unbanned user ${userId} from ${srv.name}`);
      if (typeof callback === 'function') callback({ success: true });
    } catch (error) {
      console.error('[Moderation] Error unbanning user:', error);
      if (typeof callback === 'function') callback({ error: 'Failed to unban user' });
    }
  });

  socket.on('moderation:get-timeouts', async ({ serverId }, callback) => {
    const user = state.users[socket.id];
    if (!user || user.isGuest) return;
    const srv = state.servers[serverId];
    if (!srv) return;
    const perms = getUserPerms(user.id, serverId);
    if (!perms.admin) {
      if (typeof callback === 'function') callback({ error: 'Admin permission required' });
      return;
    }
    try {
      const timeouts = await db.getServerTimeouts(serverId);
      if (typeof callback === 'function') callback({ timeouts });
    } catch (error) {
      console.error('[Moderation] Error fetching timeouts:', error);
      if (typeof callback === 'function') callback({ error: 'Failed to fetch timeouts' });
    }
  });

  socket.on('server:remove-timeout', async ({ serverId, userId }, callback) => {
    const user = state.users[socket.id];
    if (!user || user.isGuest) {
      if (typeof callback === 'function') callback({ error: 'Authentication required' });
      return;
    }
    const srv = state.servers[serverId];
    if (!srv) {
      if (typeof callback === 'function') callback({ error: 'Server not found' });
      return;
    }
    const perms = getUserPerms(user.id, serverId);
    if (!perms.admin) {
      if (typeof callback === 'function') callback({ error: 'Admin permission required' });
      return;
    }
    try {
      await db.removeTimeout(serverId, userId);
      io.emit('user:timeout-removed', { serverId, userId });
      console.log(`[Moderation] ${user.username} removed timeout for user ${userId} in ${srv.name}`);
      if (typeof callback === 'function') callback({ success: true });
    } catch (error) {
      console.error('[Moderation] Error removing timeout:', error);
      if (typeof callback === 'function') callback({ error: 'Failed to remove timeout' });
    }
  });

  socket.on('moderation:get-reports', async ({ serverId }, callback) => {
    const user = state.users[socket.id];
    if (!user || user.isGuest) return;
    const srv = state.servers[serverId];
    if (!srv) return;
    const perms = getUserPerms(user.id, serverId);
    if (!perms.admin) {
      if (typeof callback === 'function') callback({ error: 'Admin permission required' });
      return;
    }
    try {
      const reports = await db.getReportsForServer(serverId);
      if (typeof callback === 'function') callback({ reports });
    } catch (error) {
      console.error('[Moderation] Error fetching reports:', error);
      if (typeof callback === 'function') callback({ error: 'Failed to fetch reports' });
    }
  });

  socket.on('moderation:update-report', async ({ reportId, status }, callback) => {
    const user = state.users[socket.id];
    if (!user || user.isGuest) {
      if (typeof callback === 'function') callback({ error: 'Authentication required' });
      return;
    }
    const validStatuses = ['pending', 'reviewed', 'actioned', 'dismissed'];
    if (!validStatuses.includes(status)) {
      if (typeof callback === 'function') callback({ error: 'Invalid status' });
      return;
    }
    try {
      const updated = await db.updateReportStatus(reportId, status);
      if (!updated) {
        if (typeof callback === 'function') callback({ error: 'Report not found' });
        return;
      }
      console.log(`[Moderation] ${user.username} updated report ${reportId} to ${status}`);
      if (typeof callback === 'function') callback({ success: true, report: updated });
    } catch (error) {
      console.error('[Moderation] Error updating report:', error);
      if (typeof callback === 'function') callback({ error: 'Failed to update report' });
    }
  });

  // ─── Channel Management ───────────────────────────────────────────────────────

  socket.on('channel:create', async ({ serverId, name, type, description, categoryId, isPrivate }) => {
    const user = state.users[socket.id];
    if (!user) return;
    const perms = getUserPerms(user.id, serverId);
    if (!perms.manageChannels && !perms.admin) return socket.emit('error', { message: 'No permission' });
    const srv = state.servers[serverId];
    if (!srv) return;

    const normalizedName = (name||'new-channel').toLowerCase().replace(/[^a-z0-9-]/g,'-').slice(0,32);
    const allChannels = [...srv.channels.text, ...srv.channels.voice];
    if (allChannels.some(c => c.name === normalizedName)) {
      return socket.emit('error', { message: `A channel named "${normalizedName}" already exists in this server` });
    }

    const channelId = normalizedName + '-' + uuidv4().slice(0,4);
    const position = type === 'voice' ? srv.channels.voice.length : srv.channels.text.length;

    const ch = {
      id: channelId, name: normalizedName,
      type: type||'text', description: description||'', serverId, categoryId: categoryId||Object.keys(srv.categories)[0],
      topic:'', nsfw:false, slowMode:0, webhooks:[], position,
      isPrivate: !!isPrivate, permissionOverrides: {}
    };

    if (type === 'voice') {
      srv.channels.voice.push(ch);
      state.voiceChannels[channelId] = { users:[], screenSharers:[] };
    } else {
      srv.channels.text.push(ch);
      state.messages[channelId] = [];
    }

    // Add to category
    if (srv.categories[categoryId]) srv.categories[categoryId].channels.push(channelId);

    // Persist channel to database
    try {
      await db.saveChannel({
        id: channelId, serverId, categoryId: ch.categoryId, name: ch.name,
        type: ch.type, description: ch.description, topic: ch.topic,
        position: ch.position, isPrivate: ch.isPrivate, nsfw: ch.nsfw,
        slowMode: ch.slowMode, permissionOverrides: ch.permissionOverrides
      });
    } catch (err) {
      console.error('[Channel] Failed to persist channel to database:', err.message);
    }

    db.createAuditLog(serverId, 'channel_create', user.id, channelId, { name: ch.name, type: ch.type }).catch(() => {});

    io.emit('server:updated', { server: serializeServer(serverId) });
  });

  socket.on('channel:update', async ({ serverId, channelId, name, description, topic, nsfw, slowMode, isPrivate, permissionOverrides, position, categoryId }) => {
    const user = state.users[socket.id];
    if (!user) return;
    const perms = getUserPerms(user.id, serverId);
    if (!perms.manageChannels && !perms.admin) return socket.emit('error', { message: 'No permission' });
    const srv = state.servers[serverId];
    if (!srv) return;
    const ch = [...srv.channels.text, ...srv.channels.voice].find(c => c.id === channelId);
    if (!ch) return;

    if (name) {
      const normalizedName = String(name).toLowerCase().replace(/[^a-z0-9-]/g,'-').slice(0,32);
      const allChannels = [...srv.channels.text, ...srv.channels.voice];
      if (allChannels.some(c => c.name === normalizedName && c.id !== channelId)) {
        return socket.emit('error', { message: `A channel named "${normalizedName}" already exists in this server` });
      }
      ch.name = normalizedName;
    }
    if (description !== undefined) ch.description = String(description).slice(0,128);
    if (topic !== undefined) ch.topic = String(topic).slice(0,256);
    if (nsfw !== undefined) ch.nsfw = Boolean(nsfw);
    if (slowMode !== undefined) ch.slowMode = Math.max(0, parseInt(slowMode)||0);
    if (isPrivate !== undefined) ch.isPrivate = Boolean(isPrivate);
    if (permissionOverrides !== undefined) ch.permissionOverrides = permissionOverrides;
    if (position !== undefined) ch.position = parseInt(position)||0;
    if (categoryId !== undefined && srv.categories[categoryId]) {
      // Remove from old category
      Object.values(srv.categories).forEach(cat => {
        cat.channels = cat.channels.filter(cid => cid !== channelId);
      });
      ch.categoryId = categoryId;
      srv.categories[categoryId].channels.push(channelId);
    }

    // Persist channel update to database
    try {
      await db.saveChannel({
        id: channelId, serverId, categoryId: ch.categoryId, name: ch.name,
        type: ch.type, description: ch.description, topic: ch.topic,
        position: ch.position, isPrivate: ch.isPrivate, nsfw: ch.nsfw,
        slowMode: ch.slowMode, permissionOverrides: ch.permissionOverrides
      });
    } catch (err) {
      console.error('[Channel] Failed to persist channel update to database:', err.message);
    }

    io.emit('server:updated', { server: serializeServer(serverId) });
  });

  socket.on('channel:delete', ({ serverId, channelId }) => {
    const user = state.users[socket.id];
    if (!user) return;
    const perms = getUserPerms(user.id, serverId);
    if (!perms.manageChannels && !perms.admin) return socket.emit('error', { message: 'No permission' });
    const srv = state.servers[serverId];
    if (!srv) return;

    srv.channels.text = srv.channels.text.filter(c => c.id !== channelId);
    srv.channels.voice = srv.channels.voice.filter(c => c.id !== channelId);
    Object.values(srv.categories).forEach(cat => {
      cat.channels = cat.channels.filter(cid => cid !== channelId);
    });

    // Delete channel from database
    db.query('DELETE FROM channels WHERE id = $1', [channelId]).catch(err => {
      console.error('[Channel] Failed to delete channel from database:', err.message);
    });

    db.createAuditLog(serverId, 'channel_delete', user.id, channelId, {}).catch(() => {});

    io.emit('server:updated', { server: serializeServer(serverId) });
  });

  socket.on('channel:reorder', ({ serverId, categoryId, channelOrder }) => {
    const user = state.users[socket.id];
    if (!user) return;
    const perms = getUserPerms(user.id, serverId);
    if (!perms.manageChannels && !perms.admin) return socket.emit('error', { message: 'No permission' });
    const srv = state.servers[serverId];
    if (!srv || !srv.categories[categoryId]) return;

    // Update the channel order for this category
    srv.categories[categoryId].channels = channelOrder;

    // Update positions for each channel in the new order
    channelOrder.forEach((channelId, idx) => {
      const ch = [...srv.channels.text, ...srv.channels.voice].find(c => c.id === channelId);
      if (ch) {
        ch.position = idx;
      }
    });

    io.emit('server:updated', { server: serializeServer(serverId) });
  });

  // ─── Category Management ──────────────────────────────────────────────────────

  socket.on('category:create', ({ serverId, name }) => {
    const user = state.users[socket.id];
    if (!user) return;
    const perms = getUserPerms(user.id, serverId);
    if (!perms.manageChannels && !perms.admin) return socket.emit('error', { message: 'No permission' });
    const srv = state.servers[serverId];
    if (!srv) return;

    // Ensure categoryOrder exists
    if (!srv.categoryOrder) srv.categoryOrder = Object.keys(srv.categories);

    const catId = uuidv4();
    const position = Object.keys(srv.categories).length;
    srv.categories[catId] = { id: catId, name: (name||'New Category').slice(0,32), position, channels: [] };
    srv.categoryOrder.push(catId);
    io.emit('server:updated', { server: serializeServer(serverId) });
  });

  socket.on('category:update', ({ serverId, categoryId, name }) => {
    const user = state.users[socket.id];
    if (!user) return;
    const perms = getUserPerms(user.id, serverId);
    if (!perms.manageChannels && !perms.admin) return socket.emit('error', { message: 'No permission' });
    const srv = state.servers[serverId];
    if (!srv || !srv.categories[categoryId]) return;

    if (name) srv.categories[categoryId].name = String(name).slice(0,32);
    io.emit('server:updated', { server: serializeServer(serverId) });
  });

  socket.on('category:delete', ({ serverId, categoryId }) => {
    const user = state.users[socket.id];
    if (!user) return;
    const perms = getUserPerms(user.id, serverId);
    if (!perms.manageChannels && !perms.admin) return socket.emit('error', { message: 'No permission' });
    const srv = state.servers[serverId];
    if (!srv || !srv.categories[categoryId]) return;

    // Move all channels to first category
    const firstCat = Object.values(srv.categories).sort((a,b)=>a.position-b.position)[0];
    if (firstCat && firstCat.id !== categoryId) {
      srv.categories[categoryId].channels.forEach(chId => {
        const ch = [...srv.channels.text, ...srv.channels.voice].find(c=>c.id===chId);
        if (ch) {
          ch.categoryId = firstCat.id;
          firstCat.channels.push(chId);
        }
      });
    }

    delete srv.categories[categoryId];
    // Remove from categoryOrder
    if (srv.categoryOrder) {
      srv.categoryOrder = srv.categoryOrder.filter(id => id !== categoryId);
    }
    io.emit('server:updated', { server: serializeServer(serverId) });
  });

  socket.on('category:reorder', ({ serverId, categoryOrder }) => {
    const user = state.users[socket.id];
    if (!user) return;
    const perms = getUserPerms(user.id, serverId);
    if (!perms.manageChannels && !perms.admin) return socket.emit('error', { message: 'No permission' });
    const srv = state.servers[serverId];
    if (!srv) return;

    // Update the category order
    srv.categoryOrder = categoryOrder;

    // Update positions for each category
    categoryOrder.forEach((catId, idx) => {
      if (srv.categories[catId]) {
        srv.categories[catId].position = idx;
      }
    });

    io.emit('server:updated', { server: serializeServer(serverId) });
  });

};

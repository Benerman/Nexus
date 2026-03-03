const db = require('../db');
const { state, getSocketIdForUser, isUserOnline } = require('../state');
const { serializeServer } = require('../helpers');
const { hashPassword } = require('../utils');

module.exports = function(io, socket) {

  socket.on('admin:get-servers', (_, callback) => {
    const user = state.users[socket.id];
    if (!user?.isPlatformAdmin) return callback?.({ error: 'Not authorized' });
    try {
      const servers = Object.entries(state.servers)
        .filter(([, s]) => !s.isPersonal && !s.id.startsWith('personal:'))
        .map(([id, s]) => {
          // Use the socket index for O(1) lookup instead of O(n) scan
          const ownerSocketId = getSocketIdForUser(s.ownerId);
          const ownerUser = ownerSocketId ? state.users[ownerSocketId] : null;
          return {
            id, name: s.name, icon: s.icon, customIcon: s.customIcon,
            ownerId: s.ownerId,
            ownerUsername: ownerUser?.username || 'Unknown',
            memberCount: Object.keys(s.members || {}).length,
            channelCount: [...(s.channels?.text || []), ...(s.channels?.voice || [])].length,
            createdAt: s.createdAt
          };
        });
      callback?.({ servers });
    } catch (error) {
      console.error('[Admin] get-servers error:', error);
      callback?.({ error: 'Failed to load servers' });
    }
  });

  socket.on('admin:get-users', async (_, callback) => {
    const user = state.users[socket.id];
    if (!user?.isPlatformAdmin) return callback?.({ error: 'Not authorized' });
    try {
      const accounts = await db.getAllAccounts();
      const onlineIds = new Set(Object.values(state.users).map(u => u.id));
      const users = accounts.map(a => ({
        id: a.id, username: a.username, color: a.color, avatar: a.avatar,
        customAvatar: a.custom_avatar, status: a.status,
        serverCount: parseInt(a.server_count) || 0,
        online: onlineIds.has(a.id),
        createdAt: a.created_at
      }));
      callback?.({ users });
    } catch (error) {
      console.error('[Admin] get-users error:', error);
      callback?.({ error: 'Failed to load users' });
    }
  });

  socket.on('admin:delete-server', async ({ serverId }, callback) => {
    const user = state.users[socket.id];
    if (!user?.isPlatformAdmin) return callback?.({ error: 'Not authorized' });
    try {
      const srv = state.servers[serverId];
      if (!srv) return callback?.({ error: 'Server not found' });
      if (srv.isPersonal || serverId.startsWith('personal:')) return callback?.({ error: 'Cannot delete personal servers' });
      await db.deleteServer(serverId);
      delete state.servers[serverId];
      io.emit('server:deleted', { serverId });
      console.log(`[Admin] ${user.username} deleted server ${srv.name} (${serverId})`);
      callback?.({ success: true });
    } catch (error) {
      console.error('[Admin] delete-server error:', error);
      callback?.({ error: 'Failed to delete server' });
    }
  });

  socket.on('admin:delete-user', async ({ userId }, callback) => {
    const user = state.users[socket.id];
    if (!user?.isPlatformAdmin) return callback?.({ error: 'Not authorized' });
    if (userId === user.id) return callback?.({ error: 'Cannot delete your own account' });
    try {
      for (const [serverId, srv] of Object.entries(state.servers)) {
        if (srv.ownerId !== userId) continue;
        if (srv.isPersonal || serverId.startsWith('personal:')) continue;

        const memberIds = Object.keys(srv.members).filter(id => id !== userId);
        if (memberIds.length === 0) {
          await db.deleteServer(serverId);
          delete state.servers[serverId];
          io.emit('server:deleted', { serverId });
          continue;
        }

        let newOwnerId = memberIds.find(id => {
          const member = srv.members[id];
          return member && member.roles && member.roles.includes('admin');
        });
        if (!newOwnerId) newOwnerId = memberIds.find(id => !id.startsWith('guest:'));
        if (!newOwnerId) newOwnerId = memberIds[0];

        await db.updateServer(serverId, { owner_id: newOwnerId });
        srv.ownerId = newOwnerId;

        const memberRoles = srv.members[newOwnerId]?.roles || [];
        if (!memberRoles.includes('admin')) {
          srv.members[newOwnerId].roles = [...memberRoles, 'admin'];
          await db.addServerMember(serverId, newOwnerId, srv.members[newOwnerId].roles);
        }
        io.emit('server:updated', { server: serializeServer(serverId) });
      }

      for (const srv of Object.values(state.servers)) {
        delete srv.members[userId];
      }

      for (const [socketId, u] of Object.entries(state.users)) {
        if (u.id === userId) {
          const sock = io.sockets.sockets.get(socketId);
          if (sock) sock.disconnect(true);
          delete state.users[socketId];
        }
      }

      await db.deleteAccount(userId);
      console.log(`[Admin] ${user.username} deleted user ${userId}`);
      callback?.({ success: true });
    } catch (error) {
      console.error('[Admin] delete-user error:', error);
      callback?.({ error: 'Failed to delete user' });
    }
  });

  socket.on('admin:reset-password', async ({ userId, newPassword }, callback) => {
    const user = state.users[socket.id];
    if (!user?.isPlatformAdmin) return callback?.({ error: 'Not authorized' });
    if (!userId || !newPassword) return callback?.({ error: 'User ID and new password required' });
    const passwordRegex = /^[\x20-\x7E]{8,128}$/;
    if (!passwordRegex.test(newPassword)) {
      return callback?.({ error: 'Password must be 8-128 characters' });
    }
    try {
      const passwordHash = await hashPassword(newPassword);
      await db.updateAccountPassword(userId, passwordHash, 'bcrypt');
      console.log(`[Admin] ${user.username} reset password for user ${userId}`);
      callback?.({ success: true });
    } catch (error) {
      console.error('[Admin] reset-password error:', error);
      callback?.({ error: 'Failed to reset password' });
    }
  });

  socket.on('admin:get-orphaned-stats', async (_, callback) => {
    const user = state.users[socket.id];
    if (!user?.isPlatformAdmin) return callback?.({ error: 'Not authorized' });
    try {
      const stats = await db.getOrphanedDataStats();
      callback?.({ stats });
    } catch (error) {
      console.error('[Admin] get-orphaned-stats error:', error);
      callback?.({ error: 'Failed to load stats' });
    }
  });

  socket.on('admin:cleanup-empty-dms', async (_, callback) => {
    const user = state.users[socket.id];
    if (!user?.isPlatformAdmin) return callback?.({ error: 'Not authorized' });
    try {
      const count = await db.cleanupEmptyDMs();
      console.log(`[Admin] ${user.username} cleaned up ${count} empty DM channels`);
      callback?.({ success: true, count });
    } catch (error) {
      console.error('[Admin] cleanup-empty-dms error:', error);
      callback?.({ error: 'Failed to clean up DMs' });
    }
  });

  socket.on('admin:assign-ownerless-servers', async (_, callback) => {
    const user = state.users[socket.id];
    if (!user?.isPlatformAdmin) return callback?.({ error: 'Not authorized' });
    try {
      let assigned = 0;
      for (const [serverId, srv] of Object.entries(state.servers)) {
        if (srv.isPersonal || serverId.startsWith('personal:')) continue;
        const memberIds = Object.keys(srv.members || {});
        const ownerExists = srv.ownerId && memberIds.includes(srv.ownerId);
        if (ownerExists) continue;

        let newOwnerId = memberIds.find(id => srv.members[id]?.roles?.includes('admin'));
        if (!newOwnerId) newOwnerId = memberIds.find(id => !id.startsWith('guest:'));
        if (!newOwnerId) newOwnerId = memberIds[0];
        if (!newOwnerId) continue;

        await db.updateServer(serverId, { owner_id: newOwnerId });
        srv.ownerId = newOwnerId;
        const ownerRoles = srv.members[newOwnerId]?.roles || [];
        if (!ownerRoles.includes('admin')) {
          srv.members[newOwnerId].roles = [...ownerRoles, 'admin'];
          await db.addServerMember(serverId, newOwnerId, srv.members[newOwnerId].roles);
        }
        io.emit('server:updated', { server: serializeServer(serverId) });
        assigned++;
      }
      console.log(`[Admin] ${user.username} assigned owners to ${assigned} ownerless servers`);
      callback?.({ success: true, assigned });
    } catch (error) {
      console.error('[Admin] assign-ownerless-servers error:', error);
      callback?.({ error: 'Failed to assign owners' });
    }
  });

};

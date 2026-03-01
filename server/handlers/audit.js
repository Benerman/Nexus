const db = require('../db');
const { state } = require('../state');
const { getUserPerms } = require('../helpers');

module.exports = function(io, socket) {

  socket.on('audit:get-logs', async ({ serverId, action, actorId, before, limit }) => {
    const user = state.users[socket.id];
    if (!user) return;

    const srv = state.servers[serverId];
    if (!srv) return socket.emit('error', { message: 'Server not found' });

    const perms = getUserPerms(user.id, srv.id);
    if (!perms.admin && srv.ownerId !== user.id) {
      return socket.emit('error', { message: 'You need Admin permission to view audit logs' });
    }

    try {
      const logs = await db.getAuditLogs(serverId, { action, actorId, limit: limit || 50, before });
      const formatted = logs.map(log => ({
        id: log.id,
        action: log.action,
        actorId: log.actor_id,
        actorUsername: log.actor_username || 'Deleted User',
        actorAvatar: log.actor_avatar || '👻',
        targetId: log.target_id,
        changes: typeof log.changes === 'string' ? JSON.parse(log.changes) : (log.changes || {}),
        createdAt: new Date(log.created_at).getTime()
      }));
      socket.emit('audit:logs', { serverId, logs: formatted });
    } catch (err) {
      console.error('[Audit] Error fetching audit logs:', err.message);
    }
  });

};

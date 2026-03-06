const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { state } = require('../state');
const { getUserPerms, getUserHighestRolePosition, serializeServer } = require('../helpers');
const utils = require('../utils');
const { DEFAULT_PERMS } = utils;

module.exports = function(io, socket) {

  socket.on('role:create', async ({ serverId, name, color, permissions }) => {
    const user = state.users[socket.id];
    if (!user) return;
    const perms = getUserPerms(user.id, serverId);
    if (!perms.manageRoles && !perms.admin) return socket.emit('error', { message: 'No permission' });
    const srv = state.servers[serverId];
    if (!srv) return;

    const userHighest = getUserHighestRolePosition(user.id, serverId);

    if (permissions?.admin && srv.ownerId !== user.id) {
      return socket.emit('error', { message: 'Only the server owner can create admin roles' });
    }

    const position = Math.min(Object.keys(srv.roles).length, userHighest);
    const roleId = uuidv4();
    const rolePerms = { ...DEFAULT_PERMS, ...(permissions||{}) };
    const roleName = (name||'New Role').slice(0,32);
    const roleColor = color||null;

    // DB first, then update memory
    try {
      await db.query(
        'INSERT INTO roles (id, server_id, name, color, position, permissions) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING',
        [roleId, serverId, roleName, roleColor, position, JSON.stringify(rolePerms)]
      );

      srv.roles[roleId] = {
        id: roleId, name: roleName, color: roleColor, position,
        permissions: rolePerms
      };

      console.log(`[Roles] ${user.username} created role "${roleName}" in ${srv.name}`);
      db.createAuditLog(serverId, 'role_create', user.id, roleId, { name: roleName }).catch(() => {});

      io.emit('server:updated', { server: serializeServer(serverId) });
    } catch (err) {
      console.error('[Roles] Failed to persist role to database:', err.message);
      socket.emit('error', { message: 'Failed to create role' });
    }
  });

  socket.on('role:update', async ({ serverId, roleId, name, color, permissions }) => {
    const user = state.users[socket.id];
    if (!user) return;
    const perms = getUserPerms(user.id, serverId);
    if (!perms.manageRoles && !perms.admin) return socket.emit('error', { message: 'No permission' });
    const srv = state.servers[serverId];
    const role = srv?.roles[roleId];
    if (!role || roleId === 'everyone') return;

    const userHighest = getUserHighestRolePosition(user.id, serverId);

    if (srv.ownerId !== user.id && (role.position || 0) >= userHighest) {
      return socket.emit('error', { message: 'Cannot edit a role equal to or above your own' });
    }
    if (permissions?.admin && srv.ownerId !== user.id) {
      return socket.emit('error', { message: 'Only the server owner can grant admin permission' });
    }

    // Compute new values
    const newName = name ? name.slice(0,32) : role.name;
    const newColor = color !== undefined ? color : role.color;
    const newPerms = permissions ? { ...role.permissions, ...permissions } : role.permissions;

    // DB first, then update memory
    try {
      await db.query(
        'UPDATE roles SET name = $1, color = $2, permissions = $3 WHERE id = $4 AND server_id = $5',
        [newName, newColor, JSON.stringify(newPerms), roleId, serverId]
      );

      role.name = newName;
      role.color = newColor;
      role.permissions = newPerms;

      console.log(`[Roles] ${user.username} updated role "${newName}" in ${srv.name}`);
      io.emit('server:updated', { server: serializeServer(serverId) });
    } catch (err) {
      console.error('[Roles] Failed to update role in database:', err.message);
      socket.emit('error', { message: 'Failed to update role' });
    }
  });

  socket.on('role:delete', async ({ serverId, roleId }) => {
    const user = state.users[socket.id];
    if (!user) return;
    const perms = getUserPerms(user.id, serverId);
    if (!perms.manageRoles && !perms.admin) return socket.emit('error', { message: 'No permission' });
    const srv = state.servers[serverId];
    if (!srv) return;
    if (roleId === 'everyone') return socket.emit('error', { message: 'Cannot delete the everyone role' });
    if (roleId === 'admin') return socket.emit('error', { message: 'Cannot delete the admin role' });
    const role = srv.roles[roleId];
    if (!role) return socket.emit('error', { message: 'Role not found' });

    const userHighest = getUserHighestRolePosition(user.id, serverId);

    if (srv.ownerId !== user.id && (role.position || 0) >= userHighest) {
      return socket.emit('error', { message: 'Cannot delete a role equal to or above your own' });
    }

    // DB first, then update memory
    try {
      await db.query('DELETE FROM roles WHERE id = $1 AND server_id = $2', [roleId, serverId]);

      Object.values(srv.members).forEach(member => {
        member.roles = member.roles.filter(r => r !== roleId);
      });
      delete srv.roles[roleId];

      console.log(`[Roles] ${user.username} deleted role "${role.name}" from ${srv.name}`);
      db.createAuditLog(serverId, 'role_delete', user.id, roleId, { name: role.name }).catch(() => {});

      io.emit('server:updated', { server: serializeServer(serverId) });
    } catch (err) {
      console.error('[Roles] Failed to delete role from database:', err.message);
      socket.emit('error', { message: 'Failed to delete role' });
    }
  });

  socket.on('member:role', async ({ serverId, targetUserId, roleId, action }) => {
    const user = state.users[socket.id];
    if (!user) return;
    const perms = getUserPerms(user.id, serverId);
    if (!perms.manageRoles && !perms.admin) return socket.emit('error', { message: 'No permission' });
    const srv = state.servers[serverId];
    if (!srv) return;
    const member = srv.members[targetUserId];
    if (!member) return;

    const userHighest = getUserHighestRolePosition(user.id, serverId);
    const targetRole = srv.roles[roleId];

    if (targetRole && srv.ownerId !== user.id && (targetRole.position || 0) >= userHighest) {
      return socket.emit('error', { message: 'Cannot assign or remove a role equal to or above your own' });
    }

    if (srv.ownerId !== user.id) {
      const targetHighest = getUserHighestRolePosition(targetUserId, serverId);
      if (targetHighest >= userHighest) {
        return socket.emit('error', { message: 'Cannot modify roles of a member with equal or higher rank' });
      }
    }

    // Compute new roles
    let newRoles = [...member.roles];
    if (action === 'add' && !newRoles.includes(roleId)) newRoles.push(roleId);
    if (action === 'remove') newRoles = newRoles.filter(r => r !== roleId && r !== 'everyone');

    // DB first, then update memory
    try {
      await db.updateServerMemberRoles(serverId, targetUserId, newRoles);
      member.roles = newRoles;
      const targetRole = srv.roles[roleId];
      console.log(`[Roles] ${user.username} ${action === 'add' ? 'assigned' : 'removed'} role "${targetRole?.name || roleId}" ${action === 'add' ? 'to' : 'from'} ${targetUserId} in ${srv.name}`);
      io.emit('server:updated', { server: serializeServer(serverId) });
    } catch (err) {
      console.error('[Roles] Failed to persist member role change to database:', err.message);
      socket.emit('error', { message: 'Failed to update member role' });
    }
  });

};

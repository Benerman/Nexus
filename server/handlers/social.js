const db = require('../db');
const { state, DEFAULT_SERVER_ID, getSocketIdForUser, isUserOnline } = require('../state');
const { getUserPerms, serializeServer } = require('../helpers');

module.exports = function(io, socket) {

  // ─── Friend System ──────────────────────────────────────────────────────────
  socket.on('friend:request', async ({ targetUsername }) => {
    const user = state.users[socket.id];
    if (!user || user.isGuest) {
      return socket.emit('error', { message: 'Friends require authentication' });
    }

    try {
      const targetAccount = await db.getAccountByUsernameInsensitive(targetUsername);
      if (!targetAccount) {
        return socket.emit('error', { message: 'User not found' });
      }

      if (targetAccount.id === user.id) {
        return socket.emit('error', { message: 'Cannot friend yourself' });
      }

      const friendship = await db.sendFriendRequest(user.id, targetAccount.id);
      if (!friendship) {
        return socket.emit('error', { message: 'Friend request already sent' });
      }

      socket.emit('friend:request:sent', {
        requestId: friendship.id,
        username: targetAccount.username
      });

      // Notify target user if online
      const targetSocketId = getSocketIdForUser(targetAccount.id);
      if (targetSocketId) {
        io.to(targetSocketId).emit('friend:request:received', {
          requestId: friendship.id,
          from: { id: user.id, username: user.username, avatar: user.avatar, color: user.color }
        });
      }

      console.log(`[Friend] ${user.username} sent friend request to ${targetAccount.username}`);
    } catch (error) {
      console.error('[Friend] Error sending friend request:', error);
      socket.emit('error', { message: error.message || 'Failed to send friend request' });
    }
  });

  socket.on('friend:accept', async ({ requestId }) => {
    const user = state.users[socket.id];
    if (!user || user.isGuest) return socket.emit('error', { message: 'Authentication required' });

    try {
      const friendship = await db.acceptFriendRequest(requestId);
      socket.emit('friend:accepted', { friendship });

      const requesterSocketId = getSocketIdForUser(friendship.requester_id);
      if (requesterSocketId) {
        io.to(requesterSocketId).emit('friend:accepted', { friendship });
      }

      console.log(`[Friend] Friend request ${requestId} accepted`);
    } catch (error) {
      console.error('[Friend] Error accepting friend request:', error);
      socket.emit('error', { message: 'Failed to accept friend request' });
    }
  });

  socket.on('friend:reject', async ({ requestId }) => {
    const user = state.users[socket.id];
    if (!user || user.isGuest) return socket.emit('error', { message: 'Authentication required' });

    try {
      await db.rejectFriendRequest(requestId);
      socket.emit('friend:rejected', { requestId });
      console.log(`[Friend] Friend request ${requestId} rejected`);
    } catch (error) {
      console.error('[Friend] Error rejecting friend request:', error);
      socket.emit('error', { message: 'Failed to reject friend request' });
    }
  });

  socket.on('friend:remove', async ({ friendId }) => {
    const user = state.users[socket.id];
    if (!user || user.isGuest) return socket.emit('error', { message: 'Authentication required' });

    try {
      await db.removeFriend(user.id, friendId);
      socket.emit('friend:removed', { friendId });

      const friendSocketId = getSocketIdForUser(friendId);
      if (friendSocketId) {
        io.to(friendSocketId).emit('friend:removed', { friendId: user.id });
      }

      console.log(`[Friend] ${user.username} removed friend ${friendId}`);
    } catch (error) {
      console.error('[Friend] Error removing friend:', error);
      socket.emit('error', { message: 'Failed to remove friend' });
    }
  });

  socket.on('friend:list', async () => {
    const user = state.users[socket.id];
    if (!user || user.isGuest) return socket.emit('error', { message: 'Authentication required' });

    try {
      const friendsRaw = await db.getFriends(user.id);
      const pendingRaw = await db.getPendingFriendRequests(user.id);

      const friends = friendsRaw.map(f => {
        const isRequester = f.requester_id === user.id;
        return {
          id: isRequester ? f.addressee_id : f.requester_id,
          username: isRequester ? f.addressee_username : f.requester_username,
          avatar: isRequester ? f.addressee_avatar : f.requester_avatar,
          customAvatar: isRequester ? f.addressee_custom_avatar : f.requester_custom_avatar,
          color: isRequester ? f.addressee_color : f.requester_color,
          friendshipId: f.id,
          since: f.updated_at || f.created_at
        };
      });

      const pending = pendingRaw.map(p => ({
        id: p.id,
        status: p.status,
        createdAt: p.created_at,
        isIncoming: p.addressee_id === user.id,
        requester: {
          id: p.requester_id,
          username: p.requester_username,
          avatar: p.requester_avatar,
          customAvatar: p.requester_custom_avatar,
          color: p.requester_color
        },
        addressee: {
          id: p.addressee_id,
          username: p.addressee_username,
          avatar: p.addressee_avatar,
          customAvatar: p.addressee_custom_avatar,
          color: p.addressee_color
        }
      }));

      console.debug(`[Social] ${user.username} fetched friend list (${friends.length} friends, ${pending.length} pending)`);
      socket.emit('friend:list', { friends, pending });
    } catch (error) {
      console.error('[Friend] Error fetching friend list:', error);
      socket.emit('error', { message: 'Failed to fetch friend list' });
    }
  });

  // ─── Block System ───────────────────────────────────────────────────────────
  socket.on('block:user', async ({ userId }) => {
    const user = state.users[socket.id];
    if (!user || user.isGuest) return socket.emit('error', { message: 'Authentication required' });

    try {
      await db.blockUser(user.id, userId);
      socket.emit('user:blocked', { userId });
      console.log(`[Block] ${user.username} blocked user ${userId}`);
    } catch (error) {
      console.error('[Block] Error blocking user:', error);
      socket.emit('error', { message: 'Failed to block user' });
    }
  });

  socket.on('unblock:user', async ({ userId }) => {
    const user = state.users[socket.id];
    if (!user || user.isGuest) return socket.emit('error', { message: 'Authentication required' });

    try {
      await db.unblockUser(user.id, userId);
      socket.emit('user:unblocked', { userId });
      console.log(`[Block] ${user.username} unblocked user ${userId}`);
    } catch (error) {
      console.error('[Block] Error unblocking user:', error);
      socket.emit('error', { message: 'Failed to unblock user' });
    }
  });

  socket.on('blocked:list', async () => {
    const user = state.users[socket.id];
    if (!user || user.isGuest) return socket.emit('error', { message: 'Authentication required' });

    try {
      console.debug(`[Social] ${user.username} fetched blocked users`);
      const blocked = await db.getBlockedUsers(user.id);
      socket.emit('blocked:list', { blocked });
    } catch (error) {
      console.error('[Block] Error fetching blocked users:', error);
      socket.emit('error', { message: 'Failed to fetch blocked users' });
    }
  });

  // ─── Report System ──────────────────────────────────────────────────────────
  socket.on('report:user', async ({ userId, reportType, description, messageId }) => {
    const user = state.users[socket.id];
    if (!user || user.isGuest) return socket.emit('error', { message: 'Authentication required' });

    try {
      const report = await db.createReport(user.id, userId, reportType, description, messageId);
      socket.emit('report:submitted', { reportId: report.id });
      console.log(`[Report] ${user.username} reported user ${userId} for ${reportType}`);
    } catch (error) {
      console.error('[Report] Error submitting report:', error);
      socket.emit('error', { message: 'Failed to submit report' });
    }
  });

  // ─── Server Invite System ──────────────────────────────────────────────────
  socket.on('invite:create', async ({ serverId, maxUses, expiresInMs }) => {
    const user = state.users[socket.id];
    if (!user) return socket.emit('error', { message: 'Authentication required' });

    const srv = state.servers[serverId];
    if (!srv || !srv.members[user.id]) {
      return socket.emit('error', { message: 'You must be a member of this server' });
    }

    const perms = getUserPerms(user.id, serverId);
    if (!perms.createInvite && !perms.admin) {
      return socket.emit('error', { message: 'You do not have permission to create invites' });
    }

    try {
      const invite = await db.createInvite(serverId, user.id, maxUses || 0, expiresInMs);
      socket.emit('invite:created', {
        invite: {
          ...invite,
          url: `${process.env.CLIENT_URL || 'http://localhost:3000'}/invite/${invite.id}`
        }
      });
      console.log(`[Invite] ${user.username} created invite ${invite.id} for server ${serverId}`);
    } catch (error) {
      console.error('[Invite] Error creating invite:', error);
      socket.emit('error', { message: 'Failed to create invite' });
    }
  });

  socket.on('invite:peek', async ({ inviteCode }) => {
    const user = state.users[socket.id];
    if (!user) return;

    try {
      console.debug(`[Social] ${user.username} peeked at invite ${inviteCode}`);
      const invite = await db.getInviteByCode(inviteCode);
      if (!invite) {
        return socket.emit('invite:peek:result', { inviteCode, error: 'Invalid invite' });
      }

      const expired = invite.expires_at && new Date(invite.expires_at) < new Date();
      const maxed = invite.max_uses > 0 && invite.uses >= invite.max_uses;
      const srv = state.servers[invite.server_id];
      const isMember = !!(srv && srv.members[user.id]);

      socket.emit('invite:peek:result', {
        inviteCode,
        valid: !expired && !maxed,
        isMember,
        server: srv ? {
          id: srv.id,
          name: srv.name,
          icon: srv.icon,
          customIcon: srv.customIcon,
          memberCount: Object.keys(srv.members).length,
          description: srv.description
        } : null
      });
    } catch (error) {
      socket.emit('invite:peek:result', { inviteCode, error: 'Failed to look up invite' });
    }
  });

  socket.on('invite:use', async ({ inviteCode }) => {
    const user = state.users[socket.id];
    if (!user) return socket.emit('error', { message: 'Authentication required' });

    try {
      const invite = await db.getInviteByCode(inviteCode);
      if (!invite) {
        return socket.emit('error', { message: 'Invalid invite code' });
      }

      if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
        return socket.emit('error', { message: 'Invite has expired' });
      }

      if (invite.max_uses > 0 && invite.uses >= invite.max_uses) {
        return socket.emit('error', { message: 'Invite has reached max uses' });
      }

      const srv = state.servers[invite.server_id];
      if (srv && srv.members[user.id]) {
        return socket.emit('error', { message: 'You are already a member of this server' });
      }

      if (srv) {
        const isBanned = await db.isUserBanned(invite.server_id, user.id);
        if (isBanned) {
          return socket.emit('error', { message: 'You are banned from this server' });
        }
      }

      if (srv) {
        srv.members[user.id] = { roles: ['everyone'], joinedAt: Date.now(), username: user.username, avatar: user.avatar, customAvatar: user.customAvatar || null, color: user.color || '#3B82F6' };
        await db.addServerMember(invite.server_id, user.id, ['everyone']);
        await db.incrementInviteUse(inviteCode);

        const serialized = serializeServer(invite.server_id);
        socket.emit('invite:joined', { server: serialized });
        io.emit('server:updated', { server: serialized });
        console.log(`[Invite] ${user.username} joined server ${invite.server_id} via invite ${inviteCode}`);
      }
    } catch (error) {
      console.error('[Invite] Error using invite:', error);
      socket.emit('error', { message: 'Failed to use invite' });
    }
  });

  socket.on('server:join-default', async () => {
    const user = state.users[socket.id];
    if (!user) return socket.emit('error', { message: 'Authentication required' });

    try {
      const srv = state.servers[DEFAULT_SERVER_ID];
      if (!srv) return socket.emit('error', { message: 'Default server not found' });

      if (srv.members[user.id]) {
        const serialized = serializeServer(DEFAULT_SERVER_ID);
        return socket.emit('invite:joined', { server: serialized });
      }

      const isBanned = await db.isUserBanned(DEFAULT_SERVER_ID, user.id);
      if (isBanned) {
        return socket.emit('error', { message: 'You are banned from this server' });
      }

      srv.members[user.id] = { roles: ['everyone'], joinedAt: Date.now(), username: user.username, avatar: user.avatar, customAvatar: user.customAvatar || null, color: user.color || '#3B82F6' };
      await db.addServerMember(DEFAULT_SERVER_ID, user.id, ['everyone']);

      const serialized = serializeServer(DEFAULT_SERVER_ID);
      socket.emit('invite:joined', { server: serialized });
      io.emit('server:updated', { server: serialized });
      console.log(`[Join] ${user.username} joined default server via onboarding`);
    } catch (error) {
      console.error('[Join] Error joining default server:', error);
      socket.emit('error', { message: 'Failed to join default server' });
    }
  });

  socket.on('invite:list', async ({ serverId }) => {
    const user = state.users[socket.id];
    if (!user) return socket.emit('error', { message: 'Authentication required' });

    const perms = getUserPerms(user.id, serverId);
    if (!perms.manageServer && !perms.admin) {
      return socket.emit('error', { message: 'No permission to view invites' });
    }

    try {
      console.debug(`[Social] ${user.username} listed invites for ${serverId}`);
      const invites = await db.getServerInvites(serverId);
      socket.emit('invite:list', { invites });
    } catch (error) {
      console.error('[Invite] Error fetching invites:', error);
      socket.emit('error', { message: 'Failed to fetch invites' });
    }
  });

  socket.on('invite:revoke', async ({ inviteCode, serverId }) => {
    const user = state.users[socket.id];
    if (!user) return socket.emit('error', { message: 'Authentication required' });

    const perms = getUserPerms(user.id, serverId);
    if (!perms.manageServer && !perms.admin) {
      return socket.emit('error', { message: 'No permission to revoke invites' });
    }

    try {
      await db.deleteInvite(inviteCode);
      socket.emit('invite:revoked', { inviteCode });
      console.log(`[Invite] ${user.username} revoked invite ${inviteCode}`);
    } catch (error) {
      console.error('[Invite] Error revoking invite:', error);
      socket.emit('error', { message: 'Failed to revoke invite' });
    }
  });

};

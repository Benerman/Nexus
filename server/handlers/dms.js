const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { state, getSocketIdForUser, isUserOnline } = require('../state');
const { checkSocketRate, socketRateLimiters, convertDbMessagesToRuntime, convertDbMessages, serializeServer, findServerByChannelId, getOnlineUsers } = require('../helpers');
const validation = require('../validation');

module.exports = function(io, socket) {

  socket.on('dm:create', async ({ targetUserId }) => {
    const user = state.users[socket.id];
    if (!user || user.isGuest) {
      return socket.emit('error', { message: 'DMs require authentication' });
    }
    if (!await checkSocketRate(socketRateLimiters.dmCreate, user.id, socket)) return;

    if (!targetUserId) {
      return socket.emit('error', { message: 'Target user not specified' });
    }

    if (targetUserId === user.id) {
      return socket.emit('error', { message: 'Cannot DM yourself' });
    }

    try {
      // Verify target user exists before creating channel
      const targetAccount = await db.getAccountById(targetUserId);
      if (!targetAccount) {
        return socket.emit('error', { message: 'User not found' });
      }

      // Check if either user has blocked the other
      const blockRelation = await db.getBlockRelation(user.id, targetUserId);
      if (blockRelation) {
        return socket.emit('error', { message: 'Cannot send DM to this user' });
      }

      // Check friendship status to determine if this should be a message request
      const friends = await db.areFriends(user.id, targetUserId);

      // Get or create DM channel in database
      // If not friends, create as 'pending' (message request); if friends or channel already exists, 'active'
      const dmChannel = await db.getOrCreateDMChannel(user.id, targetUserId, friends ? 'active' : 'pending');
      const channelId = dmChannel.id;

      // If the channel already existed as 'active', use it normally regardless of friendship
      const isPending = dmChannel.status === 'pending';

      // Initialize message store if not exists
      if (!state.messages[channelId]) {
        state.messages[channelId] = [];
      }

      // Load recent messages from database
      const dbMessages = await db.getChannelMessages(channelId, 50);

      // Convert database messages to runtime format
      const messages = await Promise.all(dbMessages.map(async (dbMsg) => {
        const socketId = getSocketIdForUser(dbMsg.author_id);
        let author = socketId ? state.users[socketId] : null;
        if (!author) {
          if (dbMsg.is_webhook) {
            author = {
              id: `webhook:${dbMsg.id}`,
              username: dbMsg.webhook_username || 'Webhook',
              avatar: dbMsg.webhook_avatar || '🤖',
              color: '#60A5FA',
              isWebhook: true
            };
          } else {
            const account = await db.getAccountById(dbMsg.author_id);
            if (account) {
              author = {
                id: account.id,
                username: account.username,
                avatar: account.avatar,
                customAvatar: account.custom_avatar,
                color: account.color
              };
            }
          }
        }

        return {
          id: dbMsg.id,
          channelId,
          content: dbMsg.content,
          attachments: typeof dbMsg.attachments === 'string' ? JSON.parse(dbMsg.attachments || '[]') : (dbMsg.attachments || []),
          author: author || { id: dbMsg.author_id, username: 'Deleted User', avatar: '👻', color: '#80848E' },
          timestamp: new Date(dbMsg.created_at).getTime(),
          reactions: typeof dbMsg.reactions === 'string' ? JSON.parse(dbMsg.reactions || '{}') : (dbMsg.reactions || {}),
          replyTo: dbMsg.reply_to || null,
          isWebhook: dbMsg.is_webhook || false,
          webhookUsername: dbMsg.webhook_username || null,
          webhookAvatar: dbMsg.webhook_avatar || null,
          mentions: typeof dbMsg.mentions === 'string' ? JSON.parse(dbMsg.mentions || '{}') : (dbMsg.mentions || {}),
          commandData: typeof dbMsg.command_data === 'string' ? JSON.parse(dbMsg.command_data || 'null') : (dbMsg.command_data || null),
          embeds: typeof dbMsg.embeds === 'string' ? JSON.parse(dbMsg.embeds || '[]') : (dbMsg.embeds || []),
          pinned: dbMsg.pinned || false,
          pinnedAt: dbMsg.pinned_at ? new Date(dbMsg.pinned_at).getTime() : null,
          pinnedBy: dbMsg.pinned_by || null,
          threadId: dbMsg.thread_id || null,
          encrypted: dbMsg.encrypted || false
        };
      }));

      // Store in memory
      state.messages[channelId] = messages;

      // Use the target account we already fetched above
      const targetUser = {
        id: targetAccount.id,
        username: targetAccount.username,
        avatar: targetAccount.avatar,
        customAvatar: targetAccount.custom_avatar,
        color: targetAccount.color,
        status: targetAccount.status,
        bio: targetAccount.bio,
        publicKey: targetAccount.public_key || null
      };

      // Join the DM channel room
      socket.join(`text:${channelId}`);

      // Emit success with channel info and messages to the sender (navigate to the DM)
      socket.emit('dm:created', {
        channel: {
          id: channelId,
          name: targetUser.username,
          type: 'dm',
          isDM: true,
          participant: targetUser,
          messageRequest: isPending ? 'sent' : null,
          createdAt: new Date(dmChannel.created_at).getTime()
        },
        messages,
        navigate: true
      });

      // Also notify the recipient so the DM appears on their side in real-time
      const recipientSocketId = getSocketIdForUser(targetUserId);
      if (recipientSocketId) {
        const recipientSocket = io.sockets.sockets.get(recipientSocketId);
        if (recipientSocket) {
          // Join recipient to the DM room so they receive messages
          recipientSocket.join(`text:${channelId}`);

          // Build sender info as the participant for the recipient's view
          const senderUser = {
            id: user.id,
            username: user.username,
            avatar: user.avatar,
            customAvatar: user.customAvatar,
            color: user.color,
            status: user.status,
            bio: user.bio
          };

          if (isPending) {
            // Send as message request notification — don't add to their main DM list
            recipientSocket.emit('dm:message-request', {
              channel: {
                id: channelId,
                name: senderUser.username,
                type: 'dm',
                isDM: true,
                participant: senderUser,
                messageRequest: 'received',
                createdAt: new Date(dmChannel.created_at).getTime()
              },
              messages
            });
          } else {
            // Don't navigate — just add the DM to their sidebar
            recipientSocket.emit('dm:created', {
              channel: {
                id: channelId,
                name: senderUser.username,
                type: 'dm',
                isDM: true,
                participant: senderUser,
                createdAt: new Date(dmChannel.created_at).getTime()
              },
              messages,
              navigate: false
            });
          }
        }
      }

      console.log(`[DM] ${user.username} ${isPending ? 'sent message request to' : 'opened DM with'} ${targetUser.username}`);
    } catch (error) {
      console.error('[DM] Error creating DM channel:', error);
      socket.emit('error', { message: 'Failed to create DM channel' });
    }
  });

  socket.on('dm:list', async () => {
    const user = state.users[socket.id];
    if (!user || user.isGuest) {
      return socket.emit('error', { message: 'DMs require authentication' });
    }

    try {
      // Get all DM channels with participant details and last message in a single query
      const dmRows = await db.getDMChannelsWithDetails(user.id);

      // Get account settings ONCE for hidden_dms filter
      const account = await db.getAccountById(user.id);
      const hiddenDMs = account?.settings?.hidden_dms || [];

      // Filter out hidden DMs
      const visibleRows = dmRows.filter(dm => !hiddenDMs.includes(dm.id));

      // Build DM list from joined rows — no per-DM queries needed
      const dmList = visibleRows.map(row => {
        const channelId = row.id;

        // Determine other participant from the pre-joined row data
        let participant;
        if (row.participant_1 === user.id) {
          // Other user is participant_2 — use p2_* fields
          participant = {
            id: row.participant_2,
            username: row.p2_username,
            avatar: row.p2_avatar,
            customAvatar: row.p2_custom_avatar,
            color: row.p2_color,
            status: row.p2_status,
            bio: row.p2_bio,
            publicKey: row.p2_public_key || null
          };
        } else {
          // Other user is participant_1 — use p1_* fields
          participant = {
            id: row.participant_1,
            username: row.p1_username,
            avatar: row.p1_avatar,
            customAvatar: row.p1_custom_avatar,
            color: row.p1_color,
            status: row.p1_status,
            bio: row.p1_bio,
            publicKey: row.p1_public_key || null
          };
        }

        // Fallback if participant data is missing
        if (!participant.username) {
          participant = {
            id: participant.id,
            username: 'Unknown User',
            avatar: '❓',
            color: '#60A5FA',
            status: 'offline'
          };
        }

        // Build lastMessage from the pre-joined last_msg_* fields
        let lastMessage = null;
        if (row.last_msg_id) {
          lastMessage = {
            id: row.last_msg_id,
            content: row.last_msg_content,
            timestamp: new Date(row.last_msg_created_at).getTime(),
            authorId: row.last_msg_author_id,
            encrypted: row.last_msg_encrypted || false
          };
        }

        // Check if participant is online using the index
        const otherUserId = row.participant_1 === user.id ? row.participant_2 : row.participant_1;
        if (isUserOnline(otherUserId)) {
          participant.status = 'online';
        }

        // Determine message request status
        const isChannelPending = row.status === 'pending';
        let messageRequest = null;
        if (isChannelPending) {
          messageRequest = row.initiated_by === user.id ? 'sent' : 'received';
        }

        return {
          id: channelId,
          type: 'dm',
          participant,
          lastMessage,
          messageRequest,
          createdAt: new Date(row.created_at).getTime()
        };
      });

      // Sort by last message time (most recent first)
      dmList.sort((a, b) => {
        const aTime = a.lastMessage?.timestamp || a.createdAt;
        const bTime = b.lastMessage?.timestamp || b.createdAt;
        return bTime - aTime;
      });

      socket.emit('dm:list', { dms: dmList });
      console.debug(`[DM] ${user.username} requested DM list (${dmList.length} conversations)`);
    } catch (error) {
      console.error('[DM] Error fetching DM list:', error);
      socket.emit('error', { message: `Failed to fetch DM list: ${error.message}` });
    }
  });

  // Mark DM as read
  socket.on('dm:mark-read', async ({ channelId, messageId }) => {
    const user = state.users[socket.id];

    // SECURITY: Authentication check
    const authCheck = validation.requireAuth(user);
    if (!authCheck.authorized) {
      return socket.emit('error', { message: authCheck.error });
    }

    // SECURITY: Rate limiting
    const rateCheck = validation.markReadLimiter.check(user.id);
    if (!rateCheck.allowed) {
      return socket.emit('error', { message: rateCheck.error });
    }

    // SECURITY: Validate channel ID
    const channelValidation = validation.validateChannelId(channelId);
    if (!channelValidation.valid) {
      return socket.emit('error', { message: channelValidation.error });
    }

    // SECURITY: Validate message ID (optional)
    const messageValidation = validation.validateMessageId(messageId, true);
    if (!messageValidation.valid) {
      return socket.emit('error', { message: messageValidation.error });
    }

    try {
      // SECURITY: Check if user is a participant in this DM
      const isParticipant = await db.isParticipantInDM(channelId, user.id);
      if (!isParticipant) {
        return socket.emit('error', { message: 'You are not a participant in this DM' });
      }

      await db.markDMAsRead(user.id, channelId, messageId);
      console.log(`[DM] ${user.username} marked DM ${channelId} as read`);

      // Send updated unread counts to the user
      const unreadCounts = await db.getUnreadCounts(user.id);
      socket.emit('dm:unread-counts', { counts: unreadCounts });
    } catch (error) {
      console.error('[DM] Error marking as read:', error);
      socket.emit('error', { message: 'Failed to mark DM as read' });
    }
  });

  // Get all unread counts for user
  socket.on('dm:unread-counts', async () => {
    const user = state.users[socket.id];
    if (!user || user.isGuest) {
      return socket.emit('error', { message: 'DMs require authentication' });
    }

    try {
      console.debug(`[DM] ${user.username} fetched unread counts`);
      const unreadCounts = await db.getUnreadCounts(user.id);
      socket.emit('dm:unread-counts', { counts: unreadCounts });
    } catch (error) {
      console.error('[DM] Error getting unread counts:', error);
      socket.emit('error', { message: 'Failed to get unread counts' });
    }
  });

  // Archive (hide) a DM channel - stores in user settings, doesn't delete messages
  socket.on('dm:close', async ({ channelId }) => {
    const user = state.users[socket.id];
    if (!user) return;
    try {
      const isParticipant = await db.isParticipantInDM(channelId, user.id);
      if (!isParticipant) return socket.emit('error', { message: 'Not a participant' });
      // Store hidden DM in user settings
      const account = await db.getAccountById(user.id);
      const settings = account?.settings || {};
      const hiddenDMs = settings.hidden_dms || [];
      if (!hiddenDMs.includes(channelId)) {
        hiddenDMs.push(channelId);
        await db.pool.query('UPDATE accounts SET settings = settings || $1 WHERE id = $2', [JSON.stringify({ hidden_dms: hiddenDMs }), user.id]);
      }
      console.log(`[DM] ${user.username} archived DM ${channelId}`);
    } catch (error) {
      console.error('[DM] Error archiving DM:', error);
      socket.emit('error', { message: 'Failed to archive conversation' });
    }
  });

  // Delete a DM channel for the requesting user only (per-user hide + message clearing)
  socket.on('dm:delete', async ({ channelId }) => {
    const user = state.users[socket.id];
    if (!user) return;
    try {
      const isParticipant = await db.isParticipantInDM(channelId, user.id);
      if (!isParticipant) return socket.emit('error', { message: 'Not a participant' });

      // Store delete timestamp and hide the DM — per-user only
      const account = await db.getAccountById(user.id);
      const settings = account?.settings || {};
      const hiddenDMs = settings.hidden_dms || [];
      const deletedDMs = settings.deleted_dms || {};

      // Record when this user "deleted" the conversation (messages before this are hidden for them)
      deletedDMs[channelId] = Date.now();
      if (!hiddenDMs.includes(channelId)) {
        hiddenDMs.push(channelId);
      }

      await db.pool.query(
        'UPDATE accounts SET settings = COALESCE(settings, \'{}\'::jsonb) || $1::jsonb WHERE id = $2',
        [JSON.stringify({ hidden_dms: hiddenDMs, deleted_dms: deletedDMs }), user.id]
      );

      // Clear read state for this user only
      await db.pool.query(
        'DELETE FROM dm_read_states WHERE channel_id = $1 AND user_id = $2',
        [channelId, user.id]
      );

      // Leave the DM room
      socket.leave(`text:${channelId}`);

      socket.emit('dm:deleted', { channelId });
      console.log(`[DM] ${user.username} deleted DM ${channelId} (per-user)`);
    } catch (error) {
      console.error('[DM] Error deleting DM:', error);
      socket.emit('error', { message: 'Failed to delete conversation' });
    }
  });

  // ─── Message Request Handlers ─────────────────────────────────────────────────

  // List pending message requests for current user
  socket.on('dm:message-requests', async () => {
    const user = state.users[socket.id];
    if (!user || user.isGuest) return socket.emit('error', { message: 'Authentication required' });

    try {
      console.debug(`[DM] ${user.username} fetched message requests`);
      const requests = await db.getMessageRequests(user.id);
      const formatted = requests.map(req => ({
        id: req.id,
        name: req.sender_username,
        type: 'dm',
        isDM: true,
        messageRequest: 'received',
        participant: {
          id: req.sender_id,
          username: req.sender_username,
          avatar: req.sender_avatar,
          customAvatar: req.sender_custom_avatar,
          color: req.sender_color,
          bio: req.sender_bio,
          status: isUserOnline(req.sender_id) ? 'online' : 'offline'
        },
        createdAt: new Date(req.created_at).getTime()
      }));
      socket.emit('dm:message-requests', { requests: formatted });
    } catch (error) {
      console.error('[DM] Error fetching message requests:', error);
      socket.emit('error', { message: 'Failed to fetch message requests' });
    }
  });

  // Accept a message request
  socket.on('dm:message-request:accept', async ({ channelId }) => {
    const user = state.users[socket.id];
    if (!user || user.isGuest) return socket.emit('error', { message: 'Authentication required' });

    try {
      const dmChannel = await db.acceptMessageRequest(channelId, user.id);
      if (!dmChannel) {
        return socket.emit('error', { message: 'Message request not found' });
      }

      // Get the other participant's info
      const otherUserId = dmChannel.participant_1 === user.id ? dmChannel.participant_2 : dmChannel.participant_1;
      const otherAccount = await db.getAccountById(otherUserId);

      // Load messages with author data JOINed, then convert to runtime format
      const dbMessages = await db.getChannelMessagesWithAuthors(channelId, 50);
      const messages = convertDbMessagesToRuntime(dbMessages, channelId);

      state.messages[channelId] = messages;

      const otherUser = otherAccount ? {
        id: otherAccount.id, username: otherAccount.username, avatar: otherAccount.avatar,
        customAvatar: otherAccount.custom_avatar, color: otherAccount.color,
        status: otherAccount.status, bio: otherAccount.bio
      } : { id: otherUserId, username: 'Unknown User', avatar: '❓', color: '#60A5FA' };

      // Notify the acceptor — move from message requests to active DMs
      socket.emit('dm:message-request:accepted', {
        channel: {
          id: channelId, name: otherUser.username, type: 'dm', isDM: true,
          participant: otherUser,
          createdAt: new Date(dmChannel.created_at).getTime()
        },
        messages
      });

      // Notify the original sender if online — update their channel status
      const senderSocketId = getSocketIdForUser(otherUserId);
      if (senderSocketId) {
        const senderSocket = io.sockets.sockets.get(senderSocketId);
        if (senderSocket) {
          senderSocket.emit('dm:message-request:accepted', {
            channel: {
              id: channelId, name: user.username, type: 'dm', isDM: true,
              participant: { id: user.id, username: user.username, avatar: user.avatar, customAvatar: user.customAvatar, color: user.color, status: user.status, bio: user.bio },
              createdAt: new Date(dmChannel.created_at).getTime()
            },
            messages
          });
        }
      }

      console.log(`[DM] ${user.username} accepted message request from ${otherUser.username}`);
    } catch (error) {
      console.error('[DM] Error accepting message request:', error);
      socket.emit('error', { message: 'Failed to accept message request' });
    }
  });

  // Reject/ignore a message request
  socket.on('dm:message-request:reject', async ({ channelId }) => {
    const user = state.users[socket.id];
    if (!user || user.isGuest) return socket.emit('error', { message: 'Authentication required' });

    try {
      const dmChannel = await db.rejectMessageRequest(channelId, user.id);
      if (!dmChannel) {
        return socket.emit('error', { message: 'Message request not found' });
      }

      // Clean up in-memory messages
      delete state.messages[channelId];

      // Leave the room
      socket.leave(`text:${channelId}`);

      socket.emit('dm:message-request:rejected', { channelId });

      // Notify the original sender if online — remove pending DM from their side
      const otherUserId = dmChannel.participant_1 === user.id ? dmChannel.participant_2 : dmChannel.participant_1;
      const senderSocketId = getSocketIdForUser(otherUserId);
      if (senderSocketId) {
        io.to(senderSocketId).emit('dm:message-request:rejected', { channelId });
      }

      console.log(`[DM] ${user.username} rejected message request for channel ${channelId}`);
    } catch (error) {
      console.error('[DM] Error rejecting message request:', error);
      socket.emit('error', { message: 'Failed to reject message request' });
    }
  });

  // Block from message request (reject + block the sender)
  socket.on('dm:message-request:block', async ({ channelId }) => {
    const user = state.users[socket.id];
    if (!user || user.isGuest) return socket.emit('error', { message: 'Authentication required' });

    try {
      // Get the channel to find the sender
      const channelStatus = await db.getDMChannelStatus(channelId);
      if (!channelStatus || channelStatus.status !== 'pending') {
        return socket.emit('error', { message: 'Message request not found' });
      }

      // Block the sender
      await db.blockUser(user.id, channelStatus.initiated_by);

      // Reject the message request
      await db.rejectMessageRequest(channelId, user.id);

      // Clean up in-memory messages
      delete state.messages[channelId];
      socket.leave(`text:${channelId}`);

      socket.emit('dm:message-request:rejected', { channelId });
      socket.emit('user:blocked', { userId: channelStatus.initiated_by });

      // Notify the sender
      const senderSocketId = getSocketIdForUser(channelStatus.initiated_by);
      if (senderSocketId) {
        io.to(senderSocketId).emit('dm:message-request:rejected', { channelId });
      }

      console.log(`[DM] ${user.username} blocked sender from message request ${channelId}`);
    } catch (error) {
      console.error('[DM] Error blocking from message request:', error);
      socket.emit('error', { message: 'Failed to block user' });
    }
  });

  // Typing indicators (unified handler - emits both old and new event formats)
  socket.on('typing:start', ({ channelId }) => {
    const user = state.users[socket.id];
    if (!user) return;
    console.debug(`[DM] ${user.username} started typing in ${channelId}`);
    const userInfo = { id: user.id, username: user.username, avatar: user.avatar, color: user.color };
    socket.to(`text:${channelId}`).emit('typing:start', { channelId, user: userInfo });
    socket.to(`text:${channelId}`).emit('typing:update', { channelId, user: userInfo, typing: true });
  });

  socket.on('typing:stop', ({ channelId }) => {
    const user = state.users[socket.id];
    if (!user) return;
    console.debug(`[DM] ${user.username} stopped typing in ${channelId}`);
    const userInfo = { id: user.id, username: user.username, avatar: user.avatar, color: user.color };
    socket.to(`text:${channelId}`).emit('typing:stop', { channelId, userId: user.id });
    socket.to(`text:${channelId}`).emit('typing:update', { channelId, user: userInfo, typing: false });
  });

  // ─── Group DMs ────────────────────────────────────────────────────────────────
  socket.on('group-dm:create', async ({ participantIds, name }) => {
    const user = state.users[socket.id];

    // SECURITY: Authentication check
    const authCheck = validation.requireAuth(user);
    if (!authCheck.authorized) {
      return socket.emit('error', { message: authCheck.error });
    }

    // SECURITY: Rate limiting
    const rateCheck = validation.groupDMCreateLimiter.check(user.id);
    if (!rateCheck.allowed) {
      return socket.emit('error', { message: rateCheck.error });
    }

    // SECURITY: Validate participant IDs
    const participantValidation = validation.validateParticipantIds(participantIds);
    if (!participantValidation.valid) {
      return socket.emit('error', { message: participantValidation.error });
    }

    // SECURITY: Sanitize group name
    const sanitizedName = validation.sanitizeGroupDMName(name);

    // SECURITY: Check creator isn't in participant list (prevents duplicates)
    if (participantIds.includes(user.id)) {
      return socket.emit('error', { message: 'You cannot add yourself as a participant' });
    }

    try {
      // SECURITY: Verify all participants exist and aren't blocked
      for (const participantId of participantIds) {
        const participant = await db.getAccountById(participantId);
        if (!participant) {
          return socket.emit('error', { message: 'One or more participants do not exist' });
        }

        // Check if user is blocked by any participant
        const isBlocked = await db.isUserBlocked(user.id, participantId);
        if (isBlocked) {
          return socket.emit('error', { message: 'You are blocked by one or more participants' });
        }
      }

      // Create the group DM
      const groupDM = await db.createGroupDM(user.id, participantIds, sanitizedName);
      const participants = await db.getGroupDMParticipants(groupDM.id);

      // Get last messages (empty for new group)
      const messages = await db.getChannelMessages(groupDM.id, 50);

      // Create channel object
      const channel = {
        id: groupDM.id,
        name: name || participants.filter(p => p.id !== user.id).map(p => p.username).join(', '),
        type: 'group-dm',
        isDM: true,
        isGroup: true,
        participants: participants.map(p => ({
          id: p.id,
          username: p.username,
          avatar: p.avatar,
          customAvatar: p.custom_avatar,
          color: p.color,
          status: isUserOnline(p.id) ? 'online' : 'offline'
        })),
        unreadCount: 0,
        createdAt: Date.now()
      };

      // Notify all participants
      const allParticipantIds = [user.id, ...participantIds];
      allParticipantIds.forEach(participantId => {
        const participantSocketId = getSocketIdForUser(participantId);
        if (participantSocketId) {
          io.to(participantSocketId).emit('group-dm:created', { channel, messages });
        }
      });

      console.log(`[Group DM] ${user.username} created group DM ${groupDM.id} with ${participantIds.length} participants`);
    } catch (error) {
      console.error('[Group DM] Error creating group DM:', error);
      socket.emit('error', { message: 'Failed to create group DM' });
    }
  });

  socket.on('group-dm:add-participant', async ({ channelId, userId: targetUserId }) => {
    const user = state.users[socket.id];

    // SECURITY: Authentication check
    const authCheck = validation.requireAuth(user);
    if (!authCheck.authorized) {
      return socket.emit('error', { message: authCheck.error });
    }

    // SECURITY: Rate limiting
    const rateCheck = validation.participantManageLimiter.check(user.id);
    if (!rateCheck.allowed) {
      return socket.emit('error', { message: rateCheck.error });
    }

    // SECURITY: Validate channel ID
    const channelValidation = validation.validateChannelId(channelId);
    if (!channelValidation.valid) {
      return socket.emit('error', { message: channelValidation.error });
    }

    // SECURITY: Validate target user ID
    if (!validation.validateUUID(targetUserId)) {
      return socket.emit('error', { message: 'Invalid user ID' });
    }

    try {
      // SECURITY: Check if user is a participant
      const isParticipant = await db.isParticipantInDM(channelId, user.id);
      if (!isParticipant) {
        return socket.emit('error', { message: 'You are not a participant in this group DM' });
      }

      // SECURITY: Check if target user exists
      const targetUser = await db.getAccountById(targetUserId);
      if (!targetUser) {
        return socket.emit('error', { message: 'User does not exist' });
      }

      // SECURITY: Check if target is already a participant
      const isAlreadyParticipant = await db.isParticipantInDM(channelId, targetUserId);
      if (isAlreadyParticipant) {
        return socket.emit('error', { message: 'User is already a participant' });
      }

      // SECURITY: Check blocking status
      const isBlocked = await db.isUserBlocked(user.id, targetUserId);
      if (isBlocked) {
        return socket.emit('error', { message: 'You are blocked by this user' });
      }

      // Add the new participant
      await db.addParticipantToGroupDM(channelId, targetUserId);

      // Get updated participants
      const participants = await db.getGroupDMParticipants(channelId);

      // Map the added participant to camelCase for the client
      const rawParticipant = participants.find(part => part.id === targetUserId);
      const mappedParticipant = rawParticipant ? {
        id: rawParticipant.id,
        username: rawParticipant.username,
        avatar: rawParticipant.avatar,
        customAvatar: rawParticipant.custom_avatar,
        color: rawParticipant.color,
        status: isUserOnline(rawParticipant.id) ? 'online' : 'offline'
      } : null;

      // Notify all participants
      participants.forEach(p => {
        const participantSocketId = getSocketIdForUser(p.id);
        if (participantSocketId) {
          io.to(participantSocketId).emit('group-dm:participant-added', {
            channelId,
            participant: mappedParticipant
          });
        }
      });

      console.log(`[Group DM] ${user.username} added user ${targetUserId} to group DM ${channelId}`);
    } catch (error) {
      console.error('[Group DM] Error adding participant:', error);
      socket.emit('error', { message: 'Failed to add participant' });
    }
  });

  socket.on('group-dm:remove-participant', async ({ channelId, userId: targetUserId }) => {
    const user = state.users[socket.id];

    // SECURITY: Authentication check
    const authCheck = validation.requireAuth(user);
    if (!authCheck.authorized) {
      return socket.emit('error', { message: authCheck.error });
    }

    // SECURITY: Rate limiting
    const rateCheck = validation.participantManageLimiter.check(user.id);
    if (!rateCheck.allowed) {
      return socket.emit('error', { message: rateCheck.error });
    }

    // SECURITY: Validate channel ID
    const channelValidation = validation.validateChannelId(channelId);
    if (!channelValidation.valid) {
      return socket.emit('error', { message: channelValidation.error });
    }

    // SECURITY: Validate target user ID
    if (!validation.validateUUID(targetUserId)) {
      return socket.emit('error', { message: 'Invalid user ID' });
    }

    try {
      // SECURITY: Check if user is a participant
      const isParticipant = await db.isParticipantInDM(channelId, user.id);
      if (!isParticipant) {
        return socket.emit('error', { message: 'You are not a participant in this group DM' });
      }

      // SECURITY: Only allow removing self or if creator
      const isRemovingSelf = targetUserId === user.id;
      if (!isRemovingSelf) {
        // Get group DM info to check creator
        const participants = await db.getGroupDMParticipants(channelId);
        const groupDMChannel = await db.query(
          'SELECT created_by FROM dm_channels WHERE id = $1',
          [channelId]
        );

        const isCreator = groupDMChannel.rows[0]?.created_by === user.id;
        if (!isCreator) {
          return socket.emit('error', { message: 'Only the group creator can remove other participants' });
        }
      }

      // Remove the participant (or leave if removing self)
      await db.removeParticipantFromGroupDM(channelId, targetUserId);

      // Get remaining participants
      const participants = await db.getGroupDMParticipants(channelId);

      // Notify all remaining participants
      participants.forEach(p => {
        const participantSocketId = getSocketIdForUser(p.id);
        if (participantSocketId) {
          io.to(participantSocketId).emit('group-dm:participant-removed', {
            channelId,
            userId: targetUserId
          });
        }
      });

      // Notify the removed user
      const removedSocketId = getSocketIdForUser(targetUserId);
      if (removedSocketId) {
        io.to(removedSocketId).emit('group-dm:removed', { channelId });
      }

      console.log(`[Group DM] User ${targetUserId} removed from group DM ${channelId}`);
    } catch (error) {
      console.error('[Group DM] Error removing participant:', error);
      socket.emit('error', { message: 'Failed to remove participant' });
    }
  });

  // ─── DM Calls ─────────────────────────────────────────────────────────────────
  socket.on('dm:call-start', async ({ channelId }) => {
    const user = state.users[socket.id];
    if (!user || user.isGuest) return;

    // Initialize voice state for DM channel if not exists
    if (!state.voiceChannels[channelId]) {
      state.voiceChannels[channelId] = { users: [], screenSharers: [], isDMCall: true };
    }

    // Find the other participants in this DM channel
    try {
      const dmChannel = await db.getDMChannelById(channelId);
      if (!dmChannel) return;

      let participantIds = [];
      if (dmChannel.is_group) {
        const participants = await db.getGroupDMParticipants(channelId);
        participantIds = participants.map(p => p.id).filter(id => id !== user.id);
      } else {
        const otherId = dmChannel.participant_1 === user.id ? dmChannel.participant_2 : dmChannel.participant_1;
        participantIds = [otherId];
      }

      // Notify all other participants of incoming call
      participantIds.forEach(participantId => {
        const participantSocketId = getSocketIdForUser(participantId);
        if (participantSocketId) {
          io.to(participantSocketId).emit('dm:call-incoming', {
            channelId,
            caller: { id: user.id, username: user.username, avatar: user.avatar, customAvatar: user.customAvatar, color: user.color },
            isGroup: dmChannel.is_group || false
          });
        }
      });

      console.log(`[DM Call] ${user.username} started call in ${channelId}`);
    } catch (err) {
      console.error('[DM Call] Error starting call:', err);
    }
  });

  socket.on('dm:call-decline', ({ channelId }) => {
    const user = state.users[socket.id];
    if (!user) return;

    console.log(`[DM] ${user.username} declined call in ${channelId}`);
    // Notify caller that the call was declined
    const ch = state.voiceChannels[channelId];
    if (ch) {
      ch.users.forEach(socketId => {
        io.to(socketId).emit('dm:call-declined', { channelId, userId: user.id, username: user.username });
      });
    }
  });

};

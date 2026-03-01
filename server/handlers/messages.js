const { v4: uuidv4 } = require('uuid');
const { RateLimiterMemory } = require('rate-limiter-flexible');
const db = require('../db');
const { state, getSocketIdForUser, isUserOnline } = require('../state');
const { findServerByChannelId, getUserPerms, parseMentions, parseChannelLinks, convertDbMessagesToRuntime, convertDbMessages, handleSlashCommand, checkSocketRate, socketRateLimiters, serializeServer, getRandomRoast } = require('../helpers');

const messageLimiter = new RateLimiterMemory({ points: 30, duration: 10 });

module.exports = function(io, socket) {

  socket.on('channel:join', async ({ channelId }) => {
    const user = state.users[socket.id];
    if (!user) return;

    // For server channels, verify membership and view permission
    const srvCheck = findServerByChannelId(channelId);
    if (srvCheck) {
      const member = srvCheck.members[user.id];
      if (!member) return;
      const perms = getUserPerms(user.id, srvCheck.id, channelId);
      if (perms.viewChannel === false) return;
    }

    socket.rooms.forEach(room => {
      if (room !== socket.id && room.startsWith('text:')) socket.leave(room);
    });
    socket.join(`text:${channelId}`);

    // If memory is empty, try loading from database
    if (!state.messages[channelId] || state.messages[channelId].length === 0) {
      try {
        const dbMessages = await db.getChannelMessagesWithAuthors(channelId, 50);
        if (dbMessages.length > 0) {
          state.messages[channelId] = convertDbMessagesToRuntime(dbMessages, channelId);
        } else {
          if (!state.messages[channelId]) state.messages[channelId] = [];
        }
      } catch (err) {
        console.error(`[Channel] Error loading messages from DB for ${channelId}:`, err.message);
        if (!state.messages[channelId]) state.messages[channelId] = [];
      }
    }

    let history = (state.messages[channelId]||[]).slice(-30);

    // For DM channels, filter out messages before the user's delete timestamp
    if (user) {
      try {
        const account = await db.getAccountById(user.id);
        const deletedDMs = account?.settings?.deleted_dms || {};
        if (deletedDMs[channelId]) {
          const deletedAt = deletedDMs[channelId];
          history = history.filter(m => m.timestamp > deletedAt);
        }
      } catch (err) { /* ignore — show all messages if settings lookup fails */ }
    }

    socket.emit('channel:history', { channelId, messages: history, hasMore: (state.messages[channelId]||[]).length > history.length });
  });

  // Lazy load older messages
  socket.on('messages:fetch-older', async ({ channelId, beforeTimestamp, limit = 30 }, callback) => {
    const user = state.users[socket.id];
    if (!user) return;
    if (typeof callback !== 'function') return;

    try {
      const dbMsgs = await db.getMessagesBeforeWithAuthors(channelId, beforeTimestamp, limit);

      let olderMsgs = [];
      if (dbMsgs.length > 0) {
        olderMsgs = convertDbMessagesToRuntime(dbMsgs, channelId);

        // Merge into memory cache for edit/delete/reaction consistency
        const allMsgs = state.messages[channelId] || [];
        const existingIds = new Set(allMsgs.map(m => m.id));
        const newMsgs = olderMsgs.filter(m => !existingIds.has(m.id));
        if (newMsgs.length > 0) {
          state.messages[channelId] = [...newMsgs, ...allMsgs].sort((a, b) => a.timestamp - b.timestamp);
          if (state.messages[channelId].length > 500) {
            state.messages[channelId] = state.messages[channelId].slice(-500);
          }
        }
      }

      // DM deleted-message filtering
      try {
        const account = await db.getAccountById(user.id);
        const deletedDMs = account?.settings?.deleted_dms || {};
        if (deletedDMs[channelId]) {
          const deletedAt = deletedDMs[channelId];
          olderMsgs = olderMsgs.filter(m => m.timestamp > deletedAt);
        }
      } catch (err) { /* ignore */ }

      callback({ messages: olderMsgs, hasMore: dbMsgs.length >= limit });
    } catch (err) {
      console.error('[Messages] Error fetching older messages:', err.message);
      callback({ messages: [], hasMore: false });
    }
  });

  socket.on('message:send', async ({ channelId, content, attachments, replyTo, commandData: clientCommandData }) => {
    const user = state.users[socket.id];
    if (!user) return;
    if (!content?.trim() && !attachments?.length && !clientCommandData) return;

    // Rate limiting
    try {
      await messageLimiter.consume(user.id);
    } catch (error) {
      return socket.emit('error', { message: 'You are sending messages too quickly. Please slow down.' });
    }

    const trimmedContent = content ? content.trim().slice(0, 2000) : '';
    const srv = findServerByChannelId(channelId);

    // For server channels, verify membership and sendMessages permission
    if (srv) {
      const member = srv.members[user.id];
      if (!member) return socket.emit('error', { message: 'Not a member of this server' });
      const perms = getUserPerms(user.id, srv.id, channelId);
      if (!perms.sendMessages && !perms.admin) return socket.emit('error', { message: 'No permission to send messages in this channel' });
    }

    // For DM channels, check if either user has blocked the other and check message request status
    if (!srv) {
      try {
        const dmChannels = await db.getDMChannelsForUser(user.id);
        const dmChannel = dmChannels.find(dm => dm.id === channelId);
        if (dmChannel) {
          const otherUserId = dmChannel.participant_1 === user.id
            ? dmChannel.participant_2
            : dmChannel.participant_1;
          const blockRelation = await db.getBlockRelation(user.id, otherUserId);
          if (blockRelation) {
            return socket.emit('error', { message: 'Cannot send messages to this user' });
          }

          // Check message request status — only the sender (initiator) can send messages while pending
          if (dmChannel.status === 'pending' && dmChannel.initiated_by !== user.id) {
            return socket.emit('error', { message: 'You must accept this message request before replying' });
          }
        }
      } catch (err) {
        console.warn('[Message] Error checking DM block status:', err.message);
      }
    }

    // ── Slash command handling ──
    if (trimmedContent.startsWith('/')) {
      const cmdMatch = trimmedContent.match(/^\/(\w+)\s*([\s\S]*)/);
      if (cmdMatch) {
        const [, cmdName, cmdArgs] = cmdMatch;

        // Handle poll command from client modal
        if (cmdName.toLowerCase() === 'poll' && clientCommandData?.type === 'poll') {
          const pollData = {
            type: 'poll',
            question: (clientCommandData.question || '').slice(0, 200),
            pollType: ['true_false', 'yes_no', 'multiple'].includes(clientCommandData.pollType) ? clientCommandData.pollType : 'yes_no',
            options: (clientCommandData.options || []).slice(0, 10).map(o => String(o).slice(0, 100)),
            votes: {},
            createdBy: user.id
          };
          pollData.options.forEach((_, i) => { pollData.votes[i] = []; });

          const msg = {
            id: uuidv4(), channelId,
            content: `\u{1F4CA} ${user.username} created a poll`,
            attachments: [], author: user, timestamp: Date.now(), reactions: {},
            mentions: { users: [], roles: [], everyone: false },
            commandData: pollData
          };
          if (replyTo) msg.replyTo = replyTo;

          if (!state.messages[channelId]) state.messages[channelId] = [];
          state.messages[channelId].push(msg);
          if (state.messages[channelId].length > 500) state.messages[channelId] = state.messages[channelId].slice(-500);

          try {
            await db.saveMessage({
              id: msg.id, channelId, authorId: user.id, content: msg.content, attachments: [],
              isWebhook: false, replyTo: msg.replyTo || null,
              mentions: msg.mentions, commandData: pollData
            });
          } catch (error) { console.error('[Message] Error saving poll message:', error); }

          io.to(`text:${channelId}`).emit('message:new', msg);
          return;
        }

        // Handle other server-side commands
        const result = await handleSlashCommand(cmdName.toLowerCase(), cmdArgs, user, channelId, srv);

        if (result) {
          if (result.error) {
            return socket.emit('error', { message: result.error });
          }

          const msg = {
            id: uuidv4(), channelId,
            content: result.content,
            attachments: result.attachments || [],
            author: user, timestamp: Date.now(), reactions: {},
            mentions: { users: [], roles: [], everyone: false },
            commandData: result.commandData
          };
          if (replyTo) msg.replyTo = replyTo;

          if (!state.messages[channelId]) state.messages[channelId] = [];
          state.messages[channelId].push(msg);
          if (state.messages[channelId].length > 500) state.messages[channelId] = state.messages[channelId].slice(-500);

          try {
            await db.saveMessage({
              id: msg.id, channelId, authorId: user.id, content: msg.content,
              attachments: msg.attachments, isWebhook: false,
              replyTo: msg.replyTo || null, mentions: msg.mentions,
              commandData: result.commandData
            });
          } catch (error) { console.error('[Message] Error saving command message:', error); }

          io.to(`text:${channelId}`).emit('message:new', msg);

          // Setup remindme timer if needed
          if (result.setupReminder) {
            const { userId, duration, message } = result.setupReminder;
            setTimeout(() => {
              const userSocket = getSocketIdForUser(userId);
              if (userSocket) {
                io.to(userSocket).emit('reminder', { message, channelId, messageId: msg.id });
              }
            }, duration);
          }

          // Setup daily criticize job if needed
          if (result.setupCriticize) {
            const { userId: critUserId, target, channelId: critChannelId, key } = result.setupCriticize;
            const intervalId = setInterval(() => {
              const roast = getRandomRoast(target);
              const botMsg = {
                id: uuidv4(), channelId: critChannelId,
                content: roast,
                author: { id: 'system', username: 'Roast Bot', avatar: '\u{1F525}' },
                timestamp: Date.now(), reactions: {},
                mentions: { users: [], roles: [], everyone: false },
                commandData: { type: 'criticize', target, action: 'daily', roast }
              };
              if (!state.messages[critChannelId]) state.messages[critChannelId] = [];
              state.messages[critChannelId].push(botMsg);
              if (state.messages[critChannelId].length > 500) state.messages[critChannelId] = state.messages[critChannelId].slice(-500);
              io.to(`text:${critChannelId}`).emit('message:new', botMsg);
            }, 24 * 60 * 60 * 1000); // 24 hours
            state.criticizeJobs.set(key, { intervalId, channelId: critChannelId, target, userId: critUserId });
          }

          return;
        }
        // If null, fall through to regular message
      }
    }

    // ── Regular message handling ──
    // Parse @mentions from content
    let mentions = { users: [], roles: [], everyone: false };
    let channelLinks = { channels: [] };
    if (srv) {
      mentions = parseMentions(trimmedContent, srv.id);
      channelLinks = parseChannelLinks(trimmedContent, srv.id);
      // Enforce mentionEveryone permission
      if (mentions.everyone) {
        const perms = getUserPerms(user.id, srv.id, channelId);
        if (!perms.mentionEveryone && !perms.admin) {
          mentions.everyone = false;
        }
      }
    }

    const msg = {
      id: uuidv4(), channelId,
      content: trimmedContent,
      attachments: (attachments||[]).slice(0,4),
      author: user, timestamp: Date.now(), reactions: {},
      mentions,
      channelLinks: channelLinks.channels
    };

    // Add reply reference if provided
    if (replyTo) {
      msg.replyTo = replyTo;
    }

    if (!state.messages[channelId]) state.messages[channelId] = [];
    state.messages[channelId].push(msg);
    if (state.messages[channelId].length > 500) state.messages[channelId] = state.messages[channelId].slice(-500);

    // Save to database
    try {
      await db.saveMessage({
        id: msg.id,
        channelId,
        authorId: user.id,
        content: msg.content,
        attachments: msg.attachments,
        isWebhook: false,
        replyTo: msg.replyTo || null,
        mentions
      });
    } catch (error) {
      console.error('[Message] Error saving message to database:', error);
    }

    io.to(`text:${channelId}`).emit('message:new', msg);

    // If this is a DM channel, ensure the other participant is in the room and notify them
    try {
      const dmChannels = await db.getDMChannelsForUser(user.id);
      const isDMChannel = dmChannels.some(dm => dm.id === channelId);

      if (isDMChannel) {
        const dmChannel = dmChannels.find(dm => dm.id === channelId);
        // Find the other participant
        const otherUserId = dmChannel.participant_1 === user.id
          ? dmChannel.participant_2
          : dmChannel.participant_1;

        // Un-hide the DM for the recipient if they had it hidden/deleted
        try {
          const otherAccount = await db.getAccountById(otherUserId);
          const otherSettings = otherAccount?.settings || {};
          const otherHidden = otherSettings.hidden_dms || [];
          if (otherHidden.includes(channelId)) {
            const updatedHidden = otherHidden.filter(id => id !== channelId);
            await db.pool.query(
              'UPDATE accounts SET settings = COALESCE(settings, \'{}\'::jsonb) || $1::jsonb WHERE id = $2',
              [JSON.stringify({ hidden_dms: updatedHidden }), otherUserId]
            );
          }
        } catch (err) {
          console.warn('[DM] Error un-hiding DM for recipient:', err.message);
        }

        // Find the other participant's socket
        const otherUserSocketId = getSocketIdForUser(otherUserId);

        if (otherUserSocketId) {
          const otherSocket = io.sockets.sockets.get(otherUserSocketId);
          if (otherSocket) {
            // Ensure recipient is in the DM room (they may have reconnected)
            otherSocket.join(`text:${channelId}`);
          }

          // Send updated unread counts to the other participant
          const unreadCounts = await db.getUnreadCounts(otherUserId);
          io.to(otherUserSocketId).emit('dm:unread-counts', { counts: unreadCounts });

          // Notify recipient about the DM channel if they don't have it yet
          const otherUser = state.users[otherUserSocketId];
          const senderAccount = await db.getAccountById(user.id);
          if (otherSocket && senderAccount) {
            otherSocket.emit('dm:created', {
              channel: {
                id: channelId,
                name: senderAccount.username,
                type: 'dm',
                isDM: true,
                participant: {
                  id: senderAccount.id,
                  username: senderAccount.username,
                  avatar: senderAccount.avatar,
                  customAvatar: senderAccount.custom_avatar,
                  color: senderAccount.color,
                  status: senderAccount.status,
                  bio: senderAccount.bio
                },
                createdAt: new Date(dmChannel.created_at).getTime()
              },
              messages: [],
              navigate: false
            });
          }
        }
      }
    } catch (error) {
      console.error('[Message] Error updating DM unread counts:', error);
    }
  });

  socket.on('message:react', ({ channelId, messageId, emoji }) => {
    const user = state.users[socket.id];
    if (!user) return;
    const msg = (state.messages[channelId]||[]).find(m => m.id === messageId);
    if (!msg) return;
    if (!msg.reactions[emoji]) msg.reactions[emoji] = [];
    const idx = msg.reactions[emoji].indexOf(user.id);
    if (idx === -1) msg.reactions[emoji].push(user.id);
    else {
      msg.reactions[emoji].splice(idx, 1);
      if (!msg.reactions[emoji].length) delete msg.reactions[emoji];
    }

    // Persist reactions to database
    db.updateMessageReactions(messageId, msg.reactions).catch(err => {
      console.error('[Messages] Failed to persist reactions:', err.message);
    });

    io.to(`text:${channelId}`).emit('message:reaction', { messageId, reactions: msg.reactions });
  });

  // ── Poll Voting ──
  socket.on('poll:vote', ({ channelId, messageId, optionIndex }) => {
    const user = state.users[socket.id];
    if (!user) return;

    const msg = (state.messages[channelId] || []).find(m => m.id === messageId);
    if (!msg || !msg.commandData || msg.commandData.type !== 'poll') return;

    const poll = msg.commandData;
    if (optionIndex < 0 || optionIndex >= poll.options.length) return;

    // Remove user's previous vote
    for (const key of Object.keys(poll.votes)) {
      const idx = poll.votes[key].indexOf(user.id);
      if (idx !== -1) poll.votes[key].splice(idx, 1);
    }

    // Add new vote
    if (!poll.votes[optionIndex]) poll.votes[optionIndex] = [];
    poll.votes[optionIndex].push(user.id);

    // Persist to DB
    db.query('UPDATE messages SET command_data = $1 WHERE id = $2', [JSON.stringify(poll), messageId]).catch(err => {
      console.error('[Poll] Error persisting vote:', err.message);
    });

    io.to(`text:${channelId}`).emit('poll:updated', { channelId, messageId, commandData: poll });
  });

  socket.on('message:delete', async ({ channelId, messageId }) => {
    const user = state.users[socket.id];
    if (!user) return;

    const messages = state.messages[channelId] || [];
    const msgIndex = messages.findIndex(m => m.id === messageId);

    // Check permissions using in-memory message or fall back to database
    const srv = findServerByChannelId(channelId);
    const perms = srv ? getUserPerms(user.id, srv.id, channelId) : {};
    const canManage = perms.manageMessages || perms.admin;

    if (msgIndex !== -1) {
      const msg = messages[msgIndex];
      const isAuthor = msg.author?.id === user.id;
      if (!isAuthor && !canManage) {
        return socket.emit('error', { message: 'You do not have permission to delete this message' });
      }
      // Remove from memory
      state.messages[channelId].splice(msgIndex, 1);
    } else {
      // Message not in memory — verify it exists in DB and check permissions
      const dbMsg = await db.getMessageById(messageId);
      if (!dbMsg) return;
      const isAuthor = dbMsg.author_id === user.id;
      if (!isAuthor && !canManage) {
        return socket.emit('error', { message: 'You do not have permission to delete this message' });
      }
    }

    // Delete from database
    try {
      await db.deleteMessage(messageId);
    } catch (error) {
      console.error('[Message] Error deleting message from database:', error);
    }

    // Broadcast deletion
    io.to(`text:${channelId}`).emit('message:deleted', { channelId, messageId });
  });

  socket.on('message:edit', async ({ channelId, messageId, content }) => {
    const user = state.users[socket.id];
    if (!user) return;
    if (!content?.trim()) return;

    const messages = state.messages[channelId] || [];
    const msg = messages.find(m => m.id === messageId);
    if (!msg) return;

    // Only author can edit their own message
    if (msg.author.id !== user.id) {
      return socket.emit('error', { message: 'You can only edit your own messages' });
    }

    // Webhooks cannot be edited
    if (msg.isWebhook) {
      return socket.emit('error', { message: 'Webhook messages cannot be edited' });
    }

    // Update message
    msg.content = content.trim().slice(0, 2000);
    msg.editedAt = Date.now();

    // Update in database (all messages)
    try {
      await db.updateMessage(messageId, msg.content, msg.editedAt);
    } catch (error) {
      console.error('[Message] Error updating message in database:', error);
      // Continue even if database update fails
    }

    // Broadcast edit
    io.to(`text:${channelId}`).emit('message:edited', {
      channelId,
      messageId,
      content: msg.content,
      editedAt: msg.editedAt
    });
  });

  // ─── Message Pinning ─────────────────────────────────────────────────────────
  socket.on('message:pin', async ({ channelId, messageId }) => {
    const user = state.users[socket.id];
    if (!user) return;

    const srv = findServerByChannelId(channelId);
    if (!srv) return socket.emit('error', { message: 'Channel not found' });

    const perms = getUserPerms(user.id, srv.id, channelId);
    if (!perms.manageMessages && !perms.admin) {
      return socket.emit('error', { message: 'You need Manage Messages permission to pin messages' });
    }

    // Check pin limit (50 per channel)
    const pinCount = await db.getPinnedCount(channelId);
    if (pinCount >= 50) {
      return socket.emit('error', { message: 'This channel has reached the maximum of 50 pinned messages' });
    }

    try {
      await db.pinMessage(messageId, user.id);

      // Update in-memory message if present
      const msgs = state.messages[channelId] || [];
      const msg = msgs.find(m => m.id === messageId);
      if (msg) {
        msg.pinned = true;
        msg.pinnedAt = Date.now();
        msg.pinnedBy = user.id;
      }

      io.to(`text:${channelId}`).emit('message:pinned', { channelId, messageId, pinnedBy: user.id, pinnedAt: Date.now() });

      db.createAuditLog(srv.id, 'message_pin', user.id, messageId, { channelId }).catch(() => {});
    } catch (err) {
      console.error('[Pin] Error pinning message:', err.message);
      socket.emit('error', { message: 'Failed to pin message' });
    }
  });

  socket.on('message:unpin', async ({ channelId, messageId }) => {
    const user = state.users[socket.id];
    if (!user) return;

    const srv = findServerByChannelId(channelId);
    if (!srv) return socket.emit('error', { message: 'Channel not found' });

    const perms = getUserPerms(user.id, srv.id, channelId);
    if (!perms.manageMessages && !perms.admin) {
      return socket.emit('error', { message: 'You need Manage Messages permission to unpin messages' });
    }

    try {
      await db.unpinMessage(messageId);

      const msgs = state.messages[channelId] || [];
      const msg = msgs.find(m => m.id === messageId);
      if (msg) {
        msg.pinned = false;
        msg.pinnedAt = null;
        msg.pinnedBy = null;
      }

      io.to(`text:${channelId}`).emit('message:unpinned', { channelId, messageId });

      db.createAuditLog(srv.id, 'message_unpin', user.id, messageId, { channelId }).catch(() => {});
    } catch (err) {
      console.error('[Pin] Error unpinning message:', err.message);
      socket.emit('error', { message: 'Failed to unpin message' });
    }
  });

  socket.on('messages:get-pinned', async ({ channelId }) => {
    const user = state.users[socket.id];
    if (!user) return;

    try {
      const dbPinned = await db.getPinnedMessages(channelId);
      const pinned = dbPinned.map(row => ({
        id: row.id,
        channelId: row.channel_id,
        content: row.content,
        attachments: typeof row.attachments === 'string' ? JSON.parse(row.attachments || '[]') : (row.attachments || []),
        author: {
          id: row.author_id,
          username: row.author_username || 'Deleted User',
          avatar: row.author_avatar || '\u{1F47B}',
          customAvatar: row.author_custom_avatar,
          color: row.author_color || '#80848E'
        },
        timestamp: new Date(row.created_at).getTime(),
        reactions: typeof row.reactions === 'string' ? JSON.parse(row.reactions || '{}') : (row.reactions || {}),
        pinned: true,
        pinnedAt: row.pinned_at ? new Date(row.pinned_at).getTime() : null,
        pinnedBy: row.pinned_by
      }));
      socket.emit('messages:pinned', { channelId, messages: pinned });
    } catch (err) {
      console.error('[Pin] Error fetching pinned messages:', err.message);
    }
  });

  // ─── Message Search ─────────────────────────────────────────────────────────
  socket.on('messages:search', async ({ serverId, query: searchQuery, channelId, authorId, before, after }) => {
    const user = state.users[socket.id];
    if (!user) return;
    if (!searchQuery?.trim()) return;

    const srv = state.servers[serverId];
    if (!srv) return socket.emit('error', { message: 'Server not found' });
    if (!srv.members[user.id]) return socket.emit('error', { message: 'Not a member of this server' });

    try {
      const dbResults = await db.searchMessages(serverId, {
        query: searchQuery.trim(),
        channelId,
        authorId,
        before,
        after,
        limit: 25
      });

      const results = dbResults.map(row => ({
        id: row.id,
        channelId: row.channel_id,
        content: row.content,
        attachments: typeof row.attachments === 'string' ? JSON.parse(row.attachments || '[]') : (row.attachments || []),
        author: {
          id: row.author_id,
          username: row.author_username || 'Deleted User',
          avatar: row.author_avatar || '\u{1F47B}',
          customAvatar: row.author_custom_avatar,
          color: row.author_color || '#80848E'
        },
        timestamp: new Date(row.created_at).getTime(),
        reactions: typeof row.reactions === 'string' ? JSON.parse(row.reactions || '{}') : (row.reactions || {})
      }));

      socket.emit('messages:search-results', { results, query: searchQuery });
    } catch (err) {
      console.error('[Search] Error searching messages:', err.message);
      socket.emit('error', { message: 'Search failed' });
    }
  });

  // ─── Message Threads ────────────────────────────────────────────────────────
  socket.on('thread:reply', async ({ channelId, threadId, content, attachments }) => {
    const user = state.users[socket.id];
    if (!user) return;
    if (!content?.trim() && !attachments?.length) return;

    try {
      await messageLimiter.consume(user.id);
    } catch (error) {
      return socket.emit('error', { message: 'You are sending messages too quickly.' });
    }

    const srv = findServerByChannelId(channelId);
    if (srv) {
      const perms = getUserPerms(user.id, srv.id, channelId);
      if (!perms.sendMessages && !perms.admin) {
        return socket.emit('error', { message: 'No permission to send messages' });
      }
    }

    const msgId = uuidv4();
    const trimmedContent = content ? content.trim().slice(0, 2000) : '';

    try {
      await db.saveThreadMessage({
        id: msgId,
        channelId,
        authorId: user.id,
        content: trimmedContent,
        attachments: (attachments || []).slice(0, 4),
        threadId
      });

      const threadMsg = {
        id: msgId,
        channelId,
        threadId,
        content: trimmedContent,
        attachments: (attachments || []).slice(0, 4),
        author: user,
        timestamp: Date.now(),
        reactions: {}
      };

      // Get updated thread info
      const threadInfo = await db.getThreadInfo(threadId);

      io.to(`text:${channelId}`).emit('thread:new-reply', {
        channelId,
        threadId,
        message: threadMsg,
        replyCount: parseInt(threadInfo.reply_count),
        lastReplyAt: new Date(threadInfo.last_reply_at).getTime()
      });
    } catch (err) {
      console.error('[Thread] Error saving thread reply:', err.message);
      socket.emit('error', { message: 'Failed to send thread reply' });
    }
  });

  socket.on('thread:get', async ({ channelId, threadId }) => {
    const user = state.users[socket.id];
    if (!user) return;

    try {
      const dbMessages = await db.getThreadMessages(threadId);
      const parentMsg = await db.getMessageById(threadId);

      const messages = dbMessages.map(row => ({
        id: row.id,
        channelId: row.channel_id,
        threadId: row.thread_id,
        content: row.content,
        attachments: typeof row.attachments === 'string' ? JSON.parse(row.attachments || '[]') : (row.attachments || []),
        author: {
          id: row.author_id,
          username: row.author_username || 'Deleted User',
          avatar: row.author_avatar || '\u{1F47B}',
          customAvatar: row.author_custom_avatar,
          color: row.author_color || '#80848E'
        },
        timestamp: new Date(row.created_at).getTime(),
        reactions: typeof row.reactions === 'string' ? JSON.parse(row.reactions || '{}') : (row.reactions || {})
      }));

      let parent = null;
      if (parentMsg) {
        let author = Object.values(state.users).find(u => u.id === parentMsg.author_id);
        if (!author) {
          author = {
            id: parentMsg.author_id,
            username: parentMsg.author_username || 'Deleted User',
            avatar: parentMsg.author_avatar || '\u{1F47B}',
            customAvatar: parentMsg.author_custom_avatar,
            color: parentMsg.author_color || '#80848E'
          };
        }
        parent = {
          id: parentMsg.id,
          channelId: parentMsg.channel_id,
          content: parentMsg.content,
          attachments: typeof parentMsg.attachments === 'string' ? JSON.parse(parentMsg.attachments || '[]') : (parentMsg.attachments || []),
          author,
          timestamp: new Date(parentMsg.created_at).getTime(),
          reactions: typeof parentMsg.reactions === 'string' ? JSON.parse(parentMsg.reactions || '{}') : (parentMsg.reactions || {})
        };
      }

      socket.emit('thread:messages', { channelId, threadId, parent, messages });
    } catch (err) {
      console.error('[Thread] Error fetching thread:', err.message);
    }
  });

  // ─── Bookmarks / Saved Messages ─────────────────────────────────────────────
  socket.on('message:save', async ({ messageId, channelId }) => {
    const user = state.users[socket.id];
    if (!user) return;

    const srv = findServerByChannelId(channelId);
    const serverId = srv ? srv.id : null;

    try {
      await db.saveBookmark(user.id, messageId, channelId, serverId);
      socket.emit('message:saved', { messageId });
    } catch (err) {
      console.error('[Bookmark] Error saving bookmark:', err.message);
    }
  });

  socket.on('message:unsave', async ({ messageId }) => {
    const user = state.users[socket.id];
    if (!user) return;

    try {
      await db.removeBookmark(user.id, messageId);
      socket.emit('message:unsaved', { messageId });
    } catch (err) {
      console.error('[Bookmark] Error removing bookmark:', err.message);
    }
  });

};

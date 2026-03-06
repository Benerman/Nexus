const { v4: uuidv4 } = require('uuid');
const { RateLimiterMemory } = require('rate-limiter-flexible');
const crypto = require('crypto');
const { state, getSocketIdForUser, isUserOnline, channelToServer } = require('./state');
const utils = require('./utils');

const { DEFAULT_PERMS, makeCategory, parseDuration, CRITICIZE_ROASTS, getRandomRoast } = utils;

// ─── Constants ───────────────────────────────────────────────────────────────
const COLORS = ['#3B82F6','#57F287','#FEE75C','#EB459E','#ED4245','#60A5FA','#3ba55c','#faa61a'];
const AVATARS = ['🐺','🦊','🐱','🐸','🦁','🐙','🦄','🐧','🦅','🐉','🦋','🐻'];

// ─── Rate limiters ───────────────────────────────────────────────────────────
const socketRateLimiters = {
  serverCreate: new RateLimiterMemory({ points: 3, duration: 60 }),
  channelCreate: new RateLimiterMemory({ points: 10, duration: 60 }),
  channelDelete: new RateLimiterMemory({ points: 10, duration: 60 }),
  roleCreate: new RateLimiterMemory({ points: 10, duration: 60 }),
  emojiUpload: new RateLimiterMemory({ points: 5, duration: 60 }),
  dmCreate: new RateLimiterMemory({ points: 10, duration: 60 }),
  userUpdate: new RateLimiterMemory({ points: 10, duration: 60 }),
  typing: new RateLimiterMemory({ points: 20, duration: 10 }),
  react: new RateLimiterMemory({ points: 30, duration: 10 }),
};

const soundboardLimiter = new RateLimiterMemory({ points: 10, duration: 10 });

async function checkSocketRate(limiter, key, socket) {
  try {
    await limiter.consume(key);
    return true;
  } catch {
    socket.emit('error', { message: 'Rate limit exceeded. Please slow down.' });
    return false;
  }
}

// ─── Server helpers ──────────────────────────────────────────────────────────
function makeServer(id, name, icon, ownerId, customIcon=null) {
  const genCat = makeCategory('GENERAL', 0);
  const voiceCat = makeCategory('VOICE', 1);

  const textChannels = [
    { id: uuidv4(), name:'general', type:'text', description:'General chat', serverId:id, categoryId:genCat.id, topic:'', nsfw:false, slowMode:0, webhooks:[], position:0, isPrivate:false, permissionOverrides:{} },
    { id: uuidv4(), name:'announcements', type:'text', description:'Server announcements', serverId:id, categoryId:genCat.id, topic:'', nsfw:false, slowMode:0, webhooks:[], position:1, isPrivate:false, permissionOverrides:{} },
  ];
  const voiceChannels = [
    { id: uuidv4(), name:'Lounge', type:'voice', serverId:id, categoryId:voiceCat.id, webhooks:[], position:0, isPrivate:false, permissionOverrides:{} },
    { id: uuidv4(), name:'Gaming', type:'voice', serverId:id, categoryId:voiceCat.id, webhooks:[], position:1, isPrivate:false, permissionOverrides:{} },
  ];

  genCat.channels = textChannels.map(c=>c.id);
  voiceCat.channels = voiceChannels.map(c=>c.id);

  return {
    id, name, icon: icon||'N', customIcon, ownerId,
    description: 'A Nexus server', createdAt: Date.now(),
    categories: { [genCat.id]:genCat, [voiceCat.id]:voiceCat },
    categoryOrder: [genCat.id, voiceCat.id],
    roles: {
      'everyone': { id:'everyone', name:'@everyone', color:null, position:0, permissions:{...DEFAULT_PERMS} },
      'admin': { id:'admin', name:'Admin', color:'#ED4245', position:1, permissions:{
        viewChannel:true, sendMessages:true, attachFiles:true, joinVoice:true,
        readHistory:true, addReactions:true, mentionEveryone:true, manageMessages:true,
        manageChannels:true, manageRoles:true, manageServer:true, admin:true,
        createInvite:true, sendTargetedSounds:true, manageEmojis:true
      }}
    },
    members: {},
    channels: { text: textChannels, voice: voiceChannels },
    customEmojis: [],
    emojiSharing: false
  };
}

function serializeServer(serverId) {
  const srv = state.servers[serverId];
  if (!srv) return null;
  return {
    id: srv.id, name: srv.name, icon: srv.icon, customIcon: srv.customIcon,
    description: srv.description, ownerId: srv.ownerId,
    roles: srv.roles, channels: srv.channels, categories: srv.categories,
    categoryOrder: srv.categoryOrder || [],
    members: srv.members || {},
    memberCount: Object.keys(srv.members).length,
    isPersonal: srv.isPersonal || false,
    type: srv.type,
    soundboard: srv.soundboard || [],
    customEmojis: (srv.customEmojis || []).map(e => ({ id: e.id, name: e.name, contentType: e.content_type || e.contentType, animated: e.animated })),
    emojiSharing: srv.emojiSharing || false,
    lanMode: srv.lanMode || false
  };
}

function findServerByChannelId(channelId) {
  const serverId = channelToServer.get(channelId);
  if (serverId) {
    const srv = state.servers[serverId];
    if (srv && !srv.isPersonal) return srv;
  }
  return null;
}

function getOnlineUsers() {
  const seen = new Set();
  return Object.values(state.users).filter(u => {
    if (seen.has(u.id)) return false;
    seen.add(u.id);
    return true;
  });
}

function getVoiceChannelState(serverId) {
  const srv = state.servers[serverId];
  if (!srv) return {};
  const result = {};
  srv.channels.voice.forEach(ch => {
    const vc = state.voiceChannels[ch.id] || { users:[], screenSharers:[] };
    result[ch.id] = { ...vc, users: vc.users.map(s=>state.users[s]).filter(Boolean) };
  });
  return result;
}

function getUserPerms(userId, serverId, channelId=null) {
  return utils.getUserPerms(userId, state.servers[serverId], channelId);
}

function parseMentions(content, serverId) {
  return utils.parseMentions(content, state.servers[serverId]);
}

function parseChannelLinks(content, serverId) {
  return utils.parseChannelLinks(content, state.servers[serverId], serverId);
}

function getUserHighestRolePosition(userId, serverId) {
  return utils.getUserHighestRolePosition(userId, state.servers[serverId]);
}

// ─── Message conversion (synchronous when JOIN data available) ───────────────

/**
 * Convert DB messages with author JOIN data to runtime format — synchronous, no DB calls.
 * Falls back to state.users lookup, then "Deleted User" placeholder.
 */
function convertDbMessagesToRuntime(dbMessages, channelId) {
  return dbMessages.map(dbMsg => {
    try {
      let author;

      if (dbMsg.is_webhook) {
        author = {
          id: `webhook:${dbMsg.id}`,
          username: dbMsg.webhook_username || 'Webhook',
          avatar: dbMsg.webhook_avatar || '🤖',
          color: '#60A5FA',
          isWebhook: true
        };
      } else if (dbMsg.author_username) {
        // Use JOIN data from query
        author = {
          id: dbMsg.author_id,
          username: dbMsg.author_username,
          avatar: dbMsg.author_avatar,
          customAvatar: dbMsg.author_custom_avatar,
          color: dbMsg.author_color
        };
      } else {
        // Fall back to in-memory user lookup
        const socketId = getSocketIdForUser(dbMsg.author_id);
        const onlineUser = socketId ? state.users[socketId] : null;
        author = onlineUser || { id: dbMsg.author_id, username: 'Deleted User', avatar: '👻', color: '#80848E' };
      }

      return {
        id: dbMsg.id,
        channelId,
        content: dbMsg.content,
        attachments: typeof dbMsg.attachments === 'string' ? JSON.parse(dbMsg.attachments || '[]') : (dbMsg.attachments || []),
        author,
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
        threadName: dbMsg.thread_name || null,
        threadReplyCount: dbMsg.thread_reply_count || 0,
        threadLastReplyAt: dbMsg.thread_last_reply_at ? new Date(dbMsg.thread_last_reply_at).getTime() : null,
        threadLastReplyContent: dbMsg.thread_last_reply_content || null,
        threadLastReplyAuthor: dbMsg.thread_last_reply_author || null,
        threadLastReplyAuthorColor: dbMsg.thread_last_reply_author_color || null,
        encrypted: dbMsg.encrypted || false
      };
    } catch (err) {
      console.error(`[Messages] Error converting message ${dbMsg.id} (webhook=${dbMsg.is_webhook}):`, err.message);
      return null;
    }
  }).filter(m => m !== null);
}

/**
 * Legacy async convertDbMessages — used for cases without JOIN data.
 * Falls back to per-message DB call for offline authors.
 */
async function convertDbMessages(dbMessages, channelId) {
  const db = require('./db');
  const results = await Promise.all(dbMessages.map(async (dbMsg) => {
    try {
      // Try in-memory first via index
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
        } else if (dbMsg.author_username) {
          // Use JOIN data if available
          author = {
            id: dbMsg.author_id,
            username: dbMsg.author_username,
            avatar: dbMsg.author_avatar,
            customAvatar: dbMsg.author_custom_avatar,
            color: dbMsg.author_color
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
        threadName: dbMsg.thread_name || null,
        threadReplyCount: dbMsg.thread_reply_count || 0,
        threadLastReplyAt: dbMsg.thread_last_reply_at ? new Date(dbMsg.thread_last_reply_at).getTime() : null,
        threadLastReplyContent: dbMsg.thread_last_reply_content || null,
        threadLastReplyAuthor: dbMsg.thread_last_reply_author || null,
        threadLastReplyAuthorColor: dbMsg.thread_last_reply_author_color || null,
        encrypted: dbMsg.encrypted || false
      };
    } catch (err) {
      console.error(`[Messages] Error converting message ${dbMsg.id} (webhook=${dbMsg.is_webhook}):`, err.message);
      return null;
    }
  }));
  return results.filter(m => m !== null);
}

// ─── ICE / TURN helpers ─────────────────────────────────────────────────────
function generateTurnCredentials(secret, userId) {
  const ttl = 3600;
  const timestamp = Math.floor(Date.now() / 1000) + ttl;
  const username = `${timestamp}:${userId}`;
  const hmac = crypto.createHmac('sha1', secret);
  hmac.update(username);
  const credential = hmac.digest('base64');
  return { username, credential };
}

function buildIceServers(serverId, userId) {
  const config = require('./config');
  const srv = state.servers[serverId];

  // LAN mode: no external STUN/TURN — force direct LAN connections only
  if (srv?.lanMode) return [];

  const iceConfig = srv?.iceConfig;

  const stunUrls = iceConfig?.stunUrls?.length > 0
    ? iceConfig.stunUrls
    : config.webrtc.stunUrls;

  const turnUrl = iceConfig?.turnUrl || config.webrtc.turnUrl;
  const turnSecret = iceConfig?.turnSecret || config.webrtc.turnSecret;

  const servers = stunUrls.map(url => ({ urls: url }));

  if (turnUrl && turnSecret) {
    const { username, credential } = generateTurnCredentials(turnSecret, userId);
    servers.push({ urls: turnUrl, username, credential });
  }

  return servers;
}

// ─── Voice helpers ───────────────────────────────────────────────────────────
function leaveVoice(socket, io) {
  for (const [chId, chData] of Object.entries(state.voiceChannels)) {
    const idx = chData.users.indexOf(socket.id);
    if (idx !== -1) {
      chData.users.splice(idx, 1);
      const ssIdx = chData.screenSharers ? chData.screenSharers.indexOf(socket.id) : -1;
      if (ssIdx !== -1) {
        chData.screenSharers.splice(ssIdx, 1);
        io.to(`voice:${chId}`).emit('screen:stopped', { socketId: socket.id });
      }
      socket.leave(`voice:${chId}`);
      socket.to(`voice:${chId}`).emit('peer:left', { socketId: socket.id });

      const leavingUser = state.users[socket.id];
      if (chData.isDMCall) {
        console.log(`[Voice] ${leavingUser?.username || 'Unknown'} left DM call ${chId}`);
        io.emit('voice:channel:update', { channelId: chId, channel: { ...chData, users: chData.users.map(s=>state.users[s]).filter(Boolean) } });
        if (chData.users.length === 0) {
          if (chData.endTimer) clearTimeout(chData.endTimer);
          chData.endTimer = setTimeout(() => {
            if (state.voiceChannels[chId] && state.voiceChannels[chId].users.length === 0) {
              io.emit('dm:call-ended', { channelId: chId });
              delete state.voiceChannels[chId];
            }
          }, 30000);
        }
      } else {
        const srvId = channelToServer.get(chId);
        const srv = srvId && state.servers[srvId];
        const voiceCh = srv?.channels.voice.find(c => c.id === chId);
        if (voiceCh) {
          console.log(`[Voice] ${leavingUser?.username || 'Unknown'} left ${voiceCh.name} in ${srv.name}`);
          io.emit('voice:channel:update', {
            channelId: chId,
            channel: { ...chData, users: chData.users.map(s=>state.users[s]).filter(Boolean) }
          });
          io.to(`voice:${chId}`).emit('voice:cue', { type: 'leave', user: state.users[socket.id], customSound: state.users[socket.id]?.exitSound || null, customSoundVolume: state.users[socket.id]?.exitSoundVolume ?? 100 });
        }
      }
    }
  }
}

// ─── Personal Server (DM container) ─────────────────────────────────────────
async function createPersonalServer(userId, dmChannels) {
  const db = require('./db');
  const unreadCounts = await db.getUnreadCounts(userId);
  const account = await db.getAccountById(userId);
  const hiddenDMs = account?.settings?.hidden_dms || [];
  const visibleDMChannels = dmChannels.filter(ch => !hiddenDMs.includes(ch.id));

  const dmTextChannels = await Promise.all(visibleDMChannels.map(async (dmChannel) => {
    const messages = await db.getChannelMessages(dmChannel.id, 1);
    let lastMessage = null;
    if (messages.length > 0) {
      const dbMsg = messages[0];
      lastMessage = {
        id: dbMsg.id,
        content: dbMsg.content,
        timestamp: new Date(dbMsg.created_at).getTime(),
        authorId: dbMsg.author_id,
        encrypted: dbMsg.encrypted || false
      };
    }

    if (dmChannel.is_group) {
      const participants = await db.getGroupDMParticipants(dmChannel.id);
      const otherParticipants = participants.filter(p => p.id !== userId);

      return {
        id: dmChannel.id,
        name: dmChannel.name || otherParticipants.map(p => p.username).join(', '),
        type: 'group-dm',
        isDM: true,
        isGroup: true,
        participants: otherParticipants.map(p => ({
          id: p.id,
          username: p.username,
          avatar: p.avatar,
          customAvatar: p.custom_avatar,
          color: p.color,
          status: isUserOnline(p.id) ? 'online' : (p.status || 'offline')
        })),
        lastMessage,
        unreadCount: unreadCounts[dmChannel.id] || 0,
        position: 0,
        createdAt: new Date(dmChannel.created_at).getTime()
      };
    }

    const otherUserId = dmChannel.participant_1 === userId
      ? dmChannel.participant_2
      : dmChannel.participant_1;

    const participantAccount = await db.getAccountById(otherUserId);
    const participant = participantAccount ? {
      id: participantAccount.id,
      username: participantAccount.username,
      avatar: participantAccount.avatar,
      customAvatar: participantAccount.custom_avatar,
      color: participantAccount.color,
      status: participantAccount.status || 'offline',
      bio: participantAccount.bio,
      publicKey: participantAccount.public_key || null
    } : {
      id: otherUserId,
      username: 'Unknown User',
      avatar: '❓',
      color: '#60A5FA',
      status: 'offline'
    };

    if (isUserOnline(otherUserId)) {
      participant.status = 'online';
    }

    const isChannelPending = dmChannel.status === 'pending';
    let messageRequest = null;
    if (isChannelPending) {
      messageRequest = dmChannel.initiated_by === userId ? 'sent' : 'received';
    }

    return {
      id: dmChannel.id,
      name: participant.username,
      type: 'dm',
      isDM: true,
      participant,
      lastMessage,
      messageRequest,
      unreadCount: unreadCounts[dmChannel.id] || 0,
      position: 0,
      createdAt: new Date(dmChannel.created_at).getTime()
    };
  }));

  return {
    id: `personal:${userId}`,
    name: 'Direct Messages',
    icon: '💬',
    customIcon: null,
    type: 'personal',
    isPersonal: true,
    description: 'Your personal direct messages',
    ownerId: userId,
    members: { [userId]: { roles: ['everyone'], joinedAt: Date.now() } },
    roles: {
      everyone: { name: 'everyone', color: '#99AAB5', permissions: {} }
    },
    categories: {
      'dm-category': {
        id: 'dm-category',
        name: 'Direct Messages',
        position: 0,
        channels: dmTextChannels.map(ch => ch.id)
      }
    },
    categoryOrder: ['dm-category'],
    channels: { text: dmTextChannels, voice: [] }
  };
}

// ─── Search Filter Parsing ───────────────────────────────────────────────────

/**
 * Parse Gmail-style search operators from a query string.
 * Supported: from:user, in:channel, before:YYYY-MM-DD, after:YYYY-MM-DD,
 *            has:attachment|image|link, is:pinned
 * Returns { text, filters } where text is the remaining query and filters
 * contains extracted key-value pairs.
 */
function parseSearchFilters(query) {
  if (!query || typeof query !== 'string') return { text: '', filters: {} };

  const filters = {};
  const operatorRegex = /\b(from|in|before|after|has|is):(\S+)/gi;

  const text = query.replace(operatorRegex, (match, key, value) => {
    const k = key.toLowerCase();
    const v = value.toLowerCase();

    switch (k) {
      case 'from':
        filters.from = v;
        break;
      case 'in':
        filters.in = v;
        break;
      case 'before': {
        const ts = Date.parse(value);
        if (!isNaN(ts)) filters.before = ts;
        break;
      }
      case 'after': {
        const ts = Date.parse(value);
        if (!isNaN(ts)) filters.after = ts;
        break;
      }
      case 'has':
        if (['attachment', 'image', 'link'].includes(v)) {
          if (!filters.has) filters.has = [];
          filters.has.push(v);
        }
        break;
      case 'is':
        if (v === 'pinned') filters.isPinned = true;
        break;
    }
    return '';
  }).replace(/\s+/g, ' ').trim();

  return { text, filters };
}

// ─── Slash Commands ──────────────────────────────────────────────────────────
const EIGHT_BALL_RESPONSES = [
  'It is certain.', 'It is decidedly so.', 'Without a doubt.', 'Yes definitely.',
  'You may rely on it.', 'As I see it, yes.', 'Most likely.', 'Outlook good.',
  'Yes.', 'Signs point to yes.', 'Reply hazy, try again.', 'Ask again later.',
  'Better not tell you now.', 'Cannot predict now.', 'Concentrate and ask again.',
  "Don't count on it.", 'My reply is no.', 'My sources say no.',
  'Outlook not so good.', 'Very doubtful.'
];

async function handleSlashCommand(cmdName, args, user, channelId, server) {
  switch (cmdName) {
    case 'roll': {
      const match = args.match(/d?(\d+)/i);
      const sides = match ? Math.min(Math.max(parseInt(match[1]), 2), 1000) : 6;
      const result = Math.floor(Math.random() * sides) + 1;
      return {
        content: `🎲 ${user.username} rolled a d${sides}`,
        commandData: { type: 'roll', sides, result }
      };
    }
    case 'coinflip':
    case 'flip': {
      const result = Math.random() < 0.5 ? 'heads' : 'tails';
      return {
        content: `🪙 ${user.username} flipped a coin`,
        commandData: { type: 'coinflip', result }
      };
    }
    case '8ball': {
      const question = args.trim();
      if (!question) return { error: 'Please provide a question. Usage: /8ball <question>' };
      const answer = EIGHT_BALL_RESPONSES[Math.floor(Math.random() * EIGHT_BALL_RESPONSES.length)];
      return {
        content: `🎱 ${user.username} asked the Magic 8-Ball`,
        commandData: { type: '8ball', question, answer }
      };
    }
    case 'choose': {
      const options = args.split('|').map(s => s.trim()).filter(Boolean);
      if (options.length < 2) return { error: 'Provide at least 2 options separated by |. Usage: /choose pizza | tacos | burgers' };
      const result = options[Math.floor(Math.random() * options.length)];
      return {
        content: `🤔 ${user.username} asked me to choose`,
        commandData: { type: 'choose', options, result }
      };
    }
    case 'rps': {
      const choices = ['rock', 'paper', 'scissors'];
      const userChoice = args.trim().toLowerCase();
      if (!choices.includes(userChoice)) return { error: 'Usage: /rps <rock|paper|scissors>' };
      const botChoice = choices[Math.floor(Math.random() * 3)];
      let result;
      if (userChoice === botChoice) result = 'tie';
      else if (
        (userChoice === 'rock' && botChoice === 'scissors') ||
        (userChoice === 'paper' && botChoice === 'rock') ||
        (userChoice === 'scissors' && botChoice === 'paper')
      ) result = 'win';
      else result = 'lose';
      return {
        content: `✊ ${user.username} played Rock Paper Scissors`,
        commandData: { type: 'rps', userChoice, botChoice, result }
      };
    }
    case 'serverinfo': {
      if (!server) return { error: 'This command can only be used in a server channel.' };
      return {
        content: '📋 Server Information',
        commandData: {
          type: 'serverinfo',
          name: server.name,
          memberCount: Object.keys(server.members || {}).length,
          channelCount: (server.channels?.text?.length || 0) + (server.channels?.voice?.length || 0),
          roleCount: Object.keys(server.roles || {}).length,
          ownerId: server.ownerId
        }
      };
    }
    case 'remindme': {
      const remindMatch = args.match(/^(\d+\s*[smhdw])\s*(.*)/i);
      if (!remindMatch) return { error: 'Usage: /remindme <duration> <message>. Example: /remindme 2h Check the deployment' };
      const duration = parseDuration(remindMatch[1].replace(/\s/g, ''));
      const message = remindMatch[2].trim() || 'Reminder!';
      if (!duration) return { error: 'Invalid duration. Use: 30s, 5m, 2h, 1d, 1w' };
      if (duration > 604800000) return { error: 'Maximum reminder duration is 1 week.' };
      return {
        content: `⏰ ${user.username} set a reminder`,
        commandData: { type: 'remindme', duration: remindMatch[1].replace(/\s/g, ''), message, remindAt: Date.now() + duration },
        setupReminder: { userId: user.id, duration, message, channelId }
      };
    }
    case 'quack': {
      try {
        const https = require('https');
        const duckData = await new Promise((resolve, reject) => {
          https.get('https://random-d.uk/api/v2/random', (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
          }).on('error', reject);
        });
        return {
          content: '🦆 Quack!',
          attachments: [{ name: 'quack.jpg', url: duckData.url, type: 'image/jpeg' }],
          commandData: { type: 'quack' }
        };
      } catch (err) {
        return {
          content: '🦆 Quack! (The duck flew away)',
          commandData: { type: 'quack' }
        };
      }
    }
    case 'criticize': {
      const target = args.trim();
      if (!target) return { error: 'Usage: /criticize <target>. Example: /criticize pineapple pizza' };
      if (target.length > 100) return { error: 'Target name too long (max 100 characters).' };
      const key = `${user.id}:${target.toLowerCase()}`;

      if (state.criticizeJobs.has(key)) {
        clearInterval(state.criticizeJobs.get(key).intervalId);
        state.criticizeJobs.delete(key);
        return {
          content: `🔇 ${user.username} stopped the daily roast of "${target}"`,
          commandData: { type: 'criticize', target, action: 'stop' }
        };
      }

      const roast = getRandomRoast(target);
      return {
        content: `🔥 ${user.username} started a daily roast of "${target}"`,
        commandData: { type: 'criticize', target, action: 'start', roast },
        setupCriticize: { userId: user.id, target, channelId, key }
      };
    }
    case 'poll':
      return null;
    default:
      return null;
  }
}

module.exports = {
  COLORS,
  AVATARS,
  socketRateLimiters,
  soundboardLimiter,
  checkSocketRate,
  makeServer,
  serializeServer,
  findServerByChannelId,
  getOnlineUsers,
  getVoiceChannelState,
  getUserPerms,
  parseMentions,
  parseChannelLinks,
  getUserHighestRolePosition,
  convertDbMessagesToRuntime,
  convertDbMessages,
  generateTurnCredentials,
  buildIceServers,
  leaveVoice,
  createPersonalServer,
  handleSlashCommand,
  getRandomRoast,
  parseSearchFilters,
};

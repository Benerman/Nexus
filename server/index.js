const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const { RateLimiterMemory } = require('rate-limiter-flexible');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const db = require('./db');
const config = require('./config');
const validation = require('./validation');
const { getDefaultSounds } = require('./default-sounds');
const utils = require('./utils');

const app = express();

// Security headers with Helmet
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      styleSrcElem: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      connectSrc: ["'self'", "wss:", "https:"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      mediaSrc: ["'self'", "blob:", "data:"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

// CORS configuration — allows web, Capacitor, Tauri, and Electron origins
const ALLOWED_ORIGINS = [
  process.env.CLIENT_URL || 'http://localhost:3000',
  'capacitor://localhost',
  'http://localhost',
  'https://localhost',
  'tauri://localhost',
  'https://tauri.localhost',
  // Support additional origins via comma-separated ALLOWED_ORIGINS env var
  ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()) : []),
].map(o => o.replace(/\/+$/, '')); // strip trailing slashes

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (Electron file://, mobile apps, curl)
    if (!origin) return callback(null, true);
    const normalizedOrigin = origin.replace(/\/+$/, '');
    if (ALLOWED_ORIGINS.some(allowed => normalizedOrigin === allowed)) {
      return callback(null, true);
    }
    console.error(`[CORS] Blocked origin: ${origin}. Allowed origins: ${ALLOWED_ORIGINS.join(', ')}`);
    console.error(`[CORS] To fix: set CLIENT_URL=${origin} in your .env file or docker-compose environment`);
    const err = new Error('Not allowed by CORS');
    err.statusCode = 403;
    callback(err);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};
app.use(cors(corsOptions));

// Handle CORS errors with 403 instead of default 500
app.use((err, req, res, next) => {
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'Origin not allowed by CORS policy' });
  }
  next(err);
});

app.use(express.json({ limit: '20mb' }));

// Rate limiter for API endpoints (10 requests per 10 seconds)
const apiLimiter = new RateLimiterMemory({
  points: 10,
  duration: 10,
});

// Rate limiting middleware
const rateLimitMiddleware = async (req, res, next) => {
  try {
    const key = req.ip || req.connection.remoteAddress;
    await apiLimiter.consume(key);
    next();
  } catch (error) {
    res.status(429).json({ error: 'Too many requests, please try again later' });
  }
};

// Apply rate limiting to API routes
app.use('/api', rateLimitMiddleware);

// Bearer token auth middleware for protected API routes
const requireApiAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization required' });
  }
  const token = authHeader.slice(7);
  const accountId = await db.validateToken(token);
  if (!accountId) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  req.accountId = accountId;
  next();
};

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: corsOptions,
  maxHttpBufferSize: 20e6
});

// Rate limiter for Socket.io messages (30 messages per 10 seconds)
const messageLimiter = new RateLimiterMemory({
  points: 30,
  duration: 10,
});

// ─── State ────────────────────────────────────────────────────────────────────
const DEFAULT_SERVER_ID = 'nexus-main';
const state = {
  accounts: {},    // username.toLowerCase() -> account object
  tokens: {},      // token -> accountId
  users: {},       // socketId -> user (online)
  servers: {},
  messages: {},
  voiceChannels: {},
  criticizeJobs: new Map(),  // "userId:target" -> { intervalId, channelId, target, userId }
};

// ─── Auth & Helpers (imported from utils.js) ─────────────────────────────────
const { hashPassword, hashPasswordLegacy, verifyPassword, makeToken, DEFAULT_PERMS, makeCategory } = utils;

// ─── Rate limiters for socket events ─────────────────────────────────────────
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

async function checkSocketRate(limiter, key, socket) {
  try {
    await limiter.consume(key);
    return true;
  } catch {
    socket.emit('error', { message: 'Rate limit exceeded. Please slow down.' });
    return false;
  }
}

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

// Initialize default server structure (will be replaced by database data on startup)
// state.servers[DEFAULT_SERVER_ID] = makeServer(DEFAULT_SERVER_ID, 'Nexus Server', 'N', null);
// const defSrv = state.servers[DEFAULT_SERVER_ID];
// [...defSrv.channels.text, ...defSrv.channels.voice].forEach(ch => {
//   state.messages[ch.id] = [];
//   if (ch.type === 'voice') state.voiceChannels[ch.id] = { users:[], screenSharers:[] };
// });

const COLORS = ['#3B82F6','#57F287','#FEE75C','#EB459E','#ED4245','#60A5FA','#3ba55c','#faa61a'];
const AVATARS = ['🐺','🦊','🐱','🐸','🦁','🐙','🦄','🐧','🦅','🐉','🦋','🐻'];

// ─── Health check endpoint (used by standalone app setup screen) ─────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', name: 'Nexus' });
});

// ─── Webhook HTTP endpoint ───────────────────────────────────────────────────
app.post('/api/webhooks/:webhookId/:token', async (req, res) => {
  const { webhookId, token } = req.params;
  // Accept standard webhook field names
  const { content, username, avatar, avatar_url, attachments, embeds, tts } = req.body;

  // Require at least content or embeds
  const hasContent = content && typeof content === 'string' && content.trim();
  const hasEmbeds = Array.isArray(embeds) && embeds.length > 0;
  if (!hasContent && !hasEmbeds) {
    return res.status(400).json({ error: 'content or embeds is required' });
  }
  if (username && typeof username !== 'string') {
    return res.status(400).json({ error: 'username must be a string' });
  }

  // Authenticate webhook via DB token lookup
  const wh = await db.getWebhookByIdAndToken(webhookId, token);
  if (!wh) {
    return res.status(401).json({ error: 'Invalid webhook ID or token' });
  }

  const srv = state.servers[wh.server_id];
  if (srv) {
    const ch = srv.channels.text.find(c => c.id === wh.channel_id);
    if (ch) {
        // Validate and process attachments
        const validAttachments = (attachments || [])
          .slice(0, 4)
          .filter(att => att.url && (att.url.startsWith('http') || att.url.startsWith('data:')));

        // Sanitize embeds (up to 10, with title, description, color, fields, etc.)
        const validEmbeds = (embeds || []).slice(0, 10).map(embed => ({
          title: typeof embed.title === 'string' ? embed.title.slice(0, 256) : undefined,
          description: typeof embed.description === 'string' ? embed.description.slice(0, 4096) : undefined,
          color: typeof embed.color === 'number' ? embed.color : undefined,
          url: typeof embed.url === 'string' ? embed.url : undefined,
          timestamp: embed.timestamp || undefined,
          footer: embed.footer ? {
            text: typeof embed.footer.text === 'string' ? embed.footer.text.slice(0, 2048) : '',
            icon_url: embed.footer.icon_url || undefined
          } : undefined,
          author: embed.author ? {
            name: typeof embed.author.name === 'string' ? embed.author.name.slice(0, 256) : '',
            url: embed.author.url || undefined,
            icon_url: embed.author.icon_url || undefined
          } : undefined,
          thumbnail: embed.thumbnail?.url ? { url: embed.thumbnail.url } : undefined,
          image: embed.image?.url ? { url: embed.image.url } : undefined,
          fields: Array.isArray(embed.fields) ? embed.fields.slice(0, 25).map(f => ({
            name: typeof f.name === 'string' ? f.name.slice(0, 256) : '',
            value: typeof f.value === 'string' ? f.value.slice(0, 1024) : '',
            inline: !!f.inline
          })) : undefined
        }));

        const displayUsername = username || wh.name;
        // Support both avatar_url (image) and avatar (emoji)
        const displayAvatar = avatar_url || avatar || '🤖';

        // Parse mentions and channel links from webhook content
        const webhookContent = hasContent ? String(content).slice(0, 2000) : '';
        const webhookMentions = parseMentions(webhookContent, srv.id);
        const webhookChannelLinks = parseChannelLinks(webhookContent, srv.id);

        const msg = {
          id: uuidv4(), channelId: ch.id,
          content: webhookContent,
          author: {
            id: `webhook:${webhookId}`,
            username: displayUsername,
            avatar: displayAvatar,
            color: '#60A5FA',
            isWebhook: true
          },
          timestamp: Date.now(),
          reactions: {},
          isWebhook: true,
          tts: !!tts,
          attachments: validAttachments,
          embeds: validEmbeds.length > 0 ? validEmbeds : undefined,
          mentions: webhookMentions,
          channelLinks: webhookChannelLinks.channels
        };

        if (!state.messages[ch.id]) state.messages[ch.id] = [];
        state.messages[ch.id].push(msg);
        if (state.messages[ch.id].length > 500) state.messages[ch.id] = state.messages[ch.id].slice(-500);
        io.to(`text:${ch.id}`).emit('message:new', msg);

        // Save webhook message to database
        try {
          await db.saveMessage({
            id: msg.id,
            channelId: ch.id,
            authorId: null,
            content: msg.content,
            attachments: validAttachments,
            isWebhook: true,
            webhookUsername: displayUsername,
            webhookAvatar: displayAvatar,
            replyTo: null,
            mentions: webhookMentions
          });
        } catch (error) {
          console.error('[Webhook] Error saving webhook message to database:', error);
        }

        const preview = hasContent ? content.slice(0, 50) + (content.length > 50 ? '...' : '') : `[${validEmbeds.length} embed(s)]`;
        console.log(`[Webhook] ${displayUsername} (${webhookId}) posted to #${ch.name}: ${preview}`);

        return res.json({ id: msg.id, success: true, username: displayUsername });
    }
  }

  console.warn(`[Webhook] Channel not loaded in state for webhook: ${webhookId}`);
  res.status(404).json({ error: 'Webhook channel not found' });
});

// ─── Auth endpoints ───────────────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'username and password required' });

    // Sanitize username: letters, numbers, standard special characters only
    const usernameRegex = /^[a-zA-Z0-9 _\-\.!@#$%^&*()+=]{1,32}$/;
    if (!usernameRegex.test(username)) {
      return res.status(400).json({ error: 'Username can only contain letters, numbers, spaces, and standard special characters' });
    }

    // Sanitize password: printable ASCII only, minimum 8 characters
    const passwordRegex = /^[\x20-\x7E]{8,128}$/;
    if (!passwordRegex.test(password)) {
      return res.status(400).json({ error: 'Password must be 8-128 characters using letters, numbers, and symbols' });
    }

    // Check if username already exists
    const existingAccount = await db.getAccountByUsername(username);
    if (existingAccount) return res.status(409).json({ error: 'Username already taken' });

    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const avatar = AVATARS[Math.floor(Math.random() * AVATARS.length)];

    // Create account in database with bcrypt hash
    const passwordHash = await hashPassword(password);
    const account = await db.createAccount({
      username: username.slice(0, 32),
      passwordHash,
      salt: 'bcrypt',
      avatar,
      color
    });

    // Create token in database
    const { token } = await db.createToken(account.id);

    res.json({
      token,
      account: {
        id: account.id,
        username: account.username,
        avatar: account.avatar,
        color: account.color
      }
    });
  } catch (error) {
    console.error('[Auth] Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'username and password required' });

    // Get account from database
    const account = await db.getAccountByUsername(username);
    if (!account) return res.status(401).json({ error: 'Invalid credentials' });

    // Verify password — support both bcrypt and legacy HMAC-SHA256
    let passwordValid = false;
    if (account.password_hash.startsWith('$2b$')) {
      // Bcrypt hash
      passwordValid = await verifyPassword(password, account.password_hash);
    } else {
      // Legacy HMAC-SHA256 — verify and auto-migrate to bcrypt
      passwordValid = account.password_hash === hashPasswordLegacy(password, account.salt);
      if (passwordValid) {
        const newHash = await hashPassword(password);
        await db.updateAccountPassword(account.id, newHash, 'bcrypt');
        console.log(`[Auth] Migrated ${account.username} password to bcrypt`);
      }
    }

    if (!passwordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Create token in database
    const { token } = await db.createToken(account.id);

    res.json({
      token,
      account: {
        id: account.id,
        username: account.username,
        avatar: account.avatar,
        color: account.color,
        customAvatar: account.custom_avatar,
        settings: account.settings || {}
      }
    });
  } catch (error) {
    console.error('[Auth] Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Logout endpoint ─────────────────────────────────────────────────────────
app.post('/api/auth/logout', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      await db.deleteToken(token);
    }
    res.json({ success: true });
  } catch (error) {
    res.json({ success: true }); // Don't leak errors on logout
  }
});

// ─── Delete account endpoint ─────────────────────────────────────────────────
app.delete('/api/auth/account', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const accountId = await db.validateToken(token);
    if (!accountId) return res.status(401).json({ error: 'Unauthorized' });

    // Transfer or delete servers where user is owner
    for (const [serverId, srv] of Object.entries(state.servers)) {
      if (srv.ownerId !== accountId) continue;

      const memberIds = Object.keys(srv.members).filter(id => id !== accountId);
      if (memberIds.length === 0) {
        // No other members — delete the server
        await db.deleteServer(serverId);
        delete state.servers[serverId];
        io.emit('server:deleted', { serverId });
        continue;
      }

      // Find an admin to transfer to
      let newOwnerId = memberIds.find(id => {
        const member = srv.members[id];
        return member && member.roles && member.roles.includes('admin');
      });

      // Fallback: any non-guest member
      if (!newOwnerId) {
        newOwnerId = memberIds.find(id => !id.startsWith('guest:'));
      }

      // Last resort: any member
      if (!newOwnerId) {
        newOwnerId = memberIds[0];
      }

      await db.updateServer(serverId, { owner_id: newOwnerId });
      srv.ownerId = newOwnerId;

      // Ensure new owner has admin role
      if (!srv.members[newOwnerId].roles.includes('admin')) {
        srv.members[newOwnerId].roles.push('admin');
        await db.addServerMember(serverId, newOwnerId, srv.members[newOwnerId].roles);
      }

      io.emit('server:updated', { server: serializeServer(serverId) });
    }

    // Remove user from in-memory server members
    for (const srv of Object.values(state.servers)) {
      delete srv.members[accountId];
    }

    // Disconnect any active sockets for this user
    for (const [socketId, user] of Object.entries(state.users)) {
      if (user.id === accountId) {
        const sock = io.sockets.sockets.get(socketId);
        if (sock) sock.disconnect(true);
        delete state.users[socketId];
      }
    }

    // Delete the account (cascades tokens, memberships, friendships, etc.)
    await db.deleteAccount(accountId);

    res.json({ success: true });
    console.log(`[Auth] Account deleted: ${accountId}`);
  } catch (error) {
    console.error('[Auth] Account deletion error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── User avatar upload ───────────────────────────────────────────────────────
app.post('/api/user/avatar', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const accountId = await db.validateToken(token);
    if (!accountId) return res.status(401).json({ error: 'Unauthorized' });

    const { avatar } = req.body; // base64 data URL
    if (!avatar || !avatar.startsWith('data:image/')) return res.status(400).json({ error: 'Invalid image' });

    // Validate file size (max 2MB)
    const base64Data = avatar.split(',')[1] || '';
    const actualBytes = Math.ceil(base64Data.length * 3 / 4);
    if (actualBytes > 2 * 1024 * 1024) return res.status(400).json({ error: 'Image too large (max 2MB)' });

    // Update account in database
    await db.updateAccount(accountId, { custom_avatar: avatar });

    res.json({ customAvatar: avatar });
  } catch (error) {
    console.error('[User] Avatar upload error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Server icon upload ───────────────────────────────────────────────────────
app.post('/api/server/:serverId/icon', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const accountId = await db.validateToken(token);
    if (!accountId) return res.status(401).json({ error: 'Unauthorized' });

    const { serverId } = req.params;
    const { icon } = req.body; // base64
    if (!icon || !icon.startsWith('data:image/')) return res.status(400).json({ error: 'Invalid image' });

    // Validate file size (max 2MB)
    const base64Data = icon.split(',')[1] || '';
    const actualBytes = Math.ceil(base64Data.length * 3 / 4);
    if (actualBytes > 2 * 1024 * 1024) return res.status(400).json({ error: 'Image too large (max 2MB)' });

    const srv = state.servers[serverId];
    if (!srv) return res.status(404).json({ error: 'Server not found' });
    // Check if user is owner or admin
    const member = srv.members[accountId];
    if (srv.ownerId !== accountId && (!member || !member.roles.includes('admin'))) {
      return res.status(403).json({ error: 'No permission' });
    }

    srv.customIcon = icon;

    // Persist to database
    await db.updateServer(serverId, { custom_icon: icon });

    io.emit('server:updated', { server: serializeServer(serverId) });
    res.json({ customIcon: icon });
  } catch (error) {
    console.error('[Server] Icon upload error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GIF Search (Giphy) ───────────────────────────────────────────────────────
const GIPHY_API_KEY = process.env.GIPHY_API_KEY;

app.get('/api/gifs/search', requireApiAuth, async (req, res) => {
  if (!GIPHY_API_KEY) return res.json({ results: [] });
  const { q } = req.query;
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 50);
  const offset = Math.max(parseInt(req.query.offset) || 0, 0);
  if (!q) return res.json({ results: [] });
  try {
    const url = `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(q)}&limit=${limit}&offset=${offset}&rating=r`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    const data = await resp.json();
    const results = (data.data || []).map(r => ({
      id: r.id,
      title: r.title || '',
      preview: r.images?.fixed_width?.url || r.images?.downsized?.url || '',
      url: r.images?.original?.url || '',
      width: parseInt(r.images?.original?.width) || 200,
      height: parseInt(r.images?.original?.height) || 200
    }));
    res.json({ results });
  } catch (err) {
    console.warn('[GIF] Search error:', err.message);
    res.json({ results: [] });
  }
});

app.get('/api/gifs/trending', requireApiAuth, async (req, res) => {
  if (!GIPHY_API_KEY) return res.json({ results: [] });
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 50);
  const offset = Math.max(parseInt(req.query.offset) || 0, 0);
  try {
    const url = `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=${limit}&offset=${offset}&rating=r`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    const data = await resp.json();
    const results = (data.data || []).map(r => ({
      id: r.id,
      title: r.title || '',
      preview: r.images?.fixed_width?.url || r.images?.downsized?.url || '',
      url: r.images?.original?.url || '',
      width: parseInt(r.images?.original?.width) || 200,
      height: parseInt(r.images?.original?.height) || 200
    }));
    res.json({ results });
  } catch (err) {
    console.warn('[GIF] Trending error:', err.message);
    res.json({ results: [] });
  }
});

// ─── OpenGraph link previews ──────────────────────────────────────────────────
const ogCache = new Map(); // url -> { data, ts }
const OG_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const OG_CACHE_MAX = 1000;

// SSRF protection: block private/internal IP ranges
// (also exported from utils.js for testability — keep both in sync)
function isPrivateUrl(urlString) {
  return utils.isPrivateUrl(urlString);
}

/**
 * Fetch with SSRF redirect protection: uses redirect:'manual',
 * validates redirect target against isPrivateUrl, follows at most one safe redirect.
 */
async function safeFetch(url, options = {}) {
  const resp = await fetch(url, { ...options, redirect: 'manual' });

  // If no redirect, return as-is
  if (resp.status < 300 || resp.status >= 400) return resp;

  // Handle redirect
  const location = resp.headers.get('location');
  if (!location) return resp;

  // Resolve relative redirects
  const redirectUrl = new URL(location, url).toString();

  // Validate redirect target against SSRF
  if (isPrivateUrl(redirectUrl)) {
    throw new Error('Redirect target blocked by SSRF protection');
  }

  // Follow the single safe redirect (no further redirects allowed)
  return fetch(redirectUrl, { ...options, redirect: 'manual' });
}

app.get('/api/og', requireApiAuth, async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'URL required' });

  try {
    new URL(url); // Validate URL
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  // Block SSRF attempts
  if (isPrivateUrl(url)) {
    return res.status(400).json({ error: 'URL not allowed' });
  }

  // Check cache
  const cached = ogCache.get(url);
  if (cached && Date.now() - cached.ts < OG_CACHE_TTL) {
    return res.json(cached.data);
  }

  try {
    // YouTube oEmbed
    const urlObj = new URL(url);
    const isYouTube = ['youtube.com', 'www.youtube.com', 'youtu.be', 'm.youtube.com'].includes(urlObj.hostname);

    if (isYouTube) {
      const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const resp = await safeFetch(oembedUrl, { signal: controller.signal });
      clearTimeout(timeout);
      if (resp.ok) {
        const json = await resp.json();
        // Extract video ID for thumbnail
        let videoId = '';
        if (urlObj.hostname === 'youtu.be') {
          videoId = urlObj.pathname.slice(1);
        } else {
          videoId = urlObj.searchParams.get('v') || '';
        }
        const data = {
          title: json.title,
          description: json.author_name ? `by ${json.author_name}` : '',
          image: videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : json.thumbnail_url,
          siteName: 'YouTube',
          url,
          type: 'youtube'
        };
        if (ogCache.size >= OG_CACHE_MAX) ogCache.delete(ogCache.keys().next().value);
        ogCache.set(url, { data, ts: Date.now() });
        return res.json(data);
      }
    }

    // General OG fetch
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const resp = await safeFetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'NexusBot/1.0 (OpenGraph Fetcher)' },
      size: 50000 // limit response size
    });
    clearTimeout(timeout);

    if (!resp.ok) {
      return res.json({ title: '', description: '', image: '', siteName: '', url });
    }

    // Read only first 50KB
    const reader = resp.body.getReader();
    let html = '';
    let totalBytes = 0;
    while (totalBytes < 50000) {
      const { done, value } = await reader.read();
      if (done) break;
      html += new TextDecoder().decode(value);
      totalBytes += value.length;
    }
    reader.cancel();

    // Decode HTML entities
    const decodeEntities = (str) => str
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
      .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#39;/g, "'");

    // Parse OG tags with regex
    const getOG = (prop) => {
      const match = html.match(new RegExp(`<meta[^>]*property=["']og:${prop}["'][^>]*content=["']([^"']*)["']`, 'i'))
        || html.match(new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*property=["']og:${prop}["']`, 'i'));
      return match ? decodeEntities(match[1]) : '';
    };

    const getMetaName = (name) => {
      const match = html.match(new RegExp(`<meta[^>]*name=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i'))
        || html.match(new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*name=["']${name}["']`, 'i'));
      return match ? decodeEntities(match[1]) : '';
    };

    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);

    const data = {
      title: getOG('title') || (titleMatch?.[1] ? decodeEntities(titleMatch[1].trim()) : ''),
      description: getOG('description') || getMetaName('description') || '',
      image: getOG('image') || '',
      siteName: getOG('site_name') || urlObj.hostname,
      url,
      type: 'website'
    };

    // Make relative image URLs absolute
    if (data.image && !data.image.startsWith('http')) {
      data.image = new URL(data.image, url).href;
    }

    if (ogCache.size >= OG_CACHE_MAX) ogCache.delete(ogCache.keys().next().value);
    ogCache.set(url, { data, ts: Date.now() });
    res.json(data);
  } catch (err) {
    console.warn('[OG] Failed to fetch:', url, err.message);
    res.json({ title: '', description: '', image: '', siteName: '', url });
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
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

// Find which server a channel belongs to
function findServerByChannelId(channelId) {
  for (const srv of Object.values(state.servers)) {
    if (srv.isPersonal) continue;
    const allChannels = [...(srv.channels?.text || []), ...(srv.channels?.voice || [])];
    if (allChannels.some(ch => ch.id === channelId)) return srv;
  }
  return null;
}

// Rate limiter for soundboard plays (10 per 10 seconds per user)
const soundboardLimiter = new RateLimiterMemory({
  points: 10,
  duration: 10,
});

function parseMentions(content, serverId) {
  return utils.parseMentions(content, state.servers[serverId]);
}

function parseChannelLinks(content, serverId) {
  return utils.parseChannelLinks(content, state.servers[serverId], serverId);
}

function getUserHighestRolePosition(userId, serverId) {
  return utils.getUserHighestRolePosition(userId, state.servers[serverId]);
}

/**
 * ✅ Phase 2: Create a virtual "Personal" server containing all DM channels for a user
 */
async function createPersonalServer(userId, dmChannels) {
  // Get unread counts for all DM channels
  const unreadCounts = await db.getUnreadCounts(userId);

  // Filter out hidden (archived) DMs
  const account = await db.getAccountById(userId);
  const hiddenDMs = account?.settings?.hidden_dms || [];
  const visibleDMChannels = dmChannels.filter(ch => !hiddenDMs.includes(ch.id));

  const dmTextChannels = await Promise.all(visibleDMChannels.map(async (dmChannel) => {
    // Get last message
    const messages = await db.getChannelMessages(dmChannel.id, 1);
    let lastMessage = null;
    if (messages.length > 0) {
      const dbMsg = messages[0];
      lastMessage = {
        id: dbMsg.id,
        content: dbMsg.content,
        timestamp: new Date(dbMsg.created_at).getTime(),
        authorId: dbMsg.author_id
      };
    }

    // Handle group DMs (3+ participants)
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
          status: Object.values(state.users).some(u => u.id === p.id) ? 'online' : (p.status || 'offline')
        })),
        lastMessage,
        unreadCount: unreadCounts[dmChannel.id] || 0,
        position: 0,
        createdAt: new Date(dmChannel.created_at).getTime()
      };
    }

    // Handle 1-on-1 DMs
    const otherUserId = dmChannel.participant_1 === userId
      ? dmChannel.participant_2
      : dmChannel.participant_1;

    // Get participant info
    const participantAccount = await db.getAccountById(otherUserId);
    const participant = participantAccount ? {
      id: participantAccount.id,
      username: participantAccount.username,
      avatar: participantAccount.avatar,
      customAvatar: participantAccount.custom_avatar,
      color: participantAccount.color,
      status: participantAccount.status || 'offline',
      bio: participantAccount.bio
    } : {
      id: otherUserId,
      username: 'Unknown User',
      avatar: '❓',
      color: '#60A5FA',
      status: 'offline'
    };

    // Check if participant is online
    const isOnline = Object.values(state.users).some(u => u.id === otherUserId);
    if (isOnline) {
      participant.status = 'online';
    }

    return {
      id: dmChannel.id,
      name: participant.username,
      type: 'dm',
      isDM: true,
      participant,
      lastMessage,
      unreadCount: unreadCounts[dmChannel.id] || 0,
      position: 0,
      createdAt: new Date(dmChannel.created_at).getTime()
    };
  }));

  // Create Personal server structure
  const personalServer = {
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
      everyone: {
        name: 'everyone',
        color: '#99AAB5',
        permissions: {}
      }
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
    channels: {
      text: dmTextChannels,
      voice: []
    }
  };

  return personalServer;
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
    emojiSharing: srv.emojiSharing || false
  };
}

// Generate ephemeral TURN credentials using HMAC-SHA1 (coturn REST API / RFC 5766)
function generateTurnCredentials(secret, userId) {
  const ttl = 3600; // 1 hour
  const timestamp = Math.floor(Date.now() / 1000) + ttl;
  const username = `${timestamp}:${userId}`;
  const hmac = crypto.createHmac('sha1', secret);
  hmac.update(username);
  const credential = hmac.digest('base64');
  return { username, credential };
}

// Build ICE server list for a given server, using per-server overrides or instance defaults
function buildIceServers(serverId, userId) {
  const srv = state.servers[serverId];
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

function leaveVoice(socket) {
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

      if (chData.isDMCall) {
        // DM call: notify participants and clean up if empty
        io.emit('voice:channel:update', { channelId: chId, channel: { ...chData, users: chData.users.map(s=>state.users[s]).filter(Boolean) } });
        if (chData.users.length === 0) {
          // Call ended — all participants left
          io.emit('dm:call-ended', { channelId: chId });
          delete state.voiceChannels[chId];
        }
      } else {
        // Server voice channel
        for (const srv of Object.values(state.servers)) {
          if (srv.channels.voice.find(c => c.id === chId)) {
            io.emit('voice:channel:update', {
              channelId: chId,
              channel: { ...chData, users: chData.users.map(s=>state.users[s]).filter(Boolean) }
            });
            io.to(`voice:${chId}`).emit('voice:cue', { type: 'leave', user: state.users[socket.id], customSound: state.users[socket.id]?.exitSound || null, customSoundVolume: state.users[socket.id]?.exitSoundVolume ?? 100 });
            break;
          }
        }
      }
    }
  }
}

// ─── Slash Commands ───────────────────────────────────────────────────────────
const EIGHT_BALL_RESPONSES = [
  'It is certain.', 'It is decidedly so.', 'Without a doubt.', 'Yes definitely.',
  'You may rely on it.', 'As I see it, yes.', 'Most likely.', 'Outlook good.',
  'Yes.', 'Signs point to yes.', 'Reply hazy, try again.', 'Ask again later.',
  'Better not tell you now.', 'Cannot predict now.', 'Concentrate and ask again.',
  "Don't count on it.", 'My reply is no.', 'My sources say no.',
  'Outlook not so good.', 'Very doubtful.'
];

const { parseDuration, CRITICIZE_ROASTS, getRandomRoast } = utils;

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
      return null; // Handled via client modal + commandData payload
    default:
      return null; // Not a known command
  }
}

// ─── Socket.io ────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[+] Socket connected: ${socket.id}`);

  socket.on('join', async ({ token, username, serverId = DEFAULT_SERVER_ID }) => {
    try {
      let user;

      if (token) {
        // Authenticated user
        const accountId = await db.validateToken(token);
        if (!accountId) return socket.emit('error', { message: 'Invalid token' });

        const account = await db.getAccountById(accountId);
        if (!account) return socket.emit('error', { message: 'Account not found' });

        user = {
          id: account.id,
          socketId: socket.id,
          username: account.username,
          color: account.color,
          avatar: account.avatar,
          customAvatar: account.custom_avatar,
          status: account.status,
          bio: account.bio,
          settings: account.settings || {},
          isGuest: false,
          isPlatformAdmin: config.admin.platformAdminUsername &&
            account.username.toLowerCase() === config.admin.platformAdminUsername.toLowerCase(),
          joinedAt: Date.now()
        };
      } else {
        // Guest mode disabled - require authentication
        return socket.emit('error', { message: 'Authentication required. Please log in or create an account.' });
      }

      state.users[socket.id] = user;

      // Load intro/exit sounds for voice cues
      try {
        const sounds = await db.getAccountSounds(user.id);
        if (sounds) {
          state.users[socket.id].introSound = sounds.intro_sound || null;
          state.users[socket.id].exitSound = sounds.exit_sound || null;
          state.users[socket.id].introSoundVolume = sounds.intro_sound_volume ?? 100;
          state.users[socket.id].exitSoundVolume = sounds.exit_sound_volume ?? 100;
        }
      } catch (err) {
        console.warn('[Sounds] Failed to load user sounds:', err.message);
      }

      const srv = state.servers[serverId] || state.servers[DEFAULT_SERVER_ID];
      if (!srv.members[user.id]) {
        // New member — add to server with default roles and persist
        const memberProfile = { roles: ['everyone'], joinedAt: Date.now(), username: user.username, avatar: user.avatar, customAvatar: user.customAvatar || null, color: user.color || '#3B82F6' };
        if (!srv.ownerId) {
          srv.ownerId = user.id;
          memberProfile.roles = ['everyone', 'admin'];
          db.query('UPDATE servers SET owner_id = $1 WHERE id = $2', [user.id, srv.id]).catch(() => {});
        }
        srv.members[user.id] = memberProfile;
        db.addServerMember(srv.id, user.id, memberProfile.roles).catch(() => {});
      } else {
        // Update profile data for existing member (they may have changed username/avatar since last seen)
        srv.members[user.id].username = user.username;
        srv.members[user.id].avatar = user.avatar;
        srv.members[user.id].customAvatar = user.customAvatar || null;
        srv.members[user.id].color = user.color || '#3B82F6';
      }

      // ✅ Phase 2: Create Personal server with user's DM channels
      const dmChannels = await db.getDMChannelsForUser(user.id);
      const personalServer = await createPersonalServer(user.id, dmChannels);

      // Get regular servers where user is a member (excluding Personal)
      const regularServers = Object.values(state.servers)
        .filter(s => !s.isPersonal && !s.id.startsWith('personal:') && s.members[user.id])
        .map(s => serializeServer(s.id));

      // ✅ Combine: Personal server first, then regular servers
      const allServers = [personalServer, ...regularServers];

      socket.emit('init', {
        user,
        serverId: srv.id,
        server: serializeServer(srv.id),
        servers: allServers,  // ✅ Includes Personal server
        onlineUsers: getOnlineUsers(),
        voiceChannels: getVoiceChannelState(srv.id)
      });

      socket.broadcast.emit('user:joined', { user, onlineUsers: getOnlineUsers() });

      // Broadcast updated server data for all servers this user is a member of
      // so other clients see the new/updated member in their member lists
      Object.entries(state.servers).forEach(([srvId, srvData]) => {
        if (!srvData.isPersonal && !srvId.startsWith('personal:') && srvData.members[user.id]) {
          socket.broadcast.emit('server:updated', { server: serializeServer(srvId) });
        }
      });

      console.log(`[~] ${user.username} joined`);
    } catch (error) {
      console.error('[Socket] Join error:', error);
      socket.emit('error', { message: 'Failed to join server' });
    }
  });

  // ─── Data Refresh (for visibility change / reconnection) ─────────────────────
  socket.on('data:refresh', async () => {
    const user = state.users[socket.id];
    if (!user) return;

    try {
      // Rebuild DM channels
      const dmChannels = await db.getDMChannelsForUser(user.id);
      const personalServer = await createPersonalServer(user.id, dmChannels);

      // Get regular servers where user is a member
      const regularServers = Object.values(state.servers)
        .filter(s => !s.isPersonal && !s.id.startsWith('personal:') && s.members[user.id])
        .map(s => serializeServer(s.id));

      const allServers = [personalServer, ...regularServers];

      // Collect voice state for all servers user is a member of
      const allVoiceChannels = {};
      regularServers.forEach(srv => {
        Object.assign(allVoiceChannels, getVoiceChannelState(srv.id));
      });

      socket.emit('data:refreshed', {
        user,
        servers: allServers,
        onlineUsers: getOnlineUsers(),
        voiceChannels: allVoiceChannels
      });

      console.log(`[~] ${user.username} refreshed data`);
    } catch (error) {
      console.error('[Socket] Data refresh error:', error);
    }
  });

  socket.on('user:update', ({ username, avatar, color, status, bio, customAvatar }) => {
    const user = state.users[socket.id];
    if (!user) return;

    // Sanitize username
    if (username) {
      const usernameRegex = /^[a-zA-Z0-9 _\-\.!@#$%^&*()+=]{1,32}$/;
      if (!usernameRegex.test(String(username))) return socket.emit('error', { message: 'Username can only contain letters, numbers, spaces, and standard special characters' });
    }

    // Update session
    if (username) user.username = String(username).slice(0, 32);
    if (avatar) user.avatar = avatar;
    if (color) user.color = color;
    if (status) user.status = status;
    if (bio !== undefined) user.bio = String(bio).slice(0, 128);
    if (customAvatar !== undefined) user.customAvatar = customAvatar;
    
    // Update account
    for (const acc of Object.values(state.accounts)) {
      if (acc.id === user.id) {
        if (username) acc.username = user.username;
        if (avatar) acc.avatar = user.avatar;
        if (color) acc.color = user.color;
        if (status) acc.status = user.status;
        if (bio !== undefined) acc.bio = user.bio;
        if (customAvatar !== undefined) acc.customAvatar = user.customAvatar;
        break;
      }
    }
    
    // Update profile in all servers the user is a member of
    for (const srv of Object.values(state.servers)) {
      if (srv.members[user.id]) {
        srv.members[user.id].username = user.username;
        srv.members[user.id].avatar = user.avatar;
        srv.members[user.id].customAvatar = user.customAvatar || null;
        srv.members[user.id].color = user.color || '#3B82F6';
      }
    }

    // Persist profile changes to database
    const dbUpdates = {};
    if (username) dbUpdates.username = user.username;
    if (avatar) dbUpdates.avatar = user.avatar;
    if (color) dbUpdates.color = user.color;
    if (status) dbUpdates.status = user.status;
    if (bio !== undefined) dbUpdates.bio = user.bio;
    if (Object.keys(dbUpdates).length > 0) {
      db.updateAccount(user.id, dbUpdates).catch(err => {
        console.error('[User] Failed to persist profile update:', err.message);
      });
    }

    io.emit('user:updated', { user, onlineUsers: getOnlineUsers() });
  });

  // ─── User settings sync ──────────────────────────────────────────────────────
  socket.on('user:settings-update', async ({ settings }, callback) => {
    const user = state.users[socket.id];
    if (!user || user.isGuest) {
      if (callback) callback({ success: false, error: 'Authentication required' });
      return;
    }

    try {
      const updated = await db.updateUserSettings(user.id, settings);
      if (callback) callback({ success: true, settings: updated });
    } catch (err) {
      console.error('[User] Failed to save settings:', err.message);
      if (callback) callback({ success: false, error: 'Failed to save settings' });
    }
  });

  // ─── User voice sounds ────────────────────────────────────────────────────────
  socket.on('user:get-sounds', async (callback) => {
    const user = state.users[socket.id];
    if (!user || user.isGuest) {
      if (typeof callback === 'function') callback({ error: 'Authentication required' });
      return;
    }
    try {
      const sounds = await db.getAccountSounds(user.id);
      if (typeof callback === 'function') callback({ sounds: sounds || {} });
    } catch (err) {
      console.error('[Sounds] Failed to get sounds:', err.message);
      if (typeof callback === 'function') callback({ error: 'Failed to load sounds' });
    }
  });

  socket.on('user:update-sounds', async (data, callback) => {
    const user = state.users[socket.id];
    if (!user || user.isGuest) {
      if (typeof callback === 'function') callback({ error: 'Authentication required' });
      return;
    }
    try {
      const updates = {};
      if (data.introSound !== undefined) updates.intro_sound = data.introSound;
      if (data.exitSound !== undefined) updates.exit_sound = data.exitSound;
      if (data.introSoundOriginal !== undefined) updates.intro_sound_original = data.introSoundOriginal;
      if (data.exitSoundOriginal !== undefined) updates.exit_sound_original = data.exitSoundOriginal;
      if (data.introSoundTrimStart !== undefined) updates.intro_sound_trim_start = data.introSoundTrimStart;
      if (data.introSoundTrimEnd !== undefined) updates.intro_sound_trim_end = data.introSoundTrimEnd;
      if (data.introSoundDuration !== undefined) updates.intro_sound_duration = data.introSoundDuration;
      if (data.exitSoundTrimStart !== undefined) updates.exit_sound_trim_start = data.exitSoundTrimStart;
      if (data.exitSoundTrimEnd !== undefined) updates.exit_sound_trim_end = data.exitSoundTrimEnd;
      if (data.exitSoundDuration !== undefined) updates.exit_sound_duration = data.exitSoundDuration;
      if (data.introSoundVolume !== undefined) updates.intro_sound_volume = data.introSoundVolume;
      if (data.exitSoundVolume !== undefined) updates.exit_sound_volume = data.exitSoundVolume;

      await db.updateAccount(user.id, updates);

      // Update in-memory cache
      if (updates.intro_sound !== undefined) state.users[socket.id].introSound = updates.intro_sound;
      if (updates.exit_sound !== undefined) state.users[socket.id].exitSound = updates.exit_sound;
      if (updates.intro_sound_volume !== undefined) state.users[socket.id].introSoundVolume = updates.intro_sound_volume;
      if (updates.exit_sound_volume !== undefined) state.users[socket.id].exitSoundVolume = updates.exit_sound_volume;

      if (typeof callback === 'function') callback({ success: true });
    } catch (err) {
      console.error('[Sounds] Failed to update sounds:', err.message);
      if (typeof callback === 'function') callback({ error: 'Failed to save sounds' });
    }
  });

  socket.on('user:change-password', async ({ currentPassword, newPassword }) => {
    const user = state.users[socket.id];
    if (!user || user.isGuest) {
      return socket.emit('user:password-changed', { success: false, error: 'Authentication required' });
    }
    if (!currentPassword || !newPassword) {
      return socket.emit('user:password-changed', { success: false, error: 'Both current and new password are required' });
    }
    if (newPassword.length < 8) {
      return socket.emit('user:password-changed', { success: false, error: 'New password must be at least 8 characters' });
    }
    try {
      const account = await db.getAccountByUsername(user.username);
      if (!account) {
        return socket.emit('user:password-changed', { success: false, error: 'Account not found' });
      }
      // Verify current password (supports both bcrypt and legacy)
      let passwordValid = false;
      if (account.password_hash.startsWith('$2b$')) {
        passwordValid = await verifyPassword(currentPassword, account.password_hash);
      } else {
        passwordValid = account.password_hash === hashPasswordLegacy(currentPassword, account.salt);
      }
      if (!passwordValid) {
        return socket.emit('user:password-changed', { success: false, error: 'Current password is incorrect' });
      }
      const newHash = await hashPassword(newPassword);
      await db.updateAccountPassword(account.id, newHash, 'bcrypt');
      socket.emit('user:password-changed', { success: true });
    } catch (error) {
      console.error('[Auth] Password change error:', error);
      socket.emit('user:password-changed', { success: false, error: 'Failed to change password' });
    }
  });

  // ─── Server Management ────────────────────────────────────────────────────────
  socket.on('server:create', async ({ name, icon, customIcon }) => {
    const user = state.users[socket.id];
    if (!user || user.isGuest) {
      return socket.emit('error', { message: 'Authentication required to create servers' });
    }
    if (!await checkSocketRate(socketRateLimiters.serverCreate, user.id, socket)) return;

    try {
      const serverId = uuidv4();
      const serverName = (name || 'New Server').slice(0, 32);

      // Save server to database
      await db.createServer({
        id: serverId,
        name: serverName,
        icon: icon || 'N',
        customIcon: customIcon || null,
        ownerId: user.id,
        description: ''
      });

      // Add owner as member with admin role
      await db.addServerMember(serverId, user.id, ['everyone', 'admin']);

      // Build server structure in memory
      const srv = makeServer(serverId, serverName, icon || 'N', user.id, customIcon);
      srv.members[user.id] = { roles: ['everyone', 'admin'], joinedAt: Date.now(), username: user.username, avatar: user.avatar, customAvatar: user.customAvatar || null, color: user.color || '#3B82F6' };
      state.servers[serverId] = srv;

      // Persist default categories and channels to database
      for (const [catId, cat] of Object.entries(srv.categories)) {
        await db.saveCategory({ id: catId, serverId, name: cat.name, position: cat.position });
      }
      for (const ch of [...srv.channels.text, ...srv.channels.voice]) {
        await db.saveChannel({
          id: ch.id, serverId, categoryId: ch.categoryId, name: ch.name,
          type: ch.type, description: ch.description, topic: ch.topic,
          position: ch.position, isPrivate: ch.isPrivate, nsfw: ch.nsfw,
          slowMode: ch.slowMode, permissionOverrides: ch.permissionOverrides
        });
      }

      // Initialize message stores and voice channels
      [...srv.channels.text, ...srv.channels.voice].forEach(ch => {
        state.messages[ch.id] = [];
        if (ch.type === 'voice') state.voiceChannels[ch.id] = { users:[], screenSharers:[] };
      });

      // Seed default soundboard clips
      srv.soundboard = [];
      const defaults = getDefaultSounds();
      for (const s of defaults) {
        try {
          const sound = await db.createSoundboardSound({
            serverId, name: s.name, emoji: s.emoji,
            originalAudio: s.originalAudio, trimmedAudio: s.trimmedAudio,
            trimStart: s.trimStart, trimEnd: s.trimEnd,
            duration: s.duration, volume: s.volume,
            isGlobal: s.isGlobal, createdBy: user.id
          });
          srv.soundboard.push({
            id: sound.id, name: sound.name, emoji: sound.emoji,
            trim_start: sound.trim_start, trim_end: sound.trim_end,
            duration: sound.duration, volume: sound.volume,
            is_global: sound.is_global, created_by: sound.created_by
          });
        } catch (err) {
          console.error(`[Soundboard] Failed to seed "${s.name}":`, err.message);
        }
      }

      socket.emit('server:created', { server: serializeServer(serverId) });
      console.log(`[Server] ${user.username} created server: ${serverName} (${serverId})`);
    } catch (error) {
      console.error('[Server] Error creating server:', error);
      socket.emit('error', { message: 'Failed to create server' });
    }
  });

  socket.on('server:update', async ({ serverId, name, icon, description, customIcon, emojiSharing, iceConfig }) => {
    const user = state.users[socket.id];
    if (!user) return;
    const perms = getUserPerms(user.id, serverId);
    if (!perms.manageServer && !perms.admin) {
      return socket.emit('error', { message: 'No permission' });
    }

    const srv = state.servers[serverId];
    if (!srv) return;

    try {
      // Build update object for database
      const updates = {};
      if (name) {
        srv.name = String(name).slice(0, 32);
        updates.name = srv.name;
      }
      if (icon) {
        srv.icon = icon;
        updates.icon = icon;
      }
      if (description !== undefined) {
        srv.description = String(description).slice(0, 256);
        updates.description = srv.description;
      }
      if (customIcon !== undefined) {
        srv.customIcon = customIcon;
        updates.custom_icon = customIcon;
      }
      if (emojiSharing !== undefined) {
        srv.emojiSharing = !!emojiSharing;
        updates.emoji_sharing = srv.emojiSharing;
      }

      // ICE config — owner-only
      if (iceConfig !== undefined) {
        if (srv.ownerId !== user.id) {
          return socket.emit('error', { message: 'Only the server owner can configure STUN/TURN' });
        }

        if (iceConfig === null) {
          // Clear custom config — revert to instance defaults
          srv.iceConfig = null;
          updates.ice_config = null;
        } else {
          // Validate
          const stunPattern = /^(stun|stuns):/;
          const turnPattern = /^(turn|turns):/;

          if (iceConfig.stunUrls !== undefined) {
            if (!Array.isArray(iceConfig.stunUrls) || !iceConfig.stunUrls.every(u => typeof u === 'string' && stunPattern.test(u))) {
              return socket.emit('error', { message: 'Invalid STUN URLs — must start with stun: or stuns:' });
            }
          }
          if (iceConfig.turnUrl !== undefined && iceConfig.turnUrl !== '') {
            if (typeof iceConfig.turnUrl !== 'string' || !turnPattern.test(iceConfig.turnUrl)) {
              return socket.emit('error', { message: 'Invalid TURN URL — must start with turn: or turns:' });
            }
          }
          // Require a secret if setting a TURN URL and no existing secret is saved
          const existingSecret = srv.iceConfig?.turnSecret;
          if (iceConfig.turnUrl && !iceConfig.turnSecret && !existingSecret) {
            return socket.emit('error', { message: 'TURN shared secret is required when TURN URL is set' });
          }

          const validatedConfig = {};
          if (iceConfig.stunUrls?.length > 0) validatedConfig.stunUrls = iceConfig.stunUrls;
          if (iceConfig.turnUrl) validatedConfig.turnUrl = iceConfig.turnUrl;
          // Keep existing secret if not provided in this update
          if (iceConfig.turnSecret) {
            validatedConfig.turnSecret = iceConfig.turnSecret;
          } else if (existingSecret && iceConfig.turnUrl) {
            validatedConfig.turnSecret = existingSecret;
          }

          srv.iceConfig = Object.keys(validatedConfig).length > 0 ? validatedConfig : null;
          updates.ice_config = srv.iceConfig ? JSON.stringify(srv.iceConfig) : null;
        }
      }

      // Update in database
      if (Object.keys(updates).length > 0) {
        await db.updateServer(serverId, updates);
        console.log(`[Server] ${user.username} updated server: ${serverId}`);
      }

      // ICE config changes are NOT broadcast — only acknowledge to caller
      if (iceConfig !== undefined) {
        socket.emit('server:ice-config:updated', { serverId, success: true });
      }

      // Only broadcast server:updated if non-ICE fields changed
      const hasVisibleChanges = Object.keys(updates).some(k => k !== 'ice_config');
      if (hasVisibleChanges) {
        io.emit('server:updated', { server: serializeServer(serverId) });
      }
    } catch (error) {
      console.error('[Server] Error updating server:', error);
      socket.emit('error', { message: 'Failed to update server' });
    }
  });

  socket.on('server:leave', async ({ serverId }) => {
    const user = state.users[socket.id];
    if (!user || user.isGuest) {
      return socket.emit('error', { message: 'Authentication required' });
    }

    const srv = state.servers[serverId];
    if (!srv) return socket.emit('error', { message: 'Server not found' });

    // Can't leave if you're the owner
    if (srv.ownerId === user.id) {
      return socket.emit('error', { message: 'Owners cannot leave. Transfer ownership or delete the server instead.' });
    }

    try {
      // Remove from database
      await db.removeServerMember(serverId, user.id);

      // Remove from in-memory
      delete srv.members[user.id];

      socket.emit('server:left', { serverId });
      console.log(`[Server] ${user.username} left server: ${srv.name}`);

      // Notify other members
      io.to(serverId).emit('member:left', { serverId, userId: user.id });
    } catch (error) {
      console.error('[Server] Error leaving server:', error);
      socket.emit('error', { message: 'Failed to leave server' });
    }
  });

  socket.on('server:delete', async ({ serverId }) => {
    const user = state.users[socket.id];
    if (!user || user.isGuest) {
      return socket.emit('error', { message: 'Authentication required' });
    }

    const srv = state.servers[serverId];
    if (!srv) return socket.emit('error', { message: 'Server not found' });

    // Only owner can delete
    if (srv.ownerId !== user.id) {
      return socket.emit('error', { message: 'Only the server owner can delete the server' });
    }

    // Can't delete default server
    if (serverId === DEFAULT_SERVER_ID) {
      return socket.emit('error', { message: 'Cannot delete the default server' });
    }

    try {
      // Delete from database (cascades to members, channels, etc.)
      await db.deleteServer(serverId);

      // Remove from in-memory
      delete state.servers[serverId];

      // Notify all users
      io.emit('server:deleted', { serverId });
      console.log(`[Server] ${user.username} deleted server: ${srv.name}`);
    } catch (error) {
      console.error('[Server] Error deleting server:', error);
      socket.emit('error', { message: 'Failed to delete server' });
    }
  });

  socket.on('server:transfer-ownership', async ({ serverId, newOwnerId }) => {
    const user = state.users[socket.id];
    if (!user || user.isGuest) {
      return socket.emit('error', { message: 'Authentication required' });
    }

    const srv = state.servers[serverId];
    if (!srv) return socket.emit('error', { message: 'Server not found' });

    // Only current owner can transfer
    if (srv.ownerId !== user.id) {
      return socket.emit('error', { message: 'Only the server owner can transfer ownership' });
    }

    // Can't transfer to guest
    if (newOwnerId.startsWith('guest:')) {
      return socket.emit('error', { message: 'Cannot transfer ownership to a guest user' });
    }

    // New owner must be a member
    if (!srv.members[newOwnerId]) {
      return socket.emit('error', { message: 'New owner must be a server member' });
    }

    try {
      // Update owner in database
      await db.updateServer(serverId, { owner_id: newOwnerId });

      // Update in-memory
      srv.ownerId = newOwnerId;

      // Ensure new owner has admin role
      if (!srv.members[newOwnerId].roles.includes('admin')) {
        srv.members[newOwnerId].roles.push('admin');
        await db.addServerMember(serverId, newOwnerId, srv.members[newOwnerId].roles);
      }

      // Notify all users
      io.emit('server:updated', { server: serializeServer(serverId) });
      socket.emit('ownership:transferred', { serverId, newOwnerId });
      console.log(`[Server] ${user.username} transferred ownership of ${srv.name} to ${newOwnerId}`);
    } catch (error) {
      console.error('[Server] Error transferring ownership:', error);
      socket.emit('error', { message: 'Failed to transfer ownership' });
    }
  });

  // ─── Server Moderation ────────────────────────────────────────────────────────
  socket.on('server:kick-user', async ({ serverId, userId }) => {
    const user = state.users[socket.id];
    if (!user || user.isGuest) {
      return socket.emit('error', { message: 'Authentication required' });
    }

    const srv = state.servers[serverId];
    if (!srv) return socket.emit('error', { message: 'Server not found' });

    // Check if user has admin permissions
    const perms = getUserPerms(user.id, serverId);
    if (!perms.admin) {
      return socket.emit('error', { message: 'Admin permission required to kick users' });
    }

    // Can't kick yourself
    if (userId === user.id) {
      return socket.emit('error', { message: 'You cannot kick yourself' });
    }

    // Can't kick the owner
    if (userId === srv.ownerId) {
      return socket.emit('error', { message: 'Cannot kick the server owner' });
    }

    try {
      const kickedUsername = srv.members[userId]?.username || 'Unknown';

      // Remove from database
      await db.removeServerMember(serverId, userId);

      // Remove from in-memory
      delete srv.members[userId];

      // Disconnect user from server's voice channels
      Object.keys(state.voiceChannels).forEach(channelId => {
        if (channelId.startsWith(serverId)) {
          state.voiceChannels[channelId].users = state.voiceChannels[channelId].users.filter(
            u => u.id !== userId
          );
        }
      });

      // Notify all users
      io.emit('server:updated', { server: serializeServer(serverId) });
      io.emit('user:kicked', { serverId, userId, username: kickedUsername, kickedBy: user.id });

      console.log(`[Moderation] ${user.username} kicked user ${userId} from ${srv.name}`);
    } catch (error) {
      console.error('[Moderation] Error kicking user:', error);
      socket.emit('error', { message: 'Failed to kick user' });
    }
  });

  socket.on('server:ban-user', async ({ serverId, userId }) => {
    const user = state.users[socket.id];
    if (!user || user.isGuest) {
      return socket.emit('error', { message: 'Authentication required' });
    }

    const srv = state.servers[serverId];
    if (!srv) return socket.emit('error', { message: 'Server not found' });

    // Check if user has admin permissions
    const perms = getUserPerms(user.id, serverId);
    if (!perms.admin) {
      return socket.emit('error', { message: 'Admin permission required to ban users' });
    }

    // Can't ban yourself
    if (userId === user.id) {
      return socket.emit('error', { message: 'You cannot ban yourself' });
    }

    // Can't ban the owner
    if (userId === srv.ownerId) {
      return socket.emit('error', { message: 'Cannot ban the server owner' });
    }

    try {
      const bannedUsername = srv.members[userId]?.username || 'Unknown';

      // Add to bans table
      await db.banUser(serverId, userId, user.id, 'Banned by admin');

      // Remove from server (db.banUser already calls removeServerMember)

      // Remove from in-memory
      delete srv.members[userId];

      // Disconnect user from server's voice channels
      Object.keys(state.voiceChannels).forEach(channelId => {
        if (channelId.startsWith(serverId)) {
          state.voiceChannels[channelId].users = state.voiceChannels[channelId].users.filter(
            u => u.id !== userId
          );
        }
      });

      // Notify all users
      io.emit('server:updated', { server: serializeServer(serverId) });
      io.emit('user:banned', { serverId, userId, username: bannedUsername, bannedBy: user.id });

      console.log(`[Moderation] ${user.username} banned user ${userId} from ${srv.name}`);
    } catch (error) {
      console.error('[Moderation] Error banning user:', error);
      socket.emit('error', { message: 'Failed to ban user' });
    }
  });

  socket.on('server:timeout-user', async ({ serverId, userId, duration }) => {
    const user = state.users[socket.id];
    if (!user || user.isGuest) {
      return socket.emit('error', { message: 'Authentication required' });
    }

    const srv = state.servers[serverId];
    if (!srv) return socket.emit('error', { message: 'Server not found' });

    // Check if user has admin permissions
    const perms = getUserPerms(user.id, serverId);
    if (!perms.admin) {
      return socket.emit('error', { message: 'Admin permission required to timeout users' });
    }

    // Can't timeout yourself
    if (userId === user.id) {
      return socket.emit('error', { message: 'You cannot timeout yourself' });
    }

    // Can't timeout the owner
    if (userId === srv.ownerId) {
      return socket.emit('error', { message: 'Cannot timeout the server owner' });
    }

    // Validate duration
    if (!duration || duration <= 0 || duration > 10080) { // Max 7 days
      return socket.emit('error', { message: 'Invalid timeout duration (must be 1-10080 minutes)' });
    }

    try {
      // Add to timeouts table
      await db.timeoutUser(serverId, userId, user.id, duration);

      // Notify all users
      io.emit('user:timedout', {
        serverId,
        userId,
        duration,
        expiresAt: new Date(Date.now() + duration * 60 * 1000),
        timedoutBy: user.id
      });

      console.log(`[Moderation] ${user.username} timed out user ${userId} in ${srv.name} for ${duration} minutes`);
    } catch (error) {
      console.error('[Moderation] Error timing out user:', error);
      socket.emit('error', { message: 'Failed to timeout user' });
    }
  });

  // ─── Moderation Dashboard ──────────────────────────────────────────────────────

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
  socket.on('channel:create', ({ serverId, name, type, description, categoryId, isPrivate }) => {
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
    db.saveChannel({
      id: channelId, serverId, categoryId: ch.categoryId, name: ch.name,
      type: ch.type, description: ch.description, topic: ch.topic,
      position: ch.position, isPrivate: ch.isPrivate, nsfw: ch.nsfw,
      slowMode: ch.slowMode, permissionOverrides: ch.permissionOverrides
    }).catch(err => {
      console.error('[Channel] Failed to persist channel to database:', err.message);
    });

    io.emit('server:updated', { server: serializeServer(serverId) });
  });

  socket.on('channel:update', ({ serverId, channelId, name, description, topic, nsfw, slowMode, isPrivate, permissionOverrides, position, categoryId }) => {
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
    db.saveChannel({
      id: channelId, serverId, categoryId: ch.categoryId, name: ch.name,
      type: ch.type, description: ch.description, topic: ch.topic,
      position: ch.position, isPrivate: ch.isPrivate, nsfw: ch.nsfw,
      slowMode: ch.slowMode, permissionOverrides: ch.permissionOverrides
    }).catch(err => {
      console.error('[Channel] Failed to persist channel update to database:', err.message);
    });

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

  // ─── Webhooks ─────────────────────────────────────────────────────────────────
  socket.on('webhook:create', async ({ serverId, channelId, name }) => {
    const user = state.users[socket.id];
    if (!user) return;
    const perms = getUserPerms(user.id, serverId);
    if (!perms.manageChannels && !perms.admin) return socket.emit('error', { message: 'No permission' });
    const srv = state.servers[serverId];
    if (!srv) return;
    const ch = srv.channels.text.find(c => c.id === channelId);
    if (!ch) return;

    const webhookId = uuidv4();
    const token = crypto.randomBytes(32).toString('hex');
    const webhookName = (name||'Webhook').slice(0,32);

    try {
      await db.createWebhook({ id: webhookId, channelId, name: webhookName, avatar: null, token, createdBy: user.id });
    } catch (err) {
      console.error('[Webhook] Failed to save webhook to DB:', err.message);
      return socket.emit('error', { message: 'Failed to create webhook' });
    }

    const webhook = { id: webhookId, name: webhookName, channelId, createdBy: user.id, createdAt: Date.now() };
    if (!ch.webhooks) ch.webhooks = [];
    ch.webhooks.push(webhook);
    const url = `/api/webhooks/${webhookId}/${token}`;
    socket.emit('webhook:created', { webhook: { ...webhook, url } });
    io.emit('channel:updated', { serverId, channel: ch, channels: srv.channels, categories: srv.categories });
  });

  socket.on('webhook:delete', async ({ serverId, channelId, webhookId }) => {
    const user = state.users[socket.id];
    if (!user) return;
    const perms = getUserPerms(user.id, serverId);
    if (!perms.manageChannels && !perms.admin) return socket.emit('error', { message: 'No permission' });
    const srv = state.servers[serverId];
    const ch = srv?.channels.text.find(c => c.id === channelId);
    if (!ch) return;

    try {
      await db.deleteWebhook(webhookId);
    } catch (err) {
      console.error('[Webhook] Failed to delete webhook from DB:', err.message);
    }

    ch.webhooks = (ch.webhooks||[]).filter(w => w.id !== webhookId);
    io.emit('channel:updated', { serverId, channel: ch, channels: srv.channels, categories: srv.categories });
  });

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

    // Validate audio data size
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

    // Rate limit soundboard plays
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

    // Permission check: sendTargetedSounds required
    const perms = getUserPerms(user.id, serverId);
    if (!perms.sendTargetedSounds && !perms.admin) {
      return socket.emit('error', { message: 'You do not have permission to send targeted sounds' });
    }

    // Rate limit
    try {
      await soundboardLimiter.consume(user.id);
    } catch (e) {
      return socket.emit('error', { message: 'Soundboard rate limited. Slow down!' });
    }

    const sound = (srv.soundboard || []).find(s => s.id === soundId);
    if (!sound) return;

    // Global: send to all online members of this server
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

    // Targeted: send to specific user sockets
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

  // ─── Custom Emojis ──────────────────────────────────────────────────────────
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
    // Validate MIME type and actual decoded size
    const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
    if (!imageData.startsWith('data:image/') || !ALLOWED_MIME.some(m => imageData.startsWith(`data:${m}`))) {
      return socket.emit('error', { message: 'Only PNG, JPEG, GIF, and WebP images are allowed' });
    }
    // Check actual decoded size (base64 is ~33% larger than binary)
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
    // If serverId provided, verify membership; otherwise allow (for rendering in messages)
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

  // ─── Message Link Preview ────────────────────────────────────────────────────
  socket.on('message:get-preview', async ({ serverId, channelId, messageId }, callback) => {
    const user = state.users[socket.id];
    if (!user || typeof callback !== 'function') return;

    const srv = state.servers[serverId];
    if (!srv) return callback({ error: 'Server not found' });

    // Check if user has viewChannel permission
    const perms = getUserPerms(user.id, serverId, channelId);
    if (!perms.viewChannel && !perms.admin) return callback({ error: 'No permission' });

    // Try in-memory first
    const channelMsgs = state.messages[channelId] || [];
    let msg = channelMsgs.find(m => m.id === messageId);

    // Fall back to DB
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

    // Find channel and server names
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

  // ─── Roles ────────────────────────────────────────────────────────────────────
  socket.on('role:create', ({ serverId, name, color, permissions }) => {
    const user = state.users[socket.id];
    if (!user) return;
    const perms = getUserPerms(user.id, serverId);
    if (!perms.manageRoles && !perms.admin) return socket.emit('error', { message: 'No permission' });
    const srv = state.servers[serverId];
    if (!srv) return;

    const userHighest = getUserHighestRolePosition(user.id, serverId);

    // Non-owners can't grant admin permission to new roles
    if (permissions?.admin && srv.ownerId !== user.id) {
      return socket.emit('error', { message: 'Only the server owner can create admin roles' });
    }

    // New role is placed just below the creator's highest role
    const position = Math.min(Object.keys(srv.roles).length, userHighest);
    const roleId = uuidv4();
    const rolePerms = { ...DEFAULT_PERMS, ...(permissions||{}) };
    const roleName = (name||'New Role').slice(0,32);
    const roleColor = color||null;
    srv.roles[roleId] = {
      id: roleId, name: roleName, color: roleColor, position,
      permissions: rolePerms
    };

    // Persist to database
    db.query(
      'INSERT INTO roles (id, server_id, name, color, position, permissions) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING',
      [roleId, serverId, roleName, roleColor, position, JSON.stringify(rolePerms)]
    ).catch(err => {
      console.error('[Roles] Failed to persist role to database:', err.message);
    });

    io.emit('server:updated', { server: serializeServer(serverId) });
  });

  socket.on('role:update', ({ serverId, roleId, name, color, permissions }) => {
    const user = state.users[socket.id];
    if (!user) return;
    const perms = getUserPerms(user.id, serverId);
    if (!perms.manageRoles && !perms.admin) return socket.emit('error', { message: 'No permission' });
    const srv = state.servers[serverId];
    const role = srv?.roles[roleId];
    if (!role || roleId === 'everyone') return;

    const userHighest = getUserHighestRolePosition(user.id, serverId);

    // Can't edit roles at or above your own position (unless owner)
    if (srv.ownerId !== user.id && (role.position || 0) >= userHighest) {
      return socket.emit('error', { message: 'Cannot edit a role equal to or above your own' });
    }
    // Non-owners can't grant admin permission
    if (permissions?.admin && srv.ownerId !== user.id) {
      return socket.emit('error', { message: 'Only the server owner can grant admin permission' });
    }

    if (name) role.name = name.slice(0,32);
    if (color !== undefined) role.color = color;
    if (permissions) role.permissions = { ...role.permissions, ...permissions };

    // Persist to database
    db.query(
      'UPDATE roles SET name = $1, color = $2, permissions = $3 WHERE id = $4 AND server_id = $5',
      [role.name, role.color, JSON.stringify(role.permissions), roleId, serverId]
    ).catch(err => {
      console.error('[Roles] Failed to update role in database:', err.message);
    });

    io.emit('server:updated', { server: serializeServer(serverId) });
  });

  socket.on('role:delete', ({ serverId, roleId }) => {
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

    // Can't delete roles at or above your own position (unless owner)
    if (srv.ownerId !== user.id && (role.position || 0) >= userHighest) {
      return socket.emit('error', { message: 'Cannot delete a role equal to or above your own' });
    }

    // Remove role from all members who have it
    Object.values(srv.members).forEach(member => {
      member.roles = member.roles.filter(r => r !== roleId);
    });

    // Delete the role
    delete srv.roles[roleId];

    // Persist to database
    db.query('DELETE FROM roles WHERE id = $1 AND server_id = $2', [roleId, serverId]).catch(err => {
      console.error('[Roles] Failed to delete role from database:', err.message);
    });

    io.emit('server:updated', { server: serializeServer(serverId) });
  });

  socket.on('member:role', ({ serverId, targetUserId, roleId, action }) => {
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

    // Can't assign/remove roles at or above your own position (unless owner)
    if (targetRole && srv.ownerId !== user.id && (targetRole.position || 0) >= userHighest) {
      return socket.emit('error', { message: 'Cannot assign or remove a role equal to or above your own' });
    }

    // Can't modify roles of someone with equal or higher position (unless owner)
    if (srv.ownerId !== user.id) {
      const targetHighest = getUserHighestRolePosition(targetUserId, serverId);
      if (targetHighest >= userHighest) {
        return socket.emit('error', { message: 'Cannot modify roles of a member with equal or higher rank' });
      }
    }

    if (action === 'add' && !member.roles.includes(roleId)) member.roles.push(roleId);
    if (action === 'remove') member.roles = member.roles.filter(r => r !== roleId && r !== 'everyone');

    // Persist role change to database
    db.updateServerMemberRoles(serverId, targetUserId, member.roles).catch(err => {
      console.error('[Roles] Failed to persist member role change to database:', err.message);
    });

    io.emit('server:updated', { server: serializeServer(serverId) });
  });

  // ─── Messages ─────────────────────────────────────────────────────────────────
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
        const dbMessages = await db.getChannelMessages(channelId, 50);
        if (dbMessages.length > 0) {
          state.messages[channelId] = await convertDbMessages(dbMessages, channelId);
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
    try {
      const allMsgs = state.messages[channelId] || [];
      const beforeIdx = allMsgs.findIndex(m => m.timestamp >= beforeTimestamp);
      let olderMsgs;
      if (beforeIdx > 0) {
        olderMsgs = allMsgs.slice(Math.max(0, beforeIdx - limit), beforeIdx);
      } else if (beforeIdx === 0) {
        olderMsgs = [];
      } else {
        // All messages are before the timestamp — check the DB
        olderMsgs = [];
      }
      // If we have fewer than requested from memory, try the database
      if (olderMsgs.length < limit) {
        try {
          const dbMsgs = await db.getChannelMessages(channelId, limit + 10);
          if (dbMsgs.length > 0) {
            const converted = await convertDbMessages(dbMsgs, channelId);
            // Merge into state (dedup by id)
            const existingIds = new Set(allMsgs.map(m => m.id));
            const newMsgs = converted.filter(m => !existingIds.has(m.id));
            if (newMsgs.length > 0) {
              state.messages[channelId] = [...newMsgs, ...allMsgs].sort((a, b) => a.timestamp - b.timestamp);
              // Re-search for older messages
              const updatedAll = state.messages[channelId];
              const idx = updatedAll.findIndex(m => m.timestamp >= beforeTimestamp);
              if (idx > 0) {
                olderMsgs = updatedAll.slice(Math.max(0, idx - limit), idx);
              }
            }
          }
        } catch (err) {
          console.warn('[Messages] DB fetch for older messages failed:', err.message);
        }
      }
      // For DM channels, filter out messages before the user's delete timestamp
      try {
        const account = await db.getAccountById(user.id);
        const deletedDMs = account?.settings?.deleted_dms || {};
        if (deletedDMs[channelId]) {
          const deletedAt = deletedDMs[channelId];
          olderMsgs = olderMsgs.filter(m => m.timestamp > deletedAt);
        }
      } catch (err) { /* ignore */ }

      if (typeof callback === 'function') callback({ messages: olderMsgs, hasMore: olderMsgs.length >= limit });
    } catch (err) {
      console.error('[Messages] Error fetching older messages:', err.message);
      if (typeof callback === 'function') callback({ messages: [], hasMore: false });
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

    // For DM channels, check if either user has blocked the other
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
            content: `📊 ${user.username} created a poll`,
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
              const userSocket = Object.keys(state.users).find(sid => state.users[sid].id === userId);
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
                author: { id: 'system', username: 'Roast Bot', avatar: '🔥' },
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
        const otherUserSocketId = Object.keys(state.users).find(socketId =>
          state.users[socketId].id === otherUserId
        );

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
    if (msgIndex === -1) return;

    const msg = messages[msgIndex];

    // Check permissions: author can delete own, or manageMessages/admin can delete any
    const isAuthor = msg.author.id === user.id;
    const srv = findServerByChannelId(channelId);
    const perms = srv ? getUserPerms(user.id, srv.id, channelId) : {};
    const canManage = perms.manageMessages || perms.admin;

    if (!isAuthor && !canManage) {
      return socket.emit('error', { message: 'You do not have permission to delete this message' });
    }

    // Remove from memory
    state.messages[channelId].splice(msgIndex, 1);

    // ✅ Delete from database (all messages)
    try {
      await db.deleteMessage(messageId);
    } catch (error) {
      console.error('[Message] Error deleting message from database:', error);
      // Continue even if database delete fails
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

    // ✅ Update in database (all messages)
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

  // ─── Direct Messages ──────────────────────────────────────────────────────────
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

      // Get or create DM channel in database
      const dmChannel = await db.getOrCreateDMChannel(user.id, targetUserId);
      // ✅ Phase 2: Use plain UUID, no 'dm:' prefix
      const channelId = dmChannel.id;

      // Initialize message store if not exists
      if (!state.messages[channelId]) {
        state.messages[channelId] = [];
      }

      // Load recent messages from database
      const dbMessages = await db.getChannelMessages(channelId, 50);

      // Convert database messages to runtime format
      const messages = await Promise.all(dbMessages.map(async (dbMsg) => {
        let author = Object.values(state.users).find(u => u.id === dbMsg.author_id);
        if (!author) {
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

        return {
          id: dbMsg.id,
          channelId,
          content: dbMsg.content,
          attachments: typeof dbMsg.attachments === 'string' ? JSON.parse(dbMsg.attachments || '[]') : (dbMsg.attachments || []),
          author: author || { id: dbMsg.author_id, username: 'Deleted User', avatar: '👻', color: '#80848E' },
          timestamp: new Date(dbMsg.created_at).getTime(),
          reactions: typeof dbMsg.reactions === 'string' ? JSON.parse(dbMsg.reactions || '{}') : (dbMsg.reactions || {}),
          mentions: typeof dbMsg.mentions === 'string' ? JSON.parse(dbMsg.mentions || '{}') : (dbMsg.mentions || {}),
          commandData: typeof dbMsg.command_data === 'string' ? JSON.parse(dbMsg.command_data || 'null') : (dbMsg.command_data || null)
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
        bio: targetAccount.bio
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
          createdAt: new Date(dmChannel.created_at).getTime()
        },
        messages,
        navigate: true
      });

      // Also notify the recipient so the DM appears on their side in real-time
      const recipientSocketId = Object.keys(state.users).find(
        sid => state.users[sid].id === targetUserId
      );
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

      console.log(`[DM] ${user.username} opened DM with ${targetUser.username}`);
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
      // Get all DM channels for user
      const dmChannels = await db.getDMChannelsForUser(user.id);

      // Filter out hidden DMs
      const account = await db.getAccountById(user.id);
      const hiddenDMs = account?.settings?.hidden_dms || [];
      const visibleChannels = dmChannels.filter(dm => !hiddenDMs.includes(dm.id));

      // Build DM list with participant info and last message
      const dmList = await Promise.all(visibleChannels.map(async (dmChannel) => {
        // ✅ Phase 2: Use plain UUID, no 'dm:' prefix
        const channelId = dmChannel.id;

        // Determine other participant
        const otherUserId = dmChannel.participant_1 === user.id
          ? dmChannel.participant_2
          : dmChannel.participant_1;

        // Get participant info
        const participantAccount = await db.getAccountById(otherUserId);
        const participant = participantAccount ? {
          id: participantAccount.id,
          username: participantAccount.username,
          avatar: participantAccount.avatar,
          customAvatar: participantAccount.custom_avatar,
          color: participantAccount.color,
          status: participantAccount.status,
          bio: participantAccount.bio
        } : {
          id: otherUserId,
          username: 'Unknown User',
          avatar: '❓',
          color: '#60A5FA',
          status: 'offline'
        };

        // Get last message from database
        const messages = await db.getChannelMessages(channelId, 1);
        let lastMessage = null;

        if (messages.length > 0) {
          const dbMsg = messages[0];
          lastMessage = {
            id: dbMsg.id,
            content: dbMsg.content,
            timestamp: new Date(dbMsg.created_at).getTime(),
            authorId: dbMsg.author_id
          };
        }

        // Check if participant is online
        const isOnline = Object.values(state.users).some(u => u.id === otherUserId);
        if (isOnline) {
          participant.status = 'online';
        }

        return {
          id: channelId,
          type: 'dm',
          participant,
          lastMessage,
          createdAt: new Date(dmChannel.created_at).getTime()
        };
      }));

      // Sort by last message time (most recent first)
      dmList.sort((a, b) => {
        const aTime = a.lastMessage?.timestamp || a.createdAt;
        const bTime = b.lastMessage?.timestamp || b.createdAt;
        return bTime - aTime;
      });

      socket.emit('dm:list', { dms: dmList });
      console.log(`[DM] ${user.username} requested DM list (${dmList.length} conversations)`);
    } catch (error) {
      console.error('[DM] Error fetching DM list:', error);
      socket.emit('error', { message: 'Failed to fetch DM list' });
    }
  });

  // Mark DM as read
  socket.on('dm:mark-read', async ({ channelId, messageId }) => {
    const user = state.users[socket.id];

    // ✅ SECURITY: Authentication check
    const authCheck = validation.requireAuth(user);
    if (!authCheck.authorized) {
      return socket.emit('error', { message: authCheck.error });
    }

    // ✅ SECURITY: Rate limiting
    const rateCheck = validation.markReadLimiter.check(user.id);
    if (!rateCheck.allowed) {
      return socket.emit('error', { message: rateCheck.error });
    }

    // ✅ SECURITY: Validate channel ID
    const channelValidation = validation.validateChannelId(channelId);
    if (!channelValidation.valid) {
      return socket.emit('error', { message: channelValidation.error });
    }

    // ✅ SECURITY: Validate message ID (optional)
    const messageValidation = validation.validateMessageId(messageId, true);
    if (!messageValidation.valid) {
      return socket.emit('error', { message: messageValidation.error });
    }

    try {
      // ✅ SECURITY: Check if user is a participant in this DM
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

  // Typing indicators (unified handler - emits both old and new event formats)
  socket.on('typing:start', ({ channelId }) => {
    const user = state.users[socket.id];
    if (!user) return;
    const userInfo = { id: user.id, username: user.username, avatar: user.avatar, color: user.color };
    socket.to(`text:${channelId}`).emit('typing:start', { channelId, user: userInfo });
    socket.to(`text:${channelId}`).emit('typing:update', { channelId, user: userInfo, typing: true });
  });

  socket.on('typing:stop', ({ channelId }) => {
    const user = state.users[socket.id];
    if (!user) return;
    const userInfo = { id: user.id, username: user.username, avatar: user.avatar, color: user.color };
    socket.to(`text:${channelId}`).emit('typing:stop', { channelId, userId: user.id });
    socket.to(`text:${channelId}`).emit('typing:update', { channelId, user: userInfo, typing: false });
  });

  // ─── Group DMs ────────────────────────────────────────────────────────────────
  socket.on('group-dm:create', async ({ participantIds, name }) => {
    const user = state.users[socket.id];

    // ✅ SECURITY: Authentication check
    const authCheck = validation.requireAuth(user);
    if (!authCheck.authorized) {
      return socket.emit('error', { message: authCheck.error });
    }

    // ✅ SECURITY: Rate limiting
    const rateCheck = validation.groupDMCreateLimiter.check(user.id);
    if (!rateCheck.allowed) {
      return socket.emit('error', { message: rateCheck.error });
    }

    // ✅ SECURITY: Validate participant IDs
    const participantValidation = validation.validateParticipantIds(participantIds);
    if (!participantValidation.valid) {
      return socket.emit('error', { message: participantValidation.error });
    }

    // ✅ SECURITY: Sanitize group name
    const sanitizedName = validation.sanitizeGroupDMName(name);

    // ✅ SECURITY: Check creator isn't in participant list (prevents duplicates)
    if (participantIds.includes(user.id)) {
      return socket.emit('error', { message: 'You cannot add yourself as a participant' });
    }

    try {
      // ✅ SECURITY: Verify all participants exist and aren't blocked
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
          status: Object.values(state.users).some(u => u.id === p.id) ? 'online' : 'offline'
        })),
        unreadCount: 0,
        createdAt: Date.now()
      };

      // Notify all participants
      const allParticipantIds = [user.id, ...participantIds];
      allParticipantIds.forEach(participantId => {
        const participantSocket = Object.keys(state.users).find(sid =>
          state.users[sid].id === participantId
        );
        if (participantSocket) {
          io.to(participantSocket).emit('group-dm:created', { channel, messages });
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

    // ✅ SECURITY: Authentication check
    const authCheck = validation.requireAuth(user);
    if (!authCheck.authorized) {
      return socket.emit('error', { message: authCheck.error });
    }

    // ✅ SECURITY: Rate limiting
    const rateCheck = validation.participantManageLimiter.check(user.id);
    if (!rateCheck.allowed) {
      return socket.emit('error', { message: rateCheck.error });
    }

    // ✅ SECURITY: Validate channel ID
    const channelValidation = validation.validateChannelId(channelId);
    if (!channelValidation.valid) {
      return socket.emit('error', { message: channelValidation.error });
    }

    // ✅ SECURITY: Validate target user ID
    if (!validation.validateUUID(targetUserId)) {
      return socket.emit('error', { message: 'Invalid user ID' });
    }

    try {
      // ✅ SECURITY: Check if user is a participant
      const isParticipant = await db.isParticipantInDM(channelId, user.id);
      if (!isParticipant) {
        return socket.emit('error', { message: 'You are not a participant in this group DM' });
      }

      // ✅ SECURITY: Check if target user exists
      const targetUser = await db.getAccountById(targetUserId);
      if (!targetUser) {
        return socket.emit('error', { message: 'User does not exist' });
      }

      // ✅ SECURITY: Check if target is already a participant
      const isAlreadyParticipant = await db.isParticipantInDM(channelId, targetUserId);
      if (isAlreadyParticipant) {
        return socket.emit('error', { message: 'User is already a participant' });
      }

      // ✅ SECURITY: Check blocking status
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
        status: Object.values(state.users).some(u => u.id === rawParticipant.id) ? 'online' : 'offline'
      } : null;

      // Notify all participants
      participants.forEach(p => {
        const participantSocket = Object.keys(state.users).find(sid =>
          state.users[sid].id === p.id
        );
        if (participantSocket) {
          io.to(participantSocket).emit('group-dm:participant-added', {
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

    // ✅ SECURITY: Authentication check
    const authCheck = validation.requireAuth(user);
    if (!authCheck.authorized) {
      return socket.emit('error', { message: authCheck.error });
    }

    // ✅ SECURITY: Rate limiting
    const rateCheck = validation.participantManageLimiter.check(user.id);
    if (!rateCheck.allowed) {
      return socket.emit('error', { message: rateCheck.error });
    }

    // ✅ SECURITY: Validate channel ID
    const channelValidation = validation.validateChannelId(channelId);
    if (!channelValidation.valid) {
      return socket.emit('error', { message: channelValidation.error });
    }

    // ✅ SECURITY: Validate target user ID
    if (!validation.validateUUID(targetUserId)) {
      return socket.emit('error', { message: 'Invalid user ID' });
    }

    try {
      // ✅ SECURITY: Check if user is a participant
      const isParticipant = await db.isParticipantInDM(channelId, user.id);
      if (!isParticipant) {
        return socket.emit('error', { message: 'You are not a participant in this group DM' });
      }

      // ✅ SECURITY: Only allow removing self or if creator
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
        const participantSocket = Object.keys(state.users).find(sid =>
          state.users[sid].id === p.id
        );
        if (participantSocket) {
          io.to(participantSocket).emit('group-dm:participant-removed', {
            channelId,
            userId: targetUserId
          });
        }
      });

      // Notify the removed user
      const removedSocket = Object.keys(state.users).find(sid =>
        state.users[sid].id === targetUserId
      );
      if (removedSocket) {
        io.to(removedSocket).emit('group-dm:removed', { channelId });
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
        const participantSocket = Object.keys(state.users).find(sid =>
          state.users[sid].id === participantId
        );
        if (participantSocket) {
          io.to(participantSocket).emit('dm:call-incoming', {
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

    // Notify caller that the call was declined
    const ch = state.voiceChannels[channelId];
    if (ch) {
      ch.users.forEach(socketId => {
        io.to(socketId).emit('dm:call-declined', { channelId, userId: user.id, username: user.username });
      });
    }
  });

  // ─── Voice ICE Config ──────────────────────────────────────────────────────────
  socket.on('voice:ice-config', ({ serverId }, callback) => {
    const user = state.users[socket.id];
    if (!user) return callback?.({ error: 'Not authenticated' });
    const iceServers = buildIceServers(serverId, user.id);
    callback?.({ iceServers });
  });

  // Owner-only: fetch raw ICE config for settings UI (never includes secrets in full, but shows structure)
  socket.on('server:get-ice-config', ({ serverId }, callback) => {
    const user = state.users[socket.id];
    if (!user) return callback?.({ error: 'Not authenticated' });
    const srv = state.servers[serverId];
    if (!srv) return callback?.({ error: 'Server not found' });
    if (srv.ownerId !== user.id) return callback?.({ error: 'Owner only' });
    const iceConfig = srv.iceConfig || null;
    // Return stunUrls and turnUrl but mask the secret (just indicate it's set)
    callback?.({
      iceConfig: iceConfig ? {
        stunUrls: iceConfig.stunUrls || [],
        turnUrl: iceConfig.turnUrl || '',
        hasSecret: !!iceConfig.turnSecret
      } : null
    });
  });

  // ─── Voice ────────────────────────────────────────────────────────────────────
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
    if (!ch) return;
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

  socket.on('voice:leave', () => leaveVoice(socket));

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

  // ─── WebRTC ───────────────────────────────────────────────────────────────────
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

  // ─── Screen Share ─────────────────────────────────────────────────────────────
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

  // Opt-in screen share viewing: viewer requests to watch/unwatch
  socket.on('screen:watch', ({ sharerId }) => {
    io.to(sharerId).emit('screen:add-viewer', { viewerId: socket.id });
  });

  socket.on('screen:unwatch', ({ sharerId }) => {
    io.to(sharerId).emit('screen:remove-viewer', { viewerId: socket.id });
  });

  // ─── Social Features ──────────────────────────────────────────────────────────

  // Friend System
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
      const targetSocket = Object.keys(state.users).find(sid => state.users[sid].id === targetAccount.id);
      if (targetSocket) {
        io.to(targetSocket).emit('friend:request:received', {
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

      // Notify requester if online
      const requesterSocket = Object.keys(state.users).find(sid => state.users[sid].id === friendship.requester_id);
      if (requesterSocket) {
        io.to(requesterSocket).emit('friend:accepted', { friendship });
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

      // Notify friend if online
      const friendSocket = Object.keys(state.users).find(sid => state.users[sid].id === friendId);
      if (friendSocket) {
        io.to(friendSocket).emit('friend:removed', { friendId: user.id });
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

      // Format friends: extract the "other" user's info
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

      // Format pending: nest requester/addressee info
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

      socket.emit('friend:list', { friends, pending });
    } catch (error) {
      console.error('[Friend] Error fetching friend list:', error);
      socket.emit('error', { message: 'Failed to fetch friend list' });
    }
  });

  // Block System
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
      const blocked = await db.getBlockedUsers(user.id);
      socket.emit('blocked:list', { blocked });
    } catch (error) {
      console.error('[Block] Error fetching blocked users:', error);
      socket.emit('error', { message: 'Failed to fetch blocked users' });
    }
  });

  // Report System
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

  // Server Invite System
  socket.on('invite:create', async ({ serverId, maxUses, expiresInMs }) => {
    const user = state.users[socket.id];
    if (!user) return socket.emit('error', { message: 'Authentication required' });

    const srv = state.servers[serverId];
    if (!srv || !srv.members[user.id]) {
      return socket.emit('error', { message: 'You must be a member of this server' });
    }

    // Check createInvite permission
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

  // Peek at invite info (for rendering invite embeds in messages)
  socket.on('invite:peek', async ({ inviteCode }) => {
    const user = state.users[socket.id];
    if (!user) return;

    try {
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

      // Check if invite is expired
      if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
        return socket.emit('error', { message: 'Invite has expired' });
      }

      // Check if max uses reached
      if (invite.max_uses > 0 && invite.uses >= invite.max_uses) {
        return socket.emit('error', { message: 'Invite has reached max uses' });
      }

      // Check if user is already a member
      const srv = state.servers[invite.server_id];
      if (srv && srv.members[user.id]) {
        return socket.emit('error', { message: 'You are already a member of this server' });
      }

      // Check if user is banned from this server
      if (srv) {
        const isBanned = await db.isUserBanned(invite.server_id, user.id);
        if (isBanned) {
          return socket.emit('error', { message: 'You are banned from this server' });
        }
      }

      // Add user to server
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

  socket.on('invite:list', async ({ serverId }) => {
    const user = state.users[socket.id];
    if (!user) return socket.emit('error', { message: 'Authentication required' });

    const perms = getUserPerms(user.id, serverId);
    if (!perms.manageServer && !perms.admin) {
      return socket.emit('error', { message: 'No permission to view invites' });
    }

    try {
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

  // ─── Platform Admin ──────────────────────────────────────────────────────────
  socket.on('admin:get-servers', (_, callback) => {
    const user = state.users[socket.id];
    if (!user?.isPlatformAdmin) return callback?.({ error: 'Not authorized' });
    try {
      const servers = Object.entries(state.servers)
        .filter(([, s]) => !s.isPersonal && !s.id.startsWith('personal:'))
        .map(([id, s]) => {
          const ownerUser = Object.values(state.users).find(u => u.id === s.ownerId);
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
      // Transfer or delete servers where target user is owner
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

        // Find an admin to transfer to
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

      // Remove user from in-memory server members
      for (const srv of Object.values(state.servers)) {
        delete srv.members[userId];
      }

      // Disconnect any active sockets for this user
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
        // Check if owner is missing or not a real account
        const ownerExists = srv.ownerId && memberIds.includes(srv.ownerId);
        if (ownerExists) continue;

        // Find best candidate: admin first, then non-guest, then any
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

  // ─── Disconnect ───────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    const user = state.users[socket.id];
    leaveVoice(socket);
    delete state.users[socket.id];
    if (user) {
      io.emit('user:left', { socketId: socket.id, onlineUsers: getOnlineUsers() });
      console.log(`[-] ${user.username} disconnected`);
    }
  });
});

// ─── Global Error Handler ────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Error]', err);

  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: 'Invalid request' });
  }

  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  res.status(500).json({ error: 'Internal server error' });
});

// Health check endpoint — no sensitive info
app.get('/health', (_, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3001;

// Helper: convert DB messages to runtime format
async function convertDbMessages(dbMessages, channelId) {
  return Promise.all(dbMessages.map(async (dbMsg) => {
    let author = Object.values(state.users).find(u => u.id === dbMsg.author_id);
    if (!author) {
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
      commandData: typeof dbMsg.command_data === 'string' ? JSON.parse(dbMsg.command_data || 'null') : (dbMsg.command_data || null)
    };
  }));
}

// Initialize database and start server
(async () => {
  try {
    console.log('[Server] Initializing database...');
    await db.initializeDatabase();
    console.log('[Server] Database initialized successfully');

    // Load ALL servers from database
    console.log('[Server] Loading servers from database...');
    const allDbServers = await db.getAllServers();

    // If default server doesn't exist, create it
    let hasDefault = allDbServers.some(s => s.id === DEFAULT_SERVER_ID);
    if (!hasDefault) {
      console.log('[Server] Creating default server...');
      const defaultServer = await db.createServer({
        id: DEFAULT_SERVER_ID,
        name: 'Nexus Server',
        icon: 'N',
        customIcon: null,
        ownerId: null,
        description: 'The default Nexus server'
      });
      allDbServers.push(defaultServer);
    }

    // Load each server into memory
    for (const dbServer of allDbServers) {
      const serverId = dbServer.id;

      // Load channels and categories from DB
      const dbChannels = await db.getServerChannels(serverId);
      const dbCategories = await db.getServerCategories(serverId);
      const dbRoles = await db.getServerRoles(serverId);
      const dbMembers = await db.getServerMembers(serverId);

      let srv;

      if (dbChannels.length === 0) {
        // No channels saved in DB yet -- use makeServer() for defaults
        // This handles the default server on first run and legacy servers
        srv = makeServer(serverId, dbServer.name, dbServer.icon, dbServer.owner_id, dbServer.custom_icon);
        srv.description = dbServer.description || '';
        srv.emojiSharing = dbServer.emoji_sharing || false;
        srv.iceConfig = dbServer.ice_config || null;

        // Clean up any orphaned categories for this server, then persist fresh defaults
        await db.query('DELETE FROM categories WHERE server_id = $1', [serverId]);
        for (const [catId, cat] of Object.entries(srv.categories)) {
          await db.saveCategory({ id: catId, serverId, name: cat.name, position: cat.position });
        }
        for (const ch of [...srv.channels.text, ...srv.channels.voice]) {
          await db.saveChannel({
            id: ch.id, serverId, categoryId: ch.categoryId, name: ch.name,
            type: ch.type, description: ch.description, topic: ch.topic,
            position: ch.position, isPrivate: ch.isPrivate, nsfw: ch.nsfw,
            slowMode: ch.slowMode, permissionOverrides: ch.permissionOverrides
          });
        }
      } else {
        // Rebuild server structure from DB data
        const categories = {};
        const categoryOrder = [];
        for (const dbCat of dbCategories) {
          const catId = dbCat.id;
          categories[catId] = {
            id: catId,
            name: dbCat.name,
            position: dbCat.position,
            channels: []
          };
          categoryOrder.push(catId);
        }

        const textChannels = [];
        const voiceChannels = [];
        for (const dbCh of dbChannels) {
          const ch = {
            id: dbCh.id,
            name: dbCh.name,
            type: dbCh.type,
            description: dbCh.description || '',
            serverId,
            categoryId: dbCh.category_id,
            topic: dbCh.topic || '',
            nsfw: dbCh.nsfw || false,
            slowMode: dbCh.slow_mode || 0,
            webhooks: [],
            position: dbCh.position || 0,
            isPrivate: dbCh.is_private || false,
            permissionOverrides: typeof dbCh.permission_overrides === 'string'
              ? JSON.parse(dbCh.permission_overrides || '{}')
              : (dbCh.permission_overrides || {})
          };
          if (ch.type === 'voice') {
            voiceChannels.push(ch);
          } else {
            textChannels.push(ch);
          }
          // Add channel to its category
          if (categories[dbCh.category_id]) {
            categories[dbCh.category_id].channels.push(dbCh.id);
          }
        }

        // Load webhooks from DB and attach to channel objects
        try {
          const dbWebhooks = await db.getWebhooksForServer(serverId);
          for (const dbWh of dbWebhooks) {
            const ch = textChannels.find(c => c.id === dbWh.channel_id);
            if (ch) {
              ch.webhooks.push({
                id: dbWh.id,
                name: dbWh.name,
                channelId: dbWh.channel_id,
                createdBy: dbWh.created_by,
                createdAt: new Date(dbWh.created_at).getTime()
              });
            }
          }
        } catch (err) {
          console.error(`[Server] Error loading webhooks for server ${serverId}:`, err.message);
        }

        srv = {
          id: serverId,
          name: dbServer.name,
          icon: dbServer.icon || 'N',
          customIcon: dbServer.custom_icon,
          ownerId: dbServer.owner_id,
          description: dbServer.description || '',
          createdAt: new Date(dbServer.created_at).getTime(),
          categories,
          categoryOrder,
          roles: {
            'everyone': { id:'everyone', name:'@everyone', color:null, position:0, permissions:{...DEFAULT_PERMS} },
            'admin': { id:'admin', name:'Admin', color:'#ED4245', position:1, permissions:{
              viewChannel:true, sendMessages:true, attachFiles:true, joinVoice:true,
              readHistory:true, addReactions:true, mentionEveryone:true, manageMessages:true,
              manageChannels:true, manageRoles:true, manageServer:true, manageEmojis:true, admin:true,
              createInvite:true, sendTargetedSounds:true
            }}
          },
          members: {},
          channels: { text: textChannels, voice: voiceChannels },
          customEmojis: [],
          emojiSharing: dbServer.emoji_sharing || false,
          iceConfig: dbServer.ice_config || null
        };
      }

      // Merge DB roles on top of defaults (ensure new permissions have base values)
      for (const dbRole of dbRoles) {
        const roleId = dbRole.id;
        const dbPerms = typeof dbRole.permissions === 'string'
          ? JSON.parse(dbRole.permissions)
          : (dbRole.permissions || {});
        // If this role already exists from defaults, merge DB perms on top
        const basePerms = srv.roles[roleId]?.permissions || {};
        srv.roles[roleId] = {
          id: roleId,
          name: dbRole.name,
          color: dbRole.color,
          position: dbRole.position,
          permissions: { ...basePerms, ...dbPerms }
        };
      }

      // Load members from DB (including profile info for offline display)
      for (const dbMember of dbMembers) {
        const memberRoles = typeof dbMember.roles === 'string'
          ? JSON.parse(dbMember.roles)
          : (dbMember.roles || ['everyone']);
        srv.members[dbMember.account_id] = {
          roles: memberRoles,
          joinedAt: new Date(dbMember.joined_at).getTime(),
          username: dbMember.username,
          avatar: dbMember.avatar,
          customAvatar: dbMember.custom_avatar || null,
          color: dbMember.color || '#3B82F6'
        };
      }

      state.servers[serverId] = srv;

      // Initialize message stores and voice channels, load recent messages from DB
      for (const ch of [...srv.channels.text, ...srv.channels.voice]) {
        if (ch.type === 'voice') {
          state.voiceChannels[ch.id] = { users: [], screenSharers: [] };
        } else {
          // Load recent messages from database for text channels
          try {
            const dbMessages = await db.getChannelMessages(ch.id, 50);
            if (dbMessages.length > 0) {
              state.messages[ch.id] = await convertDbMessages(dbMessages, ch.id);
            } else {
              state.messages[ch.id] = [];
            }
          } catch (err) {
            console.error(`[Server] Error loading messages for channel ${ch.id}:`, err.message);
            state.messages[ch.id] = [];
          }
        }
      }

      // Load soundboard sounds (metadata only)
      try {
        const sounds = await db.getSoundboardSounds(serverId);
        srv.soundboard = sounds.map(s => ({
          id: s.id, name: s.name, emoji: s.emoji,
          trim_start: s.trim_start, trim_end: s.trim_end,
          duration: s.duration, volume: s.volume, is_global: s.is_global, created_by: s.created_by
        }));
      } catch (err) {
        console.error(`[Server] Error loading soundboard for ${serverId}:`, err.message);
        srv.soundboard = [];
      }

      // Load custom emojis (metadata only)
      try {
        const emojis = await db.getCustomEmojis(serverId);
        srv.customEmojis = emojis.map(e => ({
          id: e.id, name: e.name, content_type: e.content_type,
          animated: e.animated, created_by: e.created_by
        }));
      } catch (err) {
        console.error(`[Server] Error loading custom emojis for ${serverId}:`, err.message);
        srv.customEmojis = [];
      }

      console.log(`[Server] Loaded server: ${srv.name} (${serverId}) - ${srv.channels.text.length} text, ${srv.channels.voice.length} voice channels, ${Object.keys(srv.members).length} members, ${Object.keys(srv.roles).length} roles, ${srv.soundboard.length} sounds, ${srv.customEmojis.length} emojis`);
    }

    console.log(`[Server] Loaded ${Object.keys(state.servers).length} server(s) from database`);

    // Seed default soundboard clips into servers that don't have them yet
    const defaultSounds = getDefaultSounds();
    for (const serverId of Object.keys(state.servers)) {
      const srv = state.servers[serverId];
      if (srv.isPersonal) continue;
      const existingNames = new Set((srv.soundboard || []).map(s => s.name));
      const missing = defaultSounds.filter(s => !existingNames.has(s.name));
      if (missing.length > 0) {
        console.log(`[Soundboard] Seeding ${missing.length} default sounds into "${srv.name}"`);
        for (const s of missing) {
          try {
            const sound = await db.createSoundboardSound({
              serverId, name: s.name, emoji: s.emoji,
              originalAudio: s.originalAudio, trimmedAudio: s.trimmedAudio,
              trimStart: s.trimStart, trimEnd: s.trimEnd,
              duration: s.duration, volume: s.volume,
              isGlobal: s.isGlobal, createdBy: srv.ownerId
            });
            srv.soundboard.push({
              id: sound.id, name: sound.name, emoji: sound.emoji,
              trim_start: sound.trim_start, trim_end: sound.trim_end,
              duration: sound.duration, volume: sound.volume,
              is_global: sound.is_global, created_by: sound.created_by
            });
          } catch (err) {
            console.error(`[Soundboard] Failed to seed "${s.name}":`, err.message);
          }
        }
      }
    }

    // Clean up expired tokens on startup
    try {
      const cleaned = await db.cleanupExpiredTokens();
      if (cleaned > 0) console.log(`[Auth] Cleaned up ${cleaned} expired tokens on startup`);
    } catch (err) {
      console.error('[Auth] Failed to clean up expired tokens:', err.message);
    }

    // Schedule hourly token cleanup
    setInterval(async () => {
      try {
        const cleaned = await db.cleanupExpiredTokens();
        if (cleaned > 0) console.log(`[Auth] Cleaned up ${cleaned} expired tokens`);
      } catch (err) {
        console.error('[Auth] Token cleanup error:', err.message);
      }
    }, 60 * 60 * 1000);

    httpServer.listen(PORT, () => console.log(`Nexus server running on port ${PORT}`));
  } catch (error) {
    console.error('[Server] Failed to initialize database:', error);
    process.exit(1);
  }
})();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[Server] SIGTERM received, closing gracefully...');
  await db.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[Server] SIGINT received, closing gracefully...');
  await db.close();
  process.exit(0);
});

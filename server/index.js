const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const { RateLimiterMemory } = require('rate-limiter-flexible');
const db = require('./db');
const config = require('./config');
const utils = require('./utils');
const { getDefaultSounds } = require('./default-sounds');

// ─── Shared state & helpers ─────────────────────────────────────────────────
const { state, DEFAULT_SERVER_ID, removeUser } = require('./state');
const {
  makeServer, serializeServer, getOnlineUsers, convertDbMessagesToRuntime,
  leaveVoice
} = require('./helpers');
const { DEFAULT_PERMS, hashPassword, hashPasswordLegacy, verifyPassword } = utils;

// ─── Handler modules ────────────────────────────────────────────────────────
const authHandlers = require('./handlers/auth');
const serverHandlers = require('./handlers/servers');
const channelHandlers = require('./handlers/channels');
const messageHandlers = require('./handlers/messages');
const roleHandlers = require('./handlers/roles');
const dmHandlers = require('./handlers/dms');
const socialHandlers = require('./handlers/social');
const voiceHandlers = require('./handlers/voice');
const webhookHandlers = require('./handlers/webhooks');
const emojiHandlers = require('./handlers/emoji');
const adminHandlers = require('./handlers/admin');
const bookmarkHandlers = require('./handlers/bookmarks');
const auditHandlers = require('./handlers/audit');
const automodHandlers = require('./handlers/automod');

// ─── Express setup ──────────────────────────────────────────────────────────
const app = express();

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      workerSrc: ["'self'"],
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

const ALLOWED_ORIGINS = [
  process.env.CLIENT_URL || 'http://localhost:3000',
  'capacitor://localhost',
  'http://localhost',
  'https://localhost',
  'tauri://localhost',
  'http://tauri.localhost',
  'https://tauri.localhost',
  ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()) : []),
].map(o => o.replace(/\/+$/, ''));

const corsOptions = {
  origin: function (origin, callback) {
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

app.use((err, req, res, next) => {
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'Origin not allowed by CORS policy' });
  }
  next(err);
});

app.use(express.json({ limit: '20mb' }));

const apiLimiter = new RateLimiterMemory({ points: 10, duration: 10 });
const rateLimitMiddleware = async (req, res, next) => {
  try {
    const key = req.ip || req.connection.remoteAddress;
    await apiLimiter.consume(key);
    next();
  } catch (error) {
    res.status(429).json({ error: 'Too many requests, please try again later' });
  }
};
app.use('/api', rateLimitMiddleware);

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

// ─── Socket.IO setup ────────────────────────────────────────────────────────
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: corsOptions,
  maxHttpBufferSize: 20e6,
  pingTimeout: 300000,
  pingInterval: 25000,
});

const COLORS = ['#3B82F6','#57F287','#FEE75C','#EB459E','#ED4245','#60A5FA','#3ba55c','#faa61a'];
const AVATARS = ['🐺','🦊','🐱','🐸','🦁','🐙','🦄','🐧','🦅','🐉','🦋','🐻'];

// ─── Health check ───────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', name: 'Nexus' });
});
app.get('/health', (_, res) => res.json({ status: 'ok' }));

// ─── Webhook HTTP endpoint ──────────────────────────────────────────────────
app.post('/api/webhooks/:webhookId/:token', async (req, res) => {
  const { webhookId, token } = req.params;
  const { content, username, avatar, avatar_url, attachments, embeds, tts } = req.body;

  const hasContent = content && typeof content === 'string' && content.trim();
  const hasEmbeds = Array.isArray(embeds) && embeds.length > 0;
  if (!hasContent && !hasEmbeds) {
    return res.status(400).json({ error: 'content or embeds is required' });
  }
  if (username && typeof username !== 'string') {
    return res.status(400).json({ error: 'username must be a string' });
  }

  const wh = await db.getWebhookByIdAndToken(webhookId, token);
  if (!wh) {
    return res.status(401).json({ error: 'Invalid webhook ID or token' });
  }

  const srv = state.servers[wh.server_id];
  if (srv) {
    const ch = srv.channels.text.find(c => c.id === wh.channel_id);
    if (ch) {
      const validAttachments = (attachments || [])
        .slice(0, 4)
        .filter(att => att.url && (att.url.startsWith('http') || att.url.startsWith('data:')));

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
      const displayAvatar = avatar_url || avatar || '🤖';

      const webhookContent = hasContent ? String(content).slice(0, 2000) : '';
      const webhookMentions = utils.parseMentions(webhookContent, srv);
      const webhookChannelLinks = utils.parseChannelLinks(webhookContent, srv, srv.id);

      const { v4: uuidv4 } = require('uuid');
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

      try {
        await db.saveMessage({
          id: msg.id, channelId: ch.id, authorId: null,
          content: msg.content, attachments: validAttachments,
          isWebhook: true, webhookUsername: displayUsername,
          webhookAvatar: displayAvatar, replyTo: null,
          mentions: webhookMentions, embeds: validEmbeds
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

// ─── Auth endpoints ─────────────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'username and password required' });

    const usernameRegex = /^[a-zA-Z0-9 _\-\.!@#$%^&*()+=]{1,32}$/;
    if (!usernameRegex.test(username)) {
      return res.status(400).json({ error: 'Username can only contain letters, numbers, spaces, and standard special characters' });
    }

    const passwordRegex = /^[\x20-\x7E]{8,128}$/;
    if (!passwordRegex.test(password)) {
      return res.status(400).json({ error: 'Password must be 8-128 characters using letters, numbers, and symbols' });
    }

    const existingAccount = await db.getAccountByUsername(username);
    if (existingAccount) return res.status(409).json({ error: 'Username already taken' });

    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const avatarEmoji = AVATARS[Math.floor(Math.random() * AVATARS.length)];

    const passwordHash = await hashPassword(password);
    const account = await db.createAccount({
      username: username.slice(0, 32),
      passwordHash,
      salt: 'bcrypt',
      avatar: avatarEmoji,
      color
    });

    // Generate recovery codes
    const crypto = require('crypto');
    const recoveryCodes = [];
    const codeHashes = [];
    for (let i = 0; i < 8; i++) {
      const code = crypto.randomBytes(4).toString('hex');
      recoveryCodes.push(code);
      codeHashes.push(await hashPassword(code));
    }
    await db.createRecoveryCodes(account.id, codeHashes);

    const { token } = await db.createToken(account.id);

    res.json({
      token,
      account: { id: account.id, username: account.username, avatar: account.avatar, color: account.color },
      recoveryCodes
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

    const account = await db.getAccountByUsername(username);
    if (!account) return res.status(401).json({ error: 'Invalid credentials' });

    let passwordValid = false;
    if (account.password_hash.startsWith('$2b$')) {
      passwordValid = await verifyPassword(password, account.password_hash);
    } else {
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

    const { token } = await db.createToken(account.id);

    res.json({
      token,
      account: {
        id: account.id, username: account.username, avatar: account.avatar,
        color: account.color, customAvatar: account.custom_avatar,
        settings: account.settings || {}
      }
    });
  } catch (error) {
    console.error('[Auth] Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/logout', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) await db.deleteToken(token);
    res.json({ success: true });
  } catch (error) {
    res.json({ success: true });
  }
});

app.post('/api/auth/recover', async (req, res) => {
  try {
    const { username, recoveryCode, newPassword } = req.body;
    if (!username || !recoveryCode || !newPassword) {
      return res.status(400).json({ error: 'Username, recovery code, and new password are required' });
    }

    const passwordRegex = /^[\x20-\x7E]{8,128}$/;
    if (!passwordRegex.test(newPassword)) {
      return res.status(400).json({ error: 'Password must be 8-128 characters using letters, numbers, and symbols' });
    }

    const account = await db.getAccountByUsername(username);
    if (!account) {
      return res.status(400).json({ error: 'Invalid username or recovery code' });
    }

    const unusedCodes = await db.getUnusedRecoveryCodes(account.id);
    let matchedCode = null;
    for (const code of unusedCodes) {
      const isMatch = await verifyPassword(recoveryCode, code.code_hash);
      if (isMatch) {
        matchedCode = code;
        break;
      }
    }

    if (!matchedCode) {
      return res.status(400).json({ error: 'Invalid username or recovery code' });
    }

    const newHash = await hashPassword(newPassword);
    await db.updateAccountPassword(account.id, newHash, 'bcrypt');
    await db.markRecoveryCodeUsed(matchedCode.id);

    res.json({ success: true });
  } catch (error) {
    console.error('[Auth] Recovery error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/auth/account', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const accountId = await db.validateToken(token);
    if (!accountId) return res.status(401).json({ error: 'Unauthorized' });

    for (const [serverId, srv] of Object.entries(state.servers)) {
      if (srv.ownerId !== accountId) continue;

      const memberIds = Object.keys(srv.members).filter(id => id !== accountId);
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

      if (!srv.members[newOwnerId].roles.includes('admin')) {
        srv.members[newOwnerId].roles.push('admin');
        await db.addServerMember(serverId, newOwnerId, srv.members[newOwnerId].roles);
      }

      io.emit('server:updated', { server: serializeServer(serverId) });
    }

    for (const srv of Object.values(state.servers)) {
      delete srv.members[accountId];
    }

    for (const [socketId, user] of Object.entries(state.users)) {
      if (user.id === accountId) {
        const sock = io.sockets.sockets.get(socketId);
        if (sock) sock.disconnect(true);
        delete state.users[socketId];
      }
    }

    await db.deleteAccount(accountId);
    res.json({ success: true });
    console.log(`[Auth] Account deleted: ${accountId}`);
  } catch (error) {
    console.error('[Auth] Account deletion error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── File uploads ───────────────────────────────────────────────────────────
app.post('/api/user/avatar', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const accountId = await db.validateToken(token);
    if (!accountId) return res.status(401).json({ error: 'Unauthorized' });

    const { avatar } = req.body;
    if (!avatar || !avatar.startsWith('data:image/')) return res.status(400).json({ error: 'Invalid image' });

    const base64Data = avatar.split(',')[1] || '';
    const actualBytes = Math.ceil(base64Data.length * 3 / 4);
    if (actualBytes > 2 * 1024 * 1024) return res.status(400).json({ error: 'Image too large (max 2MB)' });

    await db.updateAccount(accountId, { custom_avatar: avatar });
    res.json({ customAvatar: avatar });
  } catch (error) {
    console.error('[User] Avatar upload error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/server/:serverId/icon', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const accountId = await db.validateToken(token);
    if (!accountId) return res.status(401).json({ error: 'Unauthorized' });

    const { serverId } = req.params;
    const { icon } = req.body;
    if (!icon || !icon.startsWith('data:image/')) return res.status(400).json({ error: 'Invalid image' });

    const base64Data = icon.split(',')[1] || '';
    const actualBytes = Math.ceil(base64Data.length * 3 / 4);
    if (actualBytes > 2 * 1024 * 1024) return res.status(400).json({ error: 'Image too large (max 2MB)' });

    const srv = state.servers[serverId];
    if (!srv) return res.status(404).json({ error: 'Server not found' });
    const member = srv.members[accountId];
    if (srv.ownerId !== accountId && (!member || !member.roles.includes('admin'))) {
      return res.status(403).json({ error: 'No permission' });
    }

    srv.customIcon = icon;
    await db.updateServer(serverId, { custom_icon: icon });
    io.emit('server:updated', { server: serializeServer(serverId) });
    res.json({ customIcon: icon });
  } catch (error) {
    console.error('[Server] Icon upload error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GIF Search (Giphy) ────────────────────────────────────────────────────
const GIPHY_API_KEY = process.env.GIPHY_API_KEY;

app.get('/api/gifs/search', requireApiAuth, async (req, res) => {
  if (!GIPHY_API_KEY) return res.json({ results: [] });
  const { q, serverId } = req.query;
  if (serverId && state.servers[serverId]?.lanMode) return res.json({ results: [] });
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
      id: r.id, title: r.title || '',
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
  const { serverId } = req.query;
  if (serverId && state.servers[serverId]?.lanMode) return res.json({ results: [] });
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
      id: r.id, title: r.title || '',
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

// ─── OpenGraph link previews ────────────────────────────────────────────────
const ogCache = new Map();
const OG_CACHE_TTL = 5 * 60 * 1000;
const OG_CACHE_MAX = 1000;

function isPrivateUrl(urlString) {
  return utils.isPrivateUrl(urlString);
}

async function safeFetch(url, options = {}) {
  const resp = await fetch(url, { ...options, redirect: 'manual' });
  if (resp.status < 300 || resp.status >= 400) return resp;
  const location = resp.headers.get('location');
  if (!location) return resp;
  const redirectUrl = new URL(location, url).toString();
  if (isPrivateUrl(redirectUrl)) {
    throw new Error('Redirect target blocked by SSRF protection');
  }
  return fetch(redirectUrl, { ...options, redirect: 'manual' });
}

app.get('/api/og', requireApiAuth, async (req, res) => {
  const { url, serverId } = req.query;
  if (!url) return res.status(400).json({ error: 'URL required' });
  if (serverId && state.servers[serverId]?.lanMode) {
    return res.status(403).json({ error: 'URL previews disabled in LAN mode' });
  }

  try { new URL(url); } catch { return res.status(400).json({ error: 'Invalid URL' }); }

  if (isPrivateUrl(url)) {
    return res.status(400).json({ error: 'URL not allowed' });
  }

  const cached = ogCache.get(url);
  if (cached && Date.now() - cached.ts < OG_CACHE_TTL) {
    return res.json(cached.data);
  }

  try {
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
        let videoId = '';
        if (urlObj.hostname === 'youtu.be') videoId = urlObj.pathname.slice(1);
        else videoId = urlObj.searchParams.get('v') || '';
        const data = {
          title: json.title,
          description: json.author_name ? `by ${json.author_name}` : '',
          image: videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : json.thumbnail_url,
          siteName: 'YouTube', url, type: 'youtube'
        };
        if (ogCache.size >= OG_CACHE_MAX) ogCache.delete(ogCache.keys().next().value);
        ogCache.set(url, { data, ts: Date.now() });
        return res.json(data);
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const resp = await safeFetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'NexusBot/1.0 (OpenGraph Fetcher)' },
      size: 50000
    });
    clearTimeout(timeout);

    if (!resp.ok) {
      return res.json({ title: '', description: '', image: '', siteName: '', url });
    }

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

    const decodeEntities = (str) => str
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
      .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#39;/g, "'");

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
      url, type: 'website'
    };

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

// ─── Global Error Handler ───────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Error]', err);
  if (err.name === 'ValidationError') return res.status(400).json({ error: 'Invalid request' });
  if (err.name === 'UnauthorizedError') return res.status(401).json({ error: 'Unauthorized' });
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Socket.IO connection — wire handler modules ────────────────────────────
io.on('connection', (socket) => {
  console.log(`[+] Socket connected: ${socket.id}`);

  authHandlers(io, socket);
  serverHandlers(io, socket);
  channelHandlers(io, socket);
  messageHandlers(io, socket);
  roleHandlers(io, socket);
  dmHandlers(io, socket);
  socialHandlers(io, socket);
  voiceHandlers(io, socket);
  webhookHandlers(io, socket);
  emojiHandlers(io, socket);
  adminHandlers(io, socket);
  bookmarkHandlers(io, socket);
  auditHandlers(io, socket);
  automodHandlers(io, socket);

  socket.on('disconnect', () => {
    const user = state.users[socket.id];
    leaveVoice(socket, io);
    removeUser(socket.id);
    if (user) {
      io.emit('user:left', { socketId: socket.id, onlineUsers: getOnlineUsers() });
      console.log(`[-] ${user.username} disconnected`);
    }
  });
});

// ─── Server startup ─────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;

(async () => {
  try {
    console.log('[Server] Initializing database...');
    await db.initializeDatabase();
    console.log('[Server] Database initialized successfully');

    console.log('[Server] Loading servers from database...');
    const allDbServers = await db.getAllServers();

    let hasDefault = allDbServers.some(s => s.id === DEFAULT_SERVER_ID);
    if (!hasDefault) {
      console.log('[Server] Creating default server...');
      const defaultServer = await db.createServer({
        id: DEFAULT_SERVER_ID, name: 'Nexus Server', icon: 'N',
        customIcon: null, ownerId: null, description: 'The default Nexus server'
      });
      allDbServers.push(defaultServer);
    }

    for (const dbServer of allDbServers) {
      const serverId = dbServer.id;

      const dbChannels = await db.getServerChannels(serverId);
      const dbCategories = await db.getServerCategories(serverId);
      const dbRoles = await db.getServerRoles(serverId);
      const dbMembers = await db.getServerMembers(serverId);

      let srv;

      if (dbChannels.length === 0) {
        srv = makeServer(serverId, dbServer.name, dbServer.icon, dbServer.owner_id, dbServer.custom_icon);
        srv.description = dbServer.description || '';
        srv.emojiSharing = dbServer.emoji_sharing || false;
        srv.iceConfig = dbServer.ice_config || null;
        srv.lanMode = dbServer.lan_mode || false;

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
        const categories = {};
        const categoryOrder = [];
        for (const dbCat of dbCategories) {
          const catId = dbCat.id;
          categories[catId] = { id: catId, name: dbCat.name, position: dbCat.position, channels: [] };
          categoryOrder.push(catId);
        }

        const textChannels = [];
        const voiceChannels = [];
        for (const dbCh of dbChannels) {
          const ch = {
            id: dbCh.id, name: dbCh.name, type: dbCh.type,
            description: dbCh.description || '', serverId,
            categoryId: dbCh.category_id, topic: dbCh.topic || '',
            nsfw: dbCh.nsfw || false, slowMode: dbCh.slow_mode || 0,
            webhooks: [], position: dbCh.position || 0,
            isPrivate: dbCh.is_private || false,
            permissionOverrides: typeof dbCh.permission_overrides === 'string'
              ? JSON.parse(dbCh.permission_overrides || '{}')
              : (dbCh.permission_overrides || {})
          };
          if (ch.type === 'voice') voiceChannels.push(ch);
          else textChannels.push(ch);
          if (categories[dbCh.category_id]) {
            categories[dbCh.category_id].channels.push(dbCh.id);
          }
        }

        try {
          const dbWebhooks = await db.getWebhooksForServer(serverId);
          for (const dbWh of dbWebhooks) {
            const ch = textChannels.find(c => c.id === dbWh.channel_id);
            if (ch) {
              ch.webhooks.push({
                id: dbWh.id, name: dbWh.name, channelId: dbWh.channel_id,
                createdBy: dbWh.created_by, createdAt: new Date(dbWh.created_at).getTime()
              });
            }
          }
        } catch (err) {
          console.error(`[Server] Error loading webhooks for server ${serverId}:`, err.message);
        }

        srv = {
          id: serverId, name: dbServer.name, icon: dbServer.icon || 'N',
          customIcon: dbServer.custom_icon, ownerId: dbServer.owner_id,
          description: dbServer.description || '',
          createdAt: new Date(dbServer.created_at).getTime(),
          categories, categoryOrder,
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
          iceConfig: dbServer.ice_config || null,
          lanMode: dbServer.lan_mode || false
        };
      }

      for (const dbRole of dbRoles) {
        const roleId = dbRole.id;
        const dbPerms = typeof dbRole.permissions === 'string'
          ? JSON.parse(dbRole.permissions)
          : (dbRole.permissions || {});
        const basePerms = srv.roles[roleId]?.permissions || {};
        srv.roles[roleId] = {
          id: roleId, name: dbRole.name, color: dbRole.color,
          position: dbRole.position, permissions: { ...basePerms, ...dbPerms }
        };
      }

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

      for (const ch of [...srv.channels.text, ...srv.channels.voice]) {
        if (ch.type === 'voice') {
          state.voiceChannels[ch.id] = { users: [], screenSharers: [] };
        } else {
          try {
            const dbMessages = await db.getChannelMessagesWithAuthors(ch.id, 50);
            if (dbMessages.length > 0) {
              state.messages[ch.id] = convertDbMessagesToRuntime(dbMessages, ch.id);
            } else {
              state.messages[ch.id] = [];
            }
          } catch (err) {
            console.error(`[Server] Error loading messages for channel ${ch.id}:`, err.message);
            state.messages[ch.id] = [];
          }
        }
      }

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

      try {
        srv.automodRules = await db.getAutomodRules(serverId);
      } catch (err) {
        console.error(`[Server] Error loading automod rules for ${serverId}:`, err.message);
        srv.automodRules = [];
      }

      console.log(`[Server] Loaded server: ${srv.name} (${serverId}) - ${srv.channels.text.length} text, ${srv.channels.voice.length} voice channels, ${Object.keys(srv.members).length} members, ${Object.keys(srv.roles).length} roles, ${srv.soundboard.length} sounds, ${srv.customEmojis.length} emojis`);
    }

    console.log(`[Server] Loaded ${Object.keys(state.servers).length} server(s) from database`);

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

    try {
      const cleaned = await db.cleanupExpiredTokens();
      if (cleaned > 0) console.log(`[Auth] Cleaned up ${cleaned} expired tokens on startup`);
    } catch (err) {
      console.error('[Auth] Failed to clean up expired tokens:', err.message);
    }

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

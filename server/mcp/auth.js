/**
 * MCP Authentication — Bot token creation, validation, and scope checking.
 * Bot tokens are scoped to specific servers and permission sets.
 */
const crypto = require('crypto');
const db = require('../db');
const { state } = require('../state');
const { getUserPerms } = require('../helpers');

/**
 * Generate a secure bot token (64 bytes, hex encoded)
 */
function generateBotToken() {
  return `nxbot_${crypto.randomBytes(48).toString('hex')}`;
}

/**
 * Hash a token using SHA-256 for storage
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Create a new bot token for an account
 */
async function createBotToken({ accountId, name, scopes, serverIds, expiresInDays }) {
  const token = generateBotToken();
  const tokenHash = hashToken(token);
  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 86400000)
    : null;

  const result = await db.query(
    `INSERT INTO bot_tokens (account_id, name, token_hash, scopes, server_ids, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, name, scopes, server_ids, created_at, expires_at`,
    [accountId, name, tokenHash, JSON.stringify(scopes || ['read', 'write']),
     JSON.stringify(serverIds || []), expiresAt]
  );
  // Return the raw token to the caller (only time it's visible)
  return { ...result.rows[0], token };
}

/**
 * Validate a bot token and return the associated context
 * @returns {Object|null} { accountId, tokenId, scopes, serverIds } or null if invalid
 */
async function validateBotToken(token) {
  if (!token || !token.startsWith('nxbot_')) return null;

  const tokenHash = hashToken(token);
  const result = await db.query(
    `SELECT id, account_id, scopes, server_ids, expires_at
     FROM bot_tokens WHERE token_hash = $1`,
    [tokenHash]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];

  // Check expiry
  if (row.expires_at && new Date(row.expires_at) < new Date()) return null;

  // Update last used timestamp (fire-and-forget)
  db.query('UPDATE bot_tokens SET last_used_at = NOW() WHERE id = $1', [row.id]).catch(() => {});

  return {
    accountId: row.account_id,
    tokenId: row.id,
    scopes: typeof row.scopes === 'string' ? JSON.parse(row.scopes) : row.scopes,
    serverIds: typeof row.server_ids === 'string' ? JSON.parse(row.server_ids) : row.server_ids
  };
}

/**
 * Get all bot tokens for an account
 */
async function getBotTokens(accountId) {
  const result = await db.query(
    `SELECT id, name, scopes, server_ids, created_at, expires_at, last_used_at
     FROM bot_tokens WHERE account_id = $1 ORDER BY created_at DESC`,
    [accountId]
  );
  return result.rows;
}

/**
 * Delete a bot token
 */
async function deleteBotToken(tokenId, accountId) {
  const result = await db.query(
    'DELETE FROM bot_tokens WHERE id = $1 AND account_id = $2 RETURNING id',
    [tokenId, accountId]
  );
  return result.rows.length > 0;
}

/**
 * Check if a bot token has a specific scope
 */
function hasScope(tokenContext, scope) {
  if (!tokenContext || !tokenContext.scopes) return false;
  return tokenContext.scopes.includes(scope) || tokenContext.scopes.includes('admin');
}

/**
 * Check if a bot token has access to a specific server
 */
function hasServerAccess(tokenContext, serverId) {
  if (!tokenContext) return false;
  // Empty serverIds means access to all servers the account is a member of
  if (!tokenContext.serverIds || tokenContext.serverIds.length === 0) {
    const srv = state.servers[serverId];
    return srv && srv.members[tokenContext.accountId] !== undefined;
  }
  return tokenContext.serverIds.includes(serverId);
}

/**
 * Get effective permissions for a bot token in a server/channel
 * Bot permissions are the intersection of: token scopes + user's actual permissions
 */
function getBotPermissions(tokenContext, serverId, channelId = null) {
  if (!tokenContext) return {};
  if (!hasServerAccess(tokenContext, serverId)) return {};

  const userPerms = getUserPerms(tokenContext.accountId, serverId, channelId);

  // Restrict based on scopes
  const scopes = tokenContext.scopes || [];
  const restricted = { ...userPerms };

  if (!scopes.includes('write') && !scopes.includes('admin')) {
    restricted.sendMessages = false;
    restricted.manageMessages = false;
    restricted.manageChannels = false;
    restricted.manageRoles = false;
    restricted.manageServer = false;
    restricted.kickMembers = false;
    restricted.banMembers = false;
  }

  if (!scopes.includes('moderate') && !scopes.includes('admin')) {
    restricted.kickMembers = false;
    restricted.banMembers = false;
    restricted.muteMembers = false;
    restricted.deafenMembers = false;
    restricted.moderateMembers = false;
  }

  return restricted;
}

/**
 * Express middleware to authenticate MCP requests via bot token or user token
 */
async function mcpAuthMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization required. Provide a bot token or user token.' });
  }

  const token = authHeader.slice(7);

  // Try bot token first
  if (token.startsWith('nxbot_')) {
    const ctx = await validateBotToken(token);
    if (!ctx) return res.status(401).json({ error: 'Invalid or expired bot token' });
    req.mcpAuth = { type: 'bot', ...ctx };
    return next();
  }

  // Fall back to user token
  const accountId = await db.validateToken(token);
  if (!accountId) return res.status(401).json({ error: 'Invalid or expired token' });
  req.mcpAuth = {
    type: 'user',
    accountId,
    tokenId: null,
    scopes: ['read', 'write', 'moderate', 'admin'],
    serverIds: []
  };
  next();
}

const VALID_SCOPES = ['read', 'write', 'moderate', 'manage', 'admin'];

// ─── Credential Encryption ──────────────────────────────────────────────────

/**
 * Derive a 256-bit encryption key from JWT_SECRET
 */
function getEncryptionKey() {
  const secret = process.env.JWT_SECRET || 'nexus-dev-secret';
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypt a JSON object using AES-256-GCM
 * @returns {string} base64-encoded ciphertext (iv:authTag:ciphertext)
 */
function encryptJson(obj) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = JSON.stringify(obj);
  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag().toString('base64');
  return `${iv.toString('base64')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt an AES-256-GCM encrypted string back to a JSON object
 * @param {string} encryptedStr - base64 encoded iv:authTag:ciphertext
 * @returns {Object} decrypted JSON object
 */
function decryptJson(encryptedStr) {
  const key = getEncryptionKey();
  const parts = encryptedStr.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted format');
  const iv = Buffer.from(parts[0], 'base64');
  const authTag = Buffer.from(parts[1], 'base64');
  const ciphertext = parts[2];
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  return JSON.parse(decrypted);
}

module.exports = {
  generateBotToken,
  createBotToken,
  validateBotToken,
  getBotTokens,
  deleteBotToken,
  hasScope,
  hasServerAccess,
  getBotPermissions,
  requireMcpAuth: mcpAuthMiddleware,
  VALID_SCOPES,
  encryptJson,
  decryptJson
};

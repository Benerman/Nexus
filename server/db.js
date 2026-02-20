const { Pool } = require('pg');
const config = require('./config');
const crypto = require('crypto');

// Create connection pool
const pool = new Pool({
  connectionString: config.database.url,
  ssl: config.database.ssl ? { rejectUnauthorized: false } : false,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test connection on startup
pool.on('connect', () => {
  if (config.server.env === 'development') {
    console.log('[DB] Connected to PostgreSQL database');
  }
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected error on idle client', err);
  process.exit(-1);
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Execute a query with logging
 */
async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (config.server.env === 'development' && duration > 100) {
      console.log('[DB] Slow query', { duration, text: text.substring(0, 100), rows: res.rowCount });
    }
    return res;
  } catch (error) {
    console.error('[DB] Query error:', error.message, { text: text.substring(0, 100) });
    throw error;
  }
}

/**
 * Get a client from the pool for transactions
 */
async function getClient() {
  const client = await pool.connect();
  return client;
}

// ============================================================================
// ACCOUNT FUNCTIONS
// ============================================================================

/**
 * Create a new account
 */
async function createAccount({ username, passwordHash, salt, avatar, color }) {
  const result = await query(
    `INSERT INTO accounts (username, password_hash, salt, avatar, color)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, username, avatar, color, bio, status, created_at`,
    [username, passwordHash, salt, avatar, color]
  );
  return result.rows[0];
}

/**
 * Get account by username
 */
async function getAccountByUsername(username) {
  const result = await query(
    'SELECT * FROM accounts WHERE LOWER(username) = LOWER($1)',
    [username]
  );
  return result.rows[0];
}

/**
 * Get account by ID
 */
async function getAccountById(id) {
  const result = await query(
    'SELECT id, username, avatar, custom_avatar, color, bio, status, settings, created_at FROM accounts WHERE id = $1',
    [id]
  );
  return result.rows[0];
}

/**
 * Update account details
 */
async function updateAccount(id, updates) {
  const allowedFields = ['username', 'avatar', 'custom_avatar', 'color', 'bio', 'status', 'settings',
    'intro_sound', 'exit_sound', 'intro_sound_original', 'exit_sound_original',
    'intro_sound_trim_start', 'intro_sound_trim_end', 'intro_sound_duration',
    'exit_sound_trim_start', 'exit_sound_trim_end', 'exit_sound_duration',
    'intro_sound_volume', 'exit_sound_volume'];
  const fields = [];
  const values = [];
  let paramCount = 1;

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      fields.push(`${key} = $${paramCount}`);
      values.push(value);
      paramCount++;
    }
  }

  if (fields.length === 0) return null;

  values.push(id);
  const result = await query(
    `UPDATE accounts SET ${fields.join(', ')} WHERE id = $${paramCount}
     RETURNING id, username, avatar, custom_avatar, color, bio, status, settings`,
    values
  );
  return result.rows[0];
}

/**
 * Update account password
 */
async function updateAccountPassword(id, passwordHash, salt) {
  const result = await query(
    `UPDATE accounts SET password_hash = $1, salt = $2 WHERE id = $3 RETURNING id`,
    [passwordHash, salt, id]
  );
  return result.rows[0];
}

// ============================================================================
// TOKEN FUNCTIONS
// ============================================================================

/**
 * Create a new authentication token
 */
async function createToken(accountId, expiresInMs = config.security.sessionExpiry) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + expiresInMs);

  await query(
    'INSERT INTO tokens (token, account_id, expires_at) VALUES ($1, $2, $3)',
    [token, accountId, expiresAt]
  );

  return { token, expiresAt };
}

/**
 * Validate and refresh token
 */
async function validateToken(token) {
  const result = await query(
    'SELECT account_id, expires_at FROM tokens WHERE token = $1 AND expires_at > NOW()',
    [token]
  );

  if (result.rows.length === 0) return null;

  // Update last_used timestamp
  await query('UPDATE tokens SET last_used = NOW() WHERE token = $1', [token]);

  return result.rows[0].account_id;
}

/**
 * Delete a token (logout)
 */
async function deleteToken(token) {
  await query('DELETE FROM tokens WHERE token = $1', [token]);
}

/**
 * Delete all tokens for an account
 */
async function deleteAllTokensForAccount(accountId) {
  await query('DELETE FROM tokens WHERE account_id = $1', [accountId]);
}

/**
 * Clean up expired tokens
 */
async function cleanupExpiredTokens() {
  const result = await query('DELETE FROM tokens WHERE expires_at < NOW()');
  return result.rowCount;
}

// ============================================================================
// SERVER FUNCTIONS
// ============================================================================

/**
 * Create a new server
 */
async function createServer({ id, name, icon, customIcon, ownerId, description }) {
  const result = await query(
    `INSERT INTO servers (id, name, icon, custom_icon, owner_id, description)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [id, name, icon || 'N', customIcon, ownerId, description || '']
  );
  return result.rows[0];
}

/**
 * Get server by ID
 */
async function getServerById(serverId) {
  const result = await query('SELECT * FROM servers WHERE id = $1', [serverId]);
  return result.rows[0];
}

/**
 * Get all servers for an account
 */
async function getServersForAccount(accountId) {
  const result = await query(
    `SELECT s.* FROM servers s
     JOIN server_members sm ON s.id = sm.server_id
     WHERE sm.account_id = $1
     ORDER BY s.created_at DESC`,
    [accountId]
  );
  return result.rows;
}

/**
 * Update server
 */
async function updateServer(serverId, updates) {
  const allowedFields = ['name', 'icon', 'custom_icon', 'description', 'emoji_sharing'];
  const fields = [];
  const values = [];
  let paramCount = 1;

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      fields.push(`${key} = $${paramCount}`);
      values.push(value);
      paramCount++;
    }
  }

  if (fields.length === 0) return null;

  values.push(serverId);
  const result = await query(
    `UPDATE servers SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
    values
  );
  return result.rows[0];
}

/**
 * Delete server
 */
async function deleteServer(serverId) {
  await query('DELETE FROM servers WHERE id = $1', [serverId]);
}

/**
 * Add member to server
 */
async function addServerMember(serverId, accountId, roles = ['everyone']) {
  await query(
    'INSERT INTO server_members (server_id, account_id, roles) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
    [serverId, accountId, JSON.stringify(roles)]
  );
}

/**
 * Remove member from server
 */
async function removeServerMember(serverId, accountId) {
  await query('DELETE FROM server_members WHERE server_id = $1 AND account_id = $2', [serverId, accountId]);
}

/**
 * Get server members
 */
async function getServerMembers(serverId) {
  const result = await query(
    `SELECT sm.account_id, sm.roles, sm.joined_at,
            a.username, a.avatar, a.custom_avatar, a.color, a.bio, a.status
     FROM server_members sm
     JOIN accounts a ON sm.account_id = a.id
     WHERE sm.server_id = $1`,
    [serverId]
  );
  return result.rows;
}

// ============================================================================
// MESSAGE FUNCTIONS
// ============================================================================

/**
 * Save a message
 */
async function saveMessage({ channelId, authorId, content, attachments = [], isWebhook = false, webhookUsername, webhookAvatar, replyTo = null, mentions = null, commandData = null }) {
  const result = await query(
    `INSERT INTO messages (channel_id, author_id, content, attachments, is_webhook, webhook_username, webhook_avatar, reply_to, mentions, command_data)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [channelId, authorId, content, JSON.stringify(attachments), isWebhook, webhookUsername, webhookAvatar, replyTo, mentions ? JSON.stringify(mentions) : '{}', commandData ? JSON.stringify(commandData) : null]
  );
  return result.rows[0];
}

/**
 * Get messages for a channel
 */
async function getChannelMessages(channelId, limit = 50, offset = 0) {
  const result = await query(
    'SELECT * FROM messages WHERE channel_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
    [channelId, limit, offset]
  );
  return result.rows.reverse(); // Return in chronological order
}

/**
 * Update message reactions
 */
async function updateMessageReactions(messageId, reactions) {
  const result = await query(
    'UPDATE messages SET reactions = $1 WHERE id = $2 RETURNING *',
    [JSON.stringify(reactions), messageId]
  );
  return result.rows[0];
}

/**
 * Delete a message by ID
 */
async function deleteMessage(messageId) {
  await query('DELETE FROM messages WHERE id = $1', [messageId]);
}

/**
 * Get a single message by ID (with author join)
 */
async function getMessageById(messageId) {
  const result = await query(
    `SELECT m.*, a.username as author_username, a.avatar as author_avatar, a.custom_avatar as author_custom_avatar
     FROM messages m LEFT JOIN accounts a ON m.author_id = a.id
     WHERE m.id = $1`,
    [messageId]
  );
  return result.rows[0];
}

/**
 * Delete old messages (keep last N per channel)
 */
async function cleanupOldMessages(channelId, keepCount = 500) {
  await query(
    `DELETE FROM messages
     WHERE channel_id = $1
     AND id NOT IN (
       SELECT id FROM messages WHERE channel_id = $1
       ORDER BY created_at DESC LIMIT $2
     )`,
    [channelId, keepCount]
  );
}

// ============================================================================
// DM & SOCIAL FUNCTIONS
// ============================================================================

/**
 * Create or get DM channel between two users
 */
async function getOrCreateDMChannel(user1Id, user2Id) {
  // Ensure consistent ordering for unique constraint
  const [p1, p2] = user1Id < user2Id ? [user1Id, user2Id] : [user2Id, user1Id];

  const result = await query(
    `INSERT INTO dm_channels (participant_1, participant_2)
     VALUES ($1, $2)
     ON CONFLICT (participant_1, participant_2) DO UPDATE SET participant_1 = dm_channels.participant_1
     RETURNING *`,
    [p1, p2]
  );
  return result.rows[0];
}

/**
 * Get a DM channel by its ID
 */
async function getDMChannelById(channelId) {
  const result = await query('SELECT * FROM dm_channels WHERE id = $1', [channelId]);
  return result.rows[0] || null;
}

/**
 * Get all DM channels for a user (1:1 via participant columns, group via dm_participants)
 */
async function getDMChannelsForUser(userId) {
  const result = await query(
    `SELECT DISTINCT dc.*
     FROM dm_channels dc
     LEFT JOIN dm_participants dp ON dc.id = dp.channel_id
     WHERE dc.participant_1 = $1 OR dc.participant_2 = $1 OR dp.user_id = $1
     ORDER BY dc.created_at DESC`,
    [userId]
  );
  return result.rows;
}

/**
 * Send friend request
 */
async function createFriendRequest(requesterId, addresseeId) {
  const result = await query(
    `INSERT INTO friendships (requester_id, addressee_id, status)
     VALUES ($1, $2, 'pending')
     ON CONFLICT DO NOTHING
     RETURNING *`,
    [requesterId, addresseeId]
  );
  return result.rows[0];
}

/**
 * Accept friend request
 */
async function acceptFriendRequest(requestId) {
  const result = await query(
    `UPDATE friendships SET status = 'accepted', updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [requestId]
  );
  return result.rows[0];
}

/**
 * Block user
 */
async function blockUser(blockerId, blockedId) {
  const result = await query(
    `INSERT INTO friendships (requester_id, addressee_id, status)
     VALUES ($1, $2, 'blocked')
     ON CONFLICT (requester_id, addressee_id) DO UPDATE SET status = 'blocked', updated_at = NOW()
     RETURNING *`,
    [blockerId, blockedId]
  );
  return result.rows[0];
}

/**
 * Reject friend request
 */
async function rejectFriendRequest(requestId) {
  const result = await query(
    'DELETE FROM friendships WHERE id = $1 RETURNING *',
    [requestId]
  );
  return result.rows[0];
}

/**
 * Remove friend
 */
async function removeFriend(userId1, userId2) {
  const result = await query(
    `DELETE FROM friendships
     WHERE (requester_id = $1 AND addressee_id = $2 AND status = 'accepted')
        OR (requester_id = $2 AND addressee_id = $1 AND status = 'accepted')
     RETURNING *`,
    [userId1, userId2]
  );
  return result.rows[0];
}

/**
 * Get friends for a user
 */
async function getFriends(userId) {
  const result = await query(
    `SELECT f.*,
            a1.id as requester_id, a1.username as requester_username, a1.avatar as requester_avatar, a1.custom_avatar as requester_custom_avatar, a1.color as requester_color,
            a2.id as addressee_id, a2.username as addressee_username, a2.avatar as addressee_avatar, a2.custom_avatar as addressee_custom_avatar, a2.color as addressee_color
     FROM friendships f
     JOIN accounts a1 ON f.requester_id = a1.id
     JOIN accounts a2 ON f.addressee_id = a2.id
     WHERE (f.requester_id = $1 OR f.addressee_id = $1) AND f.status = 'accepted'`,
    [userId]
  );
  return result.rows;
}

/**
 * Get pending friend requests for a user
 */
async function getPendingFriendRequests(userId) {
  const result = await query(
    `SELECT f.*,
            a1.id as requester_id, a1.username as requester_username, a1.avatar as requester_avatar, a1.custom_avatar as requester_custom_avatar, a1.color as requester_color,
            a2.id as addressee_id, a2.username as addressee_username, a2.avatar as addressee_avatar, a2.custom_avatar as addressee_custom_avatar, a2.color as addressee_color
     FROM friendships f
     JOIN accounts a1 ON f.requester_id = a1.id
     JOIN accounts a2 ON f.addressee_id = a2.id
     WHERE (f.requester_id = $1 OR f.addressee_id = $1) AND f.status = 'pending'`,
    [userId]
  );
  return result.rows;
}

/**
 * Unblock user
 */
async function unblockUser(blockerId, blockedId) {
  const result = await query(
    'DELETE FROM friendships WHERE requester_id = $1 AND addressee_id = $2 AND status = \'blocked\' RETURNING *',
    [blockerId, blockedId]
  );
  return result.rows[0];
}

/**
 * Get blocked users for a user
 */
async function getBlockedUsers(userId) {
  const result = await query(
    `SELECT f.*, a.id as blocked_id, a.username as blocked_username, a.avatar as blocked_avatar, a.custom_avatar as blocked_custom_avatar, a.color as blocked_color
     FROM friendships f
     JOIN accounts a ON f.addressee_id = a.id
     WHERE f.requester_id = $1 AND f.status = 'blocked'`,
    [userId]
  );
  return result.rows;
}

/**
 * Check if user is blocked
 */
async function isUserBlocked(userId, potentialBlockerId) {
  const result = await query(
    `SELECT id FROM friendships
     WHERE requester_id = $1 AND addressee_id = $2 AND status = 'blocked'`,
    [potentialBlockerId, userId]
  );
  return result.rows.length > 0;
}

/**
 * Create a report
 */
async function createReport(reporterId, reportedId, reportType, description, messageId = null) {
  const result = await query(
    `INSERT INTO reports (reporter_id, reported_id, report_type, description, message_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [reporterId, reportedId, reportType, description, messageId]
  );
  return result.rows[0];
}

/**
 * Create server invite
 */
async function createInvite(serverId, createdBy, maxUses = 0, expiresInMs = null) {
  // Generate random 8-character invite code
  const inviteCode = Math.random().toString(36).substring(2, 10).toUpperCase();
  const expiresAt = expiresInMs ? new Date(Date.now() + expiresInMs) : null;

  const result = await query(
    `INSERT INTO invites (id, server_id, created_by, max_uses, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [inviteCode, serverId, createdBy, maxUses, expiresAt]
  );
  return result.rows[0];
}

/**
 * Get invite by code
 */
async function getInviteByCode(inviteCode) {
  const result = await query(
    'SELECT * FROM invites WHERE id = $1',
    [inviteCode]
  );
  return result.rows[0];
}

/**
 * Increment invite usage
 */
async function incrementInviteUse(inviteCode) {
  const result = await query(
    'UPDATE invites SET uses = uses + 1 WHERE id = $1 RETURNING *',
    [inviteCode]
  );
  return result.rows[0];
}

/**
 * Get invites for a server
 */
async function getServerInvites(serverId) {
  const result = await query(
    `SELECT i.*, a.username as created_by_username
     FROM invites i
     LEFT JOIN accounts a ON i.created_by = a.id
     WHERE i.server_id = $1
     ORDER BY i.created_at DESC`,
    [serverId]
  );
  return result.rows;
}

/**
 * Delete invite
 */
async function deleteInvite(inviteCode) {
  await query('DELETE FROM invites WHERE id = $1', [inviteCode]);
}

/**
 * Get account by username (case-insensitive)
 */
async function getAccountByUsernameInsensitive(username) {
  const result = await query(
    'SELECT id, username, avatar, custom_avatar, color, bio, status, created_at FROM accounts WHERE LOWER(username) = LOWER($1)',
    [username]
  );
  return result.rows[0];
}

/**
 * Mark DM channel as read up to a specific message
 */
async function markDMAsRead(userId, channelId, messageId = null) {
  // If messageId is provided, try to insert with the FK reference first
  if (messageId) {
    try {
      const result = await query(
        `INSERT INTO dm_read_states (user_id, channel_id, last_read_message_id, last_read_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (user_id, channel_id)
         DO UPDATE SET last_read_message_id = $3, last_read_at = NOW()
         RETURNING *`,
        [userId, channelId, messageId]
      );
      return result.rows[0];
    } catch (error) {
      // FK violation (message doesn't exist in DB) - fall through to timestamp-only update
      if (error.code === '23503') {
        console.log('[DB] markDMAsRead: message ID not found in DB, falling back to timestamp-only update');
      } else {
        throw error;
      }
    }
  }

  // No messageId or FK failed - just update the timestamp without message reference
  const result = await query(
    `INSERT INTO dm_read_states (user_id, channel_id, last_read_message_id, last_read_at)
     VALUES ($1, $2, NULL, NOW())
     ON CONFLICT (user_id, channel_id)
     DO UPDATE SET last_read_at = NOW()
     RETURNING *`,
    [userId, channelId]
  );
  return result.rows[0];
}

/**
 * Get unread counts for all DM channels for a user
 */
async function getUnreadCounts(userId) {
  const result = await query(
    `WITH user_dms AS (
       SELECT DISTINCT dc.id
       FROM dm_channels dc
       LEFT JOIN dm_participants dp ON dc.id = dp.channel_id
       WHERE dc.participant_1 = $1 OR dc.participant_2 = $1 OR dp.user_id = $1
     )
     SELECT
       ud.id as channel_id,
       COUNT(m.id) FILTER (WHERE m.created_at > COALESCE(rs.last_read_at, '1970-01-01'::timestamp) AND m.author_id != $1) as unread_count
     FROM user_dms ud
     LEFT JOIN dm_read_states rs ON ud.id = rs.channel_id AND rs.user_id = $1
     LEFT JOIN messages m ON m.channel_id = ud.id::varchar
     GROUP BY ud.id, rs.last_read_at`,
    [userId]
  );

  // Convert to object map: channelId -> unreadCount
  const unreadMap = {};
  result.rows.forEach(row => {
    unreadMap[row.channel_id] = parseInt(row.unread_count) || 0;
  });
  return unreadMap;
}

/**
 * Get last read message for a DM channel
 */
async function getLastReadMessage(userId, channelId) {
  const result = await query(
    'SELECT last_read_message_id, last_read_at FROM dm_read_states WHERE user_id = $1 AND channel_id = $2',
    [userId, channelId]
  );
  return result.rows[0];
}

/**
 * Create a group DM with 3+ participants
 */
async function createGroupDM(creatorId, participantIds, name = null) {
  const crypto = require('crypto');
  const channelId = crypto.randomUUID();

  // Create the DM channel
  await query(
    `INSERT INTO dm_channels (id, is_group, name, created_by, created_at)
     VALUES ($1, true, $2, $3, NOW())`,
    [channelId, name, creatorId]
  );

  // Add all participants (including creator)
  const allParticipants = [...new Set([creatorId, ...participantIds])];
  for (const userId of allParticipants) {
    await query(
      'INSERT INTO dm_participants (channel_id, user_id) VALUES ($1, $2)',
      [channelId, userId]
    );
  }

  return { id: channelId, is_group: true, name, created_by: creatorId };
}

/**
 * Add participant to group DM
 */
async function addParticipantToGroupDM(channelId, userId) {
  await query(
    'INSERT INTO dm_participants (channel_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [channelId, userId]
  );
}

/**
 * Remove participant from group DM
 */
async function removeParticipantFromGroupDM(channelId, userId) {
  await query(
    'DELETE FROM dm_participants WHERE channel_id = $1 AND user_id = $2',
    [channelId, userId]
  );
}

/**
 * Get all participants of a group DM
 */
async function getGroupDMParticipants(channelId) {
  const result = await query(
    `SELECT a.id, a.username, a.avatar, a.custom_avatar, a.color, a.status, dp.joined_at
     FROM dm_participants dp
     JOIN accounts a ON dp.user_id = a.id
     WHERE dp.channel_id = $1
     ORDER BY dp.joined_at ASC`,
    [channelId]
  );
  return result.rows;
}

/**
 * Check if a user is a participant in a DM channel
 */
async function isParticipantInDM(channelId, userId) {
  const result = await query(
    `SELECT 1 FROM dm_channels dc
     LEFT JOIN dm_participants dp ON dc.id = dp.channel_id
     WHERE dc.id = $1 AND (dc.participant_1 = $2 OR dc.participant_2 = $2 OR dp.user_id = $2)
     LIMIT 1`,
    [channelId, userId]
  );
  return result.rows.length > 0;
}

// ============================================================================
// MODERATION FUNCTIONS
// ============================================================================

/**
 * Ban a user from a server
 */
async function banUser(serverId, userId, bannedBy, reason = null) {
  await query(
    `INSERT INTO server_bans (server_id, user_id, banned_by, reason)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (server_id, user_id) DO UPDATE SET reason = $4, created_at = NOW()`,
    [serverId, userId, bannedBy, reason]
  );
  // Remove from server members
  await removeServerMember(serverId, userId);
}

/**
 * Unban a user from a server
 */
async function unbanUser(serverId, userId) {
  await query(
    'DELETE FROM server_bans WHERE server_id = $1 AND user_id = $2',
    [serverId, userId]
  );
}

/**
 * Check if a user is banned from a server
 */
async function isUserBanned(serverId, userId) {
  const result = await query(
    'SELECT id FROM server_bans WHERE server_id = $1 AND user_id = $2',
    [serverId, userId]
  );
  return result.rows.length > 0;
}

/**
 * Get all bans for a server
 */
async function getServerBans(serverId) {
  const result = await query(
    `SELECT sb.*, a.username, a.avatar, a.custom_avatar, a.color
     FROM server_bans sb
     JOIN accounts a ON sb.user_id = a.id
     WHERE sb.server_id = $1
     ORDER BY sb.created_at DESC`,
    [serverId]
  );
  return result.rows;
}

/**
 * Timeout a user (temporary mute)
 */
async function timeoutUser(serverId, userId, timeoutBy, durationMinutes) {
  const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);
  await query(
    `INSERT INTO server_timeouts (server_id, user_id, timeout_by, duration_minutes, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (server_id, user_id)
     DO UPDATE SET duration_minutes = $4, expires_at = $5, created_at = NOW()`,
    [serverId, userId, timeoutBy, durationMinutes, expiresAt]
  );
}

/**
 * Remove timeout from a user
 */
async function removeTimeout(serverId, userId) {
  await query(
    'DELETE FROM server_timeouts WHERE server_id = $1 AND user_id = $2',
    [serverId, userId]
  );
}

/**
 * Check if a user is timed out
 */
async function isUserTimedOut(serverId, userId) {
  const result = await query(
    'SELECT id, expires_at FROM server_timeouts WHERE server_id = $1 AND user_id = $2 AND expires_at > NOW()',
    [serverId, userId]
  );
  return result.rows[0] || null;
}

/**
 * Clean up expired timeouts
 */
async function cleanupExpiredTimeouts() {
  await query('DELETE FROM server_timeouts WHERE expires_at < NOW()');
}

/**
 * Get active timeouts for a server
 */
async function getServerTimeouts(serverId) {
  const result = await query(
    `SELECT st.*, a.username, a.avatar, a.custom_avatar, a.color
     FROM server_timeouts st
     JOIN accounts a ON st.user_id = a.id
     WHERE st.server_id = $1 AND st.expires_at > NOW()
     ORDER BY st.expires_at ASC`,
    [serverId]
  );
  return result.rows;
}

// ============================================================================
// DATA LOADING FUNCTIONS (for server startup)
// ============================================================================

/**
 * Get ALL servers from the database
 */
async function getAllServers() {
  const result = await query('SELECT * FROM servers ORDER BY created_at ASC');
  return result.rows;
}

/**
 * Get all roles for a server
 */
async function getServerRoles(serverId) {
  const result = await query(
    'SELECT * FROM roles WHERE server_id = $1 ORDER BY position ASC',
    [serverId]
  );
  return result.rows;
}

/**
 * Get all channels for a server
 */
async function getServerChannels(serverId) {
  const result = await query(
    'SELECT * FROM channels WHERE server_id = $1 ORDER BY position ASC',
    [serverId]
  );
  return result.rows;
}

/**
 * Get all categories for a server
 */
async function getServerCategories(serverId) {
  const result = await query(
    'SELECT * FROM categories WHERE server_id = $1 ORDER BY position ASC',
    [serverId]
  );
  return result.rows;
}

/**
 * Save a channel to the database
 */
async function saveChannel({ id, serverId, categoryId, name, type, description, topic, position, isPrivate, nsfw, slowMode, permissionOverrides }) {
  const result = await query(
    `INSERT INTO channels (id, server_id, category_id, name, type, description, topic, position, is_private, nsfw, slow_mode, permission_overrides)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (id) DO UPDATE SET name = $4, description = $6, topic = $7, position = $8, is_private = $9, nsfw = $10, slow_mode = $11, permission_overrides = $12
     RETURNING *`,
    [id, serverId, categoryId, name, type, description || '', topic || '', position || 0, isPrivate || false, nsfw || false, slowMode || 0, JSON.stringify(permissionOverrides || {})]
  );
  return result.rows[0];
}

/**
 * Save a category to the database
 */
async function saveCategory({ id, serverId, name, position }) {
  const result = await query(
    `INSERT INTO categories (id, server_id, name, position)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET name = $3, position = $4
     RETURNING *`,
    [id, serverId, name, position || 0]
  );
  return result.rows[0];
}

/**
 * Update roles for a server member
 */
async function updateServerMemberRoles(serverId, accountId, roles) {
  const result = await query(
    'UPDATE server_members SET roles = $1 WHERE server_id = $2 AND account_id = $3 RETURNING *',
    [JSON.stringify(roles), serverId, accountId]
  );
  return result.rows[0];
}

// ============================================================================
// SOUNDBOARD FUNCTIONS
// ============================================================================

/**
 * Get soundboard sounds for a server (metadata only)
 */
async function getSoundboardSounds(serverId) {
  const result = await query(
    'SELECT id, server_id, name, emoji, trim_start, trim_end, duration, volume, is_global, created_by, created_at FROM soundboard_sounds WHERE server_id = $1 ORDER BY created_at ASC',
    [serverId]
  );
  return result.rows;
}

/**
 * Get soundboard sounds with audio data
 */
async function getSoundboardSoundsWithAudio(serverId) {
  const result = await query(
    'SELECT * FROM soundboard_sounds WHERE server_id = $1 ORDER BY created_at ASC',
    [serverId]
  );
  return result.rows;
}

/**
 * Get a single soundboard sound with audio data
 */
async function getSoundboardSound(soundId) {
  const result = await query(
    'SELECT * FROM soundboard_sounds WHERE id = $1',
    [soundId]
  );
  return result.rows[0];
}

/**
 * Create a soundboard sound
 */
async function createSoundboardSound({ serverId, name, emoji, originalAudio, trimmedAudio, trimStart, trimEnd, duration, volume, isGlobal, createdBy }) {
  const result = await query(
    `INSERT INTO soundboard_sounds (server_id, name, emoji, original_audio, trimmed_audio, trim_start, trim_end, duration, volume, is_global, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id, server_id, name, emoji, trim_start, trim_end, duration, volume, is_global, created_by, created_at`,
    [serverId, name, emoji, originalAudio, trimmedAudio, trimStart, trimEnd, duration, volume || 1.0, isGlobal || false, createdBy]
  );
  return result.rows[0];
}

/**
 * Update a soundboard sound
 */
async function updateSoundboardSound(soundId, { name, emoji, trimmedAudio, trimStart, trimEnd, duration, volume, isGlobal }) {
  const result = await query(
    `UPDATE soundboard_sounds SET name = $1, emoji = $2, trimmed_audio = $3, trim_start = $4, trim_end = $5, duration = $6, volume = $7, is_global = $8
     WHERE id = $9
     RETURNING id, server_id, name, emoji, trim_start, trim_end, duration, volume, is_global, created_by, created_at`,
    [name, emoji, trimmedAudio, trimStart, trimEnd, duration, volume || 1.0, isGlobal || false, soundId]
  );
  return result.rows[0];
}

/**
 * Delete a soundboard sound
 */
async function deleteSoundboardSound(soundId) {
  await query('DELETE FROM soundboard_sounds WHERE id = $1', [soundId]);
}

// ============================================================================
// USER SETTINGS FUNCTIONS
// ============================================================================

/**
 * Get user settings
 */
async function getUserSettings(id) {
  const result = await query(
    'SELECT settings FROM accounts WHERE id = $1',
    [id]
  );
  return result.rows[0]?.settings || {};
}

/**
 * Update user settings (merges with existing settings)
 */
async function updateUserSettings(id, settings) {
  const result = await query(
    `UPDATE accounts SET settings = COALESCE(settings, '{}'::jsonb) || $1::jsonb WHERE id = $2 RETURNING settings`,
    [JSON.stringify(settings), id]
  );
  return result.rows[0]?.settings || {};
}

/**
 * Get account voice sounds (intro/exit)
 */
async function getAccountSounds(id) {
  const result = await query(
    `SELECT intro_sound, exit_sound, intro_sound_original, exit_sound_original,
            intro_sound_trim_start, intro_sound_trim_end, intro_sound_duration,
            exit_sound_trim_start, exit_sound_trim_end, exit_sound_duration,
            intro_sound_volume, exit_sound_volume
     FROM accounts WHERE id = $1`,
    [id]
  );
  return result.rows[0];
}

// ============================================================================
// MAINTENANCE FUNCTIONS
// ============================================================================

/**
 * Initialize database (run migrations)
 */
async function initializeDatabase() {
  try {
    const fs = require('fs');
    const path = require('path');
    const migrationFile = path.join(__dirname, 'migrations', '001_initial_schema.sql');

    if (fs.existsSync(migrationFile)) {
      const sql = fs.readFileSync(migrationFile, 'utf8');
      await pool.query(sql);
      console.log('[DB] Database initialized successfully');
    }
  } catch (error) {
    // Ignore "table already exists" errors (code 42P07)
    if (error.code === '42P07') {
      console.log('[DB] Database tables already exist, skipping initialization');
    } else {
      console.error('[DB] Failed to initialize database:', error.message);
      throw error;
    }
  }

  // Run incremental migrations
  const fs = require('fs');
  const path = require('path');
  const migrations = ['002_dm_read_states.sql', '003_group_dms.sql', '004_mentions.sql', '005_command_data.sql', '006_custom_emojis.sql', '007_dm_unique_constraint.sql'];
  for (const migration of migrations) {
    try {
      const migFile = path.join(__dirname, 'migrations', migration);
      if (fs.existsSync(migFile)) {
        const sql = fs.readFileSync(migFile, 'utf8');
        await pool.query(sql);
      }
    } catch (err) {
      // Ignore errors for already-applied migrations
      if (err.code !== '42701' && err.code !== '42P07') {
        console.warn(`[DB] Migration ${migration} warning:`, err.message);
      }
    }
  }
}

// ============================================================================
// CUSTOM EMOJI FUNCTIONS
// ============================================================================

async function getCustomEmojis(serverId) {
  const result = await query(
    'SELECT id, server_id, name, content_type, animated, created_by, created_at FROM custom_emojis WHERE server_id = $1 ORDER BY created_at ASC',
    [serverId]
  );
  return result.rows;
}

async function getCustomEmoji(emojiId) {
  const result = await query('SELECT * FROM custom_emojis WHERE id = $1', [emojiId]);
  return result.rows[0];
}

async function createCustomEmoji({ serverId, name, imageData, contentType, animated, createdBy }) {
  const result = await query(
    `INSERT INTO custom_emojis (server_id, name, image_data, content_type, animated, created_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [serverId, name, imageData, contentType || 'image/png', animated || false, createdBy]
  );
  return result.rows[0];
}

async function updateCustomEmoji(emojiId, { name }) {
  const result = await query(
    'UPDATE custom_emojis SET name = $1 WHERE id = $2 RETURNING *',
    [name, emojiId]
  );
  return result.rows[0];
}

async function deleteCustomEmoji(emojiId) {
  await query('DELETE FROM custom_emojis WHERE id = $1', [emojiId]);
}

/**
 * Close database connections
 */
async function close() {
  await pool.end();
  console.log('[DB] Database connections closed');
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  pool,
  query,
  getClient,

  // Account functions
  createAccount,
  getAccountByUsername,
  getAccountById,
  updateAccount,
  updateAccountPassword,
  getUserSettings,
  updateUserSettings,

  // Token functions
  createToken,
  validateToken,
  deleteToken,
  deleteAllTokensForAccount,
  cleanupExpiredTokens,

  // Server functions
  createServer,
  getServerById,
  getServersForAccount,
  getAllServers,
  updateServer,
  deleteServer,
  addServerMember,
  removeServerMember,
  getServerMembers,
  getServerRoles,
  getServerChannels,
  getServerCategories,
  saveChannel,
  saveCategory,
  updateServerMemberRoles,

  // Message functions
  saveMessage,
  getChannelMessages,
  updateMessageReactions,
  deleteMessage,
  getMessageById,
  cleanupOldMessages,

  // DM & Social functions
  getOrCreateDMChannel,
  getDMChannelById,
  getDMChannelsForUser,
  sendFriendRequest: createFriendRequest,
  createFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  removeFriend,
  getFriends,
  getPendingFriendRequests,
  blockUser,
  unblockUser,
  getBlockedUsers,
  isUserBlocked,
  createReport,
  createInvite,
  getInviteByCode,
  incrementInviteUse,
  getServerInvites,
  deleteInvite,
  getAccountByUsernameInsensitive,
  markDMAsRead,
  getUnreadCounts,
  getLastReadMessage,
  createGroupDM,
  addParticipantToGroupDM,
  removeParticipantFromGroupDM,
  getGroupDMParticipants,
  isParticipantInDM,

  // Moderation functions
  banUser,
  unbanUser,
  isUserBanned,
  getServerBans,
  timeoutUser,
  removeTimeout,
  isUserTimedOut,
  cleanupExpiredTimeouts,
  getServerTimeouts,

  // Soundboard functions
  getSoundboardSounds,
  getSoundboardSoundsWithAudio,
  getSoundboardSound,
  createSoundboardSound,
  updateSoundboardSound,
  deleteSoundboardSound,

  // Account sounds
  getAccountSounds,

  // Custom emoji functions
  getCustomEmojis,
  getCustomEmoji,
  createCustomEmoji,
  updateCustomEmoji,
  deleteCustomEmoji,

  // Maintenance
  initializeDatabase,
  close
};

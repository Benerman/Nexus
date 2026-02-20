/**
 * Extracted utility functions from index.js for testability.
 * Functions that previously accessed global state.servers[serverId] now accept
 * the server object directly as a parameter.
 */

const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

const BCRYPT_ROUNDS = 12;

// ─── Auth ─────────────────────────────────────────────────────────────────────
// Legacy HMAC-SHA256 — only used to verify old passwords during migration
function hashPasswordLegacy(password, salt) {
  return crypto.createHmac('sha256', salt).update(password).digest('hex');
}

async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

async function verifyPassword(password, hash) {
  // Detect legacy HMAC-SHA256 hash (64-char hex string) vs bcrypt ($2b$ prefix)
  if (hash && hash.startsWith('$2b$')) {
    return bcrypt.compare(password, hash);
  }
  return false;
}

function makeToken() {
  return crypto.randomBytes(32).toString('hex');
}

// ─── Permissions ──────────────────────────────────────────────────────────────
const DEFAULT_PERMS = {
  viewChannel: true, sendMessages: true, attachFiles: true, joinVoice: true,
  readHistory: true, addReactions: true, mentionEveryone: false, manageMessages: false,
  createInvite: true, sendTargetedSounds: false, manageEmojis: false
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeCategory(name, position = 0) {
  return { id: uuidv4(), name, position, channels: [] };
}

/**
 * Get effective permissions for a user in a server/channel.
 * @param {string} userId
 * @param {Object} server - The server object (previously looked up via state.servers[serverId])
 * @param {string|null} channelId - Optional channel for overrides
 * @returns {Object} permissions map
 */
function getUserPerms(userId, server, channelId = null) {
  if (!server) return {};
  const member = server.members[userId];
  if (!member) return server.roles['everyone']?.permissions || {};

  // Start with @everyone
  let perms = { ...server.roles['everyone']?.permissions };

  // Apply role permissions (higher position = higher priority)
  const userRoles = (member.roles || [])
    .map(roleId => server.roles[roleId])
    .filter(Boolean)
    .sort((a, b) => (a.position || 0) - (b.position || 0));

  userRoles.forEach(role => Object.assign(perms, role.permissions));

  // Apply channel-specific overrides
  if (channelId) {
    const ch = [...server.channels.text, ...server.channels.voice].find(c => c.id === channelId);
    if (ch?.permissionOverrides) {
      userRoles.forEach(role => {
        const override = ch.permissionOverrides[role.id];
        if (override) Object.keys(override).forEach(k => {
          if (override[k] !== null) perms[k] = override[k];
        });
      });
    }
  }

  // Owner or admin gets all
  if (server.ownerId === userId || perms.admin) {
    Object.keys(perms).forEach(k => perms[k] = true);
  }

  return perms;
}

/**
 * Parse @mentions from message content.
 * @param {string} content
 * @param {Object} server - The server object
 * @returns {{ users: Array, roles: Array, everyone: boolean }}
 */
function parseMentions(content, server) {
  const result = { users: [], roles: [], everyone: false };
  if (!content || !server) return result;

  // Check for @everyone
  if (/@everyone\b/i.test(content)) {
    result.everyone = true;
  }

  // Find @username mentions
  const memberEntries = Object.entries(server.members);
  for (const [userId, member] of memberEntries) {
    const username = member.username;
    if (!username) continue;
    const escaped = username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`@${escaped}\\b`, 'i');
    if (re.test(content) && !result.users.some(u => u.id === userId)) {
      result.users.push({ id: userId, username });
    }
  }

  // Find @roleName mentions
  for (const [roleId, role] of Object.entries(server.roles)) {
    if (roleId === 'everyone') continue;
    const roleName = role.name;
    if (!roleName) continue;
    const cleanName = roleName.replace(/^@/, '');
    const escapedClean = cleanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`@${escapedClean}\\b`, 'i');
    if (re.test(content) && !result.roles.some(r => r.id === roleId)) {
      result.roles.push({ id: roleId, name: roleName });
    }
  }

  return result;
}

/**
 * Parse #channel-name links from message content.
 * @param {string} content
 * @param {Object} server - The server object
 * @param {string} serverId - The server ID to include in results
 * @returns {{ channels: Array }}
 */
function parseChannelLinks(content, server, serverId) {
  const channels = [];
  if (!content || !server) return { channels };

  const allChannels = [...(server.channels?.text || []), ...(server.channels?.voice || [])];
  for (const ch of allChannels) {
    const escaped = ch.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`#${escaped}\\b`, 'i');
    if (re.test(content) && !channels.some(c => c.id === ch.id)) {
      channels.push({ id: ch.id, name: ch.name, serverId });
    }
  }
  return { channels };
}

/**
 * Get the highest role position for a user in a server.
 * @param {string} userId
 * @param {Object} server - The server object
 * @returns {number}
 */
function getUserHighestRolePosition(userId, server) {
  if (!server) return -1;
  if (server.ownerId === userId) return Infinity;
  const member = server.members[userId];
  if (!member) return -1;
  return Math.max(0, ...(member.roles || [])
    .map(roleId => server.roles[roleId]?.position || 0));
}

// ─── Duration Parsing ─────────────────────────────────────────────────────────
function parseDuration(str) {
  const match = str.match(/^(\d+)([smhdw])$/i);
  if (!match) return null;
  const n = parseInt(match[1]);
  switch (match[2].toLowerCase()) {
    case 's': return n * 1000;
    case 'm': return n * 60000;
    case 'h': return n * 3600000;
    case 'd': return n * 86400000;
    case 'w': return n * 604800000;
    default: return null;
  }
}

// ─── Roasts ───────────────────────────────────────────────────────────────────
const CRITICIZE_ROASTS = [
  "Fun fact: {target} was once voted 'most likely to be replaced by a houseplant' by a panel of office supplies.",
  "Scientists recently discovered that {target} is the leading cause of confused facial expressions in 12 countries.",
  "Breaking news: {target} has been officially classified as 'aggressively mid' by the International Board of Standards.",
  "A study found that 9 out of 10 dentists agree: {target} is the reason they switched careers.",
  "Historians now believe that {target} was the original inspiration for the 'close enough' meme.",
  "If {target} were a spice, they'd be flour. Not even self-rising.",
  "The government is hiding the truth about {target}. Not because it's classified, but because it's embarrassing.",
  "NASA confirmed that {target} can be seen from space. Not because they're big, but because satellites actively avoid them.",
  "Little-known fact: {target} was almost a Wikipedia article but got rejected for being 'not notable enough.'",
  "Local witnesses report that {target} once tried to high-five a mirror and missed.",
  "Archaeologists found ancient cave paintings warning future generations about {target}.",
  "Fun fact: {target} is the reason instruction manuals still exist.",
  "A recent poll showed that {target} is the third most popular answer to 'name something underwhelming.'",
  "Legend has it that {target} once entered a talent show and the judges asked for a refund.",
  "{target} is proof that participation trophies went too far.",
  "If {target} were a font, they'd be Comic Sans — widely used but never respected.",
  "The WiFi signal gets weaker every time {target} enters a room. Coincidence? Scientists think not.",
  "Fun fact: {target} is the reason they put 'do not eat' labels on silica gel packets.",
  "A motivational poster featuring {target} would just say 'Well, at least you tried.'",
  "Rumor has it that {target}'s search history is just 'how to be interesting' repeated 500 times.",
  "If boredom had a mascot, {target} would be on the shortlist.",
  "{target} once told a joke so bad that Siri pretended not to hear it.",
  "Breaking: {target} has been banned from elevator small talk for crimes against conversation.",
  "Fun fact: {target} is the human equivalent of a 'loading' screen.",
  "Sources confirm that {target}'s autobiography would be shelved under 'Fiction' because nobody would believe it.",
  "A moment of silence for {target}, who peaked in a dream once and has been chasing it ever since.",
  "The only award {target} ever won was 'Most Likely to Google Simple Math.'",
  "If {target} were a season, they'd be that weird week between winter and spring where nothing makes sense.",
  "{target} is the reason auto-correct was invented — and even it gave up.",
  "Experts say {target} has the energy of a Tuesday — not bad, just aggressively forgettable.",
];

function getRandomRoast(target) {
  const template = CRITICIZE_ROASTS[Math.floor(Math.random() * CRITICIZE_ROASTS.length)];
  return template.replace(/\{target\}/g, target);
}

module.exports = {
  hashPassword,
  hashPasswordLegacy,
  verifyPassword,
  BCRYPT_ROUNDS,
  makeToken,
  DEFAULT_PERMS,
  makeCategory,
  getUserPerms,
  parseMentions,
  parseChannelLinks,
  getUserHighestRolePosition,
  parseDuration,
  CRITICIZE_ROASTS,
  getRandomRoast,
};

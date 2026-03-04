'use strict';

// ── Zero-width characters to strip ──
const ZERO_WIDTH_RE = /[\u200B\u200C\u200D\uFEFF\u00AD\u034F\u2060\u2061\u2062\u2063\u2064\u2065]/g;

// ── Leetspeak substitutions ──
const LEET_MAP = {
  '4': 'a', '@': 'a', '3': 'e', '1': 'i', '!': 'i',
  '0': 'o', '$': 's', '5': 's', '7': 't', '+': 't'
};
const LEET_RE = new RegExp(`[${Object.keys(LEET_MAP).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('')}]`, 'g');

/**
 * Normalize text for anti-evasion matching.
 * Strips zero-width chars, applies NFKC normalization, maps common leetspeak,
 * collapses whitespace, and lowercases.
 */
function normalizeText(text) {
  if (!text || typeof text !== 'string') return '';
  let s = text;
  // Strip zero-width characters
  s = s.replace(ZERO_WIDTH_RE, '');
  // NFKC normalization (handles fullwidth chars, accented variants)
  s = s.normalize('NFKC');
  // Lowercase
  s = s.toLowerCase();
  // Leetspeak substitution
  s = s.replace(LEET_RE, ch => LEET_MAP[ch] || ch);
  // Collapse whitespace
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

// ── Spam Tracker ──

class SpamTracker {
  constructor() {
    // userId → [{ timestamp, hash }]
    this.entries = new Map();
  }

  /**
   * Simple string hash for duplicate detection.
   */
  _hash(content) {
    let h = 0;
    for (let i = 0; i < content.length; i++) {
      h = ((h << 5) - h + content.charCodeAt(i)) | 0;
    }
    return h;
  }

  /**
   * Record a message and check for spam.
   * Returns { spam: boolean, reason: string } if spam detected.
   */
  check(userId, content, config) {
    const now = Date.now();
    const maxMessages = config.maxMessages || 5;
    const intervalMs = config.intervalMs || 5000;
    const maxDuplicates = config.maxDuplicates || 3;

    if (!this.entries.has(userId)) {
      this.entries.set(userId, []);
    }

    const userEntries = this.entries.get(userId);
    // Cleanup old entries
    const cutoff = now - intervalMs;
    while (userEntries.length > 0 && userEntries[0].timestamp < cutoff) {
      userEntries.shift();
    }

    const hash = this._hash(content);
    userEntries.push({ timestamp: now, hash });

    // Check message rate
    if (userEntries.length > maxMessages) {
      return { spam: true, reason: `Sending messages too quickly (${userEntries.length} in ${intervalMs / 1000}s)` };
    }

    // Check duplicates
    const dupeCount = userEntries.filter(e => e.hash === hash).length;
    if (dupeCount > maxDuplicates) {
      return { spam: true, reason: `Duplicate message detected (${dupeCount} times)` };
    }

    return { spam: false };
  }

  /**
   * Clear all entries (for testing).
   */
  clear() {
    this.entries.clear();
  }
}

// Shared spam tracker instance
const spamTracker = new SpamTracker();

// ── Invite link detection ──
const INVITE_PATTERNS = [
  /discord\.gg\/\w+/i,
  /discord\.com\/invite\/\w+/i,
  /discordapp\.com\/invite\/\w+/i,
  /invite\.gg\/\w+/i,
  /nexus\.app\/invite\/\w+/i,
  // Generic invite link pattern (configurable server URLs)
  /https?:\/\/\S+\/invite\/\w+/i
];

/**
 * Check if text contains invite links.
 */
function containsInviteLink(text) {
  return INVITE_PATTERNS.some(p => p.test(text));
}

/**
 * Count @mentions in content.
 */
function countMentions(mentions) {
  if (!mentions) return 0;
  let count = 0;
  if (mentions.users) count += mentions.users.length;
  if (mentions.roles) count += mentions.roles.length;
  if (mentions.everyone) count += 1;
  return count;
}

/**
 * Check if a keyword matches in text.
 * matchMode: 'substring' (default) or 'wholeWord'
 */
function keywordMatches(text, keyword, matchMode) {
  const lowerText = text.toLowerCase();
  const lowerKeyword = keyword.toLowerCase();
  if (matchMode === 'wholeWord') {
    const re = new RegExp(`\\b${lowerKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    return re.test(text);
  }
  return lowerText.includes(lowerKeyword);
}

/**
 * Evaluate a message against all enabled AutoMod rules for a server.
 *
 * @param {Object} params
 * @param {string} params.content - Message text
 * @param {string} params.userId - Author user ID
 * @param {string} params.serverId - Server ID
 * @param {string} params.channelId - Channel ID
 * @param {Object} params.mentions - Parsed mentions object
 * @param {string[]} params.userRoles - User's role IDs
 * @param {Object[]} params.rules - AutoMod rules array (from srv.automodRules)
 * @returns {{ blocked: boolean, rule: Object|null, reason: string }}
 */
function evaluateMessage({ content, userId, serverId, channelId, mentions, userRoles, rules }) {
  if (!rules || rules.length === 0) {
    return { blocked: false, rule: null, reason: '' };
  }

  const enabledRules = rules.filter(r => r.enabled);
  if (enabledRules.length === 0) {
    return { blocked: false, rule: null, reason: '' };
  }

  // Sort by type priority: keyword → spam → invite_link → mention_spam
  const typePriority = { keyword: 0, spam: 1, invite_link: 2, mention_spam: 3 };
  const sorted = [...enabledRules].sort((a, b) =>
    (typePriority[a.rule_type] ?? 99) - (typePriority[b.rule_type] ?? 99)
  );

  for (const rule of sorted) {
    const config = typeof rule.config === 'string' ? JSON.parse(rule.config) : (rule.config || {});
    const exemptRoles = typeof rule.exempt_roles === 'string' ? JSON.parse(rule.exempt_roles) : (rule.exempt_roles || []);
    const exemptChannels = typeof rule.exempt_channels === 'string' ? JSON.parse(rule.exempt_channels) : (rule.exempt_channels || []);

    // Check role exemption
    if (userRoles && exemptRoles.length > 0) {
      const hasExemptRole = userRoles.some(r => exemptRoles.includes(r));
      if (hasExemptRole) continue;
    }

    // Check channel exemption
    if (channelId && exemptChannels.includes(channelId)) continue;

    let result = null;

    switch (rule.rule_type) {
      case 'keyword': {
        const words = config.words || [];
        if (words.length === 0) break;
        const matchMode = config.matchMode || 'substring';
        const normalizedContent = normalizeText(content);
        const lowerContent = content.toLowerCase();

        for (const word of words) {
          const normalizedWord = normalizeText(word);
          // Check both original (lowered) and normalized text
          if (keywordMatches(lowerContent, word, matchMode) ||
              keywordMatches(normalizedContent, normalizedWord, matchMode)) {
            result = { blocked: true, rule, reason: `Contains blocked word: "${word}"` };
            break;
          }
        }
        break;
      }

      case 'spam': {
        const spamResult = spamTracker.check(userId, content, config);
        if (spamResult.spam) {
          result = { blocked: true, rule, reason: spamResult.reason };
        }
        break;
      }

      case 'invite_link': {
        if (containsInviteLink(content)) {
          result = { blocked: true, rule, reason: 'Message contains an invite link' };
        }
        break;
      }

      case 'mention_spam': {
        const maxMentions = config.maxMentions || 10;
        const mentionCount = countMentions(mentions);
        if (mentionCount > maxMentions) {
          result = { blocked: true, rule, reason: `Too many mentions (${mentionCount}/${maxMentions})` };
        }
        break;
      }
    }

    if (result) return result;
  }

  return { blocked: false, rule: null, reason: '' };
}

module.exports = {
  normalizeText,
  SpamTracker,
  spamTracker,
  evaluateMessage,
  containsInviteLink,
  countMentions,
  keywordMatches
};

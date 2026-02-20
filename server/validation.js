/**
 * Input validation and sanitization utilities
 */

/**
 * Validate username (3-32 chars, alphanumeric + underscore/hyphen)
 * @param {string} username - Username to validate
 * @returns {boolean} - True if valid
 */
function validateUsername(username) {
  if (!username || typeof username !== 'string') return false;
  if (username.length < 3 || username.length > 32) return false;
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) return false;
  return true;
}

/**
 * Validate password (minimum 8 characters)
 * @param {string} password - Password to validate
 * @returns {boolean} - True if valid
 */
function validatePassword(password) {
  if (!password || typeof password !== 'string') return false;
  if (password.length < 8) return false;
  return true;
}

/**
 * Validate message content (max 2000 chars, no excessive newlines)
 * @param {string} content - Message content to validate
 * @returns {boolean} - True if valid
 */
function validateMessage(content) {
  if (!content || typeof content !== 'string') return false;
  if (content.length > 2000) return false;
  // Check for excessive newlines (spam prevention)
  if ((content.match(/\n/g) || []).length > 20) return false;
  return true;
}

/**
 * Validate server name (3-32 chars)
 * @param {string} name - Server name to validate
 * @returns {boolean} - True if valid
 */
function validateServerName(name) {
  if (!name || typeof name !== 'string') return false;
  if (name.length < 3 || name.length > 32) return false;
  return true;
}

/**
 * Validate channel name (2-32 chars, alphanumeric + hyphen/underscore)
 * @param {string} name - Channel name to validate
 * @returns {boolean} - True if valid
 */
function validateChannelName(name) {
  if (!name || typeof name !== 'string') return false;
  if (name.length < 2 || name.length > 32) return false;
  if (!/^[a-z0-9_-]+$/.test(name)) return false;
  return true;
}

/**
 * Validate role name (2-32 chars)
 * @param {string} name - Role name to validate
 * @returns {boolean} - True if valid
 */
function validateRoleName(name) {
  if (!name || typeof name !== 'string') return false;
  if (name.length < 2 || name.length > 32) return false;
  return true;
}

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} - True if valid
 */
function validateEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Sanitize input string (trim and limit length)
 * @param {string} input - Input string to sanitize
 * @param {number} maxLength - Maximum length (default 1000)
 * @returns {string} - Sanitized string
 */
function sanitizeInput(input, maxLength = 1000) {
  if (typeof input !== 'string') return '';
  return input.trim().slice(0, maxLength);
}

/**
 * Validate color hex code
 * @param {string} color - Color hex code to validate
 * @returns {boolean} - True if valid
 */
function validateColor(color) {
  if (!color || typeof color !== 'string') return false;
  return /^#[0-9A-F]{6}$/i.test(color);
}

/**
 * Validate UUID format
 * @param {string} uuid - UUID to validate
 * @returns {boolean} - True if valid
 */
function validateUUID(uuid) {
  if (!uuid || typeof uuid !== 'string') return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Validate attachment object
 * @param {Object} attachment - Attachment to validate
 * @returns {boolean} - True if valid
 */
function validateAttachment(attachment) {
  if (!attachment || typeof attachment !== 'object') return false;
  if (!attachment.url || typeof attachment.url !== 'string') return false;
  if (!attachment.url.startsWith('http') && !attachment.url.startsWith('data:')) return false;
  return true;
}

// ============================================================================
// PHASE 3: Advanced DM Security Validators
// ============================================================================

/**
 * Validate array of participant UUIDs for group DM
 * @param {Array} participantIds - Array of user IDs
 * @returns {Object} - { valid: boolean, error?: string }
 */
function validateParticipantIds(participantIds) {
  // Must be an array
  if (!Array.isArray(participantIds)) {
    return { valid: false, error: 'participantIds must be an array' };
  }

  // Must have at least 2 participants (excluding creator)
  if (participantIds.length < 2) {
    return { valid: false, error: 'Group DMs require at least 2 other participants' };
  }

  // Maximum 50 participants to prevent abuse
  if (participantIds.length > 50) {
    return { valid: false, error: 'Group DMs cannot have more than 50 participants' };
  }

  // All must be valid UUIDs
  const invalidIds = participantIds.filter(id => !validateUUID(id));
  if (invalidIds.length > 0) {
    return { valid: false, error: 'Invalid participant IDs' };
  }

  // Check for duplicates
  const uniqueIds = new Set(participantIds);
  if (uniqueIds.size !== participantIds.length) {
    return { valid: false, error: 'Duplicate participant IDs are not allowed' };
  }

  return { valid: true };
}

/**
 * Sanitize and validate group DM name
 * @param {string} name - Group DM name
 * @returns {string|null} - Sanitized name or null if invalid
 */
function sanitizeGroupDMName(name) {
  if (!name) return null;
  if (typeof name !== 'string') return null;

  // Trim and limit length
  let sanitized = sanitizeInput(name, 100);

  // Must be at least 1 character after trimming
  if (sanitized.length === 0) return null;

  // Check for only whitespace or special characters
  if (!/[a-zA-Z0-9]/.test(sanitized)) return null;

  // Basic HTML escape to prevent XSS
  sanitized = sanitized
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');

  return sanitized;
}

/**
 * Validate channel ID (must be valid UUID)
 * @param {string} channelId - Channel ID
 * @returns {Object} - { valid: boolean, error?: string }
 */
function validateChannelId(channelId) {
  if (!channelId || typeof channelId !== 'string') {
    return { valid: false, error: 'Channel ID is required' };
  }

  if (!validateUUID(channelId)) {
    return { valid: false, error: 'Invalid channel ID format' };
  }

  return { valid: true };
}

/**
 * Validate message ID (optional, but must be UUID if provided)
 * @param {string|null} messageId - Message ID
 * @param {boolean} allowNull - Whether null is allowed
 * @returns {Object} - { valid: boolean, error?: string }
 */
function validateMessageId(messageId, allowNull = true) {
  if (messageId === null || messageId === undefined) {
    return allowNull ? { valid: true } : { valid: false, error: 'Message ID is required' };
  }

  if (!validateUUID(messageId)) {
    return { valid: false, error: 'Invalid message ID format' };
  }

  return { valid: true };
}

/**
 * Check if user is authenticated (not a guest)
 * @param {Object} user - User object
 * @returns {Object} - { authorized: boolean, error?: string }
 */
function requireAuth(user) {
  if (!user) {
    return { authorized: false, error: 'Authentication required' };
  }

  if (user.isGuest) {
    return { authorized: false, error: 'This action requires a registered account' };
  }

  return { authorized: true };
}

// ============================================================================
// RATE LIMITING
// ============================================================================

/**
 * Simple in-memory rate limiter
 */
class RateLimiter {
  constructor(maxRequests, windowMs) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests = new Map(); // userId -> [timestamps]
  }

  check(userId) {
    const now = Date.now();

    // Get user's request history
    let userRequests = this.requests.get(userId) || [];

    // Remove old requests outside the time window
    userRequests = userRequests.filter(timestamp => now - timestamp < this.windowMs);

    // Check if limit exceeded
    if (userRequests.length >= this.maxRequests) {
      return {
        allowed: false,
        error: 'Rate limit exceeded. Please slow down.'
      };
    }

    // Add current request
    userRequests.push(now);
    this.requests.set(userId, userRequests);

    return { allowed: true };
  }

  // Clean up old entries periodically
  cleanup() {
    const now = Date.now();
    for (const [userId, timestamps] of this.requests.entries()) {
      const filtered = timestamps.filter(t => now - t < this.windowMs);
      if (filtered.length === 0) {
        this.requests.delete(userId);
      } else {
        this.requests.set(userId, filtered);
      }
    }
  }
}

// Create rate limiters for Phase 3 operations
const groupDMCreateLimiter = new RateLimiter(5, 60000); // 5 group DMs per minute
const participantManageLimiter = new RateLimiter(20, 60000); // 20 participant changes per minute
const markReadLimiter = new RateLimiter(100, 60000); // 100 mark-as-read per minute

// Cleanup old entries every 5 minutes
setInterval(() => {
  groupDMCreateLimiter.cleanup();
  participantManageLimiter.cleanup();
  markReadLimiter.cleanup();
}, 5 * 60 * 1000);

module.exports = {
  // Original validators
  validateUsername,
  validatePassword,
  validateMessage,
  validateServerName,
  validateChannelName,
  validateRoleName,
  validateEmail,
  sanitizeInput,
  validateColor,
  validateUUID,
  validateAttachment,

  // Phase 3: Advanced DM validators
  validateParticipantIds,
  sanitizeGroupDMName,
  validateChannelId,
  validateMessageId,
  requireAuth,

  // Rate limiting
  RateLimiter,
  groupDMCreateLimiter,
  participantManageLimiter,
  markReadLimiter
};

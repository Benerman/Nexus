const {
  validateUsername,
  validatePassword,
  validateMessage,
  validateChannelName,
  validateColor,
  validateUUID,
  validateServerName,
  validateRoleName,
  validateEmail,
  sanitizeInput,
  validateAttachment,
  validateParticipantIds,
  sanitizeGroupDMName,
  validateChannelId,
  validateMessageId,
  requireAuth,
  RateLimiter,
} = require('../../server/validation');

// ─── validateUsername ──────────────────────────────────────────────────────────
describe('validateUsername', () => {
  test('accepts valid username (alphanumeric, 3-32 chars)', () => {
    expect(validateUsername('alice')).toBe(true);
    expect(validateUsername('Bob_42')).toBe(true);
    expect(validateUsername('user-name')).toBe(true);
    expect(validateUsername('abc')).toBe(true); // minimum 3
    expect(validateUsername('a'.repeat(32))).toBe(true); // maximum 32
  });

  test('rejects empty, null, short, and long usernames', () => {
    expect(validateUsername('')).toBe(false);
    expect(validateUsername(null)).toBe(false);
    expect(validateUsername(undefined)).toBe(false);
    expect(validateUsername('ab')).toBe(false); // too short
    expect(validateUsername('a'.repeat(33))).toBe(false); // too long
  });

  test('rejects username with special characters', () => {
    expect(validateUsername('user name')).toBe(false); // space
    expect(validateUsername('user@name')).toBe(false);
    expect(validateUsername('user!name')).toBe(false);
    expect(validateUsername('user.name')).toBe(false);
  });

  test('rejects non-string types', () => {
    expect(validateUsername(12345)).toBe(false);
    expect(validateUsername({})).toBe(false);
    expect(validateUsername([])).toBe(false);
    expect(validateUsername(true)).toBe(false);
  });
});

// ─── validatePassword ─────────────────────────────────────────────────────────
describe('validatePassword', () => {
  test('accepts valid password (8+ chars)', () => {
    expect(validatePassword('password')).toBe(true);
    expect(validatePassword('12345678')).toBe(true);
    expect(validatePassword('a very long secure password 123!')).toBe(true);
  });

  test('rejects short password (<8 chars)', () => {
    expect(validatePassword('short')).toBe(false);
    expect(validatePassword('1234567')).toBe(false);
    expect(validatePassword('')).toBe(false);
    expect(validatePassword(null)).toBe(false);
  });

  test('rejects non-string types', () => {
    expect(validatePassword(12345678)).toBe(false);
    expect(validatePassword(undefined)).toBe(false);
  });
});

// ─── validateMessage ──────────────────────────────────────────────────────────
describe('validateMessage', () => {
  test('accepts valid message (1-2000 chars)', () => {
    expect(validateMessage('Hello world')).toBe(true);
    expect(validateMessage('x')).toBe(true);
    expect(validateMessage('a'.repeat(2000))).toBe(true);
  });

  test('rejects message over 2000 chars', () => {
    expect(validateMessage('a'.repeat(2001))).toBe(false);
  });

  test('rejects message with >20 newlines', () => {
    const manyNewlines = 'line\n'.repeat(21);
    expect(validateMessage(manyNewlines)).toBe(false);
    // 20 newlines should still be ok
    const okNewlines = 'line\n'.repeat(20) + 'end';
    expect(validateMessage(okNewlines)).toBe(true);
  });

  test('rejects empty and null messages', () => {
    expect(validateMessage('')).toBe(false);
    expect(validateMessage(null)).toBe(false);
    expect(validateMessage(undefined)).toBe(false);
  });
});

// ─── validateServerName ───────────────────────────────────────────────────────
describe('validateServerName', () => {
  test('accepts valid server names (3-32 chars)', () => {
    expect(validateServerName('My Server')).toBe(true);
    expect(validateServerName('abc')).toBe(true); // minimum 3
    expect(validateServerName('a'.repeat(32))).toBe(true); // maximum 32
    expect(validateServerName('Gaming Hub 2024!')).toBe(true);
  });

  test('rejects short server names (<3 chars)', () => {
    expect(validateServerName('ab')).toBe(false);
    expect(validateServerName('a')).toBe(false);
  });

  test('rejects long server names (>32 chars)', () => {
    expect(validateServerName('a'.repeat(33))).toBe(false);
  });

  test('rejects empty, null, and non-string types', () => {
    expect(validateServerName('')).toBe(false);
    expect(validateServerName(null)).toBe(false);
    expect(validateServerName(undefined)).toBe(false);
    expect(validateServerName(12345)).toBe(false);
  });
});

// ─── validateChannelName ──────────────────────────────────────────────────────
describe('validateChannelName', () => {
  test('accepts valid channel name (lowercase alphanumeric + hyphen/underscore)', () => {
    expect(validateChannelName('general')).toBe(true);
    expect(validateChannelName('chat-room')).toBe(true);
    expect(validateChannelName('voice_1')).toBe(true);
    expect(validateChannelName('ab')).toBe(true); // minimum 2
  });

  test('rejects invalid channel names', () => {
    expect(validateChannelName('A')).toBe(false); // too short
    expect(validateChannelName('General')).toBe(false); // uppercase
    expect(validateChannelName('chat room')).toBe(false); // space
    expect(validateChannelName('')).toBe(false);
    expect(validateChannelName(null)).toBe(false);
    expect(validateChannelName('a'.repeat(33))).toBe(false); // too long
  });
});

// ─── validateRoleName ─────────────────────────────────────────────────────────
describe('validateRoleName', () => {
  test('accepts valid role names (2-32 chars)', () => {
    expect(validateRoleName('Admin')).toBe(true);
    expect(validateRoleName('Moderator')).toBe(true);
    expect(validateRoleName('ab')).toBe(true); // minimum 2
    expect(validateRoleName('a'.repeat(32))).toBe(true); // maximum 32
    expect(validateRoleName('Super Admin!')).toBe(true); // special chars ok
  });

  test('rejects short role names (<2 chars)', () => {
    expect(validateRoleName('a')).toBe(false);
  });

  test('rejects long role names (>32 chars)', () => {
    expect(validateRoleName('a'.repeat(33))).toBe(false);
  });

  test('rejects empty, null, and non-string types', () => {
    expect(validateRoleName('')).toBe(false);
    expect(validateRoleName(null)).toBe(false);
    expect(validateRoleName(undefined)).toBe(false);
    expect(validateRoleName(42)).toBe(false);
  });
});

// ─── validateEmail ────────────────────────────────────────────────────────────
describe('validateEmail', () => {
  test('accepts valid email formats', () => {
    expect(validateEmail('user@example.com')).toBe(true);
    expect(validateEmail('test.user@domain.co.uk')).toBe(true);
    expect(validateEmail('admin@localhost.dev')).toBe(true);
    expect(validateEmail('a@b.c')).toBe(true);
  });

  test('rejects invalid email formats', () => {
    expect(validateEmail('not-an-email')).toBe(false);
    expect(validateEmail('@missing-local.com')).toBe(false);
    expect(validateEmail('missing-domain@')).toBe(false);
    expect(validateEmail('spaces in@email.com')).toBe(false);
    expect(validateEmail('no@domain')).toBe(false);
  });

  test('rejects empty, null, and non-string types', () => {
    expect(validateEmail('')).toBe(false);
    expect(validateEmail(null)).toBe(false);
    expect(validateEmail(undefined)).toBe(false);
    expect(validateEmail(42)).toBe(false);
  });
});

// ─── sanitizeInput ────────────────────────────────────────────────────────────
describe('sanitizeInput', () => {
  test('trims whitespace from input', () => {
    expect(sanitizeInput('  hello  ')).toBe('hello');
    expect(sanitizeInput('\thello\n')).toBe('hello');
  });

  test('truncates to default max length (1000)', () => {
    const longString = 'a'.repeat(1500);
    expect(sanitizeInput(longString)).toBe('a'.repeat(1000));
  });

  test('truncates to custom max length', () => {
    expect(sanitizeInput('hello world', 5)).toBe('hello');
  });

  test('returns empty string for non-string input', () => {
    expect(sanitizeInput(null)).toBe('');
    expect(sanitizeInput(undefined)).toBe('');
    expect(sanitizeInput(42)).toBe('');
    expect(sanitizeInput({})).toBe('');
  });

  test('preserves valid short strings', () => {
    expect(sanitizeInput('hello')).toBe('hello');
    expect(sanitizeInput('test 123')).toBe('test 123');
  });
});

// ─── validateColor ────────────────────────────────────────────────────────────
describe('validateColor', () => {
  test('accepts valid hex color codes', () => {
    expect(validateColor('#FF0000')).toBe(true);
    expect(validateColor('#00ff00')).toBe(true);
    expect(validateColor('#3B82F6')).toBe(true);
  });

  test('rejects invalid color formats', () => {
    expect(validateColor('FF0000')).toBe(false); // missing #
    expect(validateColor('#FFF')).toBe(false); // 3-digit shorthand
    expect(validateColor('#GGGGGG')).toBe(false); // invalid hex chars
    expect(validateColor('')).toBe(false);
    expect(validateColor(null)).toBe(false);
  });
});

// ─── validateUUID ─────────────────────────────────────────────────────────────
describe('validateUUID', () => {
  test('accepts valid UUID format', () => {
    expect(validateUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(validateUUID('6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(true);
  });

  test('rejects invalid UUID formats', () => {
    expect(validateUUID('not-a-uuid')).toBe(false);
    expect(validateUUID('550e8400e29b41d4a716446655440000')).toBe(false); // no dashes
    expect(validateUUID('')).toBe(false);
    expect(validateUUID(null)).toBe(false);
    expect(validateUUID(12345)).toBe(false);
  });
});

// ─── validateAttachment ───────────────────────────────────────────────────────
describe('validateAttachment', () => {
  test('accepts valid HTTP attachment', () => {
    expect(validateAttachment({ url: 'https://example.com/image.png' })).toBe(true);
    expect(validateAttachment({ url: 'http://example.com/file.pdf' })).toBe(true);
  });

  test('accepts valid data URI attachment', () => {
    expect(validateAttachment({ url: 'data:image/png;base64,abc123' })).toBe(true);
  });

  test('rejects attachment without url', () => {
    expect(validateAttachment({})).toBe(false);
    expect(validateAttachment({ url: '' })).toBe(false);
    expect(validateAttachment({ url: null })).toBe(false);
  });

  test('rejects attachment with non-http/data url', () => {
    expect(validateAttachment({ url: 'ftp://example.com/file' })).toBe(false);
    expect(validateAttachment({ url: 'file:///etc/passwd' })).toBe(false);
    expect(validateAttachment({ url: 'javascript:alert(1)' })).toBe(false);
  });

  test('rejects non-object input', () => {
    expect(validateAttachment(null)).toBe(false);
    expect(validateAttachment(undefined)).toBe(false);
    expect(validateAttachment('string')).toBe(false);
    expect(validateAttachment(42)).toBe(false);
  });
});

// ─── validateParticipantIds ───────────────────────────────────────────────────
describe('validateParticipantIds', () => {
  const validUuid1 = '550e8400-e29b-41d4-a716-446655440001';
  const validUuid2 = '550e8400-e29b-41d4-a716-446655440002';
  const validUuid3 = '550e8400-e29b-41d4-a716-446655440003';

  test('accepts valid array of 2+ UUIDs', () => {
    const result = validateParticipantIds([validUuid1, validUuid2]);
    expect(result.valid).toBe(true);
  });

  test('accepts up to 50 participants', () => {
    const ids = Array.from({ length: 50 }, (_, i) =>
      `550e8400-e29b-41d4-a716-4466554400${String(i).padStart(2, '0')}`
    );
    expect(validateParticipantIds(ids).valid).toBe(true);
  });

  test('rejects non-array input', () => {
    const result = validateParticipantIds('not-array');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('must be an array');
  });

  test('rejects fewer than 2 participants', () => {
    const result = validateParticipantIds([validUuid1]);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('at least 2');
  });

  test('rejects more than 50 participants', () => {
    const ids = Array.from({ length: 51 }, (_, i) =>
      `550e8400-e29b-41d4-a716-4466554400${String(i).padStart(2, '0')}`
    );
    expect(validateParticipantIds(ids).valid).toBe(false);
    expect(validateParticipantIds(ids).error).toContain('more than 50');
  });

  test('rejects invalid UUID in array', () => {
    const result = validateParticipantIds([validUuid1, 'not-a-uuid']);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid participant');
  });

  test('rejects duplicate participant IDs', () => {
    const result = validateParticipantIds([validUuid1, validUuid1]);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Duplicate');
  });
});

// ─── sanitizeGroupDMName ──────────────────────────────────────────────────────
describe('sanitizeGroupDMName', () => {
  test('returns sanitized name for valid input', () => {
    expect(sanitizeGroupDMName('My Group Chat')).toBe('My Group Chat');
  });

  test('trims whitespace', () => {
    expect(sanitizeGroupDMName('  trimmed  ')).toBe('trimmed');
  });

  test('truncates to 100 characters', () => {
    const longName = 'a'.repeat(150);
    const result = sanitizeGroupDMName(longName);
    expect(result.length).toBeLessThanOrEqual(100);
  });

  test('escapes HTML characters', () => {
    const result = sanitizeGroupDMName('test<script>alert(1)</script>');
    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;script&gt;');
  });

  test('escapes ampersand, quotes, and angle brackets', () => {
    const result = sanitizeGroupDMName('A & B "test" <tag>');
    expect(result).toContain('&amp;');
    expect(result).toContain('&quot;');
    expect(result).toContain('&lt;');
    expect(result).toContain('&gt;');
  });

  test('returns null for empty input', () => {
    expect(sanitizeGroupDMName('')).toBeNull();
    expect(sanitizeGroupDMName(null)).toBeNull();
    expect(sanitizeGroupDMName(undefined)).toBeNull();
  });

  test('returns null for non-string input', () => {
    expect(sanitizeGroupDMName(42)).toBeNull();
    expect(sanitizeGroupDMName({})).toBeNull();
  });

  test('returns null for string with only special characters', () => {
    expect(sanitizeGroupDMName('!!!')).toBeNull();
    expect(sanitizeGroupDMName('---')).toBeNull();
    expect(sanitizeGroupDMName('...')).toBeNull();
  });

  test('returns null for whitespace-only input', () => {
    expect(sanitizeGroupDMName('   ')).toBeNull();
    expect(sanitizeGroupDMName('\t\n')).toBeNull();
  });
});

// ─── validateChannelId ────────────────────────────────────────────────────────
describe('validateChannelId', () => {
  test('accepts valid UUID channel ID', () => {
    const result = validateChannelId('550e8400-e29b-41d4-a716-446655440000');
    expect(result.valid).toBe(true);
  });

  test('rejects missing channel ID', () => {
    expect(validateChannelId(null).valid).toBe(false);
    expect(validateChannelId(null).error).toContain('required');
    expect(validateChannelId(undefined).valid).toBe(false);
    expect(validateChannelId('').valid).toBe(false);
  });

  test('rejects invalid UUID format', () => {
    const result = validateChannelId('not-a-uuid');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid channel ID');
  });
});

// ─── validateMessageId ────────────────────────────────────────────────────────
describe('validateMessageId', () => {
  test('accepts valid UUID message ID', () => {
    const result = validateMessageId('550e8400-e29b-41d4-a716-446655440000');
    expect(result.valid).toBe(true);
  });

  test('accepts null when allowNull=true (default)', () => {
    expect(validateMessageId(null).valid).toBe(true);
    expect(validateMessageId(undefined).valid).toBe(true);
  });

  test('rejects null when allowNull=false', () => {
    const result = validateMessageId(null, false);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('required');
  });

  test('rejects invalid UUID format', () => {
    const result = validateMessageId('not-a-uuid');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid message ID');
  });
});

// ─── requireAuth ──────────────────────────────────────────────────────────────
describe('requireAuth', () => {
  test('authorizes registered user', () => {
    const result = requireAuth({ id: '123', username: 'alice', isGuest: false });
    expect(result.authorized).toBe(true);
  });

  test('authorizes user without isGuest property', () => {
    const result = requireAuth({ id: '123', username: 'alice' });
    expect(result.authorized).toBe(true);
  });

  test('rejects guest user', () => {
    const result = requireAuth({ id: '123', username: 'guest', isGuest: true });
    expect(result.authorized).toBe(false);
    expect(result.error).toContain('registered account');
  });

  test('rejects null/undefined user', () => {
    expect(requireAuth(null).authorized).toBe(false);
    expect(requireAuth(null).error).toContain('Authentication required');
    expect(requireAuth(undefined).authorized).toBe(false);
  });
});

// ─── RateLimiter ──────────────────────────────────────────────────────────────
describe('RateLimiter', () => {
  test('allows requests within limit and blocks when exceeded', () => {
    const limiter = new RateLimiter(3, 60000); // 3 per minute

    expect(limiter.check('user1').allowed).toBe(true);
    expect(limiter.check('user1').allowed).toBe(true);
    expect(limiter.check('user1').allowed).toBe(true);
    // 4th should be blocked
    const result = limiter.check('user1');
    expect(result.allowed).toBe(false);
    expect(result.error).toBeDefined();

    // Different user should still be allowed
    expect(limiter.check('user2').allowed).toBe(true);
  });

  test('cleanup removes expired entries', () => {
    const limiter = new RateLimiter(3, 1); // 1ms window
    limiter.check('user1');
    limiter.check('user2');

    // Wait for entries to expire
    return new Promise(resolve => setTimeout(resolve, 10)).then(() => {
      limiter.cleanup();
      // After cleanup, internal map should have entries removed
      expect(limiter.requests.size).toBe(0);

      // User should be able to make requests again
      expect(limiter.check('user1').allowed).toBe(true);
    });
  });

  test('cleanup preserves active entries', () => {
    const limiter = new RateLimiter(5, 60000); // 60s window
    limiter.check('active-user');
    limiter.cleanup();
    // Active user entry should still exist
    expect(limiter.requests.has('active-user')).toBe(true);
  });

  test('expired requests are removed on next check', () => {
    const limiter = new RateLimiter(1, 50); // 1 request per 50ms

    limiter.check('user1');
    expect(limiter.check('user1').allowed).toBe(false);

    return new Promise(resolve => setTimeout(resolve, 100)).then(() => {
      // After window passes, user should be allowed again
      expect(limiter.check('user1').allowed).toBe(true);
    });
  });
});

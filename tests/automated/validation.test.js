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
  RateLimiter,
} = require('../../server/validation');

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
});

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
});

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
});

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
});

const {
  hashPassword,
  makeToken,
  DEFAULT_PERMS,
  makeCategory,
  parseDuration,
  CRITICIZE_ROASTS,
  getRandomRoast,
  parseMentions,
  parseChannelLinks,
} = require('../../server/utils');

// ─── hashPassword ─────────────────────────────────────────────────────────────
describe('hashPassword', () => {
  test('hashes password deterministically with same salt', () => {
    const hash1 = hashPassword('mypassword', 'salt123');
    const hash2 = hashPassword('mypassword', 'salt123');
    expect(hash1).toBe(hash2);
    expect(typeof hash1).toBe('string');
    expect(hash1.length).toBe(64); // SHA-256 hex = 64 chars
  });

  test('produces different hashes with different salts', () => {
    const hash1 = hashPassword('mypassword', 'salt1');
    const hash2 = hashPassword('mypassword', 'salt2');
    expect(hash1).not.toBe(hash2);
  });
});

// ─── makeToken ────────────────────────────────────────────────────────────────
describe('makeToken', () => {
  test('generates 64-char hex token', () => {
    const token = makeToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  test('generates unique tokens each call', () => {
    const tokens = new Set(Array.from({ length: 10 }, () => makeToken()));
    expect(tokens.size).toBe(10);
  });
});

// ─── parseDuration ────────────────────────────────────────────────────────────
describe('parseDuration', () => {
  test('parses "5s" to 5000ms', () => {
    expect(parseDuration('5s')).toBe(5000);
  });

  test('parses "10m" to 600000ms', () => {
    expect(parseDuration('10m')).toBe(600000);
  });

  test('parses "2h" to 7200000ms', () => {
    expect(parseDuration('2h')).toBe(7200000);
  });

  test('parses "1d" to 86400000ms', () => {
    expect(parseDuration('1d')).toBe(86400000);
  });

  test('parses "1w" to 604800000ms', () => {
    expect(parseDuration('1w')).toBe(604800000);
  });

  test('returns null for invalid duration strings', () => {
    expect(parseDuration('abc')).toBeNull();
    expect(parseDuration('')).toBeNull();
    expect(parseDuration('5x')).toBeNull();
    expect(parseDuration('m5')).toBeNull();
  });
});

// ─── getRandomRoast ───────────────────────────────────────────────────────────
describe('getRandomRoast', () => {
  test('replaces {target} in roast template', () => {
    const roast = getRandomRoast('TestUser');
    expect(roast).toContain('TestUser');
    expect(roast).not.toContain('{target}');
  });
});

// ─── DEFAULT_PERMS ────────────────────────────────────────────────────────────
describe('DEFAULT_PERMS', () => {
  test('has all 11 expected keys', () => {
    const expectedKeys = [
      'viewChannel', 'sendMessages', 'attachFiles', 'joinVoice',
      'readHistory', 'addReactions', 'mentionEveryone', 'manageMessages',
      'createInvite', 'sendTargetedSounds', 'manageEmojis'
    ];
    expectedKeys.forEach(key => {
      expect(DEFAULT_PERMS).toHaveProperty(key);
    });
    expect(Object.keys(DEFAULT_PERMS).length).toBe(11);
  });

  test('defaults: viewChannel=true, manageMessages=false', () => {
    expect(DEFAULT_PERMS.viewChannel).toBe(true);
    expect(DEFAULT_PERMS.sendMessages).toBe(true);
    expect(DEFAULT_PERMS.manageMessages).toBe(false);
    expect(DEFAULT_PERMS.mentionEveryone).toBe(false);
  });
});

// ─── makeCategory ─────────────────────────────────────────────────────────────
describe('makeCategory', () => {
  test('returns object with UUID id, name, and position', () => {
    const cat = makeCategory('GENERAL', 0);
    expect(cat.name).toBe('GENERAL');
    expect(cat.position).toBe(0);
    expect(cat.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(cat.channels).toEqual([]);
  });
});

// ─── parseMentions ────────────────────────────────────────────────────────────
describe('parseMentions', () => {
  const mockServer = {
    members: {
      'user-1': { username: 'Alice', roles: [] },
      'user-2': { username: 'Bob', roles: [] },
    },
    roles: {
      'everyone': { id: 'everyone', name: '@everyone', permissions: {} },
      'admin': { id: 'admin', name: 'Admin', permissions: {} },
    },
    channels: { text: [], voice: [] },
  };

  test('finds @username in content', () => {
    const result = parseMentions('Hello @Alice how are you?', mockServer);
    expect(result.users).toHaveLength(1);
    expect(result.users[0].username).toBe('Alice');
    expect(result.users[0].id).toBe('user-1');
  });

  test('detects @everyone', () => {
    const result = parseMentions('Hey @everyone check this out', mockServer);
    expect(result.everyone).toBe(true);
  });
});

// ─── parseChannelLinks ───────────────────────────────────────────────────────
describe('parseChannelLinks', () => {
  const mockServer = {
    members: {},
    roles: {},
    channels: {
      text: [
        { id: 'ch-1', name: 'general' },
        { id: 'ch-2', name: 'announcements' },
      ],
      voice: [
        { id: 'vc-1', name: 'lounge' },
      ],
    },
  };

  // This test is counted in permissions.test.js per the plan but logically fits here
  test('finds #channel-name in content', () => {
    const result = parseChannelLinks('Check out #general for updates', mockServer, 'srv-1');
    expect(result.channels).toHaveLength(1);
    expect(result.channels[0].name).toBe('general');
    expect(result.channels[0].serverId).toBe('srv-1');
  });

  test('returns empty for non-matching content', () => {
    const result = parseChannelLinks('No channels here', mockServer, 'srv-1');
    expect(result.channels).toHaveLength(0);
  });
});

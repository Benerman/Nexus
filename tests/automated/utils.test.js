const {
  hashPassword,
  hashPasswordLegacy,
  verifyPassword,
  BCRYPT_ROUNDS,
  makeToken,
  DEFAULT_PERMS,
  makeCategory,
  parseDuration,
  CRITICIZE_ROASTS,
  getRandomRoast,
  parseMentions,
  parseChannelLinks,
  getUserHighestRolePosition,
  isPrivateUrl,
} = require('../../server/utils');

// ─── hashPassword (async bcrypt) ─────────────────────────────────────────────
describe('hashPassword', () => {
  test('returns a bcrypt hash string', async () => {
    const hash = await hashPassword('mypassword');
    expect(typeof hash).toBe('string');
    expect(hash.startsWith('$2b$')).toBe(true);
  });

  test('generates different hashes for same password (bcrypt salts internally)', async () => {
    const hash1 = await hashPassword('samepassword');
    const hash2 = await hashPassword('samepassword');
    expect(hash1).not.toBe(hash2);
  });
});

// ─── hashPasswordLegacy (HMAC-SHA256) ────────────────────────────────────────
describe('hashPasswordLegacy', () => {
  test('returns 64-char hex string (SHA-256)', () => {
    const hash = hashPasswordLegacy('mypassword', 'salt123');
    expect(typeof hash).toBe('string');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test('is deterministic with same salt', () => {
    const h1 = hashPasswordLegacy('pass', 'salt');
    const h2 = hashPasswordLegacy('pass', 'salt');
    expect(h1).toBe(h2);
  });

  test('produces different hashes with different salts', () => {
    const h1 = hashPasswordLegacy('pass', 'salt1');
    const h2 = hashPasswordLegacy('pass', 'salt2');
    expect(h1).not.toBe(h2);
  });
});

// ─── verifyPassword (async bcrypt compare) ───────────────────────────────────
describe('verifyPassword', () => {
  test('returns true for matching password + bcrypt hash', async () => {
    const hash = await hashPassword('correctpassword');
    const result = await verifyPassword('correctpassword', hash);
    expect(result).toBe(true);
  });

  test('returns false for wrong password', async () => {
    const hash = await hashPassword('correctpassword');
    const result = await verifyPassword('wrongpassword', hash);
    expect(result).toBe(false);
  });

  test('returns false for legacy (non-bcrypt) hash', async () => {
    const legacyHash = hashPasswordLegacy('pass', 'salt');
    const result = await verifyPassword('pass', legacyHash);
    expect(result).toBe(false);
  });

  test('returns false for null/empty hash', async () => {
    expect(await verifyPassword('pass', null)).toBe(false);
    expect(await verifyPassword('pass', '')).toBe(false);
    expect(await verifyPassword('pass', undefined)).toBe(false);
  });
});

// ─── BCRYPT_ROUNDS ───────────────────────────────────────────────────────────
describe('BCRYPT_ROUNDS', () => {
  test('is 12', () => {
    expect(BCRYPT_ROUNDS).toBe(12);
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

// ─── CRITICIZE_ROASTS ────────────────────────────────────────────────────────
describe('CRITICIZE_ROASTS', () => {
  test('has 30 roast templates', () => {
    expect(CRITICIZE_ROASTS).toHaveLength(30);
  });

  test('every template contains {target} placeholder', () => {
    CRITICIZE_ROASTS.forEach((t, i) => {
      expect(t).toContain('{target}');
    });
  });

  test('all entries are non-empty strings', () => {
    CRITICIZE_ROASTS.forEach(t => {
      expect(typeof t).toBe('string');
      expect(t.length).toBeGreaterThan(10);
    });
  });
});

// ─── getRandomRoast ───────────────────────────────────────────────────────────
describe('getRandomRoast', () => {
  test('replaces {target} in roast template', () => {
    const roast = getRandomRoast('TestUser');
    expect(roast).toContain('TestUser');
    expect(roast).not.toContain('{target}');
  });

  test('replaces all occurrences of {target}', () => {
    // Some templates have {target} twice — verify none remain
    for (let i = 0; i < 50; i++) {
      const roast = getRandomRoast('Alice');
      expect(roast).not.toContain('{target}');
    }
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

  test('uses default position of 0 when omitted', () => {
    const cat = makeCategory('TEXT');
    expect(cat.position).toBe(0);
  });
});

// ─── getUserHighestRolePosition ──────────────────────────────────────────────
describe('getUserHighestRolePosition', () => {
  const mockServer = {
    ownerId: 'owner-1',
    members: {
      'user-1': { username: 'Alice', roles: ['mod'] },
      'user-2': { username: 'Bob', roles: ['admin', 'mod'] },
      'user-3': { username: 'Charlie', roles: [] },
    },
    roles: {
      everyone: { id: 'everyone', permissions: {} },
      mod: { id: 'mod', position: 5 },
      admin: { id: 'admin', position: 10 },
    },
    channels: { text: [], voice: [] },
  };

  test('returns Infinity for server owner', () => {
    expect(getUserHighestRolePosition('owner-1', mockServer)).toBe(Infinity);
  });

  test('returns highest role position for member', () => {
    expect(getUserHighestRolePosition('user-1', mockServer)).toBe(5);
    expect(getUserHighestRolePosition('user-2', mockServer)).toBe(10);
  });

  test('returns 0 for member with no roles', () => {
    expect(getUserHighestRolePosition('user-3', mockServer)).toBe(0);
  });

  test('returns -1 for non-member or null server', () => {
    expect(getUserHighestRolePosition('unknown', mockServer)).toBe(-1);
    expect(getUserHighestRolePosition('user-1', null)).toBe(-1);
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
      everyone: { id: 'everyone', name: '@everyone', permissions: {} },
      admin: { id: 'admin', name: 'Admin', permissions: {} },
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

  test('finds multiple user mentions', () => {
    const result = parseMentions('@Alice and @Bob should check this', mockServer);
    expect(result.users).toHaveLength(2);
  });

  test('detects role mentions', () => {
    const result = parseMentions('Hey @Admin please review', mockServer);
    expect(result.roles).toHaveLength(1);
    expect(result.roles[0].id).toBe('admin');
  });

  test('returns empty for null content or null server', () => {
    const result1 = parseMentions(null, mockServer);
    expect(result1.users).toHaveLength(0);
    expect(result1.everyone).toBe(false);

    const result2 = parseMentions('Hello @Alice', null);
    expect(result2.users).toHaveLength(0);
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

  test('finds voice channel links', () => {
    const result = parseChannelLinks('Join #lounge for voice chat', mockServer, 'srv-1');
    expect(result.channels).toHaveLength(1);
    expect(result.channels[0].id).toBe('vc-1');
  });

  test('returns empty for null content or null server', () => {
    expect(parseChannelLinks(null, mockServer, 'srv-1').channels).toHaveLength(0);
    expect(parseChannelLinks('#general', null, 'srv-1').channels).toHaveLength(0);
  });
});

// ─── isPrivateUrl (SSRF protection) ──────────────────────────────────────────
describe('isPrivateUrl', () => {
  test('blocks localhost and loopback addresses', () => {
    expect(isPrivateUrl('http://localhost/admin')).toBe(true);
    expect(isPrivateUrl('http://127.0.0.1/admin')).toBe(true);
    expect(isPrivateUrl('http://127.0.0.2:8080')).toBe(true);
    expect(isPrivateUrl('http://0.0.0.0')).toBe(true);
  });

  test('blocks private IP ranges (10.x, 172.16-31.x, 192.168.x)', () => {
    expect(isPrivateUrl('http://10.0.0.1/internal')).toBe(true);
    expect(isPrivateUrl('http://172.16.0.1')).toBe(true);
    expect(isPrivateUrl('http://172.31.255.255')).toBe(true);
    expect(isPrivateUrl('http://192.168.1.1')).toBe(true);
  });

  test('blocks link-local and metadata endpoints', () => {
    expect(isPrivateUrl('http://169.254.169.254/latest/meta-data/')).toBe(true);
    expect(isPrivateUrl('http://169.254.1.1')).toBe(true);
  });

  test('blocks .local and .internal domains', () => {
    expect(isPrivateUrl('http://myapp.local/api')).toBe(true);
    expect(isPrivateUrl('http://service.internal')).toBe(true);
  });

  test('blocks non-http protocols', () => {
    expect(isPrivateUrl('ftp://example.com/file')).toBe(true);
    expect(isPrivateUrl('file:///etc/passwd')).toBe(true);
  });

  test('blocks IPv6 loopback and link-local', () => {
    expect(isPrivateUrl('http://[::1]/')).toBe(true);
    expect(isPrivateUrl('http://[fe80::1]/')).toBe(true);
    expect(isPrivateUrl('http://[fc00::1]/')).toBe(true);
    expect(isPrivateUrl('http://[fd00::1]/')).toBe(true);
  });

  test('allows legitimate public URLs', () => {
    expect(isPrivateUrl('https://example.com/image.png')).toBe(false);
    expect(isPrivateUrl('https://cdn.discord.com/attachments/file.jpg')).toBe(false);
    expect(isPrivateUrl('http://github.com')).toBe(false);
  });

  test('blocks invalid/malformed URLs', () => {
    expect(isPrivateUrl('not-a-url')).toBe(true);
    expect(isPrivateUrl('')).toBe(true);
  });
});

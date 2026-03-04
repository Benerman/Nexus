const {
  normalizeText,
  SpamTracker,
  evaluateMessage,
  containsInviteLink,
  countMentions,
  keywordMatches
} = require('../../server/automod');

// ─── normalizeText ───────────────────────────────────────────────────────────
describe('normalizeText', () => {
  test('returns empty string for null/undefined/non-string', () => {
    expect(normalizeText(null)).toBe('');
    expect(normalizeText(undefined)).toBe('');
    expect(normalizeText(123)).toBe('');
    expect(normalizeText('')).toBe('');
  });

  test('lowercases text', () => {
    expect(normalizeText('HELLO')).toBe('hello');
    expect(normalizeText('HeLLo WoRLd')).toBe('hello world');
  });

  test('strips zero-width characters', () => {
    expect(normalizeText('he\u200Bllo')).toBe('hello');
    expect(normalizeText('te\u200C\u200Dst')).toBe('test');
    expect(normalizeText('\uFEFFhello')).toBe('hello');
  });

  test('applies NFKC normalization', () => {
    // Fullwidth characters → ASCII
    expect(normalizeText('\uFF48\uFF45\uFF4C\uFF4C\uFF4F')).toBe('hello');
  });

  test('substitutes leetspeak characters', () => {
    expect(normalizeText('h3llo')).toBe('hello');
    expect(normalizeText('b4dw0rd')).toBe('badword');
    expect(normalizeText('$h1t')).toBe('shit');
    expect(normalizeText('h@ck')).toBe('hack');
    expect(normalizeText('7es7')).toBe('test');
  });

  test('collapses whitespace', () => {
    expect(normalizeText('hello   world')).toBe('hello world');
    expect(normalizeText('  hello  \t  world  ')).toBe('hello world');
  });

  test('handles combined evasion techniques', () => {
    expect(normalizeText('b\u200B4\u200Ddw\u200C0rd')).toBe('badword');
  });
});

// ─── keywordMatches ──────────────────────────────────────────────────────────
describe('keywordMatches', () => {
  test('substring match (default)', () => {
    expect(keywordMatches('this is badword here', 'badword', 'substring')).toBe(true);
    expect(keywordMatches('thisbadwordhere', 'badword', 'substring')).toBe(true);
    expect(keywordMatches('this is clean', 'badword', 'substring')).toBe(false);
  });

  test('whole word match', () => {
    expect(keywordMatches('this is badword here', 'badword', 'wholeWord')).toBe(true);
    expect(keywordMatches('thisbadwordhere', 'badword', 'wholeWord')).toBe(false);
    expect(keywordMatches('badword is here', 'badword', 'wholeWord')).toBe(true);
    expect(keywordMatches('here is badword', 'badword', 'wholeWord')).toBe(true);
  });

  test('case insensitive', () => {
    expect(keywordMatches('BADWORD', 'badword', 'substring')).toBe(true);
    expect(keywordMatches('BadWord', 'badword', 'wholeWord')).toBe(true);
  });
});

// ─── containsInviteLink ─────────────────────────────────────────────────────
describe('containsInviteLink', () => {
  test('detects Discord invite links', () => {
    expect(containsInviteLink('join discord.gg/abc123')).toBe(true);
    expect(containsInviteLink('https://discord.com/invite/abc123')).toBe(true);
    expect(containsInviteLink('https://discordapp.com/invite/abc123')).toBe(true);
  });

  test('detects generic invite links', () => {
    expect(containsInviteLink('https://example.com/invite/abc123')).toBe(true);
  });

  test('returns false for normal text', () => {
    expect(containsInviteLink('hello world')).toBe(false);
    expect(containsInviteLink('this is not an invite')).toBe(false);
  });

  test('returns false for partial matches', () => {
    expect(containsInviteLink('discord.gg is a domain')).toBe(false);
  });
});

// ─── countMentions ───────────────────────────────────────────────────────────
describe('countMentions', () => {
  test('counts user mentions', () => {
    expect(countMentions({ users: ['a', 'b', 'c'], roles: [], everyone: false })).toBe(3);
  });

  test('counts role mentions', () => {
    expect(countMentions({ users: [], roles: ['r1', 'r2'], everyone: false })).toBe(2);
  });

  test('counts @everyone', () => {
    expect(countMentions({ users: [], roles: [], everyone: true })).toBe(1);
  });

  test('counts combined', () => {
    expect(countMentions({ users: ['a'], roles: ['r1'], everyone: true })).toBe(3);
  });

  test('handles null/undefined', () => {
    expect(countMentions(null)).toBe(0);
    expect(countMentions(undefined)).toBe(0);
  });
});

// ─── SpamTracker ─────────────────────────────────────────────────────────────
describe('SpamTracker', () => {
  let tracker;

  beforeEach(() => {
    tracker = new SpamTracker();
  });

  test('allows messages under threshold', () => {
    const config = { maxMessages: 5, intervalMs: 5000, maxDuplicates: 3 };
    for (let i = 0; i < 5; i++) {
      expect(tracker.check('user1', `message ${i}`, config).spam).toBe(false);
    }
  });

  test('blocks message rate exceeding threshold', () => {
    const config = { maxMessages: 3, intervalMs: 5000, maxDuplicates: 10 };
    tracker.check('user1', 'msg 1', config);
    tracker.check('user1', 'msg 2', config);
    tracker.check('user1', 'msg 3', config);
    const result = tracker.check('user1', 'msg 4', config);
    expect(result.spam).toBe(true);
    expect(result.reason).toContain('too quickly');
  });

  test('blocks duplicate messages exceeding threshold', () => {
    const config = { maxMessages: 10, intervalMs: 5000, maxDuplicates: 2 };
    tracker.check('user1', 'same message', config);
    tracker.check('user1', 'same message', config);
    const result = tracker.check('user1', 'same message', config);
    expect(result.spam).toBe(true);
    expect(result.reason).toContain('Duplicate');
  });

  test('tracks users independently', () => {
    const config = { maxMessages: 2, intervalMs: 5000, maxDuplicates: 10 };
    tracker.check('user1', 'msg 1', config);
    tracker.check('user1', 'msg 2', config);
    // user1 is at limit
    expect(tracker.check('user1', 'msg 3', config).spam).toBe(true);
    // user2 is not
    expect(tracker.check('user2', 'msg 1', config).spam).toBe(false);
  });

  test('cleans up old entries', () => {
    const config = { maxMessages: 2, intervalMs: 100, maxDuplicates: 10 };
    tracker.check('user1', 'msg 1', config);
    tracker.check('user1', 'msg 2', config);

    // Manually age the entries
    const entries = tracker.entries.get('user1');
    entries.forEach(e => { e.timestamp -= 200; });

    // Should pass now because old entries are cleaned up
    expect(tracker.check('user1', 'msg 3', config).spam).toBe(false);
  });

  test('clear() removes all entries', () => {
    const config = { maxMessages: 5, intervalMs: 5000, maxDuplicates: 3 };
    tracker.check('user1', 'msg', config);
    tracker.clear();
    expect(tracker.entries.size).toBe(0);
  });
});

// ─── evaluateMessage ─────────────────────────────────────────────────────────
describe('evaluateMessage', () => {
  test('returns not blocked when no rules', () => {
    const result = evaluateMessage({
      content: 'hello', userId: 'u1', serverId: 's1', channelId: 'c1',
      mentions: { users: [], roles: [], everyone: false },
      userRoles: ['everyone'], rules: []
    });
    expect(result.blocked).toBe(false);
  });

  test('returns not blocked when all rules disabled', () => {
    const result = evaluateMessage({
      content: 'badword', userId: 'u1', serverId: 's1', channelId: 'c1',
      mentions: { users: [], roles: [], everyone: false },
      userRoles: ['everyone'],
      rules: [{
        id: 'r1', rule_type: 'keyword', enabled: false, action: 'block',
        config: { words: ['badword'], matchMode: 'substring' },
        exempt_roles: [], exempt_channels: []
      }]
    });
    expect(result.blocked).toBe(false);
  });

  // ── Keyword filter ──
  test('blocks keyword match (substring)', () => {
    const result = evaluateMessage({
      content: 'this has badword in it', userId: 'u1', serverId: 's1', channelId: 'c1',
      mentions: { users: [], roles: [], everyone: false },
      userRoles: ['everyone'],
      rules: [{
        id: 'r1', rule_type: 'keyword', enabled: true, action: 'block',
        config: { words: ['badword'], matchMode: 'substring' },
        exempt_roles: [], exempt_channels: []
      }]
    });
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('badword');
  });

  test('blocks keyword with leetspeak evasion', () => {
    const result = evaluateMessage({
      content: 'this has b4dw0rd in it', userId: 'u1', serverId: 's1', channelId: 'c1',
      mentions: { users: [], roles: [], everyone: false },
      userRoles: ['everyone'],
      rules: [{
        id: 'r1', rule_type: 'keyword', enabled: true, action: 'block',
        config: { words: ['badword'], matchMode: 'substring' },
        exempt_roles: [], exempt_channels: []
      }]
    });
    expect(result.blocked).toBe(true);
  });

  test('blocks keyword with zero-width char evasion', () => {
    const result = evaluateMessage({
      content: 'this has bad\u200Bword in it', userId: 'u1', serverId: 's1', channelId: 'c1',
      mentions: { users: [], roles: [], everyone: false },
      userRoles: ['everyone'],
      rules: [{
        id: 'r1', rule_type: 'keyword', enabled: true, action: 'block',
        config: { words: ['badword'], matchMode: 'substring' },
        exempt_roles: [], exempt_channels: []
      }]
    });
    expect(result.blocked).toBe(true);
  });

  test('does not block clean messages with keyword filter', () => {
    const result = evaluateMessage({
      content: 'this is a nice message', userId: 'u1', serverId: 's1', channelId: 'c1',
      mentions: { users: [], roles: [], everyone: false },
      userRoles: ['everyone'],
      rules: [{
        id: 'r1', rule_type: 'keyword', enabled: true, action: 'block',
        config: { words: ['badword', 'offensive'], matchMode: 'substring' },
        exempt_roles: [], exempt_channels: []
      }]
    });
    expect(result.blocked).toBe(false);
  });

  test('keyword whole word match does not catch substrings', () => {
    const result = evaluateMessage({
      content: 'scrapbooking is fun', userId: 'u1', serverId: 's1', channelId: 'c1',
      mentions: { users: [], roles: [], everyone: false },
      userRoles: ['everyone'],
      rules: [{
        id: 'r1', rule_type: 'keyword', enabled: true, action: 'block',
        config: { words: ['crap'], matchMode: 'wholeWord' },
        exempt_roles: [], exempt_channels: []
      }]
    });
    expect(result.blocked).toBe(false);
  });

  // ── Invite link filter ──
  test('blocks invite links', () => {
    const result = evaluateMessage({
      content: 'join my server discord.gg/abc123', userId: 'u1', serverId: 's1', channelId: 'c1',
      mentions: { users: [], roles: [], everyone: false },
      userRoles: ['everyone'],
      rules: [{
        id: 'r1', rule_type: 'invite_link', enabled: true, action: 'block',
        config: {}, exempt_roles: [], exempt_channels: []
      }]
    });
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('invite link');
  });

  // ── Mention spam filter ──
  test('blocks excessive mentions', () => {
    const result = evaluateMessage({
      content: 'hey everyone', userId: 'u1', serverId: 's1', channelId: 'c1',
      mentions: { users: ['a', 'b', 'c', 'd', 'e'], roles: ['r1', 'r2', 'r3', 'r4', 'r5', 'r6'], everyone: false },
      userRoles: ['everyone'],
      rules: [{
        id: 'r1', rule_type: 'mention_spam', enabled: true, action: 'block',
        config: { maxMentions: 10 }, exempt_roles: [], exempt_channels: []
      }]
    });
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('mentions');
  });

  test('allows mentions under threshold', () => {
    const result = evaluateMessage({
      content: 'hey', userId: 'u1', serverId: 's1', channelId: 'c1',
      mentions: { users: ['a', 'b'], roles: [], everyone: false },
      userRoles: ['everyone'],
      rules: [{
        id: 'r1', rule_type: 'mention_spam', enabled: true, action: 'block',
        config: { maxMentions: 10 }, exempt_roles: [], exempt_channels: []
      }]
    });
    expect(result.blocked).toBe(false);
  });

  // ── Role exemptions ──
  test('exempt role bypasses rules', () => {
    const result = evaluateMessage({
      content: 'this has badword', userId: 'u1', serverId: 's1', channelId: 'c1',
      mentions: { users: [], roles: [], everyone: false },
      userRoles: ['everyone', 'admin'],
      rules: [{
        id: 'r1', rule_type: 'keyword', enabled: true, action: 'block',
        config: { words: ['badword'], matchMode: 'substring' },
        exempt_roles: ['admin'], exempt_channels: []
      }]
    });
    expect(result.blocked).toBe(false);
  });

  // ── Channel exemptions ──
  test('exempt channel bypasses rules', () => {
    const result = evaluateMessage({
      content: 'this has badword', userId: 'u1', serverId: 's1', channelId: 'exempt-channel',
      mentions: { users: [], roles: [], everyone: false },
      userRoles: ['everyone'],
      rules: [{
        id: 'r1', rule_type: 'keyword', enabled: true, action: 'block',
        config: { words: ['badword'], matchMode: 'substring' },
        exempt_roles: [], exempt_channels: ['exempt-channel']
      }]
    });
    expect(result.blocked).toBe(false);
  });

  // ── Multiple rules: first match wins ──
  test('first matching rule wins', () => {
    const result = evaluateMessage({
      content: 'badword discord.gg/abc', userId: 'u1', serverId: 's1', channelId: 'c1',
      mentions: { users: [], roles: [], everyone: false },
      userRoles: ['everyone'],
      rules: [
        {
          id: 'r1', rule_type: 'keyword', enabled: true, action: 'block',
          config: { words: ['badword'], matchMode: 'substring' },
          exempt_roles: [], exempt_channels: []
        },
        {
          id: 'r2', rule_type: 'invite_link', enabled: true, action: 'delete',
          config: {}, exempt_roles: [], exempt_channels: []
        }
      ]
    });
    expect(result.blocked).toBe(true);
    expect(result.rule.id).toBe('r1');
  });

  // ── Config as JSON string (from DB) ──
  test('handles config as JSON string', () => {
    const result = evaluateMessage({
      content: 'this has badword', userId: 'u1', serverId: 's1', channelId: 'c1',
      mentions: { users: [], roles: [], everyone: false },
      userRoles: ['everyone'],
      rules: [{
        id: 'r1', rule_type: 'keyword', enabled: true, action: 'block',
        config: JSON.stringify({ words: ['badword'], matchMode: 'substring' }),
        exempt_roles: JSON.stringify([]), exempt_channels: JSON.stringify([])
      }]
    });
    expect(result.blocked).toBe(true);
  });

  // ── Empty keyword list ──
  test('keyword rule with empty word list does not block', () => {
    const result = evaluateMessage({
      content: 'anything here', userId: 'u1', serverId: 's1', channelId: 'c1',
      mentions: { users: [], roles: [], everyone: false },
      userRoles: ['everyone'],
      rules: [{
        id: 'r1', rule_type: 'keyword', enabled: true, action: 'block',
        config: { words: [], matchMode: 'substring' },
        exempt_roles: [], exempt_channels: []
      }]
    });
    expect(result.blocked).toBe(false);
  });
});

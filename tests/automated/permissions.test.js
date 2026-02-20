const { getUserPerms, getUserHighestRolePosition, parseMentions, parseChannelLinks } = require('../../server/utils');

// ─── Mock server factory ──────────────────────────────────────────────────────
function createMockServer(overrides = {}) {
  return {
    id: 'srv-1',
    ownerId: 'owner-1',
    members: {
      'owner-1': { username: 'Owner', roles: ['admin'] },
      'user-1': { username: 'Alice', roles: [] },
      'user-2': { username: 'Bob', roles: ['moderator'] },
      'user-3': { username: 'Charlie', roles: ['admin'] },
    },
    roles: {
      'everyone': {
        id: 'everyone', name: '@everyone', position: 0,
        permissions: {
          viewChannel: true, sendMessages: true, attachFiles: true,
          joinVoice: true, readHistory: true, addReactions: true,
          mentionEveryone: false, manageMessages: false, createInvite: true,
          sendTargetedSounds: false, manageEmojis: false
        }
      },
      'moderator': {
        id: 'moderator', name: 'Moderator', position: 1,
        permissions: { manageMessages: true, mentionEveryone: true }
      },
      'admin': {
        id: 'admin', name: 'Admin', position: 2,
        permissions: {
          viewChannel: true, sendMessages: true, attachFiles: true,
          joinVoice: true, readHistory: true, addReactions: true,
          mentionEveryone: true, manageMessages: true, manageChannels: true,
          manageRoles: true, manageServer: true, admin: true,
          createInvite: true, sendTargetedSounds: true, manageEmojis: true
        }
      },
    },
    channels: {
      text: [
        {
          id: 'ch-1', name: 'general', type: 'text',
          permissionOverrides: {}
        },
        {
          id: 'ch-2', name: 'private', type: 'text',
          permissionOverrides: {
            'everyone': { viewChannel: false },
            'moderator': { viewChannel: true }
          }
        },
      ],
      voice: [
        { id: 'vc-1', name: 'lounge', type: 'voice', permissionOverrides: {} },
      ],
    },
    ...overrides,
  };
}

// ─── getUserPerms ─────────────────────────────────────────────────────────────
describe('getUserPerms', () => {
  test('returns @everyone perms for non-member', () => {
    const server = createMockServer();
    const perms = getUserPerms('unknown-user', server);
    expect(perms.viewChannel).toBe(true);
    expect(perms.sendMessages).toBe(true);
    expect(perms.manageMessages).toBe(false);
  });

  test('returns @everyone perms for member with no extra roles', () => {
    const server = createMockServer();
    const perms = getUserPerms('user-1', server);
    expect(perms.viewChannel).toBe(true);
    expect(perms.sendMessages).toBe(true);
    expect(perms.manageMessages).toBe(false);
    expect(perms.mentionEveryone).toBe(false);
  });

  test('merges role perms on top of @everyone', () => {
    const server = createMockServer();
    const perms = getUserPerms('user-2', server); // has 'moderator' role
    expect(perms.viewChannel).toBe(true); // from @everyone
    expect(perms.manageMessages).toBe(true); // from moderator
    expect(perms.mentionEveryone).toBe(true); // from moderator
  });

  test('higher-position role overrides lower-position role', () => {
    const server = createMockServer();
    // Give user-2 both moderator and a custom low-priority role
    server.members['user-2'].roles = ['low-role', 'moderator'];
    server.roles['low-role'] = {
      id: 'low-role', name: 'LowRole', position: 0,
      permissions: { manageMessages: false }
    };
    const perms = getUserPerms('user-2', server);
    // moderator (position 1) should override low-role (position 0)
    expect(perms.manageMessages).toBe(true);
  });

  test('owner gets all permissions set to true', () => {
    const server = createMockServer();
    const perms = getUserPerms('owner-1', server);
    Object.values(perms).forEach(v => expect(v).toBe(true));
  });

  test('admin role gets all permissions set to true', () => {
    const server = createMockServer();
    const perms = getUserPerms('user-3', server); // has 'admin' role
    Object.values(perms).forEach(v => expect(v).toBe(true));
  });

  test('channel override denies permission for specific role', () => {
    const server = createMockServer();
    // Give user-1 a 'restricted' role that has a channel override denying sendMessages
    server.members['user-1'].roles = ['restricted'];
    server.roles['restricted'] = {
      id: 'restricted', name: 'Restricted', position: 1,
      permissions: { sendMessages: true }
    };
    // Add override on ch-1 that denies sendMessages for 'restricted' role
    server.channels.text[0].permissionOverrides = {
      'restricted': { sendMessages: false }
    };
    const perms = getUserPerms('user-1', server, 'ch-1');
    expect(perms.sendMessages).toBe(false);
  });

  test('channel override grants permission for specific role', () => {
    const server = createMockServer();
    // ch-2 grants viewChannel to moderator
    const perms = getUserPerms('user-2', server, 'ch-2');
    expect(perms.viewChannel).toBe(true);
  });

  test('returns empty object for null server', () => {
    const perms = getUserPerms('user-1', null);
    expect(perms).toEqual({});
  });
});

// ─── getUserHighestRolePosition ───────────────────────────────────────────────
describe('getUserHighestRolePosition', () => {
  test('owner returns Infinity', () => {
    const server = createMockServer();
    expect(getUserHighestRolePosition('owner-1', server)).toBe(Infinity);
  });

  test('non-member returns -1', () => {
    const server = createMockServer();
    expect(getUserHighestRolePosition('unknown', server)).toBe(-1);
  });

  test('returns highest role position for member', () => {
    const server = createMockServer();
    // user-2 has moderator (position 1)
    expect(getUserHighestRolePosition('user-2', server)).toBe(1);
    // user-3 has admin (position 2)
    expect(getUserHighestRolePosition('user-3', server)).toBe(2);
  });
});

// ─── parseMentions (role mentions) ────────────────────────────────────────────
describe('parseMentions - role mentions', () => {
  test('finds @roleName mentions', () => {
    const server = createMockServer();
    const result = parseMentions('Calling @Moderator for help', server);
    expect(result.roles).toHaveLength(1);
    expect(result.roles[0].id).toBe('moderator');
  });
});

// ─── parseChannelLinks ───────────────────────────────────────────────────────
describe('parseChannelLinks', () => {
  test('finds #channel-name in content', () => {
    const server = createMockServer();
    const result = parseChannelLinks('Check #general for updates', server, 'srv-1');
    expect(result.channels).toHaveLength(1);
    expect(result.channels[0].name).toBe('general');
    expect(result.channels[0].id).toBe('ch-1');
  });

  test('returns empty for non-matching content', () => {
    const server = createMockServer();
    const result = parseChannelLinks('No channel links here', server, 'srv-1');
    expect(result.channels).toHaveLength(0);
  });
});

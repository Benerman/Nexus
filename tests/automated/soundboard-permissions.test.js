/**
 * Tests for soundboard:delete permission logic from server/index.js:2497-2498.
 * Reuses getUserPerms from server/utils.js and the createMockServer factory
 * pattern from permissions.test.js.
 */

const { getUserPerms } = require('../../server/utils');

// ─── Mock server factory ────────────────────────────────────────────────────
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
      text: [{ id: 'ch-1', name: 'general', type: 'text', permissionOverrides: {} }],
      voice: [{ id: 'vc-1', name: 'lounge', type: 'voice', permissionOverrides: {} }],
    },
    soundboard: [
      { id: 'sound-1', name: 'Airhorn', created_by: 'user-1' },
      { id: 'sound-2', name: 'Bruh', created_by: 'user-2' },
    ],
    ...overrides,
  };
}

// Mirrors index.js:2497 — check if user uploaded the sound
function isUploader(soundboard, soundId, userId) {
  return (soundboard || []).some(s => s.id === soundId && s.created_by === userId);
}

// Mirrors index.js:2498 — combined permission check
function canDeleteSound(userId, server, soundId) {
  const perms = getUserPerms(userId, server);
  const uploaded = isUploader(server.soundboard, soundId, userId);
  return !!(perms.manageServer || perms.admin || uploaded);
}

// ─── isUploader ──────────────────────────────────────────────────────────────
describe('isUploader check', () => {
  test('user who uploaded is the uploader', () => {
    const soundboard = [{ id: 'sound-1', created_by: 'user-1' }];
    expect(isUploader(soundboard, 'sound-1', 'user-1')).toBe(true);
  });

  test('user who did not upload is not', () => {
    const soundboard = [{ id: 'sound-1', created_by: 'user-1' }];
    expect(isUploader(soundboard, 'sound-1', 'user-2')).toBe(false);
  });

  test('false for empty soundboard array', () => {
    expect(isUploader([], 'sound-1', 'user-1')).toBe(false);
  });

  test('false for null/undefined soundboard', () => {
    expect(isUploader(null, 'sound-1', 'user-1')).toBe(false);
    expect(isUploader(undefined, 'sound-1', 'user-1')).toBe(false);
  });

  test('false for non-existent soundId', () => {
    const soundboard = [{ id: 'sound-1', created_by: 'user-1' }];
    expect(isUploader(soundboard, 'sound-99', 'user-1')).toBe(false);
  });
});

// ─── canDeleteSound ──────────────────────────────────────────────────────────
describe('canDeleteSound combined logic', () => {
  test('admin can delete any sound', () => {
    const server = createMockServer();
    expect(canDeleteSound('user-3', server, 'sound-1')).toBe(true);
  });

  test('manageServer can delete any sound', () => {
    const server = createMockServer();
    // admin role has manageServer: true
    expect(canDeleteSound('user-3', server, 'sound-2')).toBe(true);
  });

  test('uploader can delete own sound without admin', () => {
    const server = createMockServer();
    // user-1 has no special roles but uploaded sound-1
    expect(canDeleteSound('user-1', server, 'sound-1')).toBe(true);
  });

  test('regular user cannot delete other\'s sound', () => {
    const server = createMockServer();
    // user-1 has no admin/manageServer and didn't upload sound-2
    expect(canDeleteSound('user-1', server, 'sound-2')).toBe(false);
  });

  test('server owner can delete any sound', () => {
    const server = createMockServer();
    // owner-1 implicitly gets all permissions
    expect(canDeleteSound('owner-1', server, 'sound-1')).toBe(true);
    expect(canDeleteSound('owner-1', server, 'sound-2')).toBe(true);
  });
});

// ─── Integration with getUserPerms ───────────────────────────────────────────
describe('integration with getUserPerms', () => {
  test('member with no roles cannot delete other\'s sound', () => {
    const server = createMockServer();
    const perms = getUserPerms('user-1', server);
    const uploaded = isUploader(server.soundboard, 'sound-2', 'user-1');
    expect(perms.manageServer).toBeFalsy();
    expect(perms.admin).toBeFalsy();
    expect(uploaded).toBe(false);
  });

  test('member with admin role can delete any sound', () => {
    const server = createMockServer();
    const perms = getUserPerms('user-3', server);
    expect(perms.admin).toBe(true);
    expect(perms.manageServer).toBe(true);
  });

  test('uploader can delete own sound with no special roles', () => {
    const server = createMockServer();
    const perms = getUserPerms('user-1', server);
    const uploaded = isUploader(server.soundboard, 'sound-1', 'user-1');
    expect(perms.admin).toBeFalsy();
    expect(uploaded).toBe(true);
  });
});

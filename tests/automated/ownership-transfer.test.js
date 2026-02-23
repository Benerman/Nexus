/**
 * Tests for ownership transfer priority logic used by admin:delete-user
 * and admin:assign-ownerless-servers. Logic extracted from server/index.js:4646-4651
 * and 4724-4726.
 */

// Mirrors index.js:4646-4651 and 4724-4726
function findNewOwner(members, excludeUserId) {
  const memberIds = Object.keys(members || {}).filter(id => id !== excludeUserId);
  if (memberIds.length === 0) return null;

  // Priority 1: admin
  let newOwnerId = memberIds.find(id => {
    const member = members[id];
    return member && member.roles && member.roles.includes('admin');
  });
  // Priority 2: non-guest
  if (!newOwnerId) newOwnerId = memberIds.find(id => !id.startsWith('guest:'));
  // Priority 3: any
  if (!newOwnerId) newOwnerId = memberIds[0];

  return newOwnerId || null;
}

// Mirrors index.js:4656 — check if new owner needs admin role
function needsAdminRole(member) {
  return !(member && member.roles && member.roles.includes('admin'));
}

// Mirrors index.js:4720 — check if server lacks a valid owner
function isServerOwnerless(ownerId, members) {
  if (!ownerId || ownerId === '') return true;
  const memberIds = Object.keys(members || {});
  return !memberIds.includes(ownerId);
}

// ─── findNewOwner ────────────────────────────────────────────────────────────
describe('findNewOwner — ownership transfer priority', () => {
  test('selects admin member first', () => {
    const members = {
      'user-1': { username: 'Alice', roles: [] },
      'user-2': { username: 'Bob', roles: ['admin'] },
      'user-3': { username: 'Charlie', roles: [] },
    };
    expect(findNewOwner(members, 'excluded')).toBe('user-2');
  });

  test('selects non-guest when no admin available', () => {
    const members = {
      'guest:1': { username: 'Guest1', roles: [] },
      'user-1': { username: 'Alice', roles: [] },
    };
    expect(findNewOwner(members, 'excluded')).toBe('user-1');
  });

  test('selects any member when only guests available', () => {
    const members = {
      'guest:1': { username: 'Guest1', roles: [] },
      'guest:2': { username: 'Guest2', roles: [] },
    };
    expect(findNewOwner(members, 'excluded')).toBe('guest:1');
  });

  test('excludes specified userId from candidates', () => {
    const members = {
      'user-1': { username: 'Alice', roles: ['admin'] },
      'user-2': { username: 'Bob', roles: [] },
    };
    expect(findNewOwner(members, 'user-1')).toBe('user-2');
  });

  test('returns null when no members remain after exclusion', () => {
    const members = {
      'user-1': { username: 'Alice', roles: [] },
    };
    expect(findNewOwner(members, 'user-1')).toBeNull();
  });

  test('returns null for empty members', () => {
    expect(findNewOwner({}, 'excluded')).toBeNull();
  });

  test('prefers admin > non-guest > guest (mixed)', () => {
    const members = {
      'guest:1': { username: 'Guest', roles: [] },
      'user-1': { username: 'Alice', roles: [] },
      'user-2': { username: 'Bob', roles: ['admin'] },
    };
    expect(findNewOwner(members, 'excluded')).toBe('user-2');
  });

  test('handles member with empty roles array', () => {
    const members = {
      'user-1': { username: 'Alice', roles: [] },
    };
    expect(findNewOwner(members, 'excluded')).toBe('user-1');
  });

  test('handles member with null/undefined roles gracefully', () => {
    const members = {
      'user-1': { username: 'Alice', roles: null },
      'user-2': { username: 'Bob' },
    };
    // Neither has admin role, so falls through to non-guest check
    expect(findNewOwner(members, 'excluded')).toBe('user-1');
  });
});

// ─── needsAdminRole ──────────────────────────────────────────────────────────
describe('needsAdminRole', () => {
  test('true when new owner lacks admin role', () => {
    expect(needsAdminRole({ roles: ['moderator'] })).toBe(true);
  });

  test('false when new owner already has admin', () => {
    expect(needsAdminRole({ roles: ['admin'] })).toBe(false);
  });

  test('true for empty roles', () => {
    expect(needsAdminRole({ roles: [] })).toBe(true);
  });
});

// ─── isServerOwnerless ───────────────────────────────────────────────────────
describe('isServerOwnerless', () => {
  test('true when ownerId is null', () => {
    expect(isServerOwnerless(null, { 'user-1': {} })).toBe(true);
  });

  test('true when ownerId is empty string', () => {
    expect(isServerOwnerless('', { 'user-1': {} })).toBe(true);
  });

  test('true when owner not in members', () => {
    expect(isServerOwnerless('deleted-user', { 'user-1': {} })).toBe(true);
  });

  test('false when owner exists in members', () => {
    expect(isServerOwnerless('user-1', { 'user-1': {} })).toBe(false);
  });

  test('true when members is empty', () => {
    expect(isServerOwnerless('user-1', {})).toBe(true);
  });
});

// ─── Personal server filtering ───────────────────────────────────────────────
describe('personal server filtering', () => {
  // Mirrors index.js:4717 — skip personal servers
  function shouldSkipServer(server) {
    return !!(server.isPersonal || (server.id && server.id.startsWith('personal:')));
  }

  test('skips servers with isPersonal=true', () => {
    expect(shouldSkipServer({ id: 'srv-1', isPersonal: true })).toBe(true);
  });

  test('skips servers with personal: prefix id', () => {
    expect(shouldSkipServer({ id: 'personal:user-1', isPersonal: false })).toBe(true);
  });

  test('does not skip normal servers', () => {
    expect(shouldSkipServer({ id: 'srv-1', isPersonal: false })).toBe(false);
  });
});

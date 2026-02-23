/**
 * Tests for platform admin determination logic and admin authorization guard.
 * Logic mirrors the inline code from server/index.js:1247-1248.
 */

// Pure function mirroring index.js:1247-1248
function isPlatformAdmin(username, configAdminUsername) {
  return !!(configAdminUsername && username &&
    username.toLowerCase() === configAdminUsername.toLowerCase());
}

// Admin handler authorization guard (mirrors `if (!user?.isPlatformAdmin) return`)
function isAuthorizedAdmin(user) {
  return !!(user && user.isPlatformAdmin);
}

// ─── isPlatformAdmin logic ───────────────────────────────────────────────────
describe('isPlatformAdmin logic', () => {
  test('true for exact case match', () => {
    expect(isPlatformAdmin('superadmin', 'superadmin')).toBe(true);
  });

  test('true for case-insensitive match (mixed cases)', () => {
    expect(isPlatformAdmin('SuperAdmin', 'superadmin')).toBe(true);
    expect(isPlatformAdmin('SUPERADMIN', 'superadmin')).toBe(true);
    expect(isPlatformAdmin('superadmin', 'SuperAdmin')).toBe(true);
  });

  test('false when username does not match', () => {
    expect(isPlatformAdmin('regularuser', 'superadmin')).toBe(false);
  });

  test('false when config admin username is empty string', () => {
    expect(isPlatformAdmin('superadmin', '')).toBe(false);
  });

  test('false when config admin username is null or undefined', () => {
    expect(isPlatformAdmin('superadmin', null)).toBe(false);
    expect(isPlatformAdmin('superadmin', undefined)).toBe(false);
  });
});

// ─── Admin handler authorization check ───────────────────────────────────────
describe('admin handler authorization check', () => {
  test('rejects null user', () => {
    expect(isAuthorizedAdmin(null)).toBe(false);
  });

  test('rejects undefined user', () => {
    expect(isAuthorizedAdmin(undefined)).toBe(false);
  });

  test('rejects user without isPlatformAdmin', () => {
    expect(isAuthorizedAdmin({ username: 'alice' })).toBe(false);
  });

  test('rejects user with isPlatformAdmin=false', () => {
    expect(isAuthorizedAdmin({ username: 'alice', isPlatformAdmin: false })).toBe(false);
  });

  test('authorizes user with isPlatformAdmin=true', () => {
    expect(isAuthorizedAdmin({ username: 'admin', isPlatformAdmin: true })).toBe(true);
  });
});

// ─── Self-deletion guard ─────────────────────────────────────────────────────
describe('self-deletion guard', () => {
  // Mirrors the guard: if (userId === user.id) return error
  function canDeleteUser(targetUserId, currentUser) {
    return targetUserId !== currentUser.id;
  }

  test('prevents deleting own account', () => {
    expect(canDeleteUser('user-1', { id: 'user-1' })).toBe(false);
  });

  test('allows deleting different user', () => {
    expect(canDeleteUser('user-2', { id: 'user-1' })).toBe(true);
  });
});

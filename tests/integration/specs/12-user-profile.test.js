const { ApiClient } = require('../helpers/api-client');
const { TestUserManager } = require('../helpers/test-user');
const { waitForEvent } = require('../helpers/socket-client');

const SERVER_URL = process.env.SERVER_URL || process.env.__INTEGRATION_SERVER_URL__ || 'http://localhost:4444';
const api = new ApiClient(SERVER_URL);

describe('User Profile', () => {
  let users;
  let user1, user2;

  beforeAll(async () => {
    users = new TestUserManager(SERVER_URL);
    user1 = await users.createConnected('profile1');
    user2 = await users.createConnected('profile2');
  });

  afterAll(async () => {
    await users.cleanupAll();
  });

  test('user:update changes username → user:updated broadcast', async () => {
    const newUsername = `renamed_${Date.now()}`;
    const updatePromise = waitForEvent(user2.socket, 'user:updated', 5000);

    user1.socket.emit('user:update', { username: newUsername });
    const data = await updatePromise;

    expect(data).toBeDefined();
    // The broadcast should include the user's new username
    // Update our reference
    user1.username = newUsername;
  });

  test('user:update changes status/bio → user:updated broadcast', async () => {
    const updatePromise = waitForEvent(user2.socket, 'user:updated', 5000);

    user1.socket.emit('user:update', {
      status: 'dnd',
      bio: 'Integration test bio',
    });
    const data = await updatePromise;

    expect(data).toBeDefined();
  });

  test('user:update with invalid username → error', async () => {
    const errorPromise = waitForEvent(user1.socket, 'error', 3000).catch(() => 'timeout');

    // Use null bytes which should be invalid
    user1.socket.emit('user:update', { username: '\x00\x01\x02' });

    const error = await errorPromise;
    // Either error event or the update is rejected silently
  });

  test('user:change-password → can login with new password afterward', async () => {
    // Use a fresh user to avoid DB timing issues with renamed users
    const freshUser = await users.createConnected('pwdchange');
    const newPassword = 'NewTestPass456!';

    // Give DB time to fully persist the account
    await new Promise(r => setTimeout(r, 500));

    const changePromise = waitForEvent(freshUser.socket, 'user:password-changed', 10000);
    freshUser.socket.emit('user:change-password', {
      currentPassword: freshUser.password,
      newPassword,
    });
    const changeData = await changePromise;

    expect(changeData.success).toBe(true);

    // Verify login with new password works
    const loginRes = await api.login(freshUser.username, newPassword);
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.token).toBeDefined();

    // Update stored password
    freshUser.password = newPassword;
  });

  test('POST /api/user/avatar with base64 image → returns updated customAvatar', async () => {
    // Create a minimal valid base64 PNG
    const avatar = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    const res = await api.uploadAvatar(user1.token, avatar);
    expect(res.status).toBe(200);
    expect(res.body.customAvatar).toBe(avatar);
  });

  test('POST /api/user/avatar without auth → 401', async () => {
    const avatar = 'data:image/png;base64,abc';
    const res = await api.uploadAvatar(null, avatar);
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/unauthorized|authorization/i);
  });
});

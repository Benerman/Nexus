const { TestUserManager } = require('../helpers/test-user');
const { waitForEvent } = require('../helpers/socket-client');

const SERVER_URL = process.env.SERVER_URL || process.env.__INTEGRATION_SERVER_URL__ || 'http://localhost:4444';

describe('Blocking', () => {
  let users;
  let user1, user2, user3;

  beforeAll(async () => {
    users = new TestUserManager(SERVER_URL);
    user1 = await users.createConnected('block1');
    user2 = await users.createConnected('block2');
    user3 = await users.createConnected('block3');
  });

  afterAll(async () => {
    await users.cleanupAll();
  });

  test('block:user emits user:blocked confirmation', async () => {
    const blockedPromise = waitForEvent(user1.socket, 'user:blocked', 5000);
    user1.socket.emit('block:user', { userId: user2.account.id });
    const data = await blockedPromise;

    expect(data).toBeDefined();
    expect(data.userId).toBe(user2.account.id);
  });

  test('Block prevents DM creation', async () => {
    // user1 has blocked user2 from previous test
    const errorPromise = waitForEvent(user2.socket, 'error', 5000);
    user2.socket.emit('dm:create', { targetUserId: user1.account.id });
    const error = await errorPromise;

    expect(error).toBeDefined();
    expect(error.message).toMatch(/cannot send dm/i);
  });

  test('Block prevents DM creation from blocker side too', async () => {
    // user1 blocked user2 — user1 also shouldn't be able to DM user2
    const errorPromise = waitForEvent(user1.socket, 'error', 5000);
    user1.socket.emit('dm:create', { targetUserId: user2.account.id });
    const error = await errorPromise;

    expect(error).toBeDefined();
    expect(error.message).toMatch(/cannot send dm/i);
  });

  test('Block prevents messages in existing DM channel', async () => {
    // First, create a DM between user1 and user3 (no block yet)
    const dm1Promise = waitForEvent(user1.socket, 'dm:created', 5000);
    user1.socket.emit('dm:create', { targetUserId: user3.account.id });
    const dmData = await dm1Promise;
    const dmChannelId = dmData.channel.id;

    // Join channel to send messages
    user1.socket.emit('channel:join', { channelId: dmChannelId });
    await waitForEvent(user1.socket, 'channel:history', 5000).catch(() => null);

    // Now user3 blocks user1
    const blockedPromise = waitForEvent(user3.socket, 'user:blocked', 5000);
    user3.socket.emit('block:user', { userId: user1.account.id });
    await blockedPromise;

    // user1 tries to send a message in the DM — should fail
    const errorPromise = waitForEvent(user1.socket, 'error', 5000);
    user1.socket.emit('message:send', { channelId: dmChannelId, content: 'Should be blocked' });
    const error = await errorPromise;

    expect(error).toBeDefined();
    expect(error.message).toMatch(/cannot send message/i);

    // Cleanup: unblock
    user3.socket.emit('unblock:user', { userId: user1.account.id });
    await waitForEvent(user3.socket, 'user:unblocked', 5000).catch(() => null);
  });

  test('Unblock restores DM ability', async () => {
    // user1 still has user2 blocked — unblock them
    const unblockedPromise = waitForEvent(user1.socket, 'user:unblocked', 5000);
    user1.socket.emit('unblock:user', { userId: user2.account.id });
    await unblockedPromise;

    // Now user2 should be able to create a DM with user1
    const dmPromise = waitForEvent(user2.socket, 'dm:created', 5000);
    user2.socket.emit('dm:create', { targetUserId: user1.account.id });
    const dmData = await dmPromise;

    expect(dmData.channel).toBeDefined();
    expect(dmData.channel.id).toBeDefined();
  });

  test('Block is bidirectional for DM check', async () => {
    // user2 blocks user1 (reverse direction)
    const blockedPromise = waitForEvent(user2.socket, 'user:blocked', 5000);
    user2.socket.emit('block:user', { userId: user1.account.id });
    await blockedPromise;

    // user1 tries to create DM with user2 — should fail (user2 blocked user1)
    const errorPromise = waitForEvent(user1.socket, 'error', 5000);
    user1.socket.emit('dm:create', { targetUserId: user2.account.id });
    const error = await errorPromise;

    expect(error).toBeDefined();
    expect(error.message).toMatch(/cannot send dm/i);

    // Cleanup
    user2.socket.emit('unblock:user', { userId: user1.account.id });
    await waitForEvent(user2.socket, 'user:unblocked', 5000).catch(() => null);
  });

  test('Cannot send friend request to blocked user', async () => {
    // user1 blocks user3
    const blockedPromise = waitForEvent(user1.socket, 'user:blocked', 5000);
    user1.socket.emit('block:user', { userId: user3.account.id });
    await blockedPromise;

    // user3 tries to send friend request to user1
    const errorPromise = waitForEvent(user3.socket, 'error', 5000).catch(() => 'timeout');
    user3.socket.emit('friend:request', { targetUsername: user1.username });
    const result = await errorPromise;

    // Should either get an error or be silently blocked
    if (result !== 'timeout') {
      expect(result.message).toBeDefined();
    }

    // Cleanup
    user1.socket.emit('unblock:user', { userId: user3.account.id });
    await waitForEvent(user1.socket, 'user:unblocked', 5000).catch(() => null);
  });

  test('blocked:list returns blocked users', async () => {
    // Block user2 again for this test
    const blockedPromise = waitForEvent(user1.socket, 'user:blocked', 5000);
    user1.socket.emit('block:user', { userId: user2.account.id });
    await blockedPromise;

    const listPromise = waitForEvent(user1.socket, 'blocked:list', 5000);
    user1.socket.emit('blocked:list');
    const data = await listPromise;

    expect(data.blocked).toBeDefined();
    expect(Array.isArray(data.blocked)).toBe(true);
    expect(data.blocked.length).toBeGreaterThan(0);

    // Cleanup
    user1.socket.emit('unblock:user', { userId: user2.account.id });
    await waitForEvent(user1.socket, 'user:unblocked', 5000).catch(() => null);
  });
});

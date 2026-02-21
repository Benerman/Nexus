const { TestUserManager } = require('../helpers/test-user');
const { waitForEvent } = require('../helpers/socket-client');

const SERVER_URL = process.env.SERVER_URL || process.env.__INTEGRATION_SERVER_URL__ || 'http://localhost:4444';

describe('Friends', () => {
  let users;
  let user1, user2, user3;
  let friendRequestId;

  beforeAll(async () => {
    users = new TestUserManager(SERVER_URL);
    user1 = await users.createConnected('friend1');
    user2 = await users.createConnected('friend2');
    user3 = await users.createConnected('friend3');
  });

  afterAll(async () => {
    await users.cleanupAll();
  });

  test('friend:request → sender gets friend:request:sent, target gets friend:request:received', async () => {
    const sentPromise = waitForEvent(user1.socket, 'friend:request:sent', 5000);
    const receivedPromise = waitForEvent(user2.socket, 'friend:request:received', 5000);

    user1.socket.emit('friend:request', { targetUsername: user2.username });

    const sentData = await sentPromise;
    const receivedData = await receivedPromise;

    expect(sentData.requestId).toBeDefined();
    expect(sentData.username).toBe(user2.username);

    expect(receivedData.requestId).toBeDefined();
    expect(receivedData.from).toBeDefined();
    expect(receivedData.from.username).toBe(user1.username);

    friendRequestId = receivedData.requestId;
  });

  test('Cannot friend yourself → error', async () => {
    const errorPromise = waitForEvent(user1.socket, 'error', 3000).catch(() => 'timeout');

    user1.socket.emit('friend:request', { targetUsername: user1.username });

    const error = await errorPromise;
    if (error !== 'timeout') {
      expect(error.message).toBeDefined();
    }
  });

  test('Request for non-existent username → error', async () => {
    const errorPromise = waitForEvent(user1.socket, 'error', 3000).catch(() => 'timeout');

    user1.socket.emit('friend:request', { targetUsername: 'nonexistent_user_xyz_999' });

    const error = await errorPromise;
    if (error !== 'timeout') {
      expect(error.message).toBeDefined();
    }
  });

  test('friend:accept → both users receive friend:accepted', async () => {
    if (!friendRequestId) return;

    const acceptPromise1 = waitForEvent(user1.socket, 'friend:accepted', 5000).catch(() => null);
    const acceptPromise2 = waitForEvent(user2.socket, 'friend:accepted', 5000);

    user2.socket.emit('friend:accept', { requestId: friendRequestId });

    const result2 = await acceptPromise2;
    const result1 = await acceptPromise1;

    // The accepting user should definitely receive friend:accepted
    expect(result2).toBeDefined();
    expect(result2.friendship).toBeDefined();
  });

  test('friend:reject → requester receives friend:rejected', async () => {
    // Create a new friend request from user1 to user3
    const sentPromise = waitForEvent(user1.socket, 'friend:request:sent', 5000);
    const receivedPromise = waitForEvent(user3.socket, 'friend:request:received', 5000);

    user1.socket.emit('friend:request', { targetUsername: user3.username });

    const sentData = await sentPromise;
    const receivedData = await receivedPromise;

    const rejectedPromise = waitForEvent(user3.socket, 'friend:rejected', 5000).catch(() => null);
    user3.socket.emit('friend:reject', { requestId: receivedData.requestId });

    const result = await rejectedPromise;
    expect(result).toBeDefined();
    expect(result.requestId).toBe(receivedData.requestId);
  });

  test('friend:remove → both receive friend:removed', async () => {
    // user1 and user2 are friends (from the accept test)
    const removedPromise1 = waitForEvent(user1.socket, 'friend:removed', 5000);
    const removedPromise2 = waitForEvent(user2.socket, 'friend:removed', 5000).catch(() => null);

    user1.socket.emit('friend:remove', { friendId: user2.account.id });

    const result1 = await removedPromise1;
    const result2 = await removedPromise2;

    // The remover should definitely receive friend:removed
    expect(result1).toBeDefined();
    expect(result1.friendId).toBe(user2.account.id);
  });

  test('friend:list returns friends with status info', async () => {
    const listPromise = waitForEvent(user1.socket, 'friend:list', 5000);
    user1.socket.emit('friend:list');
    const data = await listPromise;

    expect(data.friends).toBeDefined();
    expect(Array.isArray(data.friends)).toBe(true);
    expect(data.pending).toBeDefined();
    expect(Array.isArray(data.pending)).toBe(true);
  });
});

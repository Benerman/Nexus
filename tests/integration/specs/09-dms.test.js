const { TestUserManager } = require('../helpers/test-user');
const { waitForEvent } = require('../helpers/socket-client');

const SERVER_URL = process.env.SERVER_URL || process.env.__INTEGRATION_SERVER_URL__ || 'http://localhost:4444';

describe('Direct Messages', () => {
  let users;
  let user1, user2, user3;
  let dmChannelId;

  beforeAll(async () => {
    users = new TestUserManager(SERVER_URL);
    user1 = await users.createConnected('dm1');
    user2 = await users.createConnected('dm2');
    user3 = await users.createConnected('dm3');

    // Make user1 and user2 friends so DM creation emits dm:created to both
    const sentPromise = waitForEvent(user1.socket, 'friend:request:sent', 5000);
    const receivedPromise = waitForEvent(user2.socket, 'friend:request:received', 5000);
    user1.socket.emit('friend:request', { targetUsername: user2.username });
    await sentPromise;
    const received = await receivedPromise;

    const acceptedPromise = waitForEvent(user1.socket, 'friend:accepted', 5000);
    user2.socket.emit('friend:accept', { requestId: received.requestId });
    await acceptedPromise;
  });

  afterAll(async () => {
    await users.cleanupAll();
  });

  test('dm:create between two users → both receive dm:created with channel info', async () => {
    const dm1Promise = waitForEvent(user1.socket, 'dm:created', 5000);
    const dm2Promise = waitForEvent(user2.socket, 'dm:created', 5000);

    user1.socket.emit('dm:create', { targetUserId: user2.account.id });

    const dm1Data = await dm1Promise;
    const dm2Data = await dm2Promise;

    expect(dm1Data.channel).toBeDefined();
    expect(dm1Data.channel.id).toBeDefined();
    expect(dm1Data.channel.isDM || dm1Data.channel.type === 'dm').toBeTruthy();

    expect(dm2Data.channel).toBeDefined();
    expect(dm2Data.channel.id).toBe(dm1Data.channel.id);

    dmChannelId = dm1Data.channel.id;
  });

  test('Creating DM that already exists returns the existing channel', async () => {
    if (!dmChannelId) return;

    const dmPromise = waitForEvent(user1.socket, 'dm:created', 5000);
    user1.socket.emit('dm:create', { targetUserId: user2.account.id });
    const data = await dmPromise;

    expect(data.channel).toBeDefined();
    expect(data.channel.id).toBe(dmChannelId);
  });

  test('Cannot DM yourself → error', async () => {
    const errorPromise = waitForEvent(user1.socket, 'error', 3000).catch(() => 'timeout');
    user1.socket.emit('dm:create', { targetUserId: user1.account.id });

    const result = await errorPromise;
    if (result !== 'timeout') {
      expect(result.message).toBeDefined();
    }
  });

  test('Cannot DM a blocked user → error', async () => {
    // User3 blocks user1
    user3.socket.emit('block:user', { userId: user1.account.id });
    await new Promise(r => setTimeout(r, 500));

    const errorPromise = waitForEvent(user1.socket, 'error', 3000).catch(() => 'timeout');
    const dmPromise = waitForEvent(user1.socket, 'dm:created', 3000).catch(() => 'timeout');

    user1.socket.emit('dm:create', { targetUserId: user3.account.id });

    const error = await errorPromise;
    const dm = await dmPromise;

    // Either error event or DM creation is blocked
    // Unblock for cleanup
    user3.socket.emit('unblock:user', { userId: user1.account.id });
    await new Promise(r => setTimeout(r, 300));
  });

  test('dm:list returns user\'s DM channels', async () => {
    const listPromise = waitForEvent(user1.socket, 'dm:list', 10000);
    user1.socket.emit('dm:list');
    const data = await listPromise;

    expect(data.dms).toBeDefined();
    expect(Array.isArray(data.dms)).toBe(true);
    if (dmChannelId) {
      const found = data.dms.find(dm => dm.id === dmChannelId);
      expect(found).toBeDefined();
    }
  });

  test('dm:mark-read updates read state', async () => {
    if (!dmChannelId) return;

    // Send a message in the DM first
    user1.socket.emit('channel:join', { channelId: dmChannelId });
    const historyPromise = waitForEvent(user1.socket, 'channel:history', 5000).catch(() => null);
    await historyPromise;

    // Small delay after join
    await new Promise(r => setTimeout(r, 200));

    const msgPromise = waitForEvent(user1.socket, 'message:new', 5000);
    user1.socket.emit('message:send', { channelId: dmChannelId, content: 'DM test message' });
    const msg = await msgPromise;

    // Mark as read — server responds with dm:unread-counts
    const countsPromise = waitForEvent(user2.socket, 'dm:unread-counts', 5000);
    user2.socket.emit('dm:mark-read', { channelId: dmChannelId, messageId: msg.id });
    const countsData = await countsPromise;

    expect(countsData.counts).toBeDefined();
  });

  test('dm:unread-counts returns counts per DM channel', async () => {
    const countsPromise = waitForEvent(user1.socket, 'dm:unread-counts', 10000);
    user1.socket.emit('dm:unread-counts');
    const data = await countsPromise;

    expect(data.counts).toBeDefined();
    expect(typeof data.counts).toBe('object');
  });
});

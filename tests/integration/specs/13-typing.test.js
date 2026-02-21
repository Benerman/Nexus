const { TestUserManager } = require('../helpers/test-user');
const { waitForEvent } = require('../helpers/socket-client');

const SERVER_URL = process.env.SERVER_URL || process.env.__INTEGRATION_SERVER_URL__ || 'http://localhost:4444';

describe('Typing Indicators', () => {
  let users;
  let user1, user2;
  let channelId;

  beforeAll(async () => {
    users = new TestUserManager(SERVER_URL);
    user1 = await users.createConnected('type1');
    user2 = await users.createConnected('type2');

    // Find the default #general channel
    const server = user1.initData.server;
    const textChannels = server.channels?.text || [];
    const generalChannel = textChannels.find(c => c.name === 'general') || textChannels[0];
    if (!generalChannel) throw new Error('No text channel found');
    channelId = generalChannel.id;

    // Both users join the channel room
    user1.socket.emit('channel:join', { channelId });
    await waitForEvent(user1.socket, 'channel:history', 5000);
    user2.socket.emit('channel:join', { channelId });
    await waitForEvent(user2.socket, 'channel:history', 5000);
  });

  afterAll(async () => {
    await users.cleanupAll();
  });

  test('typing:start broadcasts typing:update to other channel members', async () => {
    const typingPromise = waitForEvent(user2.socket, 'typing:update', 5000);
    user1.socket.emit('typing:start', { channelId });
    const data = await typingPromise;

    expect(data).toBeDefined();
    expect(data.channelId).toBe(channelId);
    expect(data.typing).toBe(true);
    expect(data.user).toBeDefined();
  });

  test('typing:stop broadcasts typing:update to other channel members', async () => {
    const typingPromise = waitForEvent(user2.socket, 'typing:update', 5000);
    user1.socket.emit('typing:stop', { channelId });
    const data = await typingPromise;

    expect(data).toBeDefined();
    expect(data.channelId).toBe(channelId);
    expect(data.typing).toBe(false);
  });
});

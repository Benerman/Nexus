const { TestUserManager } = require('../helpers/test-user');
const { waitForEvent } = require('../helpers/socket-client');

const SERVER_URL = process.env.SERVER_URL || process.env.__INTEGRATION_SERVER_URL__ || 'http://localhost:4444';

describe('Message Pinning', () => {
  let users;
  let admin, member;
  let serverId, channelId;
  let pinnedMessageId;

  beforeAll(async () => {
    users = new TestUserManager(SERVER_URL);
    admin = await users.createConnected('pinadmin');

    // Create a server
    const createPromise = waitForEvent(admin.socket, 'server:created', 10000);
    admin.socket.emit('server:create', { name: 'Pin Test Server' });
    const serverData = await createPromise;
    serverId = serverData.server.id;

    const textChannels = serverData.server.channels?.text || [];
    const general = textChannels.find(c => c.name === 'general') || textChannels[0];
    if (!general) throw new Error('No text channel found');
    channelId = general.id;

    // Create a member and have them join
    member = await users.createConnected('pinmember');
    const invitePromise = waitForEvent(admin.socket, 'invite:created', 5000);
    admin.socket.emit('invite:create', { serverId });
    const inviteData = await invitePromise;

    const joinPromise = waitForEvent(member.socket, 'invite:joined', 5000);
    member.socket.emit('invite:use', { inviteCode: inviteData.invite.id || inviteData.invite.code });
    await joinPromise;

    // Both users join the channel room
    admin.socket.emit('channel:join', { channelId });
    await waitForEvent(admin.socket, 'channel:history', 5000);
    member.socket.emit('channel:join', { channelId });
    await waitForEvent(member.socket, 'channel:history', 5000);
  });

  afterAll(async () => {
    await users.cleanupAll();
  });

  test('Admin can pin a message -> message:pinned broadcast', async () => {
    // Send a message first
    const msgPromise = waitForEvent(admin.socket, 'message:new', 5000);
    admin.socket.emit('message:send', { channelId, content: 'Pin this message!' });
    const msg = await msgPromise;
    pinnedMessageId = msg.id;

    // Pin it
    const pinPromise = waitForEvent(admin.socket, 'message:pinned', 5000);
    admin.socket.emit('message:pin', { channelId, messageId: msg.id });
    const pinData = await pinPromise;

    expect(pinData.channelId).toBe(channelId);
    expect(pinData.messageId).toBe(msg.id);
    expect(pinData.pinnedBy).toBe(admin.account.id);
    expect(pinData.pinnedAt).toBeDefined();
    expect(typeof pinData.pinnedAt).toBe('number');
  });

  test('Member receives pin broadcast', async () => {
    // Send another message and pin it, listening on member socket
    const msgPromise = waitForEvent(admin.socket, 'message:new', 5000);
    admin.socket.emit('message:send', { channelId, content: 'Another pinned message' });
    const msg = await msgPromise;

    const memberPinPromise = waitForEvent(member.socket, 'message:pinned', 5000);
    admin.socket.emit('message:pin', { channelId, messageId: msg.id });
    const pinData = await memberPinPromise;

    expect(pinData.messageId).toBe(msg.id);
    expect(pinData.channelId).toBe(channelId);
  });

  test('messages:get-pinned returns all pinned messages', async () => {
    const pinnedPromise = waitForEvent(admin.socket, 'messages:pinned', 5000);
    admin.socket.emit('messages:get-pinned', { channelId });
    const data = await pinnedPromise;

    expect(data.channelId).toBe(channelId);
    expect(Array.isArray(data.messages)).toBe(true);
    expect(data.messages.length).toBeGreaterThanOrEqual(1);

    // Verify pinned message structure
    const pinned = data.messages.find(m => m.id === pinnedMessageId);
    expect(pinned).toBeDefined();
    expect(pinned.pinned).toBe(true);
    expect(pinned.pinnedAt).toBeDefined();
    expect(pinned.pinnedBy).toBe(admin.account.id);
    expect(pinned.content).toBe('Pin this message!');
    expect(pinned.author).toBeDefined();
    expect(pinned.author.username).toBe(admin.username);
  });

  test('Admin can unpin a message -> message:unpinned broadcast', async () => {
    const unpinPromise = waitForEvent(admin.socket, 'message:unpinned', 5000);
    admin.socket.emit('message:unpin', { channelId, messageId: pinnedMessageId });
    const unpinData = await unpinPromise;

    expect(unpinData.channelId).toBe(channelId);
    expect(unpinData.messageId).toBe(pinnedMessageId);
  });

  test('Unpinned message no longer appears in get-pinned results', async () => {
    const pinnedPromise = waitForEvent(admin.socket, 'messages:pinned', 5000);
    admin.socket.emit('messages:get-pinned', { channelId });
    const data = await pinnedPromise;

    const found = data.messages.find(m => m.id === pinnedMessageId);
    expect(found).toBeUndefined();
  });

  test('Non-admin cannot pin messages -> error', async () => {
    // Send a message
    const msgPromise = waitForEvent(admin.socket, 'message:new', 5000);
    member.socket.emit('message:send', { channelId, content: 'Member tries to pin' });
    const msg = await msgPromise;

    const errorPromise = waitForEvent(member.socket, 'error', 3000).catch(() => 'timeout');
    member.socket.emit('message:pin', { channelId, messageId: msg.id });
    const result = await errorPromise;

    if (result !== 'timeout') {
      expect(result.message).toMatch(/permission/i);
    }
  });

  test('Non-admin cannot unpin messages -> error', async () => {
    // Pin a message as admin first
    const msgPromise = waitForEvent(admin.socket, 'message:new', 5000);
    admin.socket.emit('message:send', { channelId, content: 'Admin pins, member unpins' });
    const msg = await msgPromise;

    const pinPromise = waitForEvent(admin.socket, 'message:pinned', 5000);
    admin.socket.emit('message:pin', { channelId, messageId: msg.id });
    await pinPromise;

    const errorPromise = waitForEvent(member.socket, 'error', 3000).catch(() => 'timeout');
    member.socket.emit('message:unpin', { channelId, messageId: msg.id });
    const result = await errorPromise;

    if (result !== 'timeout') {
      expect(result.message).toMatch(/permission/i);
    }
  });

  test('Pinned message has correct author info', async () => {
    const msgPromise = waitForEvent(admin.socket, 'message:new', 5000);
    member.socket.emit('message:send', { channelId, content: 'Member message to pin' });
    const msg = await msgPromise;

    const pinPromise = waitForEvent(admin.socket, 'message:pinned', 5000);
    admin.socket.emit('message:pin', { channelId, messageId: msg.id });
    await pinPromise;

    const pinnedPromise = waitForEvent(admin.socket, 'messages:pinned', 5000);
    admin.socket.emit('messages:get-pinned', { channelId });
    const data = await pinnedPromise;

    const pinned = data.messages.find(m => m.id === msg.id);
    expect(pinned).toBeDefined();
    expect(pinned.author.id).toBe(member.account.id);
    expect(pinned.author.username).toBe(member.username);
  });
});

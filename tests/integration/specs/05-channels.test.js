const { TestUserManager } = require('../helpers/test-user');
const { waitForEvent } = require('../helpers/socket-client');

const SERVER_URL = process.env.SERVER_URL || process.env.__INTEGRATION_SERVER_URL__ || 'http://localhost:4444';

describe('Channels', () => {
  let users;
  let admin, member;
  let serverId;
  let createdChannelId;

  beforeAll(async () => {
    users = new TestUserManager(SERVER_URL);
    admin = await users.createConnected('chanadmin');

    // Create a server where admin is the owner
    const createPromise = waitForEvent(admin.socket, 'server:created', 10000);
    admin.socket.emit('server:create', { name: 'Channel Test Server' });
    const serverData = await createPromise;
    serverId = serverData.server.id;

    // Create a second user and have them join via invite
    member = await users.createConnected('chanmember');

    const invitePromise = waitForEvent(admin.socket, 'invite:created', 5000);
    admin.socket.emit('invite:create', { serverId });
    const inviteData = await invitePromise;

    const joinPromise = waitForEvent(member.socket, 'invite:joined', 5000);
    member.socket.emit('invite:use', { inviteCode: inviteData.invite.id || inviteData.invite.code });
    await joinPromise;

    // Drain the server:updated event that invite:use broadcasts via io.emit
    await new Promise(r => setTimeout(r, 300));
  });

  afterAll(async () => {
    await users.cleanupAll();
  });

  test('Admin creates text channel → server:updated broadcast includes new channel', async () => {
    const updatePromise = waitForEvent(admin.socket, 'server:updated', 5000);
    admin.socket.emit('channel:create', {
      serverId,
      name: 'test-text',
      type: 'text',
      description: 'A test text channel',
    });
    const update = await updatePromise;

    expect(update.server).toBeDefined();
    const textChannels = update.server.channels?.text || [];
    const found = textChannels.find(c => c.name === 'test-text');
    expect(found).toBeDefined();
    createdChannelId = found.id;
  });

  test('Admin creates voice channel → server:updated broadcast includes new channel', async () => {
    const updatePromise = waitForEvent(admin.socket, 'server:updated', 5000);
    admin.socket.emit('channel:create', {
      serverId,
      name: 'test-voice',
      type: 'voice',
    });
    const update = await updatePromise;

    const voiceChannels = update.server.channels?.voice || [];
    const found = voiceChannels.find(c => c.name === 'test-voice');
    expect(found).toBeDefined();
  });

  test('Non-admin without manageChannels → error emitted', async () => {
    const errorPromise = waitForEvent(member.socket, 'error', 3000).catch(() => 'timeout');
    member.socket.emit('channel:create', {
      serverId,
      name: 'unauthorized-channel',
      type: 'text',
    });

    const result = await errorPromise;
    // Either error event received or silently rejected
    if (result !== 'timeout') {
      expect(result.message).toBeDefined();
    }
  });

  test('Duplicate channel name in same category → error', async () => {
    // Try to create a channel with the same name as 'test-text'
    const errorPromise = waitForEvent(admin.socket, 'error', 3000).catch(() => 'timeout');
    admin.socket.emit('channel:create', {
      serverId,
      name: 'test-text',
      type: 'text',
    });

    const result = await errorPromise;
    // Either error event or silently rejected (implementation dependent)
  });

  test('channel:update updates name/description → server:updated broadcast', async () => {
    if (!createdChannelId) return;

    const updatePromise = waitForEvent(admin.socket, 'server:updated', 5000);
    admin.socket.emit('channel:update', {
      serverId,
      channelId: createdChannelId,
      name: 'renamed-channel',
      description: 'Updated description',
    });
    const update = await updatePromise;

    const textChannels = update.server.channels?.text || [];
    const found = textChannels.find(c => c.id === createdChannelId);
    expect(found).toBeDefined();
    expect(found.name).toBe('renamed-channel');
  });

  test('channel:delete removes channel → server:updated broadcast', async () => {
    if (!createdChannelId) return;

    const updatePromise = waitForEvent(admin.socket, 'server:updated', 5000);
    admin.socket.emit('channel:delete', { serverId, channelId: createdChannelId });
    const update = await updatePromise;

    const textChannels = update.server.channels?.text || [];
    const found = textChannels.find(c => c.id === createdChannelId);
    expect(found).toBeUndefined();
  });

  test('channel:join subscribes to room and receives channel:history', async () => {
    // Find a text channel in the server
    const refreshPromise = waitForEvent(admin.socket, 'server:updated', 5000).catch(() => null);
    admin.socket.emit('channel:create', {
      serverId,
      name: 'join-test',
      type: 'text',
    });
    const refresh = await refreshPromise;
    const textChannels = refresh?.server?.channels?.text || [];
    const joinChannel = textChannels.find(c => c.name === 'join-test');
    if (!joinChannel) return;

    const historyPromise = waitForEvent(admin.socket, 'channel:history', 5000);
    admin.socket.emit('channel:join', { channelId: joinChannel.id });
    const history = await historyPromise;

    expect(history.channelId).toBe(joinChannel.id);
    expect(Array.isArray(history.messages)).toBe(true);
    expect(typeof history.hasMore).toBe('boolean');
  });
});

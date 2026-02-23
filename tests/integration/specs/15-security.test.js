const { TestUserManager } = require('../helpers/test-user');
const { ApiClient } = require('../helpers/api-client');
const { waitForEvent, createSocket } = require('../helpers/socket-client');

const SERVER_URL = process.env.SERVER_URL || process.env.__INTEGRATION_SERVER_URL__ || 'http://localhost:4444';

describe('Security', () => {
  let users;
  let api;
  let owner, member, outsider;
  let serverId, channelId;

  beforeAll(async () => {
    users = new TestUserManager(SERVER_URL);
    api = new ApiClient(SERVER_URL);

    // Create 3 users
    owner = await users.createConnected('secowner');
    member = await users.createConnected('secmember');
    outsider = await users.createConnected('secoutsider');

    // Owner creates a server
    const createPromise = waitForEvent(owner.socket, 'server:created', 10000);
    owner.socket.emit('server:create', { name: 'Security Test Server' });
    const createData = await createPromise;
    serverId = createData.server.id;

    const textChannels = createData.server.channels?.text || [];
    const generalChannel = textChannels.find(c => c.name === 'general') || textChannels[0];
    if (!generalChannel) throw new Error('No text channel found in new server');
    channelId = generalChannel.id;

    // Owner creates an invite and member joins
    const invitePromise = waitForEvent(owner.socket, 'invite:created', 5000);
    owner.socket.emit('invite:create', { serverId });
    const inviteData = await invitePromise;

    const joinPromise = waitForEvent(member.socket, 'invite:joined', 10000);
    member.socket.emit('invite:use', { inviteCode: inviteData.invite.id || inviteData.invite.code });
    await joinPromise;

    // Owner joins the channel so they can receive messages
    owner.socket.emit('channel:join', { channelId });
    await waitForEvent(owner.socket, 'channel:history', 5000);
  });

  afterAll(async () => {
    await users.cleanupAll();
  });

  // ─── Access Control Tests ──────────────────────────────────────────────────

  test('outsider cannot join a channel they do not belong to', async () => {
    let received = false;
    const handler = () => { received = true; };
    outsider.socket.on('channel:history', handler);

    outsider.socket.emit('channel:join', { channelId });

    await new Promise(r => setTimeout(r, 2000));
    outsider.socket.off('channel:history', handler);
    expect(received).toBe(false);
  });

  test('outsider cannot send messages to a channel they do not belong to', async () => {
    let ownerReceived = false;
    const handler = () => { ownerReceived = true; };
    owner.socket.on('message:new', handler);

    // Outsider should get an error
    const errorPromise = waitForEvent(outsider.socket, 'error', 3000).catch(() => null);
    outsider.socket.emit('message:send', { channelId, content: 'Unauthorized message' });

    const error = await errorPromise;
    if (error) {
      expect(error.message).toBeDefined();
    }

    // Owner should not have received the message
    await new Promise(r => setTimeout(r, 1000));
    owner.socket.off('message:new', handler);
    expect(ownerReceived).toBe(false);
  });

  test('member CAN join and read channel history', async () => {
    member.socket.emit('channel:join', { channelId });
    const history = await waitForEvent(member.socket, 'channel:history', 5000);
    expect(history).toBeDefined();
    expect(history.channelId).toBe(channelId);
  });

  test('member CAN send messages', async () => {
    const msgPromise = waitForEvent(owner.socket, 'message:new', 5000);
    member.socket.emit('message:send', { channelId, content: 'Authorized message from member' });
    const msg = await msgPromise;
    expect(msg).toBeDefined();
    expect(msg.content).toBe('Authorized message from member');
  });

  // ─── WebRTC Auth Tests ─────────────────────────────────────────────────────

  test('unauthenticated socket cannot relay WebRTC signaling', async () => {
    // Create a raw socket that does not go through join/auth
    const rawSocket = createSocket(SERVER_URL);

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        rawSocket.disconnect();
        reject(new Error('Raw socket failed to connect'));
      }, 5000);
      rawSocket.on('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      rawSocket.connect();
    });

    let ownerReceived = false;
    const handler = () => { ownerReceived = true; };
    owner.socket.on('webrtc:offer', handler);

    rawSocket.emit('webrtc:offer', { targetId: owner.socket.id, offer: { type: 'offer', sdp: 'fake' } });

    await new Promise(r => setTimeout(r, 2000));
    owner.socket.off('webrtc:offer', handler);
    rawSocket.disconnect();
    expect(ownerReceived).toBe(false);
  });

  // ─── Upload Size Limit Tests ───────────────────────────────────────────────

  test('avatar upload rejects oversized image', async () => {
    // Generate a >2MB base64 string
    const largeData = 'A'.repeat(3 * 1024 * 1024); // ~3MB of base64 data
    const oversizedAvatar = `data:image/png;base64,${largeData}`;

    const { status } = await api.postRaw('/api/user/avatar', { avatar: oversizedAvatar }, owner.token);
    expect(status).toBe(400);
  });

  test('server icon upload rejects oversized image', async () => {
    const largeData = 'A'.repeat(3 * 1024 * 1024);
    const oversizedIcon = `data:image/png;base64,${largeData}`;

    const { status } = await api.postRaw(`/api/server/${serverId}/icon`, { icon: oversizedIcon }, owner.token);
    expect(status).toBe(400);
  });
});

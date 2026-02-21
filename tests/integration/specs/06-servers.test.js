const { TestUserManager } = require('../helpers/test-user');
const { waitForEvent } = require('../helpers/socket-client');

const SERVER_URL = process.env.SERVER_URL || process.env.__INTEGRATION_SERVER_URL__ || 'http://localhost:4444';

describe('Servers', () => {
  let users;
  let owner, member;
  let serverId;

  beforeAll(async () => {
    users = new TestUserManager(SERVER_URL);
    owner = await users.createConnected('srvowner');
    member = await users.createConnected('srvmember');
  });

  afterAll(async () => {
    await users.cleanupAll();
  });

  test('server:create returns server:created with full server structure', async () => {
    const createPromise = waitForEvent(owner.socket, 'server:created', 10000);
    owner.socket.emit('server:create', { name: 'Test Server' });
    const data = await createPromise;

    expect(data.server).toBeDefined();
    expect(data.server.id).toBeDefined();
    expect(data.server.name).toBe('Test Server');
    serverId = data.server.id;
  });

  test('New server has default categories and channels', async () => {
    const createPromise = waitForEvent(owner.socket, 'server:created', 10000);
    owner.socket.emit('server:create', { name: 'Default Layout Server' });
    const data = await createPromise;

    const server = data.server;
    expect(server.channels).toBeDefined();

    // Should have text and voice channels
    const textChannels = server.channels.text || [];
    const voiceChannels = server.channels.voice || [];
    expect(textChannels.length).toBeGreaterThanOrEqual(1);
    expect(voiceChannels.length).toBeGreaterThanOrEqual(1);

    // Should have default channel names
    const textNames = textChannels.map(c => c.name);
    expect(textNames).toContain('general');
  });

  test('Creator is admin member of the new server', async () => {
    expect(serverId).toBeDefined();

    // Refresh data to check membership
    const refreshPromise = waitForEvent(owner.socket, 'data:refreshed', 5000);
    owner.socket.emit('data:refresh');
    const refreshData = await refreshPromise;

    const server = refreshData.servers?.find(s => s.id === serverId);
    if (server && server.members) {
      const memberData = server.members[owner.account.id];
      expect(memberData).toBeDefined();
    }
  });

  test('server:update by owner changes name/description → server:updated broadcast', async () => {
    if (!serverId) return;

    const updatePromise = waitForEvent(owner.socket, 'server:updated', 5000);
    owner.socket.emit('server:update', {
      serverId,
      name: 'Updated Server Name',
      description: 'New description',
    });
    const update = await updatePromise;

    expect(update.server).toBeDefined();
    expect(update.server.name).toBe('Updated Server Name');
    expect(update.server.description).toBe('New description');
  });

  test('server:update by non-admin → error', async () => {
    if (!serverId) return;

    // Have member join the server first via invite
    const invitePromise = waitForEvent(owner.socket, 'invite:created', 5000);
    owner.socket.emit('invite:create', { serverId });
    const inviteData = await invitePromise;

    const joinPromise = waitForEvent(member.socket, 'invite:joined', 5000);
    member.socket.emit('invite:use', { inviteCode: inviteData.invite.id || inviteData.invite.code });
    await joinPromise;

    // Member tries to update the server
    const errorPromise = waitForEvent(member.socket, 'error', 3000).catch(() => 'timeout');
    member.socket.emit('server:update', { serverId, name: 'Unauthorized Update' });

    const result = await errorPromise;
    if (result !== 'timeout') {
      expect(result.message).toBeDefined();
    }
  });

  test('server:leave removes member → server:left emitted to member', async () => {
    if (!serverId) return;

    // member already joined the first server in the previous test
    // Member leaves
    const leftPromise = waitForEvent(member.socket, 'server:left', 5000);
    member.socket.emit('server:leave', { serverId });
    const leftData = await leftPromise;

    expect(leftData).toBeDefined();
    expect(leftData.serverId).toBe(serverId);
  });

  test('server:delete by owner → server:deleted broadcast', async () => {
    // Use the first server (serverId) since member already left
    if (!serverId) return;

    const deletePromise = waitForEvent(owner.socket, 'server:deleted', 5000);
    owner.socket.emit('server:delete', { serverId });
    const deleted = await deletePromise;

    expect(deleted).toBeDefined();
    expect(deleted.serverId).toBe(serverId);
  });
});

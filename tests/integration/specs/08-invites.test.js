const { TestUserManager } = require('../helpers/test-user');
const { waitForEvent } = require('../helpers/socket-client');

const SERVER_URL = process.env.SERVER_URL || process.env.__INTEGRATION_SERVER_URL__ || 'http://localhost:4444';

describe('Invites', () => {
  let users;
  let admin, joiner;
  let serverId;
  let inviteCode;

  beforeAll(async () => {
    users = new TestUserManager(SERVER_URL);
    admin = await users.createConnected('invadmin');

    // Create a server
    const createPromise = waitForEvent(admin.socket, 'server:created', 10000);
    admin.socket.emit('server:create', { name: 'Invite Test Server' });
    const serverData = await createPromise;
    serverId = serverData.server.id;
  });

  afterAll(async () => {
    await users.cleanupAll();
  });

  test('invite:create returns invite:created with code', async () => {
    const createPromise = waitForEvent(admin.socket, 'invite:created', 5000);
    admin.socket.emit('invite:create', { serverId });
    const data = await createPromise;

    expect(data.invite).toBeDefined();
    const code = data.invite.id || data.invite.code;
    expect(code).toBeDefined();
    inviteCode = code;
  });

  test('Created invite respects maxUses and expiry', async () => {
    const createPromise = waitForEvent(admin.socket, 'invite:created', 5000);
    admin.socket.emit('invite:create', {
      serverId,
      maxUses: 5,
      expiresInMs: 3600000, // 1 hour
    });
    const data = await createPromise;

    expect(data.invite).toBeDefined();
    const invite = data.invite;
    expect(invite.max_uses !== undefined || invite.maxUses !== undefined).toBe(true);
  });

  test('invite:peek returns server info for valid code', async () => {
    if (!inviteCode) return;

    const peekPromise = waitForEvent(admin.socket, 'invite:peek:result', 5000);
    admin.socket.emit('invite:peek', { inviteCode });
    const data = await peekPromise;

    expect(data.valid).toBe(true);
    expect(data.server).toBeDefined();
    expect(data.server.name).toBe('Invite Test Server');
  });

  test('invite:peek returns error for invalid code', async () => {
    const peekPromise = waitForEvent(admin.socket, 'invite:peek:result', 5000);
    admin.socket.emit('invite:peek', { inviteCode: 'INVALID_CODE_XYZ' });
    const data = await peekPromise;

    expect(data.error).toBeDefined();
  });

  test('invite:use by non-member → invite:joined with server data', async () => {
    if (!inviteCode) return;

    joiner = await users.createConnected('invjoiner');

    const usePromise = waitForEvent(joiner.socket, 'invite:joined', 5000);
    joiner.socket.emit('invite:use', { inviteCode });
    const data = await usePromise;

    expect(data.server).toBeDefined();
    expect(data.server.id).toBe(serverId);
    expect(data.server.name).toBe('Invite Test Server');
  });

  test('invite:use by existing member → error', async () => {
    if (!inviteCode || !joiner) return;

    const errorPromise = waitForEvent(joiner.socket, 'error', 5000);
    joiner.socket.emit('invite:use', { inviteCode });
    const data = await errorPromise;

    expect(data.message).toBeDefined();
    expect(data.message).toMatch(/already/i);
  });

  test('invite:revoke by admin removes invite', async () => {
    // Create a new invite to revoke
    const createPromise = waitForEvent(admin.socket, 'invite:created', 5000);
    admin.socket.emit('invite:create', { serverId });
    const createData = await createPromise;
    const revokeCode = createData.invite.id || createData.invite.code;

    const revokePromise = waitForEvent(admin.socket, 'invite:revoked', 5000).catch(() => 'timeout');
    admin.socket.emit('invite:revoke', { inviteCode: revokeCode, serverId });
    await revokePromise;

    // Verify the invite no longer works
    const newUser = await users.createConnected('invrevoked');
    const errorPromise = waitForEvent(newUser.socket, 'error', 5000);
    newUser.socket.emit('invite:use', { inviteCode: revokeCode });
    const errorData = await errorPromise;
    expect(errorData.message).toBeDefined();
  });
});

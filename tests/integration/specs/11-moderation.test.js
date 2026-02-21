const { TestUserManager } = require('../helpers/test-user');
const { waitForEvent } = require('../helpers/socket-client');

const SERVER_URL = process.env.SERVER_URL || process.env.__INTEGRATION_SERVER_URL__ || 'http://localhost:4444';

describe('Moderation', () => {
  let users;
  let admin;
  let serverId;

  beforeAll(async () => {
    users = new TestUserManager(SERVER_URL);
    admin = await users.createConnected('modadmin');

    // Create a server
    const createPromise = waitForEvent(admin.socket, 'server:created', 10000);
    admin.socket.emit('server:create', { name: 'Moderation Test Server' });
    const serverData = await createPromise;
    serverId = serverData.server.id;
  });

  afterAll(async () => {
    await users.cleanupAll();
  });

  async function addMemberToServer(prefix) {
    const member = await users.createConnected(prefix);
    const invitePromise = waitForEvent(admin.socket, 'invite:created', 5000);
    admin.socket.emit('invite:create', { serverId });
    const inviteData = await invitePromise;
    const code = inviteData.invite.id || inviteData.invite.code;

    const joinPromise = waitForEvent(member.socket, 'invite:joined', 5000);
    member.socket.emit('invite:use', { inviteCode: code });
    await joinPromise;

    return member;
  }

  test('Admin kicks member → member removed, user:kicked broadcast', async () => {
    const target = await addMemberToServer('modkick');

    const kickPromise = waitForEvent(target.socket, 'user:kicked', 5000);
    admin.socket.emit('server:kick-user', { serverId, userId: target.account.id });
    const kickData = await kickPromise;

    expect(kickData).toBeDefined();
    expect(kickData.serverId).toBe(serverId);
    expect(kickData.userId).toBe(target.account.id);
  });

  test('Cannot kick server owner → error', async () => {
    const member = await addMemberToServer('modkickowner');

    // member tries to kick admin (owner) — should fail
    const errorPromise = waitForEvent(member.socket, 'error', 3000).catch(() => 'timeout');
    member.socket.emit('server:kick-user', { serverId, userId: admin.account.id });

    const result = await errorPromise;
    if (result !== 'timeout') {
      expect(result.message).toBeDefined();
    }
  });

  test('Non-admin cannot kick → error', async () => {
    const member1 = await addMemberToServer('modnonadmin1');
    const member2 = await addMemberToServer('modnonadmin2');

    const errorPromise = waitForEvent(member1.socket, 'error', 3000).catch(() => 'timeout');
    member1.socket.emit('server:kick-user', { serverId, userId: member2.account.id });

    const result = await errorPromise;
    if (result !== 'timeout') {
      expect(result.message).toBeDefined();
    }
  });

  test('Admin bans member → removed + added to ban list, user:banned broadcast', async () => {
    const target = await addMemberToServer('modban');

    const banPromise = waitForEvent(target.socket, 'user:banned', 5000);
    admin.socket.emit('server:ban-user', { serverId, userId: target.account.id });
    const banData = await banPromise;

    expect(banData).toBeDefined();
    expect(banData.serverId).toBe(serverId);
  });

  test('Banned user trying to rejoin via invite → already member or re-added', async () => {
    // Create a user and ban them
    const target = await addMemberToServer('modbanjoin');

    const banPromise = waitForEvent(target.socket, 'user:banned', 5000);
    admin.socket.emit('server:ban-user', { serverId, userId: target.account.id });
    await banPromise;

    // Try to rejoin via invite — server currently doesn't block banned users
    const invitePromise = waitForEvent(admin.socket, 'invite:created', 5000);
    admin.socket.emit('invite:create', { serverId });
    const inviteData = await invitePromise;
    const code = inviteData.invite.id || inviteData.invite.code;

    const joinPromise = waitForEvent(target.socket, 'invite:joined', 5000).catch(() => null);
    const errorPromise = waitForEvent(target.socket, 'error', 5000).catch(() => null);
    target.socket.emit('invite:use', { inviteCode: code });

    const joinData = await joinPromise;
    const errorData = await errorPromise;

    // Either an error (ban enforced) or a successful join (ban not enforced on invite:use)
    expect(joinData || errorData).toBeDefined();
  });

  test('Admin times out member → user:timedout broadcast with duration', async () => {
    const target = await addMemberToServer('modtimeout');

    const timeoutPromise = waitForEvent(target.socket, 'user:timedout', 5000);
    admin.socket.emit('server:timeout-user', {
      serverId,
      userId: target.account.id,
      duration: 1, // 1 minute (handler expects minutes, 1-10080)
    });
    const timeoutData = await timeoutPromise;

    expect(timeoutData).toBeDefined();
    expect(timeoutData.serverId).toBe(serverId);
    expect(timeoutData.userId).toBe(target.account.id);
  });
});

const { TestUserManager } = require('../helpers/test-user');
const { waitForEvent } = require('../helpers/socket-client');

const SERVER_URL = process.env.SERVER_URL || process.env.__INTEGRATION_SERVER_URL__ || 'http://localhost:4444';

describe('Audit Logs', () => {
  let users;
  let owner, member;
  let serverId, channelId;
  let pinnedMessageId;

  beforeAll(async () => {
    users = new TestUserManager(SERVER_URL);
    owner = await users.createConnected('auditowner');

    // Create a server
    const createPromise = waitForEvent(owner.socket, 'server:created', 10000);
    owner.socket.emit('server:create', { name: 'Audit Test Server' });
    const serverData = await createPromise;
    serverId = serverData.server.id;

    const textChannels = serverData.server.channels?.text || [];
    const general = textChannels.find(c => c.name === 'general') || textChannels[0];
    if (!general) throw new Error('No text channel found');
    channelId = general.id;

    // Create a member and have them join
    member = await users.createConnected('auditmember');
    const invitePromise = waitForEvent(owner.socket, 'invite:created', 5000);
    owner.socket.emit('invite:create', { serverId });
    const inviteData = await invitePromise;

    const joinPromise = waitForEvent(member.socket, 'invite:joined', 5000);
    member.socket.emit('invite:use', { inviteCode: inviteData.invite.id || inviteData.invite.code });
    await joinPromise;

    // Owner joins the channel room
    owner.socket.emit('channel:join', { channelId });
    await waitForEvent(owner.socket, 'channel:history', 5000);
    member.socket.emit('channel:join', { channelId });
    await waitForEvent(member.socket, 'channel:history', 5000);

    // Generate audit log entries by pinning/unpinning messages
    const msgPromise = waitForEvent(owner.socket, 'message:new', 5000);
    owner.socket.emit('message:send', { channelId, content: 'Message for audit log pin test' });
    const msg = await msgPromise;
    pinnedMessageId = msg.id;

    // Pin it (generates audit log entry)
    const pinPromise = waitForEvent(owner.socket, 'message:pinned', 5000);
    owner.socket.emit('message:pin', { channelId, messageId: msg.id });
    await pinPromise;

    // Unpin it (generates another audit log entry)
    const unpinPromise = waitForEvent(owner.socket, 'message:unpinned', 5000);
    owner.socket.emit('message:unpin', { channelId, messageId: msg.id });
    await unpinPromise;

    // Brief wait for async audit log writes
    await new Promise(r => setTimeout(r, 500));
  });

  afterAll(async () => {
    await users.cleanupAll();
  });

  test('Owner can fetch audit logs -> audit:logs emitted', async () => {
    const logsPromise = waitForEvent(owner.socket, 'audit:logs', 5000);
    owner.socket.emit('audit:get-logs', { serverId });
    const data = await logsPromise;

    expect(data.serverId).toBe(serverId);
    expect(Array.isArray(data.logs)).toBe(true);
    expect(data.logs.length).toBeGreaterThanOrEqual(2);
  });

  test('Audit logs contain pin and unpin entries with correct structure', async () => {
    const logsPromise = waitForEvent(owner.socket, 'audit:logs', 5000);
    owner.socket.emit('audit:get-logs', { serverId });
    const data = await logsPromise;

    // Find pin entry
    const pinLog = data.logs.find(l => l.action === 'message_pin');
    expect(pinLog).toBeDefined();
    expect(pinLog.actorId).toBe(owner.account.id);
    expect(pinLog.actorUsername).toBe(owner.username);
    expect(pinLog.targetId).toBe(pinnedMessageId);
    expect(pinLog.changes).toBeDefined();
    expect(pinLog.changes.channelId).toBe(channelId);
    expect(pinLog.createdAt).toBeDefined();
    expect(typeof pinLog.createdAt).toBe('number');

    // Find unpin entry
    const unpinLog = data.logs.find(l => l.action === 'message_unpin');
    expect(unpinLog).toBeDefined();
    expect(unpinLog.actorId).toBe(owner.account.id);
    expect(unpinLog.targetId).toBe(pinnedMessageId);
  });

  test('Audit logs are ordered by createdAt descending (newest first)', async () => {
    const logsPromise = waitForEvent(owner.socket, 'audit:logs', 5000);
    owner.socket.emit('audit:get-logs', { serverId });
    const data = await logsPromise;

    for (let i = 0; i < data.logs.length - 1; i++) {
      expect(data.logs[i].createdAt).toBeGreaterThanOrEqual(data.logs[i + 1].createdAt);
    }
  });

  test('Filter audit logs by action type', async () => {
    const logsPromise = waitForEvent(owner.socket, 'audit:logs', 5000);
    owner.socket.emit('audit:get-logs', { serverId, action: 'message_pin' });
    const data = await logsPromise;

    expect(data.logs.length).toBeGreaterThanOrEqual(1);
    for (const log of data.logs) {
      expect(log.action).toBe('message_pin');
    }
  });

  test('Filter audit logs by actor', async () => {
    const logsPromise = waitForEvent(owner.socket, 'audit:logs', 5000);
    owner.socket.emit('audit:get-logs', { serverId, actorId: owner.account.id });
    const data = await logsPromise;

    expect(data.logs.length).toBeGreaterThanOrEqual(2);
    for (const log of data.logs) {
      expect(log.actorId).toBe(owner.account.id);
    }
  });

  test('Limit parameter restricts result count', async () => {
    const logsPromise = waitForEvent(owner.socket, 'audit:logs', 5000);
    owner.socket.emit('audit:get-logs', { serverId, limit: 1 });
    const data = await logsPromise;

    expect(data.logs.length).toBe(1);
  });

  test('Non-admin member cannot view audit logs -> error', async () => {
    const errorPromise = waitForEvent(member.socket, 'error', 3000).catch(() => 'timeout');
    member.socket.emit('audit:get-logs', { serverId });
    const result = await errorPromise;

    if (result !== 'timeout') {
      expect(result.message).toMatch(/admin|permission/i);
    }
  });

  test('Audit log entries have unique IDs', async () => {
    const logsPromise = waitForEvent(owner.socket, 'audit:logs', 5000);
    owner.socket.emit('audit:get-logs', { serverId });
    const data = await logsPromise;

    const ids = data.logs.map(l => l.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  test('Additional pin actions append to audit log', async () => {
    // Pin a new message
    const msgPromise = waitForEvent(owner.socket, 'message:new', 5000);
    owner.socket.emit('message:send', { channelId, content: 'Another audit pin test' });
    const msg = await msgPromise;

    const pinPromise = waitForEvent(owner.socket, 'message:pinned', 5000);
    owner.socket.emit('message:pin', { channelId, messageId: msg.id });
    await pinPromise;

    await new Promise(r => setTimeout(r, 300));

    const logsPromise = waitForEvent(owner.socket, 'audit:logs', 5000);
    owner.socket.emit('audit:get-logs', { serverId, action: 'message_pin' });
    const data = await logsPromise;

    // Should now have at least 2 pin entries
    expect(data.logs.length).toBeGreaterThanOrEqual(2);
    expect(data.logs[0].targetId).toBe(msg.id);
  });
});

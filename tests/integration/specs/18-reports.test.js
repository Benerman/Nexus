const { TestUserManager } = require('../helpers/test-user');
const { waitForEvent, emitAndWait } = require('../helpers/socket-client');

const SERVER_URL = process.env.SERVER_URL || process.env.__INTEGRATION_SERVER_URL__ || 'http://localhost:4444';

describe('Reports', () => {
  let users;
  let admin, member;
  let serverId, channelId;
  let testMessageId;
  let reportId;

  beforeAll(async () => {
    users = new TestUserManager(SERVER_URL);
    admin = await users.createConnected('reportadmin');

    // Create a server
    const createPromise = waitForEvent(admin.socket, 'server:created', 10000);
    admin.socket.emit('server:create', { name: 'Report Test Server' });
    const serverData = await createPromise;
    serverId = serverData.server.id;

    // Find the default text channel
    const textChannels = serverData.server.channels?.text || [];
    const generalChannel = textChannels.find(c => c.name === 'general') || textChannels[0];
    if (!generalChannel) throw new Error('No text channel found');
    channelId = generalChannel.id;

    // Add member to server
    member = await users.createConnected('reportmember');
    const invitePromise = waitForEvent(admin.socket, 'invite:created', 5000);
    admin.socket.emit('invite:create', { serverId });
    const inviteData = await invitePromise;
    const code = inviteData.invite.id || inviteData.invite.code;

    const joinPromise = waitForEvent(member.socket, 'invite:joined', 5000);
    member.socket.emit('invite:use', { inviteCode: code });
    await joinPromise;

    // Join channels
    admin.socket.emit('channel:join', { channelId });
    await waitForEvent(admin.socket, 'channel:history', 5000).catch(() => null);
    member.socket.emit('channel:join', { channelId });
    await waitForEvent(member.socket, 'channel:history', 5000).catch(() => null);

    // Member sends a message to report
    const msgPromise = waitForEvent(admin.socket, 'message:new', 5000);
    member.socket.emit('message:send', { channelId, content: 'This is a reportable message' });
    const msg = await msgPromise;
    testMessageId = msg.id;
  });

  afterAll(async () => {
    await users.cleanupAll();
  });

  test('Report a user with message context', async () => {
    const reportPromise = waitForEvent(admin.socket, 'report:submitted', 5000);
    admin.socket.emit('report:user', {
      userId: member.account.id,
      reportType: 'harassment',
      description: 'Inappropriate behavior',
      messageId: testMessageId,
    });
    const data = await reportPromise;

    expect(data).toBeDefined();
    expect(data.reportId).toBeDefined();

    reportId = data.reportId;
  });

  test('moderation:get-reports returns reports with message content', async () => {
    if (!reportId) return;

    const result = await emitAndWait(admin.socket, 'moderation:get-reports', { serverId });

    expect(result.reports).toBeDefined();
    expect(Array.isArray(result.reports)).toBe(true);
    expect(result.reports.length).toBeGreaterThan(0);

    const report = result.reports.find(r => r.id === reportId);
    expect(report).toBeDefined();
    expect(report.reported_username).toBe(member.username);
    expect(report.reporter_username).toBe(admin.username);
    expect(report.message_content).toBe('This is a reportable message');
    expect(report.message_channel_id).toBe(channelId);
  });

  test('moderation:update-report to reviewed', async () => {
    if (!reportId) return;

    const result = await emitAndWait(admin.socket, 'moderation:update-report', {
      reportId,
      status: 'reviewed',
    });

    expect(result.success).toBe(true);
    expect(result.report).toBeDefined();
    expect(result.report.status).toBe('reviewed');
  });

  test('moderation:update-report to dismissed', async () => {
    // Create another report to dismiss
    const reportPromise = waitForEvent(admin.socket, 'report:submitted', 5000);
    admin.socket.emit('report:user', {
      userId: member.account.id,
      reportType: 'spam',
      description: 'Spam content',
    });
    const data = await reportPromise;

    const result = await emitAndWait(admin.socket, 'moderation:update-report', {
      reportId: data.reportId,
      status: 'dismissed',
    });

    expect(result.success).toBe(true);
    expect(result.report.status).toBe('dismissed');
  });

  test('moderation:update-report with invalid status fails', async () => {
    if (!reportId) return;

    const result = await emitAndWait(admin.socket, 'moderation:update-report', {
      reportId,
      status: 'invalid_status',
    });

    expect(result.error).toBeDefined();
  });

  test('Non-admin cannot view reports', async () => {
    const result = await emitAndWait(member.socket, 'moderation:get-reports', { serverId });

    expect(result.error).toBeDefined();
    expect(result.error).toMatch(/admin|permission/i);
  });

  test('Report without message ID still works', async () => {
    const reportPromise = waitForEvent(admin.socket, 'report:submitted', 5000);
    admin.socket.emit('report:user', {
      userId: member.account.id,
      reportType: 'other',
      description: 'General report without message',
    });
    const data = await reportPromise;

    expect(data.reportId).toBeDefined();

    // Verify it appears in reports
    const result = await emitAndWait(admin.socket, 'moderation:get-reports', { serverId });
    const report = result.reports.find(r => r.id === data.reportId);
    expect(report).toBeDefined();
    expect(report.message_content).toBeNull();
  });
});

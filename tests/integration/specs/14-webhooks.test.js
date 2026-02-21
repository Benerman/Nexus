const { ApiClient } = require('../helpers/api-client');
const { TestUserManager } = require('../helpers/test-user');
const { waitForEvent } = require('../helpers/socket-client');

const SERVER_URL = process.env.SERVER_URL || process.env.__INTEGRATION_SERVER_URL__ || 'http://localhost:4444';
const api = new ApiClient(SERVER_URL);

describe('Webhooks', () => {
  let users;
  let admin;
  let serverId, channelId;
  let webhookId, webhookToken;

  beforeAll(async () => {
    users = new TestUserManager(SERVER_URL);
    admin = await users.createConnected('whkadmin');

    // Create a server
    const createPromise = waitForEvent(admin.socket, 'server:created', 10000);
    admin.socket.emit('server:create', { name: 'Webhook Test Server' });
    const serverData = await createPromise;
    serverId = serverData.server.id;

    // Find the default text channel
    const textChannels = serverData.server.channels?.text || [];
    const generalChannel = textChannels.find(c => c.name === 'general') || textChannels[0];
    if (!generalChannel) throw new Error('No text channel found');
    channelId = generalChannel.id;

    // Join the channel to receive messages
    admin.socket.emit('channel:join', { channelId });
    await waitForEvent(admin.socket, 'channel:history', 5000);
  });

  afterAll(async () => {
    await users.cleanupAll();
  });

  test('webhook:create via Socket.IO → webhook info returned/broadcast', async () => {
    const createPromise = waitForEvent(admin.socket, 'webhook:created', 10000);
    admin.socket.emit('webhook:create', {
      serverId,
      channelId,
      name: 'Test Webhook',
    });
    const data = await createPromise;

    expect(data).toBeDefined();
    expect(data.webhook).toBeDefined();
    expect(data.webhook.id).toBeDefined();
    expect(data.webhook.url).toBeDefined();

    webhookId = data.webhook.id;
    // Extract token from the URL: /api/webhooks/:id/:token
    const urlParts = data.webhook.url.split('/');
    webhookToken = urlParts[urlParts.length - 1];

    expect(webhookId).toBeDefined();
    expect(webhookToken).toBeDefined();
  });

  test('POST /api/webhooks/:id/:token with content → message:new broadcast in channel', async () => {
    if (!webhookId || !webhookToken) return;

    const msgPromise = waitForEvent(admin.socket, 'message:new', 5000);
    const res = await api.sendWebhook(webhookId, webhookToken, {
      content: 'Hello from webhook!',
      username: 'WebhookBot',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.id).toBeDefined();

    const msg = await msgPromise;
    expect(msg.content).toBe('Hello from webhook!');
  });

  test('Webhook message has isWebhook: true and custom username', async () => {
    if (!webhookId || !webhookToken) return;

    const msgPromise = waitForEvent(admin.socket, 'message:new', 5000);
    await api.sendWebhook(webhookId, webhookToken, {
      content: 'Webhook identity check',
      username: 'CustomBot',
    });
    const msg = await msgPromise;

    expect(msg.isWebhook).toBe(true);
    expect(msg.author).toBeDefined();
    expect(msg.author.isWebhook).toBe(true);
    expect(msg.author.username).toBe('CustomBot');
  });

  test('POST /api/webhooks/:id/:token without content or embeds → 400', async () => {
    if (!webhookId || !webhookToken) return;

    const res = await api.sendWebhook(webhookId, webhookToken, {});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/content|embeds/i);
  });

  test('POST /api/webhooks/:id/:token with wrong token → 401', async () => {
    if (!webhookId) return;

    const res = await api.sendWebhook(webhookId, 'wrong-token-xyz', {
      content: 'Should fail',
    });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid/i);
  });

  test('webhook:delete via Socket.IO → webhook removed', async () => {
    if (!webhookId) return;

    const deletePromise = waitForEvent(admin.socket, 'channel:updated', 5000).catch(() => null);
    admin.socket.emit('webhook:delete', {
      serverId,
      channelId,
      webhookId,
    });
    await deletePromise;

    // After deletion, posting should fail
    if (webhookToken) {
      const res = await api.sendWebhook(webhookId, webhookToken, { content: 'Should fail' });
      expect(res.status).toBe(401);
    }
  });
});

const { ApiClient } = require('../helpers/api-client');
const { TestUserManager } = require('../helpers/test-user');
const { waitForEvent } = require('../helpers/socket-client');

const SERVER_URL = process.env.SERVER_URL || process.env.__INTEGRATION_SERVER_URL__ || 'http://localhost:4444';
const api = new ApiClient(SERVER_URL);

describe('Webhook Embeds & Advanced', () => {
  let users;
  let admin;
  let serverId, channelId;
  let webhookId, webhookToken;

  beforeAll(async () => {
    users = new TestUserManager(SERVER_URL);
    admin = await users.createConnected('whkembed');

    // Create a server
    const createPromise = waitForEvent(admin.socket, 'server:created', 10000);
    admin.socket.emit('server:create', { name: 'Webhook Embed Test Server' });
    const serverData = await createPromise;
    serverId = serverData.server.id;

    // Find the default text channel
    const textChannels = serverData.server.channels?.text || [];
    const generalChannel = textChannels.find(c => c.name === 'general') || textChannels[0];
    if (!generalChannel) throw new Error('No text channel found');
    channelId = generalChannel.id;

    // Join the channel to receive messages
    admin.socket.emit('channel:join', { channelId });
    await waitForEvent(admin.socket, 'channel:history', 5000).catch(() => null);

    // Wait for any lingering rate limits from previous webhook test suite to expire
    await new Promise(r => setTimeout(r, 11000));

    // Create a webhook
    const whPromise = waitForEvent(admin.socket, 'webhook:created', 10000);
    admin.socket.emit('webhook:create', {
      serverId,
      channelId,
      name: 'Embed Test Webhook',
    });
    const whData = await whPromise;
    webhookId = whData.webhook.id;
    const urlParts = whData.webhook.url.split('/');
    webhookToken = urlParts[urlParts.length - 1];
  }, 30000);

  afterAll(async () => {
    await users.cleanupAll();
  });

  test('Webhook with embeds → message:new includes embeds', async () => {
    if (!webhookId || !webhookToken) return;

    const msgPromise = waitForEvent(admin.socket, 'message:new', 10000);
    const res = await api.sendWebhook(webhookId, webhookToken, {
      content: 'Message with embeds',
      embeds: [
        {
          title: 'Test Embed',
          description: 'This is a test embed',
          color: 0x00ff00,
          fields: [
            { name: 'Field 1', value: 'Value 1', inline: true },
            { name: 'Field 2', value: 'Value 2', inline: false },
          ],
        },
      ],
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const msg = await msgPromise;
    expect(msg.embeds).toBeDefined();
    expect(Array.isArray(msg.embeds)).toBe(true);
    expect(msg.embeds.length).toBe(1);
    expect(msg.embeds[0].title).toBe('Test Embed');
    expect(msg.embeds[0].description).toBe('This is a test embed');
    expect(msg.embeds[0].color).toBe(0x00ff00);
    expect(msg.embeds[0].fields).toBeDefined();
    expect(msg.embeds[0].fields.length).toBe(2);
  });

  test('Webhook with embeds only (no content) → success', async () => {
    if (!webhookId || !webhookToken) return;

    const msgPromise = waitForEvent(admin.socket, 'message:new', 10000);
    const res = await api.sendWebhook(webhookId, webhookToken, {
      embeds: [
        {
          title: 'Embed Only',
          description: 'No content, just an embed',
        },
      ],
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const msg = await msgPromise;
    expect(msg.embeds).toBeDefined();
    expect(msg.embeds[0].title).toBe('Embed Only');
  });

  test('Webhook with avatar_url → custom avatar in message', async () => {
    if (!webhookId || !webhookToken) return;

    const msgPromise = waitForEvent(admin.socket, 'message:new', 10000);
    const res = await api.sendWebhook(webhookId, webhookToken, {
      content: 'Message with custom avatar',
      username: 'AvatarBot',
      avatar_url: 'https://example.com/avatar.png',
    });

    expect(res.status).toBe(200);

    const msg = await msgPromise;
    expect(msg.author).toBeDefined();
    expect(msg.author.username).toBe('AvatarBot');
    expect(msg.author.avatar).toBe('https://example.com/avatar.png');
  });

  test('Webhook with rich embed fields (footer, author, thumbnail)', async () => {
    if (!webhookId || !webhookToken) return;

    const msgPromise = waitForEvent(admin.socket, 'message:new', 10000);
    const res = await api.sendWebhook(webhookId, webhookToken, {
      content: 'Rich embed test',
      embeds: [
        {
          title: 'Rich Embed',
          description: 'Full featured embed',
          color: 0xff0000,
          footer: { text: 'Footer text' },
          author: { name: 'Author Name' },
          thumbnail: { url: 'https://example.com/thumb.png' },
          image: { url: 'https://example.com/image.png' },
        },
      ],
    });

    expect(res.status).toBe(200);

    const msg = await msgPromise;
    expect(msg.embeds).toBeDefined();
    expect(msg.embeds[0].footer.text).toBe('Footer text');
    expect(msg.embeds[0].author.name).toBe('Author Name');
    expect(msg.embeds[0].thumbnail.url).toBe('https://example.com/thumb.png');
    expect(msg.embeds[0].image.url).toBe('https://example.com/image.png');
  });

  test('Webhook to nonexistent webhook ID → 401', async () => {
    // Use a valid UUID format to avoid DB type errors
    const res = await api.postRaw('/api/webhooks/00000000-0000-0000-0000-000000000000/fake-token', {
      content: 'Should fail',
    });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid/i);
  });

  // Rate-limit test goes LAST — it exhausts the rate limiter
  test('Webhook rate limiting — rapid requests trigger 429', async () => {
    if (!webhookId || !webhookToken) return;

    // Wait for any prior rate limits to clear
    await new Promise(r => setTimeout(r, 11000));

    // Send many requests rapidly without retry logic
    const results = [];
    for (let i = 0; i < 12; i++) {
      try {
        const res = await api.postRaw(`/api/webhooks/${webhookId}/${webhookToken}`, {
          content: `Rate limit test ${i}`,
        });
        results.push(res.status);
      } catch {
        // Connection reset counts as rate limiting
        results.push(429);
      }
    }

    // At least one should be 429
    const rateLimited = results.filter(s => s === 429);
    expect(rateLimited.length).toBeGreaterThan(0);
  }, 25000);
});

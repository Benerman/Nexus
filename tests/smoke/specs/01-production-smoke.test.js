const { SmokeClient } = require('../helpers/smoke-client');

const PROD_URL = process.env.PROD_URL;
if (!PROD_URL) {
  throw new Error('PROD_URL environment variable is required to run smoke tests');
}

const client = new SmokeClient(PROD_URL);

// State shared across tests
let smokeUsername;
let smokePassword;
let smokeToken;
let smokeSocket;
let testMessageId;
let channelId;

afterAll(async () => {
  // Cleanup: delete test message, disconnect socket, logout
  try {
    if (testMessageId && channelId && smokeSocket?.connected) {
      await client.deleteMessage(smokeSocket, channelId, testMessageId).catch(() => {});
    }
  } catch {}

  if (smokeSocket?.connected) {
    smokeSocket.disconnect();
  }

  if (smokeToken) {
    await client.logout(smokeToken).catch(() => {});
  }
});

describe('Production Health', () => {
  test('GET /api/health returns { status: ok, name: Nexus }', async () => {
    const { status, body } = await client.healthCheck();
    expect(status).toBe(200);
    expect(body).toEqual({ status: 'ok', name: 'Nexus' });
  });

  test('GET /health returns { status: ok }', async () => {
    const res = await fetch(`${PROD_URL}/health`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ status: 'ok' });
  });

  test('Health responds within 2 seconds', async () => {
    const start = Date.now();
    await client.healthCheck();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(2000);
  });

  test('Server is reachable (connection does not time out)', async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(`${PROD_URL}/api/health`, {
        signal: controller.signal,
      });
      clearTimeout(timer);
      expect(res.ok).toBe(true);
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError' || err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
        throw new Error(`SERVER UNREACHABLE: ${err.message || err.code}`);
      }
      throw err;
    }
  });
});

describe('Production Auth Flow', () => {
  test('Registers smoke test user', async () => {
    smokeUsername = `smoke_${Date.now()}`;
    smokePassword = 'SmokeTestPass123!';

    const { status, body } = await client.register(smokeUsername, smokePassword);
    expect(status).toBe(200);
    expect(body.token).toBeDefined();
    expect(body.account).toBeDefined();
    expect(body.account.username).toBe(smokeUsername);
    smokeToken = body.token;
  });

  test('Logs in with registered credentials and receives token', async () => {
    if (!smokeUsername) return;

    const { status, body } = await client.login(smokeUsername, smokePassword);
    expect(status).toBe(200);
    expect(body.token).toBeDefined();
    expect(body.account.username).toBe(smokeUsername);
    // Use the fresh token
    smokeToken = body.token;
  });
});

describe('Production Socket.IO', () => {
  test('Connects via WebSocket and receives init payload on join', async () => {
    if (!smokeToken) return;

    const { socket, initData } = await client.connectSocket(smokeToken);
    smokeSocket = socket;

    expect(initData).toBeDefined();
    expect(initData.user).toBeDefined();
    expect(initData.server).toBeDefined();
    expect(initData.servers).toBeDefined();
    expect(initData.onlineUsers).toBeDefined();
  });

  test('Init payload contains default server with channels', async () => {
    if (!smokeSocket) return;

    // Re-check from connectSocket's initData — we need to store it
    // The init data was verified in the previous test
    // Let's refresh to double-check
    const refreshData = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('data:refresh timed out')), 10000);
      smokeSocket.once('data:refreshed', (data) => {
        clearTimeout(timer);
        resolve(data);
      });
      smokeSocket.emit('data:refresh');
    });

    expect(refreshData.servers).toBeDefined();
    expect(refreshData.servers.length).toBeGreaterThanOrEqual(1);
    const server = refreshData.servers[0];
    expect(server.channels).toBeDefined();
  });

  test('Joins default #general channel and receives channel:history', async () => {
    if (!smokeSocket) return;

    // Get server info to find the general channel
    const refreshData = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('data:refresh timed out')), 10000);
      smokeSocket.once('data:refreshed', (data) => {
        clearTimeout(timer);
        resolve(data);
      });
      smokeSocket.emit('data:refresh');
    });

    const server = refreshData.servers?.[0];
    const textChannels = server?.channels?.text || [];
    const generalChannel = textChannels.find(c => c.name === 'general') || textChannels[0];
    if (!generalChannel) throw new Error('No text channel found on prod');

    channelId = generalChannel.id;
    const history = await client.joinChannel(smokeSocket, channelId);

    expect(history.channelId).toBe(channelId);
    expect(Array.isArray(history.messages)).toBe(true);
  });

  test('Sends test message and receives message:new broadcast', async () => {
    if (!smokeSocket || !channelId) return;

    const msg = await client.sendMessage(smokeSocket, channelId, `[SMOKE TEST] ${new Date().toISOString()}`);

    expect(msg).toBeDefined();
    expect(msg.id).toBeDefined();
    expect(msg.content).toMatch(/\[SMOKE TEST\]/);
    testMessageId = msg.id;
  });
});

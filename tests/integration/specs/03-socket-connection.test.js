const { ApiClient } = require('../helpers/api-client');
const { connectAndJoin, createSocket, waitForEvent } = require('../helpers/socket-client');
const { TestUserManager } = require('../helpers/test-user');

const SERVER_URL = process.env.SERVER_URL || process.env.__INTEGRATION_SERVER_URL__ || 'http://localhost:4444';
const api = new ApiClient(SERVER_URL);

describe('Socket.IO Connection', () => {
  let users;

  beforeAll(() => {
    users = new TestUserManager(SERVER_URL);
  });

  afterAll(async () => {
    await users.cleanupAll();
  });

  test('join with valid token emits init with user, server, servers, onlineUsers, voiceChannels', async () => {
    const user = await users.createConnected('sockconn');
    const { initData } = user;

    expect(initData).toBeDefined();
    expect(initData.user).toBeDefined();
    expect(initData.user.id).toBeDefined();
    expect(initData.user.username).toBeDefined();
    expect(initData.server).toBeDefined();
    expect(initData.servers).toBeDefined();
    expect(Array.isArray(initData.servers)).toBe(true);
    expect(initData.onlineUsers).toBeDefined();
    expect(initData.voiceChannels).toBeDefined();
  });

  test('init payload includes default server with categories and channels', async () => {
    const user = await users.createConnected('sockdefault');
    const { initData } = user;

    expect(initData.server).toBeDefined();
    expect(initData.server.channels).toBeDefined();
    expect(initData.server.categories).toBeDefined();
  });

  test('init payload servers array includes server membership', async () => {
    const user = await users.createConnected('sockmember');
    const { initData } = user;

    expect(initData.servers.length).toBeGreaterThanOrEqual(1);
    const server = initData.servers[0];
    expect(server.id).toBeDefined();
    expect(server.name).toBeDefined();
  });

  test('join with invalid token emits error', async () => {
    const socket = createSocket(SERVER_URL);

    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.disconnect();
        reject(new Error('Timed out waiting for error'));
      }, 5000);

      socket.on('connect', () => {
        socket.on('error', (data) => {
          clearTimeout(timer);
          socket.disconnect();
          resolve(data);
        });
        socket.emit('join', { token: 'invalid-token-xyz' });
      });

      socket.connect();
    });

    expect(result).toBeDefined();
    expect(result.message).toBeDefined();
  });

  test('join with no token emits error', async () => {
    const socket = createSocket(SERVER_URL);

    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.disconnect();
        reject(new Error('Timed out waiting for error'));
      }, 5000);

      socket.on('connect', () => {
        socket.on('error', (data) => {
          clearTimeout(timer);
          socket.disconnect();
          resolve(data);
        });
        socket.emit('join', {});
      });

      socket.connect();
    });

    expect(result).toBeDefined();
  });

  test('other connected sockets receive user:joined with updated onlineUsers', async () => {
    const user1 = await users.createConnected('sockobs');

    // Listen for user:joined before user2 connects
    const joinedPromise = waitForEvent(user1.socket, 'user:joined', 10000);

    const user2 = await users.createConnected('socknew');

    const joinedData = await joinedPromise;
    expect(joinedData).toBeDefined();
    expect(joinedData.onlineUsers).toBeDefined();
  });
});

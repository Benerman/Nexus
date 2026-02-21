const { ApiClient } = require('./api-client');
const { connectAndJoin } = require('./socket-client');

class TestUserManager {
  constructor(serverUrl) {
    this.serverUrl = serverUrl || process.env.SERVER_URL || process.env.__INTEGRATION_SERVER_URL__ || 'http://localhost:4444';
    this.api = new ApiClient(this.serverUrl);
    this.users = [];
  }

  /**
   * Create a test user via the register API.
   * Returns { username, password, token, account }.
   */
  async create(prefix = 'testuser') {
    const username = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const password = 'TestPass123!';

    // Retry with backoff to handle rate limiting (10 req / 10s per IP)
    let status, body;
    for (let attempt = 0; attempt < 5; attempt++) {
      ({ status, body } = await this.api.register(username, password));
      if (status === 429) {
        const delay = 1500 * (attempt + 1);
        console.log(`Rate limited on register, waiting ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      break;
    }
    if (status !== 200) {
      throw new Error(`Failed to register test user: ${JSON.stringify(body)}`);
    }

    const user = {
      username,
      password,
      token: body.token,
      account: body.account,
    };

    this.users.push(user);
    return user;
  }

  /**
   * Create a test user and connect via Socket.IO.
   * Returns { username, password, token, account, socket, initData }.
   */
  async createConnected(prefix = 'testuser') {
    const user = await this.create(prefix);
    const { socket, initData } = await connectAndJoin(this.serverUrl, user.token);

    user.socket = socket;
    user.initData = initData;
    return user;
  }

  /**
   * Disconnect all sockets and logout all tokens.
   */
  async cleanupAll() {
    for (const user of this.users) {
      if (user.socket && user.socket.connected) {
        user.socket.disconnect();
      }
      if (user.token) {
        try {
          await this.api.logout(user.token);
        } catch {
          // Ignore logout errors during cleanup
        }
      }
    }
    this.users = [];
  }
}

module.exports = { TestUserManager };

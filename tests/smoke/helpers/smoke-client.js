const { io } = require('socket.io-client');

class SmokeClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl || process.env.PROD_URL;
    if (!this.baseUrl) throw new Error('PROD_URL environment variable is required');
    // Remove trailing slash
    this.baseUrl = this.baseUrl.replace(/\/$/, '');
  }

  async healthCheck() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(`${this.baseUrl}/api/health`, {
        signal: controller.signal,
      });
      clearTimeout(timer);
      const body = await res.json();
      return { status: res.status, body };
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError' || err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
        throw new Error(`SERVER UNREACHABLE: ${err.message || err.code}`);
      }
      throw err;
    }
  }

  async register(username, password) {
    const res = await fetch(`${this.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const body = await res.json();
    return { status: res.status, body };
  }

  async login(username, password) {
    const res = await fetch(`${this.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const body = await res.json();
    return { status: res.status, body };
  }

  async logout(token) {
    const res = await fetch(`${this.baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });
    const body = await res.json();
    return { status: res.status, body };
  }

  connectSocket(token) {
    return new Promise((resolve, reject) => {
      const socket = io(this.baseUrl, {
        autoConnect: false,
        transports: ['websocket'],
        reconnection: false,
        timeout: 10000,
      });

      const timer = setTimeout(() => {
        socket.disconnect();
        reject(new Error('Socket connection timed out'));
      }, 15000);

      socket.on('connect', () => {
        socket.once('init', (initData) => {
          clearTimeout(timer);
          resolve({ socket, initData });
        });
        socket.once('error', (err) => {
          clearTimeout(timer);
          socket.disconnect();
          reject(new Error(`Socket error: ${err.message || JSON.stringify(err)}`));
        });
        socket.emit('join', { token });
      });

      socket.on('connect_error', (err) => {
        clearTimeout(timer);
        reject(new Error(`Socket connection error: ${err.message}`));
      });

      socket.connect();
    });
  }

  joinChannel(socket, channelId) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('channel:join timed out')), 10000);
      socket.once('channel:history', (data) => {
        clearTimeout(timer);
        resolve(data);
      });
      socket.emit('channel:join', { channelId });
    });
  }

  sendMessage(socket, channelId, content) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('message:send timed out')), 10000);
      socket.once('message:new', (msg) => {
        clearTimeout(timer);
        resolve(msg);
      });
      socket.emit('message:send', { channelId, content });
    });
  }

  deleteMessage(socket, channelId, messageId) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('message:delete timed out')), 10000);
      socket.once('message:deleted', (data) => {
        clearTimeout(timer);
        resolve(data);
      });
      socket.emit('message:delete', { channelId, messageId });
    });
  }
}

module.exports = { SmokeClient };

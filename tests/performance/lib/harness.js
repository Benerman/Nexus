'use strict';

const { io } = require('socket.io-client');

const BATCH_SIZE = 8;
const BATCH_PAUSE_MS = 11000;
const CONNECT_TIMEOUT = 15000;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function waitForEvent(socket, event, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timed out waiting for: ${event}`));
    }, timeoutMs);
    const handler = (data) => {
      clearTimeout(timer);
      resolve(data);
    };
    socket.once(event, handler);
  });
}

function emitAndWait(socket, event, data, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for ack on: ${event}`));
    }, timeoutMs);
    socket.emit(event, data, (response) => {
      clearTimeout(timer);
      resolve(response);
    });
  });
}

class TestHarness {
  constructor(options = {}) {
    this.serverUrl = options.url || 'http://localhost:3001';
    this.userCount = options.users || 20;
    this.prefix = options.prefix || 'stresstest';
    this.verbose = options.verbose || false;
    this.cleanup = options.cleanup || false;

    this.accounts = [];   // { username, password, token, userId }
    this.sockets = [];    // socket.io instances (same index as accounts)
    this.serverId = null;
    this.serverName = null;
    this.channels = {};   // name -> channelId
    this.defaultChannelId = null;
    this.inviteCode = null;
  }

  log(...args) {
    if (this.verbose) console.log('[Harness]', ...args);
  }

  async setup() {
    console.log(`\nSetting up ${this.userCount} test users against ${this.serverUrl}...`);

    // Phase 1: Create accounts in batches
    await this._createAccounts();

    // Phase 2: Connect all sockets
    await this._connectAll();

    // Phase 3: Owner creates test server
    await this._createServer();

    // Phase 4: All other users join via invite
    await this._joinServer();

    // Phase 5: Create extra channels
    await this._createChannels();

    console.log(`Setup complete: ${this.sockets.length} users connected, server "${this.serverName}" with ${Object.keys(this.channels).length} channels\n`);
  }

  async _createAccounts() {
    const password = 'StressTest123!';

    for (let batch = 0; batch < Math.ceil(this.userCount / BATCH_SIZE); batch++) {
      const start = batch * BATCH_SIZE;
      const end = Math.min(start + BATCH_SIZE, this.userCount);

      if (batch > 0) {
        this.log(`Pausing ${BATCH_PAUSE_MS / 1000}s between registration batches...`);
        await sleep(BATCH_PAUSE_MS);
      }

      const promises = [];
      for (let i = start; i < end; i++) {
        const username = `${this.prefix}_${Date.now()}_${i}`;
        promises.push(this._registerOrLogin(username, password, i));
      }
      const results = await Promise.all(promises);

      for (const acct of results) {
        if (acct) this.accounts.push(acct);
      }

      this.log(`Batch ${batch + 1}: ${results.filter(Boolean).length}/${end - start} accounts ready (${this.accounts.length} total)`);
    }

    if (this.accounts.length < 2) {
      throw new Error(`Need at least 2 accounts, only got ${this.accounts.length}`);
    }
    console.log(`  Created ${this.accounts.length} accounts`);
  }

  async _registerOrLogin(username, password, index) {
    try {
      const res = await fetch(`${this.serverUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (res.status === 429) {
        this.log(`Rate limited on register for ${username}, retrying after delay...`);
        await sleep(11000);
        return this._registerOrLogin(username, password, index);
      }

      const body = await res.json();
      if (res.ok && body.token) {
        return { username, password, token: body.token, userId: body.account?.id, index };
      }

      // Account might already exist
      if (body.error && body.error.includes('taken')) {
        return this._login(username, password, index);
      }

      this.log(`Register failed for ${username}: ${JSON.stringify(body)}`);
      return null;
    } catch (err) {
      this.log(`Register error for ${username}: ${err.message}`);
      return null;
    }
  }

  async _login(username, password, index) {
    try {
      const res = await fetch(`${this.serverUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const body = await res.json();
      if (res.ok && body.token) {
        return { username, password, token: body.token, userId: body.account?.id, index };
      }
      return null;
    } catch {
      return null;
    }
  }

  async _connectAll() {
    const results = await Promise.all(
      this.accounts.map((acct, i) => this._connectOne(acct, i))
    );

    this.sockets = results.filter(Boolean);
    if (this.sockets.length < 2) {
      throw new Error(`Need at least 2 connected sockets, only got ${this.sockets.length}`);
    }
    console.log(`  Connected ${this.sockets.length} sockets`);
  }

  async _connectOne(acct, index) {
    return new Promise((resolve) => {
      const socket = io(this.serverUrl, {
        autoConnect: false,
        transports: ['websocket'],
        reconnection: false,
        timeout: CONNECT_TIMEOUT,
      });

      const timer = setTimeout(() => {
        socket.disconnect();
        this.log(`Timeout connecting user ${index}`);
        resolve(null);
      }, CONNECT_TIMEOUT);

      socket.on('connect', () => {
        const initPromise = waitForEvent(socket, 'init', CONNECT_TIMEOUT);
        socket.emit('join', { token: acct.token });
        initPromise.then((initData) => {
          clearTimeout(timer);
          socket._acct = acct;
          socket._initData = initData;
          socket._index = index;
          resolve(socket);
        }).catch(() => {
          clearTimeout(timer);
          socket.disconnect();
          resolve(null);
        });
      });

      socket.on('connect_error', () => {
        clearTimeout(timer);
        resolve(null);
      });

      socket.connect();
    });
  }

  async _createServer() {
    const owner = this.sockets[0];
    this.serverName = `${this.prefix}_server_${Date.now()}`;

    const createdPromise = waitForEvent(owner, 'server:created');
    owner.emit('server:create', { name: this.serverName });
    const data = await createdPromise;

    this.serverId = data.server.id;
    this.defaultChannelId = data.server.channels?.[0]?.id || null;

    if (this.defaultChannelId) {
      this.channels['general'] = this.defaultChannelId;
    }

    // Create invite
    const invitePromise = waitForEvent(owner, 'invite:created');
    owner.emit('invite:create', { serverId: this.serverId });
    const inviteData = await invitePromise;
    this.inviteCode = inviteData.invite?.code || inviteData.code;

    this.log(`Server "${this.serverName}" (${this.serverId}) created with invite ${this.inviteCode}`);
    console.log(`  Created server "${this.serverName}"`);
  }

  async _joinServer() {
    let joined = 1; // owner is already in
    const joinPromises = this.sockets.slice(1).map(async (socket) => {
      try {
        const joinedPromise = waitForEvent(socket, 'invite:joined', 15000);
        socket.emit('invite:use', { code: this.inviteCode });
        await joinedPromise;
        joined++;
      } catch (err) {
        this.log(`User ${socket._index} failed to join: ${err.message}`);
      }
    });

    await Promise.all(joinPromises);
    this.log(`${joined}/${this.sockets.length} users joined server`);
    console.log(`  ${joined} users joined server`);
  }

  async _createChannels() {
    const owner = this.sockets[0];
    const channelNames = ['perf-test-1', 'perf-test-2', 'perf-test-3'];

    for (const name of channelNames) {
      try {
        const createdPromise = waitForEvent(owner, 'channel:created', 10000);
        owner.emit('channel:create', {
          serverId: this.serverId,
          name,
          type: 'text',
        });
        const data = await createdPromise;
        this.channels[name] = data.channel.id;
        this.log(`Channel "${name}" created: ${data.channel.id}`);
      } catch (err) {
        this.log(`Failed to create channel "${name}": ${err.message}`);
      }
    }
    console.log(`  Created ${Object.keys(this.channels).length - (this.defaultChannelId ? 1 : 0)} extra channels`);
  }

  getSocket(i) {
    return this.sockets[i] || null;
  }

  getRandomSocket() {
    return this.sockets[Math.floor(Math.random() * this.sockets.length)];
  }

  getAllSockets() {
    return this.sockets;
  }

  getChannelId(name) {
    return this.channels[name] || null;
  }

  getChannelIds() {
    return Object.values(this.channels);
  }

  async joinChannel(channelId) {
    const promises = this.sockets.map((socket) => {
      return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(false), 5000);
        socket.once('channel:history', () => {
          clearTimeout(timer);
          resolve(true);
        });
        socket.emit('channel:join', { channelId, serverId: this.serverId });
      });
    });
    const results = await Promise.all(promises);
    return results.filter(Boolean).length;
  }

  async doCleanup() {
    if (!this.cleanup) return;
    console.log('\nCleaning up test data...');

    // Delete server
    if (this.serverId && this.sockets[0]?.connected) {
      try {
        const deletedPromise = waitForEvent(this.sockets[0], 'server:deleted', 10000);
        this.sockets[0].emit('server:delete', { serverId: this.serverId });
        await deletedPromise;
        this.log('Server deleted');
      } catch (err) {
        this.log(`Server delete failed: ${err.message}`);
      }
    }

    // Delete accounts — batch with pauses for rate limits
    for (let i = 0; i < this.accounts.length; i += BATCH_SIZE) {
      if (i > 0) await sleep(BATCH_PAUSE_MS);
      const batch = this.accounts.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(async (acct) => {
        try {
          await fetch(`${this.serverUrl}/api/auth/account`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${acct.token}` },
          });
        } catch {
          // ignore
        }
      }));
    }
    console.log(`  Deleted ${this.accounts.length} accounts`);
  }

  async teardown() {
    for (const socket of this.sockets) {
      if (socket.connected) socket.disconnect();
    }
    this.sockets = [];
    this.log('All sockets disconnected');
  }
}

module.exports = { TestHarness, waitForEvent, emitAndWait, sleep };

'use strict';

const { io } = require('socket.io-client');
const { waitForEvent, sleep } = require('../harness');

async function run(harness, metrics, duration) {
  console.log('\n=== Connection Tests ===\n');

  await testRapidConnectDisconnect(harness, metrics);
  await testConcurrentBurst(harness, metrics);
  await testReconnectionStorm(harness, metrics);
}

async function testRapidConnectDisconnect(harness, metrics) {
  const label = 'connect_disconnect_cycle';
  const progress = metrics.createProgress(0, 'Rapid connect/disconnect');
  progress.start();

  const acct = harness.accounts[0];
  const cycles = 50;

  for (let i = 0; i < cycles; i++) {
    const start = Date.now();
    try {
      const socket = io(harness.serverUrl, {
        autoConnect: false,
        transports: ['websocket'],
        reconnection: false,
        timeout: 10000,
      });

      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          socket.disconnect();
          reject(new Error('Connect timeout'));
        }, 10000);

        socket.on('connect', () => {
          const initP = waitForEvent(socket, 'init', 10000);
          socket.emit('join', { token: acct.token });
          initP.then(() => {
            clearTimeout(timer);
            socket.disconnect();
            resolve();
          }).catch((err) => {
            clearTimeout(timer);
            socket.disconnect();
            reject(err);
          });
        });

        socket.on('connect_error', (err) => {
          clearTimeout(timer);
          reject(err);
        });

        socket.connect();
      });

      metrics.record(label, Date.now() - start, true);
    } catch (err) {
      metrics.record(label, Date.now() - start, false);
      metrics.recordError(label, err.message);
    }
    progress.tick();
  }

  progress.stop();
}

async function testConcurrentBurst(harness, metrics) {
  const label = 'concurrent_burst';
  const progress = metrics.createProgress(0, 'Concurrent burst');
  progress.start();

  const burstStart = Date.now();
  const promises = harness.accounts.map(async (acct) => {
    const start = Date.now();
    try {
      const socket = io(harness.serverUrl, {
        autoConnect: false,
        transports: ['websocket'],
        reconnection: false,
        timeout: 15000,
      });

      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          socket.disconnect();
          reject(new Error('Burst connect timeout'));
        }, 15000);

        socket.on('connect', () => {
          const initP = waitForEvent(socket, 'init', 15000);
          socket.emit('join', { token: acct.token });
          initP.then(() => {
            clearTimeout(timer);
            socket.disconnect();
            resolve();
          }).catch((err) => {
            clearTimeout(timer);
            socket.disconnect();
            reject(err);
          });
        });

        socket.on('connect_error', (err) => {
          clearTimeout(timer);
          reject(err);
        });

        socket.connect();
      });

      metrics.record(label, Date.now() - start, true);
      progress.tick();
    } catch (err) {
      metrics.record(label, Date.now() - start, false);
      metrics.recordError(label, err.message);
      progress.tick();
    }
  });

  await Promise.all(promises);
  const totalBurst = Date.now() - burstStart;
  console.log(`  Burst total time: ${totalBurst}ms for ${harness.accounts.length} users`);
  progress.stop();
}

async function testReconnectionStorm(harness, metrics) {
  const label = 'reconnection_storm';
  const progress = metrics.createProgress(0, 'Reconnection storm');
  progress.start();

  // Disconnect all existing sockets
  for (const socket of harness.getAllSockets()) {
    if (socket.connected) socket.disconnect();
  }
  await sleep(1000);

  // Reconnect all at once
  const reconnectStart = Date.now();
  const newSockets = await Promise.all(
    harness.accounts.map(async (acct, i) => {
      const start = Date.now();
      try {
        const socket = io(harness.serverUrl, {
          autoConnect: false,
          transports: ['websocket'],
          reconnection: false,
          timeout: 15000,
        });

        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            socket.disconnect();
            reject(new Error('Reconnect timeout'));
          }, 15000);

          socket.on('connect', () => {
            const initP = waitForEvent(socket, 'init', 15000);
            socket.emit('join', { token: acct.token });
            initP.then((initData) => {
              clearTimeout(timer);
              socket._acct = acct;
              socket._initData = initData;
              socket._index = i;
              resolve(socket);
            }).catch((err) => {
              clearTimeout(timer);
              socket.disconnect();
              reject(err);
            });
          });

          socket.on('connect_error', (err) => {
            clearTimeout(timer);
            reject(err);
          });

          socket.connect();
        });

        metrics.record(label, Date.now() - start, true);
        progress.tick();
        return socket;
      } catch (err) {
        metrics.record(label, Date.now() - start, false);
        metrics.recordError(label, err.message);
        progress.tick();
        return null;
      }
    })
  );

  // Replace harness sockets with reconnected ones
  harness.sockets = newSockets.filter(Boolean);

  // Rejoin server
  if (harness.serverId) {
    for (const socket of harness.sockets.slice(1)) {
      try {
        const joinedP = waitForEvent(socket, 'invite:joined', 10000);
        socket.emit('invite:use', { code: harness.inviteCode });
        await joinedP;
      } catch {
        // may already be a member
      }
    }
  }

  const totalReconnect = Date.now() - reconnectStart;
  console.log(`  Reconnection storm total: ${totalReconnect}ms for ${harness.sockets.length} users`);
  progress.stop();
}

module.exports = { run };

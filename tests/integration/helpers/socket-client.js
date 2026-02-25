const { io } = require('socket.io-client');

/**
 * Wait for a specific event from the socket.
 * Used for handlers that emit response events (most handlers).
 */
function waitForEvent(socket, event, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event);
      reject(new Error(`Timed out waiting for event: ${event}`));
    }, timeoutMs);

    socket.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

/**
 * Emit an event and wait for the ack callback.
 * Used for handlers that use callback pattern (emoji:*, soundboard:*, messages:fetch-older, etc.)
 */
function emitAndWait(socket, event, data, timeoutMs = 5000) {
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

/**
 * Connect a socket and complete the join + init flow.
 * Returns { socket, initData }.
 */
async function connectAndJoin(serverUrl, token) {
  const socket = createSocket(serverUrl);

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.disconnect();
      reject(new Error('Timed out waiting for init after join'));
    }, 10000);

    const onError = (err) => {
      clearTimeout(timer);
      socket.disconnect();
      reject(new Error(`Socket error during join: ${err.message || JSON.stringify(err)}`));
    };

    socket.on('connect', () => {
      const initPromise = waitForEvent(socket, 'init', 10000);
      socket.emit('join', { token });
      initPromise.then(async (initData) => {
        // If user has no regular servers (only personal), join the default server
        // so integration tests have a server with channels to work with
        const hasRegularServer = initData.servers.some(s => !s.isPersonal && !s.id?.startsWith('personal:'));
        if (!hasRegularServer) {
          const joinedPromise = waitForEvent(socket, 'invite:joined', 10000);
          socket.emit('server:join-default');
          const { server } = await joinedPromise;
          initData.server = server;
          initData.servers.push(server);
        }
        clearTimeout(timer);
        // Remove the error handler so it doesn't disconnect the socket
        // when tests intentionally trigger server-side errors later
        socket.off('error', onError);
        resolve({ socket, initData });
      }).catch((err) => {
        clearTimeout(timer);
        socket.off('error', onError);
        socket.disconnect();
        reject(err);
      });
    });

    socket.on('connect_error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Socket connection error: ${err.message}`));
    });

    socket.on('error', onError);

    socket.connect();
  });
}

/**
 * Create a socket.io-client instance without connecting.
 */
function createSocket(serverUrl) {
  return io(serverUrl, {
    autoConnect: false,
    transports: ['websocket'],
    reconnection: false,
    timeout: 10000,
  });
}

module.exports = { waitForEvent, emitAndWait, connectAndJoin, createSocket };

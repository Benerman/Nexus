const TIMEOUT_MSG = 'Unable to complete action. Please check your connection and try again.';

/**
 * Wraps socket.emit with socket.io's built-in .timeout() feature.
 * On timeout, calls callback({ error: '...' }) matching existing error patterns.
 * Pass data=null for events that take only a callback (no data payload).
 */
export function emitWithTimeout(socket, event, data, callback, timeoutMs = 10000) {
  if (!socket) return;
  const wrappedCb = (err, response) => {
    if (err) {
      callback({ error: TIMEOUT_MSG });
    } else {
      callback(response);
    }
  };
  if (data === null || data === undefined) {
    socket.timeout(timeoutMs).emit(event, wrappedCb);
  } else {
    socket.timeout(timeoutMs).emit(event, data, wrappedCb);
  }
}

/**
 * Emits a fire-and-forget event with a local timeout.
 * Returns a timeoutId — clear it when the response event arrives.
 */
export function emitWithLoadingTimeout(socket, event, data, { onTimeout, timeoutMs = 10000 }) {
  if (!socket) return null;
  socket.emit(event, data);
  return setTimeout(onTimeout, timeoutMs);
}

export { TIMEOUT_MSG };

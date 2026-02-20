/**
 * Tests for client/src/utils/socketTimeout.js — socket emit wrappers.
 */

const {
  emitWithTimeout,
  emitWithLoadingTimeout,
  TIMEOUT_MSG,
} = require('../../../client/src/utils/socketTimeout');

// ─── TIMEOUT_MSG constant ────────────────────────────────────────────────────
describe('TIMEOUT_MSG', () => {
  test('is a non-empty string', () => {
    expect(typeof TIMEOUT_MSG).toBe('string');
    expect(TIMEOUT_MSG.length).toBeGreaterThan(0);
  });

  test('mentions connection', () => {
    expect(TIMEOUT_MSG.toLowerCase()).toContain('connection');
  });
});

// ─── emitWithTimeout ─────────────────────────────────────────────────────────
describe('emitWithTimeout', () => {
  function mockSocket() {
    const emitFn = jest.fn();
    const timeoutFn = jest.fn(() => ({ emit: emitFn }));
    return { timeout: timeoutFn, _emitFn: emitFn, _timeoutFn: timeoutFn };
  }

  test('does nothing if socket is null', () => {
    const cb = jest.fn();
    emitWithTimeout(null, 'test', { foo: 1 }, cb);
    expect(cb).not.toHaveBeenCalled();
  });

  test('calls socket.timeout(ms).emit(event, data, cb) with data', () => {
    const socket = mockSocket();
    const cb = jest.fn();
    emitWithTimeout(socket, 'sendMessage', { text: 'hi' }, cb, 5000);
    expect(socket._timeoutFn).toHaveBeenCalledWith(5000);
    expect(socket._emitFn).toHaveBeenCalled();
    const [event, data, wrappedCb] = socket._emitFn.mock.calls[0];
    expect(event).toBe('sendMessage');
    expect(data).toEqual({ text: 'hi' });
    expect(typeof wrappedCb).toBe('function');
  });

  test('calls socket.timeout(ms).emit(event, cb) when data is null', () => {
    const socket = mockSocket();
    const cb = jest.fn();
    emitWithTimeout(socket, 'getStatus', null, cb, 8000);
    expect(socket._timeoutFn).toHaveBeenCalledWith(8000);
    const [event, wrappedCb] = socket._emitFn.mock.calls[0];
    expect(event).toBe('getStatus');
    expect(typeof wrappedCb).toBe('function');
  });

  test('passes response to callback on success', () => {
    const socket = mockSocket();
    const cb = jest.fn();
    emitWithTimeout(socket, 'event', { x: 1 }, cb);
    // Get the wrapped callback and simulate success
    const wrappedCb = socket._emitFn.mock.calls[0][2];
    wrappedCb(null, { result: 'ok' });
    expect(cb).toHaveBeenCalledWith({ result: 'ok' });
  });

  test('passes error object to callback on timeout', () => {
    const socket = mockSocket();
    const cb = jest.fn();
    emitWithTimeout(socket, 'event', { x: 1 }, cb);
    const wrappedCb = socket._emitFn.mock.calls[0][2];
    wrappedCb(new Error('timeout'));
    expect(cb).toHaveBeenCalledWith({ error: TIMEOUT_MSG });
  });

  test('uses default 10000ms timeout', () => {
    const socket = mockSocket();
    emitWithTimeout(socket, 'event', null, jest.fn());
    expect(socket._timeoutFn).toHaveBeenCalledWith(10000);
  });
});

// ─── emitWithLoadingTimeout ──────────────────────────────────────────────────
describe('emitWithLoadingTimeout', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  function mockSocket() {
    return { emit: jest.fn() };
  }

  test('returns null if socket is null', () => {
    const result = emitWithLoadingTimeout(null, 'event', {}, { onTimeout: jest.fn() });
    expect(result).toBeNull();
  });

  test('emits event immediately and returns timeout ID', () => {
    const socket = mockSocket();
    const onTimeout = jest.fn();
    const id = emitWithLoadingTimeout(socket, 'load', { key: 'val' }, { onTimeout });
    expect(socket.emit).toHaveBeenCalledWith('load', { key: 'val' });
    expect(id).toBeDefined();
    expect(id).not.toBeNull();
  });

  test('calls onTimeout after timeoutMs', () => {
    const socket = mockSocket();
    const onTimeout = jest.fn();
    emitWithLoadingTimeout(socket, 'load', {}, { onTimeout, timeoutMs: 5000 });
    expect(onTimeout).not.toHaveBeenCalled();
    jest.advanceTimersByTime(5000);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  test('uses default 10000ms timeout', () => {
    const socket = mockSocket();
    const onTimeout = jest.fn();
    emitWithLoadingTimeout(socket, 'load', {}, { onTimeout });
    jest.advanceTimersByTime(9999);
    expect(onTimeout).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  test('timeout can be cleared to prevent onTimeout', () => {
    const socket = mockSocket();
    const onTimeout = jest.fn();
    const id = emitWithLoadingTimeout(socket, 'load', {}, { onTimeout, timeoutMs: 3000 });
    clearTimeout(id);
    jest.advanceTimersByTime(5000);
    expect(onTimeout).not.toHaveBeenCalled();
  });
});

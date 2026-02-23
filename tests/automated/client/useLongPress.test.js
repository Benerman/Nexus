/**
 * Tests for client/src/hooks/useLongPress.js — long-press touch detection hook.
 * Mocks React hooks to test the function directly without rendering.
 */

// Mock React hooks so we can call the hook outside a component
jest.mock('react', () => ({
  useRef: (init) => ({ current: init }),
  useCallback: (fn) => fn,
}));

const useLongPress = require('../../../client/src/hooks/useLongPress').default;

// ─── Timer and callback behavior ─────────────────────────────────────────────
describe('timer and callback behavior', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('does not fire before delay (349ms)', () => {
    const callback = jest.fn();
    const { onTouchStart } = useLongPress(callback);

    onTouchStart({ touches: [{ clientX: 100, clientY: 200 }], target: {} });
    jest.advanceTimersByTime(349);

    expect(callback).not.toHaveBeenCalled();
  });

  test('fires callback after default 350ms', () => {
    const callback = jest.fn();
    const { onTouchStart } = useLongPress(callback);

    onTouchStart({ touches: [{ clientX: 100, clientY: 200 }], target: {} });
    jest.advanceTimersByTime(350);

    expect(callback).toHaveBeenCalledTimes(1);
  });

  test('callback receives { clientX, clientY, target, preventDefault }', () => {
    const callback = jest.fn();
    const mockTarget = { id: 'test-el' };
    const { onTouchStart } = useLongPress(callback);

    onTouchStart({ touches: [{ clientX: 42, clientY: 84 }], target: mockTarget });
    jest.advanceTimersByTime(350);

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({
      clientX: 42,
      clientY: 84,
      target: mockTarget,
      preventDefault: expect.any(Function),
    }));
  });

  test('respects custom delay parameter', () => {
    const callback = jest.fn();
    const { onTouchStart } = useLongPress(callback, 500);

    onTouchStart({ touches: [{ clientX: 0, clientY: 0 }], target: {} });
    jest.advanceTimersByTime(499);
    expect(callback).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledTimes(1);
  });
});

// ─── Movement cancellation ───────────────────────────────────────────────────
describe('movement cancellation', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('cancels if >10px horizontal movement', () => {
    const callback = jest.fn();
    const { onTouchStart, onTouchMove } = useLongPress(callback);

    onTouchStart({ touches: [{ clientX: 100, clientY: 100 }], target: {} });
    onTouchMove({ touches: [{ clientX: 111, clientY: 100 }] });
    jest.advanceTimersByTime(350);

    expect(callback).not.toHaveBeenCalled();
  });

  test('cancels if >10px vertical movement', () => {
    const callback = jest.fn();
    const { onTouchStart, onTouchMove } = useLongPress(callback);

    onTouchStart({ touches: [{ clientX: 100, clientY: 100 }], target: {} });
    onTouchMove({ touches: [{ clientX: 100, clientY: 111 }] });
    jest.advanceTimersByTime(350);

    expect(callback).not.toHaveBeenCalled();
  });

  test('does not cancel for movement within threshold (exactly 10px)', () => {
    const callback = jest.fn();
    const { onTouchStart, onTouchMove } = useLongPress(callback);

    onTouchStart({ touches: [{ clientX: 100, clientY: 100 }], target: {} });
    onTouchMove({ touches: [{ clientX: 110, clientY: 100 }] });
    jest.advanceTimersByTime(350);

    expect(callback).toHaveBeenCalledTimes(1);
  });

  test('cancels for diagonal movement exceeding threshold', () => {
    const callback = jest.fn();
    const { onTouchStart, onTouchMove } = useLongPress(callback);

    onTouchStart({ touches: [{ clientX: 100, clientY: 100 }], target: {} });
    onTouchMove({ touches: [{ clientX: 111, clientY: 105 }] });
    jest.advanceTimersByTime(350);

    expect(callback).not.toHaveBeenCalled();
  });
});

// ─── Touch end behavior ──────────────────────────────────────────────────────
describe('touch end behavior', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('clears timer on touchEnd before delay', () => {
    const callback = jest.fn();
    const { onTouchStart, onTouchEnd } = useLongPress(callback);

    onTouchStart({ touches: [{ clientX: 0, clientY: 0 }], target: {} });
    onTouchEnd({ preventDefault: jest.fn(), stopPropagation: jest.fn() });
    jest.advanceTimersByTime(350);

    expect(callback).not.toHaveBeenCalled();
  });

  test('preventDefault + stopPropagation after long press fires', () => {
    const callback = jest.fn();
    const { onTouchStart, onTouchEnd } = useLongPress(callback);

    onTouchStart({ touches: [{ clientX: 0, clientY: 0 }], target: {} });
    jest.advanceTimersByTime(350);

    const mockEvent = { preventDefault: jest.fn(), stopPropagation: jest.fn() };
    onTouchEnd(mockEvent);

    expect(mockEvent.preventDefault).toHaveBeenCalled();
    expect(mockEvent.stopPropagation).toHaveBeenCalled();
  });

  test('does not preventDefault if long press did not fire', () => {
    const callback = jest.fn();
    const { onTouchStart, onTouchEnd } = useLongPress(callback);

    onTouchStart({ touches: [{ clientX: 0, clientY: 0 }], target: {} });
    // End before delay
    const mockEvent = { preventDefault: jest.fn(), stopPropagation: jest.fn() };
    onTouchEnd(mockEvent);

    expect(mockEvent.preventDefault).not.toHaveBeenCalled();
    expect(mockEvent.stopPropagation).not.toHaveBeenCalled();
  });
});

// ─── Returned handlers ───────────────────────────────────────────────────────
describe('returned handlers', () => {
  test('returns { onTouchStart, onTouchMove, onTouchEnd } as functions', () => {
    const result = useLongPress(jest.fn());
    expect(typeof result.onTouchStart).toBe('function');
    expect(typeof result.onTouchMove).toBe('function');
    expect(typeof result.onTouchEnd).toBe('function');
  });
});

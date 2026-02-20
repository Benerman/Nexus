import { useRef, useCallback } from 'react';

/**
 * Hook that returns touch event handlers for long-press detection.
 * Calls `callback(e)` after `delay` ms if the finger hasn't moved significantly.
 * Also prevents the native context menu on touch so only the long-press fires.
 */
export default function useLongPress(callback, delay = 350) {
  const timerRef = useRef(null);
  const startPos = useRef(null);
  const firedRef = useRef(false);

  const clear = useCallback(() => {
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const onTouchStart = useCallback((e) => {
    firedRef.current = false;
    const touch = e.touches[0];
    startPos.current = { x: touch.clientX, y: touch.clientY };
    timerRef.current = setTimeout(() => {
      firedRef.current = true;
      // Create a synthetic position object like a contextmenu event
      callback({
        preventDefault: () => {},
        clientX: startPos.current.x,
        clientY: startPos.current.y,
        target: e.target,
      });
    }, delay);
  }, [callback, delay]);

  const onTouchMove = useCallback((e) => {
    if (!startPos.current) return;
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - startPos.current.x);
    const dy = Math.abs(touch.clientY - startPos.current.y);
    if (dx > 10 || dy > 10) {
      clear();
    }
  }, [clear]);

  const onTouchEnd = useCallback((e) => {
    clear();
    // If long-press fired, prevent the click that follows
    if (firedRef.current) {
      e.preventDefault();
    }
  }, [clear]);

  return { onTouchStart, onTouchMove, onTouchEnd };
}

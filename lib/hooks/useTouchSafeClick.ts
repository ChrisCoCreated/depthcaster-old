"use client";

import { useRef, useCallback } from "react";

interface TouchStartData {
  x: number;
  y: number;
  timestamp: number;
}

/**
 * Hook to prevent accidental button clicks during scroll on touch devices.
 * Only triggers the callback if the touch was a tap (minimal movement) rather than a scroll.
 * 
 * @param callback - Function to call when a valid tap is detected
 * @returns Object with onTouchStart, onTouchEnd, and onClick handlers
 */
export function useTouchSafeClick(callback: () => void) {
  const touchStartRef = useRef<TouchStartData | null>(null);

  const MOVEMENT_THRESHOLD = 10; // pixels
  const TIME_THRESHOLD = 300; // milliseconds

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (touch) {
      touchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        timestamp: Date.now(),
      };
    }
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) {
      return;
    }

    const touch = e.changedTouches[0];
    if (!touch) {
      touchStartRef.current = null;
      return;
    }

    const start = touchStartRef.current;
    const endX = touch.clientX;
    const endY = touch.clientY;
    const endTime = Date.now();

    // Calculate movement distance
    const deltaX = Math.abs(endX - start.x);
    const deltaY = Math.abs(endY - start.y);
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    // Calculate time elapsed
    const timeElapsed = endTime - start.timestamp;

    // Only trigger if movement is minimal (tap) and time is short
    if (distance < MOVEMENT_THRESHOLD && timeElapsed < TIME_THRESHOLD) {
      e.preventDefault();
      e.stopPropagation();
      callback();
    }

    // Reset touch start data
    touchStartRef.current = null;
  }, [callback]);

  const onClick = useCallback((e: React.MouseEvent) => {
    // For mouse/desktop, always allow click
    e.preventDefault();
    e.stopPropagation();
    callback();
  }, [callback]);

  return {
    onTouchStart,
    onTouchEnd,
    onClick,
  };
}


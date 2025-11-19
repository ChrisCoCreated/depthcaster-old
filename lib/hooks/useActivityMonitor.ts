"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export interface UseActivityMonitorOptions {
  inactivityThreshold?: number; // Time in ms before marking as inactive (default: 3 minutes)
}

export interface UseActivityMonitorReturn {
  isUserActive: boolean;
  isTabVisible: boolean;
  lastActiveAt: number | null;
  pause: () => void;
  resume: () => void;
}

/**
 * Shared activity monitoring hook that tracks user interaction and tab visibility.
 * Multiple components can use this hook to share the same activity awareness state.
 */
export function useActivityMonitor(
  options: UseActivityMonitorOptions = {}
): UseActivityMonitorReturn {
  const { inactivityThreshold = 3 * 60 * 1000 } = options; // Default: 3 minutes

  // Safe SSR initialization - check if we're in browser
  const [isUserActive, setIsUserActive] = useState(true);
  const [isTabVisible, setIsTabVisible] = useState(
    typeof document !== "undefined" ? !document.hidden : true
  );
  const [lastActiveAt, setLastActiveAt] = useState<number | null>(
    typeof window !== "undefined" ? Date.now() : null
  );
  const inactivityTimeoutIdRef = useRef<NodeJS.Timeout | null>(null);
  const isPausedRef = useRef(false);

  // Track user activity
  const markActivity = useCallback(() => {
    const wasPaused = isPausedRef.current;
    setIsUserActive(true);
    setLastActiveAt(Date.now());

    // Clear inactivity timeout
    if (inactivityTimeoutIdRef.current) {
      clearTimeout(inactivityTimeoutIdRef.current);
      inactivityTimeoutIdRef.current = null;
    }

    // Set inactivity timeout - if no activity for threshold, mark as inactive
    inactivityTimeoutIdRef.current = setTimeout(() => {
      if (!isPausedRef.current && typeof document !== "undefined" && !document.hidden) {
        setIsUserActive(false);
      }
    }, inactivityThreshold);
  }, [inactivityThreshold]);

  // Pause activity tracking
  const pause = useCallback(() => {
    isPausedRef.current = true;
    setIsUserActive(false);
    if (inactivityTimeoutIdRef.current) {
      clearTimeout(inactivityTimeoutIdRef.current);
      inactivityTimeoutIdRef.current = null;
    }
  }, []);

  // Resume activity tracking
  const resume = useCallback(() => {
    isPausedRef.current = false;
    setIsUserActive(true);
    setLastActiveAt(Date.now());
    markActivity();
  }, [markActivity]);

  // Handle visibility change
  useEffect(() => {
    if (typeof document === "undefined") return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        setIsTabVisible(false);
        setIsUserActive(false);
        if (inactivityTimeoutIdRef.current) {
          clearTimeout(inactivityTimeoutIdRef.current);
          inactivityTimeoutIdRef.current = null;
        }
      } else {
        setIsTabVisible(true);
        if (!isPausedRef.current) {
          setIsUserActive(true);
          setLastActiveAt(Date.now());
          markActivity();
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [markActivity]);

  // Activity event handlers
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (isPausedRef.current || document.hidden) {
      return;
    }

    const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    activityEvents.forEach((event) => {
      document.addEventListener(event, markActivity, { passive: true });
    });

    // Initialize activity tracking
    markActivity();

    return () => {
      activityEvents.forEach((event) => {
        document.removeEventListener(event, markActivity);
      });
      if (inactivityTimeoutIdRef.current) {
        clearTimeout(inactivityTimeoutIdRef.current);
      }
    };
  }, [markActivity]);

  return {
    isUserActive,
    isTabVisible,
    lastActiveAt,
    pause,
    resume,
  };
}


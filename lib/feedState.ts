/**
 * Utility functions for managing feed state persistence
 * Saves scroll position, cursor, and cast hashes per feed type
 */

export interface FeedState {
  scrollY: number;
  cursor: string | null;
  castHashes: string[];
  timestamp: number;
}

const STORAGE_KEY_PREFIX = "feedScrollState:";
const MAX_STATE_AGE_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Get storage key for a feed type
 */
function getStorageKey(feedType: string): string {
  return `${STORAGE_KEY_PREFIX}${feedType}`;
}

/**
 * Save feed state to sessionStorage
 */
export function saveFeedState(feedType: string, state: Partial<FeedState>): void {
  if (typeof window === "undefined") return;

  try {
    const existingState = getFeedState(feedType);
    const newState: FeedState = {
      scrollY: state.scrollY ?? existingState?.scrollY ?? 0,
      cursor: state.cursor ?? existingState?.cursor ?? null,
      castHashes: state.castHashes ?? existingState?.castHashes ?? [],
      timestamp: Date.now(),
    };

    const key = getStorageKey(feedType);
    sessionStorage.setItem(key, JSON.stringify(newState));
  } catch (error) {
    console.error("Failed to save feed state:", error);
  }
}

/**
 * Get feed state from sessionStorage
 */
export function getFeedState(feedType: string): FeedState | null {
  if (typeof window === "undefined") return null;

  try {
    const key = getStorageKey(feedType);
    const stored = sessionStorage.getItem(key);
    if (!stored) return null;

    const state: FeedState = JSON.parse(stored);
    
    // Check if state is too old
    const age = Date.now() - state.timestamp;
    if (age > MAX_STATE_AGE_MS) {
      clearFeedState(feedType);
      return null;
    }

    return state;
  } catch (error) {
    console.error("Failed to get feed state:", error);
    return null;
  }
}

/**
 * Clear feed state for a specific feed type
 */
export function clearFeedState(feedType: string): void {
  if (typeof window === "undefined") return;

  try {
    const key = getStorageKey(feedType);
    sessionStorage.removeItem(key);
  } catch (error) {
    console.error("Failed to clear feed state:", error);
  }
}

/**
 * Clear all feed states
 */
export function clearAllFeedStates(): void {
  if (typeof window === "undefined") return;

  try {
    const keys = Object.keys(sessionStorage);
    keys.forEach((key) => {
      if (key.startsWith(STORAGE_KEY_PREFIX)) {
        sessionStorage.removeItem(key);
      }
    });
  } catch (error) {
    console.error("Failed to clear all feed states:", error);
  }
}

/**
 * Throttle function for scroll events
 */
export function throttle<T extends (...args: any[]) => void>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  let lastCallTime = 0;

  return function (this: any, ...args: Parameters<T>) {
    const now = Date.now();
    const timeSinceLastCall = now - lastCallTime;

    if (timeSinceLastCall >= wait) {
      lastCallTime = now;
      func.apply(this, args);
    } else {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        lastCallTime = Date.now();
        func.apply(this, args);
      }, wait - timeSinceLastCall);
    }
  };
}







/**
 * Utility functions for managing navigation history and scroll position restoration
 * Tracks scroll positions per page and maintains a navigation stack
 */

export interface NavigationState {
  pathname: string;
  scrollY: number;
  timestamp: number;
}

export interface NavigationHistory {
  previousPathname: string | null;
  scrollPositions: Record<string, number>; // pathname -> scrollY
  timestamps: Record<string, number>; // pathname -> timestamp
}

const STORAGE_KEY = "navigationHistory";
const MAX_STATE_AGE_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Get the navigation history object
 */
function getHistory(): NavigationHistory {
  if (typeof window === "undefined") {
    return { previousPathname: null, scrollPositions: {}, timestamps: {} };
  }

  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return { previousPathname: null, scrollPositions: {}, timestamps: {} };
    }

    const history: NavigationHistory = JSON.parse(stored);
    
    // Clean up old entries
    const now = Date.now();
    Object.keys(history.timestamps).forEach((pathname) => {
      const age = now - history.timestamps[pathname];
      if (age > MAX_STATE_AGE_MS) {
        delete history.scrollPositions[pathname];
        delete history.timestamps[pathname];
      }
    });

    return history;
  } catch (error) {
    console.error("Failed to get navigation history:", error);
    return { previousPathname: null, scrollPositions: {}, timestamps: {} };
  }
}

/**
 * Save navigation history
 */
function saveHistory(history: NavigationHistory): void {
  if (typeof window === "undefined") return;

  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch (error) {
    console.error("Failed to save navigation history:", error);
  }
}

/**
 * Save current page's scroll position
 */
export function saveNavigationState(pathname: string, scrollY: number): void {
  if (typeof window === "undefined") return;

  try {
    const history = getHistory();
    history.scrollPositions[pathname] = scrollY;
    history.timestamps[pathname] = Date.now();
    saveHistory(history);
  } catch (error) {
    console.error("Failed to save navigation state:", error);
  }
}

/**
 * Get scroll position for a specific pathname
 */
export function getScrollPosition(pathname: string): number | null {
  const history = getHistory();
  const scrollY = history.scrollPositions[pathname] ?? null;
  return scrollY;
}

/**
 * Get the previous navigation state (pathname and scroll position)
 * This returns the most recent page we navigated away from
 */
export function getPreviousNavigation(): NavigationState | null {
  const history = getHistory();
  
  if (!history.previousPathname) {
    return null;
  }

  const scrollY = history.scrollPositions[history.previousPathname] ?? 0;
  const timestamp = history.timestamps[history.previousPathname] ?? Date.now();

  return {
    pathname: history.previousPathname,
    scrollY,
    timestamp,
  };
}

/**
 * Set the previous pathname (called when navigating to a new page)
 */
export function setPreviousPathname(pathname: string | null): void {
  if (typeof window === "undefined") return;

  try {
    const history = getHistory();
    history.previousPathname = pathname;
    saveHistory(history);
  } catch (error) {
    console.error("Failed to set previous pathname:", error);
  }
}

/**
 * Clear navigation history
 */
export function clearNavigationHistory(): void {
  if (typeof window === "undefined") return;

  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error("Failed to clear navigation history:", error);
  }
}

/**
 * Check if there's a valid previous navigation
 */
export function hasPreviousNavigation(): boolean {
  return getPreviousNavigation() !== null;
}

/**
 * Check if we have a saved scroll position for a pathname
 */
export function hasScrollPosition(pathname: string): boolean {
  return getScrollPosition(pathname) !== null;
}

import { LRUCache } from "lru-cache";

// Cache TTLs in milliseconds
const CACHE_TTLS = {
  FEED: 30 * 1000, // 30 seconds
  USER_DATA: 5 * 60 * 1000, // 5 minutes
  CONVERSATION: 60 * 1000, // 1 minute
  NOTIFICATIONS: 15 * 1000, // 15 seconds
  SEARCH: 60 * 1000, // 1 minute
} as const;

// Create separate caches for different data types
const feedCache = new LRUCache<string, any>({
  max: 100, // Max 100 feed responses
  ttl: CACHE_TTLS.FEED,
});

const userCache = new LRUCache<string, any>({
  max: 1000, // Max 1000 user records
  ttl: CACHE_TTLS.USER_DATA,
});

const conversationCache = new LRUCache<string, any>({
  max: 200, // Max 200 conversations
  ttl: CACHE_TTLS.CONVERSATION,
});

const notificationCache = new LRUCache<string, any>({
  max: 50, // Max 50 notification responses
  ttl: CACHE_TTLS.NOTIFICATIONS,
});

const searchCache = new LRUCache<string, any>({
  max: 100, // Max 100 search results
  ttl: CACHE_TTLS.SEARCH,
});

/**
 * Generate a cache key from request parameters
 */
function generateCacheKey(prefix: string, params: Record<string, any>): string {
  const sortedParams = Object.keys(params)
    .sort()
    .map((key) => `${key}:${JSON.stringify(params[key])}`)
    .join("|");
  return `${prefix}:${sortedParams}`;
}

/**
 * Cache for feed responses
 */
export const cacheFeed = {
  get: (key: string) => feedCache.get(key),
  set: (key: string, value: any) => feedCache.set(key, value),
  generateKey: (params: Record<string, any>) =>
    generateCacheKey("feed", params),
  clear: () => feedCache.clear(),
};

/**
 * Cache for user data
 */
export const cacheUser = {
  get: (key: string) => userCache.get(key),
  set: (key: string, value: any) => userCache.set(key, value),
  generateKey: (fids: number[]) =>
    generateCacheKey("users", { fids: fids.sort((a, b) => a - b) }),
  clear: () => userCache.clear(),
};

/**
 * Cache for conversations
 */
export const cacheConversation = {
  get: (key: string) => conversationCache.get(key),
  set: (key: string, value: any) => conversationCache.set(key, value),
  generateKey: (params: Record<string, any>) =>
    generateCacheKey("conversation", params),
  clear: () => conversationCache.clear(),
};

/**
 * Cache for notifications
 */
export const cacheNotifications = {
  get: (key: string) => notificationCache.get(key),
  set: (key: string, value: any) => notificationCache.set(key, value),
  generateKey: (params: Record<string, any>) =>
    generateCacheKey("notifications", params),
  clear: () => notificationCache.clear(),
};

/**
 * Cache for search results
 */
export const cacheSearch = {
  get: (key: string) => searchCache.get(key),
  set: (key: string, value: any) => searchCache.set(key, value),
  generateKey: (params: Record<string, any>) =>
    generateCacheKey("search", params),
  clear: () => searchCache.clear(),
};

/**
 * Clear all caches (useful for testing or cache invalidation)
 */
export function clearAllCaches() {
  feedCache.clear();
  userCache.clear();
  conversationCache.clear();
  notificationCache.clear();
  searchCache.clear();
}

/**
 * Invalidate user cache for specific FIDs
 */
export function invalidateUserCache(fids: number[]) {
  for (const fid of fids) {
    // Try to find and delete cache entries for this user
    // Since we can't iterate LRU cache easily, we'll clear on user updates
    // For now, we rely on TTL expiration
  }
}


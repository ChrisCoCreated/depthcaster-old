import { neynarClient } from "./neynar";
import type { CustomFeed, UserFeedConfig, FidsFeedConfig } from "./customFeeds";

// Cache for resolved FIDs from usernames
const usernameToFidCache = new Map<string, number>();

async function resolveUsernameToFid(username: string): Promise<number | null> {
  // Remove @ if present
  const cleanUsername = username.replace(/^@/, "");
  
  // Check cache first
  if (usernameToFidCache.has(cleanUsername)) {
    return usernameToFidCache.get(cleanUsername)!;
  }

  try {
    const searchResult = await neynarClient.searchUser({
      q: cleanUsername,
      limit: 1,
    });
    const foundUser = searchResult.result?.users?.[0];
    if (foundUser) {
      usernameToFidCache.set(cleanUsername, foundUser.fid);
      return foundUser.fid;
    }
  } catch (error) {
    console.error(`Failed to resolve username ${username} to FID:`, error);
  }
  
  return null;
}

// Resolve any username-based filters to FIDs (server-only)
export async function resolveFeedFilters(feed: CustomFeed): Promise<CustomFeed> {
  const resolvedFeed = { ...feed };
  
  if (resolvedFeed.filters) {
    for (const filter of resolvedFeed.filters) {
      if (filter.type === "authorFid" && typeof filter.value === "string" && filter.value.startsWith("@")) {
        const fid = await resolveUsernameToFid(filter.value);
        if (fid) {
          filter.value = fid;
        }
      }
    }
  }
  
  // Also resolve username in UserFeedConfig
  if (resolvedFeed.feedType === "user") {
    const userConfig = resolvedFeed.feedConfig as UserFeedConfig;
    const fid = await resolveUsernameToFid(userConfig.username);
    if (fid) {
      // Convert to fids feed type for easier handling
      resolvedFeed.feedType = "fids";
      resolvedFeed.feedConfig = { fids: [fid] } as FidsFeedConfig;
    }
  }
  
  return resolvedFeed;
}


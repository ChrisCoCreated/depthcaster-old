import { neynarClient } from "./neynar";

export type FeedType = "channel" | "user" | "fids" | "custom";

export type FilterType = "authorFid" | "excludeRecasts" | "minLength" | "custom";

export interface FeedFilter {
  type: FilterType;
  value?: number | string | boolean;
}

export interface ChannelFeedConfig {
  channelId: string;
}

export interface UserFeedConfig {
  username: string;
}

export interface FidsFeedConfig {
  fids: number[];
}

export interface CustomFeedConfig {
  [key: string]: any;
}

export type FeedConfig = ChannelFeedConfig | UserFeedConfig | FidsFeedConfig | CustomFeedConfig;

export interface DisplayMode {
  replaceEmbeds: boolean;
  embedButtonText: string;
  embedButtonAction: "open-link" | "custom";
}

export interface HeaderConfig {
  showChannelHeader?: boolean;
  customTitle?: string;
  customDescription?: string;
}

export interface CustomFeed {
  slug: string;
  name: string;
  description?: string;
  feedType: FeedType;
  feedConfig: FeedConfig;
  filters?: FeedFilter[];
  displayMode?: DisplayMode;
  headerConfig?: HeaderConfig;
}

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

// Resolve any username-based filters to FIDs
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

// Custom feed configurations
export const customFeeds: CustomFeed[] = [
  {
    slug: "reframe",
    name: "Reframe",
    description: "Casts from the reframe channel by @christin",
    feedType: "channel",
    feedConfig: {
      channelId: "reframe",
    },
    filters: [
      {
        type: "authorFid",
        value: "@christin", // Will be resolved to FID at runtime
      },
    ],
    displayMode: {
      replaceEmbeds: true,
      embedButtonText: "Open Reframe",
      embedButtonAction: "open-link",
    },
    headerConfig: {
      showChannelHeader: true,
    },
  },
];

// Get feed by slug
export function getFeedBySlug(slug: string): CustomFeed | undefined {
  return customFeeds.find((feed) => feed.slug === slug);
}


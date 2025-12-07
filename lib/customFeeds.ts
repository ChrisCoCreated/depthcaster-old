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

// Custom feed configurations (client-safe, no server-side code)
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
        value: "@christin", // Will be resolved to FID at runtime on server
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

// Get feed by slug (client-safe, just reads from array)
export function getFeedBySlug(slug: string): CustomFeed | undefined {
  return customFeeds.find((feed) => feed.slug === slug);
}

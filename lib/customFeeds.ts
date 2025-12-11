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
  hideChannelLink?: boolean;
  hideUrlLinks?: boolean;
  hideAuthorInfo?: boolean; // Deprecated: use hideAuthorDisplayName, hideAuthorUsername, hideAuthorPfp instead
  hideAuthorDisplayName?: boolean;
  hideAuthorUsername?: boolean;
  hideAuthorPfp?: boolean;
  stripTextPrefix?: string | string[]; // Single prefix (backward compatible) or array of prefixes
  replaceCharacters?: Array<{ from: string; to: string }>; // Replace characters (e.g., { from: ";", to: "\n" })
  boldFirstLine?: boolean;
  buttonBackgroundColor?: string;
  buttonTextColor?: string;
  expandMentionedProfiles?: boolean;
  hideCuratedButton?: boolean;
  hideShareButton?: boolean;
}

export interface HeaderConfig {
  showChannelHeader?: boolean;
  customTitle?: string;
  customDescription?: string;
  headerImage?: string;
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
    description: "Daily optimistic science news from the reframe channel by @christin",
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
      embedButtonText: "Open this Reframe",
      embedButtonAction: "open-link",
      hideChannelLink: true,
      hideUrlLinks: true,
      hideAuthorInfo: true,
      stripTextPrefix: "Reframe Daily: ",
      boldFirstLine: true,
      buttonBackgroundColor: "#ffd268",
      buttonTextColor: "#000000",
    },
    headerConfig: {
      showChannelHeader: true,
      customTitle: "Reframe Daily",
      headerImage: "/images/instructions/reframebanner.jpg",
    },
  },
];

// Get feed by slug (client-safe, just reads from array)
export function getFeedBySlug(slug: string): CustomFeed | undefined {
  return customFeeds.find((feed) => feed.slug === slug);
}

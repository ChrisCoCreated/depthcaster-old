import { NextRequest, NextResponse } from "next/server";
import { neynarClient } from "@/lib/neynar";
import { FetchFeedFeedTypeEnum, FetchFeedFilterTypeEnum, FetchTrendingFeedTimeWindowEnum } from "@neynar/nodejs-sdk/build/api";
import { filterCast, sortCastsByQuality } from "@/lib/filters";
import { CURATED_FIDS, CURATED_CHANNELS } from "@/lib/curated";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const feedType = searchParams.get("feedType") || "curated";
    const viewerFid = searchParams.get("viewerFid") 
      ? parseInt(searchParams.get("viewerFid")!) 
      : undefined;
    const cursor = searchParams.get("cursor") || undefined;
    const limit = parseInt(searchParams.get("limit") || "30");

    let casts: any[] = [];

    if (feedType === "following" && viewerFid) {
      // Following feed
      const feed = await neynarClient.fetchFeed({
        feedType: FetchFeedFeedTypeEnum.Following,
        fid: viewerFid,
        limit,
        cursor,
        withRecasts: true,
      });
      casts = feed.casts || [];
    } else if (feedType === "curated") {
      // Curated FIDs feed (fallback to trending if no curated FIDs)
      if (CURATED_FIDS.length > 0) {
        const feed = await neynarClient.fetchFeed({
          feedType: FetchFeedFeedTypeEnum.Filter,
          filterType: FetchFeedFilterTypeEnum.Fids,
          fids: CURATED_FIDS.join(","),
          limit,
          cursor,
          withRecasts: true,
        });
        casts = feed.casts || [];
      } else {
        // Fallback to global trending if no curated FIDs
        const feed = await neynarClient.fetchFeed({
          feedType: FetchFeedFeedTypeEnum.Filter,
          filterType: FetchFeedFilterTypeEnum.GlobalTrending,
          limit,
          cursor,
          withRecasts: true,
          ...(viewerFid ? { viewerFid } : {}),
        });
        casts = feed.casts || [];
      }
    } else if (feedType === "channels" || feedType === "art") {
      // Channel feeds (fallback to trending if no channels)
      if (CURATED_CHANNELS.length > 0) {
        const feed = await neynarClient.fetchFeedByChannelIds({
          channelIds: CURATED_CHANNELS,
          limit,
          cursor,
          withRecasts: true,
          viewerFid,
        });
        casts = feed.casts || [];
      } else {
        // Fallback to global trending if no channels
        const feed = await neynarClient.fetchFeed({
          feedType: FetchFeedFeedTypeEnum.Filter,
          filterType: FetchFeedFilterTypeEnum.GlobalTrending,
          limit,
          cursor,
          withRecasts: true,
          ...(viewerFid ? { viewerFid } : {}),
        });
        casts = feed.casts || [];
      }
    } else if (feedType === "trending") {
      // Trending feed - use GlobalTrending filter which supports higher limits
      const feed = await neynarClient.fetchFeed({
        feedType: FetchFeedFeedTypeEnum.Filter,
        filterType: FetchFeedFilterTypeEnum.GlobalTrending,
        limit,
        cursor,
        withRecasts: true,
        ...(viewerFid ? { viewerFid } : {}),
      });
      casts = feed.casts || [];
    } else {
      // Default: combine multiple sources
      const [curatedFeed, channelsFeed, trendingFeed] = await Promise.all([
        CURATED_FIDS.length > 0
          ? neynarClient.fetchFeed({
              feedType: FetchFeedFeedTypeEnum.Filter,
              filterType: FetchFeedFilterTypeEnum.Fids,
              fids: CURATED_FIDS.join(","),
              limit: Math.floor(limit / 3),
              withRecasts: true,
            }).catch(() => ({ casts: [] }))
          : Promise.resolve({ casts: [] }),
        CURATED_CHANNELS.length > 0
          ? neynarClient.fetchFeedByChannelIds({
              channelIds: CURATED_CHANNELS,
              limit: Math.floor(limit / 3),
              withRecasts: true,
              viewerFid,
            }).catch(() => ({ casts: [] }))
          : Promise.resolve({ casts: [] }),
        neynarClient.fetchFeed({
          feedType: FetchFeedFeedTypeEnum.Filter,
          filterType: FetchFeedFilterTypeEnum.GlobalTrending,
          limit: Math.floor(limit / 3),
          withRecasts: true,
          ...(viewerFid ? { viewerFid } : {}),
        }).catch(() => ({ casts: [] })),
      ]);

      // Merge and deduplicate casts
      const castMap = new Map();
      [...(curatedFeed.casts || []), ...(channelsFeed.casts || []), ...(trendingFeed.casts || [])].forEach((cast) => {
        if (!castMap.has(cast.hash)) {
          castMap.set(cast.hash, cast);
        }
      });
      casts = Array.from(castMap.values());
    }

    // Apply quality filters
    const filteredCasts = casts.filter((cast) => {
      // Use experimental flag is already set via headers in the client
      return filterCast(cast, {
        minLength: feedType === "deep-thoughts" ? 100 : 50,
        minUserScore: 0.55,
        minReplies: feedType === "conversations" ? 2 : 0,
      });
    });

    // Sort by quality score
    const sortedCasts = sortCastsByQuality(filteredCasts);

    // Get next cursor from the last successful request
    const nextCursor = casts.length > 0 ? (casts[casts.length - 1] as any).hash : null;

    return NextResponse.json({
      casts: sortedCasts.slice(0, limit),
      next: { cursor: nextCursor },
    });
  } catch (error: any) {
    console.error("Feed API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch feed" },
      { status: 500 }
    );
  }
}


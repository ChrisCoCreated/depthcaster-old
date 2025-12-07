import { NextRequest, NextResponse } from "next/server";
import { neynarClient } from "@/lib/neynar";
import { FetchFeedFeedTypeEnum, FetchFeedFilterTypeEnum } from "@neynar/nodejs-sdk/build/api";
import { deduplicateRequest } from "@/lib/neynar-batch";
import { enrichCastsWithViewerContext } from "@/lib/interactions";
import { getFeedBySlug, type CustomFeed } from "@/lib/customFeeds";
import { resolveFeedFilters } from "@/lib/customFeeds.server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const searchParams = request.nextUrl.searchParams;
    const viewerFid = searchParams.get("viewerFid")
      ? parseInt(searchParams.get("viewerFid")!)
      : undefined;
    const cursor = searchParams.get("cursor") || undefined;
    const limit = parseInt(searchParams.get("limit") || "25");

    // Get feed configuration
    const feedConfig = getFeedBySlug(slug);
    if (!feedConfig) {
      return NextResponse.json(
        { error: "Custom feed not found" },
        { status: 404 }
      );
    }

    // Resolve any username-based filters to FIDs
    const resolvedFeed = await resolveFeedFilters(feedConfig);

    // Fetch casts based on feed type
    let casts: any[] = [];
    let neynarCursor: string | null = null;

    if (resolvedFeed.feedType === "channel") {
      const channelConfig = resolvedFeed.feedConfig as { channelId: string };
      const feed = await deduplicateRequest(
        `custom-feed-${slug}-${channelConfig.channelId}-${viewerFid || "none"}-${cursor || "initial"}-${limit}`,
        async () => {
          return await neynarClient.fetchFeed({
            feedType: FetchFeedFeedTypeEnum.Filter,
            filterType: FetchFeedFilterTypeEnum.ChannelId,
            channelId: channelConfig.channelId,
            limit,
            cursor,
            withRecasts: true,
            ...(viewerFid ? { viewerFid } : {}),
          });
        }
      );
      casts = feed.casts || [];
      neynarCursor = feed.next?.cursor || null;
    } else if (resolvedFeed.feedType === "fids") {
      const fidsConfig = resolvedFeed.feedConfig as { fids: number[] };
      const feed = await deduplicateRequest(
        `custom-feed-${slug}-fids-${fidsConfig.fids.join(",")}-${viewerFid || "none"}-${cursor || "initial"}-${limit}`,
        async () => {
          return await neynarClient.fetchFeed({
            feedType: FetchFeedFeedTypeEnum.Filter,
            filterType: FetchFeedFilterTypeEnum.Fids,
            fids: fidsConfig.fids,
            limit,
            cursor,
            withRecasts: true,
            ...(viewerFid ? { viewerFid } : {}),
          });
        }
      );
      casts = feed.casts || [];
      neynarCursor = feed.next?.cursor || null;
    } else {
      return NextResponse.json(
        { error: `Unsupported feed type: ${resolvedFeed.feedType}` },
        { status: 400 }
      );
    }

    // Apply filters
    if (resolvedFeed.filters && resolvedFeed.filters.length > 0) {
      casts = casts.filter((cast) => {
        for (const filter of resolvedFeed.filters!) {
          if (filter.type === "authorFid" && typeof filter.value === "number") {
            if (cast.author?.fid !== filter.value) {
              return false;
            }
          } else if (filter.type === "excludeRecasts" && filter.value === true) {
            if (cast.parent_hash) {
              return false;
            }
          } else if (filter.type === "minLength" && typeof filter.value === "number") {
            if (!cast.text || cast.text.length < filter.value) {
              return false;
            }
          }
        }
        return true;
      });
    }

    // Enrich casts with viewer context from database
    if (viewerFid) {
      casts = await enrichCastsWithViewerContext(casts, viewerFid);
    }

    // Extract channel info from first cast if available
    let channelInfo = null;
    if (casts.length > 0 && casts[0].channel) {
      channelInfo = {
        id: casts[0].channel.id,
        name: casts[0].channel.name,
        description: casts[0].channel.description,
        imageUrl: casts[0].channel.image_url,
      };
    }

    const response = {
      casts,
      next: neynarCursor ? { cursor: neynarCursor } : null,
      feed: {
        name: resolvedFeed.name,
        description: resolvedFeed.description,
        displayMode: resolvedFeed.displayMode,
        headerConfig: resolvedFeed.headerConfig,
      },
      channel: channelInfo,
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("Custom feed API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch custom feed" },
      { status: 500 }
    );
  }
}


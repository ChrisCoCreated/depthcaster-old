import { NextRequest, NextResponse } from "next/server";
import { neynarClient } from "@/lib/neynar";
import { FetchFeedFeedTypeEnum, FetchFeedFilterTypeEnum, FetchTrendingFeedTimeWindowEnum } from "@neynar/nodejs-sdk/build/api";
import { filterCast, sortCastsByQuality } from "@/lib/filters";
import { CURATED_FIDS, CURATED_CHANNELS } from "@/lib/curated";
import { db } from "@/lib/db";
import { curatorPackUsers, curatedCasts } from "@/lib/schema";
import { eq, inArray, desc, lt } from "drizzle-orm";
import { cacheFeed } from "@/lib/cache";
import { deduplicateRequest } from "@/lib/neynar-batch";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const feedType = searchParams.get("feedType") || "curated";
    const viewerFid = searchParams.get("viewerFid") 
      ? parseInt(searchParams.get("viewerFid")!) 
      : undefined;
    const cursor = searchParams.get("cursor") || undefined;
    const limit = parseInt(searchParams.get("limit") || "30");
    const packIds = searchParams.get("packIds")?.split(",").filter(Boolean) || [];

    // Generate cache key
    const cacheKey = cacheFeed.generateKey({
      feedType,
      viewerFid,
      cursor,
      limit,
      packIds: packIds.sort().join(","),
    });

    // Check cache first
    const cachedResult = cacheFeed.get(cacheKey);
    if (cachedResult) {
      return NextResponse.json(cachedResult);
    }

    let casts: any[] = [];
    let neynarCursor: string | null = null;

    // If packIds provided, fetch FIDs from packs and use them for filtering
    let packFids: number[] = [];
    if (packIds.length > 0) {
      const packUsers = await db
        .select({
          userFid: curatorPackUsers.userFid,
        })
        .from(curatorPackUsers)
        .where(inArray(curatorPackUsers.packId, packIds));
      
      // Get unique FIDs from all packs
      packFids = [...new Set(packUsers.map((pu) => pu.userFid))];
    }

    if (feedType === "following" && viewerFid) {
      // Following feed
      const feed = await deduplicateRequest(
        `feed-following-${viewerFid}-${cursor}-${limit}`,
        async () => {
          return await neynarClient.fetchFeed({
            feedType: FetchFeedFeedTypeEnum.Following,
            fid: viewerFid,
            limit,
            cursor,
            withRecasts: true,
          });
        }
      );
      casts = feed.casts || [];
      neynarCursor = feed.next?.cursor || null;
    } else if (packIds.length > 0 && packFids.length > 0) {
      // Curator packs feed - use FIDs from selected packs
      // Neynar API has limits on fids parameter, so we may need to handle large lists
      
      // Only use cursor if it looks like a valid Neynar cursor (not a cast hash)
      // Cast hashes start with 0x, Neynar cursors are typically different format
      const validCursor = cursor && !cursor.startsWith("0x") ? cursor : undefined;
      
      try {
        const feed = await deduplicateRequest(
          `feed-packs-${packFids.join(",")}-${viewerFid}-${validCursor || "initial"}-${limit}`,
          async () => {
            return await neynarClient.fetchFeed({
              feedType: FetchFeedFeedTypeEnum.Filter,
              filterType: FetchFeedFilterTypeEnum.Fids,
              fids: packFids,
              limit,
              ...(validCursor ? { cursor: validCursor } : {}),
              withRecasts: true,
              ...(viewerFid ? { viewerFid } : {}),
            });
          }
        );
        casts = feed.casts || [];
        neynarCursor = feed.next?.cursor || null;
        
        // Filter to only include casts from users in the pack
        // This ensures we don't show recasts from pack users of content from non-pack users
        const packFidsSet = new Set(packFids);
        casts = casts.filter((cast) => {
          const authorFid = cast.author?.fid;
          return authorFid && packFidsSet.has(authorFid);
        });
      } catch (error: any) {
        console.error("Error fetching pack feed:", error);
        console.error("Error details:", {
          fidsCount: packFids.length,
          fidsString: packFids.join(",").substring(0, 100),
          cursor,
          validCursor,
          errorMessage: error.message,
        });
        // If Neynar API fails, return empty results rather than crashing
        casts = [];
        neynarCursor = null;
      }
    } else if (feedType === "curated") {
      // Fetch curated casts from database
      let queryBuilder = db
        .select()
        .from(curatedCasts);

      // If cursor provided, use it for pagination (cursor is the created_at timestamp)
      if (cursor) {
        try {
          const cursorDate = new Date(cursor);
          queryBuilder = queryBuilder.where(lt(curatedCasts.createdAt, cursorDate));
        } catch {
          // Invalid cursor, ignore it
        }
      }

      const curatedResults = await queryBuilder
        .orderBy(desc(curatedCasts.createdAt))
        .limit(limit + 1); // Fetch one extra to check if there's more
      
      // Extract cast data from stored JSONB
      casts = curatedResults.slice(0, limit).map((row) => row.castData as any);
      
      // Set cursor to the last item's created_at timestamp if there are more results
      if (curatedResults.length > limit) {
        const lastItem = curatedResults[limit - 1];
        neynarCursor = lastItem.createdAt.toISOString();
      } else {
        neynarCursor = null;
      }
    } else if (feedType === "channels" || feedType === "art") {
      // Channel feeds (fallback to trending if no channels)
      if (CURATED_CHANNELS.length > 0) {
        const feed = await deduplicateRequest(
          `feed-channels-${CURATED_CHANNELS.join(",")}-${viewerFid}-${cursor}-${limit}`,
          async () => {
            return await neynarClient.fetchFeedByChannelIds({
              channelIds: CURATED_CHANNELS,
              limit,
              cursor,
              withRecasts: true,
              viewerFid,
            });
          }
        );
        casts = feed.casts || [];
        neynarCursor = feed.next?.cursor || null;
      } else {
        // Fallback to global trending if no channels
        const feed = await deduplicateRequest(
          `feed-trending-${viewerFid}-${cursor}-${limit}`,
          async () => {
            return await neynarClient.fetchFeed({
              feedType: FetchFeedFeedTypeEnum.Filter,
              filterType: FetchFeedFilterTypeEnum.GlobalTrending,
              limit,
              cursor,
              withRecasts: true,
              ...(viewerFid ? { viewerFid } : {}),
            });
          }
        );
        casts = feed.casts || [];
        neynarCursor = feed.next?.cursor || null;
      }
    } else if (feedType === "trending") {
      // Trending feed - use GlobalTrending filter which supports higher limits
      const feed = await deduplicateRequest(
        `feed-trending-${viewerFid}-${cursor}-${limit}`,
        async () => {
          return await neynarClient.fetchFeed({
            feedType: FetchFeedFeedTypeEnum.Filter,
            filterType: FetchFeedFilterTypeEnum.GlobalTrending,
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
      // Default: Optimize to use single GlobalTrending call instead of 3 parallel calls
      // This reduces API calls significantly while still providing good content
      const feed = await deduplicateRequest(
        `feed-default-${viewerFid}-${cursor}-${limit}`,
        async () => {
          return await neynarClient.fetchFeed({
            feedType: FetchFeedFeedTypeEnum.Filter,
            filterType: FetchFeedFilterTypeEnum.GlobalTrending,
            limit,
            cursor,
            withRecasts: true,
            ...(viewerFid ? { viewerFid } : {}),
          });
        }
      );
      casts = feed.casts || [];
      neynarCursor = feed.next?.cursor || null;
    }

    // Apply quality filters (skip for curated feed since casts are already manually curated)
    const filteredCasts = feedType === "curated" 
      ? casts 
      : casts.filter((cast) => {
          // Use experimental flag is already set via headers in the client
          return filterCast(cast, {
            minLength: feedType === "deep-thoughts" ? 100 : 50,
            minUserScore: 0.55,
            minReplies: feedType === "conversations" ? 2 : 0,
          });
        });

    // Sort by quality score (skip for curated feed, already sorted by created_at)
    const sortedCasts = feedType === "curated"
      ? filteredCasts
      : sortCastsByQuality(filteredCasts);

    // Use Neynar's cursor if available, otherwise use last cast hash from filtered results
    // Only set cursor if we have results and there might be more
    const finalCasts = sortedCasts.slice(0, limit);
    let nextCursor: string | null = null;
    
    if (feedType === "curated") {
      // For curated feed, use the timestamp cursor we already set
      nextCursor = neynarCursor;
    } else if (neynarCursor) {
      // Use Neynar's cursor if available
      nextCursor = neynarCursor;
    } else if (finalCasts.length > 0 && casts.length >= limit) {
      // If we filtered results but got a full page from Neynar, use last cast hash
      nextCursor = finalCasts[finalCasts.length - 1]?.hash || null;
    }

    const response = {
      casts: finalCasts,
      next: { cursor: nextCursor },
    };

    // Cache the response
    cacheFeed.set(cacheKey, response);

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("Feed API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch feed" },
      { status: 500 }
    );
  }
}


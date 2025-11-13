import { NextRequest, NextResponse } from "next/server";
import { neynarClient } from "@/lib/neynar";
import { FetchFeedFeedTypeEnum, FetchFeedFilterTypeEnum, FetchTrendingFeedTimeWindowEnum, FetchFeedForYouProviderEnum } from "@neynar/nodejs-sdk/build/api";
import { filterCast, sortCastsByQuality } from "@/lib/filters";
import { CURATED_FIDS, CURATED_CHANNELS } from "@/lib/curated";
import { db } from "@/lib/db";
import { curatorPackUsers, curatedCasts, curatedCastInteractions, curatorPacks, users, curatorCastCurations } from "@/lib/schema";
import { eq, inArray, desc, lt, and, sql, asc } from "drizzle-orm";
import { cacheFeed } from "@/lib/cache";
import { deduplicateRequest } from "@/lib/neynar-batch";
import { getUser } from "@/lib/users";
import { shouldHideBotCast, shouldHideBotCastClient } from "@/lib/bot-filter";

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
    const provider = searchParams.get("provider") || undefined;
    const providerMetadata = searchParams.get("provider_metadata") || undefined;
    
    // Filter preferences from query params
    const hideDollarCasts = searchParams.get("hideDollarCasts") === "true";
    const hideShortCasts = searchParams.get("hideShortCasts") === "true";
    const minCastLength = searchParams.get("minCastLength") 
      ? parseInt(searchParams.get("minCastLength")!) 
      : 50;
    const hideTradingWords = searchParams.get("hideTradingWords") === "true";
    const tradingWords = searchParams.get("tradingWords")
      ? searchParams.get("tradingWords")!.split(",").filter(Boolean)
      : [];
    const selectedCuratorFids = searchParams.get("curatorFids")
      ? searchParams.get("curatorFids")!.split(",").map(fid => parseInt(fid)).filter(fid => !isNaN(fid))
      : [];
    const hideRecasts = searchParams.get("hideRecasts") === "true";

    // Fetch user preferences for bot filtering
    let userBotPreferences: { hideBots?: boolean; hiddenBots?: string[] } = {};
    if (viewerFid) {
      try {
        const user = await getUser(viewerFid);
        const preferences = (user?.preferences || {}) as { hideBots?: boolean; hiddenBots?: string[] };
        userBotPreferences = {
          hideBots: preferences.hideBots !== undefined ? preferences.hideBots : true,
          hiddenBots: preferences.hiddenBots || ["betonbangers", "deepbot", "bracky"],
        };
      } catch (error) {
        console.error("Error fetching user preferences:", error);
        // Use defaults
        userBotPreferences = {
          hideBots: true,
          hiddenBots: ["betonbangers", "deepbot", "bracky"],
        };
      }
    } else {
      // Default behavior when no viewer
      userBotPreferences = {
        hideBots: true,
        hiddenBots: ["betonbangers", "deepbot", "bracky"],
      };
    }

    // Generate cache key (include filter params)
    const cacheKey = cacheFeed.generateKey({
      feedType,
      viewerFid,
      cursor,
      limit,
      packIds: packIds.sort().join(","),
      hideDollarCasts,
      hideShortCasts,
      minCastLength,
      hideTradingWords,
      tradingWords: tradingWords.sort().join(","),
      curatorFids: selectedCuratorFids.sort().join(","),
      provider,
      providerMetadata,
      hideRecasts,
    });

    // Check cache first
    const cachedResult = cacheFeed.get(cacheKey);
    if (cachedResult) {
      return NextResponse.json(cachedResult);
    }

    let casts: any[] = [];
    let neynarCursor: string | null = null;

    // If packIds provided (and NOT my-37 feed), fetch FIDs from packs and use them for filtering
    // My 37 feed fetches its pack separately below
    let packFids: number[] = [];
    if (packIds.length > 0 && feedType !== "my-37") {
      const packUsers = await db
        .select({
          userFid: curatorPackUsers.userFid,
        })
        .from(curatorPackUsers)
        .where(inArray(curatorPackUsers.packId, packIds));
      
      // Get unique FIDs from all packs
      packFids = [...new Set(packUsers.map((pu) => pu.userFid))];
    }

    if (feedType === "my-37" && viewerFid) {
      // My 37 feed - fetch user's "My 37" pack
      try {
        const packsResponse = await db
          .select({
            id: curatorPacks.id,
          })
          .from(curatorPacks)
          .where(
            and(
              eq(curatorPacks.creatorFid, viewerFid),
              eq(curatorPacks.name, "My 37")
            )
          )
          .limit(1);

        if (packsResponse.length > 0) {
          const my37PackId = packsResponse[0].id;
          // Fetch FIDs from My 37 pack
          const packUsers = await db
            .select({
              userFid: curatorPackUsers.userFid,
            })
            .from(curatorPackUsers)
            .where(eq(curatorPackUsers.packId, my37PackId));
          
          packFids = packUsers.map((pu) => pu.userFid);
        }
      } catch (error) {
        console.error("Error fetching My 37 pack:", error);
      }
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
    } else if (feedType === "my-37" && packFids.length === 0) {
      // My 37 feed with no users selected - return empty feed
      casts = [];
      neynarCursor = null;
    } else if (feedType === "my-37" && packFids.length > 0) {
      // My 37 feed - use FIDs from My 37 pack only
      // Neynar API has limits on fids parameter, so we may need to handle large lists
      
      // Only use cursor if it looks like a valid Neynar cursor (not a cast hash)
      // Cast hashes start with 0x, Neynar cursors are typically different format
      const validCursor = cursor && !cursor.startsWith("0x") ? cursor : undefined;
      
      try {
        const feed = await deduplicateRequest(
          `feed-my37-${packFids.join(",")}-${viewerFid}-${validCursor || "initial"}-${limit}`,
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
        // This ensures we only show casts authored by pack users
        const packFidsSet = new Set(packFids);
        casts = casts.filter((cast) => {
          const authorFid = cast.author?.fid;
          // Only show casts authored by pack users
          if (!authorFid || !packFidsSet.has(authorFid)) {
            return false;
          }
          // Filter out recasts if hideRecasts is enabled
          if (hideRecasts && cast.parent_hash) {
            return false;
          }
          return true;
        });
      } catch (error: any) {
        console.error("Error fetching My 37 feed:", error);
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
    } else if (packIds.length > 0 && packFids.length > 0) {
      // Curator packs feed - use FIDs from selected packs (not My 37)
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
      // Fetch curated casts from database with reply bumping
      // Sort by latest reply time (COALESCE with cast creation time)
      // Join with curatorCastCurations to only show casts that have at least one curator
      
      // Build where conditions for curator filtering
      const curatorWhereConditions = [];
      
      // Only show curations from selected curators
      // If curators are selected, filter to only show those curations
      // If no curators are selected, default to showing curators with role="curator"
      if (selectedCuratorFids.length > 0) {
        curatorWhereConditions.push(inArray(curatorCastCurations.curatorFid, selectedCuratorFids));
      } else {
        // Default: show only curators with role="curator"
        const curatorRoleUsers = await db
          .select({ fid: users.fid })
          .from(users)
          .where(eq(users.role, "curator"));
        
        const curatorRoleFids = curatorRoleUsers.map((u) => u.fid);
        if (curatorRoleFids.length > 0) {
          curatorWhereConditions.push(inArray(curatorCastCurations.curatorFid, curatorRoleFids));
        } else {
          // If no curators with role exist, return empty results
          return NextResponse.json({
            casts: [],
            next: { cursor: null },
          });
        }
      }

      // Query with join to curatorCastCurations to only show casts with active curators
      // Use a subquery to get distinct cast hashes that have curators matching our filter
      const castHashesWithCurators = await db
        .selectDistinct({ castHash: curatorCastCurations.castHash })
        .from(curatorCastCurations)
        .where(curatorWhereConditions.length > 0 ? and(...curatorWhereConditions) : undefined);

      const castHashSet = new Set(castHashesWithCurators.map(c => c.castHash));
      
      if (castHashSet.size === 0) {
        return NextResponse.json({
          casts: [],
          next: { cursor: null },
        });
      }

      // Query curated casts that have active curators
      let query = db
        .select({
          id: curatedCasts.id,
          castHash: curatedCasts.castHash,
          castData: curatedCasts.castData,
          topReplies: curatedCasts.topReplies,
          repliesUpdatedAt: curatedCasts.repliesUpdatedAt,
          createdAt: curatedCasts.createdAt,
          latestInteractionTime: sql<Date | null>`(
            SELECT MAX(${curatedCastInteractions.createdAt})
            FROM ${curatedCastInteractions}
            WHERE ${curatedCastInteractions.curatedCastHash} = ${curatedCasts.castHash}
          )`.as("latest_interaction_time"),
        })
        .from(curatedCasts)
        .where(inArray(curatedCasts.castHash, Array.from(castHashSet)));

      // Sort by latest interaction time (or cast creation time if no interactions)
      // Use COALESCE to fall back to cast creation time
      const curatedResults = await query
        .orderBy(desc(sql`COALESCE((
          SELECT MAX(${curatedCastInteractions.createdAt})
          FROM ${curatedCastInteractions}
          WHERE ${curatedCastInteractions.curatedCastHash} = ${curatedCasts.castHash}
        ), ${curatedCasts.createdAt})`))
        .limit(limit + 1); // Fetch one extra to check if there's more

      // If cursor provided, filter results after sorting
      // Note: Cursor logic needs to be adjusted since we're sorting by interaction time now
      let filteredResults = curatedResults;
      if (cursor) {
        try {
          const cursorDate = new Date(cursor);
          // Filter by comparing the sort value (latest interaction time or cast creation time)
          filteredResults = curatedResults.filter((row) => {
            const sortTime = row.latestInteractionTime || row.createdAt;
            return sortTime < cursorDate;
          });
        } catch {
          // Invalid cursor, ignore it
        }
      }
      
      // Extract cast data from stored JSONB
      // Fetch curator info for each cast hash from curatorCastCurations
      const castHashes = filteredResults.map(r => r.castHash);
      const curatorInfoByCastHash = new Map<string, Array<{ fid: number; username?: string; display_name?: string; pfp_url?: string }>>();
      
      if (castHashes.length > 0) {
        // Get all curators for these casts
        const curatorsForCasts = await db
          .select({
            castHash: curatorCastCurations.castHash,
            curatorFid: curatorCastCurations.curatorFid,
            username: users.username,
            displayName: users.displayName,
            pfpUrl: users.pfpUrl,
          })
          .from(curatorCastCurations)
          .leftJoin(users, eq(curatorCastCurations.curatorFid, users.fid))
          .where(inArray(curatorCastCurations.castHash, castHashes))
          .orderBy(curatorCastCurations.castHash, asc(curatorCastCurations.createdAt));
        
        // Group curators by cast hash
        for (const c of curatorsForCasts) {
          if (!curatorInfoByCastHash.has(c.castHash)) {
            curatorInfoByCastHash.set(c.castHash, []);
          }
          curatorInfoByCastHash.get(c.castHash)!.push({
            fid: c.curatorFid,
            username: c.username || undefined,
            display_name: c.displayName || undefined,
            pfp_url: c.pfpUrl || undefined,
          });
        }
      }
      
      casts = filteredResults.slice(0, limit).map((row) => {
        const cast = row.castData as any;
        // Add curator info to the cast object
        const curators = curatorInfoByCastHash.get(row.castHash) || [];
        if (curators.length > 0) {
          cast._curatorFid = curators[0].fid; // Keep first curator for backward compatibility
          const curatorInfo = curators[0];
          if (curatorInfo) {
            cast._curatorInfo = curatorInfo;
          }
        }
        // Add top replies and replies updated timestamp
        if (row.topReplies) {
          cast._topReplies = row.topReplies;
        }
        if (row.repliesUpdatedAt) {
          cast._repliesUpdatedAt = row.repliesUpdatedAt;
        }
        return cast;
      });
      
      // Set cursor to the last item's sort time (latest interaction or cast creation) if there are more results
      if (filteredResults.length > limit) {
        const lastItem = filteredResults[limit - 1];
        const sortTime = lastItem.latestInteractionTime || lastItem.createdAt;
        neynarCursor = sortTime.toISOString();
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
    } else if (feedType === "for-you" && viewerFid) {
      // For You feed - personalized feed using Neynar's algorithm
      // Default to Neynar provider (SDK enum), but also support string values for openrank/mbd
      const forYouProvider = provider 
        ? (provider === "openrank" || provider === "mbd" || provider === "karma3" 
            ? provider as any // SDK enum only has "neynar", but API supports these
            : FetchFeedForYouProviderEnum.Neynar)
        : FetchFeedForYouProviderEnum.Neynar;
      
      const feed = await deduplicateRequest(
        `feed-for-you-${viewerFid}-${provider || "neynar"}-${providerMetadata || "default"}-${cursor}-${limit}`,
        async () => {
          return await neynarClient.fetchFeedForYou({
            fid: viewerFid,
            viewerFid: viewerFid,
            provider: forYouProvider,
            limit,
            cursor,
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
    // Use user preferences for bot filtering
    let filteredCasts: any[];
    
    if (feedType === "curated") {
      // For curated feed, apply bot filtering using already-fetched preferences
      filteredCasts = casts.filter((cast) => {
        if (userBotPreferences.hideBots) {
          return !shouldHideBotCastClient(cast, userBotPreferences.hiddenBots, userBotPreferences.hideBots);
        }
        return true;
      });
    } else if (feedType === "following" || feedType === "for-you") {
      // For following and for-you feeds: apply bot filtering and user preferences
      filteredCasts = casts.filter((cast) => {
        if (userBotPreferences.hideBots) {
          const shouldHide = shouldHideBotCastClient(cast, userBotPreferences.hiddenBots, userBotPreferences.hideBots);
          if (shouldHide) return false;
        }
        
        // Apply user filter preferences
        if (hideDollarCasts && cast.text?.includes("$")) {
          return false;
        }
        if (hideShortCasts && cast.text && cast.text.length < minCastLength) {
          return false;
        }
        if (hideTradingWords && cast.text && tradingWords.length > 0) {
          const textLower = cast.text.toLowerCase();
          const hasTradingWord = tradingWords.some((word) =>
            textLower.includes(word.toLowerCase())
          );
          if (hasTradingWord) return false;
        }
        
        return true;
      });
    } else {
      // For other feeds: use filterCast with bot preferences
      filteredCasts = casts.filter((cast) => {
        const passesQualityFilter = filterCast(cast, {
          minLength: feedType === "deep-thoughts" ? 100 : 50,
          minUserScore: 0.55,
          minReplies: feedType === "conversations" ? 2 : 0,
          hiddenBots: userBotPreferences.hiddenBots,
          hideBots: userBotPreferences.hideBots,
          viewerFid,
        });
        
        if (!passesQualityFilter) return false;
        
        // Apply user filter preferences
        if (hideDollarCasts && cast.text?.includes("$")) {
          return false;
        }
        if (hideShortCasts && cast.text && cast.text.length < minCastLength) {
          return false;
        }
        if (hideTradingWords && cast.text && tradingWords.length > 0) {
          const textLower = cast.text.toLowerCase();
          const hasTradingWord = tradingWords.some((word) =>
            textLower.includes(word.toLowerCase())
          );
          if (hasTradingWord) return false;
        }
        
        return true;
      });
    }

    // Sort by quality score (skip for curated, for-you, and my-37 feeds)
    // my-37 uses Neynar's default sorting, curated and for-you are already sorted by algorithm
    const sortedCasts = feedType === "curated" || feedType === "for-you" || feedType === "my-37"
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


import { NextRequest, NextResponse } from "next/server";
import { neynarClient } from "@/lib/neynar";
import { FetchFeedFeedTypeEnum, FetchFeedFilterTypeEnum, FetchTrendingFeedTimeWindowEnum, FetchFeedForYouProviderEnum, LookupCastConversationTypeEnum } from "@neynar/nodejs-sdk/build/api";
import { filterCast, sortCastsByQuality } from "@/lib/filters";
import { calculateEngagementScore } from "@/lib/engagement";
import { CURATED_FIDS, CURATED_CHANNELS } from "@/lib/curated";
import { db } from "@/lib/db";
import { curatorPackUsers, curatedCasts, curatedCastInteractions, curatorPacks, users, curatorCastCurations, castReplies, userRoles } from "@/lib/schema";
import { enrichCastsWithViewerContext } from "@/lib/interactions";
import { eq, inArray, desc, lt, and, sql, asc, or, gte } from "drizzle-orm";
import { cacheFeed, cacheCuratorRoleUsers } from "@/lib/cache";
import { deduplicateRequest } from "@/lib/neynar-batch";
import { getUser, getLastCuratedFeedView, updateLastCuratedFeedView } from "@/lib/users";
import { shouldHideBotCast, shouldHideBotCastClient } from "@/lib/bot-filter";
import { CURATOR_ROLES } from "@/lib/roles";
import { isQuoteCast } from "@/lib/conversation";

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
    const sortBy = searchParams.get("sortBy") || "recent-reply"; // "recently-curated" | "time-of-cast" | "recent-reply" | "quality"
    const category = searchParams.get("category") || undefined; // Category filter
    const minQualityScore = searchParams.get("minQualityScore")
      ? parseInt(searchParams.get("minQualityScore")!)
      : 60; // Quality filter, default to 60 (0.6 * 100)

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
      sortBy, // Include sortBy in cache key so different sorts get different cache entries
      category, // Include category in cache key
      minQualityScore, // Include quality filter in cache key
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
      const feedStartTime = Date.now();
      console.log(`[Feed] Starting curated feed fetch - limit: ${limit}, sortBy: ${sortBy}, cursor: ${cursor || 'none'}`);
      
      // Build where conditions for curator filtering
      const curatorWhereConditions = [];
      
      // Only show curations from selected curators
      // If curators are selected, filter to only show those curations
      // If no curators are selected, default to showing all users with curator role
      if (selectedCuratorFids.length > 0) {
        curatorWhereConditions.push(inArray(curatorCastCurations.curatorFid, selectedCuratorFids));
      } else {
        // Default: show curators with curator role
        // Check cache first
        let curatorRoleFids: number[] | undefined = cacheCuratorRoleUsers.get();
        
        if (!curatorRoleFids) {
          const curatorRoleUsers = await db
            .selectDistinct({ fid: users.fid })
            .from(users)
            .innerJoin(userRoles, eq(users.fid, userRoles.userFid))
            .where(inArray(userRoles.role, CURATOR_ROLES));
          
          curatorRoleFids = curatorRoleUsers.map((u) => u.fid);
          // Cache the result
          cacheCuratorRoleUsers.set(curatorRoleFids);
        }
        
        if (curatorRoleFids.length > 0) {
          curatorWhereConditions.push(inArray(curatorCastCurations.curatorFid, curatorRoleFids));
        } else {
          // If no curators with any curator role exist, return empty results
          return NextResponse.json({
            casts: [],
            next: { cursor: null },
          });
        }
      }

      // Optimized approach: Use database-level LIMIT before expensive operations
      // This dramatically reduces compute by processing only the top N casts
      console.log(`[Feed] Starting optimized curated feed fetch - limit: ${limit}, sortBy: ${sortBy}, cursor: ${cursor || 'none'}`);
      
      const queryStartTime = Date.now();
      const lastSessionTimestamp: Date | null = viewerFid 
        ? await getLastCuratedFeedView(viewerFid).catch(() => null)
        : null;

      // Helper function to ensure we have a Date object
      const toDate = (value: Date | string | null | undefined, fallback: Date): Date => {
        if (!value) return fallback;
        if (value instanceof Date) return value;
        if (typeof value === 'string') return new Date(value);
        return fallback;
      };

      // Build base curator filter condition
      const curatorFilter = curatorWhereConditions.length > 0 ? and(...curatorWhereConditions) : undefined;
      
      // Build base curated_casts filter (category and quality)
      const curatedCastsFilter = and(
        category ? eq(curatedCasts.category, category) : undefined,
        gte(curatedCasts.qualityScore, minQualityScore)
      );

      let selectedCastHashes: string[] = [];
      let castsWithSortData: Array<{ castHash: string; sortTime: Date; qualityScore: number | null }> = [];

      // Optimized queries per sort type - get top N cast hashes BEFORE expensive operations
      if (sortBy === "quality") {
        // Quality sort: Order by quality_score DESC, limit early
        const qualityQueryStart = Date.now();
        const cursorScore = cursor ? parseFloat(cursor) : null;
        const cursorCondition = cursorScore && !isNaN(cursorScore)
          ? sql`${curatedCasts.qualityScore} < ${cursorScore}`
          : undefined;

        const qualityCasts = await db
          .selectDistinct({
            castHash: curatedCasts.castHash,
            qualityScore: curatedCasts.qualityScore,
            createdAt: curatedCasts.createdAt,
          })
          .from(curatedCasts)
          .innerJoin(
            curatorCastCurations,
            eq(curatedCasts.castHash, curatorCastCurations.castHash)
          )
          .where(
            and(
              curatorFilter,
              curatedCastsFilter,
              cursorCondition
            )
          )
          .orderBy(desc(curatedCasts.qualityScore), desc(curatedCasts.createdAt))
          .limit(limit + 1);

        castsWithSortData = qualityCasts.map(c => ({
          castHash: c.castHash,
          sortTime: c.createdAt,
          qualityScore: c.qualityScore,
        }));
        selectedCastHashes = qualityCasts.map(c => c.castHash);
        console.log(`[Feed] Quality query: ${Date.now() - qualityQueryStart}ms, got ${selectedCastHashes.length} casts`);
      } else if (sortBy === "time-of-cast") {
        // Time-of-cast: Order by cast_created_at DESC, limit early
        const timeQueryStart = Date.now();
        const cursorDate = cursor ? new Date(cursor) : null;
        const cursorCondition = cursorDate && !isNaN(cursorDate.getTime())
          ? sql`${curatedCasts.castCreatedAt} < ${cursorDate}`
          : undefined;

        const timeCasts = await db
          .selectDistinct({
            castHash: curatedCasts.castHash,
            castCreatedAt: curatedCasts.castCreatedAt,
            createdAt: curatedCasts.createdAt,
          })
          .from(curatedCasts)
          .innerJoin(
            curatorCastCurations,
            eq(curatedCasts.castHash, curatorCastCurations.castHash)
          )
          .where(
            and(
              curatorFilter,
              curatedCastsFilter,
              cursorCondition
            )
          )
          .orderBy(desc(curatedCasts.castCreatedAt))
          .limit(limit + 1);

        castsWithSortData = timeCasts.map(c => ({
          castHash: c.castHash,
          sortTime: toDate(c.castCreatedAt, c.createdAt),
          qualityScore: null,
        }));
        selectedCastHashes = timeCasts.map(c => c.castHash);
        console.log(`[Feed] Time-of-cast query: ${Date.now() - timeQueryStart}ms, got ${selectedCastHashes.length} casts`);
      } else if (sortBy === "recently-curated") {
        // Recently-curated: Order by MIN(created_at) from curator_cast_curations DESC, limit early
        const curatedQueryStart = Date.now();
        // Fetch more results to account for cursor filtering (can't use aggregates in WHERE)
        const fetchLimit = cursor ? (limit + 1) * 2 : limit + 1;

        const curatedCastsResult = await db
          .select({
            castHash: curatorCastCurations.castHash,
            firstCurationTime: sql<Date>`MIN(${curatorCastCurations.createdAt})`.as("first_curation_time"),
          })
          .from(curatorCastCurations)
          .innerJoin(
            curatedCasts,
            eq(curatorCastCurations.castHash, curatedCasts.castHash)
          )
          .where(
            and(
              curatorFilter,
              curatedCastsFilter
            )
          )
          .groupBy(curatorCastCurations.castHash)
          .orderBy(desc(sql`MIN(${curatorCastCurations.createdAt})`))
          .limit(fetchLimit);

        // Apply cursor filter in memory (can't use aggregates in WHERE clause)
        let filteredResults = curatedCastsResult;
        if (cursor) {
          try {
            const cursorDate = new Date(cursor);
            if (!isNaN(cursorDate.getTime())) {
              filteredResults = curatedCastsResult.filter(c => {
                // Ensure firstCurationTime is a Date (SQL aggregates may return strings)
                const curationTime = toDate(c.firstCurationTime, new Date());
                return curationTime < cursorDate;
              });
            }
          } catch {
            // Invalid cursor, ignore it
          }
        }
        
        // Limit to requested amount
        const finalResults = filteredResults.slice(0, limit + 1);

        castsWithSortData = finalResults.map(c => ({
          castHash: c.castHash,
          sortTime: toDate(c.firstCurationTime, new Date()),
          qualityScore: null,
        }));
        selectedCastHashes = finalResults.map(c => c.castHash);
        console.log(`[Feed] Recently-curated query: ${Date.now() - curatedQueryStart}ms, got ${selectedCastHashes.length} casts`);
      } else {
        // recent-reply: Order by MAX(cast_created_at) from cast_replies DESC, limit early
        const replyQueryStart = Date.now();
        // Fetch more results to account for cursor filtering (can't use aggregates in WHERE)
        const fetchLimit = cursor ? (limit + 1) * 2 : limit + 1;

        // Use subquery to get cast hashes with latest reply times, then join with curated_casts for filters
        const replyCastsResult = await db
          .select({
            castHash: curatorCastCurations.castHash,
            latestReplyTime: sql<Date>`MAX(${castReplies.castCreatedAt})`.as("latest_reply_time"),
            castCreatedAt: curatedCasts.castCreatedAt,
            createdAt: curatedCasts.createdAt,
          })
          .from(curatorCastCurations)
          .leftJoin(
            castReplies,
            eq(curatorCastCurations.castHash, castReplies.curatedCastHash)
          )
          .innerJoin(
            curatedCasts,
            eq(curatorCastCurations.castHash, curatedCasts.castHash)
          )
          .where(
            and(
              curatorFilter,
              curatedCastsFilter
            )
          )
          .groupBy(
            curatorCastCurations.castHash,
            curatedCasts.castCreatedAt,
            curatedCasts.createdAt
          )
          .orderBy(desc(sql`MAX(${castReplies.castCreatedAt})`))
          .limit(fetchLimit);

        // Apply cursor filter in memory (can't use aggregates in WHERE clause)
        let filteredResults = replyCastsResult;
        if (cursor) {
          try {
            const cursorDate = new Date(cursor);
            if (!isNaN(cursorDate.getTime())) {
              filteredResults = replyCastsResult.filter(c => {
                const fallback = toDate(c.castCreatedAt, c.createdAt);
                const replyTime = toDate(c.latestReplyTime, fallback);
                return replyTime < cursorDate;
              });
            }
          } catch {
            // Invalid cursor, ignore it
          }
        }
        
        // Limit to requested amount
        const finalResults = filteredResults.slice(0, limit + 1);

        castsWithSortData = finalResults.map(c => {
          const fallback = toDate(c.castCreatedAt, c.createdAt);
          return {
            castHash: c.castHash,
            sortTime: toDate(c.latestReplyTime, fallback),
            qualityScore: null,
          };
        });
        selectedCastHashes = finalResults.map(c => c.castHash);
        console.log(`[Feed] Recent-reply query: ${Date.now() - replyQueryStart}ms, got ${selectedCastHashes.length} casts`);
      }

      if (selectedCastHashes.length === 0) {
        return NextResponse.json({
          casts: [],
          next: { cursor: null },
        });
      }

      console.log(`[Feed] Optimized query completed in ${Date.now() - queryStartTime}ms, selected ${selectedCastHashes.length} casts`);

      // Fetch full cast data only for selected casts (already limited)
      const phase3Start = Date.now();
      const curatedResults = await db
        .select({
          id: curatedCasts.id,
          castHash: curatedCasts.castHash,
          castData: curatedCasts.castData,
          createdAt: curatedCasts.createdAt,
          qualityScore: curatedCasts.qualityScore,
          category: curatedCasts.category,
        })
        .from(curatedCasts)
        .where(inArray(curatedCasts.castHash, selectedCastHashes));

      // Preserve sort order from optimized query
      const castHashOrder = new Map(selectedCastHashes.map((hash, idx) => [hash, idx]));
      curatedResults.sort((a, b) => {
        const aIdx = castHashOrder.get(a.castHash) ?? Infinity;
        const bIdx = castHashOrder.get(b.castHash) ?? Infinity;
        return aIdx - bIdx;
      });

      const phase3Time = Date.now() - phase3Start;
      console.log(`[Feed] Fetch full cast data: ${phase3Time}ms for ${curatedResults.length} casts`);
      
      // Fetch firstCurationTimes and latestReplyTimes only for selected casts (much smaller set)
      const [firstCurationTimes, latestReplyTimes] = await Promise.all([
        db
          .select({
            castHash: curatorCastCurations.castHash,
            firstCurationTime: sql<Date>`MIN(${curatorCastCurations.createdAt})`.as("first_curation_time"),
          })
          .from(curatorCastCurations)
          .where(inArray(curatorCastCurations.castHash, selectedCastHashes))
          .groupBy(curatorCastCurations.castHash),
        db
          .select({
            curatedCastHash: castReplies.curatedCastHash,
            latestReplyTime: sql<Date>`MAX(${castReplies.castCreatedAt})`.as("latest_reply_time"),
          })
          .from(castReplies)
          .where(inArray(castReplies.curatedCastHash, selectedCastHashes))
          .groupBy(castReplies.curatedCastHash),
      ]);

      // Create maps for quick lookup
      const firstCurationTimeMap = new Map<string, Date>();
      firstCurationTimes.forEach((row) => {
        firstCurationTimeMap.set(row.castHash, row.firstCurationTime);
      });

      const latestReplyTimeMap = new Map<string, Date>();
      latestReplyTimes.forEach((row) => {
        latestReplyTimeMap.set(row.curatedCastHash, row.latestReplyTime);
      });

      // Add latest times to results
      const resultsWithTimes = curatedResults.map((row) => ({
        ...row,
        firstCurationTime: firstCurationTimeMap.get(row.castHash) || null,
        latestReplyTime: latestReplyTimeMap.get(row.castHash) || null,
      }));

      let filteredResults = resultsWithTimes;
      
      // Extract cast data from stored JSONB
      // Fetch curator info only (replies will be lazy loaded)
      const curatorRepliesStart = Date.now();
      const castHashes = filteredResults.slice(0, limit).map(r => r.castHash);
      const curatorInfoByCastHash = new Map<string, Array<{ fid: number; username?: string; display_name?: string; pfp_url?: string }>>();
      
      if (castHashes.length > 0) {
        // Get all curators for these casts (replies will be lazy loaded via Intersection Observer)
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
      
      const curatorRepliesTime = Date.now() - curatorRepliesStart;
      console.log(`[Feed] Curator info fetch: ${curatorRepliesTime}ms (replies lazy loaded)`);
      
      const mapStart = Date.now();
      
      // Identify quote casts and collect parent hashes to fetch
      const quoteCastsWithParents: Array<{ cast: any; parentHash: string; curatedCastHash: string }> = [];
      const castsWithMetadata = filteredResults.slice(0, limit).map((row) => {
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
        
        // Add quality and category data
        if (row.qualityScore !== null && row.qualityScore !== undefined) {
          cast._qualityScore = row.qualityScore;
        }
        if (row.category) {
          cast._category = row.category;
        }
        
        // Check if this is a quote cast with a parent (not root)
        // IMPORTANT: parent_hash is the cast being replied to, NOT the quoted cast in embeds
        const castIsQuote = isQuoteCast(cast);
        if (castIsQuote) {
          cast._isQuoteCast = true;
          
          // Get quoted cast hash from embeds
          const quotedCastHashes: string[] = [];
          if (cast.embeds && Array.isArray(cast.embeds)) {
            cast.embeds.forEach((embed: any) => {
              if (embed.cast_id?.hash) {
                quotedCastHashes.push(embed.cast_id.hash);
              } else if (embed.cast?.hash) {
                quotedCastHashes.push(embed.cast.hash);
              }
            });
          }
          
          console.log(`[Feed] Quote cast ${cast.hash}:`, {
            parent_hash: cast.parent_hash,
            quotedCastHashes,
            curatedCastHash: row.castHash,
            author: cast.author?.username,
            text: cast.text?.substring(0, 50),
          });
          
          // Only use parent_hash if it's different from the quoted cast hash and not the root
          // parent_hash = cast being replied to (what we want to show)
          // quoted cast = cast being quoted (what's in embeds, NOT what we want to show)
          if (cast.parent_hash && 
              cast.parent_hash !== row.castHash && 
              !quotedCastHashes.includes(cast.parent_hash)) {
            console.log(`[Feed] Adding parent cast lookup for ${cast.hash}: parent_hash=${cast.parent_hash}`);
            quoteCastsWithParents.push({ cast, parentHash: cast.parent_hash, curatedCastHash: row.castHash });
          } else {
            console.log(`[Feed] Skipping parent cast for ${cast.hash}:`, {
              hasParentHash: !!cast.parent_hash,
              isRoot: cast.parent_hash === row.castHash,
              isQuotedCast: quotedCastHashes.includes(cast.parent_hash || ''),
            });
          }
        }
        
        // Replies will be lazy loaded via Intersection Observer in CastCard
        // Don't include replies in initial response to speed up load time
        return cast;
      });
      
      // Fetch parent casts for quote casts
      const parentHashes = Array.from(new Set(quoteCastsWithParents.map(q => q.parentHash)));
      const parentCastsMap = new Map<string, any>();
      const parentToCuratedCastMap = new Map<string, string>(); // Map parent hash to curated cast hash
      
      // Build map of parent hash to curated cast hash
      quoteCastsWithParents.forEach(({ parentHash, curatedCastHash }) => {
        if (!parentToCuratedCastMap.has(parentHash)) {
          parentToCuratedCastMap.set(parentHash, curatedCastHash);
        }
      });
      
      if (parentHashes.length > 0) {
        console.log(`[Feed] Fetching parent casts from DB for hashes:`, parentHashes);
        // Fetch parent casts from database where parent_cast_hash = reply_cast_hash
        // This finds the parent cast that the quote cast is replying to
        const storedParentCasts = await db
          .select({
            replyCastHash: castReplies.replyCastHash,
            castData: castReplies.castData,
          })
          .from(castReplies)
          .where(
            inArray(castReplies.replyCastHash, parentHashes)
          );
        
        console.log(`[Feed] Found ${storedParentCasts.length} parent casts in DB:`, 
          storedParentCasts.map(s => ({
            hash: s.replyCastHash,
            author: (s.castData as any)?.author?.username,
            text: (s.castData as any)?.text?.substring(0, 50),
          }))
        );
        
        storedParentCasts.forEach((stored) => {
          const parentCast = stored.castData as any;
          if (parentCast) {
            parentCastsMap.set(stored.replyCastHash, parentCast);
            console.log(`[Feed] Mapped parent cast ${stored.replyCastHash} -> ${parentCast.author?.username}`);
          }
        });
        
        // For parent casts not in database, fetch from Neynar in parallel
        const missingParentHashes = parentHashes.filter(hash => !parentCastsMap.has(hash));
        if (missingParentHashes.length > 0) {
          // Fetch missing parents in parallel (await to include in response)
          await Promise.all(
            missingParentHashes.map(async (parentHash) => {
              try {
                const conversation = await neynarClient.lookupCastConversation({
                  identifier: parentHash,
                  type: LookupCastConversationTypeEnum.Hash,
                  replyDepth: 0,
                });
                const parentCast = conversation.conversation?.cast;
                if (parentCast) {
                  parentCastsMap.set(parentHash, parentCast);
                  // Save to database for future use (non-blocking)
                  const curatedCastHash = parentToCuratedCastMap.get(parentHash);
                  if (curatedCastHash) {
                    fetch(`/api/conversation/parent-cast`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        parentCastHash: parentHash,
                        parentCastData: parentCast,
                        rootCastHash: curatedCastHash,
                      }),
                    }).catch(err => console.error(`Error saving parent cast ${parentHash}:`, err));
                  }
                }
              } catch (error) {
                console.error(`Error fetching parent cast ${parentHash}:`, error);
              }
            })
          );
        }
      }
      
        // Add parent casts to quote casts
        casts = castsWithMetadata.map((cast) => {
          if (cast._isQuoteCast && cast.parent_hash && parentCastsMap.has(cast.parent_hash)) {
            const parentCast = parentCastsMap.get(cast.parent_hash);
            cast._parentCast = parentCast;
            console.log(`[Feed] Attached parent cast to ${cast.hash}:`, {
              parentHash: cast.parent_hash,
              parentAuthor: parentCast?.author?.username,
              parentText: parentCast?.text?.substring(0, 50),
            });
          } else if (cast._isQuoteCast && cast.parent_hash) {
            console.log(`[Feed] Parent cast NOT found for ${cast.hash}:`, {
              parentHash: cast.parent_hash,
              hasInMap: parentCastsMap.has(cast.parent_hash),
            });
          }
          return cast;
        });
        
        // Debug: Verify final order before returning (for quality sort)
        if (sortBy === "quality" && casts.length > 0) {
          const finalOrder = casts.slice(0, Math.min(10, casts.length))
            .map(c => ({ hash: c.hash?.substring(0, 8) || 'unknown', score: c._qualityScore }));
          console.log(`[Feed] Final order before return (top 10):`, finalOrder);
        }
      
      // Set cursor to the last item's sort value based on sortBy mode
      // Limit to requested limit after all filtering and sorting
      const finalResults = filteredResults.slice(0, limit);
      if (castsWithSortData.length > limit) {
        // Get the sort value from the castsWithSortData (which we already computed)
        const lastCast = castsWithSortData[limit - 1];
        if (lastCast) {
          if (sortBy === "quality") {
            // For quality sorting, use quality score as cursor
            const qualityScore = lastCast.qualityScore;
            neynarCursor = qualityScore !== null && qualityScore !== undefined ? qualityScore.toString() : null;
          } else {
            // For time-based sorting, use timestamp as cursor
            // Ensure sortTime is a Date object (SQL aggregates may return strings)
            const sortTimeDate = toDate(lastCast.sortTime, new Date());
            neynarCursor = sortTimeDate.toISOString();
          }
        } else {
          neynarCursor = null;
        }
      } else {
        neynarCursor = null;
      }
      
      // Update filteredResults to use finalResults
      filteredResults = finalResults;
      
      const mapTime = Date.now() - mapStart;
      const totalTime = Date.now() - feedStartTime;
      console.log(`[Feed] Map cast data: ${mapTime}ms`);
      console.log(`[Feed] Total curated feed time: ${totalTime}ms (${(totalTime / 1000).toFixed(2)}s)`);
      console.log(`[Feed] Returning ${casts.length} casts (requested limit: ${limit})`);
      
      // Update last session timestamp after successful feed fetch (non-blocking)
      // Don't await - let it run in background to not delay response
      if (viewerFid) {
        updateLastCuratedFeedView(viewerFid).catch((error) => {
          console.error(`[Feed] Error updating last curated feed view for user ${viewerFid}:`, error);
        });
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
    } else if (feedType === "1500+") {
      // 1500+ feed - casts longer than 1500 characters from the past week
      // Fetch from Neynar query API endpoint
      // The query now returns all necessary data: hash, fname, display_name, pfp, text, created_at
      try {
        const queryUrl = `https://data.hubs.neynar.com/api/queries/2075/results.json?api_key=vfOGD4oehaVNbKjwh9kh3t1N1NLtYOIGX8DT4JGH`;
        
        // Use deduplication to prevent concurrent duplicate requests
        const queryResponse = await deduplicateRequest(
          `feed-1500plus-${cursor || "initial"}-${limit}`,
          async () => {
            const response = await fetch(queryUrl);
            if (!response.ok) {
              throw new Error(`Neynar query API returned ${response.status}`);
            }
            return await response.json();
          }
        );
        
        // Parse the query result format: { query_result: { data: { rows: [...] } } }
        const rawRows = queryResponse.query_result?.data?.rows || [];
        
        // Apply pagination
        let paginatedRows = rawRows;
        if (cursor) {
          try {
            const cursorOffset = parseInt(cursor, 10);
            if (!isNaN(cursorOffset)) {
              paginatedRows = rawRows.slice(cursorOffset);
            }
          } catch {
            // Invalid cursor, ignore it
          }
        }
        
        // Limit results
        const rowsToFetch = paginatedRows.slice(0, limit);
        const hasMoreResults = paginatedRows.length > limit;
        
        // Build cast objects directly from query data (no additional API calls needed)
        const minimalCasts = rowsToFetch.map((row: any) => {
          const timestamp = row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString();
          
          // Normalize hash to include 0x prefix if missing (Neynar API expects 0x prefix)
          let normalizedHash = row.hash;
          if (normalizedHash && !normalizedHash.startsWith('0x') && !normalizedHash.startsWith('0X')) {
            normalizedHash = '0x' + normalizedHash;
          }
          
          // Construct cast object directly from query data
          return {
            hash: normalizedHash,
            text: row.text || "",
            timestamp,
            author: {
              fid: row.fid,
              username: row.fname || `user${row.fid}`,
              display_name: row.display_name || null,
              pfp_url: row.pfp || null,
            },
          };
        });
        
        // If viewer is logged in, check which casts they curated and fetch full data for those only
        if (viewerFid) {
          const oneWeekAgo = new Date();
          oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
          
          // Get curator curations for the viewer from the past week
          const viewerCurations = await db
            .select({
              castHash: curatorCastCurations.castHash,
            })
            .from(curatorCastCurations)
            .where(
              and(
                eq(curatorCastCurations.curatorFid, viewerFid),
                gte(curatorCastCurations.createdAt, oneWeekAgo)
              )
            );
          
          if (viewerCurations.length > 0) {
            // Normalize database hashes for comparison (ensure 0x prefix)
            const curatedCastHashes = new Set(
              viewerCurations.map(c => {
                const hash = c.castHash;
                return hash && !hash.startsWith('0x') && !hash.startsWith('0X') ? '0x' + hash : hash;
              })
            );
            
            // Find which query result hashes are curated by the viewer (normalize both sides for comparison)
            const castHashesToFetch = rowsToFetch
              .map((row: any) => {
                const hash = row.hash;
                return hash && !hash.startsWith('0x') && !hash.startsWith('0X') ? '0x' + hash : hash;
              })
              .filter((hash: string) => hash && curatedCastHashes.has(hash));
            
            // Only fetch full cast data from Neynar for casts curated by the viewer
            if (castHashesToFetch.length > 0) {
              const fetchedCasts = await Promise.all(
                castHashesToFetch.map(async (castHash: string) => {
                  try {
                    const conversation = await neynarClient.lookupCastConversation({
                      identifier: castHash,
                      type: LookupCastConversationTypeEnum.Hash,
                      replyDepth: 0,
                      viewerFid,
                    });
                    return conversation.conversation?.cast || null;
                  } catch (error) {
                    console.error(`Error fetching cast ${castHash}:`, error);
                    return null;
                  }
                })
              );
              
              // Create a map of cast hash to full cast data
              const fetchedCastsMap = new Map<string, any>();
              for (let i = 0; i < castHashesToFetch.length; i++) {
                const fetchedCast = fetchedCasts[i];
                if (fetchedCast) {
                  fetchedCastsMap.set(castHashesToFetch[i], fetchedCast);
                }
              }
              
              // Replace minimal casts with full casts where available
              for (let i = 0; i < minimalCasts.length; i++) {
                const castHash = minimalCasts[i].hash;
                if (castHash && fetchedCastsMap.has(castHash)) {
                  minimalCasts[i] = fetchedCastsMap.get(castHash)!;
                }
              }
            }
          }
        }
        
        casts = minimalCasts;
        
        // Sort by timestamp (most recent first) - already sorted by query, but ensure consistency
        casts.sort((a, b) => {
          const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
          const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
          return bTime - aTime;
        });
        
        // Set cursor for next page (offset-based)
        if (hasMoreResults) {
          const currentOffset = cursor ? parseInt(cursor, 10) : 0;
          neynarCursor = (currentOffset + limit).toString();
        } else {
          neynarCursor = null;
        }
      } catch (error: any) {
        console.error("Error fetching 1500+ feed:", error);
        // Return empty results rather than crashing
        casts = [];
        neynarCursor = null;
      }
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
    // Default bots are ALWAYS filtered, regardless of user preferences
    let filteredCasts: any[];
    
    if (feedType === "curated") {
      // For curated feed, apply bot filtering using already-fetched preferences
      // Always check for default bots, even if user has disabled bot hiding
      filteredCasts = casts.filter((cast) => {
        return !shouldHideBotCastClient(cast, userBotPreferences.hiddenBots, userBotPreferences.hideBots);
      });
    } else if (feedType === "following" || feedType === "for-you" || feedType === "1500+") {
      // For following, for-you, and 1500+ feeds: apply bot filtering and user preferences
      // Always check for default bots, even if user has disabled bot hiding
      filteredCasts = casts.filter((cast) => {
        const shouldHide = shouldHideBotCastClient(cast, userBotPreferences.hiddenBots, userBotPreferences.hideBots);
        if (shouldHide) return false;
        
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

    // Sort by quality score (skip for curated, for-you, my-37, and 1500+ feeds)
    // my-37 uses Neynar's default sorting, curated and for-you are already sorted by algorithm
    // 1500+ is already sorted by timestamp (most recent first)
    const sortedCasts = feedType === "curated" || feedType === "for-you" || feedType === "my-37" || feedType === "1500+"
      ? filteredCasts
      : sortCastsByQuality(filteredCasts);

    // Use Neynar's cursor if available, otherwise use last cast hash from filtered results
    // Only set cursor if we have results and there might be more
    let finalCasts = sortedCasts.slice(0, limit);
    
    // Enrich casts with viewer context from database (for all feed types)
    console.log("[Like Fetch] Feed API - Before enrichment:", {
      feedType,
      viewerFid,
      finalCastsCount: finalCasts.length,
      hasViewerFid: !!viewerFid,
    });
    
    if (viewerFid) {
      finalCasts = await enrichCastsWithViewerContext(finalCasts, viewerFid);
      
      console.log("[Like Fetch] Feed API - After enrichment:", {
        feedType,
        viewerFid,
        finalCastsCount: finalCasts.length,
        enrichedCasts: finalCasts.filter(c => c.viewer_context?.liked || c.viewer_context?.recasted).length,
      });
    } else {
      console.log("[Like Fetch] Feed API - Skipping enrichment (no viewerFid)");
    }
    
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


import { NextRequest, NextResponse } from "next/server";
import { neynarClient } from "@/lib/neynar";
import { FetchFeedFeedTypeEnum, FetchFeedFilterTypeEnum, FetchTrendingFeedTimeWindowEnum, FetchFeedForYouProviderEnum, LookupCastConversationTypeEnum } from "@neynar/nodejs-sdk/build/api";
import { filterCast, sortCastsByQuality } from "@/lib/filters";
import { calculateEngagementScore } from "@/lib/engagement";
import { CURATED_FIDS, CURATED_CHANNELS } from "@/lib/curated";
import { db } from "@/lib/db";
import { curatorPackUsers, curatedCasts, curatedCastInteractions, curatorPacks, users, curatorCastCurations, castReplies, userRoles } from "@/lib/schema";
import { enrichCastsWithViewerContext } from "@/lib/interactions";
import { eq, inArray, desc, lt, and, sql, asc, or } from "drizzle-orm";
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
    const sortBy = searchParams.get("sortBy") || "recent-reply"; // "recently-curated" | "time-of-cast" | "recent-reply"

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

      // Get last session timestamp and curator filter query in parallel
      const [lastSessionTimestampResult, castHashesWithCurators] = await Promise.all([
        viewerFid 
          ? getLastCuratedFeedView(viewerFid).catch(() => null)
          : Promise.resolve(null),
        db
          .selectDistinct({ castHash: curatorCastCurations.castHash })
          .from(curatorCastCurations)
          .where(curatorWhereConditions.length > 0 ? and(...curatorWhereConditions) : undefined),
      ]);
      
      const lastSessionTimestamp: Date | null = lastSessionTimestampResult;
      const curatorFilterStart = Date.now();

      const castHashSet = new Set(castHashesWithCurators.map(c => c.castHash));
      console.log(`[Feed] Curator filter query: ${Date.now() - curatorFilterStart}ms, found ${castHashSet.size} casts`);
      
      if (castHashSet.size === 0) {
        return NextResponse.json({
          casts: [],
          next: { cursor: null },
        });
      }

      // Two-phase approach: First get sorted cast hashes with times, then fetch full data
      // This avoids fetching large JSONB data for casts we won't use
      const castHashArray = Array.from(castHashSet);
      
      // Phase 1: Get aggregated times and cast metadata in parallel
      // Run all independent queries simultaneously for maximum performance
      const phase1Start = Date.now();
      const [latestCurationTimes, latestReplyTimes, castsForSorting] = await Promise.all([
        // Aggregation query for latest curation times (uses composite index)
        db
          .select({
            castHash: curatorCastCurations.castHash,
            latestCurationTime: sql<Date>`MAX(${curatorCastCurations.createdAt})`.as("latest_curation_time"),
          })
          .from(curatorCastCurations)
          .where(inArray(curatorCastCurations.castHash, castHashArray))
          .groupBy(curatorCastCurations.castHash),
        // Aggregation query for latest reply times (uses composite index)
        // Use castCreatedAt (when cast was created) not createdAt (when stored in DB) for recent-reply sorting
        db
          .select({
            curatedCastHash: castReplies.curatedCastHash,
            latestReplyTime: sql<Date>`MAX(${castReplies.castCreatedAt})`.as("latest_reply_time"),
          })
          .from(castReplies)
          .where(inArray(castReplies.curatedCastHash, castHashArray))
          .groupBy(castReplies.curatedCastHash),
        // Get cast hashes with minimal data (use indexed castCreatedAt column)
        db
          .select({
            castHash: curatedCasts.castHash,
            createdAt: curatedCasts.createdAt,
            castTimestamp: curatedCasts.castCreatedAt,
          })
          .from(curatedCasts)
          .where(inArray(curatedCasts.castHash, castHashArray)),
      ]);

      const phase1Time = Date.now() - phase1Start;
      console.log(`[Feed] Phase 1 (parallel queries): ${phase1Time}ms - curation times: ${latestCurationTimes.length}, reply times: ${latestReplyTimes.length}, casts for sorting: ${castsForSorting.length}`);
      
      // Create maps for quick lookup
      const latestCurationTimeMap = new Map<string, Date>();
      latestCurationTimes.forEach((row) => {
        latestCurationTimeMap.set(row.castHash, row.latestCurationTime);
      });

      const latestReplyTimeMap = new Map<string, Date>();
      latestReplyTimes.forEach((row) => {
        latestReplyTimeMap.set(row.curatedCastHash, row.latestReplyTime);
      });

      // Helper function to ensure we have a Date object
      const toDate = (value: Date | string | null | undefined, fallback: Date): Date => {
        if (!value) return fallback;
        if (value instanceof Date) return value;
        if (typeof value === 'string') return new Date(value);
        return fallback;
      };

      // Add sort times and sort in memory (lightweight - no JSONB)
      const castsWithSortTimes = castsForSorting.map((cast) => {
        let sortTime: Date;
        if (sortBy === "recently-curated") {
          sortTime = toDate(latestCurationTimeMap.get(cast.castHash), cast.createdAt);
        } else if (sortBy === "time-of-cast") {
          sortTime = toDate(cast.castTimestamp, cast.createdAt);
        } else {
          // recent-reply
          const fallback = toDate(cast.castTimestamp, cast.createdAt);
          sortTime = toDate(latestReplyTimeMap.get(cast.castHash), fallback);
        }
        return { ...cast, sortTime };
      });

      // Sort by sortTime
      const sortStart = Date.now();
      castsWithSortTimes.sort((a, b) => b.sortTime.getTime() - a.sortTime.getTime());
      const sortTime = Date.now() - sortStart;
      console.log(`[Feed] In-memory sort: ${sortTime}ms for ${castsWithSortTimes.length} casts`);

      // Apply cursor filter if provided
      let filteredCasts = castsWithSortTimes;
      if (cursor) {
        try {
          const cursorDate = new Date(cursor);
          filteredCasts = castsWithSortTimes.filter((cast) => cast.sortTime < cursorDate);
          console.log(`[Feed] Cursor filter: ${castsWithSortTimes.length} -> ${filteredCasts.length} casts`);
        } catch {
          // Invalid cursor, ignore it
        }
      }

      // Get only the cast hashes we need (limit + 1)
      const selectedCastHashes = filteredCasts.slice(0, limit + 1).map((c) => c.castHash);
      console.log(`[Feed] Selected ${selectedCastHashes.length} casts for full data fetch`);

      // Phase 3: Fetch full cast data only for selected casts
      const phase3Start = Date.now();
      const curatedResults = await db
        .select({
          id: curatedCasts.id,
          castHash: curatedCasts.castHash,
          castData: curatedCasts.castData,
          createdAt: curatedCasts.createdAt,
        })
        .from(curatedCasts)
        .where(inArray(curatedCasts.castHash, selectedCastHashes));

      // Preserve sort order from Phase 2
      const castHashOrder = new Map(selectedCastHashes.map((hash, idx) => [hash, idx]));
      curatedResults.sort((a, b) => {
        const aIdx = castHashOrder.get(a.castHash) ?? Infinity;
        const bIdx = castHashOrder.get(b.castHash) ?? Infinity;
        return aIdx - bIdx;
      });

      const phase3Time = Date.now() - phase3Start;
      console.log(`[Feed] Phase 3 (fetch full cast data): ${phase3Time}ms for ${curatedResults.length} casts`);

      // Add latest times to results
      const resultsWithTimes = curatedResults.map((row) => ({
        ...row,
        latestCurationTime: latestCurationTimeMap.get(row.castHash) || null,
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
      
      // Set cursor to the last item's sort time based on sortBy mode
      // Limit to requested limit after all filtering and sorting
      const finalResults = filteredResults.slice(0, limit);
      if (filteredResults.length > limit) {
        // Get the sort time from the filtered casts (which we already computed)
        const lastFilteredCast = filteredCasts[limit - 1];
        if (lastFilteredCast) {
          neynarCursor = lastFilteredCast.sortTime.toISOString();
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
    } else if (feedType === "following" || feedType === "for-you") {
      // For following and for-you feeds: apply bot filtering and user preferences
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

    // Sort by quality score (skip for curated, for-you, and my-37 feeds)
    // my-37 uses Neynar's default sorting, curated and for-you are already sorted by algorithm
    const sortedCasts = feedType === "curated" || feedType === "for-you" || feedType === "my-37"
      ? filteredCasts
      : sortCastsByQuality(filteredCasts);

    // Use Neynar's cursor if available, otherwise use last cast hash from filtered results
    // Only set cursor if we have results and there might be more
    let finalCasts = sortedCasts.slice(0, limit);
    
    // Enrich casts with viewer context from database (for all feed types)
    if (viewerFid) {
      finalCasts = await enrichCastsWithViewerContext(finalCasts, viewerFid);
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


import { NextRequest, NextResponse } from "next/server";
import { neynarClient } from "@/lib/neynar";
import { LookupCastConversationTypeEnum, LookupCastConversationSortTypeEnum, LookupCastConversationFoldEnum } from "@neynar/nodejs-sdk/build/api";
import { cacheConversation } from "@/lib/cache";
import { deduplicateRequest } from "@/lib/neynar-batch";
import { db } from "@/lib/db";
import { castReplies, curatedCasts } from "@/lib/schema";
import { eq, or, sql } from "drizzle-orm";
import { enrichCastsWithViewerContext } from "@/lib/interactions";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const identifier = searchParams.get("identifier");
    const typeParam = searchParams.get("type") || "hash";
    const replyDepth = parseInt(searchParams.get("replyDepth") || "3");
    const foldParam = searchParams.get("fold") || "above"; // above, below, or not set
    const viewerFid = searchParams.get("viewerFid")
      ? parseInt(searchParams.get("viewerFid")!)
      : undefined;

    if (!identifier) {
      return NextResponse.json(
        { error: "identifier is required" },
        { status: 400 }
      );
    }

    const type = typeParam === "url" 
      ? LookupCastConversationTypeEnum.Url 
      : LookupCastConversationTypeEnum.Hash;

    // Determine fold enum value
    const foldEnum = foldParam === "below" 
      ? LookupCastConversationFoldEnum.Below 
      : LookupCastConversationFoldEnum.Above;

    // Generate cache key (include fold in cache key)
    const cacheKey = cacheConversation.generateKey({
      identifier,
      type: typeParam,
      replyDepth,
      viewerFid,
      fold: foldParam, // Include fold in cache key
    });

    // Check cache first
    const cachedResult = cacheConversation.get(cacheKey);
    if (cachedResult) {
      return NextResponse.json(cachedResult);
    }

    // Normalize identifier (trim and handle case)
    const trimmedIdentifier = identifier.trim();
    
    // First, check if this is a curated cast or a reply in our database
    let actualIdentifier = trimmedIdentifier;
    let castHash: string | null = null;
    let finalCacheKey = cacheKey; // Use original cache key by default
    
    if (type === LookupCastConversationTypeEnum.Hash) {
      castHash = trimmedIdentifier;
      
      // First check if it's a curated cast
      const curatedCheck = await db
        .select()
        .from(curatedCasts)
        .where(
          sql`LOWER(${curatedCasts.castHash}) = LOWER(${trimmedIdentifier})`
        )
        .limit(1);
      
      if (curatedCheck.length === 0) {
        // Not a curated cast, check if it's a reply
        const replyCheck = await db
          .select()
          .from(castReplies)
          .where(
            sql`LOWER(${castReplies.replyCastHash}) = LOWER(${trimmedIdentifier})`
          )
          .limit(1);
        
        if (replyCheck.length > 0) {
          // This is a reply - get the root cast hash
          const rootCastHash = replyCheck[0].rootCastHash;
          if (rootCastHash) {
            actualIdentifier = rootCastHash;
            castHash = rootCastHash;
            console.log(`[Conversation] Cast ${trimmedIdentifier} is a reply, fetching root cast ${rootCastHash} instead`);
            // Update cache key to use root cast hash for deduplication
            finalCacheKey = cacheConversation.generateKey({
              identifier: rootCastHash,
              type: typeParam,
              replyDepth,
              viewerFid,
              fold: foldParam,
            });
            const rootCachedResult = cacheConversation.get(finalCacheKey);
            if (rootCachedResult) {
              // Cache under both keys for future requests
              cacheConversation.set(cacheKey, rootCachedResult);
              return NextResponse.json(rootCachedResult);
            }
          }
        }
      }
    }

    // Use deduplication to prevent concurrent duplicate requests
    let conversation;
    try {
      conversation = await deduplicateRequest(finalCacheKey, async () => {
        return await neynarClient.lookupCastConversation({
          identifier: actualIdentifier,
          type,
          replyDepth,
          viewerFid,
          sortType: LookupCastConversationSortTypeEnum.Algorithmic, // Rank by quality
          fold: foldEnum, // Use Neynar's fold to separate high/low quality replies
          includeChronologicalParentCasts: true,
        });
      });
    } catch (error: any) {
      // If Neynar fails and we have the cast in our database, try to construct from DB
      console.error(`[Conversation] Neynar lookup failed for ${actualIdentifier}:`, error);
      
      // Check if we have it in our database
      const dbCast = await db
        .select()
        .from(curatedCasts)
        .where(
          sql`LOWER(${curatedCasts.castHash}) = LOWER(${actualIdentifier})`
        )
        .limit(1);
      
      if (dbCast.length > 0) {
        // We have it in DB, return error with helpful message
        return NextResponse.json(
          { error: "Cast not found in Neynar API" },
          { status: 404 }
        );
      }
      
      // Re-throw the original error
      throw error;
    }

    // Get cast hash from conversation or identifier
    if (!castHash) {
      if (type === LookupCastConversationTypeEnum.Hash) {
        castHash = actualIdentifier;
      } else {
        castHash = conversation.conversation?.cast?.hash || null;
      }
    }

    // Merge stored replies/quotes if this is a curated cast
    if (castHash) {
      // Check if cast is curated (case-insensitive)
      const curatedCast = await db
        .select()
        .from(curatedCasts)
        .where(
          sql`LOWER(${curatedCasts.castHash}) = LOWER(${castHash})`
        )
        .limit(1);

      if (curatedCast.length > 0) {
        // Update the root curated cast with fresh data (includes updated reactions)
        const rootCast = conversation.conversation?.cast;
        if (rootCast) {
          try {
            const { extractCastMetadata } = await import("@/lib/cast-metadata");
            const metadata = extractCastMetadata(rootCast);
            await db
              .update(curatedCasts)
              .set({
                castData: rootCast,
                castText: metadata.castText,
                castTextLength: metadata.castTextLength,
                authorFid: metadata.authorFid,
                likesCount: metadata.likesCount,
                recastsCount: metadata.recastsCount,
                repliesCount: metadata.repliesCount,
                engagementScore: metadata.engagementScore,
                parentHash: metadata.parentHash,
              })
              .where(
                sql`LOWER(${curatedCasts.castHash}) = LOWER(${castHash})`
              );
            console.log(`[Conversation] Updated root cast ${castHash} with fresh reactions data`);
          } catch (error) {
            console.error(`[Conversation] Error updating root cast ${castHash}:`, error);
          }
        }

        // Fetch stored replies/quotes (case-insensitive)
        // Exclude parent casts saved for display only (they use placeholder hash 0x0000...)
        const PARENT_CAST_PLACEHOLDER_HASH = "0x0000000000000000000000000000000000000000";
        const storedReplies = await db
          .select()
          .from(castReplies)
          .where(
            or(
              sql`LOWER(${castReplies.curatedCastHash}) = LOWER(${castHash})`,
              sql`LOWER(${castReplies.quotedCastHash}) = LOWER(${castHash})`
            )
          )
          .orderBy(castReplies.createdAt);
        
        // Filter out parent casts that use the placeholder hash (metadata-only entries)
        const filteredReplies = storedReplies.filter(
          reply => reply.curatedCastHash?.toLowerCase() !== PARENT_CAST_PLACEHOLDER_HASH.toLowerCase()
        );

        // Create a map of cast hashes from Neynar replies to avoid duplicates
        const neynarReplyHashes = new Set<string>();
        const neynarReplies = conversation.conversation?.cast?.direct_replies || [];
        neynarReplies.forEach((reply: any) => {
          if (reply.hash) {
            neynarReplyHashes.add(reply.hash);
          }
        });

        // Update stored replies with fresh data from Neynar
        const updateReplyData = async (reply: any) => {
          if (!reply.hash) return;
          
          try {
            await db
              .update(castReplies)
              .set({
                castData: reply,
              })
              .where(
                sql`LOWER(${castReplies.replyCastHash}) = LOWER(${reply.hash})`
              );
          } catch (error) {
            console.error(`[Conversation] Error updating reply ${reply.hash}:`, error);
          }
        };

        // Recursively update nested replies
        const updateNestedReplies = async (replies: any[]) => {
          for (const nestedReply of replies) {
            if (nestedReply.hash) {
              await updateReplyData(nestedReply);
              if (nestedReply.direct_replies && nestedReply.direct_replies.length > 0) {
                await updateNestedReplies(nestedReply.direct_replies);
              }
            }
          }
        };

        // Update all replies found in Neynar's response
        for (const reply of neynarReplies) {
          await updateReplyData(reply);
          
          if (reply.direct_replies && reply.direct_replies.length > 0) {
            await updateNestedReplies(reply.direct_replies);
          }
        }

        // Add stored replies/quotes that aren't already in Neynar's response
        // Include depth information from cast_replies
        const additionalReplies: any[] = [];
        for (const storedReply of filteredReplies) {
          if (!neynarReplyHashes.has(storedReply.replyCastHash)) {
            // Cast data is stored as JSONB, extract it
            const castData = storedReply.castData as any;
            if (castData) {
              // Add depth and parent information for threading
              castData._replyDepth = storedReply.replyDepth;
              castData._parentCastHash = storedReply.parentCastHash;
              castData._isQuoteCast = storedReply.isQuoteCast;
              additionalReplies.push(castData);
            }
          }
        }

        // Merge stored replies with Neynar replies
        if (additionalReplies.length > 0 && conversation.conversation?.cast) {
          // Append stored replies to direct_replies array
          if (!conversation.conversation.cast.direct_replies) {
            conversation.conversation.cast.direct_replies = [];
          }
          conversation.conversation.cast.direct_replies = [
            ...conversation.conversation.cast.direct_replies,
            ...additionalReplies,
          ];
        }
      }
    }

    // Enrich conversation with viewer context from database
    if (viewerFid && conversation.conversation?.cast) {
      // Collect all casts (root + nested replies) for enrichment
      const allCasts: any[] = [conversation.conversation.cast];
      
      // Recursively collect nested replies
      const collectReplies = (replies: any[]) => {
        replies.forEach((reply: any) => {
          if (reply.hash) {
            allCasts.push(reply);
          }
          if (reply.direct_replies && reply.direct_replies.length > 0) {
            collectReplies(reply.direct_replies);
          }
        });
      };
      
      if (conversation.conversation.cast.direct_replies) {
        collectReplies(conversation.conversation.cast.direct_replies);
      }
      
      // Enrich all casts
      const enrichedCasts = await enrichCastsWithViewerContext(allCasts, viewerFid);
      
      // Create a map for quick lookup
      const enrichedMap = new Map(enrichedCasts.map(cast => [cast.hash, cast]));
      
      // Replace casts in conversation with enriched versions
      if (enrichedMap.has(conversation.conversation.cast.hash)) {
        conversation.conversation.cast = enrichedMap.get(conversation.conversation.cast.hash)!;
      }
      
      // Recursively replace nested replies
      const replaceReplies = (replies: any[]) => {
        replies.forEach((reply: any, index: number) => {
          if (reply.hash && enrichedMap.has(reply.hash)) {
            replies[index] = enrichedMap.get(reply.hash)!;
          }
          if (reply.direct_replies && reply.direct_replies.length > 0) {
            replaceReplies(reply.direct_replies);
          }
        });
      };
      
      if (conversation.conversation.cast.direct_replies) {
        replaceReplies(conversation.conversation.cast.direct_replies);
      }
    }

    // Cache the response under both keys if we redirected
    cacheConversation.set(finalCacheKey, conversation);
    if (finalCacheKey !== cacheKey) {
      // Also cache under original key for reply hash requests
      cacheConversation.set(cacheKey, conversation);
    }

    return NextResponse.json(conversation);
  } catch (error: any) {
    console.error("Conversation API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch conversation" },
      { status: 500 }
    );
  }
}


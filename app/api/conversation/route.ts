import { NextRequest, NextResponse } from "next/server";
import { neynarClient } from "@/lib/neynar";
import { LookupCastConversationTypeEnum, LookupCastConversationSortTypeEnum, LookupCastConversationFoldEnum } from "@neynar/nodejs-sdk/build/api";
import { cacheConversation } from "@/lib/cache";
import { deduplicateRequest } from "@/lib/neynar-batch";
import { db } from "@/lib/db";
import { castReplies, curatedCasts } from "@/lib/schema";
import { eq, or } from "drizzle-orm";

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

    // Use deduplication to prevent concurrent duplicate requests
    const conversation = await deduplicateRequest(cacheKey, async () => {
      return await neynarClient.lookupCastConversation({
        identifier,
        type,
        replyDepth,
        viewerFid,
        sortType: LookupCastConversationSortTypeEnum.Algorithmic, // Rank by quality
        fold: foldEnum, // Use Neynar's fold to separate high/low quality replies
        includeChronologicalParentCasts: true,
      });
    });

    // Get cast hash from conversation or identifier
    let castHash: string | null = null;
    if (type === LookupCastConversationTypeEnum.Hash) {
      castHash = identifier;
    } else {
      castHash = conversation.conversation?.cast?.hash || null;
    }

    // Merge stored replies/quotes if this is a curated cast
    if (castHash) {
      // Check if cast is curated
      const curatedCast = await db
        .select()
        .from(curatedCasts)
        .where(eq(curatedCasts.castHash, castHash))
        .limit(1);

      if (curatedCast.length > 0) {
        // Fetch stored replies/quotes
        const storedReplies = await db
          .select()
          .from(castReplies)
          .where(
            or(
              eq(castReplies.curatedCastHash, castHash),
              eq(castReplies.quotedCastHash, castHash)
            )
          )
          .orderBy(castReplies.createdAt);

        // Create a map of cast hashes from Neynar replies to avoid duplicates
        const neynarReplyHashes = new Set<string>();
        const neynarReplies = conversation.conversation?.cast?.direct_replies || [];
        neynarReplies.forEach((reply: any) => {
          if (reply.hash) {
            neynarReplyHashes.add(reply.hash);
          }
        });

        // Add stored replies/quotes that aren't already in Neynar's response
        const additionalReplies: any[] = [];
        for (const storedReply of storedReplies) {
          if (!neynarReplyHashes.has(storedReply.replyCastHash)) {
            // Cast data is stored as JSONB, extract it
            const castData = storedReply.castData as any;
            if (castData) {
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

    // Cache the response
    cacheConversation.set(cacheKey, conversation);

    return NextResponse.json(conversation);
  } catch (error: any) {
    console.error("Conversation API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch conversation" },
      { status: 500 }
    );
  }
}


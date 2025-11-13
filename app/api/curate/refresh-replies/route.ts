import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { curatedCasts } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { neynarClient } from "@/lib/neynar";
import { LookupCastConversationTypeEnum, LookupCastConversationSortTypeEnum, LookupCastConversationFoldEnum } from "@neynar/nodejs-sdk/build/api";
import { sql, and, inArray } from "drizzle-orm";
import { curatedCastInteractions } from "@/lib/schema";
import { shouldHideBotCastClient } from "@/lib/bot-filter";

const DEFAULT_HIDDEN_BOTS = ["betonbangers", "deepbot", "bracky"];

/**
 * Fetch and sort top replies for a curated cast
 * Sorts by interaction count (from curatedCastInteractions), falling back to algorithmic order
 * Also returns the updated cast data
 */
async function fetchAndSortTopReplies(castHash: string): Promise<{ replies: any[]; castData: any; updatedAt: Date } | null> {
  try {
    // Fetch conversation with replies
    const conversation = await neynarClient.lookupCastConversation({
      identifier: castHash,
      type: LookupCastConversationTypeEnum.Hash,
      replyDepth: 5, // Fetch more than needed for sorting
      sortType: LookupCastConversationSortTypeEnum.Algorithmic,
      fold: LookupCastConversationFoldEnum.Above,
      includeChronologicalParentCasts: false,
    });

    const castData = conversation.conversation?.cast;
    if (!castData) {
      return null;
    }

    const replies = castData.direct_replies || [];
    
    if (replies.length === 0) {
      return { replies: [], castData, updatedAt: new Date() };
    }

    // Filter out bot casts using default bot list (no viewer context in curation)
    const filteredReplies = replies.filter((reply: any) => {
      return !shouldHideBotCastClient(reply, DEFAULT_HIDDEN_BOTS, true);
    });

    if (filteredReplies.length === 0) {
      return { replies: [], castData, updatedAt: new Date() };
    }

    // Get cast hashes for all replies
    const replyHashes = filteredReplies.map((reply: any) => reply.hash).filter(Boolean);
    
    if (replyHashes.length === 0) {
      return { replies: [], castData, updatedAt: new Date() };
    }

    // Query interaction counts for each reply
    const interactionCounts = await db
      .select({
        targetCastHash: curatedCastInteractions.targetCastHash,
        count: sql<number>`count(*)::int`.as("count"),
      })
      .from(curatedCastInteractions)
      .where(
        and(
          eq(curatedCastInteractions.curatedCastHash, castHash),
          inArray(curatedCastInteractions.targetCastHash, replyHashes)
        )
      )
      .groupBy(curatedCastInteractions.targetCastHash);

    // Create a map of interaction counts
    const interactionCountMap = new Map<string, number>();
    interactionCounts.forEach((ic) => {
      interactionCountMap.set(ic.targetCastHash, ic.count);
    });

    // Sort replies by interaction count (descending), then by algorithmic order (preserve original order)
    const sortedReplies = filteredReplies.sort((a: any, b: any) => {
      const aCount = interactionCountMap.get(a.hash) || 0;
      const bCount = interactionCountMap.get(b.hash) || 0;
      
      // First sort by interaction count (descending)
      if (bCount !== aCount) {
        return bCount - aCount;
      }
      
      // If counts are equal, preserve algorithmic order (keep original position)
      return 0;
    });

    // Take top 5
    const topReplies = sortedReplies.slice(0, 5);

    return {
      replies: topReplies,
      castData,
      updatedAt: new Date(),
    };
  } catch (error) {
    console.error(`Error fetching replies for cast ${castHash}:`, error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { castHash } = body;

    if (!castHash) {
      return NextResponse.json(
        { error: "castHash is required" },
        { status: 400 }
      );
    }

    // Check if cast exists in curated_casts
    const existingCast = await db
      .select()
      .from(curatedCasts)
      .where(eq(curatedCasts.castHash, castHash))
      .limit(1);

    if (existingCast.length === 0) {
      return NextResponse.json(
        { error: "Cast is not curated" },
        { status: 404 }
      );
    }

    // Fetch and sort top replies
    const topRepliesResult = await fetchAndSortTopReplies(castHash);

    if (!topRepliesResult) {
      return NextResponse.json(
        { error: "Failed to fetch replies" },
        { status: 500 }
      );
    }

    // Update the cast with new replies and refreshed cast data
    await db
      .update(curatedCasts)
      .set({
        castData: topRepliesResult.castData,
        topReplies: topRepliesResult.replies,
        repliesUpdatedAt: topRepliesResult.updatedAt,
      })
      .where(eq(curatedCasts.castHash, castHash));

    return NextResponse.json({
      success: true,
      cast: topRepliesResult.castData,
      replies: topRepliesResult.replies,
      updatedAt: topRepliesResult.updatedAt,
    });
  } catch (error: any) {
    console.error("Refresh replies API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to refresh replies" },
      { status: 500 }
    );
  }
}


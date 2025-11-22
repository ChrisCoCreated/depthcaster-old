import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { castReplies } from "@/lib/schema";
import { eq, or, inArray, desc } from "drizzle-orm";
import { calculateEngagementScore } from "@/lib/engagement";
import { getLastCuratedFeedView } from "@/lib/users";
import { isQuoteCast } from "@/lib/conversation";
import { enrichCastsWithViewerContext } from "@/lib/interactions";

/**
 * Lightweight endpoint to fetch top replies for a curated cast
 * Used for lazy loading replies in the feed
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const castHash = searchParams.get("castHash");
    const sortBy = searchParams.get("sortBy") || "recent-reply";
    const viewerFid = searchParams.get("viewerFid") 
      ? parseInt(searchParams.get("viewerFid")!) 
      : undefined;

    if (!castHash) {
      return NextResponse.json(
        { error: "castHash is required" },
        { status: 400 }
      );
    }

    // Get last session timestamp for filtering
    let lastSessionTimestamp: Date | null = null;
    if (viewerFid) {
      try {
        lastSessionTimestamp = await getLastCuratedFeedView(viewerFid);
      } catch (error) {
        // Continue with null
      }
    }

    // Fetch replies for this cast
    // Exclude parent casts saved for display only (they use placeholder hash 0x0000...)
    const PARENT_CAST_PLACEHOLDER_HASH = "0x0000000000000000000000000000000000000000";
    const storedReplies = await db
      .select({
        curatedCastHash: castReplies.curatedCastHash,
        quotedCastHash: castReplies.quotedCastHash,
        castData: castReplies.castData,
        castCreatedAt: castReplies.castCreatedAt,
        createdAt: castReplies.createdAt,
      })
      .from(castReplies)
      .where(
        or(
          eq(castReplies.curatedCastHash, castHash),
          eq(castReplies.quotedCastHash, castHash)
        )
      )
      .orderBy(
        sortBy === "recent-reply" 
          ? desc(castReplies.castCreatedAt) 
          : desc(castReplies.createdAt)
      )
      .limit(15); // Fetch up to 15, will filter and limit to 10
    
    // Filter out parent casts that use the placeholder hash (metadata-only entries)
    const repliesWithoutParentCasts = storedReplies.filter(
      reply => reply.curatedCastHash !== PARENT_CAST_PLACEHOLDER_HASH
    );

    // Group replies by curatedCastHash (primary association)
    const repliesByHash = new Map<string, Array<{ castData: any; castCreatedAt: Date | null; createdAt: Date }>>();
    
    for (const reply of repliesWithoutParentCasts) {
      const castData = reply.castData as any;
      if (!castData) continue;

      // Group by curatedCastHash (primary association)
      if (reply.curatedCastHash) {
        if (!repliesByHash.has(reply.curatedCastHash)) {
          repliesByHash.set(reply.curatedCastHash, []);
        }
        repliesByHash.get(reply.curatedCastHash)!.push({
          castData,
          castCreatedAt: reply.castCreatedAt,
          createdAt: reply.createdAt,
        });
      }
      
      // Also group quote casts by quotedCastHash if it differs
      if (reply.quotedCastHash && reply.quotedCastHash !== reply.curatedCastHash) {
        if (!repliesByHash.has(reply.quotedCastHash)) {
          repliesByHash.set(reply.quotedCastHash, []);
        }
        repliesByHash.get(reply.quotedCastHash)!.push({
          castData,
          castCreatedAt: reply.castCreatedAt,
          createdAt: reply.createdAt,
        });
      }
    }

    // Get replies for this specific cast
    const replies = repliesByHash.get(castHash) || [];
    
    if (replies.length === 0) {
      return NextResponse.json({ replies: [] });
    }

    // Sort replies based on sortBy mode
    // Note: Database already sorted by castCreatedAt for recent-reply mode
    // We just need to add metadata and filter
    let sortedReplies: Array<{ castData: any; castCreatedAt: Date | null; createdAt: Date }>;
    
    if (sortBy === "recent-reply") {
      // Database already sorted by castCreatedAt DESC, just add metadata
      const repliesWithMetadata = replies.map((reply, index) => {
        const engagementScore = calculateEngagementScore(reply.castData);
        const isNewSinceLastSession = lastSessionTimestamp 
          ? (reply.castCreatedAt || reply.createdAt) > lastSessionTimestamp 
          : true;
        const hasEngagement = engagementScore > 0;
        
        // Always show the most recent reply (index 0) even if it has no engagement
        // This ensures the cast that was sorted to the top actually shows its most recent reply
        const isMostRecent = index === 0;
        
        return {
          ...reply,
          engagementScore,
          shouldShow: isMostRecent || isNewSinceLastSession || hasEngagement,
        };
      });
      
      // Database already sorted, but preserve order and filter
      sortedReplies = repliesWithMetadata;
    } else {
      // Sort by engagement
      const repliesWithScores = replies.map(reply => {
        const engagementScore = calculateEngagementScore(reply.castData);
        const isNewSinceLastSession = lastSessionTimestamp 
          ? reply.createdAt > lastSessionTimestamp 
          : true;
        const hasEngagement = engagementScore > 0;
        
        return {
          ...reply,
          engagementScore,
          shouldShow: isNewSinceLastSession || hasEngagement,
        };
      });
      
      sortedReplies = repliesWithScores.sort((a, b) => {
        return b.engagementScore - a.engagementScore;
      });
    }
    
    // Filter replies, but always show at least 3 if available
    const filteredReplies = sortedReplies
      .filter((reply) => (reply as any).shouldShow);
    
    // If we have fewer than 3 visible replies, include more from the sorted list
    // to ensure at least 3 are shown (up to the available replies)
    const minReplies = Math.min(3, sortedReplies.length);
    if (filteredReplies.length < minReplies) {
      // Add replies that were filtered out, up to the minimum
      const additionalReplies = sortedReplies
        .filter((reply) => !(reply as any).shouldShow)
        .slice(0, minReplies - filteredReplies.length);
      filteredReplies.push(...additionalReplies);
    }
    
    // Limit to top 10 and map to cast data
    let finalReplies = filteredReplies
      .slice(0, 10)
      .map(r => r.castData);
    
    // Fetch parent casts for quote casts in replies
    const quoteCastsWithParents: Array<{ cast: any; parentHash: string }> = [];
    finalReplies.forEach((cast) => {
      if (isQuoteCast(cast) && cast.parent_hash && cast.parent_hash !== castHash) {
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
        
        // Only use parent_hash if it's different from the quoted cast hash
        if (!quotedCastHashes.includes(cast.parent_hash)) {
          cast._isQuoteCast = true;
          quoteCastsWithParents.push({ cast, parentHash: cast.parent_hash });
        }
      }
    });
    
    // Fetch parent casts from database
    if (quoteCastsWithParents.length > 0) {
      const parentHashes = Array.from(new Set(quoteCastsWithParents.map(q => q.parentHash)));
      const storedParentCasts = await db
        .select({
          replyCastHash: castReplies.replyCastHash,
          castData: castReplies.castData,
        })
        .from(castReplies)
        .where(
          inArray(castReplies.replyCastHash, parentHashes)
        );
      
      const parentCastsMap = new Map<string, any>();
      storedParentCasts.forEach((stored) => {
        const parentCast = stored.castData as any;
        if (parentCast) {
          parentCastsMap.set(stored.replyCastHash, parentCast);
        }
      });
      
      // Attach parent casts to quote casts
      finalReplies = finalReplies.map((cast) => {
        if (cast._isQuoteCast && cast.parent_hash && parentCastsMap.has(cast.parent_hash)) {
          cast._parentCast = parentCastsMap.get(cast.parent_hash);
        }
        return cast;
      });
    }

    // Enrich replies with viewer context from database
    if (viewerFid) {
      finalReplies = await enrichCastsWithViewerContext(finalReplies, viewerFid);
    }

    return NextResponse.json({ replies: finalReplies });
  } catch (error: any) {
    console.error("Feed replies API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch replies" },
      { status: 500 }
    );
  }
}


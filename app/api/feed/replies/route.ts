import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { castReplies } from "@/lib/schema";
import { eq, or, inArray, desc, and, gte } from "drizzle-orm";
import { calculateEngagementScore } from "@/lib/engagement";
import { isQuoteCast } from "@/lib/conversation";
import { enrichCastsWithViewerContext } from "@/lib/interactions";

type CastDataForEngagement = {
  reactions?: {
    likes_count?: number;
    likes?: unknown[];
    recasts_count?: number;
    recasts?: unknown[];
  };
  replies?: {
    count?: number;
  };
};

/**
 * Lightweight endpoint to fetch top replies for a curated cast
 * Used for lazy loading replies in the feed
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const castHash = searchParams.get("castHash");
    const sortBy = searchParams.get("sortBy") || "highest-quality-replies";
    const minQualityScore = searchParams.get("minQualityScore")
      ? parseInt(searchParams.get("minQualityScore")!)
      : 0; // Default to 0 (show all replies)
    const viewerFid = searchParams.get("viewerFid") 
      ? parseInt(searchParams.get("viewerFid")!) 
      : undefined;

    if (!castHash) {
      return NextResponse.json(
        { error: "castHash is required" },
        { status: 400 }
      );
    }

    // Fetch replies for this cast
    // Exclude parent casts saved for display only (they use placeholder hash 0x0000...)
    const PARENT_CAST_PLACEHOLDER_HASH = "0x0000000000000000000000000000000000000000";
    const storedReplies = await db
      .select({
        curatedCastHash: castReplies.curatedCastHash,
        quotedCastHash: castReplies.quotedCastHash,
        rootCastHash: castReplies.rootCastHash,
        parentCastHash: castReplies.parentCastHash,
        replyCastHash: castReplies.replyCastHash,
        castData: castReplies.castData,
        castCreatedAt: castReplies.castCreatedAt,
        createdAt: castReplies.createdAt,
        qualityScore: castReplies.qualityScore,
      })
      .from(castReplies)
      .where(
        and(
          or(
            eq(castReplies.curatedCastHash, castHash),
            eq(castReplies.quotedCastHash, castHash)
          ),
          minQualityScore > 0 
            ? gte(castReplies.qualityScore, minQualityScore)
            : undefined
        )
      )
      .orderBy(
        sortBy === "recent-reply" 
          ? desc(castReplies.castCreatedAt) 
          : sortBy === "highest-quality-replies"
          ? desc(castReplies.qualityScore)
          : desc(castReplies.createdAt)
      )
      .limit(40); // Fetch extras so we can deduplicate before slicing
    
    // Filter out parent casts that use the placeholder hash (metadata-only entries)
    const repliesWithoutParentCasts = storedReplies.filter(
      reply => reply.curatedCastHash !== PARENT_CAST_PLACEHOLDER_HASH
    );

    // Filter replies that belong to this curated cast (direct or via quotes)
    const relevantReplies = [];
    const seenHashes = new Set<string>();
    for (const reply of repliesWithoutParentCasts) {
      const matchesCast = reply.curatedCastHash === castHash || reply.quotedCastHash === castHash;
      if (!matchesCast) continue;
      if (!reply.replyCastHash || seenHashes.has(reply.replyCastHash)) continue;
      seenHashes.add(reply.replyCastHash);
      relevantReplies.push(reply);
      if (relevantReplies.length >= 40) {
        break;
      }
    }
    
    if (relevantReplies.length === 0) {
      return NextResponse.json({ replies: [] });
    }

    // Sort replies based on sortBy mode
    // Note: Database already sorted by castCreatedAt for recent-reply mode, and by qualityScore for highest-quality-replies
    // We just need to add metadata and filter
    let sortedReplies: typeof relevantReplies;
    
    if (sortBy === "recent-reply") {
      sortedReplies = relevantReplies;
    } else if (sortBy === "highest-quality-replies") {
      // When sorting by quality, exclude null quality scores (they haven't been analyzed yet)
      // and apply minQualityScore filter
      const repliesWithQuality = relevantReplies.filter((reply) => {
        const score = reply.qualityScore;
        if (score === null || score === undefined) return false;
        return score >= minQualityScore;
      });
      
      // Sort by quality score (descending, highest first)
      sortedReplies = repliesWithQuality.sort((a, b) => {
        const aScore = a.qualityScore!;
        const bScore = b.qualityScore!;
        return bScore - aScore;
      });
    } else {
      // Highest engagement (default fallback)
      sortedReplies = [...relevantReplies].sort((a, b) => {
        const aScore = calculateEngagementScore(a.castData as CastDataForEngagement);
        const bScore = calculateEngagementScore(b.castData as CastDataForEngagement);
        return bScore - aScore;
      });
    }
    
    // Limit to top 10 and map to cast data
    let finalReplies = sortedReplies
      .slice(0, 10)
      .map(r => ({
        entry: r,
        castData: r.castData as any,
      }));
    
    // Fetch parent casts for quote casts in replies
    // Collect parent hashes for context (include all replies, not just quote casts)
    const parentHashes = Array.from(
      new Set(
        finalReplies
          .map(({ castData }) => castData.parent_hash)
          .filter((hash): hash is string => !!hash && hash !== PARENT_CAST_PLACEHOLDER_HASH)
      )
    );
    
    if (parentHashes.length > 0) {
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
      
      finalReplies = finalReplies.map(({ entry, castData }) => {
        const cast = { ...castData };
        cast._rootCastHash = entry.rootCastHash || entry.curatedCastHash || castHash;
        cast._parentCastHash = entry.parentCastHash;
        if (cast.parent_hash && parentCastsMap.has(cast.parent_hash)) {
          cast._parentCast = parentCastsMap.get(cast.parent_hash);
        }
        cast._topReplyTimestamp = entry.castCreatedAt || entry.createdAt;
        return cast;
      });
    } else {
      finalReplies = finalReplies.map(({ entry, castData }) => {
        const cast = { ...castData };
        cast._rootCastHash = entry.rootCastHash || entry.curatedCastHash || castHash;
        cast._parentCastHash = entry.parentCastHash;
        cast._topReplyTimestamp = entry.castCreatedAt || entry.createdAt;
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


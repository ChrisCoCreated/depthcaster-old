import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { castReplies, curatedCasts, userRoles } from "@/lib/schema";
import { eq, or, inArray, desc, and, gte, ne, sql } from "drizzle-orm";
import { enrichCastsWithViewerContext } from "@/lib/interactions";

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
      : 60; // Default to 60 (60+ quality)
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
    
    // Check if there are any replies at all (regardless of quality filter)
    // This helps distinguish between "no replies exist" vs "replies exist but filtered out"
    let hasAnyReplies = false;
    if (minQualityScore > 0 && sortBy === "highest-quality-replies") {
      // Check if any replies exist without quality filter
      const anyRepliesCheck = await db
        .select({ replyCastHash: castReplies.replyCastHash })
        .from(castReplies)
        .where(
          and(
            or(
              eq(castReplies.curatedCastHash, castHash),
              eq(castReplies.quotedCastHash, castHash)
            ),
            ne(castReplies.curatedCastHash, PARENT_CAST_PLACEHOLDER_HASH)
          )
        )
        .limit(1);
      
      hasAnyReplies = anyRepliesCheck.length > 0;
    }
    
    // Phase 1: Fetch metadata only (no JSONB) with JOINs for prioritization
    const storedReplies = await db
      .select({
        curatedCastHash: castReplies.curatedCastHash,
        quotedCastHash: castReplies.quotedCastHash,
        rootCastHash: castReplies.rootCastHash,
        parentCastHash: castReplies.parentCastHash,
        replyCastHash: castReplies.replyCastHash,
        castCreatedAt: castReplies.castCreatedAt,
        createdAt: castReplies.createdAt,
        qualityScore: castReplies.qualityScore,
        engagementScore: castReplies.engagementScore,
        authorFid: castReplies.authorFid,
        curatorFid: curatedCasts.curatorFid,
        isCurator: sql<boolean>`CASE WHEN ${userRoles.role} IS NOT NULL THEN true ELSE false END`.as('is_curator'),
      })
      .from(castReplies)
      .leftJoin(curatedCasts, eq(castReplies.curatedCastHash, curatedCasts.castHash))
      .leftJoin(userRoles, and(
        eq(castReplies.authorFid, userRoles.userFid),
        eq(userRoles.role, 'curator')
      ))
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
      );
    // No LIMIT - fetch all matching replies
    
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
      // No limit - keep all valid replies
    }
    
    if (relevantReplies.length === 0) {
      return NextResponse.json({ replies: [], hasAnyReplies: hasAnyReplies || false });
    }

    // Sort replies with prioritization: OP replies > Curator replies > Sort criteria
    let sortedReplies: typeof relevantReplies;
    
    // Apply prioritization logic
    const prioritizeReplies = (replies: typeof relevantReplies) => {
      return replies.sort((a, b) => {
        // Priority 1: OP replies (authorFid === curatorFid)
        const aIsOP = a.authorFid !== null && a.authorFid === a.curatorFid;
        const bIsOP = b.authorFid !== null && b.authorFid === b.curatorFid;
        if (aIsOP !== bIsOP) {
          return aIsOP ? -1 : 1; // OP replies first
        }
        
        // Priority 2: Curator replies (isCurator === true)
        const aIsCurator = a.isCurator === true;
        const bIsCurator = b.isCurator === true;
        if (aIsCurator !== bIsCurator) {
          return aIsCurator ? -1 : 1; // Curator replies second
        }
        
        // Priority 3: Apply sort criteria
        if (sortBy === "recent-reply") {
          const aTime = a.castCreatedAt?.getTime() || 0;
          const bTime = b.castCreatedAt?.getTime() || 0;
          return bTime - aTime; // Most recent first
        } else if (sortBy === "highest-quality-replies") {
          const aScore = a.qualityScore ?? 0;
          const bScore = b.qualityScore ?? 0;
          return bScore - aScore; // Highest quality first
        } else {
          // Highest engagement (default fallback) - use extracted column
          const aScore = a.engagementScore ?? 0;
          const bScore = b.engagementScore ?? 0;
          return bScore - aScore; // Highest engagement first
        }
      });
    };
    
    if (sortBy === "highest-quality-replies") {
      // When sorting by quality, exclude null quality scores (they haven't been analyzed yet)
      // and apply minQualityScore filter
      const repliesWithQuality = relevantReplies.filter((reply) => {
        const score = reply.qualityScore;
        if (score === null || score === undefined) return false;
        return score >= minQualityScore;
      });
      sortedReplies = prioritizeReplies(repliesWithQuality);
    } else {
      sortedReplies = prioritizeReplies([...relevantReplies]);
    }
    
    // Phase 2: Fetch JSONB only for valid replies (after filtering/sorting)
    if (sortedReplies.length === 0) {
      return NextResponse.json({ replies: [], hasAnyReplies: hasAnyReplies || false });
    }
    
    const validReplyHashes = sortedReplies
      .map(r => r.replyCastHash)
      .filter((hash): hash is string => !!hash);
    
    // Fetch castData JSONB only for valid replies
    const repliesWithData = await db
      .select({
        replyCastHash: castReplies.replyCastHash,
        castData: castReplies.castData,
      })
      .from(castReplies)
      .where(inArray(castReplies.replyCastHash, validReplyHashes));
    
    // Create map for quick lookup
    const castDataMap = new Map<string, any>();
    repliesWithData.forEach((r) => {
      if (r.replyCastHash) {
        castDataMap.set(r.replyCastHash, r.castData);
      }
    });
    
    // Merge metadata with JSONB data
    let finalReplies = sortedReplies
      .map(r => ({
        entry: r,
        castData: castDataMap.get(r.replyCastHash) as any,
      }))
      .filter(r => r.castData); // Filter out any missing castData
    
    // Fetch parent casts for quote casts in replies
    // Collect parent hashes for context (use parentCastHash column, not JSONB parsing)
    const parentHashes = Array.from(
      new Set(
        finalReplies
          .map(({ entry }) => entry.parentCastHash)
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
        // Use parentCastHash from entry (column), not from JSONB
        if (entry.parentCastHash && parentCastsMap.has(entry.parentCastHash)) {
          cast._parentCast = parentCastsMap.get(entry.parentCastHash);
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

    return NextResponse.json({ replies: finalReplies, hasAnyReplies: true });
  } catch (error: any) {
    console.error("Feed replies API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch replies" },
      { status: 500 }
    );
  }
}


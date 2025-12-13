import { db } from "./db";
import { curatedCasts, curatedCastInteractions } from "./schema";
import { eq, and, inArray } from "drizzle-orm";
import { neynarClient } from "./neynar";
import { LookupCastConversationTypeEnum } from "@neynar/nodejs-sdk/build/api";

/**
 * Recursively find the original curated cast for any cast in a thread
 * Works for direct replies and nested replies
 */
export async function findOriginalCuratedCast(castHash: string): Promise<string | null> {
  // First check if this cast itself is curated
  const directCurated = await db
    .select()
    .from(curatedCasts)
    .where(eq(curatedCasts.castHash, castHash))
    .limit(1);

  if (directCurated.length > 0) {
    return castHash;
  }

  // Check if this cast is already tracked as an interaction (meaning we know its curated cast)
  // This helps avoid redundant lookups for nested replies
  const existingInteraction = await db
    .select({ curatedCastHash: curatedCastInteractions.curatedCastHash })
    .from(curatedCastInteractions)
    .where(eq(curatedCastInteractions.targetCastHash, castHash))
    .limit(1);

  if (existingInteraction.length > 0) {
    return existingInteraction[0].curatedCastHash;
  }

  // Fetch the cast to get its parent_hash
  try {
    const conversation = await neynarClient.lookupCastConversation({
      identifier: castHash,
      type: LookupCastConversationTypeEnum.Hash,
      replyDepth: 0,
      includeChronologicalParentCasts: false,
    });

    const cast = conversation.conversation?.cast;
    if (!cast || !cast.parent_hash) {
      // No parent, not part of a curated thread
      return null;
    }

    // Recursively check the parent
    return await findOriginalCuratedCast(cast.parent_hash);
  } catch (error) {
    // Only log a concise error message instead of the full error object
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error finding original curated cast for ${castHash}: ${errorMessage}`);
    return null;
  }
}

/**
 * Track an interaction with a curated cast thread
 * Automatically finds the original curated cast if target is a nested reply
 */
export async function trackCuratedCastInteraction(
  targetCastHash: string,
  interactionType: "reply" | "like" | "recast" | "quote",
  userFid: number
): Promise<void> {
  // Find the original curated cast
  const curatedCastHash = await findOriginalCuratedCast(targetCastHash);

  if (!curatedCastHash) {
    // Not part of a curated thread, don't track
    return;
  }

  // Track the interaction (unique constraint prevents duplicates)
  try {
    await db.insert(curatedCastInteractions).values({
      curatedCastHash,
      targetCastHash,
      interactionType,
      userFid,
    }).onConflictDoNothing();
  } catch (error) {
    console.error("Error tracking curated cast interaction:", error);
    // Don't throw - this is a non-critical operation
  }
}

/**
 * Enrich casts with viewer context (liked/recasted status) from database
 * This avoids expensive Neynar API calls by using our tracked interactions
 */
export async function enrichCastsWithViewerContext(
  casts: any[],
  viewerFid: number | undefined
): Promise<any[]> {
  console.log("[Like Fetch] enrichCastsWithViewerContext called:", {
    viewerFid,
    castsCount: casts.length,
    hasViewerFid: !!viewerFid,
  });

  if (!viewerFid || casts.length === 0) {
    console.log("[Like Fetch] Skipping enrichment:", {
      reason: !viewerFid ? "no viewerFid" : "no casts",
      viewerFid,
      castsCount: casts.length,
    });
    return casts;
  }

  // Extract all cast hashes
  const castHashes = casts.map(cast => cast.hash).filter(Boolean);
  console.log("[Like Fetch] Extracted cast hashes:", {
    viewerFid,
    totalCasts: casts.length,
    validHashes: castHashes.length,
    sampleHashes: castHashes.slice(0, 5),
  });

  if (castHashes.length === 0) {
    console.log("[Like Fetch] No valid cast hashes to query");
    return casts;
  }

  // Query database for viewer's interactions with these casts
  console.log("[Like Fetch] Querying database for interactions:", {
    viewerFid,
    castHashesCount: castHashes.length,
  });

  let interactions;
  try {
    interactions = await db
      .select({
        targetCastHash: curatedCastInteractions.targetCastHash,
        interactionType: curatedCastInteractions.interactionType,
      })
      .from(curatedCastInteractions)
      .where(
        and(
          inArray(curatedCastInteractions.targetCastHash, castHashes),
          eq(curatedCastInteractions.userFid, viewerFid),
          inArray(curatedCastInteractions.interactionType, ["like", "recast"])
        )
      );

    console.log("[Like Fetch] Database query completed:", {
      viewerFid,
      interactionsFound: interactions.length,
      interactions: interactions.slice(0, 10), // Log first 10 for debugging
    });
  } catch (error: any) {
    console.error("[Like Fetch] Database query error:", {
      viewerFid,
      error: error.message,
      stack: error.stack,
    });
    // Return casts without enrichment on error
    return casts;
  }

  // Build maps for efficient lookup
  const likedHashes = new Set<string>();
  const recastedHashes = new Set<string>();
  
  interactions.forEach(interaction => {
    if (interaction.interactionType === "like") {
      likedHashes.add(interaction.targetCastHash);
    } else if (interaction.interactionType === "recast") {
      recastedHashes.add(interaction.targetCastHash);
    }
  });

  console.log("[Like Fetch] Built interaction maps:", {
    viewerFid,
    likedCount: likedHashes.size,
    recastedCount: recastedHashes.size,
    likedHashes: Array.from(likedHashes).slice(0, 10),
    recastedHashes: Array.from(recastedHashes).slice(0, 10),
  });

  // Enrich casts with viewer context
  const enrichedCasts = casts.map(cast => {
    if (!cast.hash) return cast;
    
    const liked = likedHashes.has(cast.hash);
    const recasted = recastedHashes.has(cast.hash);
    
    // Merge viewer context into cast
    return {
      ...cast,
      viewer_context: {
        ...cast.viewer_context,
        liked,
        recasted,
      },
    };
  });

  // Count how many casts were enriched
  const enrichedCount = enrichedCasts.filter(cast => 
    cast.viewer_context?.liked || cast.viewer_context?.recasted
  ).length;

  console.log("[Like Fetch] Enrichment completed:", {
    viewerFid,
    totalCasts: enrichedCasts.length,
    enrichedCount,
    likedCount: likedHashes.size,
    recastedCount: recastedHashes.size,
  });

  return enrichedCasts;
}


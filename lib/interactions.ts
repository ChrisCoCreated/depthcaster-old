import { db } from "./db";
import { curatedCasts, curatedCastInteractions } from "./schema";
import { eq } from "drizzle-orm";
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
    console.error(`Error finding original curated cast for ${castHash}:`, error);
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


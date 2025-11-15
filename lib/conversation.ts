import { neynarClient } from "./neynar";
import { db } from "./db";
import { castReplies } from "./schema";
import { LookupCastConversationTypeEnum, FetchCastQuotesTypeEnum } from "@neynar/nodejs-sdk/build/api";
import { meetsCastQualityThreshold } from "./cast-quality";
import { Cast } from "@neynar/nodejs-sdk/build/api";

/**
 * Recursively traverse conversation tree and collect all replies
 */
async function collectReplies(
  cast: any,
  rootCastHash: string,
  curatedCastHash: string,
  depth: number,
  maxDepth: number,
  collected: Set<string>,
  replies: Array<{
    cast: any;
    depth: number;
    parentHash: string | null;
  }>
): Promise<void> {
  if (depth > maxDepth || !cast || !cast.direct_replies) {
    return;
  }

  for (const reply of cast.direct_replies) {
    if (!reply.hash || collected.has(reply.hash)) {
      continue;
    }

    collected.add(reply.hash);

    // Check quality threshold
    if (meetsCastQualityThreshold(reply)) {
      replies.push({
        cast: reply,
        depth,
        parentHash: reply.parent_hash || cast.hash,
      });

      // Recursively collect nested replies
      if (reply.direct_replies && reply.direct_replies.length > 0) {
        await collectReplies(
          reply,
          rootCastHash,
          curatedCastHash,
          depth + 1,
          maxDepth,
          collected,
          replies
        );
      }
    }
  }
}

/**
 * Fetch and store conversation for a curated cast
 * @param castHash - The curated cast hash
 * @param maxDepth - Maximum depth to traverse (default: 5)
 * @param maxReplies - Maximum number of replies to store (default: 50)
 */
export async function fetchAndStoreConversation(
  castHash: string,
  maxDepth: number = 5,
  maxReplies: number = 50
): Promise<{ stored: number; total: number }> {
  try {
    // Fetch conversation with maximum depth
    const conversation = await neynarClient.lookupCastConversation({
      identifier: castHash,
      type: LookupCastConversationTypeEnum.Hash,
      replyDepth: maxDepth,
      includeChronologicalParentCasts: false,
    });

    const rootCast = conversation.conversation?.cast;
    if (!rootCast) {
      return { stored: 0, total: 0 };
    }

    // Collect all replies recursively
    const collected = new Set<string>();
    const replies: Array<{
      cast: any;
      depth: number;
      parentHash: string | null;
    }> = [];

    await collectReplies(
      rootCast,
      castHash,
      castHash,
      1,
      maxDepth,
      collected,
      replies
    );

    // Limit to maxReplies
    const repliesToStore = replies.slice(0, maxReplies);

    // Store replies in database
    const storedReplies = repliesToStore.map((reply) => ({
      curatedCastHash: castHash,
      replyCastHash: reply.cast.hash,
      castData: reply.cast,
      parentCastHash: reply.parentHash,
      rootCastHash: castHash,
      replyDepth: reply.depth,
      isQuoteCast: false,
      quotedCastHash: null,
    }));

    // Insert replies (use onConflictDoNothing to handle duplicates)
    if (storedReplies.length > 0) {
      await db
        .insert(castReplies)
        .values(storedReplies)
        .onConflictDoNothing({ target: castReplies.replyCastHash });
    }

    // Fetch and store existing quote casts
    let quotesStored = 0;
    try {
      const quotesResponse = await neynarClient.fetchCastQuotes({
        identifier: castHash,
        type: FetchCastQuotesTypeEnum.Hash,
        limit: 50, // Fetch up to 50 quote casts
      });

      const quoteCasts = quotesResponse.result?.quotes || [];
      
      // Filter quote casts by quality threshold
      const qualityQuotes = quoteCasts.filter((quote: any) => 
        meetsCastQualityThreshold(quote)
      );

      // Store quote casts as replies
      const storedQuotes = qualityQuotes.map((quote: any) => ({
        curatedCastHash: castHash,
        replyCastHash: quote.hash,
        castData: quote,
        parentCastHash: quote.parent_hash || null,
        rootCastHash: castHash,
        replyDepth: 0, // Quote casts are top-level, depth 0
        isQuoteCast: true,
        quotedCastHash: castHash, // The cast being quoted
      }));

      if (storedQuotes.length > 0) {
        await db
          .insert(castReplies)
          .values(storedQuotes)
          .onConflictDoNothing({ target: castReplies.replyCastHash });
        quotesStored = storedQuotes.length;
      }
    } catch (error) {
      console.error(`Error fetching quotes for cast ${castHash}:`, error);
      // Don't fail the entire operation if quote fetch fails
    }

    return {
      stored: storedReplies.length + quotesStored,
      total: replies.length + quotesStored,
    };
  } catch (error) {
    console.error(`Error fetching conversation for cast ${castHash}:`, error);
    throw error;
  }
}

/**
 * Traverse up parent chain to find root cast
 */
export async function getRootCastHash(castHash: string): Promise<string | null> {
  try {
    const conversation = await neynarClient.lookupCastConversation({
      identifier: castHash,
      type: LookupCastConversationTypeEnum.Hash,
      replyDepth: 0,
      includeChronologicalParentCasts: true,
    });

    const cast = conversation.conversation?.cast;
    if (!cast) {
      return null;
    }

    // If no parent, this is the root
    if (!cast.parent_hash) {
      return cast.hash;
    }

    // Traverse up parent chain
    const parentCasts = conversation.chronological_parent_casts || [];
    if (parentCasts.length > 0) {
      // The first parent cast in chronological order is the root
      return parentCasts[0].hash || cast.hash;
    }

    return cast.hash;
  } catch (error) {
    console.error(`Error finding root cast for ${castHash}:`, error);
    return null;
  }
}

/**
 * Check if cast has embeds with cast_id (is a quote cast)
 */
export function isQuoteCast(cast: Cast): boolean {
  if (!cast.embeds || !Array.isArray(cast.embeds)) {
    return false;
  }

  return cast.embeds.some(
    (embed: any) => embed.cast_id || (embed.cast && embed.cast.hash)
  );
}

/**
 * Extract all quoted cast hashes from embeds
 */
export function extractQuotedCastHashes(cast: Cast): string[] {
  if (!cast.embeds || !Array.isArray(cast.embeds)) {
    return [];
  }

  const hashes: string[] = [];
  for (const embed of cast.embeds) {
    if (embed.cast_id?.hash) {
      hashes.push(embed.cast_id.hash);
    } else if (embed.cast?.hash) {
      hashes.push(embed.cast.hash);
    }
  }

  return hashes;
}


import { neynarClient } from "./neynar";
import { db } from "./db";
import { castReplies } from "./schema";
import { LookupCastConversationTypeEnum, FetchCastQuotesTypeEnum } from "@neynar/nodejs-sdk/build/api";
import { meetsCastQualityThreshold } from "./cast-quality";
import { Cast } from "@neynar/nodejs-sdk/build/api";
import { sql, eq } from "drizzle-orm";
import { upsertBulkUsers } from "./users";

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
 * Extract author data from casts and build a user data map for bulk upsertion
 * @param casts - Array of cast objects
 * @returns Map of fid to user data
 */
export function extractAuthorDataFromCasts(casts: any[]): Map<number, { username?: string; displayName?: string; pfpUrl?: string }> {
  const userDataMap = new Map<number, { username?: string; displayName?: string; pfpUrl?: string }>();
  
  for (const cast of casts) {
    const author = cast?.author;
    if (author?.fid) {
      const fid = author.fid;
      if (!userDataMap.has(fid)) {
        userDataMap.set(fid, {
          username: author.username,
          displayName: author.display_name,
          pfpUrl: author.pfp_url,
        });
      }
    }
  }
  
  return userDataMap;
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
): Promise<{ stored: number; total: number; rootCast?: Cast }> {
  try {
    // Fetch conversation with maximum depth
    const conversation = await neynarClient.lookupCastConversation({
      identifier: castHash,
      type: LookupCastConversationTypeEnum.Hash,
      replyDepth: maxDepth,
      includeChronologicalParentCasts: false,
    });

    const rootCast = conversation.conversation?.cast as Cast | undefined;
    if (!rootCast) {
      return { stored: 0, total: 0, rootCast };
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

    // Filter replies by quality threshold before storing
    const { meetsCastQualityThreshold } = await import("./cast-quality");
    const qualityReplies = repliesToStore.filter((reply) => {
      const meetsThreshold = meetsCastQualityThreshold(reply.cast);
      if (!meetsThreshold && reply.cast.hash) {
        console.log(`[fetchAndStoreConversation] Reply cast ${reply.cast.hash} does not meet quality threshold (score: ${reply.cast.author?.score}, length: ${reply.cast.text?.length || 0})`);
      }
      return meetsThreshold;
    });

    console.log(`[fetchAndStoreConversation] ${qualityReplies.length} out of ${repliesToStore.length} replies meet quality threshold`);

    // Store replies in database
    const { extractCastTimestamp } = await import("./cast-timestamp");
    const { extractCastMetadata } = await import("./cast-metadata");
    const storedReplies = qualityReplies.map((reply) => {
      const metadata = extractCastMetadata(reply.cast);
      return {
        curatedCastHash: castHash,
        replyCastHash: reply.cast.hash,
        castData: reply.cast,
        castCreatedAt: extractCastTimestamp(reply.cast),
        parentCastHash: reply.parentHash,
        rootCastHash: castHash,
        replyDepth: reply.depth,
        isQuoteCast: false,
        quotedCastHash: null,
        castText: metadata.castText,
        castTextLength: metadata.castTextLength,
        authorFid: metadata.authorFid,
        likesCount: metadata.likesCount,
        recastsCount: metadata.recastsCount,
        repliesCount: metadata.repliesCount,
        engagementScore: metadata.engagementScore,
      };
    });

    // Insert replies (use onConflictDoNothing to handle duplicates)
    if (storedReplies.length > 0) {
      // Ensure all authors exist in users table before inserting replies
      const authorDataMap = extractAuthorDataFromCasts(qualityReplies.map(r => r.cast));
      if (authorDataMap.size > 0) {
        try {
          await upsertBulkUsers(authorDataMap);
        } catch (error) {
          console.error(`[fetchAndStoreConversation] Error upserting authors before regular replies:`, error);
          // Continue anyway - individual inserts may still work if some users exist
        }
      }
      
      await db
        .insert(castReplies)
        .values(storedReplies)
        .onConflictDoUpdate({
          target: castReplies.replyCastHash,
          set: {
            curatedCastHash: sql`excluded.curated_cast_hash`,
            castData: sql`excluded.cast_data`,
            castCreatedAt: sql`excluded.cast_created_at`,
            parentCastHash: sql`excluded.parent_cast_hash`,
            rootCastHash: sql`excluded.root_cast_hash`,
            replyDepth: sql`excluded.reply_depth`,
            isQuoteCast: sql`excluded.is_quote_cast`,
            quotedCastHash: sql`excluded.quoted_cast_hash`,
            castText: sql`excluded.cast_text`,
            castTextLength: sql`excluded.cast_text_length`,
            authorFid: sql`excluded.author_fid`,
            likesCount: sql`excluded.likes_count`,
            recastsCount: sql`excluded.recasts_count`,
            repliesCount: sql`excluded.replies_count`,
            engagementScore: sql`excluded.engagement_score`,
          },
        });

      // Trigger async quality analysis for stored replies (non-blocking)
      const { analyzeCastQualityAsync } = await import("./deepseek-quality");
      for (const reply of qualityReplies) {
        analyzeCastQualityAsync(reply.cast.hash, reply.cast, async (hash, result) => {
          try {
            await db
              .update(castReplies)
              .set({
                qualityScore: result.qualityScore,
                category: result.category,
                qualityAnalyzedAt: new Date(),
              })
              .where(eq(castReplies.replyCastHash, hash));
            console.log(`[fetchAndStoreConversation] Quality analysis completed for reply ${hash}: score=${result.qualityScore}, category=${result.category}`);
          } catch (error: any) {
            console.error(`[fetchAndStoreConversation] Error updating quality analysis for reply ${hash}:`, error.message);
          }
        });
      }
    }

    // Fetch and store existing quote casts
    let quotesStored = 0;
    let quoteRepliesStored = 0;
    try {
      console.log(`[fetchAndStoreConversation] Fetching quotes for cast ${castHash}`);
      const quotesResponse = await neynarClient.fetchCastQuotes({
        identifier: castHash,
        type: FetchCastQuotesTypeEnum.Hash,
        limit: 50, // Fetch up to 50 quote casts
      });

      const quotesResponseAny = quotesResponse as any;
      console.log(`[fetchAndStoreConversation] Quotes API response structure:`, {
        hasResult: !!quotesResponseAny?.result,
        hasQuotes: !!quotesResponseAny?.result?.quotes,
        hasCasts: !!quotesResponseAny?.casts,
        directQuotes: !!quotesResponseAny?.quotes,
        responseKeys: Object.keys(quotesResponseAny || {}),
      });
      
      // Handle different response structures - check casts array (actual API response structure)
      const quoteCasts = quotesResponseAny?.casts || quotesResponseAny?.result?.quotes || quotesResponseAny?.quotes || [];
      console.log(`[fetchAndStoreConversation] Found ${quoteCasts.length} quote casts for cast ${castHash}`);
      
      if (quoteCasts.length > 0) {
        console.log(`[fetchAndStoreConversation] Sample quote cast:`, {
          hash: quoteCasts[0]?.hash,
          author: quoteCasts[0]?.author?.username,
          text: quoteCasts[0]?.text?.substring(0, 50),
        });
      }
      
      // Filter quote casts by quality threshold
      const qualityQuotes = quoteCasts.filter((quote: any) => {
        const meetsThreshold = meetsCastQualityThreshold(quote);
        if (!meetsThreshold && quote.hash) {
          console.log(`[fetchAndStoreConversation] Quote cast ${quote.hash} does not meet quality threshold (score: ${quote.author?.score}, length: ${quote.text?.length || 0})`);
        }
        return meetsThreshold;
      });

      console.log(`[fetchAndStoreConversation] ${qualityQuotes.length} out of ${quoteCasts.length} quote casts meet quality threshold`);

      // Store quote casts as replies
      const { extractCastTimestamp } = await import("./cast-timestamp");
      const { extractCastMetadata } = await import("./cast-metadata");
      const storedQuotes = qualityQuotes.map((quote: any) => {
        const metadata = extractCastMetadata(quote);
        return {
          curatedCastHash: castHash,
          replyCastHash: quote.hash,
          castData: quote,
          castCreatedAt: extractCastTimestamp(quote),
          parentCastHash: quote.parent_hash || null,
          rootCastHash: castHash,
          replyDepth: 0, // Quote casts are top-level, depth 0
          isQuoteCast: true,
          quotedCastHash: castHash, // The cast being quoted
          castText: metadata.castText,
          castTextLength: metadata.castTextLength,
          authorFid: metadata.authorFid,
          likesCount: metadata.likesCount,
          recastsCount: metadata.recastsCount,
          repliesCount: metadata.repliesCount,
          engagementScore: metadata.engagementScore,
        };
      });

      if (storedQuotes.length > 0) {
        console.log(`[fetchAndStoreConversation] Storing ${storedQuotes.length} quote casts for cast ${castHash}`);
        
        // Ensure all authors exist in users table before inserting quote casts
        const quoteAuthorDataMap = extractAuthorDataFromCasts(qualityQuotes);
        if (quoteAuthorDataMap.size > 0) {
          try {
            await upsertBulkUsers(quoteAuthorDataMap);
          } catch (error) {
            console.error(`[fetchAndStoreConversation] Error upserting authors before quote casts:`, error);
            // Continue anyway - individual inserts may still work if some users exist
          }
        }
        
        await db
          .insert(castReplies)
          .values(storedQuotes)
          .onConflictDoUpdate({
            target: castReplies.replyCastHash,
            set: {
              curatedCastHash: sql`excluded.curated_cast_hash`,
              castData: sql`excluded.cast_data`,
              castCreatedAt: sql`excluded.cast_created_at`,
              parentCastHash: sql`excluded.parent_cast_hash`,
              rootCastHash: sql`excluded.root_cast_hash`,
              replyDepth: sql`excluded.reply_depth`,
              isQuoteCast: sql`excluded.is_quote_cast`,
              quotedCastHash: sql`excluded.quoted_cast_hash`,
              castText: sql`excluded.cast_text`,
              castTextLength: sql`excluded.cast_text_length`,
              authorFid: sql`excluded.author_fid`,
              likesCount: sql`excluded.likes_count`,
              recastsCount: sql`excluded.recasts_count`,
              repliesCount: sql`excluded.replies_count`,
              engagementScore: sql`excluded.engagement_score`,
            },
          });
        quotesStored = storedQuotes.length;
        console.log(`[fetchAndStoreConversation] Successfully stored ${quotesStored} quote casts for cast ${castHash}`);

        // Trigger async quality analysis for stored quote casts (non-blocking)
        const { analyzeCastQualityAsync: analyzeQuoteQualityAsync } = await import("./deepseek-quality");
        for (const quote of qualityQuotes) {
          analyzeQuoteQualityAsync(quote.hash, quote, async (hash, result) => {
            try {
              await db
                .update(castReplies)
                .set({
                  qualityScore: result.qualityScore,
                  category: result.category,
                  qualityAnalyzedAt: new Date(),
                })
                .where(eq(castReplies.replyCastHash, hash));
              console.log(`[fetchAndStoreConversation] Quality analysis completed for quote cast ${hash}: score=${result.qualityScore}, category=${result.category}`);
            } catch (error: any) {
              console.error(`[fetchAndStoreConversation] Error updating quality analysis for quote cast ${hash}:`, error.message);
            }
          });
        }

        // Fetch and store replies to each quote cast (treat them the same as replies to the original curated cast)
        for (const quoteCast of qualityQuotes) {
          try {
            console.log(`[fetchAndStoreConversation] Fetching replies for quote cast ${quoteCast.hash}`);
            
            // Fetch conversation for the quote cast
            const quoteConversation = await neynarClient.lookupCastConversation({
              identifier: quoteCast.hash,
              type: LookupCastConversationTypeEnum.Hash,
              replyDepth: maxDepth,
              includeChronologicalParentCasts: false,
            });

            const quoteRootCast = quoteConversation.conversation?.cast;
            if (!quoteRootCast) {
              continue;
            }

            // Collect replies to the quote cast
            const quoteCollected = new Set<string>();
            const quoteReplies: Array<{
              cast: any;
              depth: number;
              parentHash: string | null;
            }> = [];

            await collectReplies(
              quoteRootCast,
              castHash, // Use original curated cast hash as root
              castHash, // Use original curated cast hash as curated cast hash
              1, // Start at depth 1 (replies to quote cast)
              maxDepth,
              quoteCollected,
              quoteReplies
            );

            // Limit to maxReplies per quote cast
            const quoteRepliesToStore = quoteReplies.slice(0, maxReplies);

            // Filter replies to quote cast by quality threshold before storing
            const qualityQuoteReplies = quoteRepliesToStore.filter((reply) => {
              const meetsThreshold = meetsCastQualityThreshold(reply.cast);
              if (!meetsThreshold && reply.cast.hash) {
                console.log(`[fetchAndStoreConversation] Reply to quote cast ${reply.cast.hash} does not meet quality threshold (score: ${reply.cast.author?.score}, length: ${reply.cast.text?.length || 0})`);
              }
              return meetsThreshold;
            });

            console.log(`[fetchAndStoreConversation] ${qualityQuoteReplies.length} out of ${quoteRepliesToStore.length} replies to quote cast ${quoteCast.hash} meet quality threshold`);

            // Store replies to quote cast, but associate them with the original curated cast
            const { extractCastTimestamp } = await import("./cast-timestamp");
            const { extractCastMetadata } = await import("./cast-metadata");
            const storedQuoteReplies = qualityQuoteReplies.map((reply) => {
              const metadata = extractCastMetadata(reply.cast);
              return {
                curatedCastHash: castHash, // Original curated cast hash
                replyCastHash: reply.cast.hash,
                castData: reply.cast,
                castCreatedAt: extractCastTimestamp(reply.cast),
                parentCastHash: reply.parentHash,
                rootCastHash: castHash, // Original curated cast hash
                replyDepth: reply.depth,
                isQuoteCast: false, // These are regular replies, not quote casts
                quotedCastHash: null, // Not directly quoting the curated cast
                castText: metadata.castText,
                castTextLength: metadata.castTextLength,
                authorFid: metadata.authorFid,
                likesCount: metadata.likesCount,
                recastsCount: metadata.recastsCount,
                repliesCount: metadata.repliesCount,
                engagementScore: metadata.engagementScore,
              };
            });

            if (storedQuoteReplies.length > 0) {
              // Ensure all authors exist in users table before inserting replies to quote casts
              const quoteReplyAuthorDataMap = extractAuthorDataFromCasts(qualityQuoteReplies.map(r => r.cast));
              if (quoteReplyAuthorDataMap.size > 0) {
                try {
                  await upsertBulkUsers(quoteReplyAuthorDataMap);
                } catch (error) {
                  console.error(`[fetchAndStoreConversation] Error upserting authors before quote cast replies:`, error);
                  // Continue anyway - individual inserts may still work if some users exist
                }
              }
              
              await db
                .insert(castReplies)
                .values(storedQuoteReplies)
                .onConflictDoUpdate({
                  target: castReplies.replyCastHash,
                  set: {
                    curatedCastHash: sql`excluded.curated_cast_hash`,
                    castData: sql`excluded.cast_data`,
                    castCreatedAt: sql`excluded.cast_created_at`,
                    parentCastHash: sql`excluded.parent_cast_hash`,
                    rootCastHash: sql`excluded.root_cast_hash`,
                    replyDepth: sql`excluded.reply_depth`,
                    isQuoteCast: sql`excluded.is_quote_cast`,
                    quotedCastHash: sql`excluded.quoted_cast_hash`,
                    castText: sql`excluded.cast_text`,
                    castTextLength: sql`excluded.cast_text_length`,
                    authorFid: sql`excluded.author_fid`,
                    likesCount: sql`excluded.likes_count`,
                    recastsCount: sql`excluded.recasts_count`,
                    repliesCount: sql`excluded.replies_count`,
                    engagementScore: sql`excluded.engagement_score`,
                  },
                });
              quoteRepliesStored += storedQuoteReplies.length;
              console.log(`[fetchAndStoreConversation] Stored ${storedQuoteReplies.length} replies to quote cast ${quoteCast.hash}`);

              // Trigger async quality analysis for stored replies to quote casts (non-blocking)
              const { analyzeCastQualityAsync: analyzeQuoteReplyQualityAsync } = await import("./deepseek-quality");
              for (const reply of qualityQuoteReplies) {
                analyzeQuoteReplyQualityAsync(reply.cast.hash, reply.cast, async (hash, result) => {
                  try {
                    await db
                      .update(castReplies)
                      .set({
                        qualityScore: result.qualityScore,
                        category: result.category,
                        qualityAnalyzedAt: new Date(),
                      })
                      .where(eq(castReplies.replyCastHash, hash));
                    console.log(`[fetchAndStoreConversation] Quality analysis completed for reply to quote cast ${hash}: score=${result.qualityScore}, category=${result.category}`);
                  } catch (error: any) {
                    console.error(`[fetchAndStoreConversation] Error updating quality analysis for reply to quote cast ${hash}:`, error.message);
                  }
                });
              }
            }
          } catch (error: any) {
            console.error(`[fetchAndStoreConversation] Error fetching replies for quote cast ${quoteCast.hash}:`, error);
            // Continue with next quote cast if one fails
          }
        }

        console.log(`[fetchAndStoreConversation] Stored ${quoteRepliesStored} total replies to quote casts for cast ${castHash}`);
      } else {
        console.log(`[fetchAndStoreConversation] No quote casts to store for cast ${castHash} (${quoteCasts.length} found, ${qualityQuotes.length} met threshold)`);
      }
    } catch (error: any) {
      console.error(`[fetchAndStoreConversation] Error fetching/storing quotes for cast ${castHash}:`, error);
      console.error(`[fetchAndStoreConversation] Error details:`, {
        message: error?.message,
        stack: error?.stack,
        name: error?.name,
      });
      // Don't fail the entire operation if quote fetch fails
    }

    // Calculate total stored (including quote replies)
    const totalStored = storedReplies.length + quotesStored + (quoteRepliesStored || 0);
    const totalReplies = replies.length + quotesStored + (quoteRepliesStored || 0);

    return {
      stored: totalStored,
      total: totalReplies,
      rootCast,
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
    const parentCasts = (conversation as any).chronological_parent_casts || (conversation as any).conversation?.chronological_parent_casts || [];
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
    const embedAny = embed as any;
    if (embedAny.cast_id?.hash) {
      hashes.push(embedAny.cast_id.hash);
    } else if (embedAny.cast?.hash) {
      hashes.push(embedAny.cast.hash);
    }
  }

  return hashes;
}

/**
 * Extract URLs from link embeds (not cast embeds)
 */
export function extractLinkUrls(cast: Cast): string[] {
  if (!cast.embeds || !Array.isArray(cast.embeds)) {
    return [];
  }

  const urls: string[] = [];
  for (const embed of cast.embeds) {
    const embedAny = embed as any;
    // Only include embeds that are links (have url but not cast_id/cast)
    if (embedAny.url && !embedAny.cast_id && !embedAny.cast) {
      urls.push(embedAny.url);
    }
  }

  return urls;
}

/**
 * Extract text from embedded casts
 * Fetches cast data for each quoted cast hash and extracts the text
 */
export async function extractEmbeddedCastTexts(
  cast: Cast,
  neynarClient: any
): Promise<string[]> {
  const quotedCastHashes = extractQuotedCastHashes(cast);
  if (quotedCastHashes.length === 0) {
    return [];
  }

  const texts: string[] = [];
  for (const hash of quotedCastHashes) {
    try {
      const response = await neynarClient.lookupCastConversation({
        identifier: hash,
        type: LookupCastConversationTypeEnum.Hash,
        replyDepth: 0,
        includeChronologicalParentCasts: false,
      });
      if (response?.conversation?.cast?.text) {
        texts.push(response.conversation.cast.text);
      }
    } catch (error) {
      console.error(`Failed to fetch embedded cast ${hash}:`, error);
      // Continue with other casts even if one fails
    }
  }

  return texts;
}


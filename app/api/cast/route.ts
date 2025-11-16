import { NextRequest, NextResponse } from "next/server";
import { neynarClient } from "@/lib/neynar";
import { trackCuratedCastInteraction } from "@/lib/interactions";
import { LookupCastConversationTypeEnum } from "@neynar/nodejs-sdk/build/api";
import { db } from "@/lib/db";
import { curatedCasts, castReplies } from "@/lib/schema";
import { eq, sql } from "drizzle-orm";
import { isQuoteCast, extractQuotedCastHashes, getRootCastHash, fetchAndStoreConversation } from "@/lib/conversation";
import { meetsCastQualityThreshold } from "@/lib/cast-quality";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { signerUuid, text, parent, embeds, channelId, parentAuthorFid } = body;

    if (!signerUuid) {
      return NextResponse.json(
        { error: "signerUuid is required" },
        { status: 400 }
      );
    }

    const cast = await neynarClient.publishCast({
      signerUuid,
      text: text || "",
      parent,
      embeds,
      channelId,
      parentAuthorFid,
    });

    // Get user FID from signer
    let userFid: number | undefined;
    try {
      const signer = await neynarClient.lookupSigner({ signerUuid });
      userFid = signer.fid;
    } catch (error) {
      console.error("Error fetching signer:", error);
    }

    // Track interaction if this is a reply or quote to a curated cast thread
    if (userFid) {
      // Check if this is a quote (has embeds with cast_id)
      const isQuote = embeds?.some((embed: any) => embed.cast_id);
      
      if (isQuote && embeds) {
        // Track quote interactions for each quoted cast
        for (const embed of embeds) {
          if (embed.cast_id?.hash) {
            trackCuratedCastInteraction(embed.cast_id.hash, "quote", userFid).catch((error) => {
              console.error("Error tracking quote interaction:", error);
            });
          }
        }
      } else if (parent) {
        // Track as reply interaction
        trackCuratedCastInteraction(parent, "reply", userFid).catch((error) => {
          console.error("Error tracking reply interaction:", error);
        });
      }
    }

    // Update database if this is a reply or quote to a curated cast
    const castHash = (cast as any).hash;
    if (castHash) {
      try {
        // Fetch the full cast data from Neynar (includes reactions, etc.)
        const castResponse = await neynarClient.lookupCastConversation({
          identifier: castHash,
          type: LookupCastConversationTypeEnum.Hash,
          replyDepth: 0,
          includeChronologicalParentCasts: false,
        });
        
        const fullCastData = castResponse.conversation?.cast;
        if (!fullCastData) {
          throw new Error("Failed to fetch cast data");
        }

        const castIsQuote = isQuoteCast(fullCastData);
        
        if (castIsQuote) {
          // Handle quote cast
          const quotedCastHashes = extractQuotedCastHashes(fullCastData);
          
          for (const quotedCastHash of quotedCastHashes) {
            // Check if quoted cast is curated
            const curatedCast = await db
              .select()
              .from(curatedCasts)
              .where(eq(curatedCasts.castHash, quotedCastHash))
              .limit(1);

            if (curatedCast.length > 0) {
              // Check quality threshold
              if (meetsCastQualityThreshold(fullCastData)) {
                // Store quote cast as reply
                const { extractCastTimestamp } = await import("@/lib/cast-timestamp");
                const { extractCastMetadata } = await import("@/lib/cast-metadata");
                const metadata = extractCastMetadata(fullCastData);
                await db
                  .insert(castReplies)
                  .values({
                    curatedCastHash: quotedCastHash,
                    replyCastHash: fullCastData.hash,
                    castData: fullCastData,
                    castCreatedAt: extractCastTimestamp(fullCastData),
                    parentCastHash: fullCastData.parent_hash || null,
                    rootCastHash: quotedCastHash,
                    replyDepth: 0, // Quote casts are top-level
                    isQuoteCast: true,
                    quotedCastHash: quotedCastHash,
                    castText: metadata.castText,
                    castTextLength: metadata.castTextLength,
                    authorFid: metadata.authorFid,
                    likesCount: metadata.likesCount,
                    recastsCount: metadata.recastsCount,
                    repliesCount: metadata.repliesCount,
                    engagementScore: metadata.engagementScore,
                  })
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

                console.log(`[Cast API] Stored quote cast ${fullCastData.hash} for curated cast ${quotedCastHash}`);
              }

              // Refresh quoted cast data and replies to capture updated reactions
              const conversationResult = await fetchAndStoreConversation(quotedCastHash, 5, 50);
              const quotedCastData = conversationResult.rootCast;
              if (quotedCastData) {
                const { extractCastTimestamp } = await import("@/lib/cast-timestamp");
                const { extractCastMetadata } = await import("@/lib/cast-metadata");
                const metadata = extractCastMetadata(quotedCastData);
                await db
                  .update(curatedCasts)
                  .set({
                    castData: quotedCastData,
                    castCreatedAt: extractCastTimestamp(quotedCastData),
                    castText: metadata.castText,
                    castTextLength: metadata.castTextLength,
                    authorFid: metadata.authorFid,
                    likesCount: metadata.likesCount,
                    recastsCount: metadata.recastsCount,
                    repliesCount: metadata.repliesCount,
                    engagementScore: metadata.engagementScore,
                    parentHash: metadata.parentHash,
                  })
                  .where(eq(curatedCasts.castHash, quotedCastHash));
              }
            }
          }
        } else if (parent) {
          // Handle regular reply
          // Find the root curated cast
          const rootHash = await getRootCastHash(parent);
          
          if (rootHash) {
            // Check if root cast is curated
            const curatedCast = await db
              .select()
              .from(curatedCasts)
              .where(eq(curatedCasts.castHash, rootHash))
              .limit(1);

            if (curatedCast.length > 0) {
              // Check quality threshold
              if (meetsCastQualityThreshold(fullCastData)) {
                // Calculate reply depth
                let replyDepth = 1;
                let currentParentHash = parent;
                
                // Traverse up to find depth
                while (currentParentHash && replyDepth < 10) {
                  const parentReply = await db
                    .select()
                    .from(castReplies)
                    .where(eq(castReplies.replyCastHash, currentParentHash))
                    .limit(1);
                  
                  if (parentReply.length > 0) {
                    replyDepth = parentReply[0].replyDepth + 1;
                    break;
                  }
                  
                  // Try to get parent from Neynar
                  try {
                    const parentRootHash = await getRootCastHash(currentParentHash);
                    if (parentRootHash === rootHash) {
                      replyDepth++;
                      break;
                    }
                  } catch (error) {
                    break;
                  }
                  
                  replyDepth++;
                  if (replyDepth >= 10) break;
                }

                // Store reply
                const { extractCastTimestamp } = await import("@/lib/cast-timestamp");
                const { extractCastMetadata } = await import("@/lib/cast-metadata");
                const metadata = extractCastMetadata(fullCastData);
                await db
                  .insert(castReplies)
                  .values({
                    curatedCastHash: rootHash,
                    replyCastHash: fullCastData.hash,
                    castData: fullCastData,
                    castCreatedAt: extractCastTimestamp(fullCastData),
                    parentCastHash: parent,
                    rootCastHash: rootHash,
                    replyDepth,
                    isQuoteCast: false,
                    quotedCastHash: null,
                    castText: metadata.castText,
                    castTextLength: metadata.castTextLength,
                    authorFid: metadata.authorFid,
                    likesCount: metadata.likesCount,
                    recastsCount: metadata.recastsCount,
                    repliesCount: metadata.repliesCount,
                    engagementScore: metadata.engagementScore,
                  })
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

                console.log(`[Cast API] Stored reply ${fullCastData.hash} for curated cast ${rootHash} at depth ${replyDepth}`);
              }

              // Refresh root cast data and replies after posting reply
              const conversationResult = await fetchAndStoreConversation(rootHash, 5, 50);
              const rootCastData = conversationResult.rootCast;
              if (rootCastData) {
                const { extractCastTimestamp } = await import("@/lib/cast-timestamp");
                const { extractCastMetadata } = await import("@/lib/cast-metadata");
                const metadata = extractCastMetadata(rootCastData);
                await db
                  .update(curatedCasts)
                  .set({
                    castData: rootCastData,
                    castCreatedAt: extractCastTimestamp(rootCastData),
                    castText: metadata.castText,
                    castTextLength: metadata.castTextLength,
                    authorFid: metadata.authorFid,
                    likesCount: metadata.likesCount,
                    recastsCount: metadata.recastsCount,
                    repliesCount: metadata.repliesCount,
                    engagementScore: metadata.engagementScore,
                    parentHash: metadata.parentHash,
                  })
                  .where(eq(curatedCasts.castHash, rootHash));
              }
            }
          }
        }
      } catch (error: any) {
        // Don't fail the cast publish if database update fails
        console.error(`[Cast API] Error updating database for cast ${castHash}:`, error);
      }
    }

    return NextResponse.json({ success: true, cast });
  } catch (error: any) {
    console.error("Cast API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to publish cast" },
      { status: 500 }
    );
  }
}


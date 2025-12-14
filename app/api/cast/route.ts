import { NextRequest, NextResponse } from "next/server";
import { neynarClient } from "@/lib/neynar";
import { trackCuratedCastInteraction } from "@/lib/interactions";
import { LookupCastConversationTypeEnum } from "@neynar/nodejs-sdk/build/api";
import { db } from "@/lib/db";
import { curatedCasts, castReplies } from "@/lib/schema";
import { eq, sql } from "drizzle-orm";
import { isQuoteCast, extractQuotedCastHashes, getRootCastHash, fetchAndStoreConversation } from "@/lib/conversation";
import { meetsCastQualityThreshold } from "@/lib/cast-quality";
import {
  PRO_CAST_BYTE_LIMIT,
  STANDARD_CAST_BYTE_LIMIT,
  getMaxCastBytes,
  getUtf8ByteLength,
  hasActiveProSubscription,
} from "@/lib/castLimits";
import { analyzeCastQualityAsync } from "@/lib/deepseek-quality";
import { isSuperAdmin, getUserRoles } from "@/lib/roles";
import { recordActivityEvent } from "@/lib/activityTracking";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    let { signerUuid, text, parent, embeds, channelId, parentAuthorFid } = body;

    // Normalize embeds format - Neynar SDK accepts both cast_id (snake_case) and castId (camelCase)
    // Convert cast_id to castId and ensure hash has 0x prefix (Neynar API requires 0x prefix for 20-byte hashes)
    if (embeds && Array.isArray(embeds)) {
      embeds = embeds.map((embed: any, index: number) => {
        const castId = embed.castId || embed.cast_id;
        if (castId) {
          let hash = castId.hash || castId;
          const fid = castId.fid || embed.cast_id?.fid;
          
          // Ensure hash has 0x prefix - Neynar API requires this for proper byte parsing
          const has0xPrefix = hash.startsWith('0x') || hash.startsWith('0X');
          if (typeof hash === 'string' && !has0xPrefix) {
            hash = '0x' + hash;
          }
          
          const normalizedEmbed = {
            castId: {
              hash,
              fid,
            },
            ...(embed.url ? { url: embed.url } : {}),
          };
          
          return normalizedEmbed;
        }
        return embed;
      });
    }

    if (!signerUuid) {
      return NextResponse.json(
        { error: "signerUuid is required" },
        { status: 400 }
      );
    }

    const normalizedText = typeof text === "string" ? text : "";
    const trimmedText = normalizedText.trim();

    if (!trimmedText) {
      return NextResponse.json(
        { error: "Cast text cannot be empty" },
        { status: 400 }
      );
    }

    // Get user FID from signer before publishing (needed for pro checks and superadmin validation)
    let userFid: number | undefined;
    try {
      const signer = await neynarClient.lookupSigner({ signerUuid });
      userFid = signer.fid;
    } catch (error) {
      console.error("Error fetching signer:", error);
    }

    // Validate parent URL: only superadmins can use URL parents
    if (parent && typeof parent === "string" && parent.startsWith("http")) {
      if (!userFid) {
        return NextResponse.json(
          { error: "Unable to verify user permissions for URL parent" },
          { status: 400 }
        );
      }

      const userRoles = await getUserRoles(userFid);
      if (!isSuperAdmin(userRoles)) {
        return NextResponse.json(
          { error: "Only superadmins can use URL parents" },
          { status: 403 }
        );
      }

      // Validate that it's the specific thinking URL
      if (parent !== "https://www.depthcaster.com/thinking") {
        return NextResponse.json(
          { error: "Invalid parent URL. Only https://www.depthcaster.com/thinking is allowed" },
          { status: 400 }
        );
      }
    }

    const textByteLength = getUtf8ByteLength(trimmedText);
    let isProUser = false;

    if (textByteLength > STANDARD_CAST_BYTE_LIMIT && userFid) {
      try {
        const userResponse = await neynarClient.fetchBulkUsers({ fids: [userFid] });
        const fetchedUser = userResponse.users?.[0];
        isProUser = hasActiveProSubscription(fetchedUser as any);
      } catch (error) {
        console.error("Error verifying pro status:", error);
      }
    }

    const maxBytesAllowed = getMaxCastBytes(isProUser);
    if (textByteLength > maxBytesAllowed) {
      const errorMessage = isProUser
        ? `Pro casts are limited to ${PRO_CAST_BYTE_LIMIT} bytes.`
        : `Standard casts are limited to ${STANDARD_CAST_BYTE_LIMIT} bytes. Upgrade to Pro to post up to ${PRO_CAST_BYTE_LIMIT} bytes.`;
      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }

    const publishCastParams = {
      signerUuid,
      text: trimmedText,
      parent,
      embeds,
      channelId,
      parentAuthorFid,
    };

    let castResponse;
    try {
      castResponse = await neynarClient.publishCast(publishCastParams);
    } catch (error: any) {
      // Log detailed error information for debugging
      console.error("[Cast API] Neynar publishCast error:", {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        requestData: {
          signerUuid,
          textLength: trimmedText.length,
          hasParent: !!parent,
          embeds,
          channelId,
          parentAuthorFid,
        },
      });
      throw error;
    }

    // Extract cast from PostCastResponse
    const cast = (castResponse as any).cast || castResponse;
    const castHash = (cast as any).hash;

    // Track interaction if this is a reply or quote to a curated cast thread
    if (userFid) {
      // Check if this is a quote (has embeds with castId or cast_id)
      const isQuote = embeds?.some((embed: any) => embed.castId || embed.cast_id);
      
      if (isQuote && embeds) {
        // Track quote interactions for each quoted cast
        for (const embed of embeds) {
          const castId = embed.castId || embed.cast_id;
          if (castId?.hash) {
            trackCuratedCastInteraction(castId.hash, "quote", userFid).catch((error) => {
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
    let fullCastData: any = cast; // Default to the published cast
    if (castHash) {
      try {
        // Fetch the full cast data from Neynar (includes reactions, etc.)
        const conversationResponse = await neynarClient.lookupCastConversation({
          identifier: castHash,
          type: LookupCastConversationTypeEnum.Hash,
          replyDepth: 0,
          includeChronologicalParentCasts: false,
        });
        
        const fetchedCastData = conversationResponse.conversation?.cast;
        if (fetchedCastData) {
          fullCastData = fetchedCastData;
        }

        const castIsQuote = isQuoteCast(fullCastData as any);
        
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
              if (meetsCastQualityThreshold(fullCastData as any)) {
                // Store quote cast as reply
                const { extractCastTimestamp } = await import("@/lib/cast-timestamp");
                const { extractCastMetadata } = await import("@/lib/cast-metadata");
                const metadata = extractCastMetadata(fullCastData as any);
                const replyCastHash = (fullCastData as any).hash;
                await db
                  .insert(castReplies)
                  .values({
                    curatedCastHash: quotedCastHash,
                    replyCastHash: replyCastHash,
                    castData: fullCastData,
                    castCreatedAt: extractCastTimestamp(fullCastData as any),
                    parentCastHash: (fullCastData as any).parent_hash || null,
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

                console.log(`[Cast API] Stored quote cast ${replyCastHash} for curated cast ${quotedCastHash}`);

                // Record activity event for post_reply (only if author_fid is not null)
                if (metadata.authorFid) {
                  try {
                    await recordActivityEvent(metadata.authorFid, "post_reply", {
                      cast_hash: replyCastHash,
                      curated_cast_hash: quotedCastHash,
                      is_quote_cast: true,
                    });
                  } catch (error) {
                    // Log but don't fail - activity tracking shouldn't break cast creation
                    console.error("Failed to record post_reply activity:", error);
                  }
                }

                // Trigger async quality analysis (non-blocking)
                analyzeCastQualityAsync(replyCastHash, fullCastData, async (hash, result) => {
                  try {
                    await db
                      .update(castReplies)
                      .set({
                        qualityScore: result.qualityScore,
                        category: result.category,
                        qualityAnalyzedAt: new Date(),
                      })
                      .where(eq(castReplies.replyCastHash, hash));
                    console.log(`[Cast API] Quality analysis completed for reply ${hash}: score=${result.qualityScore}, category=${result.category}`);
                  } catch (error: any) {
                    console.error(`[Cast API] Error updating quality analysis for reply ${hash}:`, error.message);
                  }
                });
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
              if (meetsCastQualityThreshold(fullCastData as any)) {
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
                const metadata = extractCastMetadata(fullCastData as any);
                const replyCastHash = (fullCastData as any).hash;
                await db
                  .insert(castReplies)
                  .values({
                    curatedCastHash: rootHash,
                    replyCastHash: replyCastHash,
                    castData: fullCastData,
                    castCreatedAt: extractCastTimestamp(fullCastData as any),
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

                console.log(`[Cast API] Stored reply ${replyCastHash} for curated cast ${rootHash} at depth ${replyDepth}`);

                // Record activity event for post_reply (only if author_fid is not null)
                if (metadata.authorFid) {
                  try {
                    await recordActivityEvent(metadata.authorFid, "post_reply", {
                      cast_hash: replyCastHash,
                      curated_cast_hash: rootHash,
                    });
                  } catch (error) {
                    // Log but don't fail - activity tracking shouldn't break cast creation
                    console.error("Failed to record post_reply activity:", error);
                  }
                }

                // Trigger async quality analysis (non-blocking)
                analyzeCastQualityAsync(replyCastHash, fullCastData, async (hash, result) => {
                  try {
                    await db
                      .update(castReplies)
                      .set({
                        qualityScore: result.qualityScore,
                        category: result.category,
                        qualityAnalyzedAt: new Date(),
                      })
                      .where(eq(castReplies.replyCastHash, hash));
                    console.log(`[Cast API] Quality analysis completed for reply ${hash}: score=${result.qualityScore}, category=${result.category}`);
                  } catch (error: any) {
                    console.error(`[Cast API] Error updating quality analysis for reply ${hash}:`, error.message);
                  }
                });
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

    // Return the full cast data if we fetched it, otherwise return the published cast
    return NextResponse.json({ success: true, cast: fullCastData });
  } catch (error: any) {
    console.error("Cast API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to publish cast" },
      { status: 500 }
    );
  }
}


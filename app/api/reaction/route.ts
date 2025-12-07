import { NextRequest, NextResponse } from "next/server";
import { neynarClient } from "@/lib/neynar";
import { ReactionType, LookupCastConversationTypeEnum } from "@neynar/nodejs-sdk/build/api";
import { trackCuratedCastInteraction } from "@/lib/interactions";
import { db } from "@/lib/db";
import { curatedCasts, curatedCastInteractions } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { fetchAndStoreConversation, getRootCastHash } from "@/lib/conversation";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { signerUuid, reactionType, target, targetAuthorFid } = body;

    // Verbose logging - log all received data
    console.log("[Reaction API] POST - Backend received request:", {
      timestamp: new Date().toISOString(),
      method: "POST",
      endpoint: "/api/reaction",
      rawBody: body,
      parsedFields: {
        signerUuid: signerUuid,
        reactionType: reactionType,
        target: target,
        targetAuthorFid: targetAuthorFid,
      },
      requestHeaders: {
        contentType: request.headers.get("content-type"),
        referer: request.headers.get("referer"),
        userAgent: request.headers.get("user-agent"),
      },
    });

    if (!signerUuid || !reactionType || !target) {
      console.log("[Reaction API] POST - Missing required fields:", {
        hasSignerUuid: !!signerUuid,
        hasReactionType: !!reactionType,
        hasTarget: !!target,
      });
      return NextResponse.json(
        { error: "signerUuid, reactionType, and target are required" },
        { status: 400 }
      );
    }

    // Get user FID from signer
    let userFid: number | undefined;
    try {
      const signer = await neynarClient.lookupSigner({ signerUuid });
      userFid = signer.fid;
      console.log("[Reaction API] POST - Signer lookup successful:", {
        signerUuid: signerUuid,
        userFid: userFid,
        signerDetails: {
          fid: signer.fid,
          status: signer.status,
        },
      });
    } catch (error) {
      console.error("[Reaction API] POST - Error fetching signer:", {
        signerUuid: signerUuid,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Check if cast is from 1500+ feed (not in curated casts table)
    let isFrom1500Feed = false;
    try {
      const curatedCastCheck = await db
        .select({ castHash: curatedCasts.castHash })
        .from(curatedCasts)
        .where(eq(curatedCasts.castHash, target))
        .limit(1);
      
      isFrom1500Feed = curatedCastCheck.length === 0;
      
      console.log("[Reaction API] POST - Cast source check:", {
        target: target,
        isCurated: curatedCastCheck.length > 0,
        isFrom1500Feed: isFrom1500Feed,
      });
    } catch (error) {
      console.error("[Reaction API] POST - Error checking cast source:", error);
    }

    console.log("[Reaction API] POST - Publishing reaction to Neynar:", {
      signerUuid: signerUuid,
      reactionType: reactionType,
      target: target,
      targetAuthorFid: targetAuthorFid,
      userFid: userFid,
      isFrom1500Feed: isFrom1500Feed,
    });

    const reaction = await neynarClient.publishReaction({
      signerUuid,
      reactionType: reactionType as ReactionType,
      target,
      targetAuthorFid,
    });

    console.log("[Reaction API] POST - Reaction published successfully:", {
      target: target,
      reactionType: reactionType,
      userFid: userFid,
      reactionResult: {
        hash: reaction.hash,
        reactionType: reaction.reaction_type,
        target: reaction.target,
      },
      isFrom1500Feed: isFrom1500Feed,
    });

    // Track interaction if this is a reaction to a curated cast thread
    if (target && userFid) {
      const interactionType = reactionType === "like" ? "like" : reactionType === "recast" ? "recast" : null;
      if (interactionType) {
        trackCuratedCastInteraction(target, interactionType, userFid).catch((error) => {
          console.error("Error tracking reaction interaction:", error);
        });
        
        // Notify curators about the interaction
        try {
          const { findOriginalCuratedCast } = await import("@/lib/interactions");
          const { notifyCuratorsAboutInteraction } = await import("@/lib/notifications");
          const curatedCastHash = await findOriginalCuratedCast(target);
          
          if (curatedCastHash) {
            // Fetch cast data for notification
            try {
              const castResponse = await neynarClient.lookupCastConversation({
                identifier: target,
                type: LookupCastConversationTypeEnum.Hash,
                replyDepth: 0,
                includeChronologicalParentCasts: false,
              });
              
              const castData = castResponse.conversation?.cast;
              if (castData) {
                // Map interaction type for notification: "like" -> "liked"
                const notificationType = interactionType === "like" ? "liked" : interactionType;
                notifyCuratorsAboutInteraction(
                  curatedCastHash,
                  castData,
                  notificationType,
                  userFid
                ).catch((error) => {
                  console.error(`[Reaction API] Error notifying curators about ${notificationType}:`, error);
                  // Don't fail reaction if notification fails
                });
              }
            } catch (error) {
              console.error(`[Reaction API] Error fetching cast data for notification:`, error);
              // Don't fail reaction if cast fetch fails
            }
          }
        } catch (error) {
          console.error(`[Reaction API] Error notifying curators:`, error);
          // Don't fail reaction if notification fails
        }
      }
    }

    // Update database if this is a reaction to a curated cast
    if (target) {
      try {
        // Find the root curated cast
        const rootHash = await getRootCastHash(target);
        
        if (rootHash) {
          // Check if root cast is curated
          const curatedCast = await db
            .select()
            .from(curatedCasts)
            .where(eq(curatedCasts.castHash, rootHash))
            .limit(1);

          if (curatedCast.length > 0) {
            const conversationResult = await fetchAndStoreConversation(rootHash, 5, 50);
            const castData = conversationResult.rootCast;
            if (castData) {
              const { extractCastTimestamp } = await import("@/lib/cast-timestamp");
              const { extractCastMetadata } = await import("@/lib/cast-metadata");
              const metadata = extractCastMetadata(castData);
              await db
                .update(curatedCasts)
                .set({
                  castData: castData,
                  castCreatedAt: extractCastTimestamp(castData),
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
              
              console.log(`[Reaction API] Updated cast data for curated cast ${rootHash} after ${reactionType}`);
            }
          }
        }
      } catch (error: any) {
        // Don't fail the reaction publish if database update fails
        console.error(`[Reaction API] Error updating database for reaction to ${target}:`, error);
      }
    }

    return NextResponse.json({ success: true, reaction });
  } catch (error: any) {
    console.error("Reaction API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to publish reaction" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { signerUuid, reactionType, target, targetAuthorFid } = body;

    // Verbose logging - log all received data
    console.log("[Reaction API] DELETE - Backend received request:", {
      timestamp: new Date().toISOString(),
      method: "DELETE",
      endpoint: "/api/reaction",
      rawBody: body,
      parsedFields: {
        signerUuid: signerUuid,
        reactionType: reactionType,
        target: target,
        targetAuthorFid: targetAuthorFid,
      },
      requestHeaders: {
        contentType: request.headers.get("content-type"),
        referer: request.headers.get("referer"),
        userAgent: request.headers.get("user-agent"),
      },
    });

    if (!signerUuid || !reactionType || !target) {
      console.log("[Reaction API] DELETE - Missing required fields:", {
        hasSignerUuid: !!signerUuid,
        hasReactionType: !!reactionType,
        hasTarget: !!target,
      });
      return NextResponse.json(
        { error: "signerUuid, reactionType, and target are required" },
        { status: 400 }
      );
    }

    // Get user FID from signer
    let userFid: number | undefined;
    try {
      const signer = await neynarClient.lookupSigner({ signerUuid });
      userFid = signer.fid;
      console.log("[Reaction API] DELETE - Signer lookup successful:", {
        signerUuid: signerUuid,
        userFid: userFid,
        signerDetails: {
          fid: signer.fid,
          status: signer.status,
        },
      });
    } catch (error) {
      console.error("[Reaction API] DELETE - Error fetching signer:", {
        signerUuid: signerUuid,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Check if cast is from 1500+ feed (not in curated casts table)
    let isFrom1500Feed = false;
    try {
      const curatedCastCheck = await db
        .select({ castHash: curatedCasts.castHash })
        .from(curatedCasts)
        .where(eq(curatedCasts.castHash, target))
        .limit(1);
      
      isFrom1500Feed = curatedCastCheck.length === 0;
      
      console.log("[Reaction API] DELETE - Cast source check:", {
        target: target,
        isCurated: curatedCastCheck.length > 0,
        isFrom1500Feed: isFrom1500Feed,
      });
    } catch (error) {
      console.error("[Reaction API] DELETE - Error checking cast source:", error);
    }

    console.log("[Reaction API] DELETE - Deleting reaction from Neynar:", {
      signerUuid: signerUuid,
      reactionType: reactionType,
      target: target,
      targetAuthorFid: targetAuthorFid,
      userFid: userFid,
      isFrom1500Feed: isFrom1500Feed,
    });

    const reaction = await neynarClient.deleteReaction({
      signerUuid,
      reactionType: reactionType as ReactionType,
      target,
      targetAuthorFid,
    });

    console.log("[Reaction API] DELETE - Reaction deleted successfully:", {
      target: target,
      reactionType: reactionType,
      userFid: userFid,
      reactionResult: reaction,
      isFrom1500Feed: isFrom1500Feed,
    });

    // Remove interaction from database if this is a reaction to a curated cast thread
    if (target && userFid) {
      const interactionType = reactionType === "like" ? "like" : reactionType === "recast" ? "recast" : null;
      if (interactionType) {
        try {
          // Find the original curated cast
          const { findOriginalCuratedCast } = await import("@/lib/interactions");
          const curatedCastHash = await findOriginalCuratedCast(target);
          
          if (curatedCastHash) {
            // Remove the interaction
            await db
              .delete(curatedCastInteractions)
              .where(
                and(
                  eq(curatedCastInteractions.curatedCastHash, curatedCastHash),
                  eq(curatedCastInteractions.targetCastHash, target),
                  eq(curatedCastInteractions.interactionType, interactionType),
                  eq(curatedCastInteractions.userFid, userFid)
                )
              );
            console.log(`[Reaction API] Removed ${interactionType} interaction for cast ${target} by user ${userFid}`);
          }
        } catch (error) {
          console.error("Error removing reaction interaction:", error);
          // Don't fail the reaction deletion if database update fails
        }
      }
    }

    // Update database if this is a reaction removal from a curated cast
    if (target) {
      try {
        // Find the root curated cast
        const rootHash = await getRootCastHash(target);
        
        if (rootHash) {
          // Check if root cast is curated
          const curatedCast = await db
            .select()
            .from(curatedCasts)
            .where(eq(curatedCasts.castHash, rootHash))
            .limit(1);

          if (curatedCast.length > 0) {
            const conversationResult = await fetchAndStoreConversation(rootHash, 5, 50);
            const castData = conversationResult.rootCast;
            if (castData) {
              const { extractCastTimestamp } = await import("@/lib/cast-timestamp");
              const { extractCastMetadata } = await import("@/lib/cast-metadata");
              const metadata = extractCastMetadata(castData);
              await db
                .update(curatedCasts)
                .set({
                  castData: castData,
                  castCreatedAt: extractCastTimestamp(castData),
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
              
              console.log(`[Reaction API] Updated cast data for curated cast ${rootHash} after removing ${reactionType}`);
            }
          }
        }
      } catch (error: any) {
        // Don't fail the reaction deletion if database update fails
        console.error(`[Reaction API] Error updating database for reaction removal from ${target}:`, error);
      }
    }

    return NextResponse.json({ success: true, reaction });
  } catch (error: any) {
    console.error("Delete reaction API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete reaction" },
      { status: 500 }
    );
  }
}




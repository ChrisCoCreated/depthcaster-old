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

    console.log("[Like Backend] POST request received:", {
      reactionType,
      target,
      targetAuthorFid,
      hasSignerUuid: !!signerUuid,
    });

    if (!signerUuid || !reactionType || !target) {
      console.error("[Like Backend] POST - Missing required fields:", {
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
      console.log("[Like Backend] Looking up signer:", { signerUuid });
      const signer = await neynarClient.lookupSigner({ signerUuid });
      userFid = signer.fid;
      console.log("[Like Backend] Signer lookup successful:", { userFid });
    } catch (error) {
      console.error("[Reaction API] POST - Error fetching signer:", error);
    }

    console.log("[Like Backend] Publishing reaction:", {
      signerUuid,
      reactionType,
      target,
      targetAuthorFid,
      userFid,
    });

    const reaction = await neynarClient.publishReaction({
      signerUuid,
      reactionType: reactionType as ReactionType,
      target,
      targetAuthorFid,
    });

    console.log("[Like Backend] Reaction published successfully:", {
      target,
      reactionType,
      userFid,
      reactionHash: reaction?.hash,
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
        console.log("[Like Backend] Checking if cast is curated:", { target });
        // Find the root curated cast
        const rootHash = await getRootCastHash(target);
        console.log("[Like Backend] Root hash found:", { target, rootHash });
        
        if (rootHash) {
          // Check if root cast is curated
          const curatedCast = await db
            .select()
            .from(curatedCasts)
            .where(eq(curatedCasts.castHash, rootHash))
            .limit(1);

          console.log("[Like Backend] Curated cast check:", {
            rootHash,
            isCurated: curatedCast.length > 0,
          });

          if (curatedCast.length > 0) {
            console.log("[Like Backend] Fetching conversation for curated cast:", { rootHash });
            const conversationResult = await fetchAndStoreConversation(rootHash, 5, 50);
            const castData = conversationResult.rootCast;
            if (castData) {
              const { extractCastTimestamp } = await import("@/lib/cast-timestamp");
              const { extractCastMetadata } = await import("@/lib/cast-metadata");
              const metadata = extractCastMetadata(castData);
              
              console.log("[Like Backend] Updating curated cast metadata:", {
                rootHash,
                likesCount: metadata.likesCount,
                recastsCount: metadata.recastsCount,
                repliesCount: metadata.repliesCount,
              });
              
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
              
              console.log(`[Reaction API] Updated cast data for curated cast ${rootHash} after ${reactionType}`, {
                rootHash,
                reactionType,
                newLikesCount: metadata.likesCount,
              });
            } else {
              console.log("[Like Backend] No cast data found in conversation result:", { rootHash });
            }
          }
        }
      } catch (error: any) {
        // Don't fail the reaction publish if database update fails
        console.error(`[Reaction API] Error updating database for reaction to ${target}:`, {
          target,
          error: error.message,
          stack: error.stack,
        });
      }
    }

    console.log("[Like Backend] POST request completed successfully:", {
      target,
      reactionType,
      userFid,
    });

    return NextResponse.json({ success: true, reaction });
  } catch (error: any) {
    console.error("[Like Backend] POST request error:", {
      error: error.message,
      stack: error.stack,
    });
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

    console.log("[Like Backend] DELETE request received:", {
      reactionType,
      target,
      targetAuthorFid,
      hasSignerUuid: !!signerUuid,
    });

    if (!signerUuid || !reactionType || !target) {
      console.error("[Like Backend] DELETE - Missing required fields:", {
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
      console.log("[Like Backend] Looking up signer for DELETE:", { signerUuid });
      const signer = await neynarClient.lookupSigner({ signerUuid });
      userFid = signer.fid;
      console.log("[Like Backend] Signer lookup successful for DELETE:", { userFid });
    } catch (error) {
      console.error("[Reaction API] DELETE - Error fetching signer:", error);
    }

    console.log("[Like Backend] Deleting reaction:", {
      signerUuid,
      reactionType,
      target,
      targetAuthorFid,
      userFid,
    });

    const reaction = await neynarClient.deleteReaction({
      signerUuid,
      reactionType: reactionType as ReactionType,
      target,
      targetAuthorFid,
    });

    console.log("[Like Backend] Reaction deleted successfully:", {
      target,
      reactionType,
      userFid,
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
        console.log("[Like Backend] Checking if cast is curated for DELETE:", { target });
        // Find the root curated cast
        const rootHash = await getRootCastHash(target);
        console.log("[Like Backend] Root hash found for DELETE:", { target, rootHash });
        
        if (rootHash) {
          // Check if root cast is curated
          const curatedCast = await db
            .select()
            .from(curatedCasts)
            .where(eq(curatedCasts.castHash, rootHash))
            .limit(1);

          console.log("[Like Backend] Curated cast check for DELETE:", {
            rootHash,
            isCurated: curatedCast.length > 0,
          });

          if (curatedCast.length > 0) {
            console.log("[Like Backend] Fetching conversation for curated cast DELETE:", { rootHash });
            const conversationResult = await fetchAndStoreConversation(rootHash, 5, 50);
            const castData = conversationResult.rootCast;
            if (castData) {
              const { extractCastTimestamp } = await import("@/lib/cast-timestamp");
              const { extractCastMetadata } = await import("@/lib/cast-metadata");
              const metadata = extractCastMetadata(castData);
              
              console.log("[Like Backend] Updating curated cast metadata for DELETE:", {
                rootHash,
                likesCount: metadata.likesCount,
                recastsCount: metadata.recastsCount,
                repliesCount: metadata.repliesCount,
              });
              
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
              
              console.log(`[Reaction API] Updated cast data for curated cast ${rootHash} after removing ${reactionType}`, {
                rootHash,
                reactionType,
                newLikesCount: metadata.likesCount,
              });
            } else {
              console.log("[Like Backend] No cast data found in conversation result for DELETE:", { rootHash });
            }
          }
        }
      } catch (error: any) {
        // Don't fail the reaction deletion if database update fails
        console.error(`[Reaction API] Error updating database for reaction removal from ${target}:`, {
          target,
          error: error.message,
          stack: error.stack,
        });
      }
    }

    console.log("[Like Backend] DELETE request completed successfully:", {
      target,
      reactionType,
      userFid,
    });

    return NextResponse.json({ success: true, reaction });
  } catch (error: any) {
    console.error("[Like Backend] DELETE request error:", {
      error: error.message,
      stack: error.stack,
    });
    return NextResponse.json(
      { error: error.message || "Failed to delete reaction" },
      { status: 500 }
    );
  }
}




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

    // Log incoming request
    console.log("[Reaction API] POST request received:", {
      signerUuid: signerUuid ? `${signerUuid.substring(0, 8)}...` : null,
      reactionType,
      target,
      targetAuthorFid,
      hasSignerUuid: !!signerUuid,
      hasReactionType: !!reactionType,
      hasTarget: !!target,
      hasTargetAuthorFid: !!targetAuthorFid,
      targetType: typeof target,
      targetLength: target?.length,
      targetStartsWithQuery: target?.startsWith?.("query-"),
    });

    if (!signerUuid || !reactionType || !target) {
      const missingFields = [];
      if (!signerUuid) missingFields.push("signerUuid");
      if (!reactionType) missingFields.push("reactionType");
      if (!target) missingFields.push("target");
      
      console.error("[Reaction API] Missing required fields:", {
        missingFields,
        receivedBody: body,
      });
      
      return NextResponse.json(
        { error: "signerUuid, reactionType, and target are required" },
        { status: 400 }
      );
    }

    // Get user FID from signer
    let userFid: number | undefined;
    try {
      console.log("[Reaction API] Looking up signer:", { signerUuid: `${signerUuid.substring(0, 8)}...` });
      const signer = await neynarClient.lookupSigner({ signerUuid });
      userFid = signer.fid;
      console.log("[Reaction API] Signer lookup successful:", { userFid, signerFid: signer.fid });
    } catch (error: any) {
      console.error("[Reaction API] Error fetching signer:", {
        error: error.message,
        signerUuid: `${signerUuid.substring(0, 8)}...`,
        errorDetails: error.response?.data || error.response || error,
      });
    }

    // Log parameters being sent to Neynar
    const publishParams = {
      signerUuid: `${signerUuid.substring(0, 8)}...`,
      reactionType: reactionType as ReactionType,
      target,
      targetAuthorFid,
    };
    console.log("[Reaction API] Calling publishReaction with params:", {
      ...publishParams,
      targetLength: target?.length,
      targetIsValidHash: target?.match?.(/^0x[a-fA-F0-9]{64}$/) ? true : false,
      targetAuthorFidType: typeof targetAuthorFid,
      targetAuthorFidValue: targetAuthorFid,
    });

    const reaction = await neynarClient.publishReaction({
      signerUuid,
      reactionType: reactionType as ReactionType,
      target,
      targetAuthorFid,
    });
    
    console.log("[Reaction API] publishReaction successful:", { reaction: reaction?.hash || "no hash" });

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
    console.error("[Reaction API] POST error:", {
      message: error.message,
      code: error.code,
      status: error.status,
      response: error.response?.data || error.response || null,
      responseStatus: error.response?.status,
      responseHeaders: error.response?.headers,
      config: error.config ? {
        method: error.config.method,
        url: error.config.url,
        data: error.config.data,
      } : null,
      stack: error.stack,
    });
    
    // If it's a 400 error, return 400 status
    const statusCode = error.status === 400 || error.response?.status === 400 ? 400 : 500;
    
    return NextResponse.json(
      { 
        error: error.message || "Failed to publish reaction",
        details: error.response?.data || null,
      },
      { status: statusCode }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { signerUuid, reactionType, target, targetAuthorFid } = body;

    // Log incoming request
    console.log("[Reaction API] DELETE request received:", {
      signerUuid: signerUuid ? `${signerUuid.substring(0, 8)}...` : null,
      reactionType,
      target,
      targetAuthorFid,
      hasSignerUuid: !!signerUuid,
      hasReactionType: !!reactionType,
      hasTarget: !!target,
      hasTargetAuthorFid: !!targetAuthorFid,
      targetType: typeof target,
      targetLength: target?.length,
      targetStartsWithQuery: target?.startsWith?.("query-"),
    });

    if (!signerUuid || !reactionType || !target) {
      const missingFields = [];
      if (!signerUuid) missingFields.push("signerUuid");
      if (!reactionType) missingFields.push("reactionType");
      if (!target) missingFields.push("target");
      
      console.error("[Reaction API] Missing required fields:", {
        missingFields,
        receivedBody: body,
      });
      
      return NextResponse.json(
        { error: "signerUuid, reactionType, and target are required" },
        { status: 400 }
      );
    }

    // Get user FID from signer
    let userFid: number | undefined;
    try {
      console.log("[Reaction API] Looking up signer:", { signerUuid: `${signerUuid.substring(0, 8)}...` });
      const signer = await neynarClient.lookupSigner({ signerUuid });
      userFid = signer.fid;
      console.log("[Reaction API] Signer lookup successful:", { userFid, signerFid: signer.fid });
    } catch (error: any) {
      console.error("[Reaction API] Error fetching signer:", {
        error: error.message,
        signerUuid: `${signerUuid.substring(0, 8)}...`,
        errorDetails: error.response?.data || error.response || error,
      });
    }

    // Log parameters being sent to Neynar
    const deleteParams = {
      signerUuid: `${signerUuid.substring(0, 8)}...`,
      reactionType: reactionType as ReactionType,
      target,
      targetAuthorFid,
    };
    console.log("[Reaction API] Calling deleteReaction with params:", {
      ...deleteParams,
      targetLength: target?.length,
      targetIsValidHash: target?.match?.(/^0x[a-fA-F0-9]{64}$/) ? true : false,
      targetAuthorFidType: typeof targetAuthorFid,
      targetAuthorFidValue: targetAuthorFid,
    });

    const reaction = await neynarClient.deleteReaction({
      signerUuid,
      reactionType: reactionType as ReactionType,
      target,
      targetAuthorFid,
    });
    
    console.log("[Reaction API] deleteReaction successful:", { reaction: reaction?.hash || "no hash" });

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
    console.error("[Reaction API] DELETE error:", {
      message: error.message,
      code: error.code,
      status: error.status,
      response: error.response?.data || error.response || null,
      responseStatus: error.response?.status,
      responseHeaders: error.response?.headers,
      config: error.config ? {
        method: error.config.method,
        url: error.config.url,
        data: error.config.data,
      } : null,
      stack: error.stack,
    });
    
    // If it's a 400 error, return 400 status
    const statusCode = error.status === 400 || error.response?.status === 400 ? 400 : 500;
    
    return NextResponse.json(
      { 
        error: error.message || "Failed to delete reaction",
        details: error.response?.data || null,
      },
      { status: statusCode }
    );
  }
}




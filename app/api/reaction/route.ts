import { NextRequest, NextResponse } from "next/server";
import { neynarClient } from "@/lib/neynar";
import { ReactionType } from "@neynar/nodejs-sdk/build/api";
import { trackCuratedCastInteraction } from "@/lib/interactions";
import { db } from "@/lib/db";
import { curatedCasts } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { fetchAndStoreConversation, getRootCastHash } from "@/lib/conversation";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { signerUuid, reactionType, target, targetAuthorFid } = body;

    if (!signerUuid || !reactionType || !target) {
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
    } catch (error) {
      console.error("Error fetching signer:", error);
    }

    const reaction = await neynarClient.publishReaction({
      signerUuid,
      reactionType: reactionType as ReactionType,
      target,
      targetAuthorFid,
    });

    // Track interaction if this is a reaction to a curated cast thread
    if (target && userFid) {
      const interactionType = reactionType === "like" ? "like" : reactionType === "recast" ? "recast" : null;
      if (interactionType) {
        trackCuratedCastInteraction(target, interactionType, userFid).catch((error) => {
          console.error("Error tracking reaction interaction:", error);
        });
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

    if (!signerUuid || !reactionType || !target) {
      return NextResponse.json(
        { error: "signerUuid, reactionType, and target are required" },
        { status: 400 }
      );
    }

    // Note: We don't track deletion of interactions - only additions count for bumping
    const reaction = await neynarClient.deleteReaction({
      signerUuid,
      reactionType: reactionType as ReactionType,
      target,
      targetAuthorFid,
    });

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




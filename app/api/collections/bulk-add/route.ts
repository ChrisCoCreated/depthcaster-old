import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { collections, collectionCasts, curatedCasts, users } from "@/lib/schema";
import { eq, and, inArray } from "drizzle-orm";
import { hasCollectionsOrAdminRole, getUserRoles } from "@/lib/roles";
import { canUserAddToCollection } from "@/lib/collection-gating";
import { upsertUser } from "@/lib/users";
import { extractCastTimestamp } from "@/lib/cast-timestamp";
import { extractCastMetadata } from "@/lib/cast-metadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { curatorFid, collectionName, castHashes, castDataArray } = body;

    if (!curatorFid) {
      return NextResponse.json({ error: "curatorFid is required" }, { status: 400 });
    }

    const curatorFidNum = parseInt(curatorFid);
    if (isNaN(curatorFidNum)) {
      return NextResponse.json({ error: "Invalid curatorFid" }, { status: 400 });
    }

    // Verify collector role
    const curatorUser = await db.select().from(users).where(eq(users.fid, curatorFidNum)).limit(1);
    if (curatorUser.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const roles = await getUserRoles(curatorFidNum);
    if (!hasCollectionsOrAdminRole(roles)) {
      return NextResponse.json(
        { error: "User does not have collections role" },
        { status: 403 }
      );
    }

    if (!collectionName) {
      return NextResponse.json({ error: "collectionName is required" }, { status: 400 });
    }

    if (!castHashes || !Array.isArray(castHashes) || castHashes.length === 0) {
      return NextResponse.json({ error: "castHashes array is required" }, { status: 400 });
    }

    if (!castDataArray || !Array.isArray(castDataArray) || castDataArray.length !== castHashes.length) {
      return NextResponse.json({ error: "castDataArray must match castHashes length" }, { status: 400 });
    }

    // Get collection
    const collection = await db.select().from(collections).where(eq(collections.name, collectionName)).limit(1);
    if (collection.length === 0) {
      return NextResponse.json({ error: "Collection not found" }, { status: 404 });
    }

    const collectionData = collection[0];

    // Check permissions
    const canAdd = await canUserAddToCollection(
      collectionData.accessType,
      collectionData.gatedUserId,
      collectionData.gatingRule as any,
      curatorUser[0]
    );

    if (!canAdd) {
      return NextResponse.json(
        { error: "You do not have permission to add casts to this collection" },
        { status: 403 }
      );
    }

    // Check which casts are already in the collection
    const existingCollectionCasts = await db
      .select({ castHash: collectionCasts.castHash })
      .from(collectionCasts)
      .where(
        and(
          eq(collectionCasts.collectionId, collectionData.id),
          inArray(collectionCasts.castHash, castHashes)
        )
      );

    const existingHashes = new Set(existingCollectionCasts.map((cc) => cc.castHash));
    const newCasts = castHashes.filter((hash) => !existingHashes.has(hash));

    if (newCasts.length === 0) {
      return NextResponse.json({
        success: true,
        added: 0,
        skipped: castHashes.length,
        message: "All casts are already in this collection",
      });
    }

    // Process each cast
    let added = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 0; i < castHashes.length; i++) {
      const castHash = castHashes[i];
      const castData = castDataArray[i];

      // Skip if already in collection
      if (existingHashes.has(castHash)) {
        skipped++;
        continue;
      }

      try {
        // Ensure cast exists in curatedCasts
        const existingCast = await db
          .select()
          .from(curatedCasts)
          .where(eq(curatedCasts.castHash, castHash))
          .limit(1);

        if (existingCast.length === 0) {
          const metadata = extractCastMetadata(castData);
          if (metadata.authorFid) {
            const authorData = (castData as any)?.author;
            await upsertUser(metadata.authorFid, {
              username: authorData?.username,
              displayName: authorData?.display_name,
              pfpUrl: authorData?.pfp_url,
            }).catch((error) => {
              console.error(`[Bulk Add] Failed to upsert author ${metadata.authorFid}:`, error);
            });
          }

          try {
            await db.insert(curatedCasts).values({
              castHash,
              castData,
              castCreatedAt: extractCastTimestamp(castData),
              curatorFid: null,
              topReplies: null,
              repliesUpdatedAt: null,
              conversationFetchedAt: null,
              castText: metadata.castText,
              castTextLength: metadata.castTextLength,
              authorFid: metadata.authorFid,
              likesCount: metadata.likesCount,
              recastsCount: metadata.recastsCount,
              repliesCount: metadata.repliesCount,
              engagementScore: metadata.engagementScore,
              parentHash: metadata.parentHash,
            });
          } catch (insertError: any) {
            if (insertError.code === "23505" || insertError.message?.includes("unique")) {
              // Cast was added by another process, continue
            } else if (insertError.code === "23503" || insertError.message?.includes("foreign key")) {
              // Retry after ensuring user exists
              if (metadata.authorFid) {
                const authorData = (castData as any)?.author;
                try {
                  await upsertUser(metadata.authorFid, {
                    username: authorData?.username,
                    displayName: authorData?.display_name,
                    pfpUrl: authorData?.pfp_url,
                  });
                  await db.insert(curatedCasts).values({
                    castHash,
                    castData,
                    castCreatedAt: extractCastTimestamp(castData),
                    curatorFid: null,
                    topReplies: null,
                    repliesUpdatedAt: null,
                    conversationFetchedAt: null,
                    castText: metadata.castText,
                    castTextLength: metadata.castTextLength,
                    authorFid: metadata.authorFid,
                    likesCount: metadata.likesCount,
                    recastsCount: metadata.recastsCount,
                    repliesCount: metadata.repliesCount,
                    engagementScore: metadata.engagementScore,
                    parentHash: metadata.parentHash,
                  });
                } catch (retryError) {
                  console.error(`[Bulk Add] Retry insert failed for cast ${castHash}:`, retryError);
                  errors.push(`Failed to add cast ${castHash}: ${(retryError as any).message}`);
                  continue;
                }
              } else {
                errors.push(`Failed to add cast ${castHash}: ${insertError.message}`);
                continue;
              }
            } else {
              errors.push(`Failed to add cast ${castHash}: ${insertError.message}`);
              continue;
            }
          }
        }

        // Add to collection
        try {
          await db.insert(collectionCasts).values({
            collectionId: collectionData.id,
            castHash,
            curatorFid: curatorFidNum,
          });
          added++;
        } catch (insertError: any) {
          if (insertError.code === "23505" || insertError.message?.includes("unique")) {
            skipped++;
          } else {
            errors.push(`Failed to add cast ${castHash} to collection: ${insertError.message}`);
          }
        }
      } catch (error: any) {
        console.error(`[Bulk Add] Error processing cast ${castHash}:`, error);
        errors.push(`Failed to process cast ${castHash}: ${error.message || "Unknown error"}`);
      }
    }

    return NextResponse.json({
      success: true,
      added,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
      message: `Added ${added} cast(s) to collection${errors.length > 0 ? ` (${errors.length} errors)` : ""}`,
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error("Bulk add to collection API error:", err.message || error);
    return NextResponse.json(
      { error: err.message || "Failed to add casts to collection" },
      { status: 500 }
    );
  }
}

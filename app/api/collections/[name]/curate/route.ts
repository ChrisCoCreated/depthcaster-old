import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { collections, collectionCasts, curatedCasts, users } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { canUserAddToCollection } from "@/lib/collection-gating";
import { upsertUser } from "@/lib/users";
import { extractCastTimestamp } from "@/lib/cast-timestamp";
import { extractCastMetadata } from "@/lib/cast-metadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;
    const body = await request.json();
    const { castHash, curatorFid, castData } = body;

    if (!castHash) {
      return NextResponse.json({ error: "castHash is required" }, { status: 400 });
    }

    if (!curatorFid) {
      return NextResponse.json({ error: "curatorFid is required" }, { status: 400 });
    }

    if (!castData) {
      return NextResponse.json({ error: "castData is required" }, { status: 400 });
    }

    const collection = await db.select().from(collections).where(eq(collections.name, name)).limit(1);
    if (collection.length === 0) {
      return NextResponse.json({ error: "Collection not found" }, { status: 404 });
    }

    const collectionData = collection[0];
    const curatorUser = await db.select().from(users).where(eq(users.fid, curatorFid)).limit(1);
    if (curatorUser.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const canAdd = await canUserAddToCollection(
      collectionData.accessType,
      collectionData.gatedUserId,
      collectionData.gatingRule as any,
      curatorUser[0]
    );

    if (!canAdd) {
      return NextResponse.json({ error: "You do not have permission to add casts to this collection" }, { status: 403 });
    }

    const existingCast = await db.select().from(curatedCasts).where(eq(curatedCasts.castHash, castHash)).limit(1);
    const existingCollectionCast = await db
      .select()
      .from(collectionCasts)
      .where(and(eq(collectionCasts.collectionId, collectionData.id), eq(collectionCasts.castHash, castHash)))
      .limit(1);

    if (existingCollectionCast.length > 0) {
      return NextResponse.json({ error: "Cast is already in this collection" }, { status: 409 });
    }

    if (existingCast.length === 0) {
      const metadata = extractCastMetadata(castData);
      if (metadata.authorFid) {
        const authorData = (castData as any)?.author;
        await upsertUser(metadata.authorFid, {
          username: authorData?.username,
          displayName: authorData?.display_name,
          pfpUrl: authorData?.pfp_url,
        }).catch((error) => {
          console.error(`[Collection Curate] Failed to upsert author ${metadata.authorFid}:`, error);
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
          console.log(`[Collection Curate] Cast ${castHash} now exists after race condition, continuing...`);
        } else if (insertError.code === "23503" || insertError.message?.includes("foreign key")) {
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
              console.error(`[Collection Curate] Retry insert also failed for cast ${castHash}:`, retryError);
              throw retryError;
            }
          } else {
            throw insertError;
          }
        } else {
          throw insertError;
        }
      }
    }

    try {
      const result = await db.insert(collectionCasts).values({
        collectionId: collectionData.id,
        castHash,
        curatorFid,
      }).returning();
      return NextResponse.json({ success: true, collectionCast: result[0] });
    } catch (insertError: any) {
      if (insertError.code === "23505" || insertError.message?.includes("unique")) {
        return NextResponse.json({ error: "Cast is already in this collection" }, { status: 409 });
      }
      throw insertError;
    }
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    console.error("Collection curate API error:", err.message || error);
    return NextResponse.json({ error: err.message || "Failed to add cast to collection" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;
    const searchParams = request.nextUrl.searchParams;
    const castHash = searchParams.get("castHash");
    const curatorFid = searchParams.get("curatorFid") ? parseInt(searchParams.get("curatorFid")!) : undefined;

    if (!castHash) {
      return NextResponse.json({ error: "castHash is required" }, { status: 400 });
    }

    if (!curatorFid) {
      return NextResponse.json({ error: "curatorFid is required" }, { status: 400 });
    }

    const collection = await db.select().from(collections).where(eq(collections.name, name)).limit(1);
    if (collection.length === 0) {
      return NextResponse.json({ error: "Collection not found" }, { status: 404 });
    }

    const collectionData = collection[0];
    const existingCollectionCast = await db
      .select()
      .from(collectionCasts)
      .where(and(
        eq(collectionCasts.collectionId, collectionData.id),
        eq(collectionCasts.castHash, castHash),
        eq(collectionCasts.curatorFid, curatorFid)
      ))
      .limit(1);

    if (existingCollectionCast.length === 0) {
      return NextResponse.json({ error: "Cast is not in this collection" }, { status: 404 });
    }

    await db.delete(collectionCasts).where(and(
      eq(collectionCasts.collectionId, collectionData.id),
      eq(collectionCasts.castHash, castHash),
      eq(collectionCasts.curatorFid, curatorFid)
    ));

    return NextResponse.json({ success: true, message: "Cast removed from collection" });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error("Collection uncurate API error:", err.message || error);
    return NextResponse.json({ error: err.message || "Failed to remove cast from collection" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { collections, collectionCasts, curatorCastCurations } from "@/lib/schema";
import { eq, and } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ castHash: string }> }
) {
  try {
    const { castHash } = await params;
    const searchParams = request.nextUrl.searchParams;
    const curatorFid = searchParams.get("curatorFid") ? parseInt(searchParams.get("curatorFid")!) : undefined;

    if (!castHash) {
      return NextResponse.json({ error: "castHash is required" }, { status: 400 });
    }

    // Check if cast is curated by user in main feed
    let isCurated = false;
    if (curatorFid) {
      const curation = await db
        .select()
        .from(curatorCastCurations)
        .where(
          and(
            eq(curatorCastCurations.castHash, castHash),
            eq(curatorCastCurations.curatorFid, curatorFid)
          )
        )
        .limit(1);
      isCurated = curation.length > 0;
    }

    // Get collections containing this cast
    const whereConditions = [eq(collectionCasts.castHash, castHash)];
    if (curatorFid) {
      whereConditions.push(eq(collectionCasts.curatorFid, curatorFid));
    }

    const collectionsList = await db
      .select({
        name: collections.name,
        displayName: collections.displayName,
        curatorFid: collectionCasts.curatorFid,
      })
      .from(collectionCasts)
      .innerJoin(collections, eq(collectionCasts.collectionId, collections.id))
      .where(and(...whereConditions));

    return NextResponse.json({
      isCurated,
      collections: collectionsList.map((c) => ({
        name: c.name,
        displayName: c.displayName,
        curatorFid: c.curatorFid,
      })),
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error("Collections cast API error:", err.message || error);
    return NextResponse.json(
      { error: err.message || "Failed to fetch collections for cast" },
      { status: 500 }
    );
  }
}


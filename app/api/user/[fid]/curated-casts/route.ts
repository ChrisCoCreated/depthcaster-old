import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { curatorCastCurations, curatedCasts } from "@/lib/schema";
import { eq, desc, and, sql } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fid: string }> }
) {
  try {
    const { fid: fidParam } = await params;
    const fid = parseInt(fidParam);
    const searchParams = request.nextUrl.searchParams;
    const cursor = searchParams.get("cursor");
    const limit = parseInt(searchParams.get("limit") || "25");
    const viewerFid = searchParams.get("viewerFid")
      ? parseInt(searchParams.get("viewerFid")!)
      : undefined;

    if (isNaN(fid)) {
      return NextResponse.json(
        { error: "Invalid FID" },
        { status: 400 }
      );
    }

    // Build cursor condition for pagination
    const cursorCondition = cursor
      ? sql`${curatorCastCurations.createdAt} < ${new Date(cursor)}`
      : undefined;

    // Query curated casts for this user, ordered by curation date (most recent first)
    const curations = await db
      .select({
        castHash: curatorCastCurations.castHash,
        createdAt: curatorCastCurations.createdAt,
        castData: curatedCasts.castData,
      })
      .from(curatorCastCurations)
      .innerJoin(curatedCasts, eq(curatorCastCurations.castHash, curatedCasts.castHash))
      .where(
        and(
          eq(curatorCastCurations.curatorFid, fid),
          cursorCondition
        )
      )
      .orderBy(desc(curatorCastCurations.createdAt))
      .limit(Math.min(limit, 100));

    // Extract cast objects from JSONB data
    const casts = curations
      .map((row) => {
        const cast = row.castData as any;
        if (!cast || !cast.hash) {
          return null;
        }
        return cast;
      })
      .filter((cast) => cast !== null);

    // Determine next cursor (use the createdAt of the last item)
    const nextCursor =
      curations.length === limit && curations.length > 0
        ? curations[curations.length - 1].createdAt.toISOString()
        : null;

    return NextResponse.json({
      casts,
      next: nextCursor ? { cursor: nextCursor } : null,
    });
  } catch (error: any) {
    console.error("Error fetching curated casts:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch curated casts" },
      { status: 500 }
    );
  }
}









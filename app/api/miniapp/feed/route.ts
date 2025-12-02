import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { curatedCasts, curatorCastCurations } from "@/lib/schema";
import { eq, and, sql, gte, desc, inArray } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get("limit") || "30");
    const minQualityScore = 70; // Fixed at 70+ for miniapp

    // Step 1: Get curated casts with quality score >= 70
    const qualifiedCasts = await db
      .select({
        castHash: curatedCasts.castHash,
        castText: curatedCasts.castText,
        authorFid: curatedCasts.authorFid,
        likesCount: curatedCasts.likesCount,
        recastsCount: curatedCasts.recastsCount,
        repliesCount: curatedCasts.repliesCount,
        qualityScore: curatedCasts.qualityScore,
        castCreatedAt: curatedCasts.castCreatedAt,
      })
      .from(curatedCasts)
      .where(
        and(
          gte(curatedCasts.qualityScore, minQualityScore),
          sql`${curatedCasts.qualityScore} IS NOT NULL`
        )
      );

    if (qualifiedCasts.length === 0) {
      return NextResponse.json({
        items: [],
        count: 0,
      });
    }

    // Step 2: Get first curation times for these casts
    const castHashArray = qualifiedCasts.map((c) => c.castHash);
    const firstCurationTimes = await db
      .select({
        castHash: curatorCastCurations.castHash,
        firstCurationTime: sql<Date>`MIN(${curatorCastCurations.createdAt})`.as("first_curation_time"),
      })
      .from(curatorCastCurations)
      .where(inArray(curatorCastCurations.castHash, castHashArray))
      .groupBy(curatorCastCurations.castHash);

    // Step 3: Create a map for quick lookup
    const curationTimeMap = new Map<string, Date>();
    firstCurationTimes.forEach((row) => {
      curationTimeMap.set(row.castHash, row.firstCurationTime);
    });

    // Step 4: Combine and sort by recently curated
    const castsWithCurationTime = qualifiedCasts.map((cast) => ({
      ...cast,
      firstCurationTime: curationTimeMap.get(cast.castHash) || cast.castCreatedAt || new Date(),
    }));

    // Sort by first curation time (most recently curated first)
    castsWithCurationTime.sort((a, b) => {
      const aTime = a.firstCurationTime.getTime();
      const bTime = b.firstCurationTime.getTime();
      return bTime - aTime; // Descending order
    });

    // Step 5: Limit and format response
    const limitedCasts = castsWithCurationTime.slice(0, limit);
    const feedItems = limitedCasts.map((cast) => ({
      castHash: cast.castHash,
      text: cast.castText || "",
      authorFid: cast.authorFid,
      likesCount: cast.likesCount || 0,
      recastsCount: cast.recastsCount || 0,
      repliesCount: cast.repliesCount || 0,
      qualityScore: cast.qualityScore,
      castCreatedAt: cast.castCreatedAt?.toISOString(),
      curatedAt: cast.firstCurationTime?.toISOString(),
    }));

    return NextResponse.json({
      items: feedItems,
      count: feedItems.length,
    });
  } catch (error: unknown) {
    console.error("[Miniapp Feed] Error:", error);
    const err = error as { message?: string };
    return NextResponse.json(
      { error: err.message || "Failed to fetch miniapp feed" },
      { status: 500 }
    );
  }
}

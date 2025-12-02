import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { curatedCasts, curatorCastCurations } from "@/lib/schema";
import { eq, and, sql, gte, desc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get("limit") || "30");
    const minQualityScore = 70; // Fixed at 70+ for miniapp

    // Get curated casts with quality score >= 70
    // Join with curatorCastCurations to get first curation time
    // Order by recently curated (MIN(curatorCastCurations.createdAt) DESC)
    const casts = await db
      .select({
        castHash: curatedCasts.castHash,
        castText: curatedCasts.castText,
        authorFid: curatedCasts.authorFid,
        likesCount: curatedCasts.likesCount,
        recastsCount: curatedCasts.recastsCount,
        repliesCount: curatedCasts.repliesCount,
        qualityScore: curatedCasts.qualityScore,
        castCreatedAt: curatedCasts.castCreatedAt,
        firstCurationTime: sql<Date>`MIN(${curatorCastCurations.createdAt})`.as("first_curation_time"),
      })
      .from(curatedCasts)
      .innerJoin(
        curatorCastCurations,
        eq(curatedCasts.castHash, curatorCastCurations.castHash)
      )
      .where(
        and(
          gte(curatedCasts.qualityScore, minQualityScore),
          sql`${curatedCasts.qualityScore} IS NOT NULL`
        )
      )
      .groupBy(
        curatedCasts.castHash,
        curatedCasts.castText,
        curatedCasts.authorFid,
        curatedCasts.likesCount,
        curatedCasts.recastsCount,
        curatedCasts.repliesCount,
        curatedCasts.qualityScore,
        curatedCasts.castCreatedAt
      )
      .orderBy(desc(sql`MIN(${curatorCastCurations.createdAt})`))
      .limit(limit);

    // Format response with minimal data needed for feed display
    const feedItems = casts.map((cast) => ({
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

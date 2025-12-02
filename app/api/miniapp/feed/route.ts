import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { curatedCasts, curatorCastCurations, users } from "@/lib/schema";
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
    // Helper function to ensure we have a Date object
    const toDate = (value: Date | string | null | undefined, fallback: Date): Date => {
      if (!value) return fallback;
      if (value instanceof Date) return value;
      if (typeof value === 'string') return new Date(value);
      return fallback;
    };

    const curationTimeMap = new Map<string, Date>();
    firstCurationTimes.forEach((row) => {
      const date = toDate(row.firstCurationTime, new Date());
      curationTimeMap.set(row.castHash, date);
    });

    // Step 4: Combine and sort by recently curated
    const castsWithCurationTime = qualifiedCasts.map((cast) => {
      const curationTime = curationTimeMap.get(cast.castHash);
      const fallback = toDate(cast.castCreatedAt, new Date());
      return {
        ...cast,
        firstCurationTime: curationTime || fallback,
      };
    });

    // Sort by first curation time (most recently curated first)
    castsWithCurationTime.sort((a, b) => {
      const aTime = a.firstCurationTime.getTime();
      const bTime = b.firstCurationTime.getTime();
      return bTime - aTime; // Descending order
    });

    // Step 5: Limit before fetching user info
    const limitedCasts = castsWithCurationTime.slice(0, limit);

    // Step 6: Get author user info from database
    const authorFids = Array.from(new Set(limitedCasts.map((c) => c.authorFid).filter((fid): fid is number => fid !== null)));
    const authorUsers = authorFids.length > 0
      ? await db
          .select({
            fid: users.fid,
            username: users.username,
            displayName: users.displayName,
            pfpUrl: users.pfpUrl,
          })
          .from(users)
          .where(inArray(users.fid, authorFids))
      : [];

    const authorMap = new Map<number, { username?: string | null; displayName?: string | null; pfpUrl?: string | null }>();
    authorUsers.forEach((user) => {
      authorMap.set(user.fid, {
        username: user.username,
        displayName: user.displayName,
        pfpUrl: user.pfpUrl,
      });
    });

    // Step 7: Format response
    const feedItems = limitedCasts.map((cast) => {
      const castCreatedAtDate = cast.castCreatedAt ? toDate(cast.castCreatedAt, new Date()) : null;
      const curatedAtDate = cast.firstCurationTime;
      const authorInfo = cast.authorFid ? authorMap.get(cast.authorFid) : null;
      
      return {
        castHash: cast.castHash,
        text: cast.castText || "",
        authorFid: cast.authorFid,
        authorUsername: authorInfo?.username || null,
        authorDisplayName: authorInfo?.displayName || null,
        authorPfpUrl: authorInfo?.pfpUrl || null,
        repliesCount: cast.repliesCount || 0,
        qualityScore: cast.qualityScore,
        castCreatedAt: castCreatedAtDate?.toISOString() || null,
        curatedAt: curatedAtDate?.toISOString() || null,
      };
    });

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

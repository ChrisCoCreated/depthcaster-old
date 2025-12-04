import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { curatedCasts, curatorCastCurations, users } from "@/lib/schema";
import { eq, and, sql, gte, desc, inArray } from "drizzle-orm";

// Cache for 30 seconds
export const revalidate = 30;
// Mark as dynamic since we use searchParams
export const dynamic = 'force-dynamic';

// Helper function to ensure we have a Date object
const toDate = (value: Date | string | null | undefined, fallback: Date): Date => {
  if (!value) return fallback;
  if (value instanceof Date) return value;
  if (typeof value === 'string') return new Date(value);
  return fallback;
};

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get("limit") || "30");
    const minQualityScore = searchParams.get("minQualityScore")
      ? parseInt(searchParams.get("minQualityScore")!)
      : 70; // Default to 70+ for miniapp

    // Get first curation times using aggregation query (more reliable date parsing)
    const firstCurationTimes = await db
      .select({
        castHash: curatorCastCurations.castHash,
        firstCurationTime: sql<Date>`MIN(${curatorCastCurations.createdAt})`.as("first_curation_time"),
      })
      .from(curatorCastCurations)
      .groupBy(curatorCastCurations.castHash);

    const firstCurationTimeMap = new Map<string, Date>();
    firstCurationTimes.forEach((row) => {
      // PostgreSQL returns timestamps as strings, so we need to parse them
      const dateValue = row.firstCurationTime;
      if (dateValue) {
        const parsedDate = dateValue instanceof Date ? dateValue : new Date(dateValue as any);
        if (!isNaN(parsedDate.getTime())) {
          firstCurationTimeMap.set(row.castHash, parsedDate);
        }
      }
    });

    // Get curated casts with quality score filter
    const curatedCastsList = await db
      .select({
        castHash: curatedCasts.castHash,
        castText: curatedCasts.castText,
        authorFid: curatedCasts.authorFid,
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
      )
      .limit(limit * 2); // Get more to account for sorting by curation time

    // Sort by first curation time (or castCreatedAt if no curation) and limit
    const castsWithCurationTime = curatedCastsList
      .map((cast) => {
        const firstCuration = firstCurationTimeMap.get(cast.castHash);
        const castCreatedAtDate = cast.castCreatedAt ? toDate(cast.castCreatedAt, new Date()) : null;
        return {
          ...cast,
          firstCurationTime: firstCuration || castCreatedAtDate || new Date(),
        };
      })
      .sort((a, b) => {
        const timeA = a.firstCurationTime.getTime();
        const timeB = b.firstCurationTime.getTime();
        return timeB - timeA; // Descending order (newest first)
      })
      .slice(0, limit);

    if (castsWithCurationTime.length === 0) {
      return NextResponse.json(
        {
          items: [],
          count: 0,
        },
        {
          headers: {
            "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
          },
        }
      );
    }

    // Get author user info from database (only for the limited set)
    const authorFids = Array.from(
      new Set(castsWithCurationTime.map((c) => c.authorFid).filter((fid): fid is number => fid !== null))
    );
    
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

    // Format response
    const feedItems = castsWithCurationTime.map((cast) => {
      const castCreatedAtDate = cast.castCreatedAt ? toDate(cast.castCreatedAt, new Date()) : null;
      // firstCurationTime is already a Date object from our sorting logic
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
        curatedAt: curatedAtDate.toISOString(),
      };
    });

    return NextResponse.json(
      {
        items: feedItems,
        count: feedItems.length,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
        },
      }
    );
  } catch (error: unknown) {
    console.error("[Miniapp Feed] Error:", error);
    const err = error as { message?: string };
    return NextResponse.json(
      { error: err.message || "Failed to fetch miniapp feed" },
      { status: 500 }
    );
  }
}

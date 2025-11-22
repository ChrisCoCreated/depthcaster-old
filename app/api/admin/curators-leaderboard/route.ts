import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { curatorCastCurations, users } from "@/lib/schema";
import { neynarClient } from "@/lib/neynar";
import { sql, desc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    // Get curator statistics grouped by curator_fid
    const curatorStats = await db
      .select({
        curatorFid: curatorCastCurations.curatorFid,
        curationCount: sql<number>`count(*)::int`,
        firstCuration: sql<Date>`MIN(${curatorCastCurations.createdAt})`,
        lastCuration: sql<Date>`MAX(${curatorCastCurations.createdAt})`,
      })
      .from(curatorCastCurations)
      .groupBy(curatorCastCurations.curatorFid)
      .orderBy(sql`count(*) DESC`);

    if (curatorStats.length === 0) {
      return NextResponse.json({ curators: [] });
    }

    // Get all curator FIDs
    const curatorFids = curatorStats.map((s) => s.curatorFid);

    // Fetch user info from Neynar
    const neynarUsers = await neynarClient.fetchBulkUsers({ fids: curatorFids });
    const userMap = new Map(
      (neynarUsers.users || []).map((u) => [u.fid, u])
    );

    // Combine stats with user info
    const leaderboard = curatorStats.map((stat) => {
      const user = userMap.get(stat.curatorFid);
      return {
        fid: stat.curatorFid,
        username: user?.username,
        displayName: user?.display_name,
        pfpUrl: user?.pfp_url,
        curationCount: stat.curationCount,
        firstCuration: stat.firstCuration,
        lastCuration: stat.lastCuration,
      };
    });

    return NextResponse.json({ curators: leaderboard });
  } catch (error: unknown) {
    console.error("Curators leaderboard API error:", error);
    const err = error as { message?: string };
    return NextResponse.json(
      { error: err.message || "Failed to fetch leaderboard" },
      { status: 500 }
    );
  }
}


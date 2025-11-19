import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { curatorPacks, users, curatorPackUsers } from "@/lib/schema";
import { eq, desc, sql, inArray } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get("limit") || "10");

    // Fetch most popular packs
    const packs = await db
      .select({
        id: curatorPacks.id,
        name: curatorPacks.name,
        description: curatorPacks.description,
        creatorFid: curatorPacks.creatorFid,
        isPublic: curatorPacks.isPublic,
        usageCount: curatorPacks.usageCount,
        createdAt: curatorPacks.createdAt,
        updatedAt: curatorPacks.updatedAt,
        creator: {
          fid: users.fid,
          username: users.username,
          displayName: users.displayName,
          pfpUrl: users.pfpUrl,
        },
      })
      .from(curatorPacks)
      .leftJoin(users, eq(curatorPacks.creatorFid, users.fid))
      .where(eq(curatorPacks.isPublic, true))
      .orderBy(desc(curatorPacks.usageCount), desc(curatorPacks.createdAt))
      .limit(limit);

    // Count users per pack
    const packIds = packs.map((p) => p.id);
    const userCountMap = new Map<string, number>();
    
    if (packIds.length > 0) {
      const counts = await db
        .select({
          packId: curatorPackUsers.packId,
          count: sql<number>`count(*)::int`.as("count"),
        })
        .from(curatorPackUsers)
        .where(inArray(curatorPackUsers.packId, packIds))
        .groupBy(curatorPackUsers.packId);
      
      counts.forEach((c) => {
        userCountMap.set(c.packId, c.count);
      });
    }

    const packsWithCounts = packs.map((pack) => ({
      ...pack,
      userCount: userCountMap.get(pack.id) || 0,
    }));

    return NextResponse.json({ packs: packsWithCounts });
  } catch (error: any) {
    console.error("Error fetching popular packs:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch popular packs" },
      { status: 500 }
    );
  }
}














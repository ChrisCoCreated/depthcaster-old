import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { curatorPacks, users, curatorPackUsers, packFavorites } from "@/lib/schema";
import { eq, desc, sql, inArray } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userFid = searchParams.get("userFid") ? parseInt(searchParams.get("userFid")!) : undefined;

    if (!userFid) {
      return NextResponse.json(
        { error: "userFid is required" },
        { status: 400 }
      );
    }

    // Fetch favorite packs for the user
    const favorites = await db
      .select({
        packId: packFavorites.packId,
        createdAt: packFavorites.createdAt,
      })
      .from(packFavorites)
      .where(eq(packFavorites.userFid, userFid))
      .orderBy(desc(packFavorites.createdAt));

    const packIds = favorites.map((f) => f.packId);

    if (packIds.length === 0) {
      return NextResponse.json({ packs: [] });
    }

    // Fetch packs with creator info
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
      .where(inArray(curatorPacks.id, packIds));

    // Count users per pack efficiently
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

    // Create a map of favorite creation times for sorting
    const favoriteTimeMap = new Map<string, Date>();
    favorites.forEach((f) => {
      favoriteTimeMap.set(f.packId, f.createdAt);
    });

    const packsWithCounts = packs
      .map((pack) => ({
        ...pack,
        userCount: userCountMap.get(pack.id) || 0,
        isFavorited: true,
        favoritedAt: favoriteTimeMap.get(pack.id),
      }))
      .sort((a, b) => {
        // Sort by favoritedAt (most recent first)
        const timeA = a.favoritedAt?.getTime() || 0;
        const timeB = b.favoritedAt?.getTime() || 0;
        return timeB - timeA;
      });

    return NextResponse.json({ packs: packsWithCounts });
  } catch (error: any) {
    console.error("Error fetching favorite packs:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch favorite packs" },
      { status: 500 }
    );
  }
}














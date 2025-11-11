import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { curatorPacks, users, curatorPackUsers, packFavorites } from "@/lib/schema";
import { eq, and, or, ilike, desc, sql, inArray, ne } from "drizzle-orm";
import { upsertUser, upsertBulkUsers } from "@/lib/users";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const creatorFid = searchParams.get("creatorFid") ? parseInt(searchParams.get("creatorFid")!) : undefined;
    const isPublic = searchParams.get("public") === "true" ? true : searchParams.get("public") === "false" ? false : undefined;
    const search = searchParams.get("search") || undefined;
    const viewerFid = searchParams.get("viewerFid") ? parseInt(searchParams.get("viewerFid")!) : undefined;
    const excludeCreatorFid = searchParams.get("excludeCreatorFid") ? parseInt(searchParams.get("excludeCreatorFid")!) : undefined;

    // Build query conditions
    const conditions = [];
    
    if (creatorFid) {
      // If creatorFid is specified, only show packs created by that user
      conditions.push(eq(curatorPacks.creatorFid, creatorFid));
    } else {
      // Only apply public/viewer logic if creatorFid is not specified
      if (isPublic !== undefined) {
        conditions.push(eq(curatorPacks.isPublic, isPublic));
      } else if (!viewerFid) {
        // If no viewer, only show public packs
        conditions.push(eq(curatorPacks.isPublic, true));
      } else {
        // If viewer exists, show public packs OR packs created by viewer
        conditions.push(
          or(
            eq(curatorPacks.isPublic, true),
            eq(curatorPacks.creatorFid, viewerFid)
          )!
        );
      }
    }

    if (search) {
      conditions.push(
        or(
          ilike(curatorPacks.name, `%${search}%`),
          ilike(curatorPacks.description, `%${search}%`)
        )!
      );
    }

    // Exclude packs created by a specific user if excludeCreatorFid is provided
    if (excludeCreatorFid && !creatorFid) {
      conditions.push(ne(curatorPacks.creatorFid, excludeCreatorFid));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

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
      .where(whereClause)
      .orderBy(desc(curatorPacks.createdAt));

    // Count users per pack efficiently
    const packIds = packs.map((p) => p.id);
    const userCountMap = new Map<string, number>();
    
    if (packIds.length > 0) {
      // Get counts for all packs in one query
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

    // Get favorite status for viewer if provided
    const favoriteMap = new Map<string, boolean>();
    if (viewerFid && packIds.length > 0) {
      const favorites = await db
        .select({
          packId: packFavorites.packId,
        })
        .from(packFavorites)
        .where(
          and(
            eq(packFavorites.userFid, viewerFid),
            inArray(packFavorites.packId, packIds)
          )
        );
      
      favorites.forEach((f) => {
        favoriteMap.set(f.packId, true);
      });
    }

    const packsWithCounts = packs.map((pack) => ({
      ...pack,
      userCount: userCountMap.get(pack.id) || 0,
      isFavorited: viewerFid ? favoriteMap.get(pack.id) || false : false,
    }));

    return NextResponse.json({ packs: packsWithCounts });
  } catch (error: any) {
    console.error("Error fetching curator packs:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch curator packs" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, fids, isPublic, creatorFid, userData } = body;

    if (!name || !creatorFid) {
      return NextResponse.json(
        { error: "name and creatorFid are required" },
        { status: 400 }
      );
    }

    if (!Array.isArray(fids) || fids.length === 0) {
      return NextResponse.json(
        { error: "fids must be a non-empty array" },
        { status: 400 }
      );
    }

    // Convert userData object to Map if provided
    const userDataMap = new Map<number, { username?: string; displayName?: string; pfpUrl?: string }>();
    // Add all FIDs to the map (with empty data if not provided)
    for (const fid of fids) {
      const fidKey = typeof fid === "number" ? fid : parseInt(String(fid));
      const data = userData?.[fidKey];
      userDataMap.set(fidKey, data ? {
        username: data.username,
        displayName: data.displayName || data.display_name,
        pfpUrl: data.pfpUrl || data.pfp_url,
      } : {});
    }

    // Add creator to userDataMap if not already present
    if (!userDataMap.has(creatorFid)) {
      userDataMap.set(creatorFid, {});
    }

    // Batch upsert all users (including creator)
    await upsertBulkUsers(userDataMap);

    // Create pack
    const [pack] = await db
      .insert(curatorPacks)
      .values({
        name,
        description: description || null,
        creatorFid,
        isPublic: isPublic !== undefined ? isPublic : true,
      })
      .returning();

    // Add all users to the pack
    for (const fid of fids) {
      // Check if already exists before inserting
      const existing = await db
        .select()
        .from(curatorPackUsers)
        .where(and(
          eq(curatorPackUsers.packId, pack.id),
          eq(curatorPackUsers.userFid, fid)
        ))
        .limit(1);
      
      if (existing.length === 0) {
        await db.insert(curatorPackUsers).values({
          packId: pack.id,
          userFid: fid,
        });
      }
    }

    // Fetch pack with creator info
    const [packWithCreator] = await db
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
      .where(eq(curatorPacks.id, pack.id))
      .limit(1);

    return NextResponse.json({ pack: packWithCreator }, { status: 201 });
  } catch (error: any) {
    console.error("Error creating curator pack:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create curator pack" },
      { status: 500 }
    );
  }
}


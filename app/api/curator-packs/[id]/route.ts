import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { curatorPacks, users, curatorPackUsers } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { upsertUser, upsertBulkUsers } from "@/lib/users";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: packId } = await params;

    // Fetch pack with creator info
    const [pack] = await db
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
      .where(eq(curatorPacks.id, packId))
      .limit(1);

    if (!pack) {
      return NextResponse.json(
        { error: "Pack not found" },
        { status: 404 }
      );
    }

    // Fetch users in the pack
    const packUsers = await db
      .select({
        fid: users.fid,
        username: users.username,
        displayName: users.displayName,
        pfpUrl: users.pfpUrl,
        addedAt: curatorPackUsers.addedAt,
      })
      .from(curatorPackUsers)
      .innerJoin(users, eq(curatorPackUsers.userFid, users.fid))
      .where(eq(curatorPackUsers.packId, packId));

    return NextResponse.json({
      ...pack,
      users: packUsers,
      userCount: packUsers.length,
    });
  } catch (error: any) {
    console.error("Error fetching curator pack:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch curator pack" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: packId } = await params;
    const body = await request.json();
    const { name, description, fids, isPublic, creatorFid, userData } = body;

    // Verify pack exists and creator matches
    const [existingPack] = await db
      .select()
      .from(curatorPacks)
      .where(eq(curatorPacks.id, packId))
      .limit(1);

    if (!existingPack) {
      return NextResponse.json(
        { error: "Pack not found" },
        { status: 404 }
      );
    }

    if (existingPack.creatorFid !== creatorFid) {
      return NextResponse.json(
        { error: "Only the creator can update this pack" },
        { status: 403 }
      );
    }

    // Update pack metadata
    const updateData: any = {
      updatedAt: new Date(),
    };
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (isPublic !== undefined) updateData.isPublic = isPublic;

    await db
      .update(curatorPacks)
      .set(updateData)
      .where(eq(curatorPacks.id, packId));

    // Update users if fids provided
    if (Array.isArray(fids)) {
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

      // Batch upsert all users
      await upsertBulkUsers(userDataMap);

      // Delete existing users
      await db
        .delete(curatorPackUsers)
        .where(eq(curatorPackUsers.packId, packId));

      // Add new users
      for (const fid of fids) {
        await db.insert(curatorPackUsers).values({
          packId,
          userFid: fid,
        });
      }
    }

    // Fetch updated pack
    const [updatedPack] = await db
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
      .where(eq(curatorPacks.id, packId))
      .limit(1);

    return NextResponse.json({ pack: updatedPack });
  } catch (error: any) {
    console.error("Error updating curator pack:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update curator pack" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: packId } = await params;
    const searchParams = request.nextUrl.searchParams;
    const creatorFid = searchParams.get("creatorFid") ? parseInt(searchParams.get("creatorFid")!) : undefined;

    if (!creatorFid) {
      return NextResponse.json(
        { error: "creatorFid is required" },
        { status: 400 }
      );
    }

    // Verify pack exists and creator matches
    const [existingPack] = await db
      .select()
      .from(curatorPacks)
      .where(eq(curatorPacks.id, packId))
      .limit(1);

    if (!existingPack) {
      return NextResponse.json(
        { error: "Pack not found" },
        { status: 404 }
      );
    }

    if (existingPack.creatorFid !== creatorFid) {
      return NextResponse.json(
        { error: "Only the creator can delete this pack" },
        { status: 403 }
      );
    }

    // Delete pack (cascade will handle related records)
    await db.delete(curatorPacks).where(eq(curatorPacks.id, packId));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting curator pack:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete curator pack" },
      { status: 500 }
    );
  }
}


import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { collections, collectionCasts, users } from "@/lib/schema";
import { eq, and, inArray } from "drizzle-orm";
import { isAdmin, getUserRoles } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;
    const body = await request.json();
    const { adminFid, castHashes } = body;

    if (!adminFid) {
      return NextResponse.json({ error: "adminFid is required" }, { status: 400 });
    }

    if (!Array.isArray(castHashes) || castHashes.length === 0) {
      return NextResponse.json({ error: "castHashes must be a non-empty array" }, { status: 400 });
    }

    const adminFidNum = parseInt(adminFid);
    if (isNaN(adminFidNum)) {
      return NextResponse.json({ error: "Invalid adminFid" }, { status: 400 });
    }

    const adminUser = await db.select().from(users).where(eq(users.fid, adminFidNum)).limit(1);
    if (adminUser.length === 0) {
      return NextResponse.json({ error: "Admin user not found" }, { status: 404 });
    }
    const roles = await getUserRoles(adminFidNum);
    if (!isAdmin(roles)) {
      return NextResponse.json({ error: "User does not have admin or superadmin role" }, { status: 403 });
    }

    const collection = await db.select().from(collections).where(eq(collections.name, name)).limit(1);
    if (collection.length === 0) {
      return NextResponse.json({ error: "Collection not found" }, { status: 404 });
    }

    const collectionData = collection[0];

    // Verify all cast hashes belong to this collection
    const existingCasts = await db
      .select()
      .from(collectionCasts)
      .where(
        and(
          eq(collectionCasts.collectionId, collectionData.id),
          inArray(collectionCasts.castHash, castHashes)
        )
      );

    if (existingCasts.length !== castHashes.length) {
      return NextResponse.json({ error: "Some cast hashes do not belong to this collection" }, { status: 400 });
    }

    // Update order for each cast
    for (let i = 0; i < castHashes.length; i++) {
      const castHash = castHashes[i];
      await db
        .update(collectionCasts)
        .set({ order: i + 1 })
        .where(
          and(
            eq(collectionCasts.collectionId, collectionData.id),
            eq(collectionCasts.castHash, castHash)
          )
        );
    }

    return NextResponse.json({ success: true, message: "Casts reordered successfully" });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error("Collection reorder API error:", err.message || error);
    return NextResponse.json({ error: err.message || "Failed to reorder casts" }, { status: 500 });
  }
}


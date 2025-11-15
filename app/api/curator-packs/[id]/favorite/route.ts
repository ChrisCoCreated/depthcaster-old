import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { packFavorites } from "@/lib/schema";
import { eq, and } from "drizzle-orm";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: packId } = await params;
    const body = await request.json();
    const { userFid } = body;

    if (!userFid) {
      return NextResponse.json(
        { error: "userFid is required" },
        { status: 400 }
      );
    }

    // Check if already favorited
    const existing = await db
      .select()
      .from(packFavorites)
      .where(
        and(
          eq(packFavorites.packId, packId),
          eq(packFavorites.userFid, userFid)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json({ favorited: true });
    }

    // Add favorite
    await db.insert(packFavorites).values({
      packId,
      userFid,
    });

    return NextResponse.json({ favorited: true });
  } catch (error: any) {
    console.error("Error favoriting pack:", error);
    return NextResponse.json(
      { error: error.message || "Failed to favorite pack" },
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
    const userFid = searchParams.get("userFid") ? parseInt(searchParams.get("userFid")!) : undefined;

    if (!userFid) {
      return NextResponse.json(
        { error: "userFid is required" },
        { status: 400 }
      );
    }

    // Remove favorite
    await db
      .delete(packFavorites)
      .where(
        and(
          eq(packFavorites.packId, packId),
          eq(packFavorites.userFid, userFid)
        )
      );

    return NextResponse.json({ favorited: false });
  } catch (error: any) {
    console.error("Error unfavoriting pack:", error);
    return NextResponse.json(
      { error: error.message || "Failed to unfavorite pack" },
      { status: 500 }
    );
  }
}








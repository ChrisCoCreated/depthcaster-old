import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { castViews } from "@/lib/schema";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { castHash, authorFid, feedType, userFid } = body;

    if (!castHash || !authorFid) {
      return NextResponse.json(
        { error: "castHash and authorFid are required" },
        { status: 400 }
      );
    }

    // Insert cast view (non-blocking, don't fail if it errors)
    // Unique constraint prevents duplicates per user/feed
    try {
      await db.insert(castViews).values({
        castHash,
        authorFid: Number(authorFid),
        feedType: feedType || null,
        userFid: userFid ? Number(userFid) : null,
      } as any).onConflictDoNothing();
    } catch (error) {
      // Log but don't fail - analytics shouldn't break the app
      console.error("Failed to track cast view:", error);
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error("Cast view tracking error:", err.message || err);
    // Always return success to not break user experience
    return NextResponse.json({ success: false, error: err.message || "Failed to track cast view" });
  }
}


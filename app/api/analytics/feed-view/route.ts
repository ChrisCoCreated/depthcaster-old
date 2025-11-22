import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { feedViewSessions } from "@/lib/schema";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { feedType, durationSeconds, userFid, sortBy, curatorFids, packIds } = body;

    if (!feedType || typeof durationSeconds !== "number") {
      return NextResponse.json(
        { error: "feedType and durationSeconds are required" },
        { status: 400 }
      );
    }

    // Insert feed view session (non-blocking, don't fail if it errors)
    try {
      await db.insert(feedViewSessions).values({
        feedType,
        durationSeconds,
        userFid: userFid ? Number(userFid) : null,
        sortBy: sortBy || null,
        curatorFids: curatorFids && curatorFids.length > 0 ? curatorFids : null,
        packIds: packIds && packIds.length > 0 ? packIds : null,
      } as any);
    } catch (error) {
      // Log but don't fail - analytics shouldn't break the app
      console.error("Failed to track feed view session:", error);
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error("Feed view tracking error:", err.message || err);
    // Always return success to not break user experience
    return NextResponse.json({ success: false, error: err.message || "Failed to track feed view" });
  }
}


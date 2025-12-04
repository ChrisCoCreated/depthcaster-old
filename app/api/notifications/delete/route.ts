import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { userNotifications } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { cacheNotificationCount } from "@/lib/cache";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, fid } = body;

    if (!id) {
      return NextResponse.json(
        { error: "id is required" },
        { status: 400 }
      );
    }

    if (!fid) {
      return NextResponse.json(
        { error: "fid is required" },
        { status: 400 }
      );
    }

    const userFid = parseInt(fid);
    if (isNaN(userFid)) {
      return NextResponse.json(
        { error: "Invalid fid" },
        { status: 400 }
      );
    }

    // First verify ownership - check if notification exists and belongs to user
    const notification = await db
      .select()
      .from(userNotifications)
      .where(eq(userNotifications.id, id))
      .limit(1);

    if (!notification[0]) {
      return NextResponse.json(
        { error: "Notification not found" },
        { status: 404 }
      );
    }

    if (notification[0].userFid !== userFid) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    // Delete by UUID
    await db
      .delete(userNotifications)
      .where(eq(userNotifications.id, id));

    // Invalidate count cache for the user
    cacheNotificationCount.invalidateUser(userFid);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Delete notification API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete notification" },
      { status: 500 }
    );
  }
}





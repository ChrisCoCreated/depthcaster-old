import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { feedViewSessions } from "@/lib/schema";
import { eq, and, isNull } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      feedType, 
      durationSeconds, 
      userFid, 
      sortBy, 
      curatorFids, 
      packIds, 
      sessionStartTime,
      isUpdate 
    } = body;

    if (!feedType || typeof durationSeconds !== "number") {
      return NextResponse.json(
        { error: "feedType and durationSeconds are required" },
        { status: 400 }
      );
    }

    // Convert sessionStartTime to Date if provided
    const sessionStartTimeDate = sessionStartTime 
      ? new Date(sessionStartTime) 
      : new Date(); // Use current time if not provided (for new sessions)

    // Insert or update feed view session (non-blocking, don't fail if it errors)
    try {
      if (isUpdate && sessionStartTime) {
        // Update existing active session
        const userFidValue = userFid ? Number(userFid) : null;
        await db
          .update(feedViewSessions)
          .set({
            durationSeconds,
            sortBy: sortBy || null,
            curatorFids: curatorFids && curatorFids.length > 0 ? curatorFids : null,
            packIds: packIds && packIds.length > 0 ? packIds : null,
          })
          .where(
            and(
              userFidValue !== null 
                ? eq(feedViewSessions.userFid, userFidValue)
                : isNull(feedViewSessions.userFid),
              eq(feedViewSessions.feedType, feedType),
              eq(feedViewSessions.sessionStartTime, sessionStartTimeDate)
            )
          );
        // Note: If session doesn't exist, update will silently do nothing
        // The next periodic update or new session creation will handle it
      } else {
        // Create new session
        await db.insert(feedViewSessions).values({
          feedType,
          durationSeconds,
          userFid: userFid ? Number(userFid) : null,
          sortBy: sortBy || null,
          curatorFids: curatorFids && curatorFids.length > 0 ? curatorFids : null,
          packIds: packIds && packIds.length > 0 ? packIds : null,
          sessionStartTime: sessionStartTimeDate,
        } as any);
      }
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


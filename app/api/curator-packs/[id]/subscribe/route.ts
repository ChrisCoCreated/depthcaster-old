import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { curatorPacks, userPackSubscriptions } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { upsertUser } from "@/lib/users";
import { recordActivityEvent } from "@/lib/activityTracking";

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

    // Verify pack exists
    const [pack] = await db
      .select()
      .from(curatorPacks)
      .where(eq(curatorPacks.id, packId))
      .limit(1);

    if (!pack) {
      return NextResponse.json(
        { error: "Pack not found" },
        { status: 404 }
      );
    }

    // Upsert user
    await upsertUser(userFid);

    // Create subscription (ignore if already exists)
    let isNewSubscription = false;
    try {
      await db.insert(userPackSubscriptions).values({
        userFid,
        packId,
      });
      isNewSubscription = true;
    } catch (error: any) {
      // Ignore unique constraint violations (already subscribed)
      if (!error.message?.includes("unique") && !error.message?.includes("duplicate")) {
        throw error;
      }
    }

    // Record activity event for follow_add (only if new subscription)
    if (isNewSubscription) {
      try {
        await recordActivityEvent(userFid, "follow_add", {
          pack_id: packId,
        });
      } catch (error) {
        // Log but don't fail - activity tracking shouldn't break subscription
        console.error("Failed to record follow_add activity:", error);
      }
    }

    // Increment usage count
    await db
      .update(curatorPacks)
      .set({
        usageCount: pack.usageCount + 1,
      })
      .where(eq(curatorPacks.id, packId));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error subscribing to pack:", error);
    return NextResponse.json(
      { error: error.message || "Failed to subscribe to pack" },
      { status: 500 }
    );
  }
}


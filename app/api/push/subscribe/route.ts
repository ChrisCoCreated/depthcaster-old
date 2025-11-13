import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { pushSubscriptions } from "@/lib/schema";
import { eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userFid, subscription, userAgent } = body;

    if (!userFid || !subscription || !subscription.endpoint || !subscription.keys) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const { endpoint, keys } = subscription;

    // Check if subscription already exists
    const existing = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint))
      .limit(1);

    if (existing.length > 0) {
      // Update existing subscription
      await db
        .update(pushSubscriptions)
        .set({
          userFid,
          p256dh: keys.p256dh,
          auth: keys.auth,
          userAgent: userAgent || null,
          updatedAt: new Date(),
        })
        .where(eq(pushSubscriptions.endpoint, endpoint));

      return NextResponse.json({ success: true, message: "Subscription updated" });
    } else {
      // Create new subscription
      await db.insert(pushSubscriptions).values({
        userFid,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: userAgent || null,
      });

      return NextResponse.json({ success: true, message: "Subscription created" });
    }
  } catch (error: any) {
    console.error("Error saving push subscription:", error);
    return NextResponse.json(
      { error: error.message || "Failed to save subscription" },
      { status: 500 }
    );
  }
}




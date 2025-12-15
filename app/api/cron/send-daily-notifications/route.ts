import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { miniappNotificationQueue, users, miniappInstallations } from "@/lib/schema";
import { eq, and, lte, isNull, inArray } from "drizzle-orm";
import {
  sendBatchedMiniappNotification,
  getQueuedNotificationsForUser,
  markQueuedNotificationsAsSent,
  getUserNotificationFrequency,
} from "@/lib/miniapp";

export const dynamic = "force-dynamic";

/**
 * Verify that the request is from Vercel Cron
 */
function verifyCronRequest(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (authHeader && cronSecret) {
    const token = authHeader.replace("Bearer ", "");
    return token === cronSecret;
  }

  if (!cronSecret) {
    console.warn("[Daily Notifications Cron] CRON_SECRET not set - allowing request (development mode)");
    return true;
  }

  return false;
}

export async function GET(request: NextRequest) {
  try {
    if (!verifyCronRequest(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("[Daily Notifications Cron] Starting daily notification batch job");

    const now = new Date();

    // Get all users with miniapp installed and daily notification frequency
    const installedUsers = await db
      .select({ userFid: miniappInstallations.userFid })
      .from(miniappInstallations);

    if (installedUsers.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No users with miniapp installed",
        notificationsSent: 0,
        usersProcessed: 0,
      });
    }

    const installedFids = installedUsers.map((u) => u.userFid);

    // Get users with daily notification frequency
    const usersWithDailyFrequency: number[] = [];
    for (const fid of installedFids) {
      const frequency = await getUserNotificationFrequency(fid);
      if (frequency === "daily") {
        usersWithDailyFrequency.push(fid);
      }
    }

    if (usersWithDailyFrequency.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No users with daily notification frequency",
        notificationsSent: 0,
        usersProcessed: 0,
      });
    }

    console.log(`[Daily Notifications Cron] Found ${usersWithDailyFrequency.length} users with daily frequency`);

    let notificationsSent = 0;
    let usersProcessed = 0;
    let errors = 0;

    // Process each user
    for (const userFid of usersWithDailyFrequency) {
      try {
        // Get queued notifications for this user
        const queued = await getQueuedNotificationsForUser(userFid, "daily");

        if (queued.length === 0) {
          continue;
        }

        // Prepare notification data
        const notificationData = queued.map((q) => ({
          castHash: q.castHash,
          castData: q.castData,
        }));

        // Send batched notification
        const sent = await sendBatchedMiniappNotification(userFid, notificationData, "daily");

        if (sent) {
          // Mark notifications as sent
          const notificationIds = queued.map((q) => q.id);
          await markQueuedNotificationsAsSent(notificationIds);
          notificationsSent += queued.length;
          usersProcessed++;
          console.log(`[Daily Notifications Cron] Sent batched notification to user ${userFid} (${queued.length} casts)`);
        } else {
          errors++;
          console.error(`[Daily Notifications Cron] Failed to send notification to user ${userFid}`);
        }
      } catch (error: any) {
        errors++;
        console.error(`[Daily Notifications Cron] Error processing user ${userFid}:`, error);
      }
    }

    console.log(`[Daily Notifications Cron] Completed: ${notificationsSent} notifications sent to ${usersProcessed} users, ${errors} errors`);

    return NextResponse.json({
      success: true,
      notificationsSent,
      usersProcessed,
      errors,
    });
  } catch (error: any) {
    console.error("[Daily Notifications Cron] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to send daily notifications" },
      { status: 500 }
    );
  }
}




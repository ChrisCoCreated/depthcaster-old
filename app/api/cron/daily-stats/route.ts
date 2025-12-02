import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { inArray } from "drizzle-orm";
import { get24HourStats } from "@/lib/statistics";
import { sendAppUpdateNotificationToUsers } from "@/lib/notifications";
import { getAllCuratorFids } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Verify that the request is from Vercel Cron
 * In production, Vercel sets the Authorization header with a bearer token
 * For local testing, we can use an environment variable
 */
function verifyCronRequest(request: NextRequest): boolean {
  // Check for Vercel cron authorization header
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (authHeader && cronSecret) {
    const token = authHeader.replace("Bearer ", "");
    return token === cronSecret;
  }

  // For local development, allow if CRON_SECRET is not set (less secure)
  // In production, this should always be set
  if (!cronSecret) {
    console.warn("[Cron] CRON_SECRET not set - allowing request (development mode)");
    return true;
  }

  return false;
}

export async function GET(request: NextRequest) {
  try {
    // Verify this is a valid cron request
    if (!verifyCronRequest(request)) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    console.log("[Daily Stats Cron] Starting daily stats notification job");

    // Get 24h stats
    const stats = await get24HourStats();
    console.log("[Daily Stats Cron] Stats:", stats);

    // Get all curator FIDs
    const curatorFids = await getAllCuratorFids();
    console.log(`[Daily Stats Cron] Found ${curatorFids.length} curators`);

    if (curatorFids.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No curators found",
        stats,
      });
    }

    // Get preferences for curators
    const curatorUsers = await db
      .select({ fid: users.fid, preferences: users.preferences })
      .from(users)
      .where(inArray(users.fid, curatorFids));

    // Filter curators who want daily stats (default: true, so undefined/null = true)
    const usersToNotify: number[] = [];
    for (const user of curatorUsers) {
      const preferences = (user.preferences || {}) as { notifyOnDailyStats?: boolean };
      // Default to true if undefined/null, only exclude if explicitly false
      if (preferences.notifyOnDailyStats !== false) {
        usersToNotify.push(user.fid);
      }
    }

    console.log(`[Daily Stats Cron] Found ${usersToNotify.length} users to notify`);

    if (usersToNotify.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No users to notify",
        stats,
      });
    }

    // Format notification message
    const date = new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });

    const qualityText = stats.avgQualityScore !== null
      ? `avg quality: ${stats.avgQualityScore}`
      : "quality: N/A";

    const title = `Daily Stats - ${date}`;
    const body = `📊 Past 24h: ${stats.castsCurated} casts curated (${qualityText}), ${stats.replies} replies, ${stats.likes} likes, ${stats.recasts} recasts`;
    const url = "/admin/statistics?period=24h";

    // Send notifications
    const result = await sendAppUpdateNotificationToUsers(
      usersToNotify,
      title,
      body,
      url,
      0 // adminFid = 0 for system notifications
    );

    console.log(`[Daily Stats Cron] Sent ${result.pushNotificationsSent} push notifications, created ${result.notificationsCreated} notifications`);

    return NextResponse.json({
      success: true,
      stats,
      notificationsCreated: result.notificationsCreated,
      pushNotificationsSent: result.pushNotificationsSent,
      errors: result.errors,
      usersNotified: usersToNotify.length,
    });
  } catch (error: any) {
    console.error("[Daily Stats Cron] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to send daily stats notifications" },
      { status: 500 }
    );
  }
}

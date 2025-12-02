import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { inArray } from "drizzle-orm";
import { getWeeklyContributorsStats } from "@/lib/statistics";
import { sendAppUpdateNotificationToUsers } from "@/lib/notifications";
import { getAllCuratorFids } from "@/lib/roles";
import { getUser } from "@/lib/users";
import { neynarClient } from "@/lib/neynar";

export const runtime = "nodejs";
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
    console.warn("[Cron] CRON_SECRET not set - allowing request (development mode)");
    return true;
  }

  return false;
}

/**
 * Format curator name for notification
 */
function formatCuratorName(contributor: { username?: string; displayName?: string; curatorFid: number }): string {
  if (contributor.displayName) {
    return contributor.displayName;
  }
  if (contributor.username) {
    return `@${contributor.username}`;
  }
  return `@user${contributor.curatorFid}`;
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

    console.log("[Weekly Contributors Cron] Starting weekly contributors notification job");

    // Get weekly contributors stats
    const stats = await getWeeklyContributorsStats();
    const allContributors = [...stats.topContributors, ...stats.allContributors];

    if (allContributors.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No contributors this week",
        contributors: [],
      });
    }

    // Enrich contributors with user info
    const enrichedContributors = [];
    for (const contributor of allContributors) {
      try {
        const dbUser = await getUser(contributor.curatorFid);
        if (dbUser) {
          enrichedContributors.push({
            ...contributor,
            username: dbUser.username || undefined,
            displayName: dbUser.displayName || undefined,
          });
        } else {
          try {
            const neynarUsers = await neynarClient.fetchBulkUsers({ fids: [contributor.curatorFid] });
            const neynarUser = neynarUsers.users?.[0];
            if (neynarUser) {
              enrichedContributors.push({
                ...contributor,
                username: neynarUser.username,
                displayName: neynarUser.display_name || undefined,
              });
            } else {
              enrichedContributors.push(contributor);
            }
          } catch (error) {
            console.error(`Failed to fetch curator ${contributor.curatorFid} from Neynar:`, error);
            enrichedContributors.push(contributor);
          }
        }
      } catch (error) {
        console.error(`Failed to enrich contributor ${contributor.curatorFid}:`, error);
        enrichedContributors.push(contributor);
      }
    }

    // Get all curator FIDs
    const curatorFids = await getAllCuratorFids();
    console.log(`[Weekly Contributors Cron] Found ${curatorFids.length} curators`);

    if (curatorFids.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No curators found",
        contributors: enrichedContributors,
      });
    }

    // Get preferences for curators
    const curatorUsers = await db
      .select({ fid: users.fid, preferences: users.preferences })
      .from(users)
      .where(inArray(users.fid, curatorFids));

    // Filter curators who want notifications (default: true, so undefined/null = true)
    const usersToNotify: number[] = [];
    for (const user of curatorUsers) {
      const preferences = (user.preferences || {}) as { notifyOnDailyStats?: boolean };
      if (preferences.notifyOnDailyStats !== false) {
        usersToNotify.push(user.fid);
      }
    }

    console.log(`[Weekly Contributors Cron] Found ${usersToNotify.length} users to notify`);

    if (usersToNotify.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No users to notify",
        contributors: enrichedContributors,
      });
    }

    // Format notification message
    const date = new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });

    // Separate top contributors (>7) from others, and sort both by curation count (descending)
    const topContributors = enrichedContributors
      .filter((c) => c.curationCount > 7)
      .sort((a, b) => b.curationCount - a.curationCount);
    const otherContributors = enrichedContributors
      .filter((c) => c.curationCount <= 7)
      .sort((a, b) => b.curationCount - a.curationCount);

    let body: string;
    if (enrichedContributors.length === 0) {
      body = "No contributors this week yet.";
    } else {
      const topNames = topContributors.map((c) => formatCuratorName(c));
      const otherNames = otherContributors.map((c) => formatCuratorName(c));

      if (topNames.length > 0 && otherNames.length > 0) {
        body = `Weekly Contributors: ${topNames.join(" & ")} - plus ${otherNames.join(", ")}`;
      } else if (topNames.length > 0) {
        body = `Weekly Contributors: ${topNames.join(" & ")}`;
      } else {
        body = `Weekly Contributors: ${otherNames.join(", ")}`;
      }
    }

    const title = `Weekly Contributors - ${date}`;
    const url = "/contributors";

    // Send notifications
    const result = await sendAppUpdateNotificationToUsers(
      usersToNotify,
      title,
      body,
      url,
      0 // adminFid = 0 for system notifications
    );

    console.log(`[Weekly Contributors Cron] Sent ${result.pushNotificationsSent} push notifications, created ${result.notificationsCreated} notifications`);

    return NextResponse.json({
      success: true,
      contributors: enrichedContributors,
      notificationsCreated: result.notificationsCreated,
      pushNotificationsSent: result.pushNotificationsSent,
      errors: result.errors,
      usersNotified: usersToNotify.length,
    });
  } catch (error: any) {
    console.error("[Weekly Contributors Cron] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to send weekly contributors notifications" },
      { status: 500 }
    );
  }
}



import { NextRequest, NextResponse } from "next/server";
import { isAdmin, getUserRoles, getAllAdminFids } from "@/lib/roles";
import { getWeeklyContributorsStats } from "@/lib/statistics";
import { sendAppUpdateNotificationToUsers } from "@/lib/notifications";
import { getUser } from "@/lib/users";
import { neynarClient } from "@/lib/neynar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fid } = body;

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

    // Check admin/superadmin access
    const roles = await getUserRoles(userFid);
    if (!isAdmin(roles)) {
      return NextResponse.json(
        { error: "Unauthorized: Admin or superadmin role required" },
        { status: 403 }
      );
    }

    // Get all admin and superadmin FIDs
    const adminFids = await getAllAdminFids();

    if (adminFids.length === 0) {
      return NextResponse.json(
        { error: "No admins or superadmins found" },
        { status: 404 }
      );
    }

    // Get weekly contributors stats
    const stats = await getWeeklyContributorsStats();
    const allContributors = [...stats.topContributors, ...stats.allContributors];

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

    // Format test notification message
    const date = new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });

    let messageBody: string;
    if (enrichedContributors.length === 0) {
      messageBody = "No contributors this week yet.";
    } else if (enrichedContributors.length <= 10) {
      // List all curators
      const curatorNames = enrichedContributors.map((c) => 
        `${formatCuratorName(c)} (${c.curationCount} ${c.curationCount === 1 ? 'cast' : 'casts'})`
      );
      messageBody = `Weekly Contributors: ${curatorNames.join(", ")}`;
    } else {
      // List top 10 + count of remaining
      const top10 = enrichedContributors.slice(0, 10);
      const remaining = enrichedContributors.length - 10;
      const curatorNames = top10.map((c) => 
        `${formatCuratorName(c)} (${c.curationCount} ${c.curationCount === 1 ? 'cast' : 'casts'})`
      );
      messageBody = `Weekly Contributors: ${curatorNames.join(", ")}, and ${remaining} more curator${remaining === 1 ? '' : 's'}`;
    }

    const title = `[TEST] Weekly Contributors - ${date}`;
    const url = "/contributors";

    // Send test notifications to all admins/superadmins
    const result = await sendAppUpdateNotificationToUsers(
      adminFids,
      title,
      messageBody,
      url,
      userFid
    );

    return NextResponse.json({
      success: true,
      contributors: enrichedContributors,
      notificationsCreated: result.notificationsCreated,
      pushNotificationsSent: result.pushNotificationsSent,
      errors: result.errors,
      usersNotified: adminFids.length,
    });
  } catch (error: any) {
    console.error("Error sending test notification:", error);
    return NextResponse.json(
      { error: error.message || "Failed to send test notification" },
      { status: 500 }
    );
  }
}
